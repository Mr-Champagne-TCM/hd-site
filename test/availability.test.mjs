import { test } from "node:test";
import assert from "node:assert/strict";
import { SELLABLE_MAX_LEVEL, sellable } from "../shared/availability.mjs";
import { TIERS } from "../shared/pricing.mjs";
import { sessionParams } from "../netlify/lib/checkout.mjs";

/**
 * The ceiling on what can be sold.
 *
 * These guard the one failure with no cheap apology: taking money for something
 * that cannot be handed over.
 */

test("only the summary is sellable today", () => {
  assert.equal(sellable(0), true);
  assert.equal(sellable(1), false, "the chart has no drawing yet");
  assert.equal(sellable(2), false, "the reading has no interpretation yet");
});

test("nonsense levels are not sellable", () => {
  for (const bad of [-1, 1.5, "0", null, undefined, NaN, 99]) {
    assert.equal(sellable(bad), false);
  }
});

test("the unsellable tiers still exist and still have prices", () => {
  // The point of a ceiling rather than a deletion: the tiers are real, priced
  // and shown. They are only withheld from PURCHASE, and raising the ceiling
  // must not require rebuilding them.
  assert.equal(TIERS.length, 3);
  for (let level = 0; level < TIERS.length; level += 1) {
    assert.ok(TIERS[level].cents > 0);
    // Pricing a tier still works even while it cannot be bought, so turning it
    // on later is one constant and not a hunt.
    assert.ok(sessionParams({ level, origin: "https://x" }).line_items[0].price_data.unit_amount > 0);
  }
});

test("the ceiling is a number that can be raised, not a special case", () => {
  // A regression guard with a purpose: when the bodygraph lands and this
  // becomes 1, this test should fail and be updated deliberately -- rather
  // than the ceiling being quietly bypassed somewhere else.
  assert.equal(SELLABLE_MAX_LEVEL, 0);
  for (let level = 0; level < TIERS.length; level += 1) {
    assert.equal(sellable(level), level <= SELLABLE_MAX_LEVEL);
  }
});
