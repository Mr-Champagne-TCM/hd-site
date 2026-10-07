import { test } from "node:test";
import assert from "node:assert/strict";
import {
  INTERPRETATION,
  TAKEAWAYS,
  SUMMARY_LABELS,
  marginNotes,
  oldWordProblem,
  parseReading,
  structureProblem,
  summaryRows,
} from "../netlify/lib/interpretation.mjs";
import { renderReading } from "../netlify/lib/structured.mjs";
import { SIGNATURE_NOTES, NOT_SELF_NOTES } from "../netlify/lib/mechanics.mjs";
import { feelingIs, feelingNote } from "../netlify/lib/readingPdf.mjs";
import { describeDifferences } from "../netlify/lib/chartDiff.mjs";
import { check, reading, row } from "./support/chain.mjs";

/**
 * "SIGNATURE" / "NOT-SELF" ARE REFUSED IN WHAT THE MODEL WRITES (10/7).
 * Readers see "When it's on track" / "When it's off track" (Jeremy 10/5).
 * "Effective, and no false rejections": every spelling in every place it
 * belongs is refused, and the English that only looks like it passes.
 */

const CHART = { type: "Generator", definedCenters: ["Sacral"], undefinedCenters: ["Root"], openCenters: ["Head"] };
const S6 = INTERPRETATION[5];
const MEET = "How you meet the world";
const ch = (n) => String.fromCharCode(n);
const EN = ch(0x2013);
const EM = ch(0x2014);
const NB = ch(0x2011); // non-breaking hyphen
const SOFT = ch(0x00ad);

/** A whole valid reading with one sentence placed in `where`. */
function placed(where, sentence) {
  const filler = "word ".repeat(70).trim();
  if (where === "on") return reading(CHART).replace(`Signature: ${row("Signature")}`, `Signature: ${sentence}`);
  if (where === "off") return reading(CHART).replace(`Not-self: ${row("Not-self")}`, `Not-self: ${sentence}`);
  if (where === "takeaway") return reading(CHART, { [TAKEAWAYS]: `${sentence} ${filler}` });
  return reading(CHART, { [where]: `${sentence} ${filler}` });
}

const NOT_SELF_SPELLINGS = [
  "not-self",
  "Not-self",
  "Not-Self",
  "NOT-SELF",
  "Not-Self Theme",
  "not self theme",
  "notself",
  "Notself",
  "not-selves",
  `not${EN}self`,
  `not${EM}self`,
  `not ${EM} self`,
  `not ${EN} self`,
  `not${NB}self`,
  `not${SOFT}self`,
  "Not Self",
  "NOT SELF",
];

test("a sound reading passes the whole chain, labels and all", () => {
  assert.equal(check(reading(CHART), CHART), null);
});

for (const spelling of NOT_SELF_SPELLINGS) {
  for (const where of ["on", "off", S6, MEET, "takeaway"]) {
    test(`refused: "${spelling}" in ${where === "on" ? "the on-track line" : where === "off" ? "the off-track line" : where}`, () => {
      const sentence =
        where === "takeaway"
          ? `(${spelling}) Notice the moment it arrives.`
          : `When you push, your ${spelling} shows up as a grinding stuckness.`;
      const p = check(placed(where, sentence), CHART);
      assert.match(p ?? "", /^The reading says "/, `${spelling} / ${where}`);
    });
  }
}

for (const spelling of ["signature", "Signature", "SIGNATURE", "signatures", "Signatures"]) {
  for (const where of ["on", "off", S6, "takeaway"]) {
    test(`refused: "${spelling}" in ${where === "on" ? "the on-track line" : where === "off" ? "the off-track line" : where}`, () => {
      const sentence =
        where === "takeaway"
          ? `(${spelling}) Notice what a good day leaves behind.`
          : `This is your ${spelling} of satisfaction showing.`;
      const p = check(placed(where, sentence), CHART);
      assert.match(p ?? "", new RegExp(`^The reading says "${spelling}"`), `${spelling} / ${where}`);
    });
  }
}

test("the refusal names the word, the place and the sentence, so an incident shows what was refused", () => {
  const p = check(placed(S6, "Because your Not-Self theme is frustration, you notice it early."), CHART);
  assert.match(p, /^The reading says "Not-Self" in "When it's on track, and when it's off track"/);
  assert.match(p, /your Not-Self theme is frustration/);
  assert.match(check(placed("off", "Your not-self wakes up."), CHART), /in the "When it's off track" line/);
  assert.match(check(placed("takeaway", "(Signature) Notice."), CHART), /in a takeaway's tag/);
});

const ENGLISH = [
  "You are not yourself when you push.",
  "You are not self-conscious about it.",
  "Not self-aware people carry it quietly.",
  `You are not self${ch(0x2010)}conscious about it.`,
  "Not self aware people carry bitterness they never name out loud.", // the F43 sentence
  "You are not selfish for resting.",
  "Self-trust grows here, and so does selflessness.",
  "The design gives a sign and a signal; nobody signs for you.",
  "Your sense of self steadies.",
  "This cannot self-correct by force.",
  "Good days and hard days are two readings on the same dial.",
  "On track, the feeling is satisfaction; off track, it is frustration.",
];

for (const sentence of ENGLISH) {
  for (const where of ["on", "off", S6, MEET, "takeaway"]) {
    test(`passes: ${JSON.stringify(sentence)} in ${where}`, () => {
      assert.equal(check(placed(where, sentence), CHART), null);
    });
  }
}

test("'signature' as ordinary English is not judged outside the on / off track content", () => {
  for (const where of [MEET, "How you decide", "Your energy, and how it starts"]) {
    assert.equal(check(placed(where, "Listening first is your signature move."), CHART), null, where);
  }
  // A takeaway's sentence is not the tag: only the tag is on / off track content.
  assert.equal(check(placed("takeaway", "(Sacral) Notice your signature way of answering."), CHART), null);
});

test("headings, labels and the disclaimer are ours and never judged", () => {
  // An old stored reading: "Signature:" / "Not-Self Theme:" labels and the old heading.
  const old = reading(CHART)
    .replace(`Not-self: ${row("Not-self")}`, "Not-Self Theme: A grinding stuckness.")
    .replace(`${S6}\n`, "When it is working, and when it is not\n");
  assert.equal(oldWordProblem(old), null);
  // The whole chain on the same labels (new heading: a new draft must carry it).
  assert.equal(check(old.replace("When it is working, and when it is not\n", `${S6}\n`), CHART), null);
  // Text outside every section (nothing displays it) is not judged either.
  assert.equal(oldWordProblem("Signature notes: not-self\n" + reading(CHART)), null);
});

test("OLD STORED READINGS STILL READ: the parser, the summary and the structure check do not judge words", () => {
  const old = reading(CHART).replace(`Signature: ${row("Signature")}`, "Signature: Your signature is satisfaction.");
  assert.ok(oldWordProblem(old), "the old words are there");
  assert.equal(structureProblem(old), null);
  assert.equal(summaryRows(old).Signature, "Your signature is satisfaction.");
  const oldHeading = old.replace(`${S6}\n`, "When it is working, and when it is not\n");
  assert.ok(parseReading(oldHeading).sections.find((s) => s.heading === S6), "the old section 6 heading still reads");
});

test("FORM MODE: a filled form carrying the old words is refused after rendering, as gemini.mjs runs it", () => {
  const para = "Because your Sacral is defined, " + "word ".repeat(62).trim() + ".";
  const sec = () => ({ lede: "You carry this one thing.", paragraphs: [para, para] });
  const form = (over) => ({
    summary: { type: "a.", strategy: "b.", authority: "c.", profile: "d.", signature: "Spent well.", notSelf: "Forced." },
    incarnationCross: para, definition: para, channels: [], profileLines: [{ line: 3, sentence: "x." }, { line: 5, sentence: "y." }],
    energy: sec(), decide: sec(), meet: sec(), consistent: sec(), takeIn: sec(), working: sec(),
    experimentIntro: "These are invitations to test.", takeaways: ["(Sacral) a.", "(Root) b.", "(Line 3) c.", "(Head) d."],
    ...over,
  });
  const chart = { type: "Generator", profile: "3/5", channels: [], ...CHART };
  const run = (f) => oldWordProblem(renderReading(f, chart).text);
  assert.equal(run(form({})), null);
  assert.match(run(form({ summary: { ...form({}).summary, signature: "Your signature of satisfaction arrives." } })), /signature/);
  assert.match(run(form({ summary: { ...form({}).summary, notSelf: "The not-self theme takes over." } })), /not-self/);
  assert.match(run(form({ working: { lede: "You know your Signature when it lands.", paragraphs: [para, para] } })), /Signature/);
  assert.match(run(form({ takeaways: ["(Not-Self Theme) Notice.", "(Root) b.", "(Line 3) c.", "(Head) d."] })), /Not-Self/);
  assert.match(run(form({ meet: { lede: "You meet people.", paragraphs: [para, "Your not-self shows here."] } })), /not-self/);
});

test("THE CHART ROWS AND MARGIN ARE OURS, and none of them says the old words either", () => {
  const OLD = /\bsignatures?\b|\bnot[\s\-‐-―]*sel(?:f|ves)\b/i;
  for (const word of Object.keys(SIGNATURE_NOTES)) {
    assert.doesNotMatch(feelingIs(word), OLD);
    assert.doesNotMatch(feelingNote(SIGNATURE_NOTES[word]), OLD, word);
  }
  for (const word of Object.keys(NOT_SELF_NOTES)) {
    assert.doesNotMatch(feelingIs(word), OLD);
    assert.doesNotMatch(feelingNote(NOT_SELF_NOTES[word]), OLD, word);
  }
  const margin = marginNotes({ signature: "Success", notSelfTheme: "Bitterness", definedCenters: [] })[S6];
  for (const [label, value] of margin) assert.doesNotMatch(`${label} ${value}`, OLD);
  assert.doesNotMatch(describeDifferences(["signature", "notSelfTheme"]), OLD);
  for (const label of Object.values(SUMMARY_LABELS)) assert.doesNotMatch(label, OLD);
});
