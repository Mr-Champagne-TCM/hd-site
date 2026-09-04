import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DISCLAIMER,
  HEADINGS,
  SUMMARY_KEYS,
  centreCountProblem,
  centreStateProblem,
  firstProblem,
  openCentreProblem,
  typeProblem,
  typeWordProblem,
} from "../netlify/lib/interpretation.mjs";

/**
 * ROUND TWO OF THE THREE-STATE AUDIT.
 *
 * Seventeen findings were raised on 3 September and six of them were shipped
 * against and NOT closed -- a rule was written each time that caught the
 * example in the finding and missed the class the example came from. The
 * strings below are the reviewer's own counter-examples, verbatim, so the
 * repros become the regression suite rather than a note in a report.
 *
 * Every phrasing here was confirmed to pass the shipped rule before the fix.
 */

const CHART = {
  type: "Generator",
  profile: "1/3",
  definedCenters: ["Throat", "Sacral", "G", "Spleen", "Root", "Ajna"],
  undefinedCenters: ["Heart"],
  openCenters: ["Head", "Solar Plexus"],
};

const S5 = "What you take in from others";

/** A structurally sound reading, with named sections replaced. */
function reading(overrides = {}, { type = "Generator" } = {}) {
  const filler = "word ".repeat(70).trim();
  const parts = ["IN SHORT", "", ...SUMMARY_KEYS.map((k) => `${k}: ${k} value.`), ""];
  for (const h of HEADINGS) {
    parts.push(h, "", overrides[h] ?? filler, "", filler, "");
  }
  parts.push(DISCLAIMER);
  return parts.join("\n");
}

// Profile is passed as null: the fixture has no "Your profile lines" list, and
// profileLineProblem would otherwise answer first and mask what is under test.
const check = (text, chart = CHART) =>
  firstProblem(text, chart.type, null, chart.openCenters, chart.undefinedCenters, chart.definedCenters);

/* ------------------------------------------------------------------ F38 */

test("F38: the bare word 'open' no longer stands in for naming a centre", () => {
  // All three passed the shipped rule. The third is the one that matters --
  // good readings genuinely write it.
  for (const prose of [
    "You are open to feedback and it changes how a room lands on you.",
    "Life keeps pushing open doors in front of you, one after another.",
    "Because it is undefined rather than open, the quality is different here.",
  ]) {
    const problem = openCentreProblem(reading({ [S5]: prose }), CHART.openCenters, CHART.undefinedCenters);
    assert.ok(problem, `"${prose}" was accepted without naming a centre`);
    assert.match(problem, /never names one of this chart's 2 open centres/);
  }
});

test("F38: naming an open centre still passes", () => {
  const prose = "Your open Head centre takes in the questions other people are carrying, and your Heart is undefined besides.";
  assert.equal(openCentreProblem(reading({ [S5]: prose }), CHART.openCenters, CHART.undefinedCenters), null);
});

test("F38: the undefined branch runs at all, which it never did in production", () => {
  // firstProblem used to pass four arguments to a five-argument function, so
  // undefinedCenters arrived undefined and this half was dead code.
  const prose = "Your open Head and open Solar Plexus amplify whatever the room is carrying.";
  const problem = check(reading({ [S5]: prose }));
  assert.ok(problem, "a section naming no undefined centre was accepted");
  assert.match(problem, /never names one of this chart's 1 undefined centres \(Heart\)/);
});

/* ------------------------------------------------------------------ F45 */

test("F45: the six phrasings that still reached Generators are refused", () => {
  for (const prose of [
    "You need recognition and an invitation before the work opens up.",
    "Something in you asks to be invited before it will move.",
    "Sit tight for the invitation and the right door opens.",
    "Bide your time until invited, and the work finds you.",
    "Let the invitation come to you rather than forcing the door.",
    "The invitation must come first, and everything follows from it.",
  ]) {
    const problem = typeProblem(reading({ [S5]: prose }), "Generator");
    assert.ok(problem, `"${prose}" reached a Generator`);
    assert.match(problem, /Projector strategy/);
  }
});

test("F45: the two phrasings that reached delivered readings are refused", () => {
  for (const prose of [
    "Your Sacral will signal whether an invitation belongs to you.",
    "The Sacral requires an external invitation or encounter to spark into motion.",
  ]) {
    assert.match(typeProblem(reading({ [S5]: prose }), "Generator"), /Projector strategy/);
  }
});

test("F45: the phrasings that MUST pass still do", () => {
  // The prompt asks every reading to open its takeaways this way, and the Line
  // 2 sentence is correct prose -- there the invitation is what acts.
  for (const prose of [
    "These are invitations to test against your own experience, not instructions.",
    "Natural talent sits quietly in you until the right invitation draws you out.",
  ]) {
    assert.equal(typeProblem(reading({ [S5]: prose }), "Generator"), null, prose);
  }
});

test("F45: a Projector may still be told its own strategy", () => {
  const prose = "Sit tight for the invitation; recognition is what opens the work.";
  assert.equal(typeProblem(reading({ [S5]: prose }), "Projector"), null);
});

/* ------------------------------------------------------------------ F43 */

test("F43: the not-self line is found however it is spelled", () => {
  // Every spelling carries the PROJECTOR's word on a GENERATOR's reading, so a
  // matcher that cannot find the line fails open on the check that matters.
  for (const line of [
    "Not-self: Bitterness",
    "Not-Self: Bitterness",
    "Not self: Bitterness",
    "Not-Self Theme: Bitterness",
    "Not-self — Bitterness",
    "Not-self - Bitterness",
    "Not-self – Bitterness",
    "Not-self Bitterness",
    "Not-Self Theme Bitterness",
  ]) {
    const problem = typeWordProblem(`IN SHORT\n\n${line}\n`, "Generator");
    assert.ok(problem, `"${line}" was not recognised as the not-self line`);
    assert.match(problem, /belongs to another type/);
  }
});

test("F43: the chart's own word on the same line is accepted", () => {
  assert.equal(typeWordProblem("IN SHORT\n\nNot-self — Frustration\n", "Generator"), null);
});

test("F43: prose that merely opens with 'Not self' is not read as a label", () => {
  // The no-separator spelling is only accepted when the value is ONE word.
  assert.equal(
    typeWordProblem("Not self aware people carry bitterness they never name out loud.\n", "Generator"),
    null,
  );
});

/* ------------------------------------------------------------------ F44 */

test("F44: a Reflector may name all seven undefined centres in section 5", () => {
  const seven = ["Head", "Ajna", "Throat", "Heart", "Sacral", "Spleen", "Root"];
  const prose =
    "Your undefined Head, Ajna, Throat, Heart, Sacral, Spleen and Root each take in what the room is carrying.";
  assert.equal(centreCountProblem(reading({ [S5]: prose }), seven), null);
});

test("F44: seven centres OUTSIDE section 5 are still refused", () => {
  const seven = ["Head", "Ajna", "Throat", "Heart", "Sacral", "Spleen", "Root"];
  const prose =
    "Your Head, Ajna, Throat, Heart, Sacral, Spleen and Root all move together here.";
  const problem = centreCountProblem(reading({ "When it is working, and when it is not": prose }), seven);
  assert.match(problem, /names 7 centres in one sentence \(the limit is 4\)/);
});

test("F44: the anti-padding rule still holds for a chart with few undefined", () => {
  const prose = "Your Head, Ajna, Throat, Heart and Sacral all take in the room at once.";
  const problem = centreCountProblem(reading({ [S5]: prose }), ["Heart"]);
  assert.match(problem, /names 5 centres in one sentence \(the limit is 4\)/);
});

/* ------------------------------------------------------- N-01 and N-04 */

test("N-01: a reading may not call an undefined centre defined", () => {
  const prose = "Your defined Heart center contributes a consistent thread of willpower.";
  const problem = centreStateProblem(
    reading({ "What is consistently yours": prose }),
    CHART.definedCenters,
    CHART.undefinedCenters,
    CHART.openCenters,
  );
  assert.match(problem, /calls the Heart centre "defined", but on this chart it is undefined/);
});

test("N-01: the predicate form is caught too, and it is caught anywhere", () => {
  const prose = "The Heart center is defined, so willpower is constant for you.";
  const problem = centreStateProblem(
    reading({ "Your energy, and how it starts": prose }),
    CHART.definedCenters,
    CHART.undefinedCenters,
    CHART.openCenters,
  );
  assert.match(problem, /calls the Heart centre "defined"/);
});

test("N-01: truthful prose about the same centres passes", () => {
  const prose = "Your defined Sacral carries the work, and the Heart is undefined beside it.";
  assert.equal(
    centreStateProblem(
      reading({ "What is consistently yours": prose }),
      CHART.definedCenters,
      CHART.undefinedCenters,
      CHART.openCenters,
    ),
    null,
  );
});

test("N-01: open and undefined are not held against each other", () => {
  // Both are white on the drawing; only the defined/not-defined confusion
  // misinforms, and refusing the looser word would cost the buyer a retry.
  const prose = "Your open Heart takes in the willpower around you.";
  assert.equal(
    centreStateProblem(
      reading({ [S5]: prose }),
      CHART.definedCenters,
      CHART.undefinedCenters,
      CHART.openCenters,
    ),
    null,
  );
});

test("N-04: a chart with nothing undefined is not told about its undefined spaces", () => {
  const prose = "Your undefined spaces are where other people's weather arrives.";
  const problem = centreStateProblem(
    reading({ [S5]: prose }),
    ["Throat", "Sacral", "G", "Spleen", "Root", "Ajna", "Heart"],
    [],
    ["Head", "Solar Plexus"],
  );
  assert.match(problem, /but this chart has none/);
});

test("N-04: explaining the word is still allowed", () => {
  const prose = "A centre that is undefined carries gates without a full channel; none of yours is.";
  assert.equal(
    centreStateProblem(
      reading({ [S5]: prose }),
      ["Throat", "Sacral", "G", "Spleen", "Root", "Ajna", "Heart"],
      [],
      ["Head", "Solar Plexus"],
    ),
    null,
  );
});

/* ------------------------------------------------------------- the copy */

test("the accuracy caption claims only what the validation record supports", async () => {
  const { CREDIBILITY } = await import("../test/support/copy.mjs").catch(() => ({}));
  if (!CREDIBILITY) return; // copy.test.mjs owns the compiled-TypeScript path
  const all = CREDIBILITY.checks.map((c) => c[1]).join(" ");
  assert.ok(!/none of them decides a line/.test(all), "the refuted clause is back");
  assert.match(all, /as far as I can find/i);
});
