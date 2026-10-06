import { test } from "node:test";
import assert from "node:assert/strict";
import { S5, check, reading, whiteCentres } from "./support/chain.mjs";

/**
 * ROUND THREE: THE AUDIT ATTACKED MY FIXES AND WON.
 *
 * Two of the round-two fixes were wrong in production, and both were found by
 * running them against readings that had ALREADY BEEN DELIVERED rather than
 * against examples I invented. Measured there, the chain refused ten of
 * fourteen real readings and six of those refusals were false.
 *
 * Every string below is the reviewer's, verbatim.
 *
 * THROUGH `firstProblem` (approved 9/9): these called `centreStateProblem` and
 * `centreCountProblem` directly, which is how the round-four auditor reported
 * four refusals that were his own harness. See support/chain.mjs.
 */

/** Section 5 carrying `prose` AND the chart's white centres, so only `prose` is judged. */
const inS5 = (prose, chart) => ({ [S5]: `${prose} ${whiteCentres(chart)}` });

/* --------------------------------------------------- R-01: negation */

// Test Wone's chart: Heart open, Ajna undefined, Head open.
const WONE = {
  type: "Generator",
  definedCenters: ["Throat", "Sacral", "G", "Spleen", "Root", "Solar Plexus"],
  undefinedCenters: ["Ajna"],
  openCenters: ["Heart", "Head"],
};

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
    assert.equal(check(reading(WONE, inS5(prose, WONE)), WONE), null, prose);
  }
});

test("R-01: the wrong fact it was written for is still caught", () => {
  // bac485bd, delivered 3 September with Heart undefined.
  const chart = { type: "Generator", definedCenters: ["Sacral"], undefinedCenters: ["Heart"], openCenters: ["Head"] };
  const prose = "Your defined Heart center contributes a consistent thread of willpower.";
  assert.match(
    check(reading(chart, { "What is consistently yours": prose }), chart),
    /calls the Heart center "defined", but on this chart it is undefined/,
  );
});

/* ------------------------------------------- R-02: the fixed window */

const ZERO_UND = {
  type: "Generator",
  definedCenters: ["Throat", "Sacral", "G", "Ajna", "Heart", "Spleen", "Root"],
  undefinedCenters: [],
  openCenters: ["Head", "Solar Plexus"],
};

test("R-02: the negation may sit further out than any fixed window", () => {
  for (const prose of [
    // 43 characters out -- past the old 40-character lookback.
    "Not one of the nine energy centres drawn on your bodygraph is undefined at all.",
    "Across the whole of the drawing there is no place where your chart is undefined.",
  ]) {
    assert.equal(check(reading(ZERO_UND, inS5(prose, ZERO_UND)), ZERO_UND), null, prose);
  }
});

test("R-02: a real claim on a zero-undefined chart is still refused", () => {
  const prose = "Your undefined spaces are where other people's weather arrives.";
  assert.match(check(reading(ZERO_UND, inS5(prose, ZERO_UND)), ZERO_UND), /but this chart has none/);
});

/* ------------------------------- R-06: the limit was keyed to the wrong list */

test("R-06: section 5 counts the WHITE centres, undefined and open together", () => {
  // 41158805, a delivered Manifesting Generator: 0 undefined, 7 open.
  const chart = {
    type: "Manifesting Generator",
    definedCenters: ["Throat", "Sacral"],
    undefinedCenters: [],
    openCenters: ["Head", "Ajna", "G", "Heart", "Spleen", "Solar Plexus", "Root"],
  };
  const prose =
    "Because your Head, Ajna, G, Heart, Spleen, Solar Plexus, and Root centres are all open, you take the room in whole.";
  assert.equal(check(reading(chart, { [S5]: prose }), chart), null);
});

const SEVEN = ["Head", "Ajna", "Throat", "Heart", "Sacral", "Spleen", "Root"];

test("R-06: the Reflector this rule was built for still passes", () => {
  const chart = { type: "Reflector", definedCenters: [], undefinedCenters: SEVEN, openCenters: ["G", "Solar Plexus"] };
  const prose =
    "Your undefined Head, Ajna, Throat, Heart, Sacral, Spleen and Root each take in what the room is carrying.";
  assert.equal(check(reading(chart, inS5(prose, chart)), chart), null);
});

test("R-06: a defined-heavy chart is still held to four", () => {
  const chart = {
    type: "Generator",
    definedCenters: ["Ajna", "Throat", "G", "Sacral", "Spleen", "Solar Plexus", "Root"],
    undefinedCenters: ["Heart"],
    openCenters: ["Head"],
  };
  const prose = "Your Head, Ajna, Throat, Heart and Sacral all take in the room at once.";
  assert.match(
    check(reading(chart, { [S5]: prose }), chart),
    /names 5 centers in one sentence \(the limit is 4\)/,
  );
});

test("R-06: padding OUTSIDE section 5 is still refused at four", () => {
  const chart = { type: "Reflector", definedCenters: [], undefinedCenters: SEVEN, openCenters: ["G", "Solar Plexus"] };
  const prose = "Your Head, Ajna, Throat, Heart, Sacral, Spleen and Root all move together here.";
  assert.match(
    check(reading(chart, { "When it's on track, and when it's off track": prose }), chart),
    /names 7 centers in one sentence \(the limit is 4\)/,
  );
});

/* ------------------------------------------- US spelling (10/5) */

test("US SPELLING: both 'center' and 'centre' are judged the same, so stored readings still pass", () => {
  const chart = { type: "Generator", definedCenters: ["Sacral"], undefinedCenters: ["Heart"], openCenters: ["Head"] };
  for (const word of ["center", "centre"]) {
    assert.match(
      check(reading(chart, { "What is consistently yours": `Your Heart ${word} is defined.` }), chart),
      /calls the Heart center "defined"/,
      word,
    );
    assert.equal(
      check(reading(chart, { "What is consistently yours": `Your Sacral ${word} is defined.` }), chart),
      null,
      word,
    );
  }
});
