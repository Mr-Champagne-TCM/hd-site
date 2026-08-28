import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { SELLABLE_MAX_LEVEL, sellable } from "../shared/availability.mjs";
import { TIERS } from "../shared/pricing.mjs";
import { sessionParams } from "../netlify/lib/checkout.mjs";

/**
 * The ceiling on what can be sold.
 *
 * These guard the one failure with no cheap apology: taking money for something
 * that cannot be handed over.
 */

test("the summary and the chart are sellable; the reading is not", () => {
  assert.equal(sellable(0), true);
  // Raised 2026-08-28. The chart tier promises "a page you can share and a PDF
  // you keep" and both now exist: /r/<token> renders the drawing, /api/pdf
  // builds it from the same SVG with the font embedded.
  assert.equal(sellable(1), true);
  assert.equal(sellable(2), false, "the reading still has no interpretation");
});

test("THE THING THAT MAKES THE CHART SELLABLE ACTUALLY EXISTS", () => {
  // The ceiling is a promise about deliverability, so it is worth checking
  // against the deliverable rather than against itself. If the PDF builder or
  // its fonts ever go missing, this fails before somebody pays for a download
  // that 404s.
  const here = new URL("../", import.meta.url);
  for (const f of [
    "netlify/lib/readingPdf.mjs",
    "netlify/functions/pdf.mjs",
    "netlify/lib/fonts/Outfit-400.ttf",
    "netlify/lib/fonts/Outfit-600.ttf",
  ]) {
    assert.ok(existsSync(new URL(f, here)), `${f} is missing, so tier 1 is not deliverable`);
  }
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
  // A regression guard with a purpose, and it did its job: raising the ceiling
  // to 1 failed this test, which is how the change got made deliberately
  // rather than the ceiling being quietly bypassed somewhere else. It should
  // fail again when the interpretation lands and this becomes 2.
  assert.equal(SELLABLE_MAX_LEVEL, 1);
  for (let level = 0; level < TIERS.length; level += 1) {
    assert.equal(sellable(level), level <= SELLABLE_MAX_LEVEL);
  }
});
