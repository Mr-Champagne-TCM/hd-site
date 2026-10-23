import { test } from "node:test";
import assert from "node:assert/strict";
import { getSlot, renderReading, setSlots, slotLabel, slotNote, structuredFacts, factCards, FACT_CARDS, READING_SCHEMA } from "../netlify/lib/structured.mjs";
import { allProblems, copyProblem, draftProblem, firstProblem, sanitize } from "../netlify/lib/interpretation.mjs";
import { FIX_ASK, FIX_DRAFT, FIX_SLOTS, findQuote, fixRequest, locate, mergeFix, planFix, quotesOf, refusedPlan } from "../netlify/lib/reask.mjs";
import { generateReading } from "../netlify/lib/gemini.mjs";
import { ASKS, PART_ASKS, PART_TRIES, ASK_GAP_MS, interpretOne } from "../netlify/lib/interpretJob.mjs";
import { saveReading, fillReading, loadReading } from "../netlify/lib/reading.mjs";

/**
 * RE-ASK ONLY THE FAILING PART (Jeremy 10/23: "yes, reask only failing part").
 * A refused draft's problems are traced to the slots of the form they rest on;
 * the model is asked for those slots only, with its own draft and the
 * checker's words; its answer goes back into its own draft and every check
 * runs again. Nothing here writes a word of a reading: the forms are made up.
 */

const para = (n = 65) => Array.from({ length: n }, (_, i) => (i === 0 ? "Because" : "word")).join(" ") + ".";
const section = () => ({ lede: "You carry this one thing.", paragraphs: [para(), para()] });
const SHAPE_A = [
  "(Sacral) The next time a small choice comes, you might pause. Notice the answer, so the pause is familiar later.",
  "(Channel 10-34) This week, on an easy job, you might start at once. Notice your energy, so that pace is familiar later.",
  "(Line 3) Once or twice this week, you might try a small thing twice. Notice what changes, so trying is familiar later.",
  "(Split) Over the next few days, when a choice feels stuck, you might wait a day. Notice what joins up, so the wait is familiar later.",
];
const named = { lede: "You take things in.", paragraphs: ["Because the Head is open and the Throat is undefined, " + para(55), para()] };
const form = (over = {}) => ({
  summary: { type: "A motor that renews.", strategy: "Let the question arrive first.", authority: "The gut answers.",
    profile: "Trial then example.", signature: "Spent on the right things.", notSelf: "You wear yourself down forcing a door that will not open." },
  incarnationCross: para(60), definition: para(50),
  channels: [{ channel: "10-34", sentence: "Power goes where you believe." }],
  profileLines: [{ line: 3, sentence: "You learn by trying." }, { line: 5, sentence: "Others project onto you." }],
  energy: section(), decide: section(), meet: section(), consistent: section(), takeIn: named, working: section(),
  experimentIntro: "These are invitations to test against your own experience; you are the authority.",
  takeaways: SHAPE_A,
  ...over,
});
const chart = {
  type: "Generator", profile: "3/5", definition: "Single", channels: ["10-34 (Exploration)"], channelLines: ["10-34 (Exploration), G to Sacral"],
  definedCenters: ["G", "Sacral"], undefinedCenters: ["Throat", "Spleen"], openCenters: ["Head", "Ajna", "Heart", "Solar Plexus", "Root"],
};
const verdict = (f, ch = chart) => {
  const r = renderReading(f, ch);
  if (r.problem) return r.problem;
  const t = sanitize(r.text);
  return firstProblem(t, ch.type, ch.profile, ch.openCenters, ch.undefinedCenters, ch.definedCenters) ?? draftProblem(t, ch);
};
const plan = (f, ch = chart, copy = {}) => refusedPlan({ form: f, output: ch, rendered: renderReading(f, ch), copy });

test("the clean form passes every check (the base the other cases change one slot of)", () => {
  assert.equal(verdict(form()), null);
});

test("SPANS: every slot's words sit exactly where renderReading says, and the text is unchanged", () => {
  const f = form();
  const r = renderReading(f, chart);
  assert.equal(r.spans.length, 6 + 2 + 1 + 2 + 6 * 3 + 1 + 4);
  for (const s of r.spans) assert.equal(r.text.slice(s.start, s.end), getSlot(f, s.id), s.id);
  assert.deepEqual(r.spans.slice(0, 3).map((s) => s.id), ["summary_type", "summary_strategy", "summary_authority"]);
  assert.ok(r.spans.some((s) => s.id === "channel_10_34") && r.spans.some((s) => s.id === "profileLine_5"));
  assert.equal(r.spans.at(-1).id, "takeaway_4");
  // The prefixes are ours: the channel line's span starts after "10-34 (Exploration), G to Sacral: ".
  const ch = r.spans.find((s) => s.id === "channel_10_34");
  assert.equal(r.text.slice(ch.start - 2, ch.start), ": ");
});

test("setSlots / getSlot: every kind of slot, the last entry with a value is the one printed, a missing one is added", () => {
  const ids = ["summary_notSelf", "incarnationCross", "definition", "channel_10_34", "profileLine_3", "decide_lede", "decide_paragraph_2", "experimentIntro", "takeaway_3"];
  const f = setSlots(form(), Object.fromEntries(ids.map((id) => [id, `New words for ${id}.`])));
  for (const id of ids) assert.equal(getSlot(f, id), `New words for ${id}.`, id);
  assert.equal(form().summary.notSelf, "You wear yourself down forcing a door that will not open.", "the original form is untouched");
  const twice = form({ channels: [{ channel: "10-34", sentence: "First." }, { channel: "10-34", sentence: "Second." }] });
  assert.match(renderReading(twice, chart).text, /: Second\.$/m);
  assert.equal(getSlot(setSlots(twice, { channel_10_34: "Third." }), "channel_10_34"), "Third.");
  const missing = setSlots(form({ channels: [] }), { channel_10_34: "Power goes where you believe." });
  assert.equal(verdict(missing), null);
  assert.match(slotNote("takeaway_2"), /^TWO sentences/);
  assert.equal(slotNote("energy_paragraph_1"), READING_SCHEMA.properties.energy.properties.paragraphs.items.description);
  assert.equal(slotLabel("decide_paragraph_2"), 'paragraph 2 of "How you decide"');
  assert.equal(slotLabel("summary_signature"), `the "When it's on track" line`);
});

test("EVERY PROBLEM, the production verdict first", () => {
  const f = setSlots(form(), { meet_paragraph_2: "Your body graph hums. " + para(50), takeaway_2: "This week you might start." });
  const r = renderReading(f, chart);
  const all = allProblems(sanitize(r.text), chart, {});
  assert.equal(all[0].message, verdict(f));
  assert.ok(all.length >= 2, JSON.stringify(all));
  assert.ok(all.some((p) => p.rule === "slip") && all.some((p) => p.rule === "takeaway"));
});

test("a known slip in one paragraph rests on that paragraph", () => {
  const f = setSlots(form(), { meet_paragraph_2: "Your body graph hums. " + para(50) });
  const p = plan(f);
  assert.deepEqual(p.parts.map((x) => x.id), ["meet_paragraph_2"]);
  assert.match(p.parts[0].messages[0], /body graph/);
  assert.equal(p.parts[0].words, getSlot(f, "meet_paragraph_2"));
});

test("a slip read across a lede and its first paragraph rests on the paragraph that has it", () => {
  const f = setSlots(form(), { meet_lede: "You meet the world with care.", meet_paragraph_1: "Your strategy of wait to respond holds. " + para(50) });
  const p = plan(f);
  assert.deepEqual(p.parts.map((x) => x.id), ["meet_paragraph_1"]);
});

test("two problems in two slots: both asked for, in page order, each with its own message", () => {
  const f = setSlots(form(), { takeaway_2: "This week you might start.", decide_paragraph_1: "Your body graph knows. " + para(50) });
  const p = plan(f);
  assert.deepEqual(p.parts.map((x) => x.id), ["decide_paragraph_1", "takeaway_2"]);
  assert.match(p.parts[0].messages.join(" "), /body graph/);
  assert.match(p.parts[1].messages.join(" "), /takeaway/i);
});

test("a center missing from What you take in from others: the section is asked for (nothing to blank)", () => {
  const f = form({ takeIn: section() });
  const p = plan(f);
  assert.match(p.problems[0].message, /never names one/);
  assert.deepEqual(p.parts.map((x) => x.id), ["takeIn_lede", "takeIn_paragraph_1", "takeIn_paragraph_2"]);
});

test("a one-word on-track row and a fragment Strategy row rest on their rows", () => {
  assert.deepEqual(plan(setSlots(form(), { summary_signature: "Satisfaction" })).parts.map((x) => x.id), ["summary_signature"]);
  assert.deepEqual(plan(setSlots(form(), { summary_strategy: "Waiting for the moment" })).parts.map((x) => x.id), ["summary_strategy"]);
});

test("forms that do not render: a channel left without a sentence and an invitation in How you decide are local; placeholders are not", () => {
  assert.deepEqual(plan(form({ channels: [] })).parts.map((x) => x.id), ["channel_10_34"]);
  const mg = { ...chart, type: "Manifesting Generator" };
  const inv = setSlots(form(), { decide_paragraph_2: "You decide once the invitation arrives." });
  assert.deepEqual(plan(inv, mg).parts.map((x) => x.id), ["decide_paragraph_2"]);
  const strings = JSON.parse(JSON.stringify(form()), (k, v) => (typeof v === "string" ? "string" : v));
  assert.equal(plan(strings).parts, null);
});

test("NOT LOCAL: too short, and more failing slots than FIX_SLOTS, get a fresh draft", () => {
  const short = form({ energy: { lede: "You.", paragraphs: ["Short.", "Short."] }, decide: { lede: "You.", paragraphs: ["Short.", "Short."] },
    meet: { lede: "You.", paragraphs: ["Short.", "Short."] }, consistent: { lede: "You.", paragraphs: ["Short.", "Short."] },
    working: { lede: "You.", paragraphs: ["Short.", "Short."] }, incarnationCross: "Short.", definition: "Short." });
  assert.equal(plan(short).parts, null);
  const many = setSlots(form(), Object.fromEntries(["energy", "decide", "meet", "consistent", "working", "takeIn"].map((s) => [`${s}_paragraph_2`, "Your body graph. " + para(50)])));
  const p = plan(many);
  assert.ok(p.problems.length >= 1);
  // The slip check names the first only; the others show once it is fixed. Six slips in six slots, one named now.
  assert.ok(!p.parts || p.parts.length <= FIX_SLOTS);
});

test("a copy across two slots is not local; a copy inside one is", () => {
  const sources = ["the quiet hour before the market opens on a working day comes around"];
  const one = setSlots(form(), { meet_paragraph_2: "You like the quiet hour before the market opens on a working day. " + para(50) });
  const p = plan(one, chart, { sources, allowed: [] });
  assert.deepEqual(p.parts.map((x) => x.id), ["meet_paragraph_2"]);
  assert.match(p.parts[0].messages[0], /copies/);
});

test("quotes and where they sit: the excerpt's dots set aside, a lower-case copy quote found word for word", () => {
  assert.deepEqual(quotesOf('The reading says "body graph" in "X", a known slip: "...your body graph hums..."'), ["body graph", "your body graph hums"]);
  const text = "IN SHORT\n\nType: You Like The Quiet Hour, before the market opens.";
  assert.deepEqual(findQuote(text, "type: you like the quiet hour before the market opens"), [16, 58], "the first and last words may be cut: left out");
  assert.equal(findQuote(text, "nothing like this at all here"), null);
});

test("THE RE-ASK: the draft with the part marked, the part's own words, the checker's exact message, a small form", () => {
  const f = setSlots(form(), { meet_paragraph_2: "Your body graph hums. " + para(50) });
  const p = plan(f);
  const { text, schema } = fixRequest(f, chart, p.parts);
  assert.ok(text.includes(FIX_DRAFT) && text.includes(FIX_ASK));
  assert.ok(text.includes("PART meet_paragraph_2 GOES HERE"));
  assert.ok(text.includes(`Part "meet_paragraph_2", paragraph 2 of "How you meet the world". As you wrote it:\nYour body graph hums.`));
  assert.ok(text.includes(`What the check said: ${p.parts[0].messages[0]}`));
  assert.ok(text.includes("Power goes where you believe."), "the rest of the draft is there to read");
  assert.ok(text.indexOf("Your body graph hums.") > text.indexOf(FIX_ASK), "in the draft the refused words are replaced by the mark");
  assert.deepEqual(schema.required, ["meet_paragraph_2"]);
  assert.equal(schema.properties.meet_paragraph_2.description, slotNote("meet_paragraph_2"));
});

test("mergeFix keeps only the asked-for slots, only strings: the rest of the draft is the model's own, unchanged", () => {
  const f = setSlots(form(), { meet_paragraph_2: "Your body graph hums. " + para(50) });
  const parts = plan(f).parts;
  const merged = mergeFix(f, parts, { meet_paragraph_2: "Your bodygraph hums. " + para(50), energy_lede: "Sneaked in.", other: 3 });
  assert.equal(getSlot(merged, "meet_paragraph_2"), "Your bodygraph hums. " + para(50));
  assert.equal(getSlot(merged, "energy_lede"), "You carry this one thing.");
  assert.equal(verdict(merged), null);
  assert.equal(getSlot(mergeFix(f, parts, { meet_paragraph_2: 7 }), "meet_paragraph_2"), getSlot(f, "meet_paragraph_2"));
});

/* --------------------------------------------------------------- the request itself */

const PROMPT = "CENTERS HAVE THREE STATES: DEFINED, UNDEFINED and OPEN.\nOUTPUT: fill the JSON form you are given.\nenergy, decide, meet, consistent, takeIn, working: six sections.\ntakeaways: FOUR.";
const reply = (obj) => ({ ok: true, status: 200, json: async () => ({ candidates: [{ content: { parts: [{ text: JSON.stringify(obj) }] } }] }) });

test("generateReading with a fix: the facts, the draft and the part go out with the small form; the answer is merged and judged whole", async () => {
  const f = setSlots(form(), { meet_paragraph_2: "Your body graph hums. " + para(50) });
  const first = plan(f);
  const seen = [];
  const fetchImpl = async (_url, opts) => {
    seen.push(JSON.parse(opts.body));
    return reply({ meet_paragraph_2: "Your bodygraph hums. " + para(50) });
  };
  const r = await generateReading(chart, { apiKey: "k", prompt: PROMPT, shape: "json", fetchImpl, fix: { form: f, parts: first.parts } });
  assert.equal(r.ok, true, r.detail);
  assert.equal(seen.length, 1);
  const body = seen[0];
  assert.deepEqual(body.generationConfig.responseSchema.required, ["meet_paragraph_2"]);
  const user = body.contents[0].parts[0].text;
  assert.ok(user.startsWith("Type: Generator"), "the facts come first");
  assert.ok(user.includes(FIX_ASK) && user.includes("What the check said:"));
  assert.ok(!/Made Up|@/.test(user), "no identity travels");
  assert.match(r.text, /Your bodygraph hums\./);
});

test("a part answer that copies the re-ask's own words is refused like any copy", async () => {
  const f = setSlots(form(), { meet_paragraph_2: "Your body graph hums. " + para(50) });
  const parts = plan(f).parts;
  const copied = "Fix exactly what the check says, keep to every rule you were given, and more. " + para(50);
  const r = await generateReading(chart, { apiKey: "k", prompt: PROMPT, shape: "json", fetchImpl: async () => reply({ meet_paragraph_2: copied }), fix: { form: f, parts } });
  assert.equal(r.ok, false);
  assert.match(r.detail, /copies \d+ words in a row from its instructions/);
  assert.deepEqual(r.plan.parts.map((p) => p.id), ["meet_paragraph_2"], "and it is local again");
});

test("a refused whole draft comes back with its form and its plan; a passing one with its form", async () => {
  const f = setSlots(form(), { takeaway_2: "This week you might start." });
  const r = await generateReading(chart, { apiKey: "k", prompt: PROMPT, shape: "json", fetchImpl: async () => reply(f) });
  assert.equal(r.ok, false);
  assert.deepEqual(r.plan.parts.map((p) => p.id), ["takeaway_2"]);
  assert.deepEqual(r.form, f);
  const ok = await generateReading(chart, { apiKey: "k", prompt: PROMPT, shape: "json", fetchImpl: async () => reply(form()) });
  assert.equal(ok.ok, true);
  assert.deepEqual(ok.form, form());
});

/* --------------------------------------------------------------- the job */

function fakeStore() {
  const data = new Map();
  return {
    data,
    async setJSON(key, value) { data.set(key, JSON.parse(JSON.stringify(value))); },
    async get(key) { return data.get(key) ?? null; },
    async list() { return { blobs: [...data.keys()].map((key) => ({ key })) }; },
  };
}
async function ready() {
  const store = fakeStore();
  const id = await saveReading(store, { tier: 2, output: null, name: "Made Up", email: "made-up@example.com", phone: null, sku: "reading", purchasedAt: Date.now() });
  await fillReading(store, id, chart);
  return { store, id };
}
const refusedWithPart = (id = "takeaway_2") => ({ ok: false, reason: "malformed", detail: "A takeaway is wrong.", form: form(), plan: { parts: [{ id, label: id, words: "x", messages: ["A takeaway is wrong."] }] } });

test("THE JOB: a refused draft with a local problem is asked for its part, not a new reading, and the part passes", async () => {
  const { store, id } = await ready();
  const health = fakeStore();
  const asked = [];
  const r = await interpretOne({
    id, store, health, apiKey: "k", prompt: PROMPT, sleep: async () => {},
    generate: async (_o, opts) => {
      asked.push(opts.fix ? `part:${opts.fix.parts.map((p) => p.id)}` : "draft");
      return asked.length === 1 ? refusedWithPart() : { ok: true, text: renderReading(form(), chart).text };
    },
  });
  assert.equal(r.ok, true);
  assert.deepEqual(asked, ["draft", "part:takeaway_2"]);
  assert.equal(r.asks, 2);
  assert.equal(r.partAsks, 1);
  assert.ok((await loadReading(store, id)).reading);
  assert.equal([...health.data.values()].length, 1, "the refused draft is on file");
});

test("THE JOB: a part asked for PART_TRIES times and still refused gets a fresh draft; fresh drafts stay at ASKS", async () => {
  const { store, id } = await ready();
  const health = fakeStore();
  const asked = [];
  const r = await interpretOne({
    id, store, health, apiKey: "k", prompt: PROMPT, sleep: async () => {},
    generate: async (_o, opts) => {
      asked.push(opts.fix ? "part" : "draft");
      return refusedWithPart();
    },
  });
  assert.equal(r.ok, false);
  assert.equal(asked.filter((a) => a === "draft").length, ASKS);
  assert.equal(asked.filter((a) => a === "part").length, PART_ASKS);
  // Each fresh draft resets the slot's count: three part asks after it, then a fresh draft.
  assert.deepEqual(asked.slice(0, PART_TRIES + 2), ["draft", ...Array(PART_TRIES).fill("part"), "draft"]);
  // The alarm's count per job is what it was before part asks: four refusals and the final one.
  const kinds = [...health.data.values()].map((i) => i.kind).sort();
  assert.deepEqual(kinds, ["gemini-refused", "gemini-refused", "gemini-refused", "gemini-refused", "gemini-refused-5x"]);
});

test("THE JOB: a part ask waits ASK_GAP_MS after the ask before it started (the free tier's per-minute count)", async () => {
  const { store, id } = await ready();
  let now = 1_000_000;
  const waits = [];
  await interpretOne({
    id, store, health: fakeStore(), apiKey: "k", prompt: PROMPT, clock: () => now,
    sleep: async (ms) => { waits.push(ms); now += ms; },
    generate: async (_o, opts) => {
      now += opts.fix ? 2_000 : 15_000;
      return opts.fix ? { ok: true, text: renderReading(form(), chart).text } : refusedWithPart();
    },
  });
  // The fresh draft took 15 s, longer than the gap: no wait.
  assert.deepEqual(waits, []);
  const { store: s2, id: id2 } = await ready();
  const waits2 = [];
  let n = 0;
  await interpretOne({
    id: id2, store: s2, health: fakeStore(), apiKey: "k", prompt: PROMPT, clock: () => now,
    sleep: async (ms) => { waits2.push(ms); now += ms; },
    generate: async (_o, opts) => {
      n += 1;
      now += opts.fix ? 2_000 : 15_000;
      return n < 3 ? refusedWithPart(`takeaway_${n + 1}`) : { ok: true, text: renderReading(form(), chart).text };
    },
  });
  assert.deepEqual(waits2, [ASK_GAP_MS - 2_000], "the second part ask waits for the gap");
});

test("THE JOB: a problem that is not local (no plan parts) gets a fresh draft, as before", async () => {
  const { store, id } = await ready();
  const asked = [];
  await interpretOne({
    id, store, health: fakeStore(), apiKey: "k", prompt: PROMPT, sleep: async () => {},
    generate: async (_o, opts) => {
      asked.push(opts.fix ? "part" : "draft");
      return { ok: false, reason: "malformed", detail: "The reading came back too short to hand over.", form: form(), plan: { parts: null } };
    },
  });
  assert.deepEqual(asked, Array(ASKS).fill("draft"));
});

/* --------------------------------------------------------------- fact cards (an A/B arm) */

test("FACT CARDS are off in production until measured; on, each center gets its state, motor, joins and themes", () => {
  assert.equal(FACT_CARDS, false);
  const facts = { ...chart, personality: [{ planet: "Sun", gate: 21, line: 2 }], design: [{ planet: "Sun", gate: 26, line: 5 }, { planet: "Moon", gate: 64, line: 1 }] };
  assert.doesNotMatch(structuredFacts(facts), /Center notes/);
  const on = structuredFacts(facts, { cards: true });
  assert.match(on, /Center notes for this chart/);
  assert.match(on, /^Sacral: defined; a motor; joined to the G by Channel 10-34; themes: life force, work energy, keeping going\.$/m);
  assert.match(on, /^G: defined; not a motor; joined to the Sacral by Channel 10-34; themes: identity, direction, love\.$/m);
  assert.match(on, /^Heart: open, no gate lit; a motor; no channel;/m, "the chart lists the Heart as open");
  assert.match(on, /^Head: open, no gate lit; not a motor; no channel;/m);
  const und = factCards({ ...facts, undefinedCenters: ["Throat", "Spleen", "Heart"], openCenters: ["Head", "Ajna", "Solar Plexus", "Root"] });
  assert.match(und, /^Heart: undefined, gates 21 and 26 lit; a motor; no channel;/m);
  assert.doesNotMatch(on, /split/i, "a single definition names no parts");
});

test("FACT CARDS name a split chart's parts and that a split is not a bridge", () => {
  const split = {
    type: "Projector", definition: "Split", channels: ["25-51 (Initiation)", "30-41 (Recognition)"],
    definedCenters: ["G", "Heart", "Solar Plexus", "Root"], undefinedCenters: [], openCenters: [],
  };
  const c = factCards(split);
  assert.match(c, /The split's parts: G and Heart \(one part\); Solar Plexus and Root \(another part\)\. No channel of this chart joins one part to another; the split is not a bridge\./);
});
