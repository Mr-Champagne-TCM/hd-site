/**
 * A FAKE STRIPE: only what netlify/lib/stripe.mjs calls, plus a hosted
 * payment page to click through. Nothing leaves this machine and no key is
 * needed -- the site is handed a made-up key of the right shape.
 *
 *   POST /v1/checkout/sessions          create (params captured for the checks)
 *   GET  /v1/checkout/sessions/:id      read back (claim)
 *   GET  /v1/checkout/sessions          list (reconcile)
 *   GET/POST /v1/products[/:id]         the tier products (ensureProduct)
 *   POST /v1/coupons, /v1/promotion_codes  retry codes
 *
 * The hosted page, /__stripe/pay/<id>, shows what Stripe shows that the site
 * controls -- the product name and description, the amount, and the
 * custom_text line under the Pay button -- and completes on one click. The
 * code RIGFREE100 makes it $0.00, the way the 100%-off test codes do live.
 */
import { randomBytes } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export const FREE_CODE = "RIGFREE100";

/** Stripe's a[b][c]=d form encoding, back into an object. */
export function formDecode(body) {
  const out = {};
  for (const [k, v] of new URLSearchParams(body)) {
    const path = k.replace(/\]/g, "").split("[");
    let at = out;
    for (let i = 0; i < path.length - 1; i++) {
      const key = path[i];
      const nextIsIndex = /^\d+$/.test(path[i + 1]);
      at[key] ??= nextIsIndex ? [] : {};
      at = at[key];
    }
    at[path.at(-1)] = v;
  }
  return out;
}

const money = (c) => `$${(c / 100).toFixed(2)}`;
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[ch]);

export function fakeStripe({ origin, dir }) {
  mkdirSync(dir, { recursive: true });
  const sessions = new Map();
  const products = new Map();
  const calls = [];
  const save = () =>
    writeFileSync(join(dir, "sessions.json"), JSON.stringify([...sessions.values()], null, 1));

  const json = (status, body) =>
    new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
  const missing = (what) => json(404, { error: { type: "invalid_request_error", code: "resource_missing", message: `No such ${what}` } });

  /** The Stripe API, answered in-process (the fetch router sends api.stripe.com here). */
  async function api(request) {
    const url = new URL(request.url);
    const path = url.pathname.replace(/^\/v1/, "");
    const body = request.method === "GET" ? null : await request.text();
    const params = body ? formDecode(body) : Object.fromEntries(url.searchParams);
    const auth = request.headers.get("authorization") || "";
    calls.push({ at: Date.now(), method: request.method, path, keyShape: auth.replace(/^Bearer\s+/, "").slice(0, 8) });

    if (request.method === "POST" && path === "/checkout/sessions") {
      const id = "cs_test_rig" + randomBytes(12).toString("hex");
      const item = params.line_items?.[0] ?? {};
      const amount = Number(item.price_data?.unit_amount ?? 0);
      const productId = item.price_data?.product ?? null;
      const product = productId ? products.get(productId) : item.price_data?.product_data ?? null;
      const s = {
        id,
        object: "checkout.session",
        url: `${origin}/__stripe/pay/${id}`,
        mode: params.mode,
        status: "open",
        payment_status: "unpaid",
        amount_subtotal: amount,
        amount_total: amount,
        currency: item.price_data?.currency ?? "usd",
        created: Math.floor(Date.now() / 1000),
        metadata: params.metadata ?? {},
        customer_details: null,
        payment_intent: null,
        success_url: params.success_url,
        cancel_url: params.cancel_url,
        rig: {
          params,
          product: product ? { id: productId, name: product.name, description: product.description } : null,
        },
      };
      sessions.set(id, s);
      writeFileSync(join(dir, `${id}.params.json`), JSON.stringify(params, null, 1));
      save();
      return json(200, s);
    }
    const one = path.match(/^\/checkout\/sessions\/([^/]+)$/);
    if (request.method === "GET" && one) {
      const s = sessions.get(decodeURIComponent(one[1]));
      return s ? json(200, s) : missing("checkout.session");
    }
    if (request.method === "GET" && path === "/checkout/sessions") {
      const since = Number(params["created[gte]"] ?? 0);
      const data = [...sessions.values()].filter((s) => s.created >= since).sort((a, b) => b.created - a.created);
      return json(200, { object: "list", data, has_more: false });
    }
    const prod = path.match(/^\/products\/([^/]+)$/);
    if (prod) {
      const id = decodeURIComponent(prod[1]);
      if (request.method === "GET") return products.has(id) ? json(200, products.get(id)) : missing("product");
      const p = { ...(products.get(id) ?? { id, object: "product", active: true }), ...params };
      products.set(id, p);
      return json(200, p);
    }
    if (request.method === "POST" && path === "/products") {
      if (products.has(params.id)) return json(400, { error: { code: "resource_already_exists" } });
      const p = { object: "product", active: true, ...params };
      products.set(params.id, p);
      return json(200, p);
    }
    if (request.method === "POST" && path === "/coupons") return json(200, { id: "rigcoupon_" + randomBytes(4).toString("hex"), ...params });
    if (request.method === "POST" && path === "/promotion_codes") return json(200, { id: "promo_rig", code: "RIGRETRY", ...params });
    return json(404, { error: { code: "rig_not_faked", message: `The rig does not fake ${request.method} ${path}` } });
  }

  /** The hosted page. GET shows it; POST pays. */
  function page(method, id, form) {
    const s = sessions.get(id);
    if (!s) return { status: 404, html: "<h1>No such session</h1>" };
    if (method === "POST") {
      const code = String(form.get("promo") ?? "").trim().toUpperCase();
      const free = code === FREE_CODE;
      s.amount_total = free ? 0 : s.amount_subtotal;
      s.payment_status = "paid";
      s.status = "complete";
      s.payment_intent = s.amount_total > 0 ? "pi_rig" + randomBytes(8).toString("hex") : null;
      s.customer_details = {
        email: String(form.get("email") ?? "").trim() || null,
        name: String(form.get("name") ?? "").trim() || null,
        phone: String(form.get("phone") ?? "").trim() || null,
      };
      s.rig.paidWith = free ? FREE_CODE : "fake card";
      save();
      return { status: 303, location: s.success_url.replace("{CHECKOUT_SESSION_ID}", s.id) };
    }
    const p = s.rig.params;
    const product = s.rig.product ?? {};
    const phone = p.phone_number_collection?.enabled === "true";
    const submit = p.custom_text?.submit?.message ?? "";
    return {
      status: 200,
      html: `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Rig checkout (fake Stripe)</title>
<style>body{font-family:system-ui,sans-serif;max-width:420px;margin:24px auto;padding:0 16px;color:#1a1f36}
.banner{background:#fff4cc;border:1px solid #e0c060;padding:8px;font-size:13px}label{display:block;margin-top:12px;font-size:14px}
input{width:100%;padding:8px;font-size:15px;box-sizing:border-box}button{margin-top:16px;width:100%;padding:12px;font-size:16px;background:#0570de;color:#fff;border:0;border-radius:6px}
.amount{font-size:30px;font-weight:600}.custom-text{font-size:13px;color:#555;margin-top:10px}</style></head><body>
<p class="banner">LOCAL TEST RIG: fake Stripe. Nothing is charged; no card is asked for.</p>
<p class="product-name">${esc(product.name)}</p>
<p class="product-description">${esc(product.description)}</p>
<p class="amount" data-cents="${s.amount_subtotal}">${money(s.amount_subtotal)}</p>
<form method="post">
<label>Email <input id="email" name="email" type="email" required></label>
<label>Name <input id="name" name="name"></label>
${phone ? '<label>Phone <input id="phone" name="phone" required></label>' : ""}
${p.allow_promotion_codes === "true" ? '<label>Promotion code <input id="promo" name="promo"></label>' : ""}
<button id="pay" type="submit">Pay</button>
<p class="custom-text" id="custom-text">${esc(submit)}</p>
</form></body></html>`,
    };
  }

  return { api, page, sessions, products, calls };
}
