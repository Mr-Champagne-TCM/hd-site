import { formEncode } from "./checkout.mjs";

/**
 * The whole Stripe client, which is two functions.
 *
 * No SDK. This makes exactly two API calls -- create a session, read a session
 * back -- and a package that ships its own HTTP stack, retry logic and type
 * definitions to do that is weight without benefit. `fetch` is in the runtime.
 *
 * The key never leaves this file's arguments. It is read from the environment
 * by the function that calls in, passed here, and used in one header.
 */

const BASE = "https://api.stripe.com/v1";

async function call(path, key, { method = "GET", params } = {}) {
  if (!key) throw new Error("stripe: no key");

  const headers = {
    Authorization: `Bearer ${key}`,
    // Pin the shape of what comes back. Without this, Stripe upgrades the API
    // for new accounts over time and a response quietly changes underneath a
    // deploy that has not been touched in months.
    "Stripe-Version": "2024-06-20",
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

  const res = await fetch(url, { method, headers, body });
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
export function createSession(key, params) {
  return call("/checkout/sessions", key, { method: "POST", params });
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
