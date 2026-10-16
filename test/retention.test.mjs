import { test } from "node:test";
import assert from "node:assert/strict";
import { COUNTER_KEEP_MS, describe, sweepRetention } from "../netlify/lib/retention.mjs";
import { INCIDENT_TTL_SECONDS } from "../netlify/lib/health.mjs";
import { READING_TTL_SECONDS, loadReading, pastItsYear, readingBoughtAt } from "../netlify/lib/reading.mjs";

/**
 * "After a year your reading is gone." The daily sweep that makes it true.
 * Every store here is an in-memory fake with a real paginated `list`, so the
 * paging the production store does is exercised rather than assumed.
 */

const NOW = Date.parse("2026-10-16T09:17:00Z");
const DAY_S = 24 * 60 * 60;
const nowS = Math.floor(NOW / 1000);

function fakeStore(entries = {}, { pageSize = 3, failGet = [], failDelete = [], failList = false } = {}) {
  const data = new Map(Object.entries(entries));
  const calls = { deletes: [], pages: 0, gets: 0 };
  return {
    data,
    calls,
    async get(key, opts) {
      calls.gets += 1;
      if (failGet.includes(key)) throw new Error("blobs are down");
      if (!data.has(key)) return null;
      const v = data.get(key);
      return opts?.type === "json" ? structuredClone(v) : JSON.stringify(v);
    },
    async setJSON(key, value) {
      data.set(key, value);
    },
    async delete(key) {
      if (failDelete.includes(key)) throw new Error("blobs are down");
      calls.deletes.push(key);
      data.delete(key);
    },
    list(opts = {}) {
      if (failList) {
        if (opts.paginate) return (async function* () { throw new Error("blobs are down"); })();
        return Promise.reject(new Error("blobs are down"));
      }
      const keys = [...data.keys()].filter((k) => !opts.prefix || k.startsWith(opts.prefix)).sort();
      if (!opts.paginate) return Promise.resolve({ blobs: keys.map((key) => ({ key })), directories: [] });
      return (async function* () {
        for (let i = 0; i < keys.length; i += pageSize) {
          calls.pages += 1;
          yield { blobs: keys.slice(i, i + pageSize).map((key) => ({ key })), directories: [] };
        }
      })();
    },
  };
}

/** A 32-hex id that reads as its label, so a failing test says which one. */
function id(n) {
  return String(n).padStart(32, "0");
}

/** A full paid record as saveReading/fillReading write it, bought `ageDays` ago. */
function reading(ageSeconds, extra = {}) {
  return {
    v: 1,
    tier: 2,
    output: { type: "Projector" },
    buyer: { name: "Asdf Asdf", email: "buyer@example.com", phone: "+15550100" },
    sku: "reading",
    purchasedAt: nowS - ageSeconds,
    createdAt: nowS - ageSeconds,
    birth: { date: "1990-01-02", time: "03:04", timeKnown: true, place: "Austin, Texas", zone: "America/Chicago" },
    ...extra,
  };
}

test("a reading past its year is deleted; a younger one, and one at exactly a year, are kept", async () => {
  const readings = fakeStore({
    [id(1)]: reading(365 * DAY_S + 1), // a second past the year
    [id(2)]: reading(400 * DAY_S),
    [id(3)]: reading(364 * DAY_S),
    [id(4)]: reading(365 * DAY_S), // exactly a year: loadReading still serves it today
    [id(5)]: reading(0),
  });
  const r = await sweepRetention({ stores: { readings }, now: NOW });
  assert.deepEqual(readings.calls.deletes.sort(), [id(1), id(2)]);
  assert.deepEqual([...readings.data.keys()].sort(), [id(3), id(4), id(5)]);
  assert.equal(r.stores.readings.deleted, 2);
  assert.equal(r.stores.readings.expired, 2);
  assert.equal(r.stores.readings.kept, 3);
  assert.equal(r.stores.readings.scanned, 5);
});

test("THE SWEEP AND THE SERVER AGREE: deleted exactly when loadReading stops serving", async () => {
  const ages = [0, 1, 100 * DAY_S, 364 * DAY_S, 365 * DAY_S - 1, 365 * DAY_S, 365 * DAY_S + 1, 366 * DAY_S, 3 * 365 * DAY_S];
  const entries = Object.fromEntries(ages.map((a, i) => [id(i + 1), reading(a)]));
  const before = fakeStore(entries);
  const served = new Set();
  for (const key of before.data.keys()) if (await loadReading(before, key, NOW)) served.add(key);

  const readings = fakeStore(entries);
  await sweepRetention({ stores: { readings }, now: NOW });
  assert.deepEqual(new Set(readings.data.keys()), served, "a reading was deleted while still served, or kept after");
});

test("the year is measured from purchasedAt, falling back to createdAt, as loadReading does", async () => {
  const old = reading(400 * DAY_S);
  delete old.purchasedAt;
  const young = reading(10 * DAY_S, { purchasedAt: nowS - 10 * DAY_S, createdAt: nowS - 900 * DAY_S });
  const readings = fakeStore({ [id(1)]: old, [id(2)]: young });
  await sweepRetention({ stores: { readings }, now: NOW });
  assert.deepEqual([...readings.data.keys()], [id(2)], "purchasedAt wins over an older createdAt");
  assert.equal(readingBoughtAt(young), young.purchasedAt);
  assert.equal(pastItsYear(nowS - READING_TTL_SECONDS - 1, NOW), true);
  assert.equal(pastItsYear(nowS - READING_TTL_SECONDS, NOW), false);
});

test("FAIL SAFE: a record whose age cannot be read is kept and counted", async () => {
  const noDates = reading(500 * DAY_S);
  delete noDates.purchasedAt;
  delete noDates.createdAt;
  const readings = fakeStore({
    [id(1)]: noDates,
    [id(2)]: reading(500 * DAY_S, { purchasedAt: "last year", createdAt: undefined }),
    [id(3)]: reading(500 * DAY_S, { purchasedAt: 0, createdAt: 0 }),
    [id(4)]: "not even an object",
    "not-a-reading-id": reading(900 * DAY_S),
    [id(5)]: reading(500 * DAY_S),
  });
  const r = await sweepRetention({ stores: { readings }, now: NOW });
  assert.deepEqual(readings.calls.deletes, [id(5)]);
  assert.equal(r.stores.readings.undatable, 4);
  assert.equal(r.stores.readings.unrecognised, 1, "a key that is not a reading id is never touched");
  assert.ok(readings.data.has("not-a-reading-id"));
});

test("pages through a large store: every page is read, every expired record goes", async () => {
  const entries = {};
  for (let i = 1; i <= 50; i++) entries[id(i)] = reading(i % 2 ? 400 * DAY_S : 30 * DAY_S);
  const readings = fakeStore(entries, { pageSize: 7 });
  const r = await sweepRetention({ stores: { readings }, now: NOW });
  assert.equal(readings.calls.pages, 8, "fifty keys at seven a page is eight pages");
  assert.equal(r.stores.readings.scanned, 50);
  assert.equal(r.stores.readings.deleted, 25);
  assert.equal(readings.data.size, 25);
  for (const v of readings.data.values()) assert.equal(v.purchasedAt, nowS - 30 * DAY_S);
});

test("DRY RUN deletes nothing anywhere and counts exactly what a real run would", async () => {
  const build = () => ({
    readings: fakeStore({ [id(1)]: reading(400 * DAY_S), [id(2)]: reading(3 * DAY_S) }),
    health: fakeStore({
      [`incident/${NOW - 20 * DAY_S * 1000}-1`]: { kind: "x", at: NOW - 20 * DAY_S * 1000 },
      [`ring/${id(1)}`]: { at: NOW - 400 * DAY_S * 1000 },
    }),
    counters: {
      "chart-rate": fakeStore({ abc: [NOW - 30 * DAY_S * 1000] }),
      "resend-rate": fakeStore({ [`r:${id(1)}`]: [NOW - 300 * DAY_S * 1000] }),
    },
  });
  const dry = build();
  const sizes = () => [dry.readings, dry.health, dry.counters["chart-rate"], dry.counters["resend-rate"]].map((s) => s.data.size);
  const before = sizes();
  const r = await sweepRetention({ stores: dry, now: NOW, dryRun: true });
  assert.deepEqual(sizes(), before, "a dry run removed something");
  for (const s of [dry.readings, dry.health, dry.counters["chart-rate"], dry.counters["resend-rate"]]) {
    assert.equal(s.calls.deletes.length, 0);
  }
  assert.equal(r.dryRun, true);
  for (const t of Object.values(r.stores)) assert.equal(t.deleted, 0);

  const live = build();
  const real = await sweepRetention({ stores: live, now: NOW });
  for (const name of Object.keys(real.stores)) {
    assert.equal(r.stores[name].expired, real.stores[name].deleted, `${name}: dry-run count differs from the real run`);
  }
  assert.match(describe(r), /\[dry run\]/);
  assert.match(describe(r), /readings: 2 scanned, 1 would delete, 1 kept/);
});

test("idempotent: a second run finds nothing to do", async () => {
  const stores = {
    readings: fakeStore({ [id(1)]: reading(400 * DAY_S), [id(2)]: reading(3 * DAY_S) }),
    health: fakeStore({ [`incident/${NOW - 20 * DAY_S * 1000}-1`]: { kind: "x", at: 1 } }),
  };
  await sweepRetention({ stores, now: NOW });
  const again = await sweepRetention({ stores, now: NOW });
  assert.equal(again.stores.readings.expired, 0);
  assert.equal(again.stores.health.expired, 0);
  assert.equal(again.stores.readings.kept, 1);
});

test("a deleted reading takes its ring gate and its re-send counter with it", async () => {
  const health = fakeStore({
    [`ring/${id(1)}`]: { at: NOW - 60_000 }, // its own day is not up, but its reading is gone
    [`ring/${id(2)}`]: { at: NOW - 60_000 },
  });
  const resend = fakeStore({ [`r:${id(1)}`]: [NOW - 60_000], [`r:${id(2)}`]: [NOW - 60_000], "v:visitor": [NOW - 60_000] });
  const readings = fakeStore({ [id(1)]: reading(400 * DAY_S), [id(2)]: reading(3 * DAY_S) });
  const r = await sweepRetention({ stores: { readings, health, counters: { "resend-rate": resend } }, now: NOW });
  assert.deepEqual([...health.data.keys()], [`ring/${id(2)}`]);
  assert.deepEqual([...resend.data.keys()].sort(), [`r:${id(2)}`, "v:visitor"]);
  // Counted once, in the store they lived in -- and a reading with no
  // companions does not invent deletions in other stores.
  assert.equal(r.stores.health.deleted, 1);
  assert.equal(r.stores.health.scanned, 2);
  assert.equal(r.stores["resend-rate"].deleted, 1);
  assert.equal(r.stores["resend-rate"].kept, 2);
  const lone = await sweepRetention({
    stores: { readings: fakeStore({ [id(3)]: reading(400 * DAY_S) }), health: fakeStore({}) },
    now: NOW,
  });
  assert.equal(lone.stores.health.deleted, 0);
});

test("the scheduled function runs daily and imports cleanly", async () => {
  const fn = await import("../netlify/functions/retention.mjs");
  assert.equal(typeof fn.default, "function");
  assert.match(fn.config.schedule, /^\d+ \d+ \* \* \*$/, "not a once-a-day cron");
});

test("health: incidents go after fourteen days, gates after their own lives; unknown keys stay", async () => {
  const at = (ms) => NOW - ms;
  const old = at(INCIDENT_TTL_SECONDS * 1000 + 1);
  const young = at(INCIDENT_TTL_SECONDS * 1000 - 60_000);
  const health = fakeStore({
    [`incident/${old}-11`]: { kind: "interpretation-malformed", excerpt: "Your Projector chart...", at: old },
    [`incident/${young}-12`]: { kind: "claim-email", at: young },
    "incident/garbled": { kind: "x" }, // no time in the key, none in the record
    "incident/also-garbled": { kind: "x", at: old }, // no time in the key, but the record has one
    "alerted/claim-email": { at: at(2 * 60 * 60 * 1000) },
    "alerted/ready-email": { at: at(10 * 60 * 1000) },
    [`ring/${id(9)}`]: { at: at(2 * DAY_S * 1000) },
    "something-else": { at: 1 },
  });
  const r = await sweepRetention({ stores: { health }, now: NOW });
  assert.deepEqual(
    [...health.data.keys()].sort(),
    ["alerted/ready-email", "incident/garbled", `incident/${young}-12`, "something-else"].sort(),
  );
  assert.equal(r.stores.health.deleted, 4);
  assert.equal(r.stores.health.undatable, 1);
  assert.equal(r.stores.health.unrecognised, 1);
});

test("counters: a visitor hash goes a week after its newest hit; anything unreadable stays", async () => {
  const store = fakeStore({
    gone: [NOW - 30 * DAY_S * 1000, NOW - (COUNTER_KEEP_MS + 1)],
    recent: [NOW - 30 * DAY_S * 1000, NOW - 2 * DAY_S * 1000],
    edge: [NOW - COUNTER_KEEP_MS],
    weird: { hits: 3 },
    empty: [],
    mixed: [NOW - 30 * DAY_S * 1000, "x"],
  });
  const r = await sweepRetention({ stores: { counters: { "chart-rate": store } }, now: NOW });
  assert.deepEqual([...store.data.keys()].sort(), ["edge", "empty", "mixed", "recent", "weird"]);
  assert.equal(r.stores["chart-rate"].undatable, 3);
});

test("a failed read or delete keeps the record, is counted, and does not stop the rest", async () => {
  const readings = fakeStore(
    { [id(1)]: reading(400 * DAY_S), [id(2)]: reading(400 * DAY_S), [id(3)]: reading(400 * DAY_S) },
    { failGet: [id(1)], failDelete: [id(2)] },
  );
  const r = await sweepRetention({ stores: { readings }, now: NOW });
  assert.deepEqual([...readings.data.keys()].sort(), [id(1), id(2)]);
  assert.equal(r.stores.readings.failed, 2);
  assert.equal(r.stores.readings.deleted, 1);

  const down = fakeStore({ [id(1)]: reading(400 * DAY_S) }, { failList: true });
  const r2 = await sweepRetention({ stores: { readings: down }, now: NOW });
  assert.equal(r2.stores.readings.failed, 1);
  assert.equal(down.data.size, 1);
});

test("out of time: stops starting new work and says the run was incomplete", async () => {
  const entries = {};
  for (let i = 1; i <= 20; i++) entries[id(i)] = reading(400 * DAY_S);
  const readings = fakeStore(entries);
  let t = 0;
  const clock = () => (t += 1000); // each look at the clock is a second later
  const r = await sweepRetention({ stores: { readings }, now: NOW, budgetMs: 5000, clock });
  assert.equal(r.incomplete, true);
  assert.ok(r.stores.readings.deleted < 20 && r.stores.readings.deleted > 0);
  assert.match(describe(r), /INCOMPLETE/);
});

test("THE LOG LINE IS COUNTS ONLY: no key, id, name, email or birth detail", async () => {
  const health = fakeStore({ [`ring/${id(7)}`]: { at: 1 } });
  const readings = fakeStore({ [id(7)]: reading(400 * DAY_S), [id(8)]: reading(1) });
  const r = await sweepRetention({ stores: { readings, health }, now: NOW });
  const line = describe(r) + JSON.stringify(r);
  for (const secret of [id(7), id(8), "Asdf", "buyer@example.com", "5550100", "1990-01-02", "Austin", "Chicago"]) {
    assert.ok(!line.includes(secret), `the log carries ${secret}`);
  }
});
