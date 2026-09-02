import { test } from "node:test";
import assert from "node:assert/strict";
import { typeProblem, typeWordProblem, centreCountProblem } from "../netlify/lib/interpretation.mjs";

/**
 * FOUND LIVE, 2026-09-02, first buyer under the three-state prompt: a
 * Manifestor's IN SHORT said "Not-self: Frustration flares up..." -- the
 * Generator's word -- and the validator, which only knew strategies, passed it.
 * A wrong fixed word on a labelled line is the same class of fault as the
 * wrong strategy: perfectly shaped, and wrong about who the reader is.
 */
test("A MANIFESTOR IS NOT GIVEN THE GENERATOR'S NOT-SELF", () => {
  const p = typeWordProblem("IN SHORT\n\nSignature: Peace arrives.\nNot-self: Frustration flares up whenever...\n", "Manifestor");
  assert.match(p, /Frustration/);
  assert.match(p, /Anger/);
});

test("the right words pass, and the body may say the other words in passing", () => {
  assert.equal(typeWordProblem("Signature: Peace arrives.\nNot-self: Anger builds.\nLater the body mentions frustration in general.\n", "Manifestor"), null);
  assert.equal(typeWordProblem("Signature: Satisfaction.\nNot-self: Frustration.\n", "Manifesting Generator"), null);
  assert.equal(typeWordProblem("Signature: Surprise.\nNot-self: Disappointment.\n", "Reflector"), null);
});

test("an unknown type is not judged", () => {
  assert.equal(typeWordProblem("Signature: Anger.\n", "Not A Type"), null);
});

/**
 * The prompt says never more than three centres in one sentence, and the
 * model's first live paragraph named seven. Enumerating a state back to the
 * reader is exactly what the prompt forbids.
 */
test("SEVEN CENTRES IN ONE SENTENCE IS REFUSED", () => {
  const p = centreCountProblem(
    "Undefined centres like the Ajna, G, Heart, Sacral, and Root act as sponges, while open Head and Spleen centres drop your boundaries.",
  );
  assert.match(p, /7 centres/);
});

test("three centres in a sentence is fine, and so is the same centre named twice", () => {
  assert.equal(centreCountProblem("Your Sacral, Root and Spleen are defined. Your Sacral is the engine."), null);
  assert.equal(centreCountProblem("Because your Solar Plexus is defined, and your Solar Plexus waves."), null);
});

test("a cross name does not count as a centre", () => {
  assert.equal(centreCountProblem("Carrying the Right Angle Cross of Eden (6/36 | 12/11), you move between intimacy and friction."), null);
});

test("typeProblem now carries both checks", () => {
  assert.match(typeProblem("Signature: Success.\nNot-self: Bitterness.\n", "Generator"), /Success|Bitterness/);
});

/**
 * The first live run of the centre rule refused a Single-definition chart for
 * its OWN definition paragraph -- "Because your Ajna, Throat, G, Sacral, Spleen,
 * and Solar Plexus connect directly..." -- which is the one sentence the prompt
 * asks to be a list. That paragraph is exempt; the rest of the reading is not.
 */
test("THE DEFINITION PARAGRAPH MAY LIST EVERY DEFINED CENTRE", () => {
  const text =
    "IN SHORT\n\nType: x.\n\nYour definition\n\nBecause your Ajna, Throat, G, Sacral, Spleen, and Solar Plexus connect directly, nothing is stranded.\n\nYour channels\n\n1-8 (x), G to Throat: y.\n";
  assert.equal(centreCountProblem(text), null);
  assert.match(
    centreCountProblem(text + "\nHow you decide\n\nYour Ajna, Throat, G, Sacral, Spleen and Root all pull at once.\n"),
    /6 centres/,
  );
});

test("the labelled lines are found whatever their capitalisation", () => {
  assert.match(typeWordProblem("Not-Self: Frustration flares.\n", "Manifestor"), /Frustration/);
});
