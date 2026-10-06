import { test } from "node:test";
import assert from "node:assert/strict";
import { INTERPRETATION, parseReading, summaryRows, typeWordProblem, marginNotes } from "../netlify/lib/interpretation.mjs";
import { renderReading } from "../netlify/lib/structured.mjs";
import { feelingIs, feelingNote } from "../netlify/lib/readingPdf.mjs";

/**
 * ON TRACK / OFF TRACK (Jeremy 10/5, option C). Readers see "When it's on
 * track" / "When it's off track" where Human Design says Signature / Not-self.
 * Readings written before the change must still read, display and print.
 */

const OLD = "When it is working, and when it is not";

test("the sixth section is called on track / off track now", () => {
  assert.equal(INTERPRETATION[5], "When it's on track, and when it's off track");
});

test("a new reading's summary lines are labelled on track / off track, and read back as Signature / Not-self", () => {
  const form = { summary: { type: "a", strategy: "b", authority: "c", profile: "d", signature: "Seen and used well.", notSelf: "Effort nobody asked for." } };
  const { text } = renderReading(form, { type: "Projector", profile: "1/4", channels: [] });
  assert.match(text, /^When it's on track: Seen and used well\.$/m);
  assert.match(text, /^When it's off track: Effort nobody asked for\.$/m);
  assert.doesNotMatch(text, /^Signature:|^Not-self:/m);
  const rows = summaryRows(text);
  assert.equal(rows.Signature, "Seen and used well.");
  assert.equal(rows["Not-self"], "Effort nobody asked for.");
});

test("A READING WRITTEN BEFORE THE CHANGE still reads: old labels, old heading, nothing rewritten", () => {
  const old = `IN SHORT\n\nType: x.\nSignature: Old line.\nNot-self: Old other.\n\n${OLD}\n\nThe lede.\n\nA paragraph.\n`;
  const r = parseReading(old);
  assert.equal(r.summary.Signature, "Old line.");
  assert.equal(r.summary["Not-self"], "Old other.");
  const s6 = r.sections.find((s) => s.heading === INTERPRETATION[5]);
  assert.ok(s6, "the old section 6 heading was not recognised");
  assert.equal(s6.lede, "The lede.");
});

test("the other-type word check finds the line under the new labels too", () => {
  assert.match(typeWordProblem("When it's off track: Bitterness takes over.", "Generator"), /Bitterness/);
  assert.equal(typeWordProblem("When it's off track: Frustration builds.", "Generator"), null);
});

test("the margin beside section 6 says it as a feeling", () => {
  const rows = marginNotes({ signature: "Success", notSelfTheme: "Bitterness", definedCenters: [] })[INTERPRETATION[5]];
  assert.deepEqual(rows.map(([k]) => k), ["ON TRACK,\nTHE FEELING IS", "OFF TRACK,\nTHE FEELING IS"]);
});

test("the chart page says 'The feeling is success' and keeps the note's own words", () => {
  assert.equal(feelingIs("Success"), "The feeling is success");
  assert.equal(feelingNote("The feeling of having been seen and used well."), "Having been seen and used well.");
  assert.equal(feelingNote("The signal that energy went somewhere."), "Energy went somewhere.");
  assert.equal(feelingNote("A quiet that arrives."), "A quiet that arrives.");
});
