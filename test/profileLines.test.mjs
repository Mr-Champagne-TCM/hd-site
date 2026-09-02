import { test } from "node:test";
import assert from "node:assert/strict";
import { profileLineProblem, typeProblem, firstProblem } from "../netlify/lib/interpretation.mjs";

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
