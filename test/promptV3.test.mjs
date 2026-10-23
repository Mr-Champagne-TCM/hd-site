import { test } from "node:test";
import assert from "node:assert/strict";
import {
  COPY_RUN,
  TAKEAWAYS,
  copyProblem,
  firstProblem,
  glanceFragment,
  glanceProblem,
  tagProblem,
  takeawayProblem,
  timeClaimProblem,
} from "../netlify/lib/interpretation.mjs";
import { READING_SCHEMA, schemaNotes } from "../netlify/lib/structured.mjs";
import { generateReading } from "../netlify/lib/gemini.mjs";
import { ASKS, READING_BUDGET_MS, TIMEOUT_REASK_MS, interpretOne } from "../netlify/lib/interpretJob.mjs";
import { saveReading, fillReading, loadReading } from "../netlify/lib/reading.mjs";
import { TEXT } from "./support/tier2Fixture.mjs";

/**
 * READING PROMPT v3 AND ITS CHECKS (10/22). Jeremy, on the home-page try-this
 * line: "This sentence division adds clarity and avoids a needlessly lengthy
 * sentence. Should express everywhere in try this sentencing." The AI test
 * round of the same day found the glance rule refusing whole sentences, words
 * copied from the instructions into delivered readings, and a chart whose
 * every ask ran past the time limit. Made-up lines and made-up prompts only:
 * the real prompt is private and never in this repo.
 */

const block = (...lines) => `${TAKEAWAYS}\n\nThese are invitations to test, not instructions.\n\n${lines.join("\n\n")}\n`;

// Jeremy's approved home-page line (10/22, his own edit of a test reading's line), and three more in the same shape.
const HOME =
  "(Defined Spleen center) Once or twice this week, when a sudden intuitive hunch tells you to take a different route home from the grocery store, you might follow that silent prompt immediately. Notice whether the alternative path feels naturally light, so that instant bodily trust is familiar when a heavier choice appears.";
const TWO = [
  HOME,
  "(Sacral authority) This week, when a friend asks whether you want to join a weekend errand, you might wait for your gut's first sound before you answer. Notice which way it goes, so that sound is easy to hear when a job offer is on the table.",
  "(Channel 20-34) The next time an easy chore gets a clear gut yes, you might start it straight away. Notice whether the energy feels absorbed or just busy, so you know the difference before a month-long project asks for it.",
  "(Profile 4/1) Over the next few days, when a neighbor mentions something you have been reading about, you might share one thing you learned. Notice how it lands, which is practice for when a bigger opening comes.",
];

test("TWO SENTENCES PASS: Jeremy's approved home-page line and three more in its shape", () => {
  assert.equal(takeawayProblem(block(...TWO)), null);
});

test("THE ONE-SENTENCE FORM IS REFUSED: the same line as the model first wrote it (R04, 10/22)", () => {
  const one = HOME.replace("immediately. Notice whether", "immediately and notice whether");
  assert.match(takeawayProblem(block(one, ...TWO.slice(1))), /is one sentence; the thing to try ends with a period and "Notice \.\.\." opens a second sentence/);
});

test("the second sentence opens 'Notice', ends with a period, and there are exactly two", () => {
  const cases = [
    [/does not open its second sentence with "Notice"/, HOME.replace(". Notice whether", ". Then notice whether")],
    [/does not end its second sentence with a period/, HOME.replace(/\.$/, "")],
    [/has 3 sentences, not two/, HOME.replace(", so that instant", ". So that instant").replace("familiar when", "familiar, so when")],
    [/has 3 sentences, not two/, HOME.replace("Once or twice this week, when", "Once or twice this week. When")],
  ];
  for (const [why, line] of cases) assert.match(takeawayProblem(block(line, ...TWO.slice(1))), why, line);
});

test("the calm tail belongs to the Notice sentence; one before it does not count", () => {
  const line =
    "(Sacral) This week, when a small ask comes, so it stays easy, you might wait for your gut's sound. Notice which one comes.";
  assert.match(takeawayProblem(block(line, ...TWO.slice(1))), /has no ", so/);
});

test("a time like '6 p.m.' or a quoted reply does not break the count", () => {
  const pm = "(Sacral) This week, when dinner plans come up at 6 p.m. on a weekday, you might say \"not yet.\" Notice how the pause feels, so it is familiar when a plan for the whole weekend is on the table.";
  assert.equal(takeawayProblem(block(TWO[0], pm, TWO[2], TWO[3])), null);
});

test("the old checks still hold in the new shape: tag, soft opener, 'you might', when, notice, twin starts", () => {
  const cases = [
    [/does not begin with the chart feature/, HOME.replace("(Defined Spleen center) ", "")],
    // "([Strategy]) This week, ..." (the round, 64 of 144 lines under one prompt draft): a slot left in.
    [/has square brackets in it, a slot left from the instructions \("\(\[Defined Spleen center\]\)"\)/, HOME.replace("(Defined Spleen center)", "([Defined Spleen center])")],
    [/has square brackets in it/, HOME.replace("you might follow", "you might [action] follow")],
    [/has a blank \(_\) in it, a slot left from the instructions \("\(Profile _\/_\)"\)/, HOME.replace("(Defined Spleen center)", "(Profile _/_)")],
    // "(Sacral), This week, ..." (the round): the time phrase follows the tag directly.
    [/does not begin with its time phrase right after the \(chart feature\)/, HOME.replace("(Defined Spleen center) ", "(Defined Spleen center), ")],
    [/opens with "Notice"/, "(Sacral) Notice what the body does. Notice it again, so it is familiar later."],
    [/has no "you might/, "(Sacral) This week, when a small ask comes, wait for your gut's sound. Notice it, so it is familiar later."],
    [/does not say when/, "(Sacral) You might wait for your gut's sound. Notice which one comes, so it is familiar later."],
    [/names nothing to notice/, "(Sacral) This week, when a small ask comes, you might wait for your gut's sound, so it is familiar later."],
  ];
  for (const [why, line] of cases) assert.match(takeawayProblem(block(line, ...TWO.slice(1))), why, line);
  assert.match(takeawayProblem(block(TWO[0], TWO[0].replace("(Defined Spleen center)", "(Sacral)"), TWO[2], TWO[3])), /begins the same way/);
});

/* ---------------------------------------------------------------- the tag is this chart's */

const CHART = {
  type: "Generator", authority: "Sacral", profile: "3/5", channels: ["10-34 (Exploration)"],
  definedCenters: ["G", "Sacral"], undefinedCenters: ["Throat", "Spleen"], openCenters: ["Head", "Ajna", "Heart", "Solar Plexus", "Root"],
};
const tagLine = (tag) => block(`(${tag}) This week, when a small ask comes, you might wait for your gut's sound. Notice which one comes, so it is familiar later.`);

test("TAGS: a tag that names this chart's own features passes; one naming none of them is not judged", () => {
  for (const tag of ["Undefined Throat center", "Open Head center", "Defined G center", "Sacral center", "Profile 3/5", "Profile line 5", "Line 3",
    "Channel 10-34", "Channel 34-10", "Sacral authority", "Generator type", "Strategy", "Sacral authority, provisional"]) {
    assert.equal(tagProblem(tagLine(tag), CHART), null, tag);
  }
  assert.equal(tagProblem(tagLine("Generator type"), { ...CHART, type: "Manifesting Generator" }), null);
  assert.equal(tagProblem(tagLine("Heart authority"), { ...CHART, type: "Manifestor", authority: "Ego Manifested" }), null);
  assert.equal(tagProblem(tagLine("Environmental authority"), { ...CHART, type: "Projector", authority: "Mental" }), null);
});

test("TAGS: the round's wrong tags are refused, saying what the chart has (19 of 40 delivered lines in one batch)", () => {
  const cases = [
    ["Defined Sacral center", { ...CHART, type: "Manifestor", definedCenters: ["Throat"], undefinedCenters: ["Sacral"] }, /"\(Defined Sacral center\)", but the Sacral center is undefined here$/],
    ["Undefined Root center", CHART, /but the Root center is open here$/],
    ["Open Head center", { ...CHART, definedCenters: ["Head", "Ajna"], openCenters: [] }, /but the Head center is defined here$/],
    ["Defined Ego center", CHART, /but the Heart center is open here$/],
    ["Profile 4/1", CHART, /but the profile is 3\/5$/],
    ["Line 4", CHART, /but the profile is 3\/5$/],
    ["Channel 20-34", CHART, /but its channels are 10-34$/],
    ["Channel 20-34", { ...CHART, channels: [] }, /but it has no channels$/],
    ["Emotional authority", { ...CHART, type: "Projector", authority: "Mental" }, /but the authority is Mental$/],
    ["Projector type", CHART, /but the type is Generator$/],
  ];
  for (const [tag, chart, why] of cases) {
    const p = tagProblem(tagLine(tag), chart);
    assert.match(p ?? "", /^A takeaway's \(chart feature\) is not this chart's: /, tag);
    assert.match(p, why, tag);
  }
});

test("TAGS: gemini.mjs refuses a wrong tag after the whole chain", async () => {
  const OUTPUT = {
    type: "Manifesting Generator", strategy: "Wait to respond, then inform", authority: "Sacral", profile: "2/4",
    definition: "Single", signature: "Satisfaction", notSelfTheme: "Frustration", incarnationCross: "Right Angle Cross of Eden (6/36 | 12/11)",
    definedCenters: ["Throat", "Sacral"], undefinedCenters: ["Solar Plexus", "Root"], openCenters: ["Head"], channels: ["20-34 (Charisma)"],
  };
  const ask = (text) =>
    generateReading(OUTPUT, {
      apiKey: "k",
      prompt: "IN SHORT\nType: <one sentence>\nRULES: CENTRES HAVE THREE STATES.",
      fetchImpl: async () => ({ ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text }] } }] }) }),
    });
  assert.equal((await ask(TEXT)).ok, true);
  const wrong = await ask(TEXT.replace("(Channel 20-34)", "(Channel 10-34)"));
  assert.equal(wrong.ok, false);
  assert.match(wrong.detail, /^A takeaway's \(chart feature\) is not this chart's: "\(Channel 10-34\)", but its channels are 20-34$/);
});

/* ---------------------------------------------------------------- the birth time and astrology words */

test("TIME: an unknown birth time claimed on a time-known chart is refused; on a chart cast at noon it passes", () => {
  const read = (s) => `Your energy, and how it starts\n\n${s}\n`;
  const said = "Your birth time was not known, so your daily energy patterns are explored through your chart features.";
  assert.match(timeClaimProblem(read(said), { timeKnown: true }), /^The reading says the birth time was not known, in "Your energy, and how it starts", but this chart's birth time is known: /);
  assert.match(timeClaimProblem(read(said), {}), /birth time is known/, "no timeKnown on the chart reads as known");
  assert.equal(timeClaimProblem(read(said), { timeKnown: false }), null);
  for (const s of ["Your chart contains no birth time recorded.", "Without a birth time, the profile is a guess.", "The birth time is unknown here."]) {
    assert.match(timeClaimProblem(read(s), { timeKnown: true }) ?? "", /birth time is known/, s);
  }
  assert.equal(timeClaimProblem(read("You were born into a steady rhythm; your bodygraph shows it."), { timeKnown: true }), null);
});

test("TIME: astrology words are refused on every chart, plain English 'house' passes", () => {
  const read = (s) => `Your energy, and how it starts\n\n${s}\n`;
  for (const [w, s] of [["rising sign", "Your rising sign is omitted."], ["ascendant", "Your chart ascendant is left out."], ["house placements", "Specific house placements are absent."], ["seventh house", "Your seventh house is quiet."]]) {
    assert.match(timeClaimProblem(read(s), { timeKnown: false }) ?? "", new RegExp(`uses an astrology term, "${w}"`, "i"), s);
  }
  assert.equal(timeClaimProblem(read("You rest at home in a quiet house after a long errand."), { timeKnown: true }), null);
});

/* ---------------------------------------------------------------- the glance rule */

// The 10/22 round's refused -ing rows, read by hand. Whole sentences (were refused, now pass):
const WHOLE = [
  "Allowing emotional waves to settle over time brings clarity to your inner guidance.",
  "Waiting through the waves prevents immediate certainty from rushing you into premature commitments.",
  "Pausing until something physically meets your energy gives your power somewhere true to land.",
  "Riding your emotional wave through time lets clarity emerge without rushing your choices.",
  "Fulfilling physical work settles into a deep, bone-level satisfaction when your energy is spent correctly.",
  "Pushing ahead before life asks anything of you creates friction that ends in stubborn frustration.",
  "Pausing until something arrives to engage your system ensures you inform others before your momentum shifts.",
  "Investigating foundations deeply pairs with learning through direct trial and personal physical discovery.",
  "Clearing the path with a heads-up before you move keeps resistance away from your forward momentum.",
  "Waiting through the emotional wave lets clarity emerge from your Solar Plexus over time without rushing decisions.",
  "Telling those who will be affected before you move clears the path ahead.",
  "Sharing your intentions prior to movement clears resistance from those who stand in your way.",
  "Experimenting through trial and error while projecting practical solutions defines your external expression.",
  "Settling into genuine peace arrives when your path unfolds without unnecessary resistance or interference.",
  "Burning with sudden anger occurs when your impulses meet blockage or unannounced interference.",
  // look-alikes that are whole too
  "Holding that line keeps you steady.",
  "Waiting until something arrives keeps your energy clean.",
  "Letting decisions ripen gives you clarity.",
  "Waiting leads to the clarity you need.",
  // 10/22 full rig: a clause with two verbs, then the row's own main verb.
  "Holding a motor that hums and builds keeps you steady.",
  "Carrying a design that guides and directs energy, you work best when invited.",
];
// ...and fragments (one draft's six rows, then stored and planted ones), still refused.
const FRAGMENTS = [
  "Carrying a rapid engine that connects straight to expression, moving swiftly once an external cue sparks life force into gear.",
  "Pausing until something arrives to react to, then letting those around you know before making your swift move.",
  "Trusting the gut responses bubbling from deep within your physical form to direct your daily choices.",
  "Blending an outward friendliness of connection with a deep inner need to research and study foundations thoroughly.",
  "Settling into a deep contentment when your energy spends itself on the exact things that truly light you up.",
  "Bumping into a grinding irritation when you leap into motion without waiting for the right prompt first.",
  "Allowing opportunities to approach you first so your energy meets what is actually meant for you to build.",
  "Finding deep contentment in your core when your energy is correctly spent on things that fulfill you.",
  "Carrying a lantern that guides travelers through the dusk.",
  "Carrying a design that guides others toward clarity, warmth and a quiet sense of their own direction in life.",
  "Letting the right questions find you before you act.",
  // 10/22 full rig, Rowan's stored Type row: both verbs belong to the "that" clause, none to the row.
  "Carrying a design that guides and directs energy rather than generating it directly from within.",
];

test("GLANCE: whole sentences with -ing subjects pass (the round's false refusals)", () => {
  for (const row of WHOLE) assert.equal(glanceFragment(row), false, row);
});

test("GLANCE: real fragments are still refused, by name", () => {
  for (const row of FRAGMENTS) assert.equal(glanceFragment(row), true, row);
  const reading = `IN SHORT\n\nStrategy: ${FRAGMENTS[1]}\n\nYour energy, and how it starts\n\nYou carry a motor.\n`;
  assert.match(glanceProblem(reading), /^The "Strategy" line is a fragment, not a sentence: "Pausing until something arrives/);
});

test("GLANCE: a row that starts in lower case is refused (the label taken for its subject, a 10/22 draft)", () => {
  const row = (r) => `IN SHORT\n\nType: ${r}\n\nYour energy, and how it starts\n\nYou carry a motor.\n`;
  assert.equal(
    glanceProblem(row("classifies you as a Manifestor who brings forward independent impulses.")),
    'The "Type" line does not begin a sentence (no capital letter): "classifies you as a Manifestor who brings forward independent impulses."',
  );
  assert.match(glanceProblem(row("carrying a design that guides others.")), /no capital letter/);
  assert.equal(glanceProblem(row("You carry a motor that answers what life brings.")), null);
  assert.equal(glanceProblem(row("“Steady” is the word for how you work.")), null);
});

/* ---------------------------------------------------------------- copied words */

// A made-up prompt; the real one is private.
const PROMPT = [
  "Write a reading for the lantern keeper.",
  "summary: one sentence each. Example: You carry a lantern that stays lit through the longest night, whatever the weather brings.",
  "takeaways: four, each built around the quiet hour before the market opens on a working day.",
].join("\n");
const withType = (row) => TEXT.replace(/^Type: .*$/m, `Type: ${row}`);

test("COPIES: 8 or more words in a row from the prompt are refused, named with where they sit", () => {
  assert.equal(COPY_RUN, 8);
  const p = copyProblem(withType("A lantern that stays lit through the longest night, and well past it."), [PROMPT]);
  assert.match(p, /^The reading copies 9 words in a row from its instructions, in the "Type" line: "a lantern that stays lit through the longest night"$/);
  // Case, punctuation and line breaks do not hide a copy; the whole run is quoted.
  const q = copyProblem(withType("YOU carry a lantern -- that stays lit, through the longest night; whatever the weather brings."), [PROMPT]);
  assert.match(q, /copies 15 words in a row/);
});

test("COPIES: 7 words is writing, not a copy; a clean reading passes", () => {
  assert.equal(copyProblem(withType("A lantern that stays lit through the dark hours."), [PROMPT]), null);
  assert.equal(copyProblem(TEXT, [PROMPT]), null);
  assert.equal(copyProblem(TEXT, []), null, "no sources, nothing to compare");
});

test("COPIES: fixed vocabulary passes -- the facts sent, the headings, labels and disclaimer", () => {
  const facts = "Incarnation Cross: Right Angle Cross of the Sleeping Phoenix (55/59 | 34/20)";
  const prompt = PROMPT + "\nUse the cross exactly: Right Angle Cross of the Sleeping Phoenix (55/59 | 34/20).\nHeadings: When it's on track, and when it's off track.";
  const text = TEXT.replace("Carrying the Right Angle Cross of Eden (6/36 | 12/11),", "Carrying the Right Angle Cross of the Sleeping Phoenix (55/59 | 34/20),").replace(
    "Doing and saying arrive together here",
    "When it's on track, and when it's off track, doing and saying arrive together here",
  );
  assert.equal(copyProblem(text, [prompt], [facts]), null);
  assert.match(copyProblem(text, [prompt], []), /Right Angle Cross of the Sleeping Phoenix|right angle cross of the sleeping phoenix/i, "without the facts the cross line is a copy of the prompt");
});

test("COPIES: a try-this line, a section paragraph and a schema note are all judged", () => {
  const line = TEXT.replace(/^\(Channel 20-34\).*$/m, "(Channel 20-34) This week, when the quiet hour before the market opens on a working day comes, you might start. Notice it, so it is familiar later.");
  assert.match(copyProblem(line, [PROMPT]), /in "Things to experiment with": "the quiet hour before the market opens on a working day"/);
  const note = schemaNotes().find((n) => n.split(/\s+/).length >= 12);
  const lifted = note.split(/\s+/).slice(0, 9).join(" ");
  assert.match(copyProblem(TEXT.replace("Doing and saying arrive together here", lifted), schemaNotes()), /copies \d+ words in a row/);
});

test("THE FORM'S NOTES CARRY NO EXAMPLE SENTENCE TO COPY: the try-this note is rules only", () => {
  const notes = schemaNotes(READING_SCHEMA);
  const take = READING_SCHEMA.properties.takeaways.items.description;
  assert.ok(notes.includes(take));
  assert.doesNotMatch(take, /e\.g\.|\(Undefined|\(Sacral|familiar when the pressure/);
  assert.match(take, /^TWO sentences\./);
  assert.match(take, /"you might"/);
  assert.match(take, /"Notice"/);
});

test("gemini.mjs refuses a copied run from the PROMPT it sent, and passes the cross named in the facts", async () => {
  const OUTPUT = {
    type: "Manifesting Generator", strategy: "Wait to respond, then inform", authority: "Sacral", profile: "2/4",
    definition: "Single", signature: "Satisfaction", notSelfTheme: "Frustration", incarnationCross: "Right Angle Cross of Eden (6/36 | 12/11)",
    definedCenters: ["Throat", "Sacral"], undefinedCenters: ["Solar Plexus", "Root"], openCenters: ["Head"], channels: ["20-34 (Charisma)"],
  };
  const ask = (text, prompt) =>
    generateReading(OUTPUT, {
      apiKey: "k",
      prompt,
      fetchImpl: async () => ({ ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text }] } }] }) }),
    });
  const letter = (p) => `${p}\nIN SHORT\nType: <one sentence>\nRULES: CENTRES HAVE THREE STATES.`;
  assert.equal((await ask(TEXT, letter(PROMPT))).ok, true, "a clean reading passes");
  const copied = await ask(withType("You carry a lantern that stays lit through the longest night, whatever the weather brings."), letter(PROMPT));
  assert.equal(copied.ok, false);
  assert.equal(copied.reason, "malformed");
  assert.match(copied.detail, /^The reading copies 15 words in a row from its instructions, in the "Type" line/);
  // The cross is in the facts sent with the request, so naming it is not a copy even when the prompt repeats it.
  const crossy = letter(PROMPT + "\nFor example: Carrying the Right Angle Cross of Eden (6/36 | 12/11), you move between intimacy and friction.");
  assert.equal((await ask(TEXT, crossy)).ok, false, "the rest of that example sentence is still a copy");
  assert.equal((await ask(TEXT, letter(PROMPT + "\nName it as supplied, like this: Right Angle Cross of Eden (6/36 | 12/11)"))).ok, true);
});

/* ---------------------------------------------------------------- one re-ask after a timeout */

function fakeStore() {
  const data = new Map();
  return {
    data,
    async setJSON(key, value) {
      data.set(key, JSON.parse(JSON.stringify(value)));
    },
    async get(key) {
      return data.get(key) ?? null;
    },
    async list() {
      return { blobs: [...data.keys()].map((key) => ({ key })) };
    },
  };
}
async function waiting() {
  const store = fakeStore();
  const id = await saveReading(store, { tier: 2, output: null, name: "Wren Testwell", email: "wren@example.com", phone: null, sku: "reading", purchasedAt: Date.now() });
  await fillReading(store, id, { type: "Projector", profile: "1/3", authority: "Mental" });
  return { store, id };
}
const TIMEOUT = { ok: false, reason: "timeout", detail: "This operation was aborted" };
const REFUSED = { ok: false, reason: "malformed", detail: "A takeaway is one sentence" };

test("TIMEOUT: one re-ask, with the longer limit, and a reading that then arrives is filed", async () => {
  const { store, id } = await waiting();
  const asks = [];
  const r = await interpretOne({
    id, store, health: fakeStore(), apiKey: "k", prompt: "p",
    generate: async (_o, opts) => (asks.push(opts.timeoutMs ?? "default"), asks.length === 1 ? TIMEOUT : { ok: true, text: TEXT }),
  });
  assert.equal(r.ok, true);
  assert.deepEqual(asks, ["default", TIMEOUT_REASK_MS]);
  assert.ok((await loadReading(store, id)).reading.includes("Your incarnation cross"));
});

test("TIMEOUT: only once; a second timeout is reported as one, by name", async () => {
  const { store, id } = await waiting();
  const health = fakeStore();
  let n = 0;
  const r = await interpretOne({ id, store, health, apiKey: "k", prompt: "p", generate: async () => (n++, TIMEOUT) });
  assert.equal(n, 2);
  assert.equal(r.reason, "timeout");
  // The first is noted when it is re-asked (internal, counted by health); the second pages, by name.
  assert.deepEqual([...health.data.values()].map((e) => e.kind), ["gemini-timeout-reasked", "gemini-timeout"]);
});

test("TIMEOUT: the re-ask is one of the five asks, and refused drafts after it are asked for as before", async () => {
  const { store, id } = await waiting();
  const seen = [];
  await interpretOne({
    id, store, health: fakeStore(), apiKey: "k", prompt: "p",
    generate: async () => (seen.push(seen.length === 0 ? "timeout" : "refused"), seen.length === 1 ? TIMEOUT : REFUSED),
  });
  assert.equal(seen.length, ASKS);
});

test("TIME: no ask starts that could run past the reading's budget or the caller's deadline", async () => {
  // A clock that jumps: the first ask "takes" most of the budget, so the timeout re-ask (worst case 305 s) no longer fits.
  {
    const { store, id } = await waiting();
    let t = 0;
    let n = 0;
    const r = await interpretOne({
      id, store, health: fakeStore(), apiKey: "k", prompt: "p", clock: () => t,
      generate: async () => ((t += READING_BUDGET_MS - 200_000), n++, TIMEOUT),
    });
    assert.equal(n, 1, "the re-ask started although it could not finish in time");
    assert.equal(r.reason, "timeout");
  }
  // The caller's deadline wins over the budget: none at all when even one ask cannot finish.
  {
    const { store, id } = await waiting();
    let n = 0;
    const r = await interpretOne({
      id, store, health: fakeStore(), apiKey: "k", prompt: "p", clock: () => 1_000, deadline: 1_000 + 100_000,
      generate: async () => (n++, { ok: true, text: TEXT }),
    });
    assert.equal(n, 0);
    assert.equal(r.reason, "out_of_time");
    assert.equal((await loadReading(store, id)).reading, null, "the reading is still owed");
  }
  // Refused drafts are re-asked while an ask still fits, then stop.
  {
    const { store, id } = await waiting();
    let t = 0;
    let n = 0;
    await interpretOne({
      id, store, health: fakeStore(), apiKey: "k", prompt: "p", clock: () => t,
      generate: async () => ((t += 120_000), n++, REFUSED),
    });
    // 120 s per ask: asks start at 0, 120, 240 s; at 360 s the worst case (185 s) would end past 480 s.
    assert.equal(n, 3);
  }
});

test("a sound reading still passes the whole chain after these changes", () => {
  assert.equal(firstProblem(TEXT, "Manifesting Generator", "2/4", ["Head"], ["Solar Plexus", "Root"], ["Throat", "Sacral"]), null);
});
