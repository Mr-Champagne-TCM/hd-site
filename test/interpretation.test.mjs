import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DISCLAIMER,
  HEADINGS,
  INTERPRETATION,
  MECHANICS,
  SUMMARY_KEYS,
  chartFactsOnly,
  firstProblem,
  parseReading,
  sanitize,
  structureProblem,
  summaryRows,
} from "../netlify/lib/interpretation.mjs";

/**
 * The tier-2 contract.
 *
 * The generator does not exist yet and these tests do not need it. What they
 * hold is the part that cannot be fixed after the fact -- what leaves this
 * machine, and what is allowed to reach a paying reader.
 */

const OUTPUT = {
  type: "Manifesting Generator",
  strategy: "Wait to respond, then inform",
  authority: "Sacral",
  profile: "2/4",
  definition: "Single",
  signature: "Satisfaction",
  notSelfTheme: "Frustration",
  incarnationCross: "Right Angle Cross of Eden (6/36 | 12/11)",
  definedCenters: ["Throat", "Sacral"],
  openCenters: ["Head", "Ajna"],
  channels: ["20-34 (Charisma)"],
  personality: [{ planet: "Sun", gate: 6, line: 2 }],
  design: [{ planet: "Sun", gate: 12, line: 4 }],
};

test("NOTHING THAT IDENTIFIES ANYBODY LEAVES THIS MACHINE", () => {
  // Google offers no deletion path for API content, so the only protection is
  // that identifying data is never sent. Fed a record stuffed with identity,
  // and none of it may appear in what goes over the wire.
  const identity = {
    ...OUTPUT,
    name: "Jeremy Champagne",
    email: "someone@example.com",
    phone: "+1 555 0100",
    birth: { date: "1983-09-17", time: "03:17", place: "Wichita Falls, Texas" },
    buyer: { name: "Jeremy Champagne", email: "someone@example.com" },
    zone: "America/Chicago",
  };
  const wire = chartFactsOnly(identity);
  for (const secret of [
    "Jeremy",
    "Champagne",
    "example.com",
    "555",
    "1983",
    "03:17",
    "Wichita",
    "Texas",
    "America/Chicago",
  ]) {
    assert.ok(!wire.includes(secret), `"${secret}" reached the prompt`);
  }
  // And it did carry the chart, so this is not passing by sending nothing.
  assert.match(wire, /Manifesting Generator/);
  assert.match(wire, /20-34 \(Charisma\)/);
  assert.match(wire, /sun 6\.2/);
});

test("an unknown birth time is declared, because the reading must say so", () => {
  const wire = chartFactsOnly({ ...OUTPUT, timeKnown: false });
  assert.match(wire, /birth time was not known/);
  assert.match(wire, /cannot be confirmed without a birth time/);
  // And is silent when the time IS known -- a note about a missing time on a
  // chart that has one is worse than no note.
  assert.doesNotMatch(chartFactsOnly(OUTPUT), /was not known/);
});

// --- what is allowed to reach a reader -------------------------------------

function wellFormed({ drop = null, question = false, short = false } = {}) {
  // 8 words x 22 paragraphs lands under the 380-word floor; 70 clears it easily.
  const words = short ? "word ".repeat(8) : "word ".repeat(70);
  const parts = [
    "IN SHORT",
    "",
    ...SUMMARY_KEYS.map((k) => `${k}: a sentence about the ${k.toLowerCase()}.`),
    "",
  ];
  for (const h of HEADINGS) {
    if (h === drop) continue;
    parts.push(h, "", words.trim(), "", words.trim(), "");
  }
  if (question) parts.push("Does this resonate with you?", "");
  parts.push(DISCLAIMER);
  return parts.join("\n");
}

test("a sound reading passes", () => {
  assert.equal(firstProblem(wellFormed()), null);
});

test("NO DISCLAIMER, NO READING", () => {
  const text = wellFormed().replace(DISCLAIMER, "");
  assert.match(firstProblem(text), /without the required disclaimer/);
});

test("it may not end by asking the reader a question", () => {
  // "This is a document handed to someone, not a conversation."
  assert.match(firstProblem(wellFormed({ question: true })), /asking the client a question/);
});

test("a reading too short to hand over is refused", () => {
  assert.match(firstProblem(wellFormed({ short: true })), /too short to hand over/);
});

test("A DROPPED SECTION IS CAUGHT, which is what this is really for", () => {
  // Measured in the app: over twelve real generations the model dropped a
  // required heading twice, and every other check passed it.
  for (const h of HEADINGS) {
    const problem = firstProblem(wellFormed({ drop: h }));
    assert.ok(problem, `dropping "${h}" was not noticed`);
    assert.match(problem, /missing/);
  }
});

test("sections out of order are caught, not silently reordered", () => {
  const good = wellFormed();
  const swapped = good
    .replace(INTERPRETATION[0], "@@ONE@@")
    .replace(INTERPRETATION[1], INTERPRETATION[0])
    .replace("@@ONE@@", INTERPRETATION[1]);
  assert.match(structureProblem(swapped), /out of order/);
});

test("a summary panel missing a row is caught", () => {
  const text = wellFormed().replace("Signature: a sentence about the signature.", "");
  assert.match(firstProblem(text), /summary panel came back missing Signature/);
});

test("only the SENTENCE is taken from the summary, never the value", () => {
  // The label and the chart value are drawn from the chart itself, so a model
  // that miscopies a value cannot put a wrong one on the page.
  const rows = summaryRows(wellFormed());
  assert.deepEqual(Object.keys(rows).sort(), [...SUMMARY_KEYS].sort());
  assert.equal(rows.Type, "a sentence about the type.");
});

test("markdown the model was told not to use is stripped rather than printed", () => {
  const messy = "**Bold** and\n* a bullet\n\n\n\ntoo much air";
  const clean = sanitize(messy);
  assert.ok(!clean.includes("**"), "asterisks survived into a paid document");
  assert.ok(!/^\* /m.test(clean), "a bullet character survived");
  assert.ok(!/\n{3,}/.test(clean), "blank lines were not collapsed");
});

test("the reading parses into the blocks the document is laid out from", () => {
  const { summary, sections } = parseReading(wellFormed());
  assert.equal(sections.length, HEADINGS.length);
  assert.deepEqual(sections.map((s) => s.heading), HEADINGS);
  assert.equal(Object.keys(summary).length, 6);

  // An interpretation section keeps its lede separate -- the app sets it large,
  // and it is the sentence the rest of the section rests on.
  const interp = sections.find((s) => s.heading === INTERPRETATION[0]);
  assert.ok(interp.lede, "the lede was folded into the body");
  assert.equal(interp.paragraphs.length, 1);

  // A mechanics section has no lede: it is a paragraph or a list, not a claim.
  const mech = sections.find((s) => s.heading === MECHANICS[0]);
  assert.equal(mech.lede, null);
  assert.ok(mech.paragraphs.length >= 1);
});

test("the disclaimer is not parsed as content", () => {
  const { sections } = parseReading(wellFormed());
  const all = sections.flatMap((s) => [s.lede ?? "", ...s.paragraphs]).join(" ");
  assert.ok(!all.includes("self-reflection"), "the disclaimer leaked into a section");
});
