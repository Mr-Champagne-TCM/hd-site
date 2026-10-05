import { test } from "node:test";
import assert from "node:assert/strict";
import { check, reading } from "./support/chain.mjs";

/**
 * ROUND FOUR (audit, 7 September; fixes approved by Jeremy 9/9).
 *
 * R-07 and R-08 are one fault seen from both sides: the negation word list
 * refused sentences that DENY a state and let through sentences that ASSERT a
 * wrong one. The fix judges only the possessive -- "your defined Heart" -- and
 * drops the list. R-09 is the type-word check reading a whole sentence when
 * only the word it leads with is the claim.
 *
 * Strings marked "verbatim" are the auditor's or a delivered reading's own.
 * Everything goes through `firstProblem`, the path a buyer's reading takes.
 */

const ENERGY = "Your energy, and how it starts";

/* ---------------------------------- R-07: six ways of saying "does not have" */

// 8e5ff09e: Projector, defined Ajna, Throat and G; nothing undefined; six open.
const P_8E5 = {
  type: "Projector",
  definedCenters: ["Ajna", "Throat", "G"],
  undefinedCenters: [],
  openCenters: ["Head", "Heart", "Sacral", "Spleen", "Solar Plexus", "Root"],
};

test("R-07: denying a defined Sacral is not claiming one, however it is worded", () => {
  for (const prose of [
    // verbatim, delivered reading 8e5ff09e -- still refused on 2325218
    "Because your Projector type lacks a defined Sacral centre, your vitality works best in bursts.",
    // verbatim, the auditor's
    "You are missing a defined Sacral centre, which shapes how you work.",
    "The absence of a defined Sacral centre is the whole point.",
    "Free of a defined Sacral centre, you work in bursts.",
    "Devoid of a defined Sacral centre, rest matters more.",
    "Short of a defined Sacral centre, you borrow vitality.",
    "Your chart shows no sign of a defined Sacral centre.",
  ]) {
    assert.equal(check(reading(P_8E5, { [ENERGY]: prose }), P_8E5), null, prose);
  }
});

test("R-07: the same chart told it HAS a defined Sacral is refused", () => {
  const prose = "Your defined Sacral centre gives you stamina that renews overnight.";
  assert.match(
    check(reading(P_8E5, { [ENERGY]: prose }), P_8E5),
    /calls the Sacral center "defined", but on this chart it is open/,
  );
});

/* ------------------------------- R-08: a negation of something else */

// Test Wone's chart: Heart open, Ajna undefined.
const WONE = {
  type: "Generator",
  definedCenters: ["Throat", "Sacral", "G", "Spleen", "Root", "Solar Plexus"],
  undefinedCenters: ["Ajna"],
  openCenters: ["Heart", "Head"],
};

test("R-08: a wrong fact is refused even when the sentence negates something else", () => {
  // verbatim, the auditor's nine "let through" plus the one that was caught
  for (const prose of [
    "There is no doubt your defined Heart drives you.",
    "You never lose access to your defined Heart.",
    "Without question, your defined Heart is a constant.",
    "Unlike most people, your defined Heart never wavers.",
    "It is not surprising that your defined Heart pushes you to prove worth.",
    "No one would guess your defined Ajna gives you such fixed certainty.",
    "If you had any doubt, your defined Heart settles it.",
    "Someone with your defined Heart will always push to prove their worth.",
    "There is nothing passive about your defined Heart.",
  ]) {
    assert.match(
      check(reading(WONE, { [ENERGY]: prose }), WONE),
      /calls the (Heart|Ajna) center "defined"/,
      prose,
    );
  }
});

test("R-08 residual, named when it was approved: no possessive, no judgement", () => {
  // verbatim, the tenth of the auditor's let-throughs. "like yours" possesses
  // the comparison, not the state, so this is still not read as a claim.
  const prose = "Not everyone has a defined Heart like yours.";
  assert.equal(check(reading(WONE, { [ENERGY]: prose }), WONE), null);
});

/* --------------------------- R-09 (#2): the word the line leads with */

const withLine = (chart, label, line) =>
  reading(chart).replace(`${label}: ${label} value.`, `${label}: ${line}`);

test("R-09: a not-self line that OPENS with another type's word is refused", () => {
  // 3258185c, a Manifestor (not-self Anger); the sentence as the audit quoted it.
  const manifestor = { type: "Manifestor", definedCenters: ["Throat", "Heart"], undefinedCenters: ["Root"], openCenters: ["Head"] };
  const text = withLine(manifestor, "Not-self", "Frustration flares up whenever your momentum hits the brick wall.");
  assert.match(check(text, manifestor), /not-self "Frustration", which belongs to another type \(theirs is Anger\)/);
});

test("R-09: another type's word used in passing, later in the sentence, is not", () => {
  const projector = { type: "Projector", definedCenters: ["Ajna", "Throat", "G"], undefinedCenters: ["Root"], openCenters: ["Head"] };
  for (const [label, line] of [
    // 1df06916 and 8e5ff09e, as the audit quoted them (Projector, signature Success)
    ["Signature", "Finding deep satisfaction through recognition of what you see."],
    ["Signature", "Finding deep satisfaction comes through the recognition of your guidance."],
    // the shape of fdbabee6 (Projector, not-self Bitterness): the word arrives late
    ["Not-self", "Being overlooked leaves a persistent taste of resentment and frustration."],
  ]) {
    assert.equal(check(withLine(projector, label, line), projector), null, line);
  }
});

test("R-09: a lead word behind an article still counts as the lead", () => {
  const manifestor = { type: "Manifestor", definedCenters: ["Throat", "Heart"], undefinedCenters: ["Root"], openCenters: ["Head"] };
  const text = withLine(manifestor, "Not-self", "The frustration of a stalled start shows up first.");
  assert.match(check(text, manifestor), /belongs to another type/);
});
