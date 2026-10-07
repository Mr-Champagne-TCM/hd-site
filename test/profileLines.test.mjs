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
 * the section NAMES at least one.
 *
 * The "or at least says open" half of this rule was removed in round two of
 * the audit: the bare word is satisfied by "You are open to feedback" and by
 * "Because it is undefined rather than open", neither of which names a centre,
 * and a name-only rule refused none of the known-good readings on file. The
 * counter-examples live in roundTwo.test.mjs.
 */
const S5 = (body) => `IN SHORT\n\nType: x.\n\nWhat you take in from others\n\nlede.\n\n${body}\n\nWhen it is working, and when it is not\n\nlede.\n`;

test("A SECTION 5 THAT NEVER MENTIONS AN OPEN CENTRE IS REFUSED WHEN THE CHART HAS ONE", () => {
  const p = openCentreProblem(S5("Your undefined Ajna takes in fixed opinions. Your undefined Throat borrows the room's voice."), ["Head", "Heart"], ["Ajna", "Throat"]);
  assert.match(p, /open center/);
  assert.match(p, /Head, Heart/);
});

test("naming one open centre is enough", () => {
  assert.equal(openCentreProblem(S5("Your undefined Ajna borrows. Your Head takes in the whole room."), ["Head", "Heart"], ["Ajna"]), null);
});

test("THE BARE WORD 'OPEN' IS NO LONGER ENOUGH", () => {
  // The sentence below names the undefined centre and then gestures at
  // openness without naming either open centre -- which is exactly the shape
  // W1 shipped in, and exactly what the word test let through.
  assert.match(
    openCentreProblem(S5("Your undefined Ajna borrows. Where you are open you take in the room whole."), ["Head"], ["Ajna"]),
    /never names one of this chart's 1 open centers \(Head\)/,
  );
});

test("a chart with no open centres is not asked to invent one, and vice versa", () => {
  assert.equal(openCentreProblem(S5("Your undefined Heart is a filter."), [], ["Heart"]), null);
  assert.equal(openCentreProblem(S5("Your open Head takes in everything."), ["Head"], []), null);
  assert.match(openCentreProblem(S5("Your open Head takes in everything."), ["Head"], ["Ajna"]), /undefined center/);
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

/* ---------- 10/7: "your first profile line" under Line 3 (live phone) ---------- */

import { profileOrdinalProblem } from "../netlify/lib/interpretation.mjs";
import { READING_SCHEMA } from "../netlify/lib/structured.mjs";

const rows = (a, b) => `IN SHORT\n\nYour profile lines\n\n${a}\n${b}\n\nYour energy, and how it starts\n\nx\n`;

test("10/7: an ordinal naming another line is refused (both live phone rows, Projector 3/5)", () => {
  assert.match(
    profileOrdinalProblem(rows("Line 3 (Martyr), conscious: Your first profile line brings a trial-and-error experimental nature.", "Line 5 (Heretic), unconscious: Fine.")) ?? "",
    /Line 3 "first profile line".*Line 1/,
  );
  assert.match(
    profileOrdinalProblem(rows("Line 3 (Martyr), conscious: Fine.", "Line 5 (Heretic), unconscious: Your second profile line carries a universalizing tendency.")) ?? "",
    /Line 5 "second profile line".*Line 2/,
  );
  // 10/7 drafts: "first line of your profile", "first conscious line", "first-line"
  assert.ok(profileOrdinalProblem(rows("Line 3 (Martyr), conscious: Your first line of your profile experiments.", "Line 5 (Heretic), unconscious: x.")));
  assert.ok(profileOrdinalProblem(rows("Line 6 (Role Model), conscious: The first conscious line is described as moving through phases.", "Line 2 (Hermit), unconscious: x.")));
  assert.ok(profileOrdinalProblem(rows("Line 4 (Opportunist), conscious: Your first-line energy reaches out.", "Line 6 (Role Model), unconscious: x.")));
});

test("10/7: a matching ordinal, an ordinal that names no line, and a sentence that names the right line all pass", () => {
  // shop test #2, verbatim shape
  assert.equal(profileOrdinalProblem(rows("Line 1 (Investigator), conscious: Your first line profile energy builds a foundation.", "Line 3 (Martyr), unconscious: Your third line profile energy learns through trial.")), null);
  assert.equal(profileOrdinalProblem(rows("Line 3 (Martyr), conscious: The first time something breaks, you learn.", "Line 5 (Heretic), unconscious: You are the first line of defence others reach for.")), null);
  assert.equal(profileOrdinalProblem(rows("Line 3 (Martyr), conscious: Your first profile line is the third line, which bumps into what fails.", "Line 5 (Heretic), unconscious: Your second profile line is the fifth line.")), null);
  assert.equal(profileOrdinalProblem(rows("Line 1 (Investigator), conscious: Fine.", "Line 3 (Martyr), unconscious: Your second profile line is the martyr, learning through trial.")), null);
  assert.equal(profileOrdinalProblem(rows("Line 6 (Role Model), conscious: The 6 line moves through three phases, the first around thirty.", "Line 2 (Hermit), unconscious: The 2 line rests.")), null);
  // outside the rows nothing is judged
  assert.equal(profileOrdinalProblem("IN SHORT\n\nProfile: Your first line leads.\n\nYour profile lines\n\nLine 3 (Martyr), conscious: x.\n"), null);
});

test("10/7: the profileLines slot asks for the line by its number", () => {
  const d = READING_SCHEMA.properties.profileLines.items.properties.sentence.description;
  assert.match(d, /about THIS line only. Call it by its own number/);
  assert.match(d, /never "first" or "second" line/);
});

test("10/7: a digit naming another line is the same error ('the 6 line' under Line 4, a live draft)", () => {
  assert.match(
    profileOrdinalProblem(rows("Line 2 (Hermit), conscious: The 2 line rests.", "Line 4 (Opportunist), unconscious: The 6 line is described as moving through roughly three phases.")) ?? "",
    /Line 4 "6 line"/,
  );
  assert.ok(profileOrdinalProblem(rows("Line 3 (Martyr), conscious: As line 1 shows, you dig.", "Line 5 (Heretic), unconscious: x.")));
  assert.equal(profileOrdinalProblem(rows("Line 2 (Hermit), conscious: Your 2 line rests.", "Line 4 (Opportunist), unconscious: Your 4 line builds a network.")), null);
  assert.equal(profileOrdinalProblem(rows("Line 6 (Role Model), conscious: Your 6/2 profile line arc.", "Line 2 (Hermit), unconscious: Unlike line 6, your line 2 rests.")), null);
  assert.equal(profileOrdinalProblem(rows("Line 1 (Investigator), conscious: In 2 lines of text you dig.", "Line 3 (Martyr), unconscious: x.")), null);
});

test("10/7: the on/off-track slots ask for the reader's own word, never another type's", () => {
  for (const k of ["signature", "notSelf"]) {
    assert.match(READING_SCHEMA.properties.summary.properties[k].description, /reader's own word from the facts, never another type's/);
  }
});
