import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { randomBytes } from "node:crypto";
import { curly } from "../shared/curlyQuotes.mjs";
import { buildReadingView, forDisplay, summaryForDisplay, writtenForDisplay } from "../netlify/lib/readingView.mjs";
import { parseReading, structureProblem, summaryRows, HEADINGS } from "../netlify/lib/interpretation.mjs";
import { handleReading } from "../netlify/lib/readingHandler.mjs";
import { fillInterpretation, fillReading, mintReadingLink, saveReading } from "../netlify/lib/reading.mjs";
import { readingPdf } from "../netlify/lib/readingPdf.mjs";
import { TEXT } from "./support/tier2Fixture.mjs";

/**
 * DECISION 4 (GO page v3, 10/23): "The AI's own sentences keep straight
 * apostrophes beside curly headings (e.g. "environment's"). Curl them for
 * display only (shop page + PDF, phone PDF); the stored text and the checker
 * stay untouched."
 *
 * Pinned here: the edge cases of curly() (the phone's Curly.kt is held to the
 * same outputs by its CurlyParityTest); every sentence the model wrote is
 * curled on the page and in the PDF; the stored reading is byte for byte what
 * the model wrote; and no checker reads curled text.
 */

/* ------------------------------------------------------------ the edge cases */

const CASES = [
  // apostrophes inside words
  ["the environment's pull", "the environment’s pull"],
  ["don't, can't, it's", "don’t, can’t, it’s"],
  ["the 1990's", "the 1990’s"],
  // quotes around a phrase, double and single
  ['the word "yes" comes first', "the word “yes” comes first"],
  ["the word 'yes' comes first", "the word ‘yes’ comes first"],
  ['"Wait," it says.', "“Wait,” it says."],
  ["'Wait,' it says.", "‘Wait,’ it says."],
  ['("quoted")', "(“quoted”)"],
  ['— "a phrase" —', "— “a phrase” —"],
  // possessives after a closing quote, straight or already curly
  ['the "Generator"\'s pace', "the “Generator”’s pace"],
  ["the “Generator”'s pace", "the “Generator”’s pace"],
  ["others' plans", "others’ plans"],
  // years
  ["since the '90s", "since the ’90s"],
  ["'90s music", "’90s music"],
  ["back in '08, it changed", "back in ’08, it changed"],
  ["a '24-hour pause' first", "a ‘24-hour pause’ first"],
  ["the '1990' label", "the ‘1990’ label"],
  // a straight quote right after a curly one, and quotes inside quotes
  ["“'Yes' is enough”", "“‘Yes’ is enough”"],
  ["“It's yours\"", "“It’s yours”"],
  ["‘a word'", "‘a word’"],
  ['"\'Wait\' is the word"', "“‘Wait’ is the word”"],
  ["'\"Wait\" is the word'", "‘“Wait” is the word’"],
  ["said “yes\"'s twin", "said “yes”’s twin"],
  // spaces of every kind before an opening quote (the phone spells the same set)
  ["a\u{A0}'word'", "a\u{A0}‘word’"],
  ["a\u{2009}\"word\"", "a\u{2009}“word”"],
  ["line one\n'line two'", "line one\n‘line two’"],
  // a quote at the very end, alone, or before a space
  ["the others'", "the others’"],
  ["'", "’"],
  ['"', "”"],
  ["a ' b", "a ’ b"],
  // nothing to do
  ["No quotes at all.", "No quotes at all."],
  ["", ""],
  ["Already curly’s fine, “really”.", "Already curly’s fine, “really”."],
];

test("curly(): every edge case decision 4 names, and the old cases", () => {
  for (const [straight, curled] of CASES) assert.equal(curly(straight), curled, JSON.stringify(straight));
  // Curling twice changes nothing.
  for (const [, curled] of CASES) assert.equal(curly(curled), curled, JSON.stringify(curled));
  assert.equal(curly(null), "");
  assert.equal(curly(undefined), "");
});

test("the cases the phone is held to are this file's own (curly_parity.json comes from curly())", () => {
  // The phone's tools/curly-parity-fixtures.mjs imports this module and writes
  // its outputs; nothing to compare here but that the module is the one named.
  const src = readFileSync(fileURLToPath(new URL("../shared/curlyQuotes.mjs", import.meta.url)), "utf8");
  assert.match(src, /Curly\.kt/);
  assert.match(src, /curly_parity\.json/);
});

/* -------------------------------------------- a reading with every edge case */

/** The tier-2 stand-in with the model's quote marks in it: straight, as the model writes them. */
const QUOTED = TEXT
  .replace(
    "Strategy: Let the question arrive first — the gut answers before the mind can argue with it.",
    "Strategy: Let the question arrive first — the gut's \"yes\" comes before the mind's argument.",
  )
  .replace(
    "Running from a defined Sacral straight to the Throat, your energy starts with a physical yes rather than a plan.",
    "Running from a defined Sacral straight to the Throat, your environment's pull starts with a physical 'yes' rather than a plan.",
  )
  .replace(
    "The difficulty is rarely hearing it.",
    "The difficulty is rarely hearing it, as it was in the '90s for many people's \"Generator\"'s pace.",
  );

test("the stand-in has the edge cases, straight, and passes the structure check as stored", () => {
  assert.notEqual(QUOTED, TEXT, "the substitutions did not apply");
  for (const s of ["gut's \"yes\"", "environment's", "'yes'", "'90s", "\"Generator\"'s", "room's mood", "body's first"]) {
    assert.ok(QUOTED.includes(s), s);
  }
  assert.equal(structureProblem(QUOTED), null);
});

const CHART = {
  type: "Manifesting Generator",
  strategy: "Wait to respond, then inform",
  authority: "Sacral",
  profile: "2/4",
  definition: "Single",
  signature: "Satisfaction",
  notSelfTheme: "Frustration",
  incarnationCross: "Right Angle Cross of Eden (6/36 | 12/11)",
  definedCenters: ["Throat", "Sacral"],
  undefinedCenters: ["Solar Plexus", "Root"],
  openCenters: ["Head", "Ajna", "G", "Heart", "Spleen"],
  channels: ["20-34 (Charisma)"],
  channelLines: ["20-34 (Charisma), Throat to Sacral"],
};

/** Every sentence-bearing field of a view, flattened. */
function aiStrings(v) {
  return [
    ...Object.values(v.summary ?? {}),
    ...v.centersTakeaway,
    ...v.channelsTakeaway,
    ...v.profileTakeaway,
    ...v.profileLinesTakeaway,
    ...v.reading.flatMap((s) => [s.lede ?? "", ...s.paragraphs]),
    ...v.takeaways,
  ];
}

test("forDisplay curls every sentence the model wrote, and nothing else", () => {
  const raw = buildReadingView(CHART, QUOTED);
  const before = JSON.stringify(raw);
  const shown = forDisplay(raw);
  assert.equal(JSON.stringify(raw), before, "forDisplay changed the view it was given");

  const all = aiStrings(shown).join("\n");
  assert.doesNotMatch(all, /['"]/, "a straight quote is left in the model's sentences");
  for (const s of ["gut’s “yes”", "mind’s argument", "environment’s pull", "physical ‘yes’", "the ’90s", "people’s “Generator”’s pace", "room’s mood", "body’s first"]) {
    assert.ok(all.includes(s), s);
  }
  // The same sentences otherwise, field by field.
  assert.deepEqual(aiStrings(shown), aiStrings(raw).map((s) => curly(s)));

  // Untouched: the headings (they key the margin notes), the chart's names, the library's lines, the disclaimer.
  assert.deepEqual(shown.reading.map((s) => s.heading), raw.reading.map((s) => s.heading));
  assert.ok(shown.reading.some((s) => s.heading === "When it's on track, and when it's off track"), "the heading is the checker's own text, straight");
  assert.deepEqual(Object.keys(shown.summary), Object.keys(raw.summary));
  assert.deepEqual([shown.definedCenters, shown.otherCenters, shown.channels, shown.profileLines], [raw.definedCenters, raw.otherCenters, raw.channels, raw.profileLines]);
  assert.equal(shown.disclaimer, raw.disclaimer);
  assert.equal(shown.profile, raw.profile);
});

test("the older shape (parseReading) is curled the same way, headings kept", () => {
  const raw = parseReading(QUOTED);
  const before = JSON.stringify(raw);
  const shown = writtenForDisplay(raw);
  assert.equal(JSON.stringify(raw), before);
  assert.deepEqual(shown.sections.map((s) => s.heading), raw.sections.map((s) => s.heading));
  const all = [...Object.values(shown.summary), ...shown.sections.flatMap((s) => [s.lede ?? "", ...s.paragraphs])].join("\n");
  assert.doesNotMatch(all, /['"]/);
  assert.ok(all.includes("environment’s pull"));
  assert.equal(summaryForDisplay(null), null);
  assert.equal(forDisplay(null), null);
  assert.equal(writtenForDisplay(null), null);
});

/* ------------------------------------------------- the page and the stored text */

const SECRET = randomBytes(32).toString("hex");

function fakeStore() {
  const m = new Map();
  return {
    m,
    async setJSON(k, v) { m.set(k, JSON.parse(JSON.stringify(v))); },
    async get(k) { return m.has(k) ? m.get(k) : null; },
  };
}

async function seededReading() {
  const store = fakeStore();
  const id = await saveReading(store, {
    tier: 2, output: null, name: "Robin Testwell", email: "buyer@example.com", sku: "reading", purchasedAt: Date.now(),
  });
  await fillReading(store, id, CHART);
  const filed = await fillInterpretation(store, id, QUOTED);
  assert.equal(filed.ok, true);
  return { store, id, token: mintReadingLink({ id, tier: 2 }, SECRET) };
}

test("THE STORED TEXT IS UNCHANGED: the page gets curled sentences, the store keeps the model's own", async () => {
  const { store, id, token } = await seededReading();
  const stored = JSON.stringify([...store.m.entries()]);
  assert.equal((await store.get(id)).reading, QUOTED, "the reading was not stored as the model wrote it");

  const res = await handleReading({ body: JSON.stringify({ token }), store, secret: SECRET, now: Date.now() });
  assert.equal(res.status, 200);
  const body = JSON.parse(res.body);

  // Byte for byte, after the page was built.
  assert.equal(JSON.stringify([...store.m.entries()]), stored, "opening the page changed the store");
  assert.equal((await store.get(id)).reading, QUOTED);

  // The page's two shapes carry no straight quote in the model's sentences.
  assert.doesNotMatch(aiStrings(body.view).join("\n"), /['"]/);
  assert.ok(aiStrings(body.view).join("\n").includes("environment’s pull"));
  const written = [...Object.values(body.written.summary), ...body.written.sections.flatMap((s) => [s.lede ?? "", ...s.paragraphs])].join("\n");
  assert.doesNotMatch(written, /['"]/);
  // The headings still match the page's own list (src/WrittenReading.tsx compares them), straight.
  for (const s of body.written.sections) assert.ok(HEADINGS.includes(s.heading), s.heading);
});

test("the PDF prints the model's sentences curled, and leaves the text it was handed alone", async () => {
  const reading = QUOTED;
  const r = await readingPdf({ tier: 2, name: "Robin Testwell", output: CHART, reading, inspect: true });
  assert.equal(reading, QUOTED);
  const printed = r.runs.map((x) => x.text).join(" ");
  // pdfText may break a line anywhere, so look at single words.
  for (const w of ["environment’s", "gut’s", "mind’s", "‘yes’", "’90s", "people’s", "room’s", "body’s"]) {
    assert.ok(printed.includes(w), `${w} not printed`);
  }
  for (const w of ["environment's", "gut's", "mind's", "'yes'", "'90s", "people's", "room's", "body's", "\"yes\"", "\"Generator\""]) {
    assert.ok(!printed.includes(w), `${w} printed straight`);
  }
  assert.ok(!/['"]/.test(printed), `a straight quote is printed: ${printed.match(/.{0,30}['"].{0,30}/)?.[0]}`);
});

test("a letter-mode reading (no form markers) is printed curled too", async () => {
  const letter = "Dear reader,\n\nYour environment's pull is real, and the word \"yes\" matters.\n\nThat's all.";
  assert.notEqual(structureProblem(letter), null);
  const r = await readingPdf({ tier: 2, name: "Robin Testwell", output: CHART, reading: letter, inspect: true });
  const printed = r.runs.map((x) => x.text).join(" ");
  assert.ok(printed.includes("environment’s") && printed.includes("“yes”") && printed.includes("That’s"));
  assert.ok(!/environment's|"yes"|That's/.test(printed));
});

/* ------------------------------------------------------- the checkers, untouched */

test("NO CHECKER READS CURLED TEXT: the checker's files never import curly()", () => {
  for (const f of ["netlify/lib/interpretation.mjs", "netlify/lib/gemini.mjs", "netlify/lib/reask.mjs", "netlify/lib/structured.mjs", "netlify/lib/interpretJob.mjs", "netlify/lib/reading.mjs"]) {
    const src = readFileSync(fileURLToPath(new URL(`../${f}`, import.meta.url)), "utf8");
    assert.doesNotMatch(src, /curlyQuotes|forDisplay|summaryForDisplay|writtenForDisplay/, `${f} reads curled text`);
  }
  // The structure gate and the glance rows read the stored text, as before.
  assert.equal(structureProblem(QUOTED), null);
  assert.equal(summaryRows(QUOTED).Strategy, "Let the question arrive first — the gut's \"yes\" comes before the mind's argument.");
});

test("the page and the PDF curl on the way out, after the gate has read the stored text", () => {
  const handler = readFileSync(fileURLToPath(new URL("../netlify/lib/readingHandler.mjs", import.meta.url)), "utf8");
  assert.match(handler, /forDisplay\(buildReadingView\(reading\.output, reading\.reading\)\)/);
  assert.match(handler, /writtenForDisplay\(parseReading\(reading\.reading\)\)/);
  assert.match(handler, /structureProblem\(reading\.reading\) === null/);
  const pdf = readFileSync(fileURLToPath(new URL("../netlify/lib/readingPdf.mjs", import.meta.url)), "utf8");
  assert.match(pdf, /structureProblem\(text\) === null \? forDisplay\(buildReadingView\(output, text\)\)/);
  assert.match(pdf, /summaryForDisplay\(summaryRows\(reading\)\)/);
  assert.match(pdf, /plainReading\(d, curly\(text\)\)/);
});
