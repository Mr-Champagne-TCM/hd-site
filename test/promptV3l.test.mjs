import { test } from "node:test";
import assert from "node:assert/strict";
import {
  INTERPRETATION,
  MECHANICS,
  TAKEAWAYS,
  adviceOrderProblem,
  BIRTH_TIME_NOTE,
  birthTimeNote,
  birthTimeProblem,
  borrowedWordProblem,
  chartFactsOnly,
  doubledWordProblem,
  draftProblem,
  provisionalValues,
  slipProblem,
  takeawayProblem,
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

test("THE NOTE asks for silence, the same for every unknown-time chart (10/23 word-for-word read, M2; was: the measured list)", () => {
  const SILENCE =
    "NOTE: the birth time was not known. The page already shows, beside the chart, which values can change with it. " +
    "Do not mention the birth time anywhere in the reading, and never call any value provisional, uncertain or unconfirmed.";
  const n = birthTimeNote(unknown("Projector", ["profile", "definedCenters", "undefinedCenters", "channels"]), { form: true });
  assert.equal(n, SILENCE);
  assert.equal(BIRTH_TIME_NOTE, SILENCE);
  // No list to name, no noon to repeat: the reading has nothing to say about it.
  assert.doesNotMatch(n, /Profile|Type|Authority|cast at noon|cannot be confirmed|at most once/);
  // Nothing changes, or no usable spread: the same NOTE.
  assert.equal(birthTimeNote(unknown("Generator", [])), SILENCE);
  const old = { type: "Generator", timeKnown: false, provisional: ["type", "strategy", "authority", "profile", "notSelfTheme", "signature"] };
  assert.equal(birthTimeNote(old, { form: true }), SILENCE);
  // The values the page tags are still measured as before (the value-uncertain check reads them).
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
  // 10/23 (M2): what the day does change is not said either -- the page tags it; the value-uncertain message stays first.
  assert.match(birthTimeProblem(energy("Your birth time isn't known, so your Profile, the states of your centers and your Channels are provisional."), projector), /mentions the birth time in "Your energy, and how it starts"; the page already shows/);
  assert.match(birthTimeProblem(energy("Your birth time isn't known; your Type and Authority are not provisional, and your Profile, centers and channels are."), projector), /mentions the birth time/);
  const generator = unknown("Generator", ["type", "strategy", "authority", "profile", "channels"]);
  assert.match(birthTimeProblem(energy("Because your birth time was not known, your Profile, Type, Strategy, Authority and Channels cannot be confirmed."), generator), /mentions the birth time/);
  // Without a birth-time sentence, ordinary words are ordinary: "may change how you think".
  assert.equal(birthTimeProblem(energy("Your open Head center may change how you think from day to day."), unknown("Generator", [])), null);
  // Nothing changes: any caveat about the birth time is one too many.
  assert.match(birthTimeProblem(energy("Parts of this reading may change with your birth time."), unknown("Generator", [])), /calls the chart uncertain .*every value holds/);
  // A known time is timeClaimProblem's, not this check's.
  assert.equal(birthTimeProblem(energy("Your Type cannot be confirmed."), { type: "Generator", timeKnown: true }), null);
});

test("BIRTH TIME: never mentioned, nothing called provisional (10/23 word-for-word read, M2; was: once at most)", () => {
  const g = unknown("Generator", ["type", "authority", "profile"]);
  const said = (p, heading = INTERPRETATION[0]) => birthTimeProblem(section(p, heading), g);
  // rk-a3's forced sentences, as delivered (R36, R32). R36's day changes every value it names; on a chart whose
  // day does not, the kept value-uncertain check answers first.
  const r36 = unknown("Reflector", ["type", "strategy", "authority", "profile", "definition", "signature", "notSelfTheme", "incarnationCross", "definedCenters", "undefinedCenters", "openCenters", "channels"]);
  const forced = "Your energy reflects the room because your Type, Strategy, Inner Authority, Profile, Definition, on-track feeling, off-track feeling, center states, and Channels are provisional since the birth time was not known.";
  assert.match(birthTimeProblem(section(forced, INTERPRETATION[0]), r36), /^The reading calls something "provisional" in "Your energy, and how it starts"; the page already shows beside the chart which values can change with the birth time, so the reading never mentions it: "/);
  assert.match(said(forced), /^The reading calls the center states uncertain/);
  assert.match(said("Please note that birth time was provisional and can change.", "What you take in from others"), /^The reading mentions the birth time in "What you take in from others"/);
  // Once is too many now, and so is a summary line, a noon chart, a midday placeholder or the word alone.
  assert.match(birthTimeProblem("IN SHORT\n\nType: Because birth time was not known, your Type is provisional.\n\n", g), /mentions the birth time in the "Type" line/);
  assert.match(said("Your chart was cast at noon, so read it as a sketch."), /mentions the birth time/);
  assert.match(said("Because your chart is cast from a midday placeholder, read it lightly."), /mentions the birth time/);
  assert.match(said("This provisional pairing means you alternate between solitude and your network."), /calls something "provisional"/);
  // Not about the birth time: ordinary words pass; a reading that never mentions it passes.
  assert.equal(said("Endings naturally give birth to fresh starts, and you meet them a day at a time."), null);
  assert.equal(said("Your Root center is defined and steady, so pressure comes in bursts you can count on."), null);
  // A known time is timeClaimProblem's, not this check's.
  assert.equal(birthTimeProblem(section("This provisional pairing passes here."), { type: "Generator", timeKnown: true }), null);
  // A try-this tag is the page's label: Jeremy's approved 10/21 line passes where the day changes the authority.
  const approved = "(Emotional authority, provisional) This week, on a small plan like a weekend outing, you might sleep on it for two nights. Notice whether your third-day answer matches your first, so the wait is familiar before a heavier choice, and you learn whether this authority fits you.";
  assert.equal(birthTimeProblem(section(approved, TAKEAWAYS), g), null);
  assert.match(birthTimeProblem(section("(Emotional authority) This week, you might sleep on a provisional plan.", TAKEAWAYS), g), /calls something "provisional" in "Things to experiment with"/);
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

test("THE FORM (10/23 live A/B): notes on the text slots only, none on an object, list or number; the try-this note keeps 'Words of your own, never these.'", () => {
  const noted = [];
  const bare = [];
  const walk = (o, path) => {
    if (o.type === "STRING" ? !o.description : o.description) (o.type === "STRING" ? bare : noted).push(path || "(root)");
    if (o.type === "OBJECT") for (const [k, v] of Object.entries(o.properties)) walk(v, path ? `${path}.${k}` : k);
    if (o.type === "ARRAY") walk(o.items, `${path}[]`);
  };
  walk(READING_SCHEMA, "");
  assert.deepEqual(noted, [], "a note on an object, list or number brought the \"string\" forms back (4 of 6 asks)");
  assert.deepEqual(bare, [], "every text slot says what goes in it");
  assert.match(READING_SCHEMA.properties.takeaways.items.description, /Words of your own, never these\.$/);
  for (const note of schemaNotes()) assert.doesNotMatch(note, /\b(?:You|Your)\b [a-z]+ [a-z]+ [a-z]+ [a-z]+ [a-z]+ [a-z]+ [a-z]+/, `a sentence to copy: ${note}`);
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

/* ---------------------------------------------- the try-this ending, and money (10/22, v3j R02 and R19) */

const TWO_REST = [
  "(Channel 20-34) The next time an easy chore gets a clear gut yes, you might start it straight away. Notice whether the energy feels absorbed or just busy, so you know the difference before a month-long project asks for it.",
  "(Profile 4/1) Over the next few days, when a neighbor mentions something you have been reading about, you might share one thing you learned. Notice how it lands, which is practice for when a new neighbor asks what you do.",
  "(Undefined Solar Plexus) Once or twice this week, as you leave somewhere lively but easy, you might name your mood in one word. Notice how much of it stayed behind, so the same check is within reach after a tense conversation.",
];


test("TRY-THIS ENDINGS (rev o): a size word is fine on a real situation; the same one twice, a bare ending, a worn v2 tail are refused", () => {
  const line = (tail) => `(Sacral authority) This week, when a friend asks about a weekend errand, you might wait for your gut's sound before you answer. Notice which way it goes, ${tail}`;
  const four = (...first) => `${TAKEAWAYS}\n\nThese are invitations to test, not instructions.\n\n${[...first, ...TWO_REST.slice(first.length - 1)].join("\n\n")}\n`;
  // A size word on a real situation passes (Jeremy's own "a heavier choice", "a bigger ask"; v3j R02's endings).
  for (const tail of [
    "so the pause is familiar when a heavier choice appears.",
    "so the pause is familiar when larger daily choices arrive.",
    "so the pause is familiar when bigger commitments arise.",
    "so the pause is familiar when a job offer is on the table.",
    "so it is within reach when a decision is heavier.",
  ]) assert.equal(takeawayProblem(four(line(tail))), null, tail);
  // A bare ending: the size word sizes nothing real.
  for (const [tail, said] of [
    ["so the pause is familiar when a heavier moment arrives.", "heavier moment"],
    ["so the pause is familiar when bigger moments come.", "bigger moments"],
    ["so the pause is familiar when things get bigger.", "things get bigger"],
    ["so the pause is ready for the bigger version of this.", "bigger version"],
    ["so the pause is familiar when the stakes are higher.", "the stakes are higher"],
  ]) {
    const p = takeawayProblem(four(line(tail)));
    assert.ok(p?.includes(`ends on "${said}", which names no real situation`), `${tail} -> ${p}`);
  }
  // The v2 round's worn tails, word for word.
  for (const [tail, said] of [
    ["so the pause is familiar when the wave is high.", "when the wave is high"],
    ["so the pause is familiar when larger commitments are on the table.", "when larger commitments are on the table"],
  ]) {
    const p = takeawayProblem(four(line(tail)));
    assert.ok(p?.includes(`ends on a worn tail ("${said}"); each ending names its own situation`), `${tail} -> ${p}`);
  }
  // The same size word in two of the four endings.
  const second = "(Channel 20-34) The next time an easy chore gets a clear gut yes, you might start it straight away. Notice whether the energy feels absorbed or just busy, so you know the difference when a bigger project comes up.";
  const p = takeawayProblem(four(line("so the pause is familiar when bigger commitments arise."), second));
  assert.ok(p?.includes(`ends on "bigger" again, as another ending does; the four end on four different situations`), p);
  assert.equal(takeawayProblem(four(line("so the pause is familiar when a heavier choice appears."), second)), null, "two different words pass");
});

test("TRY-THIS MONEY: a line set in financial matters is refused; an errand with a purchase passes", () => {
  const four = (first) => `${TAKEAWAYS}\n\nThese are invitations to test, not instructions.\n\n${[first, ...TWO_REST].join("\n\n")}\n`;
  const r19 = "(Emotional authority) This week, when an evening choice about dinner arises, you might wait until the morning before giving your final answer. Notice how your clarity shifts overnight, so letting your wave settle is familiar when financial commitments arise.";
  assert.match(takeawayProblem(four(r19)), /is set in financial matters \("financial"\), the advice the page disclaims; everyday moments, work and purchases included, are fine/);
  const budget = "(Ego authority) This week, when organizing your budget at the kitchen table, you might sort the figures yourself. Notice how your will responds, so the habit is familiar when a friend asks for help.";
  assert.match(takeawayProblem(four(budget)), /set in financial matters \("budget"\)/);
  const errand = "(Splenic authority) This week, when a small purchase catches your eye on an errand, you might wait until tomorrow before buying it. Notice how the pull shifts, so that pause is familiar when a friend proposes a trip.";
  assert.equal(takeawayProblem(four(errand)), null);
});

test("WORK AND PURCHASES ARE EVERYDAY MOMENTS (Jeremy 10/23: 'PPL work and buy stuff'); only financial-advice topics are refused", () => {
  const four = (first) => `${TAKEAWAYS}\n\nThese are invitations to test, not instructions.\n\n${[first, ...TWO_REST].join("\n\n")}\n`;
  const line = (moment, tail = "so that pause is familiar when a friend proposes a trip.") =>
    `(Splenic authority) This week, ${moment}, you might wait a moment before you answer. Notice how the pull shifts, ${tail}`;
  for (const [moment, tail] of [
    ["when a new project lands on your desk"],
    ["when a coworker asks for help before a meeting", "so that pause is familiar when a deadline moves at work."],
    ["when you buy groceries for the week", "so that pause is familiar when a bigger purchase tempts you."],
    ["when you spend money on a small treat"],
    ["when the bills arrive in the mail"],
    ["when you budget your energy for a long evening"],
    ["when a friend asks to borrow a book, and you loan a friend your umbrella too"],
    ["when an email asks for your opinion", "so that pause is familiar when household expenses come up."],
  ]) assert.equal(takeawayProblem(four(line(moment, tail))), null, moment);
  for (const [moment, said] of [
    ["when you check a bank account balance online", "bank account"],
    ["when a credit card statement arrives", "credit card"],
    ["when you sort your tax return papers", "tax return"],
    ["when the mortgage papers come", "mortgage"],
    ["when a friend mentions paying down a debt", "debt"],
    ["when a car loan offer comes by email", "loan"],
    ["when you review your savings", "savings"],
  ]) assert.match(takeawayProblem(four(line(moment))), new RegExp(`set in financial matters \\("${said}"\\)`), moment);
  assert.match(takeawayProblem(four(line("when choosing lunch", "so that pause is familiar when evaluating a major investment."))), /\("investment"\)/);
});

/* ------------------------------------------------------------- the 10/23 live rounds */

test("ROUND 10/23: the facts name the other types' words in every form; 'successfully' is not a feeling; the strategy label is not a phrase", async () => {
  const { structuredFacts } = await import("../netlify/lib/structured.mjs");
  const { nearMissProblem } = await import("../netlify/lib/interpretation.mjs");
  assert.match(structuredFacts({ type: "Manifestor" }), /must not appear anywhere in this reading, in any form: satisfaction, satisfied, satisfying; frustration, frustrated, frustrating; success, successful; bitterness, bitter; surprise, surprised, surprising; disappointment, disappointed, disappointing\./);
  assert.match(structuredFacts({ type: "Generator" }), /in any form: peace, peaceful; anger, angry; success, successful;/);
  const track = (p) => `${INTERPRETATION[5]}\n\n${p}\n`;
  assert.equal(nearMissProblem(track("Your on-track feeling of peace arrives whenever your clear communications successfully remove friction."), "Manifestor"), null);
  assert.match(nearMissProblem(track("You feel successful when your plans land."), "Manifestor"), /a form of another type's word Success/);
  assert.match(slipProblem(section("Because your strategy is wait to respond, you thrive.")), /says "strategy is wait" in "How you meet the world", a known slip/);
  assert.match(slipProblem(section("Your strategy of wait for the invitation guides you.")), /"strategy of wait"/);
  assert.equal(slipProblem(section("Your strategy is to inform before acting, and waiting to respond is a Generator's.")), null);
});

test("ROUND 10/23: a particle, contrasting modifiers, an and / or pairing and a type name are not a word said twice; money words named in the facts", async () => {
  const { structuredFacts } = await import("../netlify/lib/structured.mjs");
  for (const p of [
    "Your inner compass shows whether you are on track or off track today.",
    "Every emotional wave brings high points and low points that color your view.",
    "You process mental concepts and conceptual frameworks by absorbing what others think.",
    "Meeting the world as a Projector involves projecting your focused awareness outward.",
  ]) assert.equal(doubledWordProblem(section(p)), null, p);
  assert.match(doubledWordProblem(section("You bring a resilient resilience to hard days.")), /a slip/);
  assert.match(structuredFacts({ type: "Generator" }), /\nNever in a try-this line, in any form: finances, financial, budget, debt, loans, taxes, mortgage, investments, savings, bank accounts\.\n/);
  assert.doesNotMatch(structuredFacts({ type: "Generator" }), /\bmoney\b|\bbills\b|\bexpenses\b/, "money itself, bills and expenses are everyday (10/23)");
});

test("A SPLIT CHART'S FACTS SAY WHAT JOINS THE GROUPS, and that the split never creates a bridge (10/23 nudge)", async () => {
  const { structuredFacts } = await import("../netlify/lib/structured.mjs");
  const said = /\nThis chart's definition is split: its defined centers form separate groups that no channel of this chart joins, and other people's gates or the transits are what join them\. Never write that the split creates, forms or builds a bridge\.\n/;
  for (const definition of ["Split", "Triple Split", "Quadruple Split"]) assert.match(structuredFacts({ type: "Projector", definition }), said, definition);
  for (const definition of ["Single", "None", "", undefined]) assert.doesNotMatch(structuredFacts({ type: "Projector", definition }), /definition is split/, String(definition));
});

test("READ IN THE v3s READINGS (10/23): the same word twice in a row, 'acknowledgement', 'The next time when' are refused", async () => {
  const { spellingProblem } = await import("../netlify/lib/interpretation.mjs");
  const four = (first) => `${TAKEAWAYS}\n\nThese are invitations to test, not instructions.\n\n${[first, ...TWO_REST].join("\n\n")}\n`;
  assert.match(doubledWordProblem(section("Your Mental authority processes choices through talking things out with trusted trusted environments.")), /says a word twice in "How you meet the world", a slip: "\.\.\.[^"]*with trusted trusted environments/);
  assert.match(doubledWordProblem(four("(Profile Profile 6/2) The next time you retreat at home, you might rest. Notice what returns, so the habit is familiar when a friend calls.")), /"\(Profile Profile 6\/2\)/);
  assert.match(doubledWordProblem(four("(Sacral center center) This week, when a friend calls, you might wait for your gut. Notice the sound, so it is familiar when plans change.")), /a slip/);
  for (const p of [
    "Notice which physical sensations tell you you have done enough.",
    "You notice that that pause helps.",
    "By evening you had had enough of the noise.",
  ]) assert.equal(doubledWordProblem(section(p)), null, p);
  assert.match(spellingProblem(section("Bitterness shows up when forcing action without proper acknowledgement.")), /spells "acknowledgement" the UK way/);
  assert.match(spellingProblem(section("You trust your own judgement.")), /"judgement"/);
  assert.equal(spellingProblem(section("You trust your own judgment and welcome acknowledgment.")), null);
  assert.match(slipProblem(four("(Profile 4/6) The next time when greeting neighbors at the front gate, you might watch. Notice the flow, so it is familiar when a friend visits.")), /says "The next time when" in "Things to experiment with", a known slip/);
  assert.equal(slipProblem(four("(Profile 4/6) The next time you greet neighbors at the front gate, you might watch. Notice the flow, so it is familiar when a friend visits.")), null);
});

/* ------------------------------------------- chart facts the prose states (10/23, after the v3s read) */

const R24 = { type: "Projector", definition: "Split", channels: ["47-64 (Abstraction)", "23-43 (Structuring)", "25-51 (Initiation)"], definedCenters: ["Head", "Ajna", "Throat", "G", "Heart"] };
const R23 = { type: "Projector", definition: "Split", channels: ["11-56 (Curiosity)", "25-51 (Initiation)"], definedCenters: ["Ajna", "Throat", "G", "Heart"] };
const R35 = { type: "Manifesting Generator", definition: "Single", channels: ["7-31 (The Alpha)", "29-46 (Discovery)"], definedCenters: ["Throat", "G", "Sacral"] };
const decide = (p) => section(p, INTERPRETATION[1]);

test("CONNECTIONS: a channel joins its own two centers, and two centers connect only through this chart's channels", async () => {
  const { connectionProblem } = await import("../netlify/lib/interpretation.mjs");
  assert.match(
    connectionProblem(decide("Because your Heart center connects to your Throat center through the 25-51 channel, your voice carries the direct force of your personal will."), R24),
    /says Channel 25-51 joins the Heart and the Throat in "How you decide"; it joins the G and the Heart: "/,
  );
  assert.match(
    connectionProblem(decide("Because your Throat center connects directly to the Heart center, your spoken words carry the exact commitments you can sustain."), R23),
    /says the Throat and the Heart connect directly in "How you decide", but no channel of this chart joins them/,
  );
  assert.match(connectionProblem(decide("Because your Throat center is defined and connected to your Heart, your truth emerges."), R24), /the Throat and the Heart connect in "How you decide", but no channel of this chart links them/);
  assert.match(connectionProblem(decide("Your Sacral connects to your Throat through Channel 20-34, so you speak as you work."), R35), /through Channel 20-34 in "How you decide", a channel this chart does not have/);
  assert.match(connectionProblem(decide("Your Throat connects directly to your Sacral, so you speak as you work."), R35), /connect directly/);
  for (const p of [
    "Channel 25-51 links your G center to your Heart, so your will follows your direction.",
    "Your Heart does not connect to your Throat; it reaches your G through Channel 25-51.",
    "Because your Ajna and Throat link directly through Channel 23-43, your thoughts find words.",
  ]) assert.equal(connectionProblem(decide(p), R24), null, p);
  // Joined through the G on a Single chart: "connected" is true, "directly" is not claimed.
  assert.equal(connectionProblem(decide("Because your Throat and Sacral centers are connected, your vitality finds a voice."), R35), null);
});

test("MOTORS: only the Sacral, Root, Solar Plexus and Heart; 'no defined motor' is refused when one is defined", async () => {
  const { motorProblem } = await import("../netlify/lib/interpretation.mjs");
  const energy = (p) => section(p, INTERPRETATION[0]);
  assert.match(motorProblem(energy("Your defined Throat center acts as a powerful motor and expression point."), R35), /calls the Throat a motor in "Your energy, and how it starts"; the motors are the Sacral, Root, Solar Plexus and Heart/);
  const r20 = { type: "Projector", definedCenters: ["Solar Plexus", "Root"] };
  assert.match(motorProblem("IN SHORT\n\nType: You move through the world as a Projector without a defined motor to drive constant output.\n", r20), /no defined motor in the "Type" line, but its Solar Plexus and Root are defined motors/);
  assert.match(motorProblem(energy("Without a defined motor for sustainable labor, you thrive when you are seen."), R23), /but its Heart is a defined motor/);
  assert.equal(motorProblem(energy("Your design lacks a defined motor connected to the Throat, so you guide rather than push."), r20), null);
  assert.equal(motorProblem(energy("Your Throat is not a motor; it is where energy becomes words."), r20), null);
  assert.equal(motorProblem(energy("Because you lack a defined motor, your vitality is borrowed."), { type: "Reflector", definedCenters: [] }), null);
});

test("A SPLIT LOOKS FOR A BRIDGE: 'this separation creates a bridge' is refused in Your definition, on a split chart", async () => {
  const { splitBridgeProblem } = await import("../netlify/lib/interpretation.mjs");
  const definition = (p) => section(p, MECHANICS[1]);
  assert.match(
    splitBridgeProblem(definition("Your split definition means two areas do not connect directly. This separation creates an inner bridge where you seek out others."), R24),
    /says the split creates a bridge in "Your definition"; a split definition looks for a bridge, it does not make one: "/,
  );
  assert.match(splitBridgeProblem(definition("Your split definition creates a natural bridge within your bodygraph."), { definition: "Triple Split" }), /a split definition looks for a bridge/);
  assert.equal(splitBridgeProblem(definition("This split creates a natural bridge-seeking tendency in how you meet people."), R24), null);
  assert.equal(splitBridgeProblem(definition("Your single definition creates an unbroken bridge across your centers."), R35), null);
  assert.equal(splitBridgeProblem(section("Your Channel 6-59 creates an energetic bridge between two centers.", MECHANICS[2]), R24), null);
});

test("A REFLECTOR'S EMPTY FACTS ARE SENTENCES, and reading the label out is a known slip", () => {
  const reflector = { type: "Reflector", definition: "None", definedCenters: [], undefinedCenters: ["Head", "Ajna"], openCenters: [], channels: [] };
  const facts = chartFactsOnly(reflector, { form: true });
  assert.match(facts, /\nDefinition: No center is defined in this chart, so it has no definition\.\n/);
  assert.match(facts, /\nDefined centers: No center is defined in this chart\.\n/);
  assert.match(facts, /\nOpen centers \(not colored in, with no gates at all\): No center in this chart is open\.\n/);
  assert.match(facts, /\nChannels: No channel is defined in this chart\.\n/);
  assert.doesNotMatch(facts, /: none\b/i);
  assert.match(chartFactsOnly({ type: "Generator", definedCenters: ["Sacral"], undefinedCenters: [], openCenters: ["Head"], channels: ["3-60 (Mutation)"] }), /\nUndefined centers \(not colored in, but carrying gates\): No center in this chart is undefined\.\n/);
  const definition = (p) => section(p, MECHANICS[1]);
  for (const [p, said] of [
    ["Your chart shows none, meaning your defined centers count is zero.", "chart shows none"],
    ["None definition means zero defined centers exist in your chart.", "None definition"],
    ["Because your defined centers are none, you have no rigid consistency.", "defined centers are none"],
    ["Because your defined centers section is absent entirely, you hold zero fixed definitions.", "defined centers section"],
  ]) assert.match(slipProblem(definition(p)), new RegExp(`says "${said}" in "Your definition", a known slip`), p);
  const four = (first) => `${TAKEAWAYS}\n\nThese are invitations to test, not instructions.\n\n${[first, ...TWO_REST].join("\n\n")}\n`;
  assert.match(slipProblem(four("(Defined centers: none) Once or twice this week, when walking through a park, you might watch the moods. Notice them, so it is familiar when a friend visits.")), /"Defined centers: none"/);
  for (const p of ["None of your centers is defined, so every one of them takes in the room.", "Your chart has no defined centers, and that openness is the design."]) assert.equal(slipProblem(definition(p)), null, p);
});

test("STATES: an undefined center called open is refused, as R27 delivered it", async () => {
  const { centreStateProblem } = await import("../netlify/lib/interpretation.mjs");
  const r27 = "Your Head center is undefined, meaning your focus shifts with the room. Your defined Ajna is steady, while your open Head takes in inspiration.";
  assert.match(centreStateProblem(decide(r27), ["Ajna", "Throat"], ["Head", "G"], ["Spleen"]), /calls the Head center "open", but on this chart it is undefined/);
  assert.match(centreStateProblem(decide("Your undefined Spleen takes in fear."), ["Ajna", "Throat"], ["Head", "G"], ["Spleen"]), /calls the Spleen center "undefined", but on this chart it is open/);
  assert.equal(centreStateProblem(decide("Your undefined Head and your open Spleen take in the room."), ["Ajna", "Throat"], ["Head", "G"], ["Spleen"]), null);
});

test("THE NOTE'S LIST is gone with the mention (10/23, M2): a list of provisional values is refused, named in full or not", () => {
  const manifestor = unknown("Manifestor", ["profile", "definition", "definedCenters", "undefinedCenters", "openCenters", "channels"]);
  const where = (p) => section(p, "What is consistently yours");
  assert.match(birthTimeProblem(where("Note that these values are provisional because your birth time was not known. Your Root is defined."), manifestor), /calls something "provisional" in "What is consistently yours"/);
  assert.match(birthTimeProblem(where("Your birth time was not known, so your Profile, Definition, centers and channels come from a noon chart. These values are provisional."), manifestor), /mentions the birth time in "What is consistently yours"/);
  assert.equal(birthTimeProblem(where("Your Root center is defined and steady."), manifestor), null, "no mention, nothing to judge");
});
