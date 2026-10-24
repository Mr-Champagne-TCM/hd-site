import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { LIMITS, WEEK, sweepCounters } from "../netlify/lib/ratelimit.mjs";

/**
 * PICKS-EXTRA-rate-sweep (MUST before release): the privacy page says "The
 * scrambled IP hash: One week". The salted-IP counters were never deleted;
 * the fifteen-minute sweep now deletes every counter whose newest hit is
 * older than a week.
 */
const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.UTC(2026, 10, 1, 12);

function store(entries = {}, { listThrows = false, getThrows = [], deleteThrows = [] } = {}) {
  const data = new Map(Object.entries(entries));
  return {
    data,
    async list() {
      if (listThrows) throw new Error("down");
      return { blobs: [...data.keys()].map((key) => ({ key })) };
    },
    async get(k, { type } = {}) {
      assert.equal(type, "json");
      if (getThrows.includes(k)) throw new Error("down");
      return data.has(k) ? data.get(k) : null;
    },
    async delete(k) {
      if (deleteThrows.includes(k)) throw new Error("down");
      data.delete(k);
    },
  };
}

test("an 8-day-old counter is deleted, a 6-day-old one is kept", async () => {
  const s = store({
    a1b2c3: [NOW - 9 * DAY, NOW - 8 * DAY],
    "t:d4e5f6": [NOW - 6 * DAY],
  });
  const r = await sweepCounters(s, { now: NOW });
  assert.deepEqual(r, { listed: 2, deleted: 1, kept: 1, failed: 0 });
  assert.ok(!s.data.has("a1b2c3"), "8 days old: gone");
  assert.ok(s.data.has("t:d4e5f6"), "6 days old: kept");
});

test("age is the NEWEST hit: an old first hit with a recent one stays", async () => {
  const s = store({ "v:abc": [NOW - 10 * DAY, NOW - 2 * DAY] });
  const r = await sweepCounters(s, { now: NOW });
  assert.equal(r.deleted, 0);
  assert.ok(s.data.has("v:abc"));
});

test("an empty counter goes; a blob that is not a list of times is left alone", async () => {
  const s = store({ empty: [], other: { not: "ours" }, mixed: [NOW - 9 * DAY, "x"] });
  const r = await sweepCounters(s, { now: NOW });
  assert.deepEqual([...s.data.keys()].sort(), ["mixed", "other"]);
  assert.equal(r.deleted, 1);
});

test("never throws: list, read and delete failures are counted", async () => {
  assert.deepEqual(await sweepCounters(store({}, { listThrows: true }), { now: NOW }), { listed: 0, deleted: 0, kept: 0, failed: 1 });
  const s = store({ a: [NOW - 8 * DAY], b: [NOW - 8 * DAY], c: [NOW - 8 * DAY] }, { getThrows: ["a"], deleteThrows: ["b"] });
  assert.deepEqual(await sweepCounters(s, { now: NOW }), { listed: 3, deleted: 1, kept: 0, failed: 2 });
});

test("a week is the longest window any limiter counts, so nothing in use is lost", () => {
  assert.equal(WEEK, 7 * DAY);
  assert.ok(Math.max(...LIMITS.map((l) => l.ms)) <= WEEK);
  const read = (p) => readFileSync(new URL(`../netlify/${p}`, import.meta.url), "utf8");
  for (const p of ["lib/resendHandler.mjs", "lib/myChartsHandler.mjs"]) {
    const windows = [...read(p).matchAll(/ms:\s*([\d_* ]+)/g)].map((m) => Function(`return ${m[1].replaceAll("_", "")}`)());
    assert.ok(windows.length && windows.every((ms) => ms <= WEEK), p);
  }
  assert.match(read("functions/places.mjs"), /const WINDOW_MS = 60 \* 60 \* 1000;/);
});

test("the fifteen-minute sweep runs it on all three salted-IP counter stores", () => {
  const sweep = readFileSync(new URL("../netlify/functions/sweep.mjs", import.meta.url), "utf8");
  assert.match(sweep, /import \{ sweepCounters \} from "\.\.\/lib\/ratelimit\.mjs";/);
  assert.match(sweep, /for \(const name of \["chart-rate", "resend-rate", "places-rate"\]\)/);
  assert.match(sweep, /await sweepCounters\(getStore\(\{ name, consistency: "strong" \}\)\)/);
  // Every store a salted IP hash is written to is in that list.
  const fns = ["chart", "add-time", "resend", "my-charts", "places"].map((f) => readFileSync(new URL(`../netlify/functions/${f}.mjs`, import.meta.url), "utf8"));
  const rateStores = new Set(fns.flatMap((s) => [...s.matchAll(/getStore\(\{ name: "([a-z-]+-rate)"/g)].map((m) => m[1])));
  assert.deepEqual([...rateStores].sort(), ["chart-rate", "places-rate", "resend-rate"]);
});
