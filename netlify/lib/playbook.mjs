import { fillNote } from "./alertNotes.mjs";
import { DASHBOARD_STEPS } from "./retryCode.mjs";

/**
 * WHEN JEREMY IS PAGED: A BRIEF, WHICH BUYER, AND WHAT HE CAN DO FOR THEM.
 *
 * Jeremy, 10/16: "When I'm paged, I need a brief as well as options to resolve
 * for them." / "No refunds offered. Can make a 0% code to retry. Yes those are
 * good options."
 *
 * So every page-jeremy kind in netlify/lib/failures.mjs (and every kind that
 * becomes page-jeremy when money was taken) has a row here:
 *
 *   who      buyer    one paying buyer per incident, named by ids
 *            visitor  people not yet identified (nothing bought)
 *            system   no single person; the whole site or a watcher
 *   brief    one plain line of what happened. The alert adds when, and how
 *            many buyers the same kind touched in the last 24 hours.
 *   fix      what to put right on our side first, when there is something.
 *   auto     what the site is already doing about it by itself.
 *   options  numbered, drawn ONLY from:
 *              resend              (a) resend their link -- the reading page's
 *                                      own "Email me this link" button
 *              resend-when-written (a) the same, once the reading is written
 *              note:<key>          (b) a ready-made note in Jeremy's voice
 *                                      (lib/alertNotes.mjs)
 *              code                (c) a one-use 100%-off retry code, held to
 *                                      the tier they bought (any tier when
 *                                      that cannot be told)
 *                                      (lib/retryCode.mjs)
 *            NEVER a refund. The test beside this file holds that.
 *
 * WHAT AN ALERT NEVER CARRIES: a name, an email, a phone, a birth detail or a
 * word of the reading. "Which" is ids and links to the objects that hold
 * those (Stripe, the reading itself) -- never the details.
 */

const MISCONFIG = "The Reason line names the missing setting: Netlify -> this site -> Site configuration -> Environment variables, then redeploy.";
const RECONCILE =
  "The purchase watcher (reconcile, every 15 minutes) finds any paid session with no reading; with RECONCILE_DELIVER=1 it delivers by itself, otherwise it pages again as purchase-undelivered.";
const SWEEP = "The writer is asked again every 15 minutes, and the buyer is emailed automatically the moment it is written.";

const ENGINE_OPTIONS = ["resend", "note:chart-again", "code"];
const WRITER_OPTIONS = ["resend-when-written", "note:writing", "code"];

export const PLAYBOOK = {
  // --- checkout: nothing charged ----------------------------------------------
  "checkout-misconfigured": {
    who: "visitor",
    brief: "Checkout is not working: the shop is missing a setting, so nobody can buy right now. Nothing was charged.",
    fix: MISCONFIG,
    options: ["note:checkout-down", "code"],
  },
  "checkout-crash": {
    who: "visitor",
    brief: "Checkout hit an unexpected fault before Stripe's page opened. Nothing was charged.",
    fix: "The function log for /api/checkout at this time has the fault.",
    options: ["note:checkout-down", "code"],
  },

  // --- claim: money taken, or about to be -------------------------------------
  "claim-misconfigured": {
    who: "buyer",
    brief: "A buyer came back from paying and the shop could not confirm it (a setting is missing). Money is taken; no reading link was made.",
    fix: MISCONFIG,
    auto: RECONCILE,
    options: ["note:confirm-later", "code"],
  },
  "claim-stripe-unreachable": {
    who: "buyer",
    brief: "A buyer came back from paying and Stripe did not answer when asked to confirm it. Money is likely taken; no reading link was made yet.",
    auto: RECONCILE,
    options: ["note:confirm-later", "code"],
  },
  "claim-crash": {
    who: "buyer",
    brief: "Confirming a purchase hit an unexpected fault. The buyer may have paid and be holding nothing.",
    auto: RECONCILE,
    options: ["note:confirm-later", "code"],
  },
  "claim-not-recorded": {
    who: "buyer",
    brief: "A buyer paid, but the purchase could not be saved, so no reading link exists yet.",
    auto: RECONCILE,
    options: ["note:setting-up", "code"],
  },
  "claim-email": {
    who: "buyer",
    brief: "A buyer paid and their reading link was made, but the email carrying it did not go.",
    options: ["resend", "note:safe-link", "code"],
  },
  "purchase-undelivered": {
    who: "buyer",
    brief: "A buyer paid and the watcher found nothing made for it (the Reason line says whether it has now delivered).",
    options: ["resend", "note:safe-link", "code"],
  },
  "reconcile-truncated": {
    who: "system",
    brief: "The purchase watcher saw more than 100 sessions in two days and could not check them all.",
    fix: "Stripe -> Payments, last 48 hours: any payment without a delivery email is one to follow up.",
    options: ["note:setting-up", "code"],
  },
  "health-store": {
    who: "system",
    brief: "The failure log itself could not be read, so reports may be missing problems.",
    fix: "Netlify -> this site -> Blobs -> the health store, and Netlify's status page.",
    options: ["note:safe-link", "code"],
  },

  // --- the chart ---------------------------------------------------------------
  "chart-misconfigured": {
    who: "visitor",
    brief: "The chart form is missing a setting, so no chart can be drawn right now, paid buyers included.",
    fix: MISCONFIG,
    options: ["note:chart-again", "code"],
  },
  "chart-crash": {
    who: "visitor",
    brief: "Drawing a chart hit an unexpected fault.",
    fix: "The function log for /api/chart at this time has the fault.",
    options: ["note:chart-again", "code"],
  },
  "chart-not-saved": {
    who: "buyer",
    brief: "A paid buyer's chart was drawn but could not be saved, so they were asked to come back to it.",
    options: ENGINE_OPTIONS,
  },
  "engine-401-key": {
    who: "visitor",
    brief: "The chart engine refused the shop's key, so no chart can be drawn right now, paid buyers included.",
    fix: "The engine key in Netlify's environment variables against the engine's own key list.",
    options: ENGINE_OPTIONS,
  },
  "engine-403-tier": {
    who: "buyer",
    brief: "The engine key does not reach the tier a buyer paid for, so their chart could not be drawn.",
    fix: "Raise the engine key's tier cap to match what the shop sells.",
    options: ENGINE_OPTIONS,
  },
  "engine-429-key-limit": {
    who: "visitor",
    brief: "The engine key hit its usage limit; charts are refused until it resets.",
    fix: "The engine key's limit, or a second key.",
    options: ENGINE_OPTIONS,
  },
  "engine-400-other": {
    who: "buyer",
    brief: "A paid buyer's chart was refused by the engine for a reason the form does not explain. Money taken; their link still works for another go.",
    fix: "The Reason line has the engine's code; their birth details are on their record, not here.",
    options: ENGINE_OPTIONS,
  },
  "engine-5xx": {
    who: "buyer",
    brief: "A paid buyer's chart could not be drawn: the engine was down. Money taken; their link still works for another go.",
    options: ENGINE_OPTIONS,
  },
  "engine-unexpected": {
    who: "buyer",
    brief: "A paid buyer's chart could not be drawn: the engine answered in a way the shop does not know. Money taken; their link still works for another go.",
    options: ENGINE_OPTIONS,
  },
  "engine-timeout": {
    who: "buyer",
    brief: "A paid buyer's chart could not be drawn: the engine took too long (cold or stuck). Money taken; their link still works for another go.",
    options: ENGINE_OPTIONS,
  },
  "engine-unreachable": {
    who: "buyer",
    brief: "A paid buyer's chart could not be drawn: the engine could not be reached. Money taken; their link still works for another go.",
    options: ENGINE_OPTIONS,
  },

  // --- town search ---------------------------------------------------------------
  "places-misconfigured": {
    who: "visitor",
    brief: "Birthplace search is missing a setting, so nobody can pick a birthplace right now.",
    fix: MISCONFIG,
    options: ["note:places-down", "code"],
  },

  // --- the reading page ------------------------------------------------------------
  // --- adding a birth time found later (10/22) ---------------------------------
  // Adding a time is free, so no retry code is offered: their link is all they need.
  "addtime-misconfigured": {
    who: "visitor",
    brief: "A buyer could not add the birth time they found: the site is missing a setting.",
    fix: MISCONFIG,
    options: ["resend", "note:time-again"],
  },
  "addtime-store-unavailable": {
    who: "buyer",
    brief: "A buyer opened 'add it here' and the store did not answer. Their chart is safe and unchanged.",
    options: ["resend", "note:reading-page"],
  },
  "addtime-engine": {
    who: "buyer",
    brief: "A buyer tried to add the birth time they found and the engine did not answer (its kind is under DETAILS). Nothing changed: their chart is as it was, and the time they typed is still in the form for another try.",
    options: ["resend", "note:time-again"],
  },
  "addtime-not-saved": {
    who: "buyer",
    brief: "A buyer added their birth time and the chart was cast again, but it could not be saved, so nothing changed and they were asked to try once more.",
    options: ["resend", "note:time-again"],
  },
  "addtime-crash": {
    who: "visitor",
    brief: "Adding a birth time hit an unexpected fault. The chart is unchanged.",
    fix: "The function log for /api/add-time at this time has the fault.",
    options: ["resend", "note:time-again"],
  },
  "reading-misconfigured": {
    who: "visitor",
    brief: "Reading links cannot be opened: the site is missing a setting.",
    fix: MISCONFIG,
    options: ["resend", "note:reading-page", "code"],
  },
  "reading-store-unavailable": {
    who: "buyer",
    brief: "A buyer opened their reading link and the store did not answer. Their reading is safe; the page said so.",
    options: ["resend", "note:reading-page", "code"],
  },
  "reading-crash": {
    who: "visitor",
    brief: "Opening a reading link hit an unexpected fault.",
    fix: "The function log for /api/reading at this time has the fault.",
    options: ["resend", "note:reading-page", "code"],
  },

  // --- writing the reading -----------------------------------------------------------
  "gemini-refused-5x": { who: "buyer", brief: "A paid reading could not be written: five drafts in a row were refused as incomplete.", auto: SWEEP, options: WRITER_OPTIONS },
  "gemini-503": { who: "buyer", brief: "A paid reading could not be written: Gemini was overloaded (503).", auto: SWEEP, options: WRITER_OPTIONS },
  "gemini-429": { who: "buyer", brief: "A paid reading could not be written: Gemini's rate limit (429).", auto: SWEEP, fix: "Gemini quota in Google AI Studio.", options: WRITER_OPTIONS },
  "gemini-http": { who: "buyer", brief: "A paid reading could not be written: Gemini answered with an error (the Reason line has the status).", auto: SWEEP, options: WRITER_OPTIONS },
  "gemini-timeout": { who: "buyer", brief: "A paid reading could not be written: Gemini took too long.", auto: SWEEP, options: WRITER_OPTIONS },
  "gemini-network": { who: "buyer", brief: "A paid reading could not be written: Gemini could not be reached.", auto: SWEEP, options: WRITER_OPTIONS },
  "gemini-unreadable": { who: "buyer", brief: "A paid reading could not be written: Gemini's answer could not be read.", auto: SWEEP, options: WRITER_OPTIONS },
  "gemini-misconfigured": { who: "buyer", brief: "A paid reading could not be written: the Gemini key is not set.", fix: MISCONFIG, auto: SWEEP, options: WRITER_OPTIONS },
  "gemini-no-chart": { who: "buyer", brief: "A paid reading could not be written: its chart was missing from the record.", options: WRITER_OPTIONS },
  "gemini-unknown": { who: "buyer", brief: "A paid reading could not be written, for a reason the writer did not name.", auto: SWEEP, options: WRITER_OPTIONS },
  "reading-prompt": { who: "system", brief: "The reading prompt could not be loaded, so no paid reading can be written right now.", fix: "The prompt blob in the store (tools/reading-prompt*.local.txt is the source).", auto: SWEEP, options: WRITER_OPTIONS },
  "reading-failure-rate": { who: "system", brief: "Readings are failing to write at an unusual rate in the last hour; buyers are waiting longer than they should.", auto: SWEEP, options: WRITER_OPTIONS },

  // --- the PDF ---------------------------------------------------------------------
  "pdf-misconfigured": { who: "visitor", brief: "PDF downloads cannot be made: the site is missing a setting.", fix: MISCONFIG, options: ["resend", "note:pdf", "code"] },
  "pdf-store-unavailable": { who: "buyer", brief: "A buyer asked for their PDF and the store did not answer.", options: ["resend", "note:pdf", "code"] },
  "pdf-build-failed": { who: "buyer", brief: "A buyer asked for their PDF and it could not be built.", fix: "The function log for /api/pdf at this time has the fault.", options: ["resend", "note:pdf", "code"] },
  "pdf-crash": { who: "visitor", brief: "Making a PDF hit an unexpected fault.", fix: "The function log for /api/pdf at this time has the fault.", options: ["resend", "note:pdf", "code"] },

  // --- sending the link again ---------------------------------------------------------
  "resend-misconfigured": { who: "visitor", brief: 'A buyer pressed "Email me this link" and nothing could be sent: the site is missing a setting.', fix: MISCONFIG, options: ["note:link-again", "code"] },
  "resend-store-unavailable": { who: "buyer", brief: 'A buyer pressed "Email me this link" and the store did not answer, so nothing was sent.', options: ["resend", "note:link-again", "code"] },
  "mycharts-misconfigured": { who: "visitor", brief: 'Someone asked "Email me my charts" and nothing could be sent: the site is missing a setting.', fix: MISCONFIG, options: ["note:charts-down", "code"] },
  "mycharts-store-unavailable": { who: "visitor", brief: 'Someone asked "Email me my charts" and the store did not answer, so nothing was sent.', options: ["note:charts-down", "code"] },
  "mycharts-crash": { who: "visitor", brief: '"Email me my charts" hit an unexpected fault, so nothing was sent.', fix: "The function log for /api/my-charts at this time has the fault.", options: ["note:charts-down", "code"] },
  "resend-crash": { who: "visitor", brief: '"Email me this link" hit an unexpected fault, so nothing was sent.', fix: "The function log for /api/resend at this time has the fault.", options: ["note:link-again", "code"] },
};

/** How many people the same kind touched, said for the kind of "who" it is. */
export function touchLine(who, count, span = "the last 24 hours") {
  const n = Math.max(1, Number(count) || 1);
  if (who === "buyer") return `Touches ${n} buyer${n === 1 ? "" : "s"} in ${span}.`;
  if (who === "visitor") return `${n} time${n === 1 ? "" : "s"} in ${span}; whoever hit it is not identified (nothing bought, or no link held).`;
  return `${n} time${n === 1 ? "" : "s"} in ${span}; no single buyer is named.`;
}

/** Central time, the way Jeremy reads a clock. */
export function whenLine(at) {
  try {
    return new Intl.DateTimeFormat("en-US", {
      timeZone: "America/Chicago",
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      timeZoneName: "short",
    }).format(new Date(at));
  } catch {
    return new Date(at).toISOString();
  }
}

/**
 * Stripe's dashboard path for a test-mode object carries /test. A payment id
 * does not say which mode it is in, so it follows its checkout session's.
 */
function dash(id, kind, testMode) {
  return `https://dashboard.stripe.com${testMode ? "/test" : ""}/${kind}/${id}`;
}

/**
 * WHICH: ids and one-tap links, never the person.
 * Returns `[{ label, value, href? }]`.
 */
export function whichLines(entry, { link } = {}) {
  const ref = entry?.ref ?? {};
  const out = [];
  const testMode = /^cs_test_/.test(String(ref.session ?? ""));
  if (ref.session) out.push({ label: "Stripe checkout", value: ref.session, href: dash(ref.session, "checkout/sessions", testMode) });
  if (ref.payment) out.push({ label: "Stripe payment", value: ref.payment, href: dash(ref.payment, "payments", testMode) });
  if (ref.reading) out.push({ label: "Reading id", value: ref.reading });
  if (link) out.push({ label: "Their reading link", value: link, href: link });
  if (!out.length) out.push({ label: "None", value: "no single purchase is attached to this one (it happened before a purchase, or to the site as a whole)" });
  return out;
}

/** The numbered options for an entry, as plain strings (each may hold a quoted note). */
export function optionLines(entry, { link, retryLink, shop } = {}) {
  const play = PLAYBOOK[entry?.kind];
  if (!play) return [];
  const buyer = play.who === "buyer";
  return play.options.map((o) => {
    if (o === "resend") {
      return link
        ? 'Resend their link: open their reading link (under WHICH) and press "Email me this link" near the bottom. A fresh six-day link goes to the address on their purchase, and only there.'
        : 'Resend their link: on their reading page, "Email me this link" sends a fresh six-day link to the address on their purchase. (Their link could not be made for this email -- it needs the reading id and the site\'s GRANT_SECRET.)';
    }
    if (o === "resend-when-written") {
      return 'Resend their link once it is written: open their reading link (under WHICH) and press "Email me this link". Not needed if the automatic email arrives.';
    }
    if (o === "code") {
      return (
        "Give a free retry code (one use, 100% off the tier they bought, or any tier when that is not known) to send with the note: " +
        (retryLink
          ? `one tap -> ${retryLink} (opens a page with a "Make the code" button; works once, for 7 days). Or by hand: `
          : "") +
        DASHBOARD_STEPS
      );
    }
    if (o.startsWith("note:")) {
      const lead = !buyer
        ? "If someone writes in, reply with this ready-made note:"
        : entry?.ref?.session
          ? "Reply with a ready-made note (their email is on the Stripe checkout under WHICH):"
          : entry?.ref?.reading
            ? "Reply with a ready-made note (their email is on their reading record: Netlify -> this site -> Blobs -> readings -> the reading id under WHICH):"
            : "Reply with a ready-made note (their email is on their Stripe payment, found by the time above):";
      // Signed "Very Respectfully" when money was involved, "Respectfully" when
      // nothing was charged -- from the kind and the incident, never by hand.
      return `${lead}\n"${fillNote(o.slice(5), { link, shop, kind: entry?.kind, paid: Boolean(entry?.paid) })}"`;
    }
    return o;
  });
}

/** The brief line: when, what, how many. */
export function briefLine(entry, { count = 1 } = {}) {
  const play = PLAYBOOK[entry?.kind];
  const what = play?.brief ?? `${entry?.kind} failed.`;
  return `${whenLine(entry?.at ?? Date.now())} -- ${what} ${touchLine(play?.who ?? "system", count)}`;
}

/** How many distinct buyers (or occurrences, when none is named) a set of incidents covers. */
export function countTouched(list) {
  const seen = new Set();
  let anonymous = 0;
  for (const i of list ?? []) {
    const id = i?.ref?.reading || i?.ref?.session || i?.ref?.payment;
    if (id) seen.add(id);
    else anonymous += 1;
  }
  return seen.size + anonymous;
}
