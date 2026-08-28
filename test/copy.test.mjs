import { test } from "node:test";
import assert from "node:assert/strict";
import { importTs } from "./support/ts.mjs";

const { PRIVACY_NOTE, PRIVACY_NOTE_PAID, privacyFor } = await importTs("src", "copy.ts");

/**
 * The privacy promise, which is the one piece of copy where being wrong is not
 * a style problem.
 */

test("the free summary keeps the strong promise, word for word", () => {
  // Not "contains" -- the exact sentence. Softening this by accident, while
  // still passing a looser check, is the failure worth guarding against.
  assert.equal(
    privacyFor(0),
    "Your birth details are used to compute the chart and then discarded. They are not stored, " +
      "not logged, and not written to disk at any point.",
  );
  assert.equal(privacyFor(0), PRIVACY_NOTE);
});

test("the paid tiers do NOT claim nothing is written to disk", () => {
  // The whole point. Once a reading is saved for delivery that claim is false,
  // and a promise that quietly survives into a case it does not cover is worse
  // than no promise.
  for (const tier of [1, 2]) {
    assert.equal(privacyFor(tier), PRIVACY_NOTE_PAID);
    assert.ok(!/not written to disk/.test(privacyFor(tier)));
    assert.ok(!/not stored/.test(privacyFor(tier)));
  }
});

test("the paid note says the reading is saved, and for how long the link lasts", () => {
  assert.match(PRIVACY_NOTE_PAID, /saved/);
  assert.match(PRIVACY_NOTE_PAID, /6 days/);
});

test("the two promises are actually different", () => {
  assert.notEqual(PRIVACY_NOTE, PRIVACY_NOTE_PAID);
});
