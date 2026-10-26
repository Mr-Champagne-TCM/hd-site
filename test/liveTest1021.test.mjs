import { test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { loadComponents, text } from "./support/render.mjs";
import { deliveryEmail } from "../netlify/lib/deliveryEmail.mjs";
import { checkoutCredit, sessionParams } from "../netlify/lib/checkout.mjs";
import { chainHead, chartsForEmail, recordPurchase, BACKFILL_KEY } from "../netlify/lib/charts.mjs";
import { chartCard, myChartsEmail } from "../netlify/lib/myChartsEmail.mjs";
import { AUTHORITY_CENTER, INTERPRETATION, marginNotes, nearMissProblem } from "../netlify/lib/interpretation.mjs";
import { ONWARD_LINKS, ONWARD_NOTE, TITLE_MARK, TITLE_MARK_CHART, readingPdf } from "../netlify/lib/readingPdf.mjs";
import { handleChart } from "../netlify/lib/handler.mjs";
import { handleReading } from "../netlify/lib/readingHandler.mjs";
import { handlePdf } from "../netlify/lib/pdfHandler.mjs";
import { handleResend } from "../netlify/lib/resendHandler.mjs";
import { interpretOne } from "../netlify/lib/interpretJob.mjs";
import { fillReading, loadReading, mintReadingLink, readReadingLink, saveReading } from "../netlify/lib/reading.mjs";
import { buyerNameFor, chartTitle } from "../shared/chartName.mjs";
import { CHECKOUT_NEXT_STEP, CHECKOUT_NEXT_STEP_THEIR, TIERS, money } from "../shared/pricing.mjs";
import { BODYGRAPH_GUIDE } from "../shared/libraryLinks.mjs";
import { COACH } from "../shared/readingCopy.mjs";
import { syntheticReading } from "./support/syntheticReading.mjs";
import { check, reading as chainReading } from "./support/chain.mjs";
import { TEXT } from "./support/tier2Fixture.mjs";

/**
 * THE 10/21 LIVE TEST, AS FIXED. One test (or more) per item Jeremy marked
 * "will do" (HD-Fixes-Mock-v1, page 1), by its error-set id, plus the
 * nameless gift chart the local rig found. The items he called on 10/22 have
 * their own tests: 2 (test/tiers1022.test.mjs), 17 (test/timeSpread.test.mjs),
 * W13 and W14 (the engine's words since 0.6.0, test/tiers1022.test.mjs).
 *
 * Made-up people only.
 */

const SECRET = randomBytes(32).toString("hex");
const NOW = Date.parse("2026-10-21T15:00:00Z");
const LINKS = {
  hd101: "https://thechampagnemethod.co/library/human-design/",
  bodygraph: "https://thechampagnemethod.co/library/bodygraph/",
  home: "https://thechampagnemethod.co",
  contact: "hd-readings@thechampagnemethod.co",
};

function memoryStore({ delay = 0 } = {}) {
  const m = new Map();
  const s = {
    m,
    inFlight: 0,
    most: 0,
    async setJSON(k, v) {
      m.set(k, JSON.parse(JSON.stringify(v)));
    },
    async get(k) {
      s.inFlight += 1;
      s.most = Math.max(s.most, s.inFlight);
      if (delay) await new Promise((r) => setTimeout(r, delay));
      s.inFlight -= 1;
      return m.has(k) ? m.get(k) : null;
    },
    async list() {
      return { blobs: [...m.keys()].map((key) => ({ key })) };
    },
  };
  return s;
}
function counters() {
  const data = new Map();
  return {
    async keyFor(ip) {
      return `k:${ip}`;
    },
    async load(key) {
      return data.get(key) ?? [];
    },
    async save(key, hits) {
      data.set(key, hits);
    },
  };
}

const session = (level, meta = {}, name = "Alex Rivera") => ({
  payment_status: "paid",
  created: Math.floor(NOW / 1000),
  amount_total: 0,
  customer_details: { name, email: "alex@example.com" },
  metadata: { level: String(level), sku: TIERS[level].sku, ...meta },
});

const ALEX = { date: "1991-07-22", time: "17:40", timeKnown: true, place: "Denver, Colorado", zone: "America/Denver", name: "Alex" };
const chartFor = (birth) => ({
  type: "Manifesting Generator",
  profile: "2/4",
  authority: birth.time === "17:52" ? "Emotional" : "Sacral",
  definition: "Single",
  definedCenters: birth.time === "17:52" ? ["Sacral", "Throat", "Solar Plexus"] : ["Sacral", "Throat"],
  channels: ["20-34 (Charisma)"],
});
const engine = async ({ birth }) => ({ ok: true, status: 200, payload: chartFor(birth) });
const chart = (readings, body) =>
  handleChart({ body: JSON.stringify(body), ip: "203.0.113.9", now: NOW, store: counters(), engine, grantSecret: SECRET, readings });

async function buy(readings, level, meta = {}) {
  const id = randomBytes(16).toString("hex");
  await recordPurchase({ readings, id, level, session: session(level, meta), secret: SECRET, now: NOW });
  return id;
}

// --- #1 and #19: the birth form ---------------------------------------------------------

const form = await loadComponents("src", "entry", "EntryForm.tsx");

test("#1 A BLANK FORM COUNTS WHAT IS MISSING: three things, not 'One thing left'", () => {
  const page = text(form.render("default", { readingToken: "t", tier: 1, name: "Alex Rivera" }));
  assert.match(page, /Three things left: the date, the place and the time you were born\./);
  assert.doesNotMatch(page, /One thing left/);
});

test("#1 THE CLOSING RULE SAYS NOTHING until every field is answered, then 'Ready'", () => {
  const blank = text(form.render("default", { readingToken: "t", tier: 1, name: "Alex Rivera" }));
  assert.doesNotMatch(blank, /everything/i);
  const initial = { date: "1991-07-22", time: "17:40", timeKnown: true, place: "Denver, Colorado", zone: "America/Denver", name: "Alex" };
  const full = text(form.render("default", { readingToken: "t", tier: 1, mode: "correct", initial }));
  assert.match(full, /Ready/);
  assert.doesNotMatch(full, /everything/i);
});

test("#1 one thing missing keeps the longer sentence that says how", () => {
  const initial = { date: "1991-07-22", time: "17:40", timeKnown: true, place: null, zone: "America/Denver", name: "Alex" };
  const page = text(form.render("default", { readingToken: "t", tier: 1, mode: "correct", initial }));
  assert.match(page, /One thing left: where you were born\. Start typing the town, then pick it from the list/);
  assert.doesNotMatch(page, /things left/);
});

test("#19 SOMEONE NEW'S FORM SAYS 'THEY' ON EVERY LINE", () => {
  const page = text(form.render("default", { readingToken: "t", tier: 1, mode: "someoneNew", chartName: "" }));
  assert.match(page, /I don’t know their birth time/);
  assert.doesNotMatch(page, /I don’t know my birth time/);
  assert.match(page, /Their first name, if you add it, becomes the title of their chart\./);
  assert.doesNotMatch(page, /Your Human Design/, "the hint promised their chart the buyer's own title");
  assert.match(page, /Three things left: the date, the place and the time they were born\./);
});

test("#19 with a name typed, the hint names the title as before", () => {
  const page = text(form.render("default", { readingToken: "t", tier: 1, mode: "someoneNew", chartName: "Sam" }));
  assert.match(page, /It is the title of their chart: “Sam’s Human Design”\./);
});

test("#19 the buyer's own form keeps 'my birth time'", () => {
  const page = text(form.render("default", { readingToken: "t", tier: 1, name: "Alex Rivera" }));
  assert.match(page, /I don’t know my birth time/);
});

// --- #3 and W2: "Your chart in three lines" ---------------------------------------------

const lines = await loadComponents("src", "ThreeLines.tsx");
const THEO = { type: "Generator", authority: "Emotional", profile: "3/5", bodygraphSvg: "<svg/>" };

test("#3 WITH NO BIRTH TIME the three-lines box marks what can move, as the table does", () => {
  const page = text(lines.render("default", { chart: { ...THEO, provisional: ["type", "authority", "profile"] } }));
  assert.match(page, /Your energy · Generator provisional/);
  assert.match(page, /How you decide · Emotional provisional/);
  assert.match(page, /How you meet the world · Profile 3\/5 provisional/);
});

test("#3 a known time marks nothing", () => {
  assert.doesNotMatch(text(lines.render("default", { chart: THEO })), /provisional/);
});

test("CALL 2 = B (10/23): the reading tier's third row is the profile one-liner too; no try-this line in the box", () => {
  const takeaways = ["Intro.", "(Authority) This week, when Wren plans the day, you might sleep on it."];
  const reading = text(lines.render("default", { chart: THEO, takeaways }));
  const chartTier = text(lines.render("default", { chart: THEO }));
  const summary = text(lines.render("default", { chart: { type: "Generator", authority: "Emotional", profile: "3/5" } }));
  for (const page of [reading, chartTier, summary]) {
    assert.match(page, /Your chart in three lines/);
    assert.match(page, /How you meet the world · Profile 3\/5 Learns by trial and error, then turns lessons into practical fixes for others\./);
    assert.doesNotMatch(page, /Something to try/);
    assert.doesNotMatch(page, /sleep on it/i, "the try-this line stays only in its own section");
  }
  // Unknown time: the profile row's tag follows the same rule on the reading tier (all three move with no spread).
  const unknown = text(lines.render("default", { chart: { ...THEO, provisional: ["type", "authority", "profile"] }, takeaways }));
  assert.equal(unknown.match(/provisional/g).length, 3);
  assert.match(unknown, /How you meet the world · Profile 3\/5 provisional/);
});

test("W2 THE SUMMARY HAS NO DRAWING, so the box does not promise one", () => {
  const summary = { type: "Projector", authority: "Self-Projected", profile: "4/1" };
  assert.match(text(lines.render("default", { chart: summary })), /Below: your chart at a glance, and what Type, Strategy and Authority mean\./);
  assert.match(text(lines.render("default", { chart: THEO })), /Below: your chart and its tables\./);
});

// --- #5: the confirm button --------------------------------------------------------------

const returning = await loadComponents("src", "Returning.tsx");

test("#5 THE CONFIRM BUTTON NAMES WHAT WAS BOUGHT: 'make my chart' on a chart upgrade", () => {
  const kept = { birthLine: "July 22, 1991 · 5:40 PM · Denver, Colorado" };
  assert.match(text(returning.render("ConfirmKept", { tier: 1, token: "t", kept, fromTier: 0 })), /These are right — make my chart/);
  assert.match(text(returning.render("ConfirmKept", { tier: 2, token: "t", kept, fromTier: 1 })), /These are right — make my reading/);
  assert.doesNotMatch(text(returning.render("ConfirmKept", { tier: 1, token: "t", kept, fromTier: 0 })), /make my reading/);
});

// --- W1: periods on table values ----------------------------------------------------------

const glance = await loadComponents("src", "Glance.tsx");
const ROWAN = {
  type: "Projector",
  strategy: "Wait for the invitation",
  authority: "Self-Projected",
  profile: "4/1",
  definition: "Single",
  incarnationCross: "Left Angle Cross of Refinement",
  definedCenters: ["G", "Throat"],
  openCenters: [],
  channels: ["1-8 (Inspiration)"],
  timeKnown: true,
};

test("W1 A BARE VALUE CARRIES NO PERIOD (the summary's 'Projector.')", () => {
  const page = text(glance.render("default", { data: ROWAN }));
  assert.match(page, /Type Projector Strategy/);
  assert.doesNotMatch(page, /Projector\./);
});

test("W1 a value with its sentence keeps the period that ends it", () => {
  const page = text(glance.render("default", { data: ROWAN, says: { Type: "Your energy guides others." } }));
  assert.match(page, /Projector\. Your energy guides others\./);
});

// --- W8: the someone-new cards ------------------------------------------------------------

const app = await loadComponents("src", "App.tsx");

test("W8 THE SOMEONE-NEW CARDS DESCRIBE THEIR CHART, on all three", () => {
  const page = text(app.render("Tiers", { fresh: true }));
  // The 10/22 split: their channels and gates on the summary, the drawing as the chart's reason.
  assert.match(page, /Definition, their centers, their channels and activated gates, their incarnation cross\./);
  assert.match(page, /Their bodygraph, drawn — the summary’s values as a picture, on a page you can share and a PDF you keep\./);
  assert.match(page, /Their chart, plus about 1,200 words written to it: ✓ How they decide ✓ How they meet the world/);
  assert.doesNotMatch(page, /your centers|your incarnation cross|How you decide/);
});

test("W8 the buyer's own cards are unchanged", () => {
  const page = text(app.render("Tiers", {}));
  assert.doesNotMatch(page, /their centers|How they decide/);
});

test("UNDER 'Start a new chart for someone else' THE TERMS SPEAK OF THEIR BIRTH DETAILS (check audit, with #19 and W8)", () => {
  assert.match(text(app.render("Footer", { their: true })), /; and if their birth details went in wrong, write to/);
  assert.doesNotMatch(text(app.render("Footer", { their: true })), /if your birth details/);
  assert.match(text(app.render("Footer", {})), /; and if your birth details went in wrong, write to/);
  const src = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");
  assert.match(src, /<Footer their=\{Boolean\(failed \|\| showNew \|\| data\?\.pending\)\} \/>/, "the someone-new page's footer");
});

// --- W3, W6, W10: wording on the pages ----------------------------------------------------

const actions = await loadComponents("src", "ReadingActions.tsx");

test("W6 ON THE EXPIRED PAGE 'Email me this link' is the button alone (the page above says the rest)", () => {
  const page = text(actions.render("Resend", { token: "t" }));
  assert.equal(page, "Email me this link");
});

test("W6 the cut-short page does not repeat its heading in the panel under it", () => {
  const src = readFileSync(new URL("../src/ReadingPage.tsx", import.meta.url), "utf8");
  assert.match(src, /state\.message\.replace\(\/\^That link could not be opened\\\.\\s\*\/, ""\)/);
});

test("W3 THE PAGE'S LIBRARY LINE NAMES WHAT THIS BUYER HAS", () => {
  const src = readFileSync(new URL("../src/ReadingActions.tsx", import.meta.url), "utf8");
  assert.match(src, /every word in your \$\{tier >= 2 \? "reading" : tier === 1 \? "chart" : "summary"\} explained/);
  assert.doesNotMatch(src, /"Every part of a chart, one layer at a time, and every word in your reading explained\."/);
});

test("W10 THE DATE HINT IS IN US ORDER, as the boxes are", () => {
  const src = readFileSync(new URL("../src/entry/BirthDateField.tsx", import.meta.url), "utf8");
  assert.match(src.replace(/\s+/g, " "), /06251985 for June 25, 1985/);
  assert.doesNotMatch(src, /25 June/);
});

// --- #4: the line under Stripe's Pay button -----------------------------------------------

test("#4 AN UPGRADE THAT KEEPS ITS DETAILS IS NOT TOLD 'about 2 minutes' of typing", () => {
  const up = (level) => sessionParams({ level, alreadyPaidCents: TIERS[level - 1].cents, origin: "https://x", upgrades: "abc", kept: true });
  assert.equal(up(1).custom_text.submit.message, "Next: one look at your kept birth details, then your chart is drawn.");
  assert.equal(up(2).custom_text.submit.message, "Next: one look at your kept birth details, then your reading is written.");
  // A first purchase, someone new, and an older summary that kept nothing still type the details.
  assert.equal(sessionParams({ level: 1, origin: "https://x" }).custom_text.submit.message, CHECKOUT_NEXT_STEP);
  assert.equal(sessionParams({ level: 1, origin: "https://x", fresh: true }).custom_text.submit.message, CHECKOUT_NEXT_STEP_THEIR);
  assert.equal(sessionParams({ level: 1, origin: "https://x", upgrades: "abc", kept: false }).custom_text.submit.message, CHECKOUT_NEXT_STEP);
});

test("#4 the credit says whether the chart it grows keeps its details", async () => {
  const readings = memoryStore();
  const id = await saveReading(readings, { tier: 0, output: null, name: "Alex Rivera", email: "alex@example.com", now: NOW });
  const credit = (r) =>
    checkoutCredit({
      body: { upgrade: true, reading: mintReadingLink({ id, tier: 0, now: NOW }, SECRET) },
      secret: SECRET,
      level: 1,
      head: (x) => chainHead(r, x, NOW),
      readLink: readReadingLink,
      now: NOW,
    });
  readings.m.set(id, { ...readings.m.get(id), output: { type: "Generator" }, filledAt: Math.floor(NOW / 1000) });
  assert.equal((await credit(readings)).kept, false, "an older summary kept nothing: the details are typed once");
  readings.m.set(id, { ...readings.m.get(id), birth: ALEX });
  assert.equal((await credit(readings)).kept, true);
});

// --- #6: no closing block on a page of its own --------------------------------------------

const DIR = new URL("./fixtures/phone-parity/", import.meta.url);
const OUTPUT = JSON.parse(readFileSync(new URL("claude-test-four.output.json", DIR), "utf8"));
const BIRTH = { date: "1976-12-14", time: "18:18", timeKnown: true, place: "Chicago, Illinois", zone: "America/Chicago" };
const READING = syntheticReading(OUTPUT);
const TYPE_ROW = "Type: The type sentence of this placeholder reading, a single line long.";
/** The same reading with its Type row run on by `k` steps: page 2 fills, a step at a time. */
const longer = (k) => READING.replace(TYPE_ROW, TYPE_ROW + " More words so this row runs on.".repeat(k * 2));
const pdf = (over = {}) => readingPdf({ tier: 2, name: "Claude Test Four", output: OUTPUT, birth: BIRTH, inspect: true, ...over });
const yOf = (r, label) => r.runs.find((x) => x.page === 2 && x.text === label)?.y;
const rowGap = (r) => yOf(r, "INCARNATION CROSS") - yOf(r, "DEFINITION");
const notePage = (r) => r.runs.find((x) => /^Every word (above|on page 2)/.test(x.text))?.page;

test("#6 (6B) THE PAGE-2 NOTE IS PULLED UP when it would stand on a page alone", async () => {
  // Page 2 is filled until something has to give. The first thing that gives
  // is page 2's white space -- the note stays on page 2 -- never the note.
  let before = await pdf({ reading: longer(1) });
  assert.equal(notePage(before), 2);
  for (let k = 2; k <= 8; k++) {
    const r = await pdf({ reading: longer(k) });
    assert.equal(r.alone, null, `k=${k}`);
    if (notePage(r) === 2 && rowGap(r) === rowGap(before)) {
      before = r;
      continue;
    }
    assert.equal(notePage(r), 2, `k=${k}: the note left page 2 before page 2 gave any room`);
    assert.ok(rowGap(r) < rowGap(before), `k=${k}: page 2 was not tightened`);
    assert.match(r.runs.filter((x) => x.page === 2).map((x) => x.text).join(" "), /Every word above is explained/);
    return;
  }
  assert.fail("page 2 never filled up; the test needs a longer row");
});

test("#6 when it cannot be pulled up, the block before it goes with it, and the note names page 2", async () => {
  // No written reading, and two channels more: page 2 is too full for any squeeze down to the floor
  // (10/25: page 2 now gives down to FIT_FLOOR, measured, so the plain no-reading page fits).
  const r = await pdf({ reading: null, output: { ...OUTPUT, channels: [...OUTPUT.channels, "1-8 (Inspiration)", "2-14 (The Beat)"] } });
  assert.equal(r.alone, null);
  assert.notEqual(notePage(r), 2, "this layout was meant to need the fallback");
  const on = r.runs.filter((x) => x.page === notePage(r)).map((x) => x.text).join(" ");
  assert.match(on, /Every word on page 2 is explained/, "off page 2, 'above' points at nothing");
  assert.match(on, /TECHNICAL VALUES/, "the note went over without the block before it");
});

test("#6 THE NOTE NEVER SITS UNDER A STRAY ROW of planet numbers on an almost empty page", async () => {
  // The 10/21 rig: page 3 held only the Design row and the note (7% filled).
  // That counts as alone: pulled up, or the whole block goes with the note.
  for (const n of [0, 1, 2, 3]) {
    const r = await pdf({ reading: null, output: { ...OUTPUT, channels: OUTPUT.channels.slice(0, n) } });
    const head = r.runs.find((x) => /^TECHNICAL VALUES/.test(x.text));
    assert.equal(notePage(r), head.page, `${n} channels: the note is on page ${notePage(r)}, its block's heading on ${head.page}`);
  }
});

test("#6 THE COACHING CARD NEVER ENDS THE PDF ON A PAGE OF ITS OWN", async () => {
  for (const k of [0, 6]) {
    const r = await pdf({ reading: longer(k) });
    const card = r.runs.find((x) => x.text === COACH.head);
    const before = r.runs.filter((x) => x.page === card.page && x.y < card.y && x.y > 100);
    assert.ok(before.length > 0, `k=${k}: page ${card.page} holds only the coaching card`);
  }
});

// --- #7 and #8: "Email me my charts" ------------------------------------------------------

async function inbox(readings, index, n) {
  const ids = [];
  for (let i = 0; i < n; i++) {
    const id = randomBytes(16).toString("hex");
    await recordPurchase({ readings, index, id, level: 1, session: session(1, { fresh: "1" }), secret: SECRET, now: NOW - i * 1000 });
    readings.m.set(id, { ...readings.m.get(id), output: { type: "Generator", profile: `${(i % 6) + 1}/3` }, filledAt: 1 });
    ids.push(id);
  }
  return ids;
}

test("#7 THE RECORDS ARE READ EIGHT AT A TIME, and the list is the same, in the same order", async () => {
  const readings = memoryStore();
  const index = memoryStore();
  index.m.set(BACKFILL_KEY, { at: 1 });
  const ids = await inbox(readings, index, 19);
  const slow = memoryStore({ delay: 5 });
  for (const [k, v] of readings.m) slow.m.set(k, v);
  const found = await chartsForEmail({ readings: slow, index, email: "alex@example.com", secret: SECRET, now: NOW });
  assert.deepEqual(found.map((f) => f.id).sort(), [...ids].sort());
  assert.ok(slow.most > 1, "still read one after another");
  assert.ok(slow.most <= 8, `${slow.most} reads at once`);
  const again = await chartsForEmail({ readings, index, email: "alex@example.com", secret: SECRET, now: NOW });
  assert.deepEqual(found.map((f) => f.id), again.map((f) => f.id));
});

test("#8 AN OLDER RECORD SAYS WHEN IT WAS BOUGHT, not 'Your reading · The reading'", () => {
  const old = { tier: 2, pending: false, birth: null, buyer: { name: "Alex Rivera" }, purchasedAt: Date.parse("2026-10-04T17:00:00Z") / 1000 };
  assert.deepEqual(chartCard(old), { title: "Alex’s reading", line: "The reading · bought October 4, 2026", action: "Open" });
  // A record with its details keeps when and where.
  const kept = { ...old, birth: ALEX };
  assert.equal(chartCard(kept).line, "The reading · July 22, 1991 · Denver, Colorado");
  // A nameless chart bought for someone else is "Their chart", as its ready email says (10/22).
  assert.equal(chartCard({ tier: 1, pending: false, fresh: true, birth: { ...ALEX, name: undefined }, buyer: { name: "Alex Rivera" } }).title, "Their chart");
});

test("#8 TWO OLDER RECORDS BOUGHT ON ONE DAY SAY THE TIME TOO, so no two rows read the same", () => {
  const at = (iso) => ({ tier: 2, pending: false, birth: null, buyer: { name: null }, purchasedAt: Date.parse(iso) / 1000 });
  const m = myChartsEmail({
    charts: [at("2026-10-04T15:12:00Z"), at("2026-10-04T20:40:00Z"), at("2026-10-06T17:00:00Z")].map((reading, i) => ({ reading, url: `https://x/r/${i}` })),
    links: LINKS,
    origin: "https://x",
  });
  assert.match(m.text, /Your reading — The reading · bought October 4, 2026 at 10:12 AM/);
  assert.match(m.text, /Your reading — The reading · bought October 4, 2026 at 3:40 PM/);
  assert.match(m.text, /Your reading — The reading · bought October 6, 2026\n/, "a date no other row has needs no time");
});

test("#8 AN OLDER RECORD OF A NEWER ONE'S CHART IS LISTED ONCE -- never a reading behind a summary", async () => {
  const readings = memoryStore();
  const index = memoryStore();
  const chartOut = chartFor(ALEX);
  const older = (tier) => {
    const id = randomBytes(16).toString("hex");
    readings.m.set(id, {
      v: 1,
      tier,
      output: chartOut,
      buyer: { name: "Alex Rivera", email: "alex@example.com", phone: null },
      sku: TIERS[tier].sku,
      purchasedAt: Math.floor(NOW / 1000) - 86_400 * 5,
      createdAt: Math.floor(NOW / 1000) - 86_400 * 5,
      filledAt: Math.floor(NOW / 1000) - 86_400 * 5,
    });
    return id;
  };
  const oldChart = older(1);
  // Bought again today, the release-2 way, the same chart.
  const today = await buy(readings, 1);
  await chart(readings, { reading: mintReadingLink({ id: today, tier: 1, now: NOW }, SECRET), birth: ALEX });
  let found = (await chartsForEmail({ readings, index, email: "alex@example.com", secret: SECRET, now: NOW })).map((f) => f.id);
  assert.deepEqual(found, [today], "his chart was listed twice");
  assert.ok(!found.includes(oldChart));

  // An older READING of the same chart stays: today's is only a chart.
  const oldReading = older(2);
  await index.setJSON(BACKFILL_KEY, null);
  index.m.delete(BACKFILL_KEY);
  found = (await chartsForEmail({ readings, index, email: "alex@example.com", secret: SECRET, now: NOW })).map((f) => f.id);
  assert.ok(found.includes(oldReading), "an older reading was hidden behind a newer chart");
});

// --- #9 and #15: the checker's near misses ------------------------------------------------

const PROJECTOR = { type: "Projector", definedCenters: ["G", "Throat"], undefinedCenters: ["Sacral"], openCenters: ["Head"] };
const S6 = INTERPRETATION[5];

test("#15 A PROJECTOR IS NOT 'frustrated' in the on / off track section", () => {
  const raw = chainReading(PROJECTOR, {
    [S6]: "When you push into rooms that have not invited you, your energy becomes depleted and frustrated. Noticing this feeling serves as a gentle guide.",
  });
  assert.match(check(raw, PROJECTOR), /gives a Projector "frustrated".*another type's word Frustration \(theirs are Success and Bitterness\)/);
});

test("#9 A MISSPELLED 'not-self' IS REFUSED ('not-sf'), plain 'not-' words are not", () => {
  const raw = chainReading(PROJECTOR, { [S6]: "Because your not-sf feeling is bitterness, it tells you something is off. It is a signal and not a verdict." });
  assert.match(nearMissProblem(raw, "Projector"), /"not-sf".*misspelled "not-self"/);
  for (const ok of ["not-so", "not-yet", "not-knowing"]) {
    const fine = chainReading(PROJECTOR, { [S6]: `A ${ok} moment is part of it. Success feels like being seen; bitterness says you were not.` });
    assert.equal(nearMissProblem(fine, "Projector"), null, ok);
  }
});

test("#9 #15 another type's word OUTSIDE on / off track, or not felt by the reader, still passes", () => {
  const raw = chainReading(PROJECTOR, {
    "How you decide": "Talking it through brings profound satisfaction to the people around you, and the deep peace of your own company helps too.",
    [S6]: "Success feels like being recognized for what you see. Bitterness is the sign that you went uninvited, and it is a signal, not a verdict.",
  });
  assert.equal(nearMissProblem(raw, "Projector"), null);
  assert.equal(check(raw, PROJECTOR), null);
});

test("#9 A MISSPELLED 'signature' IS REFUSED in the on-track lines (the rig's probe: 'signiture')", () => {
  for (const slip of ["signiture", "signture", "Signatrue"]) {
    const raw = chainReading(PROJECTOR, { [S6]: `Your ${slip} feeling is success when you wait to be invited. It is a signal, not a verdict.` });
    assert.match(nearMissProblem(raw, "Projector") ?? "", new RegExp(`"${slip}".*misspelled "signature"`), slip);
  }
  const fine = chainReading(PROJECTOR, { [S6]: "A significant signal of success is being invited in. Bitterness is the sign that you went uninvited, and it passes." });
  assert.equal(nearMissProblem(fine, "Projector"), null);
});

test("#9 #15 the reading on file still passes the whole chain", () => {
  assert.equal(nearMissProblem(TEXT, "Manifesting Generator"), null);
});

// --- #14: the authority side note ---------------------------------------------------------

test("#14 (14B) THE SIDE NOTE NAMES THE AUTHORITY'S OWN CENTER -- none for Mental or Lunar", () => {
  const centre = (authority, definition = "Split") =>
    marginNotes({ authority, definition, definedCenters: ["Sacral", "Solar Plexus", "Spleen"] })[INTERPRETATION[1]].find(([k]) => k === "CENTER")?.[1] ?? null;
  assert.equal(centre("Emotional"), "Solar Plexus");
  assert.equal(centre("Sacral"), "Sacral");
  assert.equal(centre("Splenic"), "Spleen");
  assert.equal(centre("Ego"), "Heart");
  assert.equal(centre("Ego Manifested"), "Heart");
  assert.equal(centre("Ego Projected"), "Heart");
  assert.equal(centre("Self-Projected", "Single"), "G", "it printed the Definition, 'Single'");
  assert.equal(centre("Mental"), null);
  assert.equal(centre("Lunar", "None"), null);
  assert.deepEqual(Object.keys(AUTHORITY_CENTER).sort(), ["Ego", "Ego Manifested", "Ego Projected", "Emotional", "Sacral", "Self-Projected", "Splenic"]);
});

// --- #16 and the nameless gift chart: the emails ------------------------------------------

const mail = (over) => deliveryEmail({ tier: 0, name: "Jeremy Champagne", url: "https://x/r/t", links: LINKS, ...over });
const all = (m) => `${m.subject}\n${m.text}\n${m.html}`;

test("#16 THE RECEIPT FOR SOMEONE NEW: their birth details, not yours", () => {
  const m = mail({ tier: 1, pending: true, someoneNew: true });
  assert.match(m.text, /Their birth date, time and place\. Their chart is made from them, and the time can be left out if it isn’t known\./);
  assert.match(m.text, /Enter their birth details:/);
  assert.doesNotMatch(m.text, /Your birth date|Enter your birth details/);
});

test("THE GIFT RECEIPT'S SUBJECT (Jeremy 10/22, call 5): the buyer's name, then a chart for someone else", () => {
  const price = (tier) => money(TIERS[tier].cents);
  const m = mail({ tier: 1, name: "Emery Testwell", pending: true, someoneNew: true, amountCents: TIERS[1].cents });
  assert.equal(m.subject, `Receipt: Emery Testwell, a Human Design chart for someone else, ${price(1)}`);
  // The tier word and the price vary; a buyer with no name on file gets no name.
  assert.equal(mail({ tier: 2, name: "Emery Testwell", pending: true, someoneNew: true, amountCents: TIERS[2].cents }).subject, `Receipt: Emery Testwell, a Human Design reading for someone else, ${price(2)}`);
  assert.equal(mail({ tier: 0, name: null, pending: true, someoneNew: true, amountCents: TIERS[0].cents }).subject, `Receipt: A Human Design summary for someone else, ${price(0)}`);
  // The buyer's own new chart: the first name its form starts with (decision 15).
  assert.equal(mail({ tier: 1, name: "Emery Testwell", pending: true, amountCents: TIERS[1].cents }).subject, `Receipt: Emery’s Human Design chart, ${price(1)}`);
});

test("#16 THE READY EMAIL FOR SOMEONE NEW: 'Quinn’s summary is ready', their centers, their cross", () => {
  const m = mail({ tier: 0, chartName: "Quinn", someoneNew: true });
  assert.equal(m.subject, "Quinn’s Human Design summary is ready");
  assert.match(m.text, /^Hello Jeremy Champagne,\n\nQuinn’s summary is ready\./);
  assert.match(m.text, /✓ Their definition and their centers\n {2}✓ Their channels and activated gates\n {2}✓ Their incarnation cross/);
  assert.match(m.text, /Open Quinn’s summary:/);
  assert.match(m.text, /Quinn’s summary is kept for a year/);
  assert.match(m.text, /every word in their summary explained/);
  assert.doesNotMatch(m.text, /Your summary|your centers|your incarnation cross|Open your/);
  const r = mail({ tier: 2, chartName: "Morgan", someoneNew: true });
  assert.match(r.text, /Morgan’s chart and written reading are ready\./);
  assert.match(r.text, /About 1,200 words written to their chart/);
  assert.match(r.text, /Open Morgan’s reading:/);
});

test("#16 WHAT ELSE THERE IS, for someone new: their bodygraph, their channels", () => {
  const m = mail({ tier: 0, chartName: "Quinn", someoneNew: true });
  assert.match(m.text, /The chart contains their bodygraph, drawn — the summary’s values as a picture, on a page you can share and a PDF you keep\./);
  assert.match(mail({ tier: 0 }).text, /The chart contains your bodygraph, drawn — the summary’s values as a picture/);
  assert.equal(TIERS[0].theirBlurb, "Type, Strategy, Authority, Profile, Definition, their centers, their channels and activated gates, their incarnation cross.");
});

test("A CHART FOR SOMEONE ELSE NEVER CARRIES THE BUYER'S NAME, even with none typed", () => {
  const m = mail({ tier: 1, name: "Sage Testwell", chartName: null, someoneNew: true });
  assert.doesNotMatch(all(m).replaceAll("Hello Sage Testwell,", ""), /Sage/);
  // To the buyer it is theirs, as the body says ("Their chart is ready."), never "Your".
  assert.equal(m.subject, "Their Human Design chart is ready");
  assert.equal(mail({ tier: 1, name: "Sage Testwell", chartName: null, someoneNew: true, freshLink: true }).subject, "A fresh link to their Human Design chart");
  assert.match(m.text, /Their chart is ready\./);
  assert.match(m.text, /Open their chart:/);
  assert.match(m.text, /Their chart is kept for a year/);
  // The buyer's own chart with no name typed still falls back to the buyer's.
  assert.equal(mail({ tier: 1, chartName: null }).subject, "Jeremy Champagne’s Human Design chart is ready");
});

test("the buyer's own emails are unchanged by any of this", () => {
  const m = mail({ tier: 0, chartName: "Alex" });
  assert.match(m.text, /Your summary is ready\.\n\nIn it:\n {2}✓ Type, Strategy, Authority and Profile\n {2}✓ Your definition and your centers/);
  assert.match(m.text, /Open your summary:/);
});

// --- W3, W5, W7: the emails' wording ------------------------------------------------------

test("W3 THE EMAIL'S LIBRARY LINE NAMES WHAT THIS BUYER HAS", () => {
  for (const [tier, word] of [[0, "summary"], [1, "chart"], [2, "reading"]]) {
    for (const pending of [true, false]) {
      assert.match(mail({ tier, pending }).text, new RegExp(`every word in your ${word} explained`), `tier ${tier}`);
    }
  }
});

test("W7 A FRESH LINK SAYS IT IS ONE: subject and first line", () => {
  const m = mail({ tier: 0, chartName: "Rowan Testwell", freshLink: true });
  assert.equal(m.subject, "A fresh link to Rowan Testwell’s Human Design summary");
  assert.match(m.text, /Here is the fresh link you asked for — Rowan Testwell’s summary\./);
  const nameless = mail({ tier: 1, name: null, freshLink: true });
  assert.equal(nameless.subject, "A fresh link to your Human Design chart");
  assert.match(nameless.text, /Here is the fresh link you asked for — your chart\./);
});

test("W7 'Email me this link' on a filled chart sends the fresh-link email", async () => {
  const store = memoryStore();
  const id = await saveReading(store, { tier: 0, output: { type: "Generator" }, name: "Rowan Testwell", email: "r@example.com", now: NOW });
  const sent = [];
  const send = async (m) => (sent.push(m), { ok: true });
  const res = await handleResend({
    body: JSON.stringify({ token: mintReadingLink({ id, tier: 0, now: NOW }, SECRET) }),
    store,
    counters: { load: async () => [], save: async () => {} },
    visitorKey: "v",
    secret: SECRET,
    send,
    origin: "https://x",
    links: LINKS,
    now: NOW,
  });
  assert.equal(res.status, 200);
  assert.match(sent[0].subject, /^A fresh link to /);
});

// --- W12: the chart PDF -------------------------------------------------------------------

test("W12 THE CHART PDF IS A CHART, not an interpretation; the reading's keeps its title", async () => {
  const chartPdf = await readingPdf({ tier: 1, name: "Rowan", output: OUTPUT, birth: BIRTH, inspect: true });
  assert.equal(chartPdf.runs.find((x) => x.page === 1).text, TITLE_MARK_CHART);
  assert.equal(TITLE_MARK_CHART, "HUMAN DESIGN CHART by THE CHAMPAGNE METHOD");
  assert.ok(!chartPdf.runs.some((x) => x.text === TITLE_MARK));
  const readingDoc = await pdf({ reading: READING });
  assert.equal(readingDoc.runs.find((x) => x.page === 1).text, TITLE_MARK);
});

test("W12 EACH FREE PAGE AT ITS OWN ADDRESS, and the guide's address opens the guide", async () => {
  assert.match(ONWARD_NOTE, /thechampagnemethod\.co\/library\/human-design and thechampagnemethod\.co\/library\/bodygraph\./);
  assert.ok(ONWARD_LINKS.some(([phrase, uri]) => phrase === "thechampagnemethod.co/library/bodygraph" && uri === BODYGRAPH_GUIDE));
  const r = await pdf({ reading: READING });
  const page = notePage(r);
  assert.ok(r.links.some((l) => l.page === page && l.uri === BODYGRAPH_GUIDE));
});

// --- W15: the correction travels ----------------------------------------------------------

test("W15 A CORRECTED CHART'S NOTE TRAVELS WITH ITS UPGRADE ('Your correction' on the reading)", async () => {
  const readings = memoryStore();
  const sum = await buy(readings, 0);
  await chart(readings, { reading: mintReadingLink({ id: sum, tier: 0, now: NOW }, SECRET), birth: ALEX });
  // The chart, with "Change a detail": a correction.
  const ch = await buy(readings, 1, { upgrades: sum });
  await chart(readings, { reading: mintReadingLink({ id: ch, tier: 1, now: NOW }, SECRET), birth: { ...ALEX, time: "17:52" } });
  const corrected = await loadReading(readings, ch, NOW);
  assert.equal(corrected.correction?.type, "correction");
  // The reading, confirmed with "These are right": nothing new to say, the chart's note carried.
  const rd = await buy(readings, 2, { upgrades: ch });
  const res = await chart(readings, { reading: mintReadingLink({ id: rd, tier: 2, now: NOW }, SECRET), kept: true });
  assert.equal(res.status, 200);
  assert.deepEqual((await loadReading(readings, rd, NOW)).correction, corrected.correction);
});

test("A CHART BOUGHT AFTER A BIRTH TIME WAS ADDED does not say it was 'now redone' (10/22 verbatim read)", async () => {
  const readings = memoryStore();
  const sum = await buy(readings, 0);
  await chart(readings, { reading: mintReadingLink({ id: sum, tier: 0, now: NOW }, SECRET), birth: ALEX });
  // The summary's note is a birth time added (as addTime.mjs writes it), straight into the stored record.
  readings.m.set(sum, { ...readings.m.get(sum), correction: { type: "time-added", at: 1, changed: ["time"], was: {}, now: { time: "15:10", timeKnown: true }, chart: [] } });
  assert.equal((await loadReading(readings, sum, NOW)).correction?.type, "time-added");
  const ch = await buy(readings, 1, { upgrades: sum });
  await chart(readings, { reading: mintReadingLink({ id: ch, tier: 1, now: NOW }, SECRET), kept: true });
  assert.equal((await loadReading(readings, ch, NOW)).correction, null, "the chart was made with that time");
});

test("W15 an upgrade of a chart that was never corrected still has nothing to say", async () => {
  const readings = memoryStore();
  const sum = await buy(readings, 0);
  await chart(readings, { reading: mintReadingLink({ id: sum, tier: 0, now: NOW }, SECRET), birth: ALEX });
  const rd = await buy(readings, 2, { upgrades: sum });
  await chart(readings, { reading: mintReadingLink({ id: rd, tier: 2, now: NOW }, SECRET), kept: true });
  assert.equal((await loadReading(readings, rd, NOW)).correction, null);
});

// --- the nameless gift chart: page, PDF and the emails that follow ------------------------

test("A NAMELESS CHART FOR SOMEONE ELSE IS 'Your Human Design' on the page and in the PDF, never the buyer's", async () => {
  const readings = memoryStore();
  const gift = await buy(readings, 1, { fresh: "1" });
  const token = mintReadingLink({ id: gift, tier: 1, now: NOW }, SECRET);
  await chart(readings, { reading: token, birth: { ...ALEX, name: undefined } });
  const body = JSON.parse((await handleReading({ body: JSON.stringify({ token }), store: readings, secret: SECRET, now: NOW })).body);
  assert.equal(body.name, null);
  assert.ok(!body.whose, "the buyer's first name stood in for theirs");
  assert.equal(chartTitle(body.name), "Your Human Design");
  const built = [];
  await handlePdf({ token, secret: SECRET, store: readings, build: async (x) => (built.push(x), new Uint8Array([1])), links: {}, now: NOW });
  assert.equal(built[0].name, null);
  // The buyer's own chart with no name typed still falls back to the buyer's name.
  const own = await buy(readings, 1);
  const ownToken = mintReadingLink({ id: own, tier: 1, now: NOW }, SECRET);
  await chart(readings, { reading: ownToken, birth: { ...ALEX, name: undefined } });
  assert.equal(JSON.parse((await handleReading({ body: JSON.stringify({ token: ownToken }), store: readings, secret: SECRET, now: NOW })).body).name, "Alex Rivera");
  assert.equal(buyerNameFor({ fresh: true, buyer: { name: "Alex Rivera" } }), null);
  assert.equal(buyerNameFor({ buyer: { name: "Alex Rivera" } }), "Alex Rivera");
});

test("THE READING-READY EMAIL KNOWS A CHART FOR SOMEONE NEW (it said 'your')", async () => {
  const store = memoryStore();
  const id = await saveReading(store, { tier: 2, output: null, name: "Sage Testwell", email: "s@example.com", fresh: true, now: NOW });
  await fillReading(store, id, {
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
  });
  const emails = [];
  const r = await interpretOne({
    id,
    store,
    health: memoryStore(),
    apiKey: "k",
    grantSecret: "s".repeat(32),
    origin: "https://x",
    generate: async () => ({ ok: true, text: TEXT }),
    deliver: { email: async (m) => emails.push(m) },
  });
  assert.equal(r.ok, true);
  assert.equal(emails[0].someoneNew, true);
});
