import { test } from "node:test";
import assert from "node:assert/strict";
import { importTs } from "./support/ts.mjs";

/**
 * Jeremy's calls on the GO PDF (10/23), round 2 of release-1022:
 *   - "credit idea? - Good, be consistent": the price page says the credit
 *     idea once, not twice.
 */

const copy = await importTs("src", "copy.ts");

/* ------------------------------------------------------------ credit once */

test("CREDIT ONCE: the price page says the credit idea in one place, under the cards", () => {
  const { TIERS_INTRO, LADDER_NOTE } = copy;
  // The line above the cards is the price, said plainly; the credit lives in the note under them.
  assert.equal(TIERS_INTRO.body, "The price is here before anything is asked of you.");
  assert.equal(
    LADDER_NOTE,
    "Straight to the reading, or a step at a time — the total is identical either way. " +
      "What you have already paid goes toward whatever you choose next, so nobody pays twice for the same thing.",
  );
  const page = `${TIERS_INTRO.lead}\n${TIERS_INTRO.title}\n${TIERS_INTRO.body}\n${LADDER_NOTE}`;
  const count = (re) => (page.match(re) ?? []).length;
  assert.equal(count(/the total is identical/g), 1);
  assert.equal(count(/costs the same/g), 0, "the same total, said a second way");
  assert.equal(count(/comes off|goes toward/g), 1, "what you paid counts toward the next step, said more than once");
  assert.equal(count(/pays twice/g), 1);
});
