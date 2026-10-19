import { test } from "node:test";
import assert from "node:assert/strict";
import { checkoutProduct, formEncode, sessionParams, tierProduct } from "../netlify/lib/checkout.mjs";
import { ensureProduct } from "../netlify/lib/stripe.mjs";
import { TIERS } from "../shared/pricing.mjs";

/**
 * EACH TIER IS ONE STRIPE PRODUCT (10/16), so a free retry code can be held to
 * the tier the buyer bought: Stripe limits a coupon by PRODUCT, and the
 * checkout used to make a fresh nameless product for every sale.
 */

const KEY = "sk_test_" + "0".repeat(24);

test("every tier has a product under its own sku, and nothing else does", () => {
  assert.deepEqual(TIERS.map((_, i) => tierProduct(i).id), ["hd_summary", "hd_chart", "hd_reading"]);
  for (const [i, t] of TIERS.entries()) assert.deepEqual(tierProduct(i), { id: t.sku, name: t.checkoutName, description: t.checkoutDescription });
  for (const bad of [-1, 3, 1.5, null, "1"]) assert.equal(tierProduct(bad), null);
});

test("the checkout prices against the tier's product; the amount is still computed per sale", () => {
  const p = sessionParams({ level: 2, alreadyPaidCents: TIERS[1].cents, origin: "https://x", product: "hd_reading" });
  const price = p.line_items[0].price_data;
  assert.equal(price.product, "hd_reading");
  assert.equal(price.product_data, undefined, "both a product and product_data is refused by Stripe");
  assert.equal(price.unit_amount, TIERS[2].cents - TIERS[1].cents);
  assert.ok(formEncode(p).some(([k, v]) => k === "line_items[0][price_data][product]" && v === "hd_reading"));
});

test("without the product, the sale still goes through inline, as before", () => {
  const price = sessionParams({ level: 1, origin: "https://x" }).line_items[0].price_data;
  assert.equal(price.product, undefined);
  assert.deepEqual(price.product_data, { name: TIERS[1].checkoutName, description: TIERS[1].checkoutDescription });
});

test("checkoutProduct: made sure of once per instance and mode; a refusal falls back and is noted, never thrown", async () => {
  const ready = new Set();
  const asked = [];
  const ensure = async (p) => asked.push(p.id);
  assert.equal(await checkoutProduct({ level: 1, mode: "test", ensure, ready }), "hd_chart");
  assert.equal(await checkoutProduct({ level: 1, mode: "test", ensure, ready }), "hd_chart");
  assert.deepEqual(asked, ["hd_chart"], "asked Stripe again on a warm instance");
  // A live key is a different account's catalogue: asked again.
  await checkoutProduct({ level: 1, mode: "live", ensure, ready });
  assert.deepEqual(asked, ["hd_chart", "hd_chart"]);

  const notes = [];
  const refused = await checkoutProduct({
    level: 0,
    mode: "test",
    ensure: async () => {
      throw Object.assign(new Error("no"), { status: 403, code: "secret_key_required" });
    },
    note: async (d) => notes.push(d),
    ready,
  });
  assert.equal(refused, null);
  assert.match(notes[0], /tier 0 product hd_summary: stripe 403 secret_key_required/);
  assert.equal(await checkoutProduct({ level: 9, mode: "test", ensure, ready }), null);
});

/** A Stripe that answers by path, recording what it was asked. */
function fakeFetch(answers) {
  const seen = [];
  const fetchImpl = async (url, init) => {
    const path = new URL(url).pathname.replace("/v1", "");
    seen.push({ method: init.method, path, body: init.body ?? null, idem: init.headers["Idempotency-Key"] ?? null });
    const [status, payload] = answers[`${init.method} ${path}`] ?? [500, { error: { message: "unexpected" } }];
    return { ok: status < 300, status, json: async () => payload };
  };
  return { seen, fetchImpl };
}

test("ensureProduct: found is found; missing is made under our id; a race is success; archived is refused", async () => {
  const product = tierProduct(1);

  const found = fakeFetch({
    "GET /products/hd_chart": [200, { id: "hd_chart", active: true, name: product.name, description: product.description }],
  });
  assert.equal((await ensureProduct(KEY, product, { fetchImpl: found.fetchImpl })).id, "hd_chart");
  assert.equal(found.seen.length, 1);

  // Fix 14B (10/19): a product made under the old name ("The chart") is renamed in place.
  const old = fakeFetch({
    "GET /products/hd_chart": [200, { id: "hd_chart", active: true, name: "The chart", description: "old" }],
    "POST /products/hd_chart": [200, { id: "hd_chart", active: true, name: product.name }],
  });
  assert.equal((await ensureProduct(KEY, product, { fetchImpl: old.fetchImpl })).name, "Human Design chart");
  assert.equal(old.seen[1].method, "POST");
  assert.equal(new URLSearchParams(old.seen[1].body).get("name"), "Human Design chart");
  // A refused rename keeps the sale: the old product is still used.
  const stuck = fakeFetch({ "GET /products/hd_chart": [200, { id: "hd_chart", active: true, name: "The chart" }] });
  assert.equal((await ensureProduct(KEY, product, { fetchImpl: stuck.fetchImpl })).id, "hd_chart");

  const missing = fakeFetch({
    "GET /products/hd_chart": [404, { error: { code: "resource_missing", message: "No such product" } }],
    "POST /products": [200, { id: "hd_chart", active: true }],
  });
  await ensureProduct(KEY, product, { fetchImpl: missing.fetchImpl });
  const made = missing.seen[1];
  assert.equal(made.method, "POST");
  const body = new URLSearchParams(made.body);
  assert.equal(body.get("id"), "hd_chart");
  assert.equal(body.get("name"), "Human Design chart");
  assert.equal(made.idem, "product-hd_chart");

  const race = fakeFetch({
    "GET /products/hd_chart": [404, { error: { code: "resource_missing" } }],
    "POST /products": [400, { error: { code: "resource_already_exists" } }],
  });
  assert.equal((await ensureProduct(KEY, product, { fetchImpl: race.fetchImpl })).id, "hd_chart");

  const archived = fakeFetch({ "GET /products/hd_chart": [200, { id: "hd_chart", active: false }] });
  await assert.rejects(() => ensureProduct(KEY, product, { fetchImpl: archived.fetchImpl }), (e) => e.code === "product_archived");
  assert.equal(archived.seen.length, 1, "an archived product was brought back");

  const denied = fakeFetch({ "GET /products/hd_chart": [403, { error: { code: "permission_denied" } }] });
  await assert.rejects(() => ensureProduct(KEY, product, { fetchImpl: denied.fetchImpl }), (e) => e.status === 403);
});

test("the coupon's applies_to reaches Stripe in its form encoding", () => {
  const pairs = formEncode({ percent_off: 100, applies_to: { products: ["hd_chart"] } });
  assert.deepEqual(pairs, [["percent_off", "100"], ["applies_to[products][0]", "hd_chart"]]);
});
