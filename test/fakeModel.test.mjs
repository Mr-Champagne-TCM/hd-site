import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { generateReading } from "../netlify/lib/gemini.mjs";
import { fakeGemini, placeholderForm, redraft } from "../tools/e2e/harness/fakeGemini.mjs";
import { chartFactsOnly } from "../netlify/lib/interpretation.mjs";
import { structuredFacts } from "../netlify/lib/structured.mjs";
import { parseReading } from "../netlify/lib/interpretation.mjs";

/**
 * THE RIG'S STAND-IN WRITER PASSES THE SHOP'S OWN CHECKER (10/22, prompt v3
 * rev l). tools/e2e/harness/fakeGemini.mjs answers every reading the local rig
 * asks for: a stored live reading, its next draft when the checker refuses it
 * (refused lines stood in for, marked [RIG STAND-IN]), or a plainly marked
 * placeholder for a chart with no stored reading. Each has to come through the
 * real writer path -- generateReading, the renderer and every check -- or the
 * rig's reading-tier journeys stop at "being written" and test nothing. Run
 * here on made-up charts, with the rig's own stand-in prompt, so a checker
 * change that the fake model does not keep up with fails a unit test, not a
 * twelve-minute rig run.
 */

const PROMPT =
  "RIG STAND-IN PROMPT. Fill the JSON form. Center states: DEFINED, UNDEFINED, OPEN. Four takeaways. " +
  "Slots: energy, decide, meet, consistent, takeIn, working.";

const parity = (slug) => JSON.parse(readFileSync(new URL(`./fixtures/phone-parity/${slug}.output.json`, import.meta.url), "utf8"));
const CHARTS = [
  ["claude-test-four", parity("claude-test-four")],
  ["claude-test-three", parity("claude-test-three")],
  ["claude-test-two", parity("claude-test-two")],
  ["claude-test", parity("claude-test")],
];

/** The fake model behind a fetch, as the rig's harness wires it. */
function wired() {
  const dir = mkdtempSync(join(tmpdir(), "fakegemini-"));
  const fake = fakeGemini({ dir, fixturesDir: join(dir, "no-fixtures") });
  const fetchImpl = async (url, init) => fake.api(new Request(String(url), init));
  return { fake, fetchImpl, done: () => rmSync(dir, { recursive: true, force: true }) };
}

for (const [slug, output] of CHARTS) {
  for (const timeKnown of [true, false]) {
    test(`${slug}${timeKnown ? "" : ", birth time unknown"}: the placeholder reading comes through the shop's writer and checker`, async () => {
      const out = timeKnown
        ? output
        : { ...output, timeKnown: false, timeSpread: { v: 1, ok: true, minutes: 1440, noon: 720, window: [6, 860], changes: ["profile", "definedCenters", "undefinedCenters", "channels"], segments: {}, clock: [[0, 0]], gates: "change" } };
      const w = wired();
      try {
        const r = await generateReading(out, { apiKey: "rig", prompt: PROMPT, shape: "json", fetchImpl: w.fetchImpl });
        assert.equal(r.ok, true, `${r.reason}: ${r.detail}`);
        assert.equal(w.fake.asked.length, 1, "written on the first ask");
        assert.match(r.text, /\[RIG PLACEHOLDER\]/, "still plainly a placeholder");
        // Four try-this lines, each its own, each two sentences.
        const view = parseReading(r.text);
        const take = view?.sections?.find((s) => /experiment/i.test(s.heading))?.paragraphs?.slice(1) ?? [];
        assert.equal(take.length, 4);
        assert.equal(new Set(take).size, 4, "no try-this line repeated");
        for (const t of take) assert.equal(t.replace(/^\([^)]*\)\s*/, "").split(/(?<=[.!?])\s+(?=[A-Z])/).length, 2, t);
      } finally {
        w.done();
      }
    });
  }
}

/** The facts the writer sends, as gemini.mjs builds them in form mode. */
const factsFor = (output) => chartFactsOnly(output, { form: true }) + structuredFacts(output);
const factsOf = (output) => ({
  type: output.type,
  strategy: output.strategy,
  authority: output.authority,
  profile: output.profile,
  definition: output.definition,
  signature: output.signature,
  notSelf: output.notSelfTheme,
  cross: output.incarnationCross,
  defined: output.definedCenters,
  undefined: output.undefinedCenters,
  open: output.openCenters,
  channels: output.channels,
  timeUnknown: output.timeKnown === false,
});

for (const [slug, output] of CHARTS) {
  test(`${slug}: a stored reading the checker refuses -- the next draft comes through the writer, try-this lines each their own`, async () => {
    const f = factsOf(output);
    // A stored live reading in the v2 shape: real-looking words (no marker), one-sentence soft
    // try-this lines, "signature" on the on-track line, a glance row that is a fragment.
    const stored = JSON.parse(JSON.stringify(placeholderForm(f)).replaceAll("[RIG PLACEHOLDER] ", ""));
    stored.takeaways = stored.takeaways.map((t) => t.replace(/^(\([^)]*\)) .*$/, "$1 Notice how your energy feels after a short walk."));
    stored.working.paragraphs[0] += " Your signature emerges as a quiet sense of success when the day lands.";
    stored.summary.type = "Carrying a steady motor through the day.";
    stored.summary.strategy = "Waiting for the right moment.";
    let n = 0;
    const fetchImpl = async () => {
      n += 1;
      const form = n === 1 ? stored : redraft(stored, f, { instruction: PROMPT, facts: factsFor(output) });
      return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(form) }], role: "model" }, finishReason: "STOP" }] }), { status: 200 });
    };
    // One ask per call; interpretJob asks again after a refused draft, as here.
    const first = await generateReading(output, { apiKey: "rig", prompt: PROMPT, shape: "json", fetchImpl });
    assert.equal(first.ok, false, "the stored draft is refused");
    const r = await generateReading(output, { apiKey: "rig", prompt: PROMPT, shape: "json", fetchImpl });
    assert.equal(r.ok, true, `${r.reason}: ${r.detail}`);
    assert.equal(n, 2, "refused once, written on the second ask");
    // The model's own words stay where the checker had nothing against them; the refused sentence is gone.
    assert.doesNotMatch(r.text, /Your signature emerges/);
    const take = parseReading(r.text)?.sections?.find((s) => /experiment/i.test(s.heading))?.paragraphs?.slice(1) ?? [];
    assert.equal(take.length, 4);
    assert.equal(new Set(take).size, 4, "no try-this line repeated");
    for (const t of take) assert.equal(t.replace(/^\([^)]*\)\s*/, "").split(/(?<=[.!?])\s+(?=[A-Z])/).length, 2, t);
    // Two glance rows written again: each its own words, so the page never says one twice.
    const rows = r.text.split("\n").filter((l) => /row is written again here by the model/.test(l));
    assert.ok(rows.length >= 2, `${rows.length} rows written again`);
    assert.equal(new Set(rows).size, rows.length);
  });
}

test("the placeholder names every value the checker looks for, and marks itself", () => {
  const f = { type: "Projector", strategy: "Wait for the invitation", authority: "Splenic", profile: "2/4", definition: "Single", signature: "Success", notSelf: "Bitterness", cross: "Right Angle Cross of Eden (36/6 | 11/12)", defined: ["Spleen"], undefined: ["Head"], open: ["Heart"], channels: ["18-58 (Judgment)"] };
  const form = placeholderForm(f);
  assert.match(JSON.stringify(form), /\[RIG PLACEHOLDER\]/);
  assert.equal(form.takeaways.length, 4);
});
