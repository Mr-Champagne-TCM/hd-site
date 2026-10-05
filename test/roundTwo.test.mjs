import { test } from "node:test";
import assert from "node:assert/strict";
import { typeWordProblem } from "../netlify/lib/interpretation.mjs";
import { S5, check, reading as build, whiteCentres } from "./support/chain.mjs";

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
 *
 * THROUGH `firstProblem`, NOT THE VALIDATOR UNDER TEST (approved 9/9). These
 * used to call `openCentreProblem`, `typeProblem` and `centreStateProblem`
 * directly -- the very habit that hid F38's dead branch. See support/chain.mjs.
 */

const CHART = {
  type: "Generator",
  profile: "1/3",
  definedCenters: ["Throat", "Sacral", "G", "Spleen", "Root", "Ajna"],
  undefinedCenters: ["Heart"],
  openCenters: ["Head", "Solar Plexus"],
};

/** A structurally sound reading for CHART, with named sections replaced. */
const reading = (overrides = {}, chart = CHART) => build(chart, overrides);

/** Section 5 carrying `prose` AND the chart's white centres, so only `prose` is judged. */
const inS5 = (prose, chart = CHART) => ({ [S5]: `${prose} ${whiteCentres(chart)}` });

const ENERGY = "Your energy, and how it starts";

/* ------------------------------------------------------------------ F38 */

test("F38: the bare word 'open' no longer stands in for naming a centre", () => {
  // All three passed the shipped rule. The third is the one that matters --
  // good readings genuinely write it.
  for (const prose of [
    "You are open to feedback and it changes how a room lands on you.",
    "Life keeps pushing open doors in front of you, one after another.",
    "Because it is undefined rather than open, the quality is different here.",
  ]) {
    const problem = check(reading({ [S5]: prose }), CHART);
    assert.ok(problem, `"${prose}" was accepted without naming a centre`);
    assert.match(problem, /never names one of this chart's 2 open centers/);
  }
});

test("F38: naming an open centre still passes", () => {
  const prose = "Your open Head centre takes in the questions other people are carrying, and your Heart is undefined besides.";
  assert.equal(check(reading({ [S5]: prose }), CHART), null);
});

test("F38: the undefined branch runs at all, which it never did in production", () => {
  // firstProblem used to pass four arguments to a five-argument function, so
  // undefinedCenters arrived undefined and this half was dead code.
  const prose = "Your open Head and open Solar Plexus amplify whatever the room is carrying.";
  const problem = check(reading({ [S5]: prose }), CHART);
  assert.ok(problem, "a section naming no undefined centre was accepted");
  assert.match(problem, /never names one of this chart's 1 undefined centers \(Heart\)/);
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
    const problem = check(reading({ [ENERGY]: prose }), CHART);
    assert.ok(problem, `"${prose}" reached a Generator`);
    assert.match(problem, /Projector strategy/);
  }
});

test("F45: the two phrasings that reached delivered readings are refused", () => {
  for (const prose of [
    "Your Sacral will signal whether an invitation belongs to you.",
    "The Sacral requires an external invitation or encounter to spark into motion.",
  ]) {
    assert.match(check(reading({ [ENERGY]: prose }), CHART), /Projector strategy/);
  }
});

test("F45: the phrasings that MUST pass still do", () => {
  // The prompt asks every reading to open its takeaways this way, and the Line
  // 2 sentence is correct prose -- there the invitation is what acts.
  for (const prose of [
    "These are invitations to test against your own experience, not instructions.",
    "Natural talent sits quietly in you until the right invitation draws you out.",
  ]) {
    assert.equal(check(reading({ [ENERGY]: prose }), CHART), null, prose);
  }
});

test("F45: a Projector may still be told its own strategy", () => {
  const prose = "Sit tight for the invitation; recognition is what opens the work.";
  const projector = { ...CHART, type: "Projector" };
  assert.equal(check(reading({ [ENERGY]: prose }, projector), projector), null);
});

/* ------------------------------------------------------------------ F43 */

/*
 * These three stay on `typeWordProblem` itself, on purpose. Through the chain a
 * dash-separated not-self line is refused earlier, by the summary panel (which
 * only reads "Label:" rows -- C-3), so `firstProblem` could never show that the
 * type-word check FINDS the line. That finding is the regression being guarded.
 * The colon spelling is also checked through the chain, below.
 */
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

test("F43: through the chain, 'Not-Self Theme:' with another type's word is refused", () => {
  const text = reading().replace("Not-self: Not-self value.", "Not-Self Theme: Bitterness settles in.");
  assert.match(check(text, CHART), /belongs to another type/);
});

/* ------------------------------------------------------------------ F44 */

// A Reflector: seven undefined, the other two open.
const REFLECTOR = {
  type: "Reflector",
  definedCenters: [],
  undefinedCenters: ["Head", "Ajna", "Throat", "Heart", "Sacral", "Spleen", "Root"],
  openCenters: ["G", "Solar Plexus"],
};

test("F44: a Reflector may name all seven undefined centres in section 5", () => {
  const prose =
    "Your undefined Head, Ajna, Throat, Heart, Sacral, Spleen and Root each take in what the room is carrying.";
  assert.equal(check(reading(inS5(prose, REFLECTOR), REFLECTOR), REFLECTOR), null);
});

test("F44: seven centres OUTSIDE section 5 are still refused", () => {
  const prose =
    "Your Head, Ajna, Throat, Heart, Sacral, Spleen and Root all move together here.";
  const problem = check(reading({ "When it is working, and when it is not": prose }, REFLECTOR), REFLECTOR);
  assert.match(problem, /names 7 centers in one sentence \(the limit is 4\)/);
});

test("F44: the anti-padding rule still holds for a chart with few undefined", () => {
  const prose = "Your Head, Ajna, Throat, Heart and Sacral all take in the room at once.";
  const problem = check(reading({ [S5]: prose }), CHART);
  assert.match(problem, /names 5 centers in one sentence \(the limit is 4\)/);
});

/* ------------------------------------------------------- N-01 and N-04 */

test("N-01: a reading may not call an undefined centre defined", () => {
  const prose = "Your defined Heart center contributes a consistent thread of willpower.";
  const problem = check(reading({ "What is consistently yours": prose }), CHART);
  assert.match(problem, /calls the Heart center "defined", but on this chart it is undefined/);
});

test("N-01: the predicate form is caught too, and it is caught anywhere", () => {
  const prose = "Your Heart center is defined, so willpower is constant for you.";
  const problem = check(reading({ [ENERGY]: prose }), CHART);
  assert.match(problem, /calls the Heart center "defined"/);
});

test("N-01, R-08 residual: an unowned predicate is not judged", () => {
  // Named when the possessive rule was approved: without "your" the sentence is
  // not read as a claim about this chart. A miss here is one loose sentence; a
  // refusal of honest prose would be minutes of a buyer's wait.
  const prose = "The Heart center is defined, so willpower is constant for you.";
  assert.equal(check(reading({ [ENERGY]: prose }), CHART), null);
});

test("N-01: truthful prose about the same centres passes", () => {
  const prose = "Your defined Sacral carries the work, and the Heart is undefined beside it.";
  assert.equal(check(reading({ "What is consistently yours": prose }), CHART), null);
});

test("N-01: open and undefined are not held against each other", () => {
  // Both are white on the drawing; only the defined/not-defined confusion
  // misinforms, and refusing the looser word would cost the buyer a retry.
  const prose = "Your open Heart takes in the willpower around you.";
  assert.equal(check(reading(inS5(prose)), CHART), null);
});

// Nothing undefined at all: seven defined, two open.
const NO_UNDEFINED = {
  type: "Generator",
  definedCenters: ["Throat", "Sacral", "G", "Spleen", "Root", "Ajna", "Heart"],
  undefinedCenters: [],
  openCenters: ["Head", "Solar Plexus"],
};

test("N-04: a chart with nothing undefined is not told about its undefined spaces", () => {
  const prose = "Your undefined spaces are where other people's weather arrives.";
  const problem = check(reading(inS5(prose, NO_UNDEFINED), NO_UNDEFINED), NO_UNDEFINED);
  assert.match(problem, /but this chart has none/);
});

test("N-04: a negation IN FRONT of the phrase is not a claim", () => {
  // Caught in review: this matches from "your" onwards, so the "None of" that
  // makes it true sits outside the match and the rule refused honest prose.
  for (const prose of [
    "None of your centres is undefined, which is unusual.",
    "You have no undefined centres at all on this chart.",
    "Not one of your centres is undefined here.",
  ]) {
    assert.equal(check(reading(inS5(prose, NO_UNDEFINED), NO_UNDEFINED), NO_UNDEFINED), null, prose);
  }
});

test("N-04: explaining the word is still allowed", () => {
  const prose = "A centre that is undefined carries gates without a full channel; none of yours is.";
  assert.equal(check(reading(inS5(prose, NO_UNDEFINED), NO_UNDEFINED), NO_UNDEFINED), null);
});

/* ------------------------------------------------------------- the copy */

test("the accuracy caption claims only what the validation record supports", async () => {
  const { CREDIBILITY } = await import("../test/support/copy.mjs").catch(() => ({}));
  if (!CREDIBILITY) return; // copy.test.mjs owns the compiled-TypeScript path
  const all = CREDIBILITY.checks.map((c) => c[1]).join(" ");
  assert.ok(!/none of them decides a line/.test(all), "the refuted clause is back");
  assert.match(all, /as far as I can find/i);
});
