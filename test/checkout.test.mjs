import { test } from "node:test";
import assert from "node:assert/strict";
import { sessionParams, formEncode, paidLevel, tierAt } from "../netlify/lib/checkout.mjs";
import { SUMMARY, CHART, READING } from "../shared/pricing.mjs";

/**
 * The checkout parameters, tested as arithmetic rather than as a network call.
 * What matters here is that the number charged is the number printed.
 */

test("the amount charged matches the ladder, at every tier", () => {
  assert.equal(sessionParams({ level: 0, origin: "https://x" }).line_items[0].price_data.unit_amount, 111);
  assert.equal(sessionParams({ level: 1, origin: "https://x" }).line_items[0].price_data.unit_amount, 1111);
  assert.equal(sessionParams({ level: 2, origin: "https://x" }).line_items[0].price_data.unit_amount, 4444);
});

test("what was already paid comes off, and every route totals the same", () => {
  const summary = sessionParams({ level: 0, origin: "https://x" }).line_items[0].price_data.unit_amount;
  const chart = sessionParams({ level: 1, alreadyPaidCents: SUMMARY.cents, origin: "https://x" })
    .line_items[0].price_data.unit_amount;
  const reading = sessionParams({ level: 2, alreadyPaidCents: CHART.cents, origin: "https://x" })
    .line_items[0].price_data.unit_amount;

  assert.equal(chart, CHART.cents - SUMMARY.cents, "the chart costs less once the summary is paid");
  assert.equal(reading, READING.cents - CHART.cents, "the reading costs less once the chart is paid");
  // Jeremy's rule, asserted rather than trusted.
  assert.equal(summary + chart + reading, READING.cents);
});

test("a tier that does not exist is refused rather than priced", () => {
  for (const bad of [-1, 3, 1.5, "0", null, undefined]) {
    assert.equal(tierAt(bad), null);
    assert.throws(() => sessionParams({ level: bad, origin: "https://x" }), /no tier/);
  }
});

test("discount codes are accepted on Stripe's page, not ours", () => {
  assert.equal(sessionParams({ level: 0, origin: "https://x" }).allow_promotion_codes, true);
});

test("the tier travels in metadata, set server-side with the price", () => {
  const p = sessionParams({ level: 2, origin: "https://x" });
  assert.equal(p.metadata.level, "2");
  assert.equal(p.metadata.sku, "hd_reading");
});

test("form encoding nests the way Stripe expects", () => {
  const pairs = formEncode({ a: 1, b: { c: "d" }, e: [{ f: 2 }] });
  const flat = Object.fromEntries(pairs);
  assert.equal(flat["a"], "1");
  assert.equal(flat["b[c]"], "d");
  assert.equal(flat["e[0][f]"], "2");
});

/* ---------------------------------------------------------------------- */
/* Reading a session back                                                  */
/* ---------------------------------------------------------------------- */

test("only a PAID session yields a tier", () => {
  assert.equal(paidLevel({ payment_status: "paid", metadata: { level: "1" } }), 1);
  assert.equal(paidLevel({ payment_status: "unpaid", metadata: { level: "1" } }), null);
  assert.equal(paidLevel({ payment_status: "no_payment_required", metadata: { level: "1" } }), null);
  // `status: complete` is NOT the field that matters -- a session can be
  // complete while the payment is still processing.
  assert.equal(paidLevel({ status: "complete", metadata: { level: "2" } }), null);
});

test("a session with a nonsense tier yields nothing", () => {
  for (const bad of ["9", "-1", "abc", undefined]) {
    assert.equal(paidLevel({ payment_status: "paid", metadata: { level: bad } }), null);
  }
  assert.equal(paidLevel(null), null);
  assert.equal(paidLevel({}), null);
});

test("a 100%-off session still counts as paid", () => {
  // The whole point of routing free codes through Stripe: the free path and the
  // paid path are the same path, so testing one tests the other.
  assert.equal(paidLevel({ payment_status: "paid", amount_total: 0, metadata: { level: "2" } }), 2);
});
