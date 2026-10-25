import { test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { checkoutCredit, checkoutEmail, sessionParams } from "../netlify/lib/checkout.mjs";
import { createSession } from "../netlify/lib/stripe.mjs";
import { loadReading, mintReadingLink, readReadingLink, saveReading } from "../netlify/lib/reading.mjs";
import { chainHead, recordPurchase } from "../netlify/lib/charts.mjs";
import { TIERS } from "../shared/pricing.mjs";

/**
 * BATCH-1024 ITEM 2 (live retest 10/23): an upgrade (summary to chart, chart
 * to reading) and a someone-new purchase made from an owned chart opened
 * Stripe Checkout with an empty email box, so the buyer typed it again. The
 * chart the link names now hands its receipt's email to `customer_email`.
 * Only a prefill: the credit is unchanged, and the receipt and the claim still
 * read the email from the paid Stripe session. Stripe is mocked; no network.
 */

const SECRET = randomBytes(32).toString("hex");
const NOW = Date.parse("2026-10-24T15:00:00Z");
const ORIGIN = "https://shop.example";

function memoryStore() {
  const m = new Map();
  return {
    m,
    async setJSON(k, v) {
      m.set(k, JSON.parse(JSON.stringify(v)));
    },
    async get(k) {
      return m.has(k) ? m.get(k) : null;
    },
  };
}

const OUTPUT = { type: "Generator", profile: "2/4", authority: "Sacral", definedCenters: ["Sacral", "Throat"] };
const KEPT = { date: "1991-07-22", time: "17:40", timeKnown: true, place: "Denver, Colorado", zone: "America/Denver", name: "Alex" };

async function bought(store, tier, email = "alex@example.com") {
  const id = await saveReading(store, { tier, output: null, name: "Alex Rivera", email, now: NOW - 86_400_000 });
  store.m.set(id, { ...store.m.get(id), output: OUTPUT, filledAt: Math.floor(NOW / 1000) - 80_000, birth: KEPT });
  return id;
}

const link = (id, tier) => mintReadingLink({ id, tier }, SECRET);
const ctx = (store) => ({ secret: SECRET, head: (id) => chainHead(store, id, NOW), readLink: readReadingLink, now: NOW });
const emailFor = (store, body) => checkoutEmail({ body, ...ctx(store) });

/** A Stripe that answers like Stripe and remembers what it was sent. */
function fakeStripe() {
  const sent = [];
  const fetchImpl = async (url, init) => {
    sent.push({ url, init, form: new URLSearchParams(init.body) });
    return new Response(JSON.stringify({ id: "cs_test_made_up", url: "https://checkout.stripe.com/c/pay/cs_test_made_up" }), { status: 200 });
  };
  return { sent, fetchImpl };
}

/** What the function sends Stripe for a body, as functions/checkout.mjs builds it. */
async function checkout(store, body) {
  const { alreadyPaidCents, upgrades, fresh, kept } = await checkoutCredit({ body, level: body.level, ...ctx(store) });
  const email = await emailFor(store, body);
  const stripe = fakeStripe();
  const params = sessionParams({ level: body.level, alreadyPaidCents, origin: ORIGIN, product: TIERS[body.level].sku, upgrades, fresh, kept, email });
  await createSession("sk_test_made_up_key", params, { fetchImpl: stripe.fetchImpl });
  assert.equal(stripe.sent.length, 1);
  assert.match(stripe.sent[0].url, /\/v1\/checkout\/sessions$/);
  return { form: stripe.sent[0].form, alreadyPaidCents, upgrades };
}

test("item 2: summary to chart -- Stripe's email box starts with the chart's email", async () => {
  const store = memoryStore();
  const id = await bought(store, 0);
  const { form, alreadyPaidCents } = await checkout(store, { level: 1, reading: link(id, 0), upgrade: true });
  assert.equal(form.get("customer_email"), "alex@example.com");
  assert.equal(alreadyPaidCents, TIERS[0].cents, "the credit changed");
  assert.equal(form.get("customer_creation"), "always");
});

test("item 2: chart to reading -- the same", async () => {
  const store = memoryStore();
  const id = await bought(store, 1, "sam.chart@example.com");
  const { form, alreadyPaidCents } = await checkout(store, { level: 2, reading: link(id, 1), upgrade: true });
  assert.equal(form.get("customer_email"), "sam.chart@example.com");
  assert.equal(alreadyPaidCents, TIERS[1].cents);
});

test("item 2: someone new, bought from an owned chart -- the email is filled, and nothing comes off", async () => {
  const store = memoryStore();
  const id = await bought(store, 2);
  const { form, alreadyPaidCents, upgrades } = await checkout(store, { level: 1, reading: link(id, 2), someoneNew: true });
  assert.equal(form.get("customer_email"), "alex@example.com");
  assert.equal(alreadyPaidCents, 0, "someone new was credited");
  assert.equal(upgrades, null);
  assert.equal(form.get("metadata[fresh]"), "1");
  assert.equal(form.get("metadata[upgrades]"), null);
  assert.equal(form.get("line_items[0][price_data][unit_amount]"), String(TIERS[1].cents));
});

test("item 2: a link that has grown speaks for the newest record's email", async () => {
  const store = memoryStore();
  const summary = await bought(store, 0, "old@example.com");
  const chart = await bought(store, 1, "newer@example.com");
  store.m.set(summary, { ...store.m.get(summary), grewTo: chart });
  assert.equal(await emailFor(store, { level: 2, reading: link(summary, 0), upgrade: true }), "newer@example.com");
});

test("item 2: no prefill without a readable link, or without an address on the record", async () => {
  const store = memoryStore();
  const id = await bought(store, 0);
  // A first visit: no link.
  const first = await checkout(store, { level: 1 });
  assert.equal(first.form.get("customer_email"), null);
  assert.equal(await emailFor(store, { level: 1, someoneNew: true }), null);
  // A link without the upgrade or someone-new flag (nothing sends that) is not read.
  assert.equal(await emailFor(store, { level: 1, reading: link(id, 0) }), null);
  // A link signed with another secret, or mangled.
  assert.equal(await emailFor(store, { level: 1, reading: mintReadingLink({ id, tier: 0 }, randomBytes(32).toString("hex")), upgrade: true }), null);
  assert.equal(await emailFor(store, { level: 1, reading: "not-a-link", upgrade: true }), null);
  // A record with no email, or something that is not an address.
  const none = await saveReading(store, { tier: 0, output: null, name: null, email: null, now: NOW - 1000 });
  assert.equal(await emailFor(store, { level: 1, reading: link(none, 0), upgrade: true }), null);
  const odd = await bought(store, 0, "not an address");
  assert.equal(await emailFor(store, { level: 1, reading: link(odd, 0), upgrade: true }), null);
  // A store that throws: no prefill, no error.
  const broken = { get: async () => { throw new Error("blob store down"); } };
  assert.equal(await checkoutEmail({ body: { level: 1, reading: link(id, 0), upgrade: true }, secret: SECRET, head: (x) => chainHead(broken, x, NOW), readLink: readReadingLink, now: NOW }), null);
});

test("item 2: sessionParams sets customer_email only when there is one", () => {
  assert.equal(sessionParams({ level: 1, origin: ORIGIN, email: "alex@example.com" }).customer_email, "alex@example.com");
  assert.ok(!("customer_email" in sessionParams({ level: 1, origin: ORIGIN })));
  assert.ok(!("customer_email" in sessionParams({ level: 1, origin: ORIGIN, email: null })));
});

test("item 2: the receipt and the claim still key off the Stripe session's email, not the prefill", async () => {
  const store = memoryStore();
  const summary = await bought(store, 0, "alex@example.com");
  const { upgrades } = await checkout(store, { level: 1, reading: link(summary, 0), upgrade: true });
  // The buyer changed the address on Stripe's page; Stripe's session says so.
  const id = randomBytes(16).toString("hex");
  const session = {
    payment_status: "paid",
    created: Math.floor(NOW / 1000),
    amount_total: TIERS[1].cents - TIERS[0].cents,
    customer_details: { name: "Alex Rivera", email: "alex.new@example.com" },
    metadata: { level: "1", sku: TIERS[1].sku, upgrades },
  };
  await recordPurchase({ readings: store, id, level: 1, session, secret: SECRET, now: NOW });
  const rec = await loadReading(store, id, NOW);
  assert.equal(rec.buyer.email, "alex.new@example.com");
  assert.equal(rec.grewFrom, summary);
});

test("item 2: the function and the page are wired to it", () => {
  const src = (p) => readFileSync(fileURLToPath(new URL(p, import.meta.url)), "utf8");
  const fn = src("../netlify/functions/checkout.mjs");
  assert.match(fn, /const email = await checkoutEmail\(\{ body, secret: grantSecret, head: \(id\) => chainHead\(readings, id\), readLink: readReadingLink \}\)/);
  assert.match(fn, /sessionParams\(\{ level, alreadyPaidCents, origin, product, upgrades, fresh, kept, email \}\)/);
  assert.doesNotMatch(fn, /console\.log\([^)]*\$\{email\}/, "the address is logged");
  // The page: the upgrade sends its link (as before); someone new from an owned chart sends it too.
  const purchase = src("../src/purchase.ts");
  assert.match(purchase, /how\.someoneNew \? \{ someoneNew: true, \.\.\.\(how\.reading \? \{ reading: how\.reading \} : \{\}\) \}/);
  const app = src("../src/App.tsx");
  assert.match(app, /startCheckout\(level, fresh \? \{ someoneNew: true, reading: from \} : \{\}\)/);
  assert.match(app, /<Tiers fresh from=\{token\} \/>/);
  assert.match(app, /startCheckout\(level, \{ reading: token, upgrade: true \}\)/);
});
