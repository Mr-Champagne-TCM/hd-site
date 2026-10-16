import { createHmac } from "node:crypto";
import { open as openSealed, seal } from "./sig.mjs";
import { paidLevel, tierAt, tierProduct } from "./checkout.mjs";

/**
 * A FREE RETRY CODE, ONE TAP FROM THE ALERT (Jeremy 10/16: "No refunds
 * offered. Can make a 0% code to retry.").
 *
 * The alert email can carry a link that mints ONE one-use, 100%-off Stripe
 * promotion code for the buyer it is about. Built only because it can be
 * protected; every one of these holds, and each has a test:
 *
 *   SIGNED     an HMAC under a key derived from GRANT_SECRET for this purpose
 *              alone, so no reading link or grant can ever be replayed here.
 *   EXPIRES    seven days from the alert. After that the page gives the
 *              dashboard steps instead.
 *   ONE USE    keyed to the INCIDENT, not to the email: the alert and every
 *              digest that mentions the same incident share one code. A marker
 *              in the store says it was made, and Stripe's idempotency key
 *              (derived from the same incident) returns the same coupon if two
 *              presses race past the marker.
 *   GET IS SAFE  opening the link only shows a button. Mail scanners fetch
 *              links before a person does, and a GET that minted would spend
 *              the code on a robot. Only the button's POST makes it.
 *   THEIR TIER ONLY  (Jeremy 10/16: limit it "to the tier they bought".) The
 *              coupon carries `applies_to.products` = the tier's own Stripe
 *              product (checkout.mjs `tierProduct`; the checkout prices every
 *              sale against it). The tier comes from the incident: the link
 *              carries it when the alert knew it, otherwise the incident on
 *              file names it, otherwise its Stripe checkout session does
 *              (`metadata.level`, paid). When none of those can say, NOTHING
 *              is made -- never an unrestricted code -- and the page says why.
 *
 * Without STRIPE_SECRET_KEY at runtime the alert does not carry the link at
 * all; it gives the dashboard steps (lib/playbook.mjs). If the key is a
 * restricted one without the Coupons permission, Stripe refuses and the page
 * says so, with the same steps.
 */

export const RETRY_LINK_TTL_MS = 7 * 24 * 60 * 60 * 1000;
/** How long the code itself can be redeemed. */
export const RETRY_CODE_TTL_MS = 60 * 24 * 60 * 60 * 1000;
export const RETRY_PATH = "/api/admin/retry-code";

/** The dashboard route, for when the one-tap link is not there or not allowed. */
export const DASHBOARD_STEPS =
  'Stripe dashboard -> Product catalogue -> Coupons -> "+ Create coupon": Percentage, 100% off, Duration "Once", ' +
  'tick "Apply to specific products" and pick only the one they bought (The summary, The chart or The reading), ' +
  'tick "Limit the total number of times this coupon can be redeemed" = 1 -> "Create coupon" -> ' +
  'in the coupon, "+ Add promotion code": tick "Limit to 1 redemption" -> make it. The buyer types the code on ' +
  'Stripe\'s checkout page ("Add promotion code").';

const NONCE = /^[0-9]{1,15}-[0-9]{1,12}$/;

function purposeKey(secret) {
  return createHmac("sha256", secret).update("retry-code").digest("base64url");
}

/** The one code an incident can ever make, so a replay asks Stripe for the same thing. */
export function codeFor(nonce, secret) {
  const alphabet = "23456789BCDFGHJKMNPQRSTVWXYZ";
  const mac = createHmac("sha256", purposeKey(secret)).update(`code:${nonce}`).digest();
  let out = "";
  for (let i = 0; i < 6; i++) out += alphabet[mac[i] % alphabet.length];
  return `RETRY${out}`;
}

/** The tier an incident names, or null. */
function incidentTier(incident) {
  const t = incident?.ref?.tier;
  return Number.isInteger(t) && tierAt(t) ? t : null;
}

/**
 * The link for one incident, or null when it cannot be protected (no secret,
 * no origin, no incident id), there is no Stripe key to make it with, or
 * nothing on the incident can say which tier was bought (no tier, no checkout
 * session) -- the code is held to that tier, so without it the alert gives
 * the dashboard steps instead.
 */
export function retryLink({ incident, now = Date.now() }, { secret, origin, stripeKey } = {}) {
  if (!secret || !origin || !stripeKey || !incident?.id || !NONCE.test(String(incident.id))) return null;
  const tier = incidentTier(incident);
  if (tier === null && !incident?.ref?.session) return null;
  const token = seal(
    {
      p: "retry-code",
      n: String(incident.id),
      k: String(incident.kind ?? "").slice(0, 40),
      ...(tier !== null ? { t: tier } : {}),
      exp: now + RETRY_LINK_TTL_MS,
    },
    purposeKey(secret),
  );
  return `${origin}${RETRY_PATH}?t=${token}`;
}

/** `{ ok, nonce, kind, exp }` or `{ ok: false, reason }`. Never throws. */
export function readRetryToken(token, secret, now = Date.now()) {
  if (!secret) return { ok: false, reason: "misconfigured" };
  const opened = openSealed(token, purposeKey(secret), { maxLength: 600 });
  if (!opened.ok) return { ok: false, reason: opened.reason };
  const p = opened.payload ?? {};
  if (p.p !== "retry-code" || !NONCE.test(String(p.n)) || !Number.isFinite(p.exp)) return { ok: false, reason: "malformed" };
  if (now > p.exp) return { ok: false, reason: "expired" };
  const tier = Number.isInteger(p.t) && tierAt(p.t) ? p.t : null;
  return { ok: true, nonce: p.n, kind: String(p.k ?? ""), tier, exp: p.exp };
}

/**
 * WHICH TIER THEY BOUGHT: the link's own word, then the incident on file,
 * then the incident's Stripe checkout session (paid, `metadata.level`).
 * `{ tier }` or `{ tier: null, why }`. Never throws.
 */
export async function buyerTier({ read, store, stripe }) {
  if (Number.isInteger(read.tier)) return { tier: read.tier };
  let incident = null;
  try {
    incident = await store.get(`incident/${read.nonce}`, { type: "json" });
  } catch {
    /* the session is the last word anyway */
  }
  const fromIncident = incidentTier(incident);
  if (fromIncident !== null) return { tier: fromIncident };
  const session = incident?.ref?.session;
  if (!session) return { tier: null, why: incident ? "the incident names no purchase" : "the incident is no longer on file" };
  if (!stripe?.getSession) return { tier: null, why: "there is no Stripe key here to look up their checkout" };
  try {
    const level = paidLevel(await stripe.getSession(session));
    return level === null ? { tier: null, why: "their checkout does not show a paid tier" } : { tier: level };
  } catch (e) {
    return { tier: null, why: `Stripe did not answer about their checkout (${e?.status ?? e?.name ?? "error"})` };
  }
}

/**
 * GET shows, POST makes. Everything injected so a test can play Stripe.
 *
 * `stripe` is `{ createCoupon, createPromotionCode }` with the key bound.
 * Returns `{ status, html }`.
 */
export async function handleRetryCode({ method, token, store, secret, stripe, now = Date.now() }) {
  const read = readRetryToken(token, secret, now);
  if (!read.ok) {
    if (read.reason === "expired") {
      return page(410, "This link has expired", `<p>It worked for seven days. A code can still be made by hand:</p><p>${esc(DASHBOARD_STEPS)}</p>`);
    }
    if (read.reason === "misconfigured") return page(503, "Not set up", "<p>GRANT_SECRET is not set on this site.</p>");
    return page(404, "Not a working link", "<p>This is not a retry-code link this site made.</p>");
  }

  const marker = `retry-code/${read.nonce}`;
  let made = null;
  try {
    made = await store.get(marker, { type: "json" });
  } catch {
    return page(503, "The store did not answer", "<p>Nothing was made. Opening the link again in a minute usually works.</p>");
  }
  if (made?.code) return page(200, "Already made", codeBlock(made.code, made.at, "This link has already made its one code:", made.label));

  // Held to the tier they bought, or not made at all.
  const bought = await buyerTier({ read, store, stripe });
  if (bought.tier === null) {
    return page(
      409,
      "Which tier they bought is not known",
      `<p>Nothing was made: the code only covers the tier the buyer bought, and ${esc(bought.why)}. ` +
        `Their Stripe payment shows what they bought; the code can then be made by hand:</p><p>${esc(DASHBOARD_STEPS)}</p>`,
    );
  }
  const product = tierProduct(bought.tier);

  if (method !== "POST") {
    return page(
      200,
      "One free retry code",
      `<p>For the buyer in the alert (${esc(read.kind || "incident")}). One use, 100% off ${esc(product.name)} only (the tier they bought), redeemable for 60 days.</p>
<form method="POST"><input type="hidden" name="t" value="${esc(token)}"><button type="submit">Make the code</button></form>
<p class="small">Opening this page made nothing. The button makes the code, once.</p>`,
    );
  }
  if (!stripe) return page(503, "No Stripe key here", `<p>STRIPE_SECRET_KEY is not set on this site. By hand:</p><p>${esc(DASHBOARD_STEPS)}</p>`);

  // Claimed before Stripe is asked, so a second press finds it; the idempotency
  // key covers the moment between.
  try {
    await store.setJSON(marker, { state: "making", at: now }, { expiration: new Date(read.exp + RETRY_CODE_TTL_MS) });
  } catch {
    return page(503, "The store did not answer", "<p>Nothing was made. Pressing the button again in a minute usually works.</p>");
  }

  const code = codeFor(read.nonce, secret);
  const until = Math.floor((now + RETRY_CODE_TTL_MS) / 1000);
  const metadata = { made_for: read.kind || "incident", tier: String(bought.tier), product: product.id };
  try {
    // The product has to exist before a coupon can name it. It already does
    // once any checkout has run with this key; this makes sure.
    await stripe.ensureProduct(product);
    const coupon = await stripe.createCoupon(
      {
        percent_off: 100,
        duration: "once",
        max_redemptions: 1,
        redeem_by: until,
        applies_to: { products: [product.id] },
        name: `Free retry: ${product.name} (one use)`,
        metadata,
      },
      { idempotencyKey: `retry-coupon-${read.nonce}` },
    );
    await stripe.createPromotionCode(
      { coupon: coupon.id, code, max_redemptions: 1, expires_at: until, metadata },
      { idempotencyKey: `retry-promo-${read.nonce}` },
    );
  } catch (e) {
    try {
      // Released, so the button can be pressed again once Stripe answers.
      await store.delete?.(marker);
    } catch {
      /* the marker expires on its own */
    }
    const denied = e?.status === 401 || e?.status === 403;
    console.log(`retry-code: stripe refused (${e?.status ?? e?.name ?? "error"}${e?.code ? ` ${e.code}` : ""})`);
    return page(
      502,
      denied ? "Stripe would not make it with this key" : "Stripe did not make it",
      `<p>${denied ? "The site's key is not allowed to make coupons." : "Nothing was made; the button can be pressed again."} By hand:</p><p>${esc(DASHBOARD_STEPS)}</p>`,
    );
  }

  try {
    await store.setJSON(marker, { state: "made", code, at: now, label: product.name }, { expiration: new Date(read.exp + RETRY_CODE_TTL_MS) });
  } catch {
    /* The code exists in Stripe either way; Stripe's idempotency returns it again. */
  }
  return page(200, "Made", codeBlock(code, now, "One use, 100% off, for the next 60 days:", product.name));
}

function codeBlock(code, at, lead, label) {
  return `<p>${esc(lead)}</p><p class="code">${esc(code)}</p>
${label ? `<p>It covers ${esc(label)} only, the tier they bought.</p>` : ""}
<p class="small">Made ${esc(new Date(at).toISOString().slice(0, 16).replace("T", " "))} UTC. The buyer types it on Stripe's checkout page under "Add promotion code".</p>`;
}

function page(status, title, body) {
  return {
    status,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store, private",
      "X-Robots-Tag": "noindex, nofollow",
      "Referrer-Policy": "no-referrer",
    },
    html: `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex"><title>${esc(title)}</title>
<style>body{font:16px/1.5 system-ui,sans-serif;background:#0E1A2B;color:#F2EFE9;max-width:34rem;margin:0 auto;padding:2rem 1rem}
h1{color:#C9A227;font-size:1.3rem}.code{font:600 1.8rem ui-monospace,Consolas,monospace;letter-spacing:.08em;color:#C9A227}
.small{color:#9FB0C4;font-size:.9rem}button{background:#C9A227;color:#0E1A2B;border:0;font-weight:600;padding:.8rem 1.6rem;font-size:1rem}</style>
<h1>${esc(title)}</h1>${body}`,
  };
}

function esc(s) {
  return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
