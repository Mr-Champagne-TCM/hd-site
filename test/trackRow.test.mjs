import { test } from "node:test";
import assert from "node:assert/strict";
import { renderReading } from "../netlify/lib/structured.mjs";
import { sanitize, trackRowProblem, TRACK_ROW_MIN_WORDS } from "../netlify/lib/interpretation.mjs";
import { check, reading, row } from "./support/chain.mjs";

/**
 * AN ON / OFF TRACK ROW UNDER 5 WORDS IS REFUSED (Jeremy 10/17, option A).
 *
 * Shop reading ed6b8caf came back with "When it's on track: Satisfaction" and
 * "When it's off track: Frustration", and the page printed "The feeling is
 * satisfaction. Satisfaction". Every row here goes through the whole chain
 * (firstProblem), in both shapes a draft arrives in: the letter, and the form
 * that structured.mjs prints.
 */

const CHART = {
  type: "Generator",
  definedCenters: ["G", "Sacral"],
  undefinedCenters: ["Throat", "Spleen"],
  openCenters: ["Head", "Ajna", "Heart", "Solar Plexus", "Root"],
};

// The shortest healthy row among the 28 stored shop readings (10/17): 11 words.
const SHORTEST_REAL = "Finding deep satisfaction through recognition brings a profound sense of accomplishment.";

/* ---------- the letter ---------- */

const letter = (key, value) => reading(CHART).replace(`${key}: ${row(key)}`, `${key}: ${value}`);
const letterNew = (key, label, value) => reading(CHART).replace(`${key}: ${row(key)}`, `${label}: ${value}`);

test("the chain's own fixture passes, so every refusal below is the row's", () => {
  assert.equal(check(reading(CHART), CHART), null);
});

test(`the floor is ${TRACK_ROW_MIN_WORDS} words`, () => {
  assert.equal(TRACK_ROW_MIN_WORDS, 5);
});

test("'Satisfaction' alone is refused (the ed6b8caf row)", () => {
  assert.match(check(letter("Signature", "Satisfaction"), CHART) ?? "", /"When it's on track" line came back as 1 word \("Satisfaction"\)/);
  assert.match(check(letterNew("Signature", "When it's on track", "Satisfaction"), CHART) ?? "", /on track.*1 word/);
});

test("'Satisfaction.' is refused: a full stop is not a sentence", () => {
  assert.match(check(letter("Signature", "Satisfaction."), CHART) ?? "", /1 word/);
});

test("'Frustration' alone on the off-track row is refused too", () => {
  assert.match(check(letter("Not-self", "Frustration"), CHART) ?? "", /"When it's off track" line came back as 1 word \("Frustration"\)/);
  assert.match(check(letterNew("Not-self", "When it's off track", "Frustration"), CHART) ?? "", /off track.*1 word/);
});

test("a 4-word row is refused", () => {
  assert.match(check(letter("Signature", "Satisfaction settles in quietly."), CHART) ?? "", /4 words/);
  assert.match(check(letter("Not-self", "Frustration builds, then stalls."), CHART) ?? "", /4 words/);
});

test("a dash or a lone mark is not a word", () => {
  assert.match(check(letter("Signature", "Satisfaction — it settles ."), CHART) ?? "", /3 words/);
});

test("5 words passes", () => {
  assert.equal(check(letter("Signature", "Satisfaction settles in quietly tonight."), CHART), null);
});

test("the shortest healthy real row (11 words) passes", () => {
  assert.equal(check(letter("Signature", SHORTEST_REAL), CHART), null);
  assert.equal(check(letterNew("Signature", "When it's on track", SHORTEST_REAL), CHART), null);
});

test("only the on / off track rows are held to it", () => {
  // The other four glance rows are not part of this rule (Jeremy chose A for the two feeling rows).
  assert.equal(check(letter("Type", "Generator."), CHART), null);
  assert.equal(trackRowProblem("IN SHORT\n\nType: A.\nStrategy: B.\n"), null);
});

/* ---------- the form ---------- */

const para = (n = 65) => Array.from({ length: n }, (_, i) => (i === 0 ? "Because" : "word")).join(" ") + ".";
const section = () => ({ lede: "You carry this one thing.", paragraphs: [para(), para()] });
const form = (summary = {}) => ({
  summary: {
    type: "A motor that renews.", strategy: "Let the question arrive first.", authority: "The gut answers.",
    profile: "Trial then example.", signature: SHORTEST_REAL, notSelf: "You wear yourself down forcing a door that will not open.", ...summary,
  },
  incarnationCross: para(60), definition: para(50),
  channels: [{ channel: "10-34", sentence: "Power goes where you believe." }],
  profileLines: [{ line: 3, sentence: "You learn by trying." }, { line: 5, sentence: "Others project onto you." }],
  energy: section(), decide: section(), meet: section(), consistent: section(), working: section(),
  takeIn: { lede: "You take things in.", paragraphs: ["Because the Head is open and the Throat is undefined, " + para(55), para()] },
  experimentIntro: "These are invitations to test against your own experience; you are the authority.",
  takeaways: ["(Sacral) The next time a small choice comes, you might pause and notice the answer, so the pause is familiar later.", "(Channel 10-34) This week, on an easy job, you might start at once and notice your energy, so that pace is familiar later.", "(Line 3) Once or twice this week, you might try a small thing twice and notice what changes, so trying is familiar later.", "(Split) Over the next few days, when a choice feels stuck, you might wait a day and notice what joins up, so the wait is familiar later."],
});
const formChart = { ...CHART, profile: "3/5", channels: ["10-34 (Exploration)"], channelLines: ["10-34 (Exploration), G to Sacral"] };
// As gemini.mjs runs it: render the form, then the whole chain on the text.
const run = (f) => {
  const r = renderReading(f, formChart);
  return r.problem ?? check(sanitize(r.text), formChart);
};

test("form: a healthy form passes", () => {
  assert.equal(run(form()), null);
});

test("form: a bare word in the signature slot is refused after rendering", () => {
  assert.match(run(form({ signature: "Satisfaction" })) ?? "", /"When it's on track" line came back as 1 word/);
  assert.match(run(form({ signature: "Satisfaction." })) ?? "", /1 word/);
});

test("form: a bare word in the notSelf slot is refused after rendering", () => {
  assert.match(run(form({ notSelf: "Frustration" })) ?? "", /"When it's off track" line came back as 1 word/);
});

test("form: a 4-word slot is refused, 5 passes", () => {
  assert.match(run(form({ notSelf: "Forcing the wrong door." })) ?? "", /4 words/);
  assert.equal(run(form({ notSelf: "You force the wrong door." })), null); // 5 words, a whole sentence (a fragment is refused for that, 10/21)
});

/* ---------- the call: a refusal is "malformed", which the job asks again for ---------- */

test("generateReading hands a bare-word draft back as malformed (the retry path), and a healthy one as ok", async () => {
  const { generateReading } = await import("../netlify/lib/gemini.mjs");
  const reply = (f) => async () =>
    new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(f) }] } }] }), { status: 200 });
  const ask = (f) => generateReading(formChart, { apiKey: "test", prompt: "p", shape: "json", fetchImpl: reply(f) });
  const bad = await ask(form({ signature: "Satisfaction" }));
  assert.equal(bad.ok, false);
  assert.equal(bad.reason, "malformed");
  assert.match(bad.detail, /"When it's on track" line came back as 1 word/);
  assert.equal((await ask(form())).ok, true);
});
