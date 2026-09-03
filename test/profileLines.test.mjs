import { test } from "node:test";
import assert from "node:assert/strict";
import { profileLineProblem, typeProblem, firstProblem, openCentreProblem } from "../netlify/lib/interpretation.mjs";

/**
 * FOUND LIVE, 2026-09-02: a 6/2 chart's reading said "Line 1 (Investigator),
 * conscious" and "Line 2 (Hermit), unconscious". Every heading present, every
 * length right, the wrong person described. The two digits are the one thing
 * about the profile lines a validator can hold exactly.
 */
const READING = (a, b) =>
  `IN SHORT\n\nType: x.\n\nYour profile lines\n\nLine ${a} (Investigator), conscious: one sentence.\nLine ${b} (Hermit), unconscious: one sentence.\n\nYour energy, and how it starts\n\nlede.\n`;

test("A 6/2 READING THAT DESCRIBES LINE 1 IS REFUSED", () => {
  assert.match(profileLineProblem(READING(1, 2), "6/2"), /1\/2 for a 6\/2/);
});

test("the right two lines in the right order pass", () => {
  assert.equal(profileLineProblem(READING(6, 2), "6/2"), null);
  assert.equal(profileLineProblem(READING(6, 2), "6/2 — Role Model / Hermit"), null);
});

test("the lines swapped is still wrong -- conscious first", () => {
  assert.match(profileLineProblem(READING(2, 6), "6/2"), /2\/6 for a 6\/2/);
});

test("no profile, or no heading, is not judged here", () => {
  assert.equal(profileLineProblem(READING(1, 2), null), null);
  assert.equal(profileLineProblem("IN SHORT\n\nType: x.\n", "6/2"), null);
});

/**
 * The prompt asks every reading to open its takeaways with "invitations to
 * test against your own experience". A model writing that in the singular was
 * refused as giving Projector advice -- on a Generator, twice, and on a
 * Manifesting Generator. The strategy is a phrase, not a word.
 */
test("'an invitation to test' is not the Projector strategy", () => {
  assert.equal(
    typeProblem("These are offered as an invitation to test against your own experience.\n", "Generator"),
    null,
  );
  assert.match(
    typeProblem("Stop pushing, and wait for a proper invitation to engage.\n", "Manifesting Generator"),
    /invitation/,
  );
  assert.match(typeProblem("Your work is waiting on the invitation.\n", "Generator"), /invitation/);
});

test("firstProblem carries the profile through", () => {
  const good = READING(6, 2);
  // Not a full reading, so structure fails first; the point is the arity.
  assert.equal(typeof firstProblem(good, "Generator", "6/2"), "string");
});


/**
 * F38: W1's section 5 described both undefined centres and neither open one,
 * beside a margin that printed the open ones. If the chart has open centres,
 * the section names at least one, or at least says "open".
 */
const S5 = (body) => `IN SHORT\n\nType: x.\n\nWhat you take in from others\n\nlede.\n\n${body}\n\nWhen it is working, and when it is not\n\nlede.\n`;

test("A SECTION 5 THAT NEVER MENTIONS AN OPEN CENTRE IS REFUSED WHEN THE CHART HAS ONE", () => {
  const p = openCentreProblem(S5("Your undefined Ajna takes in fixed opinions. Your undefined Throat borrows the room's voice."), ["Head", "Heart"], ["Ajna", "Throat"]);
  assert.match(p, /open centre/);
  assert.match(p, /Head, Heart/);
});

test("naming one open centre, or the word open, is enough", () => {
  assert.equal(openCentreProblem(S5("Your undefined Ajna borrows. Your Head takes in the whole room."), ["Head", "Heart"], ["Ajna"]), null);
  assert.equal(openCentreProblem(S5("Your undefined Ajna borrows. Where you are open you take in the room whole."), ["Head"], ["Ajna"]), null);
});

test("a chart with no open centres is not asked to invent one, and vice versa", () => {
  assert.equal(openCentreProblem(S5("Your undefined Heart is a filter."), [], ["Heart"]), null);
  assert.equal(openCentreProblem(S5("Your open Head takes in everything."), ["Head"], []), null);
  assert.match(openCentreProblem(S5("Your open Head takes in everything."), ["Head"], ["Ajna"]), /undefined centre/);
});

/** F45: the passive and noun forms of the Projector strategy. */
test("passive Projector phrasings are caught on a Generator", () => {
  for (const s of [
    "Your work is to wait to be invited before you act.",
    "Wait until you are invited into the room.",
    "You wait for the invite rather than pushing.",
    "Waiting for a genuine invitation is the whole art.",
    "Rest until you're invited.",
  ]) {
    assert.match(typeProblem(s + "\n", "Generator") ?? "", /invitation/, s);
  }
  assert.equal(typeProblem("These are offered as an invitation to test against your own experience.\n", "Generator"), null);
  assert.equal(typeProblem("Line 2 (Hermit): your gifts wait in solitude until the right invitation draws you out.\n", "Generator"), null);
});
