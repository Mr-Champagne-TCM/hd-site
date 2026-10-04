import { test } from "node:test";
import assert from "node:assert/strict";
import { renderReading, reservedWords, strategyProblem, structuredFacts } from "../netlify/lib/structured.mjs";
import { firstProblem, parseReading, sanitize, HEADINGS, DISCLAIMER } from "../netlify/lib/interpretation.mjs";

const para = (n = 65) => Array.from({ length: n }, (_, i) => (i === 0 ? "Because" : "word")).join(" ") + ".";
const section = () => ({ lede: "You carry this one thing.", paragraphs: [para(), para()] });
const form = (over = {}) => ({
  summary: { type: "A motor that renews.", strategy: "Let the question arrive first.", authority: "The gut answers.",
    profile: "Trial then example.", signature: "Spent on the right things.", notSelf: "Forcing the wrong door." },
  incarnationCross: para(60), definition: para(50),
  channels: [{ channel: "10-34", sentence: "Power goes where you believe." }],
  profileLines: [{ line: 3, sentence: "You learn by trying." }, { line: 5, sentence: "Others project onto you." }],
  energy: section(), decide: section(), meet: section(), consistent: section(), takeIn: section(), working: section(),
  experimentIntro: "These are invitations to test against your own experience; you are the authority.",
  takeaways: ["(Sacral) Notice a.", "(Channel 10-34) Watch b.", "(Line 3) Notice c.", "(Split) Watch d."],
  ...over,
});
const chart = { type: "Generator", profile: "3/5", channels: ["10-34 (Exploration)"],
  channelLines: ["10-34 (Exploration), G to Sacral"] };

test("the document is built with every heading, once, in order, and the disclaimer", () => {
  const { text, problem } = renderReading(form(), chart);
  assert.equal(problem, undefined);
  const lines = text.split("\n");
  const at = HEADINGS.map((h) => lines.indexOf(h));
  assert.ok(at.every((v, i) => v >= 0 && (i === 0 || v > at[i - 1])));
  for (const h of HEADINGS) assert.equal(lines.filter((l) => l === h).length, 1, h);
  assert.ok(text.endsWith(DISCLAIMER));
});

test("N-02: the channel prefix is the engine's, never the model's", () => {
  const { text } = renderReading(form(), chart);
  assert.match(text, /^10-34 \(Exploration\), G to Sacral: Power goes where you believe\.$/m);
  assert.doesNotMatch(text, /Sacral to G/);
});

test("before engine 0.3.0 the line carries no direction rather than a guessed one", () => {
  const { text } = renderReading(form(), { ...chart, channelLines: undefined });
  assert.match(text, /^10-34 \(Exploration\): Power/m);
});

test("a channel left without a sentence is a refusal, not a blank line", () => {
  const r = renderReading(form({ channels: [] }), chart);
  assert.match(r.problem, /10-34/);
});

test("profile line names are ours", () => {
  const { text } = renderReading(form(), chart);
  assert.match(text, /^Line 3 \(Martyr\), conscious: You learn by trying\.$/m);
  assert.match(text, /^Line 5 \(Heretic\), unconscious: /m);
});

test("the rendered text parses into the same shape the page and PDF use", () => {
  const { text } = renderReading(form(), chart);
  const r = parseReading(text);
  assert.equal(r.sections.length, HEADINGS.length);
  assert.equal(r.summary.Strategy, "Let the question arrive first.");
});

test("#4: invitation in the Strategy line or How you decide is refused for a non-Projector", () => {
  const f = form();
  f.summary.strategy = "Wait for the right invitation.";
  assert.match(strategyProblem(f, "Generator"), /Strategy line/);
  const g = form();
  g.decide.paragraphs[1] = "You decide once the invitation arrives.";
  assert.match(strategyProblem(g, "Manifesting Generator"), /How you decide/);
  assert.equal(strategyProblem(f, "Projector"), null);
});

test("#4: elsewhere 'invitation' is just a word (the Line 2 sentence must pass)", () => {
  const f = form();
  f.meet.paragraphs[0] = "Until the right invitation draws you out, you work alone.";
  assert.equal(strategyProblem(f, "Generator"), null);
});

test("reserved words name the other types' words and never the reader's own", () => {
  const w = reservedWords("Projector");
  assert.ok(w.includes("Satisfaction") && w.includes("Disappointment"));
  assert.ok(!w.includes("Success") && !w.includes("Bitterness"));
  assert.match(structuredFacts({ type: "Projector" }), /must not appear anywhere/);
});

test("LINE ENDINGS: a Windows-ended draft is normalised, never refused for it", () => {
  const { text } = renderReading(form(), chart);
  const crlf = text.replace(/\n/g, "\r\n");
  const lone = text.replace(/\n/g, "\r");
  assert.equal(sanitize(crlf), sanitize(text));
  assert.equal(sanitize(lone), sanitize(text));
  assert.equal(parseReading(crlf).sections.length, HEADINGS.length);
});
