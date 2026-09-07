import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DISCLAIMER,
  HEADINGS,
  SUMMARY_KEYS,
  centreCountProblem,
  centreStateProblem,
} from "../netlify/lib/interpretation.mjs";

/**
 * ROUND THREE: THE AUDIT ATTACKED MY FIXES AND WON.
 *
 * Two of the round-two fixes were wrong in production, and both were found by
 * running them against readings that had ALREADY BEEN DELIVERED rather than
 * against examples I invented. Measured there, the chain refused ten of
 * fourteen real readings and six of those refusals were false.
 *
 * Every string below is the reviewer's, verbatim.
 */

const S5 = "What you take in from others";

function reading(overrides = {}) {
  const filler = "word ".repeat(70).trim();
  const parts = ["IN SHORT", "", ...SUMMARY_KEYS.map((k) => `${k}: ${k} value.`), ""];
  for (const h of HEADINGS) parts.push(h, "", overrides[h] ?? filler, "", filler, "");
  parts.push(DISCLAIMER);
  return parts.join("\n");
}

/* --------------------------------------------------- R-01: negation */

// Test Wone's chart: Heart open, Ajna undefined, Head open.
const WONE = { defined: ["Throat", "Sacral", "G"], und: ["Ajna"], open: ["Heart", "Head"] };

test("R-01: a sentence that mentions a state is not always claiming it", () => {
  for (const prose of [
    "Yours is not a defined Heart centre, and that difference matters.",
    "Rather than a defined Heart, you carry a white one that takes the room in.",
    "Without a defined Heart centre, willpower is not a constant you own.",
    "This is never a defined Heart in the mechanical sense.",
    "There is no defined Head centre anywhere on this chart.",
    "Unlike a defined Heart, yours amplifies what the room is already doing.",
    "You have neither defined Head nor defined Ajna, so pressure passes through.",
    "Someone with a defined Heart will push to prove their worth; you will not.",
    "If you had a defined Ajna, certainty would be fixed rather than borrowed.",
  ]) {
    assert.equal(
      centreStateProblem(reading({ [S5]: prose }), WONE.defined, WONE.und, WONE.open),
      null,
      prose,
    );
  }
});

test("R-01: the wrong fact it was written for is still caught", () => {
  // bac485bd, delivered 3 September with Heart undefined.
  const prose = "Your defined Heart center contributes a consistent thread of willpower.";
  assert.match(
    centreStateProblem(reading({ "What is consistently yours": prose }), ["Sacral"], ["Heart"], ["Head"]),
    /calls the Heart centre "defined", but on this chart it is undefined/,
  );
});

/* ------------------------------------------- R-02: the fixed window */

test("R-02: the negation may sit further out than any fixed window", () => {
  const zeroUnd = { defined: ["Throat", "Sacral", "G", "Ajna", "Heart", "Spleen", "Root"], und: [], open: ["Head", "Solar Plexus"] };
  for (const prose of [
    // 43 characters out -- past the old 40-character lookback.
    "Not one of the nine energy centres drawn on your bodygraph is undefined at all.",
    "Across the whole of the drawing there is no place where your chart is undefined.",
  ]) {
    assert.equal(
      centreStateProblem(reading({ [S5]: prose }), zeroUnd.defined, zeroUnd.und, zeroUnd.open),
      null,
      prose,
    );
  }
});

test("R-02: a real claim on a zero-undefined chart is still refused", () => {
  const prose = "Your undefined spaces are where other people's weather arrives.";
  assert.match(
    centreStateProblem(reading({ [S5]: prose }), ["Throat", "Sacral"], [], ["Head"]),
    /but this chart has none/,
  );
});

/* ------------------------------- R-06: the limit was keyed to the wrong list */

test("R-06: section 5 counts the WHITE centres, undefined and open together", () => {
  // 41158805, a delivered Manifesting Generator: 0 undefined, 7 open.
  const prose =
    "Because your Head, Ajna, G, Heart, Spleen, Solar Plexus, and Root centres are all open, you take the room in whole.";
  assert.equal(
    centreCountProblem(reading({ [S5]: prose }), [], ["Head", "Ajna", "G", "Heart", "Spleen", "Solar Plexus", "Root"]),
    null,
  );
});

test("R-06: the Reflector this rule was built for still passes", () => {
  const seven = ["Head", "Ajna", "Throat", "Heart", "Sacral", "Spleen", "Root"];
  const prose =
    "Your undefined Head, Ajna, Throat, Heart, Sacral, Spleen and Root each take in what the room is carrying.";
  assert.equal(centreCountProblem(reading({ [S5]: prose }), seven, ["G", "Solar Plexus"]), null);
});

test("R-06: a defined-heavy chart is still held to four", () => {
  const prose = "Your Head, Ajna, Throat, Heart and Sacral all take in the room at once.";
  assert.match(
    centreCountProblem(reading({ [S5]: prose }), ["Heart"], ["Head"]),
    /names 5 centres in one sentence \(the limit is 4\)/,
  );
});

test("R-06: padding OUTSIDE section 5 is still refused at four", () => {
  const seven = ["Head", "Ajna", "Throat", "Heart", "Sacral", "Spleen", "Root"];
  const prose = "Your Head, Ajna, Throat, Heart, Sacral, Spleen and Root all move together here.";
  assert.match(
    centreCountProblem(reading({ "When it is working, and when it is not": prose }), seven, []),
    /names 7 centres in one sentence \(the limit is 4\)/,
  );
});
