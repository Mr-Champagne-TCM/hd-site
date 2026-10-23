import { test } from "node:test";
import assert from "node:assert/strict";
import {
  INTERPRETATION,
  MECHANICS,
  TAKEAWAYS,
  adviceOrderProblem,
  birthTimeNote,
  birthTimeProblem,
  borrowedWordProblem,
  chartFactsOnly,
  doubledWordProblem,
  draftProblem,
  provisionalValues,
  slipProblem,
  themeCapProblem,
  themeSpellingProblem,
  voiceProblem,
} from "../netlify/lib/interpretation.mjs";
import { PLACEHOLDERS, READING_SCHEMA, placeholderProblem, renderReading, schemaNotes } from "../netlify/lib/structured.mjs";
import { generateReading } from "../netlify/lib/gemini.mjs";
import { interpretOne } from "../netlify/lib/interpretJob.mjs";
import { saveReading, fillReading } from "../netlify/lib/reading.mjs";
import { TEXT } from "./support/tier2Fixture.mjs";

/**
 * PROMPT v3 REV L AND ITS CHECKS (10/22, offline, after the v3 AI test round).
 * Every rule here was measured on all 347 stored drafts of the v2 and v3
 * rounds before it was kept: each refuses what the round delivered, and no
 * draft it refuses was a good one. Made-up sentences and charts only.
 */

/** A reading of one section holding `p` (the checks read the sections they find). */
const section = (p, heading = INTERPRETATION[2]) => `${heading}\n\n${p}\n`;
const chart = (type, more = {}) => ({ type, profile: "1/3", ...more });

/* ------------------------------------------------- another type's word, anywhere */

test("TYPE WORDS: an invitation waited for is a Projector's, wherever it is said (R06, R11, R12)", () => {
  const p = section("You meet the world best when you wait for an external invitation to spark into motion.");
  for (const type of ["Generator", "Manifesting Generator", "Manifestor", "Reflector"]) {
    assert.match(borrowedWordProblem(p, chart(type)), new RegExp(`gives a ${type} another type's word, "invitation", in "How you meet the world"`));
  }
  assert.equal(borrowedWordProblem(p, chart("Projector")), null, "a Projector's own word passes");
  assert.match(borrowedWordProblem(section("Your life force lights up when it meets the right outer invitations."), chart("Generator")), /"invitations"/);
  assert.match(borrowedWordProblem(section("An external cue invites your voice into the room."), chart("Generator")), /"invites your voice"/);
});

test("TYPE WORDS: a literal invitation, a denied one, the 2 line's and the try-this intro all pass", () => {
  const g = chart("Generator");
  for (const p of [
    "A casual invitation to a dinner party is a fine place to watch your gut.",
    "When an invitation to join a project arrives from a friend, your gut answers first.",
    "You never need to wait for an invitation; your gut answers what arrives.",
    "You might decline an invitation that your gut says no to.",
  ]) assert.equal(borrowedWordProblem(section(p), g), null, p);
  // The 2 line is called out (10/7): a 2/4 chart's own idiom.
  const hermit = section("You often meet the world by retreating until an external invitation calls you forth.");
  assert.equal(borrowedWordProblem(hermit, chart("Manifestor", { profile: "2/4" })), null);
  assert.match(borrowedWordProblem(hermit, chart("Manifestor", { profile: "1/3" })), /"invitation"/);
  // The paragraph the prompt asks for ("these are invitations to test") is not a strategy.
  assert.equal(borrowedWordProblem(`${TAKEAWAYS}\n\nThese are invitations to test, not instructions.\n`, g), null);
});

test("TYPE WORDS: satisfaction and frustration about the reader are a Generator's; respond, inform, the lunar cycle", () => {
  const sat = section("When you rest, your whole system relaxes into deep satisfaction.");
  assert.match(borrowedWordProblem(sat, chart("Projector")), /gives a Projector another type's word, "satisfaction"/);
  assert.equal(borrowedWordProblem(sat, chart("Generator")), null);
  assert.equal(borrowedWordProblem(section("The people around you feel frustration when plans stall."), chart("Projector")), null, "about other people");
  assert.match(borrowedWordProblem(section("You wait to respond before you move."), chart("Projector")), /"wait to respond"/);
  assert.equal(borrowedWordProblem(section("You wait to respond before you move."), chart("Manifesting Generator")), null);
  assert.match(borrowedWordProblem(section("You inform others before you act."), chart("Generator")), /"inform others before"/);
  assert.equal(borrowedWordProblem(section("You inform others before you act."), chart("Manifestor")), null);
  assert.match(borrowedWordProblem(section("Give a big choice a full lunar cycle."), chart("Generator")), /"lunar cycle"/);
  assert.equal(borrowedWordProblem(section("Give a big choice a full lunar cycle."), chart("Reflector")), null);
  assert.equal(borrowedWordProblem(sat, {}), null, "no type, nothing to judge");
});

/* ------------------------------------------------------------- it asks, it never tells */

test("VOICE: 'you must' anywhere, and 'you need to / have to / should' heading a clause, are refused (R22)", () => {
  assert.match(voiceProblem(section("Your Spleen offers quiet wisdom that you must catch in the moment.")), /tells the reader "you must" in "How you meet the world"/);
  assert.match(voiceProblem(section("You need to talk things over before a choice.")), /"you need to"/);
  assert.match(voiceProblem(section("Feelings take time, so you have to wait.")), /"you have to"/);
  for (const p of [
    "You never need to rush a choice.",
    "Pressure can make you feel as though you must rush.",
    "Notice how you must live when no one is watching.",
    "This is a place to rest when you need to reset.",
  ]) assert.equal(voiceProblem(section(p)), null, p);
});

/* ------------------------------------------------------------------------ slips */

test("SLIPS: a word said twice (R19 and others), a misspelled feeling word (R20), 'authority is defined'", () => {
  for (const [p, said] of [
    ["You bring a resilient resilience to hard days.", "a resilient resilience"],
    ["It guards your survival and behavioral survival.", "survival and behavioral survival"],
    ["You carry a competitive spirit and resilient spirit.", "spirit and resilient spirit"],
    ["The Root centers round out your regions with instinctive survival instincts.", "instinctive survival instincts"],
  ]) assert.match(doubledWordProblem(section(p)), new RegExp(`says a word twice in "How you meet the world", a slip: ".*${said}`), p);
  for (const p of [
    "Mental questions, mental pressure and mental noise come and go.",
    "The gates of the cross sit at twenty-eight and twenty-seven degrees of arc.",
    "Step by step, day after day, it adds up.",
    "Your consistent and considered pace is yours.",
  ]) assert.equal(doubledWordProblem(section(p)), null, p);
  assert.match(themeSpellingProblem(section("Biterness shows up when you are unseen.")), /spells "Biterness" .*a near miss of "bitterness"/);
  assert.equal(themeSpellingProblem(section("Bitterness, frustration and disappointment are all feelings; satisfying ones too.")), null);
  assert.match(slipProblem(section("Because your emotional authority is defined, clarity takes time.", INTERPRETATION[1])), /says "authority is defined" in "How you decide", a known slip/);
});

/* --------------------------------------------------------- an unknown birth time */

const SPREAD = (changes) => ({ v: 1, ok: true, minutes: 1440, noon: 720, window: [600, 900], changes, segments: {}, clock: [[0, 0]], gates: "change" });
const unknown = (type, changes, more = {}) => ({ type, profile: "4/6", timeKnown: false, timeSpread: SPREAD(changes), ...more });

test("THE NOTE carries the measured list, and only it (Jeremy 10/22: not 'so much info tied to the uncertainty')", () => {
  const n = birthTimeNote(unknown("Projector", ["profile", "definedCenters", "undefinedCenters", "channels"]), { form: true });
  assert.match(n, /^NOTE: birth time was not known and the chart was cast at noon\. Measured across the whole birth day, these values can change with the birth time: Profile, the centers' states \(defined, undefined or open\) and Channels\. Every other value above holds at any birth time\./);
  assert.match(n, /at most once, in plain words, as those values being provisional\. Never call any other value uncertain/);
  assert.doesNotMatch(n, /Type|Authority|cannot be confirmed/);
  // Nothing changes: nothing to say.
  assert.match(birthTimeNote(unknown("Generator", [])), /every value above holds at any birth time; the page already says so\. Do not mention the birth time/);
  // No usable spread (an older record, or one not ok): the engine's own list, then the old three.
  const old = { type: "Generator", timeKnown: false, provisional: ["type", "strategy", "authority", "profile", "notSelfTheme", "signature"] };
  assert.match(birthTimeNote(old, { form: true }), /^NOTE: [^]*These values can change with the birth time: Type, Strategy, Inner Authority, Profile, the off-track feeling and the on-track feeling\./);
  assert.deepEqual(provisionalValues({ ...old, timeSpread: { ...SPREAD([]), ok: false } }).fields, old.provisional);
  assert.deepEqual(provisionalValues({ type: "Generator", timeKnown: false }), { measured: false, fields: ["type", "authority", "profile"] });
  assert.equal(birthTimeNote({ type: "Generator", timeKnown: true }), null);
  assert.doesNotMatch(chartFactsOnly({ type: "Generator", timeKnown: true }), /NOTE/);
  assert.ok(chartFactsOnly(unknown("Projector", ["profile"]), { form: true }).trimEnd().endsWith(birthTimeNote(unknown("Projector", ["profile"]), { form: true })));
});

test("BIRTH TIME: a value the birth day does not change, called uncertain, is refused (R33, R34 drafts)", () => {
  const projector = unknown("Projector", ["profile", "definedCenters", "undefinedCenters", "openCenters", "channels"]);
  const energy = (p) => section(p, INTERPRETATION[0]);
  assert.match(
    birthTimeProblem(energy("Because your birth time was not known and the chart was cast at noon, your Profile, Type and Authority cannot be confirmed."), projector),
    /calls the Type uncertain in "Your energy, and how it starts", but measured across the birth day it holds at any birth time/,
  );
  assert.match(birthTimeProblem(energy("Your exact Type, Strategy, and Authority cannot be strictly confirmed without a birth time."), projector), /the Type uncertain/);
  assert.match(birthTimeProblem(energy("Because your birth time was not known, your exact chart configuration cannot be confirmed."), projector), /calls the whole chart uncertain/);
  // What the NOTE lists may be said, once, plainly; a denial is not a claim.
  assert.equal(birthTimeProblem(energy("Your birth time isn't known, so your Profile and the states of your centers are provisional."), projector), null);
  assert.equal(birthTimeProblem(energy("Your birth time isn't known; your Type and Authority are not provisional, and your Profile is."), projector), null);
  // A Generator whose Type, Authority and Profile all change that day: the same sentence is true.
  const generator = unknown("Generator", ["type", "strategy", "authority", "profile", "channels"]);
  assert.equal(birthTimeProblem(energy("Because your birth time was not known, your Profile, Type and Authority cannot be confirmed."), generator), null);
  // Without a birth-time sentence, ordinary words are ordinary: "may change how you think".
  assert.equal(birthTimeProblem(energy("Your open Head center may change how you think from day to day."), unknown("Generator", [])), null);
  // Nothing changes: any caveat about the birth time is one too many.
  assert.match(birthTimeProblem(energy("Parts of this reading may change with your birth time."), unknown("Generator", [])), /calls the chart uncertain .*every value holds/);
  // A known time is timeClaimProblem's, not this check's.
  assert.equal(birthTimeProblem(energy("Your Type cannot be confirmed."), { type: "Generator", timeKnown: true }), null);
});

test("BIRTH TIME: said once at most, and never in the summary lines (stored drafts said it up to four times)", () => {
  const g = unknown("Generator", ["type", "authority", "profile"]);
  const twice = `${INTERPRETATION[0]}\n\nYour birth time isn't known, so your Profile is provisional. Your birth time also shapes your gates.\n`;
  assert.match(birthTimeProblem(twice, g), /mentions the birth time 2 times \("Your energy, and how it starts"\); once at most/);
  const row = "IN SHORT\n\nType: Because birth time was not known, your Type is provisional.\n\n";
  assert.match(birthTimeProblem(row, g), /mentions the birth time in the "Type" line; the page says it beside the chart/);
});

/* --------------------------------------------------------- placeholders, not writing */

test("PLACEHOLDERS: a form of 'string' (rev a-j, 29 forms) or one 'string' slot (R32) is refused before it is built", () => {
  const all = { summary: { type: "string", strategy: "string" }, energy: { lede: "string", paragraphs: ["string", "string"] }, profileLines: [{ line: 0, sentence: "string" }] };
  assert.equal(placeholderProblem(all), `${PLACEHOLDERS}: "string" in 6 of 6 slots.`);
  assert.equal(renderReading(all, { type: "Generator" }).problem, `${PLACEHOLDERS}: "string" in 6 of 6 slots.`);
  assert.equal(placeholderProblem({ a: "yaml", b: ["yaml"], c: "YAML " }), `${PLACEHOLDERS}: "yaml" in 3 of 3 slots.`);
  assert.equal(placeholderProblem({ summary: { type: "string", strategy: "You wait for what arrives." } }), `${PLACEHOLDERS}: "string" in 1 of 2 slots.`);
  assert.equal(placeholderProblem({ summary: { type: "A string of small yeses is how you build.", strategy: "None of it is forced." } }), null);
});

async function waitingReading() {
  const data = new Map();
  const store = {
    data,
    async setJSON(k, v) { data.set(k, JSON.parse(JSON.stringify(v))); },
    async get(k) { return data.get(k) ?? null; },
    async list() { return { blobs: [...data.keys()].map((key) => ({ key })) }; },
  };
  const id = await saveReading(store, { tier: 2, output: null, name: "Wren Testwell", email: "wren@example.com", phone: null, sku: "reading", purchasedAt: Date.now() });
  await fillReading(store, id, { type: "Projector", profile: "1/3", authority: "Mental" });
  return { store, id, health: { ...store, data: new Map(), async setJSON(k, v) { this.data.set(k, v); } } };
}

test("PLACEHOLDERS: re-asked like a refusal, and filed as its own kind so health counts it", async () => {
  const { store, id, health } = await waitingReading();
  let n = 0;
  const r = await interpretOne({
    id, store, health, apiKey: "k", prompt: "p",
    generate: async () => (++n === 1 ? { ok: false, reason: "malformed", detail: `${PLACEHOLDERS}: "string" in 35 of 35 slots.` } : n === 2 ? { ok: false, reason: "malformed", detail: "A takeaway is one sentence" } : { ok: true, text: TEXT }),
  });
  assert.equal(r.ok, true);
  assert.deepEqual([...health.data.values()].map((e) => e.kind), ["gemini-placeholder", "gemini-refused"]);
});

/* ---------------------------------------------------------- every node of the form */

test("THE FORM: every object, list, number and text slot says in rules what goes in it; no 'never these' notes", () => {
  const bare = [];
  const walk = (o, path) => {
    if (!o?.description) bare.push(path || "(root)");
    if (o.type === "OBJECT") for (const [k, v] of Object.entries(o.properties)) walk(v, path ? `${path}.${k}` : k);
    if (o.type === "ARRAY") walk(o.items, `${path}[]`);
  };
  walk(READING_SCHEMA, "");
  assert.deepEqual(bare, []);
  for (const note of schemaNotes()) {
    assert.doesNotMatch(note, /never these|of your own|never wording|e\.g\. "\(/i, note);
    assert.doesNotMatch(note, /\b(?:You|Your)\b [a-z]+ [a-z]+ [a-z]+ [a-z]+ [a-z]+ [a-z]+ [a-z]+/, `a sentence to copy: ${note}`);
  }
});

/* -------------------------------------------------------------- all of it, in gemini.mjs */

test("gemini.mjs runs every chart check on a new draft: 'you must', another type's word, a birth-time caveat", async () => {
  const OUTPUT = {
    type: "Manifesting Generator", strategy: "Wait to respond, then inform", authority: "Sacral", profile: "2/4",
    definition: "Single", signature: "Satisfaction", notSelfTheme: "Frustration", incarnationCross: "Right Angle Cross of Eden (6/36 | 12/11)",
    definedCenters: ["Throat", "Sacral"], undefinedCenters: ["Solar Plexus", "Root"], openCenters: ["Head"], channels: ["20-34 (Charisma)"],
  };
  const ask = (text, output = OUTPUT) =>
    generateReading(output, {
      apiKey: "k",
      prompt: "Write a reading.\nIN SHORT\nType: <one sentence>\nRULES: CENTRES HAVE THREE STATES.",
      fetchImpl: async () => ({ ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text }] } }] }) }),
    });
  assert.equal((await ask(TEXT)).ok, true, "a clean reading passes");
  const told = await ask(TEXT.replace("Doing and saying arrive together here", "Doing and saying arrive together here, and you must say it"));
  assert.match(told.detail, /tells the reader "you must"/);
  const borrowed = await ask(TEXT.replace("Doing and saying arrive together here", "Waiting for an external invitation, doing and saying arrive together here"));
  assert.match(borrowed.detail, /gives a Manifesting Generator another type's word, "invitation"/);
  const unknownTime = { ...OUTPUT, timeKnown: false, timeSpread: SPREAD(["profile"]) };
  const caveat = await ask(TEXT.replace("Doing and saying arrive together here", "Because your birth time was not known, your Type cannot be confirmed, and doing and saying arrive together here"), unknownTime);
  assert.match(caveat.detail, /calls the Type uncertain/);
  assert.equal(draftProblem(TEXT, OUTPUT), null);
});

/* ------------------------------------- the verbatim read of the rig's stored readings (10/22, section D) */

test("SECTION D: a rule set for the reader is refused; a description passes", () => {
  assert.match(voiceProblem(section("Your Emotional authority means you can never rush into commitments.", INTERPRETATION[1])), /sets the reader a rule, "you can never", in "How you decide"; it describes the design, it never rules/);
  assert.match(voiceProblem(section("Because your authority is emotional, you are never designed to make spontaneous decisions.")), /"you are never designed to"/);
  for (const p of [
    "This radical openness means you can never be pinned down to one rigid way of being.",
    "Outcomes arrive that you could never have manufactured through willpower.",
  ]) assert.equal(voiceProblem(section(p)), null, p);
});

test("SECTION D: a feeling word or 'Strategy' capitalized mid-sentence is refused; a tag and a list of names pass", () => {
  assert.match(themeCapProblem(section("When you are on track, you experience deep Satisfaction as your engine meets what arrives.")), /capitalizes "Satisfaction" mid-sentence in "How you meet the world"; in a sentence it is lower case/);
  assert.match(themeCapProblem(section("Because your Strategy of waiting governs your interactions, you thrive.")), /"Strategy"/);
  assert.equal(themeCapProblem(section("Satisfaction arrives when your energy is well spent.")), null, "a sentence may open with it");
  assert.equal(themeCapProblem(section("Your exact Type, Strategy, and Authority are listed beside the chart.")), null, "a list of the chart's names");
  assert.equal(themeCapProblem(`${TAKEAWAYS}\n\nThese are invitations to test.\n\n(Your Strategy) This week, when a plan comes, you might wait. Notice it, so it is familiar.\n`), null, "a try-this tag is a label");
});

test("SECTION D: a definition explained by its own name, and one stem said twice across a clause, are known slips", () => {
  const def = (p) => `${MECHANICS[1]}\n\n${p}\n`;
  assert.match(slipProblem(def("Your Split definition means your defined centers are split into two separate islands.")), /says "Split definition means your defined centers are split" in "Your definition", a known slip/);
  assert.equal(slipProblem(def("Your Split definition means your defined centers form two groups that need a bridge.")), null);
  assert.match(slipProblem(def("Energy flows between your centers without needing bridges or outside help to bridge gaps.")), /a known slip/);
  const decide = `${INTERPRETATION[1]}\n\nYour voice guides you.\n\nYour G center connects to your Throat, bypassing the mind entirely. When you speak, your voice shows the way. This allows you to bypass second-guessing.\n`;
  assert.match(slipProblem(decide), /says "bypassing the mind entirely\. .*bypass" in "How you decide", a known slip/);
  // Across a lede and its first paragraph too.
  assert.match(slipProblem(`${INTERPRETATION[1]}\n\nYour choices bypass the mind.\n\nThis lets you bypass second-guessing.\n`), /a known slip/);
});

test("SECTION D: the kinds of advice, where the reading names them, come in the disclaimer's order", () => {
  const intro = (s) => `${TAKEAWAYS}\n\n${s}\n`;
  assert.match(adviceOrderProblem(intro("These are invitations to test, never medical, legal, financial, or psychological advice.")), /lists the kinds of advice in its own order in "Things to experiment with"; the disclaimer says "medical, psychological, legal or financial"/);
  assert.equal(adviceOrderProblem(intro("These are invitations to test, never medical, psychological, legal or financial advice.")), null);
  assert.equal(adviceOrderProblem(intro("Nothing here is medical or legal advice.")), null, "two kinds are not a list");
});
