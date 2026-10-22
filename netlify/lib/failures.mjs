import { record, reportFailure } from "./health.mjs";
import { sendMail } from "./mail.mjs";
import { SITE } from "./siteLinks.mjs";
import { mintReadingLink } from "./reading.mjs";
import { retryLink } from "./retryCode.mjs";
import { MESSAGES, customerHeading, customerText } from "../../shared/customerMessages.mjs";

/**
 * EVERY WAY A CUSTOMER PATH CAN FAIL, NAMED ONCE.
 *
 * Jeremy, 10/16: "errors on our side should not look like errors to the
 * customer ... make sure error reporting is granular enough so we know what to
 * present to the customer and what is internal only."
 *
 * So each failure has three faces, and they are kept apart on purpose:
 *
 *   kind       granular and internal -- `engine-timeout`, `gemini-503`. What
 *              Jeremy reads in an alert or the weekly digest. Never shown to a
 *              customer, never carries personal data.
 *
 *   severity   who needs to know:
 *                internal-only    counted in the digest, nobody is emailed
 *                needs-follow-up  in the digest's follow-up list
 *                page-jeremy      emailed the moment it happens (first of a
 *                                 kind per hour; health.mjs holds the rest)
 *              A kind can be raised when money has already been taken
 *              (`paid`): the free summary's engine blip is noise, a paying
 *              buyer's is not.
 *
 *   customer   the KEY of the words they see (shared/customerMessages.mjs),
 *              or null when the failure is invisible to them (an email that
 *              did not go while they look at their reading).
 *
 * `code` is the public, stable code the page already switches on
 * (`link_expired`, `chart_differs` ...). Kept as it was wherever one existed.
 */

export const SEVERITY = Object.freeze({
  INTERNAL: "internal-only",
  FOLLOW_UP: "needs-follow-up",
  PAGE: "page-jeremy",
});
const I = SEVERITY.INTERNAL;
const F = SEVERITY.FOLLOW_UP;
const P = SEVERITY.PAGE;

/**
 * kind -> { severity, paid?, customer, status, code }
 *
 * `paid` is the severity when the request carried a paid link. `status` is
 * the HTTP status the customer's request is answered with.
 */
export const KINDS = {
  // --- checkout (nothing charged yet) ---------------------------------------
  "checkout-misconfigured": { severity: P, customer: "checkout-unavailable", status: 503, code: "misconfigured" },
  "checkout-stripe-failed": { severity: F, customer: "checkout-unavailable", status: 502, code: "checkout_unavailable" },
  "checkout-bad-request": { severity: I, customer: "checkout-not-offered", status: 400, code: "bad_tier" },
  "checkout-not-sellable": { severity: I, customer: "checkout-not-yet", status: 409, code: "not_yet" },
  // The tier's Stripe product could not be had, so this sale went ahead with an
  // inline one -- and a free retry code (held to the tier's product) will not
  // reach it. The buyer sees nothing.
  "checkout-product-missing": { severity: F, customer: null, status: 200, code: null },

  // --- claim (the money has moved, or might have) ---------------------------
  "claim-misconfigured": { severity: P, customer: "claim-confirm-later", status: 503, code: "misconfigured" },
  "claim-stripe-unreachable": { severity: P, customer: "claim-confirm-later", status: 502, code: "claim_unavailable" },
  "claim-bad-session": { severity: I, customer: "claim-not-found", status: 400, code: "bad_session" },
  "claim-not-paid": { severity: I, customer: "claim-not-paid", status: 402, code: "not_paid" },
  "claim-not-recorded": { severity: P, customer: "purchase-safe-setup-pending", status: 200, code: null },
  "claim-email": { severity: P, customer: null, status: 200, code: null },
  "claim-no-address": { severity: F, customer: null, status: 200, code: null },

  // --- the birth-details form and the engine --------------------------------
  "chart-misconfigured": { severity: P, customer: "chart-slow", status: 503, code: "misconfigured" },
  "chart-bad-request": { severity: I, customer: "chart-form-unreadable", status: 400, code: "bad_request" },
  "chart-rate-limited": { severity: I, customer: "chart-too-many", status: 429, code: "rate_limited" },
  "chart-rate-store": { severity: F, customer: null, status: 200, code: null },
  // An unknown birth time: the spread (POST /v1/spread) could not be had or was refused; the chart went out with the engine's note.
  "chart-time-spread": { severity: F, customer: null, status: 200, code: null },
  "chart-payment-required": { severity: I, customer: "chart-payment-required", status: 402, code: "payment_required" },
  "engine-400-bad-date": { severity: I, customer: "chart-check-date", status: 400, code: "check_date" },
  "engine-400-bad-time": { severity: I, customer: "chart-check-time", status: 400, code: "check_time" },
  "engine-400-bad-place": { severity: I, customer: "chart-check-place", status: 400, code: "check_place" },
  "engine-400-other": { severity: F, paid: P, customer: "chart-slow", status: 503, code: "chart_unavailable" },
  "engine-401-key": { severity: P, customer: "chart-slow", status: 503, code: "chart_unavailable" },
  "engine-403-tier": { severity: P, customer: "chart-slow", status: 503, code: "chart_unavailable" },
  "engine-429-key-limit": { severity: P, customer: "chart-slow", status: 503, code: "chart_unavailable" },
  "engine-5xx": { severity: F, paid: P, customer: "chart-slow", status: 503, code: "chart_unavailable" },
  "engine-unexpected": { severity: F, paid: P, customer: "chart-slow", status: 503, code: "chart_unavailable" },
  "engine-timeout": { severity: F, paid: P, customer: "chart-slow", status: 503, code: "chart_unavailable" },
  "engine-unreachable": { severity: F, paid: P, customer: "chart-slow", status: 503, code: "chart_unavailable" },
  "chart-not-saved": { severity: P, customer: "chart-not-saved", status: 503, code: "chart_not_saved" },
  "chart-previous-lookup": { severity: I, customer: null, status: 200, code: null },
  "ready-email": { severity: F, customer: null, status: 200, code: null },
  "ready-email-no-address": { severity: F, customer: null, status: 200, code: null },

  // --- adding a birth time found later (10/22: once per chart, free) --------
  // Jeremy hears of every use (record ref + tier, never the time): the digest lists it.
  "time-added": { severity: F, customer: null, status: 200, code: null },
  "addtime-bad-request": { severity: I, customer: "our-side-generic", status: 400, code: "bad_request" },
  "addtime-misconfigured": { severity: P, customer: "our-side-generic", status: 503, code: "misconfigured" },
  "addtime-link-bad": { severity: I, customer: "reading-link-bad", status: 404, code: "not_found" },
  "addtime-store-unavailable": { severity: P, customer: "reading-unavailable", status: 503, code: "reading_unavailable" },
  "addtime-gone": { severity: I, customer: "addtime-gone", status: 410, code: "gone" },
  "addtime-used": { severity: I, customer: "addtime-used", status: 409, code: "used" },
  "addtime-known": { severity: I, customer: "addtime-known", status: 409, code: "time_known" },
  "addtime-pending": { severity: I, customer: "pdf-not-ready", status: 409, code: "not_ready" },
  "addtime-none": { severity: I, customer: "addtime-none", status: 409, code: "no_details" },
  "addtime-check-time": { severity: I, customer: "addtime-check-time", status: 400, code: "check_time" },
  // The engine did not answer an add: Jeremy is paged with the add-time brief (the engine's own
  // kind is in the detail), so "Customer saw" is what the buyer read, not the chart form's words.
  "addtime-engine": { severity: P, customer: "addtime-slow", status: 503, code: "chart_unavailable" },
  "addtime-busy": { severity: F, customer: "our-side-generic", status: 503, code: "busy" },
  "addtime-not-saved": { severity: P, customer: "addtime-not-saved", status: 503, code: "not_saved" },
  "addtime-crash": { severity: P, customer: "our-side-generic", status: 500, code: "unexpected" },

  // --- town search ----------------------------------------------------------
  "places-misconfigured": { severity: P, customer: "places-unavailable", status: 200, code: "misconfigured" },
  "places-engine-down": { severity: F, customer: "places-unavailable", status: 200, code: "places_unavailable" },
  "places-rate-limited": { severity: I, customer: "places-too-many", status: 429, code: "rate_limited" },
  "places-rate-store": { severity: I, customer: null, status: 200, code: null },

  // --- the reading page -----------------------------------------------------
  "reading-misconfigured": { severity: P, customer: "reading-unavailable", status: 503, code: "misconfigured" },
  "reading-store-unavailable": { severity: P, customer: "reading-unavailable", status: 503, code: "reading_unavailable" },
  "reading-link-expired": { severity: I, customer: "reading-link-expired", status: 410, code: "link_expired" },
  "reading-link-bad": { severity: I, customer: "reading-link-bad", status: 404, code: "not_found" },
  "reading-tier-mismatch": { severity: F, customer: "reading-link-bad", status: 404, code: "not_found" },

  // --- writing the reading (Gemini). The buyer sees "being written" and, after
  //     ten minutes, "taking longer than it should" -- never an error. --------
  "gemini-refused": { severity: I, customer: "reading-writing", status: 200, code: null },
  "gemini-refused-5x": { severity: P, customer: "reading-writing-long", status: 200, code: null },
  "gemini-503": { severity: P, customer: "reading-writing-long", status: 200, code: null },
  "gemini-429": { severity: P, customer: "reading-writing-long", status: 200, code: null },
  "gemini-http": { severity: P, customer: "reading-writing-long", status: 200, code: null },
  "gemini-timeout": { severity: P, customer: "reading-writing-long", status: 200, code: null },
  "gemini-network": { severity: P, customer: "reading-writing-long", status: 200, code: null },
  "gemini-unreadable": { severity: P, customer: "reading-writing-long", status: 200, code: null },
  "gemini-misconfigured": { severity: P, customer: "reading-writing-long", status: 200, code: null },
  "gemini-no-chart": { severity: P, customer: "reading-writing-long", status: 200, code: null },
  "gemini-unknown": { severity: P, customer: "reading-writing-long", status: 200, code: null },
  "reading-prompt": { severity: P, customer: "reading-writing-long", status: 200, code: null },
  "reading-failure-rate": { severity: P, customer: "reading-writing-long", status: 200, code: null },
  "interpret-store": { severity: F, customer: null, status: 200, code: null },
  "reading-ready-email": { severity: F, customer: null, status: 200, code: null },

  // --- the PDF download -----------------------------------------------------
  "pdf-misconfigured": { severity: P, customer: "pdf-unavailable", status: 503, code: "misconfigured" },
  "pdf-store-unavailable": { severity: P, customer: "pdf-unavailable", status: 503, code: "pdf_unavailable" },
  "pdf-build-failed": { severity: P, customer: "pdf-unavailable", status: 500, code: "pdf_failed" },
  "pdf-link-expired": { severity: I, customer: "pdf-link-expired", status: 410, code: "link_expired" },
  "pdf-link-bad": { severity: I, customer: "reading-link-bad", status: 404, code: "not_found" },
  "pdf-not-ready": { severity: I, customer: "pdf-not-ready", status: 409, code: "not_ready" },

  // --- sending the link again -----------------------------------------------
  "resend-misconfigured": { severity: P, customer: "resend-unavailable", status: 503, code: "misconfigured" },
  "resend-store-unavailable": { severity: P, customer: "resend-unavailable", status: 503, code: "resend_unavailable" },
  "resend-email-failed": { severity: F, customer: "resend-unavailable", status: 502, code: "send_failed" },
  "resend-link-bad": { severity: I, customer: "reading-link-bad", status: 404, code: "not_found" },
  "resend-too-many": { severity: I, customer: "resend-too-many", status: 429, code: "too_many" },
  "resend-no-address": { severity: F, customer: "resend-no-address", status: 409, code: "no_address" },

  // --- returning buyers and their charts (release 2) -------------------------
  // An upgrade's credit was given for a chart that, by the time the money
  // settled, had already grown this far (two upgrades paid at once). The buyer
  // has their purchase; it stands on its own.
  "upgrade-already-grown": { severity: F, customer: null, status: 200, code: null },
  // The old record could not be marked as grown: its old link keeps opening
  // the old chart, and its credit is not yet spent.
  "upgrade-link-not-saved": { severity: F, customer: null, status: 200, code: null },
  // The purchase is safe; "Email me my charts" will not list it until fixed.
  "chart-index-not-saved": { severity: F, customer: null, status: 200, code: null },

  // --- "Email me my charts" (release 2, Jeremy 10/20 "3B") -------------------
  "mycharts-misconfigured": { severity: P, customer: "mycharts-unavailable", status: 503, code: "misconfigured" },
  "mycharts-store-unavailable": { severity: P, customer: "mycharts-unavailable", status: 503, code: "mycharts_unavailable" },
  "mycharts-email-failed": { severity: F, customer: "mycharts-unavailable", status: 502, code: "send_failed" },
  "mycharts-bad-email": { severity: I, customer: "mycharts-bad-email", status: 400, code: "bad_email" },
  "mycharts-too-many": { severity: I, customer: "mycharts-too-many", status: 429, code: "too_many" },

  // --- the scheduled watchers (no customer on the line) ---------------------
  "purchase-undelivered": { severity: P, customer: null, status: 200, code: null },
  "reconcile-truncated": { severity: P, customer: null, status: 200, code: null },
  "health-store": { severity: P, customer: null, status: 200, code: null },

  // --- the net under every customer function --------------------------------
  "checkout-crash": { severity: P, customer: "checkout-unavailable", status: 500, code: "unexpected" },
  "claim-crash": { severity: P, customer: "claim-confirm-later", status: 500, code: "unexpected" },
  "chart-crash": { severity: P, customer: "our-side-generic", status: 500, code: "unexpected" },
  "places-crash": { severity: F, customer: "places-unavailable", status: 200, code: "places_unavailable" },
  "reading-crash": { severity: P, customer: "reading-unavailable", status: 500, code: "unexpected" },
  "pdf-crash": { severity: P, customer: "pdf-unavailable", status: 500, code: "unexpected" },
  "resend-crash": { severity: P, customer: "resend-unavailable", status: 500, code: "unexpected" },
  "mycharts-crash": { severity: P, customer: "mycharts-unavailable", status: 500, code: "unexpected" },
};

/** "chart-slow" is two sentences: one when nothing was charged, one when it was. */
function resolveCustomer(key, paid) {
  if (key === "chart-slow") return paid ? "chart-slow-paid" : "chart-slow-free";
  return key;
}

/** What a kind means, raised for a paid request where the registry says so. */
export function describe(kind, { paid = false } = {}) {
  const entry = KINDS[kind];
  if (!entry) {
    // An unnamed kind is a bug in this file, not a reason to go quiet.
    return { kind, severity: F, customer: "our-side-generic", status: 500, code: "unexpected" };
  }
  return {
    kind,
    severity: paid && entry.paid ? entry.paid : entry.severity,
    customer: resolveCustomer(entry.customer, paid),
    status: entry.status,
    code: entry.code,
  };
}

/**
 * The customer's answer for a failure: a status and the body the page reads.
 *
 * `message` overrides the catalogue only for the one entry whose words are
 * computed (the rate limiter names the wait). Nothing raw ever goes here.
 */
export function customerError(kind, { paid = false, message, extra, status, code } = {}) {
  const d = describe(kind, { paid });
  const key = d.customer ?? "our-side-generic";
  return {
    status: status ?? d.status,
    payload: {
      error: {
        code: code ?? d.code ?? "unexpected",
        key,
        message: message ?? customerText(key),
        ...(customerHeading(key) ? { heading: customerHeading(key) } : {}),
        ...(extra ?? {}),
      },
    },
  };
}

/**
 * RECORD A FAILURE AT ITS SEVERITY. Never throws, never rejects -- it sits on
 * paths where a buyer is waiting.
 *
 * `detail` is a REASON ("resend 401", "engine 503"), never a payload: no
 * email, name, birth moment or reading text. `excerpt` is only for a refused
 * reading draft (chart prose, no identity), as before.
 *
 * `ref` (10/16) is WHICH purchase: `{ reading, session, payment, tier }` --
 * ids only, shape-checked by health.mjs `cleanRef`, so a page can link to the
 * Stripe object and the buyer's reading without carrying who they are.
 */
export async function noteFailure(store, kind, { detail, excerpt, paid = false, ref, send, site, now = Date.now() } = {}) {
  const d = describe(kind, { paid });
  const fields = { kind, detail, excerpt, now, severity: d.severity, customer: d.customer, ref, paid };
  try {
    if (d.severity === SEVERITY.PAGE && typeof send === "function") {
      return await reportFailure(store, { ...fields, send, site });
    }
    const entry = await record(store, fields);
    return { recorded: Boolean(entry), alerted: false };
  } catch {
    return { recorded: false, alerted: false };
  }
}

/** Which engine answer this is. The engine's codes are stable (hd-engine ApiException). */
export function engineKind(status, code) {
  const c = String(code ?? "");
  if (status === 400) {
    if (/^(bad|no)_birth_date$/.test(c)) return "engine-400-bad-date";
    if (/^(bad|no)_birth_time$/.test(c) || c === "no_time_known") return "engine-400-bad-time";
    if (/^(bad|no)_birth_zone$/.test(c)) return "engine-400-bad-place";
    return "engine-400-other";
  }
  if (status === 401) return "engine-401-key";
  if (status === 403) return "engine-403-tier";
  if (status === 429) return "engine-429-key-limit";
  if (status >= 500) return "engine-5xx";
  return "engine-unexpected";
}

/** Which writer failure this is, from generateReading's `{ reason, detail }`. */
export function geminiKind(reason, detail) {
  const d = String(detail ?? "");
  switch (reason) {
    case "http":
      if (/\b503\b/.test(d)) return "gemini-503";
      if (/\b429\b/.test(d)) return "gemini-429";
      return "gemini-http";
    case "timeout":
      return "gemini-timeout";
    case "network":
      return "gemini-network";
    case "unreadable":
      return "gemini-unreadable";
    case "malformed":
      return "gemini-refused-5x";
    case "misconfigured":
      return "gemini-misconfigured";
    case "no_chart":
      return "gemini-no-chart";
    default:
      return "gemini-unknown";
  }
}

/**
 * What an alert can link to (10/16): the buyer's own reading link, minted
 * fresh from the reading id, and a one-tap retry-code link (lib/retryCode.mjs)
 * -- the second only when a Stripe key is present to make the code with.
 * Every piece is optional; a missing one is said in the alert, not guessed.
 */
export function alertContext({
  grantSecret = process.env.GRANT_SECRET,
  origin = process.env.URL,
  stripeKey = process.env.STRIPE_SECRET_KEY,
  now = () => Date.now(),
} = {}) {
  return {
    shop: origin || null,
    linkFor(ref) {
      if (!grantSecret || !origin || !ref?.reading || !Number.isInteger(ref.tier)) return null;
      return `${origin}/r/${mintReadingLink({ id: ref.reading, tier: ref.tier, now: now() }, grantSecret)}`;
    },
    retryLinkFor(entry) {
      return retryLink({ incident: entry, now: now() }, { secret: grantSecret, origin, stripeKey });
    },
  };
}

/**
 * How an incident reaches Jeremy the moment it happens. One copy, where there
 * used to be five identical ones in five functions.
 *
 * The sender carries its `context` (above), so every existing call site --
 * `send: alertSender(process.env.RESEND_API_KEY)` -- gets the links without
 * being touched.
 */
export function alertSender(apiKey, context = alertContext()) {
  if (!apiKey) return undefined;
  const send = async ({ subject, text, html }) => {
    const body =
      html ||
      '<pre style="font:14px/1.5 ui-monospace,Menlo,Consolas,monospace;white-space:pre-wrap">' +
        text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;") +
        "</pre>";
    await sendMail({ to: SITE.contact, subject, html: body, text }, { apiKey });
  };
  send.context = context;
  return send;
}

/**
 * THE NET UNDER A CUSTOMER FUNCTION.
 *
 * Anything that escapes the handler -- a store that throws where nobody
 * expected it to, a typo in a path only failures take (claim.mjs, 10/16) --
 * used to reach the buyer as Netlify's own error page, or as a body the page
 * could not parse. Now it is recorded as `<name>-crash`, Jeremy is paged, and
 * the customer gets the calm sentence for that path.
 *
 * `health` is a factory so a store that cannot even be opened is one more
 * thing caught here rather than a second crash.
 */
export function guard(name, handler, { health, page = null } = {}) {
  const kind = `${name}-crash`;
  return async (request, context) => {
    try {
      return await handler(request, context);
    } catch (e) {
      // The error's own text stays in the log; it is not a payload and it never
      // reaches the customer.
      console.log(`${name}: unexpected failure (${e?.name ?? "Error"}: ${String(e?.message ?? "").slice(0, 160)})`);
      let store = null;
      try {
        store = typeof health === "function" ? health() : null;
      } catch {
        /* no store, so log only */
      }
      await noteFailure(store, kind, {
        detail: `${e?.name ?? "Error"}: ${String(e?.message ?? "").slice(0, 120)}`,
        send: alertSender(process.env.RESEND_API_KEY),
        site: process.env.URL,
      });
      const { status, payload } = customerError(kind);
      if (typeof page === "function") return page(payload.error, status);
      return new Response(JSON.stringify(payload), {
        status,
        headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store, private" },
      });
    }
  };
}

/** Every customer key the registry can produce, for the tests and the mock. */
export function customerKeys() {
  const keys = new Set();
  for (const [kind, e] of Object.entries(KINDS)) {
    if (!e.customer) continue;
    keys.add(describe(kind).customer);
    keys.add(describe(kind, { paid: true }).customer);
  }
  return [...keys];
}

export { MESSAGES };
