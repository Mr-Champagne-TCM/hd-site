import { formEncode } from "./checkout.mjs";

/**
 * The whole Stripe client, a handful of functions.
 *
 * No SDK. This makes a few plain API calls -- sessions, the tier products, the
 * retry coupon -- and a package that ships its own HTTP stack, retry logic and
 * type definitions to do that is weight without benefit. `fetch` is in the
 * runtime.
 *
 * The key never leaves this file's arguments. It is read from the environment
 * by the function that calls in, passed here, and used in one header.
 */

const BASE = "https://api.stripe.com/v1";

/**
 * DOES THIS EVEN LOOK LIKE A KEY?
 *
 * Checked because it was not, and the failure was a puzzle rather than a
 * sentence. Switching to live keys stored `keysk_live_...` -- the word "key"
 * copied along with the token from the dashboard's own table -- and what came
 * back was a 502 with a generic message, no entry in Stripe's request log to
 * find (an unauthenticated call is not attributed to any account), and an
 * empty line in the function log.
 *
 * A whole diagnosis for a stray three letters. Two cheap guards so the next one
 * says what it is:
 *
 *   TRIMMED, because a trailing newline from a copy-paste is the classic
 *   version of this and is invisible in every UI that shows the value.
 *
 *   SHAPE-CHECKED, because "sk_" or "rk_" is the one thing every Stripe secret
 *   has in common, and anything else is a configuration mistake rather than
 *   something Stripe should be asked about.
 *
 * NEVER LOGS THE KEY. It says what the value starts with, which is enough to
 * recognise a paste error and useless to anybody else.
 */
function checkKey(key) {
  const k = typeof key === "string" ? key.trim() : "";
  if (!k) throw new Error("stripe: no key");
  if (!/^[sr]k_(test|live)_/.test(k)) {
    const shown = k.slice(0, 6).replace(/[^A-Za-z_]/g, "*");
    throw new Error(
      `stripe: STRIPE_SECRET_KEY does not look like a secret key -- it begins "${shown}" ` +
        `and should begin "sk_live_" or "sk_test_". Check for a stray prefix or a copied label.`,
    );
  }
  return k;
}

async function call(path, key, { method = "GET", params, idempotencyKey, fetchImpl = fetch } = {}) {
  key = checkKey(key);

  const headers = {
    Authorization: `Bearer ${key}`,
    // Pin the shape of what comes back. Without this, Stripe upgrades the API
    // for new accounts over time and a response quietly changes underneath a
    // deploy that has not been touched in months.
    "Stripe-Version": "2024-06-20",
    // A repeated POST with the same key returns the FIRST answer instead of
    // making a second object -- how a one-use retry code stays one code even
    // if its button is pressed twice (lib/retryCode.mjs).
    ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
  };

  let url = `${BASE}${path}`;
  let body;
  if (params) {
    const encoded = new URLSearchParams(formEncode(params)).toString();
    if (method === "GET") url += `?${encoded}`;
    else {
      body = encoded;
      headers["Content-Type"] = "application/x-www-form-urlencoded";
    }
  }

  const res = await fetchImpl(url, { method, headers, body });
  const payload = await res.json().catch(() => null);

  if (!res.ok) {
    // Stripe's own message is written for a developer, not a buyer, so it is
    // logged and NOT passed to the page. What reaches the visitor is written
    // for a visitor.
    const err = new Error(payload?.error?.message || `stripe ${res.status}`);
    err.status = res.status;
    err.code = payload?.error?.code;
    throw err;
  }
  return payload;
}

/** Create a Checkout Session and return it. */
export function createSession(key, params, { fetchImpl } = {}) {
  return call("/checkout/sessions", key, { method: "POST", params, fetchImpl });
}

/**
 * Read a session back, to find out whether it was actually paid for.
 *
 * This is the check that makes the return URL safe. The browser comes back
 * holding a session id, which is not proof of anything -- proof is Stripe
 * saying `payment_status: paid` when asked directly.
 */
export function getSession(key, id) {
  return call(`/checkout/sessions/${encodeURIComponent(id)}`, key);
}

/**
 * Sessions created since a moment, newest first.
 *
 * The third and last Stripe call. It exists for reconciliation: Stripe knows
 * about every payment whether or not the buyer's browser ever came back, and
 * that makes it the only source of truth for "who paid but got nothing".
 *
 * `customer_details` is included on a list response, which matters -- it holds
 * the name, email and phone the delivery needs, and without it every session
 * would need a second call to fetch.
 *
 * One page of up to 100. A day with more than a hundred purchases is a very
 * good day and a paging bug waiting to happen, so the caller is told rather
 * than being quietly handed a truncated list.
 */
export async function listSessions(key, { createdGte, limit = 100 } = {}) {
  const params = { limit };
  if (Number.isFinite(createdGte)) params["created[gte]"] = Math.floor(createdGte / 1000);
  const page = await call("/checkout/sessions", key, { params });
  return { sessions: page?.data ?? [], more: Boolean(page?.has_more) };
}

/**
 * A ONE-USE, 100%-OFF COUPON, and the promotion code a buyer types for it.
 *
 * Jeremy, 10/16: "No refunds offered. Can make a 0% code to retry." These two
 * calls are that code, made from the alert email's signed one-tap link
 * (lib/retryCode.mjs) rather than by hand in the dashboard. Both carry an
 * idempotency key, so a second press returns the same coupon and the same
 * code rather than a second free reading.
 *
 * A restricted key without the Coupons permission is refused here (403); the
 * page that called says so and gives the dashboard steps instead.
 */
export function createCoupon(key, params, { idempotencyKey, fetchImpl } = {}) {
  return call("/coupons", key, { method: "POST", params, idempotencyKey, fetchImpl });
}

export function createPromotionCode(key, params, { idempotencyKey, fetchImpl } = {}) {
  return call("/promotion_codes", key, { method: "POST", params, idempotencyKey, fetchImpl });
}

/**
 * A TIER'S PRODUCT, made the first time it is needed (10/16).
 *
 * Each tier is one Stripe product under an id we choose (checkout.mjs
 * `tierProduct`), so a free retry code can be held to the tier the buyer
 * bought (`applies_to.products`). Asked for first, made only when Stripe says
 * there is none; two first-ever checkouts racing to make it both end up with
 * it (`resource_already_exists` is success).
 *
 * An ARCHIVED product is refused rather than quietly brought back: archiving
 * is a decision made in the dashboard, and the caller falls back instead.
 */
export async function ensureProduct(key, { id, name, description }, { fetchImpl } = {}) {
  try {
    const found = await call(`/products/${encodeURIComponent(id)}`, key, { fetchImpl });
    if (found?.active === false) {
      const err = new Error(`stripe: product ${id} is archived`);
      err.code = "product_archived";
      throw err;
    }
    /*
     * RENAMED ONCE, IN PLACE (fix 14B, 10/19): the products made on 10/16 are
     * called "The reading" etc. Checkout shows the product's own name, so an
     * existing product whose name or description differs from ours is brought
     * up to date. A failed update keeps the old name; the sale goes on.
     */
    if (found && (found.name !== name || (description && found.description !== description))) {
      try {
        return await call(`/products/${encodeURIComponent(id)}`, key, {
          method: "POST",
          params: { name, ...(description ? { description } : {}) },
          fetchImpl,
        });
      } catch {
        return found;
      }
    }
    return found;
  } catch (e) {
    if (e?.status !== 404) throw e;
  }
  try {
    return await call("/products", key, {
      method: "POST",
      params: { id, name, description, metadata: { made_by: "hd-site checkout" } },
      idempotencyKey: `product-${id}`,
      fetchImpl,
    });
  } catch (e) {
    if (e?.code === "resource_already_exists") return { id };
    throw e;
  }
}
