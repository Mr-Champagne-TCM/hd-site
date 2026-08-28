import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Proof that something was paid for.
 *
 * A grant is a short signed statement: "this holder is entitled to tier N,
 * until this moment". It is minted after a payment settles and presented on
 * every request that wants more than the door lets through.
 *
 * DELIBERATELY STATELESS. There is no entitlements table to query, because the
 * chart request already has to be fast and adding a database read to it buys
 * nothing: the signature is the proof. That also means this layer holds no
 * record of who bought what -- the grant lives with the buyer, not with us,
 * which is the only version of this that does not quietly become a customer
 * database.
 *
 * WHAT IT IS NOT. It is not a session, not a login, and not an identity. It
 * says a tier was paid for. It says nothing about who paid, and it cannot be
 * used to look anybody up.
 *
 * WHY HMAC AND NOT A RANDOM TOKEN. A random token needs a store to mean
 * anything, and a store is the thing being avoided. A signature is checkable
 * with the secret alone, in about a microsecond, with nothing written down.
 *
 * WHY THIS IS NOT IN shared/. It was, for about ten minutes, and the leak scan
 * blocked the commit -- correctly. `src/App.tsx` imports `shared/pricing.mjs`,
 * so everything in `shared/` is bundled and served to every visitor. Signing
 * code sitting one careless import away from the browser is how a secret ends
 * up in a bundle. It lives under netlify/ because only the server runs it.
 *
 * The processor is not named anywhere in here on purpose. Stripe Checkout is
 * the chosen front door, but whatever mints a grant -- a webhook, a discount
 * code redemption, Jeremy's own phone -- the rest of the system only ever sees
 * this.
 */

/** Base64url, because a grant travels in a URL and in a header. */
function b64url(buf) {
  return Buffer.from(buf).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function unb64url(s) {
  return Buffer.from(String(s).replace(/-/g, "+").replace(/_/g, "/"), "base64");
}

function sign(body, secret) {
  return b64url(createHmac("sha256", secret).update(body).digest());
}

/**
 * Mint a grant.
 *
 * `ttlSeconds` is how long it can be USED, which is a different question from
 * how long the reading is kept. A grant is spent within minutes of buying; the
 * artefact it produces is kept for a year (D-7). Giving the grant a long life
 * would turn it into a bearer token worth stealing.
 */
export function mintGrant({ tier, sku, ttlSeconds = 3600, now = Date.now() }, secret) {
  if (!secret) throw new Error("mintGrant: no secret");
  if (!Number.isInteger(tier) || tier < 0 || tier > 2) throw new Error(`mintGrant: bad tier ${tier}`);
  const payload = { t: tier, s: sku, x: Math.floor(now / 1000) + ttlSeconds };
  const body = b64url(JSON.stringify(payload));
  return `${body}.${sign(body, secret)}`;
}

/**
 * Read a grant, and say why not if it cannot be read.
 *
 * Returns `{ ok: true, tier, sku }` or `{ ok: false, reason }`. Never throws on
 * malformed input -- this parses whatever a stranger sends, so every branch has
 * to end in an answer rather than an exception.
 */
export function readGrant(token, secret, now = Date.now()) {
  if (!secret) return { ok: false, reason: "misconfigured" };
  if (typeof token !== "string" || token.length === 0) return { ok: false, reason: "absent" };
  // A cap, because everything here is cheap but nothing should be unbounded.
  if (token.length > 512) return { ok: false, reason: "malformed" };

  const dot = token.indexOf(".");
  if (dot < 1 || dot === token.length - 1) return { ok: false, reason: "malformed" };
  const body = token.slice(0, dot);
  const mac = token.slice(dot + 1);

  const expected = sign(body, secret);
  // Constant time, and length-checked first because timingSafeEqual throws on
  // a length mismatch -- which would itself be a timing signal.
  const a = Buffer.from(mac);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return { ok: false, reason: "bad_signature" };

  let payload;
  try {
    payload = JSON.parse(unb64url(body).toString("utf8"));
  } catch {
    return { ok: false, reason: "malformed" };
  }

  const tier = payload?.t;
  if (!Number.isInteger(tier) || tier < 0 || tier > 2) return { ok: false, reason: "malformed" };
  if (typeof payload?.x !== "number" || payload.x * 1000 <= now) return { ok: false, reason: "expired" };

  return { ok: true, tier, sku: typeof payload.s === "string" ? payload.s : null };
}

/**
 * What tier a request is allowed, given whatever it presented.
 *
 * `paywall` is the launch switch, and it is a switch rather than a deletion so
 * that the two states are both explicit and both testable.
 *
 *   paywall off -- today. Tier 0 is served to anyone, which is how the page is
 *                  being tested and how it has behaved since it went up.
 *   paywall on  -- launch. Nothing is served without a grant. There is no
 *                  half-open state, because "free unless you ask nicely" is the
 *                  shape every accidental giveaway has.
 *
 * A grant that fails to verify NEVER falls back to a paid tier. The worst a
 * broken or forged grant can do is get what an empty request gets.
 */
export function tierFor({ token, paywall, secret, now = Date.now() }) {
  const grant = readGrant(token, secret, now);
  if (grant.ok) return { tier: grant.tier, via: "grant", sku: grant.sku };
  if (paywall) return { tier: null, via: "refused", reason: grant.reason };
  return { tier: 0, via: "open", reason: grant.reason };
}
