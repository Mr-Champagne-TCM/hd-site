import { test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { handleChart } from "../netlify/lib/handler.mjs";
import { handleReading } from "../netlify/lib/readingHandler.mjs";
import { handlePdf } from "../netlify/lib/pdfHandler.mjs";
import { handleResend } from "../netlify/lib/resendHandler.mjs";
import { loadCurrent, loadReading, mintReadingLink, readReadingLink, saveReading } from "../netlify/lib/reading.mjs";
import { emailKey, recordPurchase } from "../netlify/lib/charts.mjs";
import { correctionNote, grownNote } from "../shared/correctionNote.mjs";
import { TIERS } from "../shared/pricing.mjs";

/**
 * THE RETURNING BUYER, END TO END ON THE SERVER (release 2, Jeremy 10/19-10/20).
 *
 *   - the summary keeps its birth details, and an upgrade carries them over:
 *     confirm, do not retype
 *   - "Change a detail" is a CORRECTION by the same person: the corrected
 *     details become the record's details, the old ones go to a history for
 *     support only, and the reading says calmly what changed
 *   - "This is not the chart you had before" is retired everywhere
 *   - an old link after an upgrade opens the grown chart
 *   - records from before release 2 keep working, with nothing migrated
 *
 * Made-up people only: Alex bought; Sam is someone new.
 */

const SECRET = randomBytes(32).toString("hex");
const NOW = Date.parse("2026-10-20T15:00:00Z");

function memoryStore() {
  const m = new Map();
  return {
    m,
    async setJSON(k, v) {
      m.set(k, JSON.parse(JSON.stringify(v)));
    },
    async get(k) {
      return m.has(k) ? m.get(k) : null;
    },
  };
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

/** Alex: a 5:40 PM birth is Sacral; the 5:52 PM he learned later is Emotional. */
const ALEX = { date: "1991-07-22", time: "17:40", timeKnown: true, place: "Denver, Colorado", zone: "America/Denver", name: "Alex" };
const chartFor = (birth) => ({
  type: "Manifesting Generator",
  profile: "2/4",
  authority: birth.time === "17:52" ? "Emotional" : "Sacral",
  definition: "Single",
  definedCenters: birth.time === "17:52" ? ["Sacral", "Throat", "Solar Plexus"] : ["Sacral", "Throat"],
  channels: ["20-34 (Charisma)"],
});
function engine() {
  const calls = [];
  const fn = async ({ birth }) => {
    calls.push(birth);
    return { ok: true, status: 200, payload: chartFor(birth) };
  };
  fn.calls = calls;
  return fn;
}

const session = (level, meta = {}) => ({
  payment_status: "paid",
  created: Math.floor(NOW / 1000),
  amount_total: 0,
  customer_details: { name: "Alex Rivera", email: "alex@example.com" },
  metadata: { level: String(level), sku: TIERS[level].sku, ...meta },
});

const chart = (readings, body, eng = engine()) =>
  handleChart({ body: JSON.stringify(body), ip: "203.0.113.9", now: NOW, store: counters(), engine: eng, grantSecret: SECRET, readings });

/** Alex's summary, bought and filled the release-2 way: details kept. */
async function alexSummary(readings, index) {
  const id = randomBytes(16).toString("hex");
  await recordPurchase({ readings, index, id, level: 0, session: session(0), secret: SECRET, now: NOW });
  const res = await chart(readings, { reading: mintReadingLink({ id, tier: 0, now: NOW }, SECRET), birth: ALEX });
  assert.equal(res.status, 200);
  return id;
}

/** Alex takes his chart a step further: "For me", paid, recorded. */
async function upgrade(readings, index, fromId, level) {
  const id = randomBytes(16).toString("hex");
  await recordPurchase({ readings, index, id, level, session: session(level, { upgrades: fromId }), secret: SECRET, now: NOW });
  return id;
}

// --- the summary keeps its details; an upgrade carries them ----------------------

test("THE SUMMARY KEEPS ITS BIRTH DETAILS, the name for the chart with them", async () => {
  const readings = memoryStore();
  const id = await alexSummary(readings, memoryStore());
  const r = await loadReading(readings, id, NOW);
  assert.deepEqual(r.birth, ALEX);
  assert.equal(r.person, id, "a first purchase is its own person");
  assert.equal(r.legacy, false);
});

test("AN UPGRADE CARRIES THE KEPT DETAILS, and the old record is marked as grown", async () => {
  const readings = memoryStore();
  const index = memoryStore();
  const sum = await alexSummary(readings, index);
  const up = await upgrade(readings, index, sum, 2);
  const r = await loadReading(readings, up, NOW);
  assert.equal(r.pending, true);
  assert.deepEqual(r.birth, ALEX, "nothing to retype: the details came along");
  assert.equal(r.grewFrom, sum);
  assert.equal(r.person, sum, "the same person's chart");
  assert.equal((await loadReading(readings, sum, NOW)).grewTo, up);
  // The list holds both, as ids -- no address, no birth details.
  const list = await index.get(emailKey("alex@example.com", SECRET));
  assert.deepEqual(list.charts.map((c) => c.id).sort(), [sum, up].sort());
  assert.ok(!JSON.stringify(list).includes("1991"));
  assert.ok(!JSON.stringify(list).includes("alex@"));
});

test("THE RECEIPT SAYS THE CHART'S OWN TITLE (Jeremy 10/23, option 1): an upgrade of a chart titled Robin’s", async () => {
  const { deliveryEmail } = await import("../netlify/lib/deliveryEmail.mjs");
  const { SITE } = await import("../netlify/lib/siteLinks.mjs");
  const readings = memoryStore();
  // Alex Rivera buys a summary and titles the chart "Robin" (a chart for his partner, bought for himself).
  const id = randomBytes(16).toString("hex");
  const first = await recordPurchase({ readings, id, level: 0, session: session(0), secret: SECRET, now: NOW });
  assert.equal(first.chartName, null, "a brand-new chart has no title typed yet");
  assert.equal((await chart(readings, { reading: mintReadingLink({ id, tier: 0, now: NOW }, SECRET), birth: { ...ALEX, name: "Robin" } })).status, 200);
  // Then takes that chart to the reading: the purchase knows the chart's name...
  const up = randomBytes(16).toString("hex");
  const rec = await recordPurchase({ readings, id: up, level: 2, session: session(2, { upgrades: id }), secret: SECRET, now: NOW });
  assert.equal(rec.chartName, "Robin");
  // ...and the receipt says the chart's title, not the payer's name.
  // (Prices from shared/pricing.mjs only: P-1.)
  const { money } = await import("../shared/pricing.mjs");
  const upgradeCents = TIERS[2].cents - TIERS[0].cents;
  const receipt = deliveryEmail({ tier: 2, name: "Alex Rivera", chartName: rec.chartName, url: "https://x.test/r/a.b", links: SITE, pending: true, kept: rec.kept, amountCents: upgradeCents });
  assert.equal(receipt.subject, `Receipt: Robin’s Human Design reading, ${money(upgradeCents)}`);
});

test("SOMEONE NEW is marked fresh and is its own person", async () => {
  const readings = memoryStore();
  const id = randomBytes(16).toString("hex");
  await recordPurchase({ readings, id, level: 1, session: session(1, { fresh: "1" }), secret: SECRET, now: NOW });
  const r = await loadReading(readings, id, NOW);
  assert.equal(r.fresh, true);
  assert.equal(r.person, id);
  assert.equal(r.grewFrom, null);
  assert.equal(r.birth, null, "nothing carried to someone new");
});

test("someone else's options say what THEIR next step adds (10/26 live test: 'Your bodygraph drawn')", async () => {
  const { CHART, READING } = await import("../shared/pricing.mjs");
  assert.equal(CHART.addsTheirs, "Their bodygraph drawn, and its PDF to keep.");
  assert.equal(READING.addsToSummaryTheirs, "Their bodygraph drawn, all twenty-six planet numbers and the written reading.");
  // The same words otherwise, so the two can never drift apart.
  assert.equal(CHART.addsTheirs.replace(/^Their/, "Your"), CHART.adds);
  assert.equal(READING.addsToSummaryTheirs.replace(/^Their/, "Your"), READING.addsToSummary);
});

test("SOMEONE NEW, GROWN, IS STILL THEIRS: the upgrade keeps the mark, and its ready email says their (10/25 live test)", async () => {
  const { deliveryEmail } = await import("../netlify/lib/deliveryEmail.mjs");
  const { SITE } = await import("../netlify/lib/siteLinks.mjs");
  const readings = memoryStore();
  const id = randomBytes(16).toString("hex");
  await recordPurchase({ readings, id, level: 0, session: session(0, { fresh: "1" }), secret: SECRET, now: NOW });
  assert.equal((await chart(readings, { reading: mintReadingLink({ id, tier: 0, now: NOW }, SECRET), birth: { ...ALEX, name: "Theo" } })).status, 200);
  // The filled-in chart's own page knows it is theirs (the options page reads this: "For them").
  const opened = JSON.parse((await handleReading({ body: JSON.stringify({ token: mintReadingLink({ id, tier: 0, now: NOW }, SECRET) }), store: readings, secret: SECRET, now: NOW })).body);
  assert.notEqual(opened.pending, true);
  assert.equal(opened.fresh, true, "a filled-in someone-new chart says so");
  const up = randomBytes(16).toString("hex");
  await recordPurchase({ readings, id: up, level: 1, session: session(1, { upgrades: id }), secret: SECRET, now: NOW });
  const grown = await loadReading(readings, up, NOW);
  assert.equal(grown.fresh, true, "the grown chart is still someone else's");
  assert.equal(grown.person, (await loadReading(readings, id, NOW)).person);
  const ready = deliveryEmail({ tier: 1, name: "Alex Rivera", chartName: "Theo", url: "https://x.test/r/a.b", links: SITE, someoneNew: grown.fresh === true });
  assert.match(ready.text, /Their bodygraph, drawn/);
  assert.doesNotMatch(ready.text, /Your bodygraph/);
  // The buyer's own chart, grown, is still the buyer's.
  const mine = randomBytes(16).toString("hex");
  await recordPurchase({ readings, id: mine, level: 0, session: session(0), secret: SECRET, now: NOW });
  const mineUp = randomBytes(16).toString("hex");
  await recordPurchase({ readings, id: mineUp, level: 1, session: session(1, { upgrades: mine }), secret: SECRET, now: NOW });
  assert.equal((await loadReading(readings, mineUp, NOW)).fresh, false);
});

test("an upgrade naming a chart that already grew this far stands on its own, and Jeremy is told", async () => {
  const readings = memoryStore();
  const sum = await alexSummary(readings, memoryStore());
  await upgrade(readings, null, sum, 1);
  const notes = [];
  const second = randomBytes(16).toString("hex");
  await recordPurchase({
    readings,
    id: second,
    level: 1,
    session: session(1, { upgrades: sum }),
    secret: SECRET,
    now: NOW,
    note: async (kind) => notes.push(kind),
  });
  assert.deepEqual(notes, ["upgrade-already-grown"]);
  assert.equal((await loadReading(readings, second, NOW)).grewFrom, null);
});

// --- confirm, or correct -------------------------------------------------------------

test("'THESE ARE RIGHT': the chart is cast from the KEPT details, with no birth sent", async () => {
  const readings = memoryStore();
  const sum = await alexSummary(readings, memoryStore());
  const up = await upgrade(readings, null, sum, 2);
  const eng = engine();
  const res = await chart(readings, { reading: mintReadingLink({ id: up, tier: 2, now: NOW }, SECRET), kept: true }, eng);
  assert.equal(res.status, 200);
  assert.equal(eng.calls[0].time, "17:40");
  assert.equal(eng.calls[0].zone, "America/Denver");
  assert.equal(eng.calls[0].place, undefined, "the place name still never reaches the engine");
  const r = await loadReading(readings, up, NOW);
  assert.deepEqual(r.birth, ALEX);
  assert.deepEqual(r.history, []);
  assert.equal(r.correction, null, "nothing changed, so nothing to say");
});

test("'kept' on a record with no kept details is refused, not guessed", async () => {
  const readings = memoryStore();
  const id = randomBytes(16).toString("hex");
  await recordPurchase({ readings, id, level: 1, session: session(1), secret: SECRET, now: NOW });
  const res = await chart(readings, { reading: mintReadingLink({ id, tier: 1, now: NOW }, SECRET), kept: true });
  assert.equal(res.status, 400);
});

test("CHANGE A DETAIL IS A CORRECTION: new details kept, old ones in the history, a calm note -- never an alarm", async () => {
  const readings = memoryStore();
  const sum = await alexSummary(readings, memoryStore());
  const up = await upgrade(readings, null, sum, 2);
  const corrected = { ...ALEX, time: "17:52" };
  const res = await chart(readings, { reading: mintReadingLink({ id: up, tier: 2, now: NOW }, SECRET), birth: corrected });
  assert.equal(res.status, 200, "THE RETIRED ALARM: a changed chart is not stopped");
  assert.notEqual(JSON.parse(res.body)?.error?.code, "chart_differs");

  const r = await loadReading(readings, up, NOW);
  assert.equal(r.birth.time, "17:52", "the corrected details are the record's details");
  assert.equal(r.history.length, 1);
  assert.equal(r.history[0].was.time, "17:40", "the old entry is kept for support");
  assert.deepEqual(r.history[0].changed, ["time"]);
  assert.equal(r.correction.type, "correction");
  assert.deepEqual(r.correction.changed, ["time"]);
  assert.deepEqual(r.correction.chart, [{ field: "authority", was: "Sacral", now: "Emotional" }]);

  // The calm words.
  const note = correctionNote(r.correction);
  assert.equal(note.eyebrow, "Your correction");
  assert.match(note.lead, /Birth time changed from 5:40 PM to 5:52 PM — your chart is cast from the corrected details\./);
  assert.match(note.body, /your Authority is now Emotional \(it was Sacral\)/);
  assert.match(note.body, /nothing went wrong/);
  assert.match(note.body, /Your Type and Profile are the same\./);
  assert.equal(note.learn.label, "What Emotional authority means");
});

test("THE HISTORY IS NEVER SHOWN: not on the page's answer, whatever it holds", async () => {
  const readings = memoryStore();
  const sum = await alexSummary(readings, memoryStore());
  const up = await upgrade(readings, null, sum, 1);
  const token = mintReadingLink({ id: up, tier: 1, now: NOW }, SECRET);
  await chart(readings, { reading: token, birth: { ...ALEX, time: "17:52" } });
  const res = await handleReading({ body: JSON.stringify({ token }), store: readings, secret: SECRET, now: NOW });
  const body = JSON.parse(res.body);
  assert.equal(res.status, 200);
  assert.equal(body.history, undefined);
  assert.ok(!res.body.includes('"history"'));
  assert.equal(body.correction.type, "correction", "the calm note's data is there");
});

test("history follows the person: a second correction keeps the first", async () => {
  const readings = memoryStore();
  const sum = await alexSummary(readings, memoryStore());
  const chartId = await upgrade(readings, null, sum, 1);
  await chart(readings, { reading: mintReadingLink({ id: chartId, tier: 1, now: NOW }, SECRET), birth: { ...ALEX, time: "17:52" } });
  const readingId = await upgrade(readings, null, chartId, 2);
  await chart(readings, { reading: mintReadingLink({ id: readingId, tier: 2, now: NOW }, SECRET), birth: { ...ALEX, time: "17:52", place: "Boulder, Colorado" } });
  const r = await loadReading(readings, readingId, NOW);
  assert.deepEqual(r.history.map((h) => h.changed), [["time"], ["place"]]);
});

// --- an older summary (no details kept) types them once -------------------------------

test("AN OLDER SUMMARY TYPES ITS DETAILS ONCE, and hears calmly only if the chart moved", async () => {
  const readings = memoryStore();
  // Written the pre-release-2 way: no person, no birth.
  const old = randomBytes(16).toString("hex");
  readings.m.set(old, {
    v: 1,
    tier: 0,
    output: chartFor(ALEX),
    buyer: { name: "Alex Rivera", email: "alex@example.com", phone: null },
    sku: "hd_summary",
    purchasedAt: Math.floor(NOW / 1000) - 86_400,
    createdAt: Math.floor(NOW / 1000) - 86_400,
    filledAt: Math.floor(NOW / 1000) - 86_000,
  });
  const up = await upgrade(readings, null, old, 2);
  const r0 = await loadReading(readings, up, NOW);
  assert.equal(r0.birth, null, "nothing to carry");

  // The page asks once ("typeOnce"), and the answer says so.
  const token = mintReadingLink({ id: up, tier: 2, now: NOW }, SECRET);
  const pending = JSON.parse((await handleReading({ body: JSON.stringify({ token }), store: readings, secret: SECRET, now: NOW })).body);
  assert.equal(pending.typeOnce, true);
  assert.equal(pending.kept, null);

  await chart(readings, { reading: token, birth: { ...ALEX, time: "17:52" } });
  const r = await loadReading(readings, up, NOW);
  assert.equal(r.correction.type, "first-details");
  const note = correctionNote(r.correction);
  assert.equal(note.eyebrow, "What changed from your summary");
  assert.match(note.body, /Authority is now Emotional \(it was Sacral\)/);
  assert.deepEqual(r.history, [], "no earlier details existed to keep");
  assert.deepEqual(r.birth.time, "17:52", "and from now on they are kept");

  // The same chart typed again says nothing at all.
  const up2 = await upgrade(readings, null, old, 1);
  await chart(readings, { reading: mintReadingLink({ id: up2, tier: 1, now: NOW }, SECRET), birth: ALEX });
  assert.equal(correctionNote((await loadReading(readings, up2, NOW)).correction), null);
});

// --- the old link after an upgrade -------------------------------------------------

test("AN OLD LINK OPENS THE GROWN CHART, with 'Your chart has grown'", async () => {
  const readings = memoryStore();
  const sum = await alexSummary(readings, memoryStore());
  const oldToken = mintReadingLink({ id: sum, tier: 0, now: NOW }, SECRET);
  const up = await upgrade(readings, null, sum, 1);

  // Paid but not yet confirmed: the old link still opens the summary.
  let body = JSON.parse((await handleReading({ body: JSON.stringify({ token: oldToken }), store: readings, secret: SECRET, now: NOW })).body);
  assert.equal(body.tier, 0);
  assert.equal(body.grown, null);

  await chart(readings, { reading: mintReadingLink({ id: up, tier: 1, now: NOW }, SECRET), kept: true });
  body = JSON.parse((await handleReading({ body: JSON.stringify({ token: oldToken }), store: readings, secret: SECRET, now: NOW })).body);
  assert.equal(body.tier, 1, "the old link speaks for the grown chart");
  assert.deepEqual(body.grown, { fromTier: 0, fromLabel: "The summary" });
  const g = grownNote(body.grown.fromLabel, body.label);
  assert.equal(g.eyebrow, "Your chart has grown");
  assert.equal(g.lead, "This is now your chart.");

  // Its PDF, which a summary link never had, is the chart's.
  const built = [];
  const pdf = await handlePdf({ token: oldToken, secret: SECRET, store: readings, build: async (x) => (built.push(x), new Uint8Array([1])), links: {}, now: NOW });
  assert.equal(pdf.status, 200);
  assert.equal(built[0].tier, 1);

  // And "Email me this link" on the old link sends the grown chart's link.
  const sent = [];
  const counts = new Map();
  await handleResend({
    body: JSON.stringify({ token: oldToken }),
    store: readings,
    counters: { load: async (k) => counts.get(k) ?? [], save: async (k, v) => counts.set(k, v) },
    visitorKey: "v",
    secret: SECRET,
    send: async (m) => (sent.push(m), { ok: true }),
    origin: "https://x",
    links: { contact: "c@x", hd101: "h", bodygraph: "b", home: "https://x", privacy: "p" },
    now: NOW,
  });
  const fresh = /\/r\/([A-Za-z0-9_.-]+)/.exec(sent[0].text)[1];
  assert.equal(readReadingLink(fresh, SECRET, NOW).id, up);
});

test("a link signed for one tier cannot be pointed at another record's tier", async () => {
  const readings = memoryStore();
  const sum = await alexSummary(readings, memoryStore());
  const wrong = mintReadingLink({ id: sum, tier: 2, now: NOW }, SECRET);
  const res = await handleReading({ body: JSON.stringify({ token: wrong }), store: readings, secret: SECRET, now: NOW });
  assert.equal(res.status, 404);
});

// --- old-shape records: no migration ------------------------------------------------

test("A RECORD FROM BEFORE RELEASE 2 LOADS WITH DEFAULTS, and stays recognisably older when written", async () => {
  const readings = memoryStore();
  const id = randomBytes(16).toString("hex");
  readings.m.set(id, {
    v: 1,
    tier: 2,
    output: null,
    buyer: { name: "Alex Rivera", email: "alex@example.com", phone: null },
    sku: "hd_reading",
    purchasedAt: Math.floor(NOW / 1000) - 600,
    createdAt: Math.floor(NOW / 1000) - 600,
  });
  const r = await loadReading(readings, id, NOW);
  assert.equal(r.person, id);
  assert.equal(r.legacy, true);
  assert.equal(r.grewFrom, null);
  assert.equal(r.grewTo, null);
  assert.equal(r.fresh, false);
  assert.deepEqual(r.history, []);
  assert.equal(r.correction, null);
  assert.deepEqual((await loadCurrent(readings, id, NOW)).grown, false);

  // Its emailed link still opens its form, and filling it keeps it older.
  const token = mintReadingLink({ id, tier: 2, now: NOW }, SECRET);
  const res = await chart(readings, { reading: token, birth: ALEX });
  assert.equal(res.status, 200);
  const raw = readings.m.get(id);
  assert.equal(raw.person, undefined, "an older record is not silently re-labelled");
  assert.deepEqual(raw.birth, ALEX);
  assert.equal(raw.correction, undefined, "a first purchase has nothing to compare");
});

test("an older summary with NO details kept still opens, and is offered a step further", async () => {
  const readings = memoryStore();
  const id = randomBytes(16).toString("hex");
  readings.m.set(id, {
    v: 1,
    tier: 0,
    output: chartFor(ALEX),
    buyer: { name: "Alex Rivera", email: "alex@example.com", phone: null },
    sku: "hd_summary",
    purchasedAt: Math.floor(NOW / 1000) - 600,
    createdAt: Math.floor(NOW / 1000) - 600,
    filledAt: Math.floor(NOW / 1000) - 500,
  });
  const body = JSON.parse(
    (await handleReading({ body: JSON.stringify({ token: mintReadingLink({ id, tier: 0, now: NOW }, SECRET) }), store: readings, secret: SECRET, now: NOW })).body,
  );
  assert.equal(body.tier, 0);
  assert.equal(body.birthLine, null);
  assert.equal(body.whose, "Alex");
  assert.equal(body.upgrade.level, 1);
  assert.equal(body.grown, null);
  assert.equal(body.correction, null);
});

// --- the confirm screen's data -----------------------------------------------------

test("a pending upgrade answers with its kept details and the chart it grew from", async () => {
  const readings = memoryStore();
  const sum = await alexSummary(readings, memoryStore());
  const up = await upgrade(readings, null, sum, 2);
  const body = JSON.parse(
    (await handleReading({ body: JSON.stringify({ token: mintReadingLink({ id: up, tier: 2, now: NOW }, SECRET) }), store: readings, secret: SECRET, now: NOW })).body,
  );
  assert.equal(body.pending, true);
  assert.equal(body.kept.birthLine, "July 22, 1991 · 5:40 PM · Denver, Colorado");
  assert.equal(body.grewFrom.chart, "Manifesting Generator · 2/4 · Sacral authority");
  // A known birth time: nothing on the confirm screen is marked (B2).
  assert.deepEqual(body.grewFrom.chartParts, [
    { text: "Manifesting Generator", provisional: false },
    { text: "2/4", provisional: false },
    { text: "Sacral authority", provisional: false },
  ]);
  assert.deepEqual(body.grewFrom.definedCenters, ["Sacral", "Throat"]);
  assert.equal(body.whose, "Alex");
  assert.equal(body.chartName, "Alex");
});

test("the confirm screen marks the values that change during an unknown birth day, as everywhere else (B2)", async () => {
  const { chartParts } = await import("../netlify/lib/readingHandler.mjs");
  const output = {
    type: "Generator",
    profile: "3/5",
    authority: "Emotional",
    timeKnown: false,
    timeSpread: { ok: true, window: [0, 900], minutes: 1440, changes: ["profile", "authority"] },
  };
  assert.deepEqual(chartParts(output), [
    { text: "Generator", provisional: false },
    { text: "3/5", provisional: true },
    { text: "Emotional authority", provisional: true },
  ]);
  // An older record with no spread: the engine's own list, as the page uses.
  assert.deepEqual(
    chartParts({ type: "Generator", profile: "3/5", authority: "Sacral", timeKnown: false, provisional: ["type"] }).map((p) => p.provisional),
    [true, false, false],
  );
  assert.equal(chartParts(null), null);
});

test("a new chart for someone else starts with no name and no kept details", async () => {
  const readings = memoryStore();
  const id = randomBytes(16).toString("hex");
  await recordPurchase({ readings, id, level: 0, session: session(0, { fresh: "1" }), secret: SECRET, now: NOW });
  const body = JSON.parse(
    (await handleReading({ body: JSON.stringify({ token: mintReadingLink({ id, tier: 0, now: NOW }, SECRET) }), store: readings, secret: SECRET, now: NOW })).body,
  );
  assert.equal(body.fresh, true);
  assert.equal(body.chartName, "");
  assert.equal(body.kept, null);
});

// --- the words of the calm notes -----------------------------------------------------

test("the correction note says each change plainly, and the same chart kindly", () => {
  const n = correctionNote({
    type: "correction",
    changed: ["place", "name"],
    was: { place: "Denver, Colorado", name: "Alex" },
    now: { place: "Boulder, Colorado", name: "Alexander" },
    chart: [],
  });
  assert.match(n.lead, /Birth place changed from Denver, Colorado to Boulder, Colorado/);
  assert.match(n.lead, /The name on the chart changed from Alex to Alexander/);
  assert.equal(n.body, "Your Type, Profile and Authority are the same.");
  assert.equal(n.learn, null);
  assert.match(
    correctionNote({ type: "correction", changed: ["time"], was: { timeKnown: false }, now: { time: "09:05", timeKnown: true }, chart: [] }).lead,
    /Birth time added: 9:05 AM/,
  );
  assert.equal(correctionNote(null), null);
  assert.equal(correctionNote({ type: "correction", changed: [], chart: [] }), null);
});

test("no calm note ever says 'not the chart you had before'", () => {
  const n = correctionNote({ type: "correction", changed: ["time"], was: { time: "17:40" }, now: { time: "17:52" }, chart: [{ field: "type", was: "Generator", now: "Projector" }] });
  for (const s of [n.lead, n.body]) assert.doesNotMatch(s, /not the chart you had|not the same as the one you had/i);
});
