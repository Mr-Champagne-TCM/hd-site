import { test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { addTimeState, datePlaceLine, handleAddTime, mintAddTimeKey, readAddTimeKey } from "../netlify/lib/addTime.mjs";
import {
  READING_TTL_SECONDS,
  fillInterpretation,
  fillReading,
  loadCurrent,
  loadReading,
  mintReadingLink,
  readReadingLink,
  redoneWithTime,
  saveReading,
  updateRecord,
} from "../netlify/lib/reading.mjs";
import { recordPurchase } from "../netlify/lib/charts.mjs";
import { handleReading } from "../netlify/lib/readingHandler.mjs";
import { handlePdf } from "../netlify/lib/pdfHandler.mjs";
import { readingPdf } from "../netlify/lib/readingPdf.mjs";
import { correctionNote } from "../shared/correctionNote.mjs";
import { describe as describeKind } from "../netlify/lib/failures.mjs";
import { TIERS } from "../shared/pricing.mjs";
import { TEXT } from "./support/tier2Fixture.mjs";
import { deliveryEmail } from "../netlify/lib/deliveryEmail.mjs";
import { SITE } from "../netlify/lib/siteLinks.mjs";
import { ADD_TIME } from "../shared/timeSpread.mjs";

/**
 * "FOUND YOUR BIRTH TIME? YOU'RE WELCOME TO ADD IT HERE, ONCE AND FREE"
 * (Jeremy 10/22: "TEST THIS HARD!!!!"). The whole flow against an in-memory
 * store and a fake engine: the two ways in (the page's reading link, the
 * PDF's never-expiring key), once only per chart, the history kept, the
 * reading written again, the upgrade chain, and every way it can fail.
 * Made-up people only.
 */

const SECRET = randomBytes(32).toString("hex");
const NOW = Date.parse("2026-10-22T18:00:00Z");
const DAY = 86_400_000;

function memoryStore() {
  const m = new Map();
  return {
    m,
    async setJSON(k, v) { m.set(k, JSON.parse(JSON.stringify(v))); },
    async get(k) { return m.has(k) ? JSON.parse(JSON.stringify(m.get(k))) : null; },
    async delete(k) { m.delete(k); },
  };
}
const counters = () => {
  const m = new Map();
  return { m, keyFor: async (ip) => `t:${ip}`, load: async (k) => m.get(k) ?? [], save: async (k, v) => m.set(k, v) };
};
const claimStore = () => {
  const m = new Map();
  return { m, get: async (id) => m.get(id) ?? null, set: async (id, at) => m.set(id, at), del: async (id) => m.delete(id) };
};

/** A spread as the engine answers /v1/spread: the profile and the centers change; the noon chart holds 12:06 AM - 2:20 PM. */
const SPREAD = {
  v: 1, ok: true, minutes: 1440, noon: 720, window: [6, 860],
  changes: ["profile", "definedCenters", "undefinedCenters"],
  segments: { profile: [[0, "2/5"], [6, "3/5"], [861, "3/6"]], definedCenters: [[0, "G"], [861, "G, Spleen"]], undefinedCenters: [[0, "Head, Spleen"], [861, "Head"]] },
  clock: [[0, 0]], gates: "change",
};
const NOON = {
  type: "Generator", strategy: "Wait to respond", authority: "Emotional", profile: "3/5", definition: "Triple Split",
  signature: "Satisfaction", notSelfTheme: "Frustration", incarnationCross: "Right Angle Cross of Consciousness (5/35 | 64/63)",
  definedCenters: ["Throat", "G", "Sacral", "Spleen", "Solar Plexus", "Root"], undefinedCenters: ["Head", "Ajna"], openCenters: ["Heart"],
  channels: ["16-48 (The Wavelength)"], activatedGates: [2, 5, 16, 48], timeKnown: false, note: "Birth time unknown - charted at noon.",
  provisional: ["type", "authority", "profile"], bodygraphSvg: "<svg>noon</svg>", timeSpread: SPREAD,
};
/** The chart at 3:10 PM: the profile came out differently. */
const LATE = { ...NOON, profile: "3/6", timeKnown: true, note: undefined, provisional: undefined, timeSpread: undefined, bodygraphSvg: "<svg>late</svg>" };
for (const k of ["note", "provisional", "timeSpread"]) delete LATE[k];

const UNKNOWN = { date: "2001-12-05", time: null, timeKnown: false, place: "Spokane, Washington", zone: "America/Los_Angeles", name: "Ari Testwell" };

/** The engine: answers the time it is asked with LATE, counts calls, can be made to fail. */
function fakeEngine({ fail = null, payload = LATE } = {}) {
  const calls = [];
  const fn = async (req) => {
    calls.push(req);
    if (fail === "throw") throw Object.assign(new Error("down"), { name: "TypeError" });
    if (fail === "500") return { ok: false, status: 500, payload: { error: { code: "boom" } } };
    if (fail === "bad-time") return { ok: false, status: 400, payload: { error: { code: "bad_birth_time" } } };
    return { ok: true, status: 200, payload: JSON.parse(JSON.stringify(payload)) };
  };
  fn.calls = calls;
  return fn;
}

/** A filled chart cast at noon, at a tier, with its links. */
async function seeded(tier = 1, { birth = UNKNOWN, output = NOON, reading = null, extra = {} } = {}) {
  const store = memoryStore();
  const id = await saveReading(store, { tier, output: null, name: "Ari Testwell", email: "ari@example.com", now: NOW - 3 * DAY, purchasedAt: NOW - 3 * DAY, ...extra });
  await fillReading(store, id, output, NOW - 3 * DAY, birth);
  if (reading) await fillInterpretation(store, id, reading, NOW - 3 * DAY);
  return { store, id, token: mintReadingLink({ id, tier, now: NOW - DAY }, SECRET), key: mintAddTimeKey(id, SECRET) };
}

function run(s, body, over = {}) {
  const notes = [];
  const delivered = [];
  const engine = over.engine ?? fakeEngine();
  const p = handleAddTime({
    body: JSON.stringify(body),
    ip: over.ip ?? "203.0.113.7",
    now: over.now ?? NOW,
    readings: s.store,
    counters: over.counters ?? counters(),
    claims: over.claims ?? claimStore(),
    engine,
    secret: SECRET,
    deliver: async (d) => delivered.push(d),
    report: async (r) => notes.push(r),
    sleep: over.sleep ?? (async () => {}),
  });
  return p.then((res) => ({ res, body: JSON.parse(res.body), notes, delivered, engine }));
}

/* ---------------------------------------------------------- the PDF's key */

test("THE PDF'S KEY never expires, names one record, carries no birth data, and is not a reading link", () => {
  const id = "a".repeat(32);
  const key = mintAddTimeKey(id, SECRET);
  assert.deepEqual(readAddTimeKey(key, SECRET), { ok: true, id });
  const payload = JSON.parse(Buffer.from(key.split(".")[0], "base64url").toString("utf8"));
  assert.deepEqual(Object.keys(payload).sort(), ["a", "k"], "only the record and what the key is for");
  // Not interchangeable with a reading link, either way.
  assert.equal(readReadingLink(key, SECRET, NOW).ok, false);
  assert.equal(readAddTimeKey(mintReadingLink({ id, tier: 1, now: NOW }, SECRET), SECRET).ok, false);
  // Tampered, or signed with another secret: refused.
  assert.equal(readAddTimeKey(key.slice(0, -2) + "xx", SECRET).ok, false);
  assert.equal(readAddTimeKey(mintAddTimeKey(id, "another-secret-entirely-xyz"), SECRET).ok, false);
});

test("where a chart stands: open, used, known, pending, none", async () => {
  const s = await seeded(1);
  const r = await loadReading(s.store, s.id, NOW);
  assert.equal(addTimeState(r), "open");
  assert.equal(addTimeState({ ...r, timeAdded: { at: 1, via: "page" } }), "used");
  assert.equal(addTimeState({ ...r, birth: { ...r.birth, timeKnown: true, time: "08:00" }, output: { ...r.output, timeKnown: true } }), "known");
  assert.equal(addTimeState({ ...r, pending: true }), "pending");
  assert.equal(addTimeState({ ...r, birth: null }), "none");
  assert.equal(datePlaceLine(r.birth), "December 5, 2001 · Spokane, Washington");
});

test("LOOK: either way in says where the chart stands and which chart it is (date and place, never the time or zone)", async () => {
  const s = await seeded(1);
  for (const way of [{ token: s.token }, { key: s.key }]) {
    const { res, body, engine } = await run(s, { ...way, look: true });
    assert.equal(res.status, 200);
    assert.equal(body.state, "open");
    assert.equal(body.tier, 1);
    assert.equal(body.kept, "December 5, 2001 · Spokane, Washington");
    assert.doesNotMatch(res.body, /America|Los_Angeles|12:00|noon/);
    assert.equal(engine.calls.length, 0);
  }
});

/* ------------------------------------------------------------ the add */

test("ADDED FROM THE PAGE: cast once with the time known, at the tier bought; history, note, flag, the ready email", async () => {
  const s = await seeded(1);
  const { res, body, notes, delivered, engine } = await run(s, { token: s.token, time: "15:10" });
  assert.equal(res.status, 200);
  assert.deepEqual(body, { ok: true, tier: 1 }, "the page reloads its own link");
  assert.equal(engine.calls.length, 1);
  assert.deepEqual(engine.calls[0], { birth: { date: "2001-12-05", time: "15:10", zone: "America/Los_Angeles", timeKnown: true }, tier: 1 });

  const r = await loadReading(s.store, s.id, NOW);
  assert.deepEqual(
    { date: r.birth.date, time: r.birth.time, timeKnown: r.birth.timeKnown, place: r.birth.place, zone: r.birth.zone, name: r.birth.name },
    { date: "2001-12-05", time: "15:10", timeKnown: true, place: "Spokane, Washington", zone: "America/Los_Angeles", name: "Ari Testwell" },
  );
  assert.equal(r.output.timeKnown, true);
  assert.equal(r.output.timeSpread, undefined, "time known: no spread, so no PROVISIONAL, no bar, no offer");
  assert.deepEqual(r.timeAdded, { at: Math.floor(NOW / 1000), via: "page" });
  // The details and the chart it replaced, for support only.
  const h = r.history.at(-1);
  assert.equal(h.kind, "time-added");
  assert.deepEqual(h.changed, ["time"]);
  assert.equal(h.was.timeKnown, false);
  assert.equal(h.chart.profile, "3/5");
  assert.equal(h.chart.bodygraphSvg, undefined, "the old drawing is not kept twice");
  assert.equal(h.chart.timeSpread, undefined);
  // The calm note: a time found later, never a "correction" (10/22), in the page's tier's words.
  assert.equal(r.correction.type, "time-added");
  const n = correctionNote(r.correction, { tier: 1 });
  assert.equal(n.eyebrow, "Your birth time");
  assert.equal(n.lead, "Birth time added: 3:10 PM — your chart is now redone from it.");
  assert.equal(
    n.body,
    "Of your Type, Profile and Authority, one came out differently: your Profile is now 3/6 (it was 3/5). Your Type and Authority are the same. That follows from your birth time — nothing went wrong, and everything below is written for your chart as it is now.",
  );
  // The rest of the chart that moved is said too (10/22 verbatim read).
  assert.equal(
    correctionNote({ ...r.correction, also: ["definition", "incarnationCross", "centers", "channels"] }, { tier: 1 }).body,
    "Of your Type, Profile and Authority, one came out differently: your Profile is now 3/6 (it was 3/5). Your Type and Authority are the same. Your definition, incarnation cross, centers and channels changed too. That follows from your birth time — nothing went wrong, and everything below is written for your chart as it is now.",
  );
  assert.equal(
    correctionNote({ ...r.correction, chart: [], also: ["channels"] }, { tier: 1 }).body,
    "Your Type, Profile and Authority are the same. Your channels came out differently. That follows from your birth time — nothing went wrong, and everything below is written for your chart as it is now.",
  );
  assert.doesNotMatch(JSON.stringify(n), /correct/i);
  assert.equal(correctionNote(r.correction, { tier: 0 }).lead, "Birth time added: 3:10 PM — your summary is now redone from it.");
  assert.match(correctionNote(r.correction, { tier: 0 }).body, /written for your summary as it is now/);
  assert.equal(correctionNote(r.correction, { tier: 2 }).lead, "Birth time added: 3:10 PM — your chart and your reading are now redone from it.");
  // Nothing moved: the note says only that, and what stayed.
  assert.equal(correctionNote({ ...r.correction, chart: [] }, { tier: 1 }).body, "Your Type, Profile and Authority are the same.");
  // Jeremy hears of it; the buyer gets the ready email (the writer is rung on the reading tier).
  assert.deepEqual(notes.map((x) => x.kind), ["time-added"]);
  assert.deepEqual(notes[0].ref, { reading: s.id, tier: 1 });
  assert.doesNotMatch(JSON.stringify(notes), /2001|15:10|Spokane|Los_Angeles/, "no birth data in what Jeremy is told");
  assert.equal(describeKind("time-added").severity, "needs-follow-up");
  assert.deepEqual(delivered, [{ id: s.id, tier: 1 }]);
});

test("ONCE ONLY: a second add is refused kindly and casts nothing; both ways in say it is used", async () => {
  const s = await seeded(1);
  await run(s, { token: s.token, time: "15:10" });
  for (const way of [{ token: s.token }, { key: s.key }]) {
    const again = await run(s, { ...way, time: "09:00" });
    assert.equal(again.res.status, 409);
    assert.equal(again.body.state, "used");
    assert.equal(again.body.error.key, "addtime-used");
    assert.match(again.body.error.message, /hd-readings@thechampagnemethod\.co reaches Jeremy/);
    assert.equal(again.engine.calls.length, 0);
    assert.equal((await run(s, { ...way, look: true })).body.state, "used");
  }
  const r = await loadReading(s.store, s.id, NOW);
  assert.equal(r.birth.time, "15:10", "the first time stands");
  // The page is told, so #add-time shows the kind words and the offer is gone.
  const page = JSON.parse((await handleReading({ body: JSON.stringify({ token: s.token }), store: s.store, secret: SECRET, now: NOW })).body);
  assert.equal(page.addTime, "used");
  assert.equal(page.output.timeSpread, undefined);
});

test("DOUBLE SUBMIT = ONE RECAST: the second request waits for the first and answers as it did", async () => {
  const s = await seeded(1);
  const claims = claimStore();
  let release;
  const gate = new Promise((r) => (release = r));
  const slow = fakeEngine();
  const engine = async (req) => {
    await gate;
    return slow(req);
  };
  engine.calls = slow.calls;
  const first = run(s, { token: s.token, time: "15:10" }, { claims, engine });
  // The second arrives while the first is casting (it has claimed the chart); it is let go once the first has finished.
  for (let i = 0; i < 500 && claims.m.size === 0; i++) await new Promise((r) => setTimeout(r, 2));
  assert.equal(claims.m.size, 1, "the first has claimed the chart");
  let polls = 0;
  const second = run(s, { token: s.token, time: "15:10" }, {
    claims,
    engine,
    sleep: async () => {
      polls++;
      if (polls === 1) release();
      await new Promise((r) => setTimeout(r, 10));
    },
  });
  const [a, b] = await Promise.all([first, second]);
  assert.equal(a.res.status, 200);
  assert.equal(b.res.status, 200);
  assert.deepEqual(b.body, a.body);
  assert.equal(slow.calls.length, 1, "the engine was asked once");
  assert.equal((await loadReading(s.store, s.id, NOW)).history.filter((h) => h.kind === "time-added").length, 1);
});

test("TWO AT THE VERY SAME MOMENT (both past the claim): the record's own flag keeps it to one write and one answer", async () => {
  const s = await seeded(1);
  const delivered = [];
  const both = await Promise.all([run(s, { token: s.token, time: "15:10" }), run(s, { token: s.token, time: "15:10" })]);
  for (const x of both) {
    assert.equal(x.res.status, 200);
    delivered.push(...x.delivered);
  }
  const r = await loadReading(s.store, s.id, NOW);
  assert.equal(r.history.filter((h) => h.kind === "time-added").length, 1);
  assert.equal(r.history.at(-1).chart.profile, "3/5", "the history holds the noon chart, not the first add's");
  assert.equal(r.birth.time, "15:10");
  // The store has no conditional write, so two requests in the same instant may
  // each ring the delivery (the reading's own write-once guard still files one
  // reading). Never more than the two.
  assert.ok(delivered.length >= 1 && delivered.length <= 2);
});

test("A CLAIM THAT NEVER FINISHES: the second waits, then says so calmly; a claim from a request that died is taken over", async () => {
  const s = await seeded(1);
  const claims = claimStore();
  claims.m.set(s.id, NOW - 1000);
  const busy = await run(s, { token: s.token, time: "15:10" }, { claims });
  assert.equal(busy.res.status, 503);
  assert.equal(busy.body.error.key, "our-side-generic");
  assert.equal(busy.engine.calls.length, 0);
  claims.m.set(s.id, NOW - 61_000);
  const ok = await run(s, { token: s.token, time: "15:10" }, { claims });
  assert.equal(ok.res.status, 200);
  assert.equal(claims.m.size, 0);
});

test("FROM THE PDF, LONG AFTER: the key works when the reading link has expired, and hands back a fresh one", async () => {
  const s = await seeded(1);
  const later = NOW + 200 * DAY;
  assert.equal(readReadingLink(s.token, SECRET, later).reason, "expired");
  const viaPage = await run(s, { token: s.token, time: "15:10" }, { now: later });
  assert.equal(viaPage.res.status, 410, "the six-day link has run out");
  const { res, body } = await run(s, { key: s.key, time: "15:10" }, { now: later });
  assert.equal(res.status, 200);
  const fresh = readReadingLink(body.token, SECRET, later);
  assert.deepEqual([fresh.ok, fresh.id, fresh.tier], [true, s.id, 1]);
  assert.equal((await loadReading(s.store, s.id, later)).timeAdded.via, "pdf");
});

test("PAST THE YEAR: the key says the chart is no longer kept; a forged or cut key could not be opened", async () => {
  const s = await seeded(1);
  const gone = NOW + (READING_TTL_SECONDS + 5 * 86400) * 1000;
  const late = await run(s, { key: s.key, look: true }, { now: gone });
  assert.equal(late.res.status, 410);
  assert.equal(late.body.error.key, "addtime-gone");
  assert.equal(late.body.error.heading, "This chart is no longer kept");
  for (const key of [s.key.slice(0, -6), "not.a-key", mintAddTimeKey(s.id, "someone-elses-secret-0123456789")]) {
    const bad = await run(s, { key, look: true });
    assert.equal(bad.res.status, 404);
    // Said as the PDF's link it is: open it again from the PDF, not "from the email it came in" (10/22).
    assert.equal(bad.body.error.key, "addtime-key-bad");
    assert.match(bad.body.error.message, /opening it again from your PDF usually works\.$/);
    assert.doesNotMatch(bad.body.error.message, /email/);
  }
  // A reading link handed in as a key, and a key handed in as a reading link: neither works.
  assert.equal((await run(s, { key: s.token, look: true })).res.status, 404);
  assert.equal((await run(s, { token: s.key, look: true })).res.status, 404);
});

test("THE READING TIER: the words are cleared to be written again (the ordinary pending path), the writer rung", async () => {
  const s = await seeded(2, { reading: TEXT });
  const { res, delivered } = await run(s, { key: s.key, time: "15:10" });
  assert.equal(res.status, 200);
  const r = await loadReading(s.store, s.id, NOW);
  assert.equal(r.reading, null, "the reading is written again for the new chart");
  assert.equal(r.history.at(-1).reading, TEXT, "the words it had are kept for support");
  assert.deepEqual(delivered, [{ id: s.id, tier: 2 }]);
  const page = JSON.parse((await handleReading({ body: JSON.stringify({ token: s.token }), store: s.store, secret: SECRET, now: NOW })).body);
  assert.equal(page.writing, true, "the page shows the new chart and 'being written'");
  // And the writer may file them (the write-once guard sees an empty reading).
  assert.equal((await fillInterpretation(s.store, s.id, TEXT, NOW)).ok, true);
});

test("THE SUMMARY: cast at the chart tier and cut back to the summary's share (no drawing)", async () => {
  const s = await seeded(0, { output: (({ bodygraphSvg, ...o }) => o)(NOON) });
  const { res, engine } = await run(s, { token: s.token, time: "15:10" });
  assert.equal(res.status, 200);
  assert.equal(engine.calls[0].tier, 1);
  const r = await loadReading(s.store, s.id, NOW);
  assert.equal(r.output.bodygraphSvg, undefined);
  assert.deepEqual(r.output.channels, LATE.channels, "the summary keeps its channels and gates");
});

test("THE ENGINE DOWN: nothing changes, a calm answer, Jeremy paged, and the time can be added once it is back", async () => {
  const s = await seeded(1);
  const before = JSON.stringify(s.store.m.get(s.id));
  const claims = claimStore();
  for (const fail of ["throw", "500"]) {
    const { res, body, notes } = await run(s, { token: s.token, time: "15:10" }, { engine: fakeEngine({ fail }), claims });
    assert.equal(res.status, 503);
    assert.equal(body.error.key, "addtime-slow");
    assert.match(body.error.message, /nothing has changed/);
    assert.equal(JSON.stringify(s.store.m.get(s.id)), before, "the record is untouched");
    assert.equal(notes.length, 1);
    // Jeremy is paged with the add-time brief, the engine's own kind in the detail.
    assert.equal(notes[0].kind, "addtime-engine");
    assert.match(notes[0].detail, /^engine-/);
    assert.equal(describeKind(notes[0].kind, { paid: true }).severity, "page-jeremy");
    assert.equal(claims.m.size, 0, "the claim is let go");
  }
  const ok = await run(s, { token: s.token, time: "15:10" }, { claims });
  assert.equal(ok.res.status, 200);
});

test("A TIME THAT IS NOT A TIME: refused before the engine; one the engine refuses is the buyer's to check", async () => {
  const s = await seeded(1);
  for (const time of ["", "25:00", "7pm", "12:60", "1215"]) {
    const { res, body, engine } = await run(s, { token: s.token, time });
    assert.equal(res.status, 400, time);
    assert.equal(body.error.key, "addtime-check-time");
    assert.equal(engine.calls.length, 0);
  }
  const { res, body } = await run(s, { token: s.token, time: "08:30" }, { engine: fakeEngine({ fail: "bad-time" }) });
  assert.equal(res.status, 400);
  assert.equal(body.error.key, "addtime-check-time");
  assert.equal((await loadReading(s.store, s.id, NOW)).timeAdded, null);
});

test("A CHART WITH A KNOWN TIME never takes the form; a chart not cast yet points to its own form", async () => {
  const known = await seeded(1, { birth: { ...UNKNOWN, time: "08:00", timeKnown: true }, output: { ...LATE } });
  assert.equal((await run(known, { token: known.token, look: true })).body.state, "known");
  const tried = await run(known, { token: known.token, time: "09:00" });
  assert.equal(tried.res.status, 409);
  assert.equal(tried.body.error.key, "addtime-known");
  assert.equal(tried.engine.calls.length, 0);

  const store = memoryStore();
  const id = await saveReading(store, { tier: 1, output: null, name: "Ari", email: "a@example.com", now: NOW });
  const pend = await run({ store }, { token: mintReadingLink({ id, tier: 1, now: NOW }, SECRET), time: "09:00" });
  assert.equal(pend.res.status, 409);
  assert.equal(pend.body.state, "pending");
});

test("THE VISITOR LIMIT holds here too", async () => {
  const s = await seeded(1);
  const c = counters();
  c.m.set("t:203.0.113.7", Array.from({ length: 20 }, (_, i) => NOW - i * 1000));
  const { res, engine } = await run(s, { token: s.token, time: "15:10" }, { counters: c });
  assert.equal(res.status, 429);
  assert.equal(engine.calls.length, 0);
});

/* ------------------------------------------------------- the chain */

test("AN OLD LINK AFTER AN UPGRADE adds the time to the grown chart, and the offer is spent for the whole chain", async () => {
  const s = await seeded(0, { output: (({ bodygraphSvg, ...o }) => o)(NOON) });
  // The summary grew into a chart, cast from the same kept (unknown-time) details.
  const chart = await saveReading(s.store, { tier: 1, output: null, name: "Ari Testwell", email: "ari@example.com", grewFrom: s.id, person: s.id, birth: UNKNOWN, now: NOW - DAY });
  await fillReading(s.store, chart, NOON, NOW - DAY);
  await updateRecord(s.store, s.id, { grewTo: chart, person: s.id }, NOW - DAY);
  const { res } = await run(s, { token: s.token, time: "15:10" });
  assert.equal(res.status, 200);
  assert.equal((await loadReading(s.store, chart, NOW)).timeAdded.via, "page", "the grown chart took the time");
  assert.equal((await loadReading(s.store, s.id, NOW)).timeAdded, null, "the old summary was not recast");
  assert.equal((await run(s, { token: s.token, look: true })).body.state, "used");
});

test("AN UPGRADE AFTER USE inherits 'used'; an upgrade before use keeps the offer for the new record", async () => {
  const session = (level, upgrades) => ({
    payment_status: "paid",
    created: Math.floor(NOW / 1000),
    amount_total: 0,
    customer_details: { name: "Ari Testwell", email: "ari@example.com" },
    metadata: { level: String(level), sku: TIERS[level].sku, upgrades },
  });
  // After use: the chart carries the time and the spent offer.
  const used = await seeded(0, { output: (({ bodygraphSvg, ...o }) => o)(NOON) });
  await run(used, { token: used.token, time: "15:10" });
  const up = "b".repeat(32);
  await recordPurchase({ readings: used.store, id: up, level: 1, session: session(1, used.id), secret: SECRET, now: NOW + 1000 });
  const upRec = await loadReading(used.store, up, NOW + 2000);
  assert.equal(upRec.birth.time, "15:10", "the time comes along: nothing to retype");
  assert.ok(upRec.timeAdded, "and the offer stays spent");
  await fillReading(used.store, up, LATE, NOW + 3000);
  assert.equal(addTimeState(await loadReading(used.store, up, NOW + 4000)), "used");

  // Before use: the new record, cast at noon, has its own offer.
  const fresh = await seeded(0, { output: (({ bodygraphSvg, ...o }) => o)(NOON) });
  const up2 = "c".repeat(32);
  await recordPurchase({ readings: fresh.store, id: up2, level: 1, session: session(1, fresh.id), secret: SECRET, now: NOW + 1000 });
  await fillReading(fresh.store, up2, NOON, NOW + 3000);
  assert.equal(addTimeState(await loadReading(fresh.store, up2, NOW + 4000)), "open");
});

test("A PAID UPGRADE NOT CAST YET carries the added time (and the spent offer) when the chart it grew from takes one", async () => {
  const s = await seeded(1);
  const up = await saveReading(s.store, { tier: 2, output: null, name: "Ari Testwell", email: "ari@example.com", grewFrom: s.id, person: s.id, birth: UNKNOWN, now: NOW - DAY });
  await updateRecord(s.store, s.id, { grewTo: up, person: s.id }, NOW - DAY);
  // loadCurrent stops at a pending upgrade: the chart itself takes the time.
  assert.equal((await loadCurrent(s.store, s.id, NOW)).id, s.id);
  await run(s, { token: s.token, time: "15:10" });
  const pending = await loadReading(s.store, up, NOW);
  assert.equal(pending.pending, true);
  assert.equal(pending.birth.time, "15:10");
  assert.equal(pending.birth.name, "Ari Testwell");
  assert.ok(pending.timeAdded);
});

/* ------------------------------------------------------ the PDF and the page */

test("THE PDF's 'add it here' is the never-expiring key for the chart it shows; after use there is no offer at all", async () => {
  const s = await seeded(1);
  let seen = null;
  const build = async (args) => {
    seen = args;
    return Buffer.from("%PDF");
  };
  await handlePdf({ token: s.token, secret: SECRET, store: s.store, build, now: NOW });
  assert.match(seen.addTimeUrl, /^https:\/\/humandesign\.thechampagnemethod\.co\/t\/[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
  assert.equal(readAddTimeKey(seen.addTimeUrl.split("/t/")[1], SECRET).id, s.id);

  const before = await readingPdf({ tier: 1, name: "Ari", output: NOON, birth: UNKNOWN, addTimeUrl: seen.addTimeUrl, inspect: true });
  // Justified lines are drawn word by word; read them back as plain words.
  const text = (r) => r.runs.map((x) => x.text).join(" ").replace(/\s+/g, " ");
  assert.match(text(before), /Found your birth time\?/);
  assert.ok(before.links.some((l) => l.uri === seen.addTimeUrl));
  await run(s, { token: s.token, time: "15:10" });
  const r = await loadReading(s.store, s.id, NOW);
  const after = await readingPdf({ tier: 1, name: "Ari", output: r.output, birth: r.birth, addTimeUrl: seen.addTimeUrl, inspect: true });
  assert.doesNotMatch(text(after), /Found your birth time|PROVISIONAL|cast at noon/);
  assert.ok(!after.links.some((l) => /\/t\//.test(l.uri)));
  assert.match(text(after), /3:10 PM/, "the birth line has its time");
});

test("NOTHING ABOUT THE BIRTH IS LOGGED on the way through", async () => {
  const s = await seeded(1);
  const logged = [];
  const log = console.log;
  console.log = (...a) => logged.push(a.join(" "));
  try {
    await run(s, { token: s.token, time: "15:10" });
    await run(s, { key: s.key, time: "15:10" }, { engine: fakeEngine({ fail: "throw" }) });
  } finally {
    console.log = log;
  }
  assert.doesNotMatch(logged.join("\n"), /2001|15:10|Spokane|Los_Angeles/);
});

/* ------------------------------------------- Q4: tags wherever a value prints */

test("UNKNOWN TIME, IN THE READING PDF: Start here's lists and the margin notes carry the tag beside the label of what changes", async () => {
  const out = { ...NOON, channelLines: ["16-48 (The Wavelength), Throat to Spleen"], personality: [], design: [] };
  const r = await readingPdf({ tier: 2, name: "Ari", output: out, reading: TEXT, birth: UNKNOWN, inspect: true });
  const tagsAfter = (page, label) => {
    const at = r.runs.find((x) => x.page === page && x.text.startsWith(label));
    return at ? r.runs.some((x) => x.page === page && x.text === "PROVISIONAL" && Math.abs(x.y - at.y) < 12 && x.x >= at.x) : null;
  };
  const startPage = r.runs.find((x) => x.text === "COLORED IN (6) · STEADY, YOURS")?.page;
  assert.ok(startPage, "Start here's first sub-label is drawn");
  assert.equal(tagsAfter(startPage, "COLORED IN"), true, "definedCenters changes");
  assert.equal(tagsAfter(startPage, "NOT COLORED IN"), true, "undefinedCenters changes");
  // The margin: PROFILE changes (tagged under its label), DEFINITION does not (no tag).
  const prof = r.runs.find((x) => x.text === "PROFILE 3/5" && x.page > startPage);
  assert.ok(prof);
  assert.ok(r.runs.some((x) => x.page === prof.page && x.text === "PROVISIONAL" && Math.abs(x.x - prof.x) < 0.5 && x.y > prof.y && x.y - prof.y < 16));
  const def = r.runs.find((x) => x.text === "DEFINITION" && x.page > startPage);
  assert.ok(def);
  assert.ok(!r.runs.some((x) => x.page === def.page && x.text === "PROVISIONAL" && Math.abs(x.x - def.x) < 0.5 && x.y > def.y && x.y - def.y < 16));
  // A known time: no tag anywhere.
  const k = await readingPdf({ tier: 2, name: "Ari", output: LATE, reading: TEXT, birth: { ...UNKNOWN, time: "15:10", timeKnown: true }, inspect: true });
  assert.ok(!k.runs.some((x) => x.text === "PROVISIONAL"));
});

/* ------------------------------------------ the words, per tier (10/22 review) */

test("THE SUMMARY IS SAID AS A SUMMARY: used, known, the slow answer; the form's kept label and privacy line", async () => {
  const s = await seeded(0, { output: (({ bodygraphSvg, ...o }) => o)(NOON) });
  const down = await run(s, { token: s.token, time: "15:10" }, { engine: fakeEngine({ fail: "throw" }) });
  assert.equal(down.body.error.key, "addtime-slow-summary");
  assert.match(down.body.error.message, /so your summary wasn’t redone/);
  await run(s, { token: s.token, time: "15:10" });
  const again = await run(s, { token: s.token, time: "15:10" });
  assert.equal(again.body.error.key, "addtime-used-summary");
  assert.match(again.body.error.message, /^A birth time can be added once to each summary, and this summary has its time\./);
  const known = await seeded(0, { birth: { ...UNKNOWN, time: "08:00", timeKnown: true }, output: (({ bodygraphSvg, ...o }) => ({ ...o, timeKnown: true }))(LATE) });
  const k = await run(known, { token: known.token, time: "09:00" });
  assert.equal(k.body.error.key, "addtime-known-summary");
  assert.equal(k.body.error.heading, "Your summary already has its birth time");
  // A chart keeps the chart's words.
  const c = await seeded(1);
  await run(c, { token: c.token, time: "15:10" });
  assert.equal((await run(c, { token: c.token, time: "15:10" })).body.error.key, "addtime-used");
  // The form.
  assert.equal(ADD_TIME.kept(0), "Kept from your summary");
  assert.equal(ADD_TIME.kept(1), "Kept from your chart");
  assert.doesNotMatch(ADD_TIME.privacy(0), /PDF|chart/);
  assert.match(ADD_TIME.privacy(1), /with this chart/);
  assert.equal(ADD_TIME.notNow, "Not now");
});

test("THE SECOND READY EMAIL SAYS IT WAS REDONE: subject and opening line per tier, the rest as it is", () => {
  const base = { name: "Ari Testwell", chartName: "Ari Testwell", url: "https://example.test/r/x.y", links: SITE, pending: false };
  const want = {
    0: "Your summary is ready, redone with your birth time.",
    1: "Your chart is ready, redone with your birth time.",
    2: "Your chart and reading are ready, redone with your birth time.",
  };
  for (const tier of [0, 1, 2]) {
    const first = deliveryEmail({ ...base, tier });
    const again = deliveryEmail({ ...base, tier, redone: true });
    assert.match(again.subject, /^Ari Testwell’s Human Design (summary|chart|reading) is ready, redone with your birth time$/);
    assert.ok(again.text.includes(want[tier]), `tier ${tier}: ${again.text.slice(0, 200)}`);
    assert.ok(again.html.includes(want[tier]));
    // Only the subject and the opening line change.
    const strip = (t) => t.split("\n").filter((l) => !/(is|are) ready/.test(l)).join("\n");
    assert.equal(strip(again.text), strip(first.text));
  }
  // Someone else's chart: theirs.
  const theirs = deliveryEmail({ ...base, chartName: "Quinn", tier: 2, someoneNew: true, redone: true });
  assert.equal(theirs.subject, "Quinn’s Human Design reading is ready, redone with their birth time");
  assert.ok(theirs.text.includes("Quinn’s chart and reading are ready, redone with their birth time."));
});

test("REDONE IS THIS RECORD'S OWN ADD: the writer says so for the rewrite, not for an upgrade bought after it", async () => {
  const s = await seeded(1);
  assert.equal(redoneWithTime(await loadReading(s.store, s.id, NOW)), false);
  await run(s, { token: s.token, time: "15:10" });
  const r = await loadReading(s.store, s.id, NOW);
  assert.equal(redoneWithTime(r), true);
  const up = "d".repeat(32);
  await recordPurchase({
    readings: s.store,
    id: up,
    level: 2,
    session: { payment_status: "paid", created: Math.floor((NOW + 60_000) / 1000), amount_total: 0, customer_details: { name: "Ari Testwell", email: "ari@example.com" }, metadata: { level: "2", sku: TIERS[2].sku, upgrades: s.id } },
    secret: SECRET,
    now: NOW + 60_000,
  });
  const upRec = await loadReading(s.store, up, NOW + 61_000);
  assert.ok(upRec.history.some((h) => h.kind === "time-added"), "the history comes along");
  assert.equal(redoneWithTime(upRec), false, "its first ready email is an ordinary one");
});
