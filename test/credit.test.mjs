import { test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { checkoutCredit, sessionParams, upgradeCredit } from "../netlify/lib/checkout.mjs";
import { loadReading, mintReadingLink, readReadingLink, saveReading } from "../netlify/lib/reading.mjs";
import { chainHead, recordPurchase } from "../netlify/lib/charts.mjs";
import { TIERS, ladder } from "../shared/pricing.mjs";

/**
 * WHAT COMES OFF THE PRICE -- AND ONLY FOR ITS OWN CHART (release 2).
 *
 * The emailed link earns the credit (the fix for a real overcharge: Jeremy
 * upgraded from his emailed link and Stripe asked full price). Release 2 adds
 * Jeremy's rule from the returning-buyer mock: "What Alex paid stays with
 * Alex's chart". The credit applies only when the purchase upgrades THAT
 * record, and it cannot be used again -- the gap where one link took the same
 * credit off any number of purchases, for anyone, while it lived.
 *
 * "No confusion allowed involving money."
 */

const SECRET = randomBytes(32).toString("hex");
const NOW = Date.parse("2026-10-20T15:00:00Z");

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

/** A filled record at `tier`, as a past purchase leaves it. */
async function bought(store, tier, extra = {}) {
  const id = await saveReading(store, { tier, output: null, name: "Alex Rivera", email: "alex@example.com", now: NOW - 86_400_000, ...extra });
  const raw = store.m.get(id);
  store.m.set(id, { ...raw, output: OUTPUT, filledAt: Math.floor(NOW / 1000) - 80_000, birth: KEPT });
  return id;
}

const credit = (store, body, level) =>
  checkoutCredit({ body, secret: SECRET, level, head: (id) => chainHead(store, id, NOW), readLink: readReadingLink, now: NOW });

/** Stripe's session, as the claim reads it back. */
const session = (level, meta = {}) => ({
  payment_status: "paid",
  created: Math.floor(NOW / 1000),
  amount_total: 0,
  customer_details: { name: "Alex Rivera", email: "alex@example.com" },
  metadata: { level: String(level), sku: TIERS[level].sku, ...meta },
});

test("upgradeCredit: what the chart has cost so far, only for a tier above it", () => {
  assert.equal(upgradeCredit({ headTier: 0, level: 1 }), TIERS[0].cents);
  assert.equal(upgradeCredit({ headTier: 1, level: 2 }), TIERS[1].cents);
  assert.equal(upgradeCredit({ headTier: 0, level: 2 }), TIERS[0].cents);
  // Not an upgrade: nothing back.
  assert.equal(upgradeCredit({ headTier: 2, level: 2 }), 0);
  assert.equal(upgradeCredit({ headTier: 1, level: 0 }), 0);
  assert.equal(upgradeCredit({ headTier: -1, level: 2 }), 0);
  assert.equal(upgradeCredit({ headTier: null, level: 2 }), 0);
});

test("FOR ME: the emailed link earns the credit, and Stripe is told WHICH chart it grows", async () => {
  const store = memoryStore();
  const id = await bought(store, 1);
  const token = mintReadingLink({ id, tier: 1, now: NOW }, SECRET);
  const c = await credit(store, { level: 2, reading: token, upgrade: true }, 2);
  assert.equal(c.alreadyPaidCents, TIERS[1].cents);
  assert.equal(c.upgrades, id);
  const p = sessionParams({ level: 2, alreadyPaidCents: c.alreadyPaidCents, origin: "https://x", upgrades: c.upgrades });
  assert.equal(p.metadata.upgrades, id, "the chart the credit belongs to must travel with the purchase");
  assert.equal(p.line_items[0].price_data.unit_amount, TIERS[2].cents - TIERS[1].cents);
});

test("SOMEONE NEW: full price, no credit, nothing named -- even holding a link", async () => {
  const store = memoryStore();
  const id = await bought(store, 1);
  const token = mintReadingLink({ id, tier: 1, now: NOW }, SECRET);
  const c = await credit(store, { level: 2, reading: token, someoneNew: true }, 2);
  assert.deepEqual(c, { alreadyPaidCents: 0, upgrades: null, fresh: true });
  const p = sessionParams({ level: 2, alreadyPaidCents: 0, origin: "https://x", fresh: true });
  assert.equal(p.metadata.fresh, "1");
  assert.equal(p.metadata.upgrades, undefined);
  assert.equal(p.line_items[0].price_data.unit_amount, TIERS[2].cents);
});

test("A LINK SENT WITHOUT SAYING 'FOR ME' EARNS NOTHING (the old any-purchase credit is gone)", async () => {
  const store = memoryStore();
  const id = await bought(store, 1);
  const token = mintReadingLink({ id, tier: 1, now: NOW }, SECRET);
  const c = await credit(store, { level: 2, reading: token }, 2);
  assert.equal(c.alreadyPaidCents, 0);
  assert.equal(c.upgrades, null);
});

test("NOTHING PROVEN IS NOTHING CREDITED: a forged, foreign or expired link", async () => {
  const store = memoryStore();
  const id = await bought(store, 1);
  const forged = mintReadingLink({ id, tier: 1, now: NOW }, randomBytes(32).toString("hex"));
  const expired = mintReadingLink({ id, tier: 1, now: NOW - 7 * 86_400_000 }, SECRET);
  for (const reading of [forged, expired, "nonsense", undefined]) {
    const c = await credit(store, { level: 2, reading, upgrade: true }, 2);
    assert.equal(c.alreadyPaidCents, 0, `credited for ${String(reading).slice(0, 12)}`);
  }
});

test("THE CREDIT CANNOT BE USED TWICE: once the chart has grown, its old link speaks for the grown one", async () => {
  const store = memoryStore();
  const index = memoryStore();
  const summary = await bought(store, 0);
  const oldLink = mintReadingLink({ id: summary, tier: 0, now: NOW }, SECRET);

  // First upgrade: summary -> chart, credited with what the summary cost, and joined to it.
  const first = await credit(store, { level: 1, reading: oldLink, upgrade: true }, 1);
  assert.equal(first.alreadyPaidCents, TIERS[0].cents);
  const chartId = randomBytes(16).toString("hex");
  await recordPurchase({ readings: store, index, id: chartId, level: 1, session: session(1, { upgrades: first.upgrades }), secret: SECRET, now: NOW });
  assert.equal((await loadReading(store, summary, NOW)).grewTo, chartId, "the summary was not marked as grown");

  // The same old link, again, for the chart: no credit -- the chart is owned.
  const again = await credit(store, { level: 1, reading: oldLink, upgrade: true }, 1);
  assert.equal(again.alreadyPaidCents, 0, "the summary's credit came off a second chart");

  // For the reading, the old link now speaks for the CHART: its price, not the summary's twice.
  const reading = await credit(store, { level: 2, reading: oldLink, upgrade: true }, 2);
  assert.equal(reading.alreadyPaidCents, TIERS[1].cents);
  assert.equal(reading.upgrades, chartId);
});

test("EVERY ROUTE TO THE TOP STILL COSTS THE SAME (D-6), through the real credit path", async () => {
  const top = TIERS[TIERS.length - 1].cents;
  // Summary -> chart -> reading, each step credited from the chart it grows.
  const store = memoryStore();
  let id = await bought(store, 0);
  let paid = TIERS[0].cents;
  for (const level of [1, 2]) {
    const link = mintReadingLink({ id, tier: (await loadReading(store, id, NOW)).tier, now: NOW }, SECRET);
    const c = await credit(store, { level, reading: link, upgrade: true }, level);
    paid += TIERS[level].cents - c.alreadyPaidCents;
    const next = randomBytes(16).toString("hex");
    await recordPurchase({ readings: store, id: next, level, session: session(level, { upgrades: c.upgrades }), secret: SECRET, now: NOW });
    // Filled, so the next step reads it as the chart it grew into.
    store.m.set(next, { ...store.m.get(next), output: OUTPUT, filledAt: Math.floor(NOW / 1000) });
    id = next;
  }
  assert.equal(paid, top, "the ladder does not total the top price");

  // Summary straight to the reading.
  const s2 = memoryStore();
  const sum = await bought(s2, 0);
  const jump = await credit(s2, { level: 2, reading: mintReadingLink({ id: sum, tier: 0, now: NOW }, SECRET), upgrade: true }, 2);
  assert.equal(TIERS[0].cents + TIERS[2].cents - jump.alreadyPaidCents, top);
});

test("the credit reaches Stripe as a smaller amount, not as a note", () => {
  const full = sessionParams({ level: 2, alreadyPaidCents: 0, origin: "https://x" });
  const credited = sessionParams({ level: 2, alreadyPaidCents: upgradeCredit({ headTier: 1, level: 2 }), origin: "https://x" });
  const amount = (p) => p.line_items[0].price_data.unit_amount;
  assert.equal(amount(full), TIERS[2].cents);
  assert.equal(amount(credited), TIERS[2].cents - TIERS[1].cents);
  assert.ok(amount(credited) > 0, "a credited price must still be a payment");
});

test("an `upgrades` id rides only WITH a credit -- never alone", () => {
  const id = randomBytes(16).toString("hex");
  assert.equal(sessionParams({ level: 2, alreadyPaidCents: 0, origin: "https://x", upgrades: id }).metadata.upgrades, undefined);
  assert.equal(sessionParams({ level: 2, alreadyPaidCents: 111, origin: "https://x", upgrades: "not-an-id" }).metadata.upgrades, undefined);
});

test("the ladder table and the credit function agree", () => {
  ladder().forEach((row, level) => {
    assert.equal(row.tier.cents - upgradeCredit({ headTier: level - 1, level }), row.due, `tier ${level} disagrees with the ladder`);
  });
});
