import { test } from "node:test";
import assert from "node:assert/strict";
import { importTs } from "./support/ts.mjs";

const { PRIVACY_NOTE, privacyFor } = await importTs("src", "copy.ts");

/**
 * The privacy promise, which is the one piece of copy where being wrong is not
 * a style problem.
 *
 * RELEASE 2 (Jeremy 10/19: "capture birth details even for summary"): ONE
 * sentence for every tier. The summary's old promise -- "used to compute the
 * chart and then discarded... not stored, not logged" -- is false now, and a
 * promise that quietly survives into a case it no longer covers is worse than
 * none.
 */

test("one privacy sentence for every tier, word for word", () => {
  assert.equal(
    PRIVACY_NOTE,
    // Q4 (Jeremy 11/16, accepted): the same promise in two short sentences.
    "These details stay with your chart for a year, so you never type them again. Your email link always brings you back.",
  );
  for (const tier of [0, 1, 2]) assert.equal(privacyFor(tier), PRIVACY_NOTE);
});

test("NO TIER still claims its details are discarded", () => {
  for (const tier of [0, 1, 2]) {
    assert.doesNotMatch(privacyFor(tier), /discarded|not stored|not logged|not written to disk/);
  }
});

test("it says what is kept and for how long, without the 6 days (fixes 15B + 17A)", () => {
  assert.match(PRIVACY_NOTE, /^These details stay with your chart/);
  assert.match(PRIVACY_NOTE, /for a year/);
  assert.doesNotMatch(PRIVACY_NOTE, /6 days|six days/);
});

test("nothing on the birth form still offers the retired promise", async () => {
  const { readFileSync } = await import("node:fs");
  const form = readFileSync(new URL("../src/entry/EntryForm.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(form, /privacyFor\(tier\)/, "the form still chooses a promise by tier");
  assert.match(form, /PRIVACY_NOTE/);
});
