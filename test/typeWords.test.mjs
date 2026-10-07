import { test } from "node:test";
import assert from "node:assert/strict";
import { typeProblem, typeWordProblem, centreCountProblem, sanitize, structureProblem } from "../netlify/lib/interpretation.mjs";

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
  assert.match(p, /7 centers/);
});

test("three centres in a sentence is fine, and so is the same centre named twice", () => {
  assert.equal(centreCountProblem("Your Sacral, Root and Spleen are defined. Your Sacral is the engine."), null);
  // Four is allowed: a Reflector has seven undefined centres to cover.
  assert.equal(centreCountProblem("Because your Sacral, Root, Heart, and Solar Plexus are undefined, rooms change you."), null);
  assert.equal(centreCountProblem("Because your Solar Plexus is defined, and your Solar Plexus waves."), null);
});

test("'What is consistently yours' may list every defined centre, like the definition", () => {
  const text = "\nWhat is consistently yours\n\nYour defined Head, Ajna, Throat, G, Sacral, Spleen and Root never change.\n\nWhat you take in from others\n\nlede.\n";
  assert.equal(centreCountProblem(text), null);
});

test("the not-self line is found under every spelling the model uses", () => {
  for (const label of ["Not-Self Theme:", "Not self:", "Not-Self:", "Not-self:"]) {
    assert.match(typeWordProblem(`Signature: Peace.\n${label} Frustration flares.\n`, "Manifestor"), /Frustration/, label);
  }
});

test("a paraphrased heading is NOT renamed any more: the draft is refused and asked again", () => {
  const raw = "IN_SHORT\n\nType: x.\n\nWhat is taken in from others\n\nBody.";
  const out = sanitize(raw);
  assert.equal(out, raw, "sanitize rewrote the model's text");
  assert.match(structureProblem(out), /missing/);
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
    /6 centers/,
  );
});

test("the labelled lines are found whatever their capitalisation", () => {
  assert.match(typeWordProblem("Not-Self: Frustration flares.\n", "Manifestor"), /Frustration/);
});

/* ------------- live shop test #2 (10/7): the claim behind "Your" ------------- */

test("10/7: a line that leads with 'Your frustration' is a Manifestor given the Generator's word", () => {
  // verbatim, live shop test #2 (Manifestor, not-self Anger), and a 10/7 draft
  const live = "When it's off track: Your frustration flares into sharp friction when your path meets interference or when you forget to let people know your moves.";
  assert.match(typeWordProblem(live, "Manifestor") ?? "", /"Frustration".*theirs is Anger/);
  assert.match(typeWordProblem("When it's off track: Your frustration flares hot and sharp whenever your momentum meets resistance.", "Manifestor") ?? "", /Frustration/);
  // past "this" / "that" too, and under the old label
  assert.match(typeWordProblem("Not-self: This bitterness creeps in.", "Generator") ?? "", /Bitterness/);
  assert.match(typeWordProblem("When it's on track: That satisfaction settles in.", "Projector") ?? "", /Satisfaction/);
});

test("10/7: another type's word the reader is said to HAVE is refused anywhere in the two lines", () => {
  assert.match(typeWordProblem("When it's off track: When plans stall, your frustration rises.", "Manifestor") ?? "", /Frustration/);
  assert.match(typeWordProblem("When it's off track: Pushing ahead brings your sense of bitterness.", "Generator") ?? "", /Bitterness/);
  assert.match(typeWordProblem("When it's on track: Things land and your feeling of peace returns.", "Generator") ?? "", /Peace/);
});

test("10/7: the 9/9 in-passing sentences and the type's own word still pass", () => {
  // Jeremy's #2 ruling, verbatim from the audit
  assert.equal(typeWordProblem("When it's on track: Finding deep satisfaction through recognition of your guidance.", "Projector"), null);
  assert.equal(typeWordProblem("When it's off track: Pushing unasked leaves a taste of resentment and frustration.", "Projector"), null);
  assert.equal(typeWordProblem("Signature: Finding deep satisfaction through recognition of your guidance.", "Projector"), null);
  // the type's own word, possessed or leading
  assert.equal(typeWordProblem("When it's off track: Your anger flares when you act without informing.", "Manifestor"), null);
  assert.equal(typeWordProblem("When it's on track: Your sense of peace returns once people know.", "Manifestor"), null);
  assert.equal(typeWordProblem("When it's off track: Your frustration builds when you skip the response.", "Generator"), null);
  // other people's, not the reader's
  assert.equal(typeWordProblem("When it's off track: Others' frustration may land on you; your anger follows.", "Manifestor"), null);
  // the body is never judged by this rule
  assert.equal(typeWordProblem("When it's off track: Anger flares.\nLater, your frustration with traffic is ordinary.\n", "Manifestor"), null);
});

test("10/7: through the form, as gemini.mjs runs it -- the slot is judged in the rendered line", async () => {
  const { renderReading } = await import("../netlify/lib/structured.mjs");
  const form = { summary: { type: "a.", strategy: "b.", authority: "c.", profile: "d.", signature: "Calm follows.", notSelf: "Your frustration flares into sharp friction." } };
  const { text } = renderReading(form, { type: "Manifestor", profile: "1/3", channels: [] });
  assert.match(typeWordProblem(text, "Manifestor") ?? "", /Frustration/);
});
