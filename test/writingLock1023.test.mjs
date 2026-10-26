import { test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { randomBytes } from "node:crypto";
import { getStore } from "@netlify/blobs";
import { BlobsServer } from "@netlify/blobs/server";
import { READING_BUDGET_MS, WRITING_LOCK_MS, WRITING_ELSEWHERE, interpretOne } from "../netlify/lib/interpretJob.mjs";
import { SETTLE_MS, liveLock, lockKey, lockLive, releaseLock, takeLock, untilText } from "../netlify/lib/writingLock.mjs";
import { RERINGS, RING_EVERY_MS, reringIfDue, reringWorth, ringIfDue } from "../netlify/lib/ring.mjs";
import { fillReading, loadReading, saveReading } from "../netlify/lib/reading.mjs";
import { TEXT } from "./support/tier2Fixture.mjs";

/**
 * DECISION 23 (GO page v3, 10/23): "An open buyer page rings the writer every
 * 2 minutes (after the first 90 s), even while one is writing, so two writers
 * can ask Google for the same reading (only one is kept; this is old
 * behavior). Add a short "writing" lock."
 *
 * Pinned: two rings at once make one writer (on a fake store, and on the real
 * Netlify Blobs client against its own local server, strong consistency); the
 * lock expires by itself after the reading's budget plus a margin; a writer
 * that crashes -- by throwing, or by being killed with the lock still held --
 * leaves the reading to the next ring; the buyer page's poll, the writer's own
 * 15-second re-rings and the sweep's drain all respect a live lock; and the
 * logs say so.
 */

const OUTPUT = {
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
};

/** A store whose writes land a few milliseconds after they are made, like a real one, and which can delete. */
function fakeStore({ latency = 4 } = {}) {
  const data = new Map();
  const later = (ms) => new Promise((r) => setTimeout(r, ms));
  return {
    data,
    async setJSON(key, value) {
      await later(Math.floor(Math.random() * latency));
      data.set(key, JSON.parse(JSON.stringify(value)));
    },
    async get(key) {
      await later(Math.floor(Math.random() * latency));
      return data.has(key) ? JSON.parse(JSON.stringify(data.get(key))) : null;
    },
    async delete(key) {
      await later(Math.floor(Math.random() * latency));
      data.delete(key);
    },
    async list() {
      return { blobs: [...data.keys()].map((key) => ({ key })) };
    },
  };
}

async function readyReading(store) {
  const id = await saveReading(store, {
    tier: 2, output: null, name: "Robin Testwell", email: "buyer@example.com", phone: null, sku: "reading", purchasedAt: Date.now(),
  });
  await fillReading(store, id, OUTPUT);
  return id;
}

/** A model that answers after a while, counting every ask. */
function slowModel(ms = 30) {
  const asks = [];
  const generate = async (output) => {
    asks.push(Date.now());
    await new Promise((r) => setTimeout(r, ms));
    return { ok: true, text: TEXT };
  };
  return { asks, generate };
}

/** The settle wait, scaled down for tests: still longer than the fake store's write latency. */
const quickSleep = (ms) => new Promise((r) => setTimeout(r, ms === SETTLE_MS ? 25 : 0));

/* ---------------------------------------------------------------- the numbers */

test("the lock lasts the reading's budget plus a margin, and less than the sweep's fifteen minutes", () => {
  assert.equal(READING_BUDGET_MS, 8 * 60_000);
  assert.equal(WRITING_LOCK_MS, READING_BUDGET_MS + 2 * 60_000);
  assert.ok(WRITING_LOCK_MS < 15 * 60_000, "a crashed writer would hold its reading past the next sweep");
  // The settle wait is short next to a reading (tens of seconds) and long next to one Blobs write.
  assert.ok(SETTLE_MS >= 1_000 && SETTLE_MS <= 2_000);
});

test("live means: an owner and an end still ahead", () => {
  const t = 1_000_000;
  assert.equal(lockLive({ owner: "a", until: t + 1 }, t), true);
  assert.equal(lockLive({ owner: "a", until: t }, t), false, "a lock is over at its end");
  assert.equal(lockLive({ owner: "a", until: 0 }, t), false, "a released lock");
  for (const bad of [null, undefined, {}, { until: t + 5 }, { owner: "a" }, { owner: "a", until: "soon" }]) assert.equal(lockLive(bad, t), false);
  assert.match(untilText(Date.UTC(2026, 9, 23, 14, 32, 5)), /^until 14:32:05 UTC$/);
});

/* ---------------------------------------------------- two rings at once, one writer */

test("TWO RINGS AT ONCE -> ONE WRITER: the second does nothing, Google is asked once, the words are filed once", async () => {
  for (let round = 0; round < 20; round++) {
    const store = fakeStore();
    const gate = fakeStore();
    const id = await readyReading(store);
    const { asks, generate } = slowModel();
    const job = () => interpretOne({ id, store, health: gate, lock: gate, apiKey: "k", generate, sleep: quickSleep });
    const results = await Promise.all([job(), job()]);

    assert.equal(asks.length, 1, `round ${round}: Google was asked ${asks.length} times`);
    const ok = results.filter((r) => r.ok);
    const other = results.filter((r) => !r.ok);
    assert.equal(ok.length, 1, `round ${round}: ${JSON.stringify(results)}`);
    assert.equal(other.length, 1);
    assert.equal(other[0].reason, WRITING_ELSEWHERE);
    assert.ok(other[0].until > Date.now(), "the answer says until when");
    assert.equal((await loadReading(store, id)).reading, TEXT);
    assert.equal(gate.data.has(lockKey(id)), false, "the writer did not let go of the lock");
  }
});

test("a ring while a writer is mid-reading does nothing at once (no settle wait, no Google)", { timeout: 10_000 }, async () => {
  const store = fakeStore();
  const gate = fakeStore();
  const id = await readyReading(store);
  // The first job's model answers only when released (10/26: a stopwatch "< 100 ms" here failed under load).
  const asks = [];
  let release = null;
  const generate = async () => {
    asks.push(Date.now());
    await new Promise((r) => { release = r; });
    return { ok: true, text: TEXT };
  };
  const first = interpretOne({ id, store, health: gate, lock: gate, apiKey: "k", generate, sleep: quickSleep });
  for (let i = 0; !release && i < 400; i++) await new Promise((r) => setTimeout(r, 5)); // the first job holds the lock and is asking
  assert.ok(release, "the first job reached the model");
  assert.ok(await liveLock(gate, id), "the first job holds no lock while writing");
  let firstDone = false;
  first.then(() => { firstDone = true; });
  const second = await interpretOne({ id, store, health: gate, lock: gate, apiKey: "k", generate, sleep: () => assert.fail("a held lock needs no wait") });
  assert.equal(second.reason, WRITING_ELSEWHERE);
  assert.equal(firstDone, false, "the second answered while the first was still writing: it waited on nothing");
  release();
  assert.equal((await first).ok, true);
  assert.equal(asks.length, 1);
  // After it ends, a ring finds the words and stops, as it always has.
  const third = await interpretOne({ id, store, health: gate, lock: gate, apiKey: "k", generate, sleep: quickSleep });
  assert.equal(third.reason, "already_written");
  assert.equal(asks.length, 1);
});

test("a job that waited for the lock and then got it reloads the reading, so a finished one is not asked for again", async () => {
  const store = fakeStore();
  const gate = fakeStore();
  const id = await readyReading(store);
  const { asks, generate } = slowModel(10);
  // A runs; B is rung during A's settle wait (both read "no lock"), loses, and a third ring after A comes too late.
  const [a, b] = await Promise.all([
    interpretOne({ id, store, health: gate, lock: gate, apiKey: "k", generate, sleep: quickSleep }),
    interpretOne({ id, store, health: gate, lock: gate, apiKey: "k", generate, sleep: quickSleep }),
  ]);
  const c = await interpretOne({ id, store, health: gate, lock: gate, apiKey: "k", generate, sleep: quickSleep });
  assert.deepEqual([a.ok || b.ok, c.reason], [true, "already_written"]);
  assert.equal(asks.length, 1);
});

/* ------------------------------------------------------------------ lock expiry */

test("LOCK EXPIRY: a lock is live for WRITING_LOCK_MS and then is no one's", async () => {
  const gate = fakeStore({ latency: 0 });
  let now = Date.UTC(2026, 9, 23, 15, 0, 0);
  const clock = () => now;
  const a = await takeLock({ gate, id: "r1", ms: WRITING_LOCK_MS, clock, sleep: async () => {} });
  assert.equal(a.ok, true);
  assert.equal(a.lock.until, now + WRITING_LOCK_MS);

  now += WRITING_LOCK_MS - 1;
  const b = await takeLock({ gate, id: "r1", ms: WRITING_LOCK_MS, clock, sleep: async () => {} });
  assert.equal(b.ok, false, "a second job took a live lock");
  assert.equal(b.held.owner, a.lock.owner);

  now += 1;
  assert.equal(await liveLock(gate, "r1", now), null, "the lock outlived its end");
  const c = await takeLock({ gate, id: "r1", ms: WRITING_LOCK_MS, clock, sleep: async () => {} });
  assert.equal(c.ok, true, "an expired lock still blocks");
  assert.notEqual(c.lock.owner, a.lock.owner);

  // The first job, ending late, does not let go of the second job's lock.
  assert.deepEqual(await releaseLock({ gate, id: "r1", lock: a.lock }), { released: false, reason: "not ours" });
  assert.ok(await liveLock(gate, "r1", now));
  assert.deepEqual(await releaseLock({ gate, id: "r1", lock: c.lock }), { released: true });
  assert.equal(await liveLock(gate, "r1", now), null);
});

/* --------------------------------------------------------- crash -> next ring writes */

test("CRASH BY THROWING: the lock is let go on the way out, and the next ring writes", async () => {
  const store = fakeStore();
  const gate = fakeStore();
  const id = await readyReading(store);
  await assert.rejects(
    interpretOne({ id, store, health: gate, lock: gate, apiKey: "k", generate: async () => { throw new Error("boom"); }, sleep: quickSleep }),
    /boom/,
  );
  assert.equal(await liveLock(gate, id), null, "a crashed job left its lock");
  const { asks, generate } = slowModel(1);
  const next = await interpretOne({ id, store, health: gate, lock: gate, apiKey: "k", generate, sleep: quickSleep });
  assert.equal(next.ok, true);
  assert.equal(asks.length, 1);
});

test("CRASH BY BEING KILLED (lock left behind): rings do nothing until it expires, then the next ring writes", async () => {
  const store = fakeStore({ latency: 0 });
  const gate = fakeStore({ latency: 0 });
  const id = await readyReading(store);
  let now = Date.now();
  const clock = () => now;
  // A writer took the lock and was killed mid-reading: nothing let it go.
  const dead = await takeLock({ gate, id, ms: WRITING_LOCK_MS, clock, sleep: async () => {} });
  assert.equal(dead.ok, true);

  const { asks, generate } = slowModel(1);
  const ring = () => interpretOne({ id, store, health: gate, lock: gate, apiKey: "k", generate, clock, sleep: async () => {} });

  // Every way in, while the lock is live: the writer does nothing...
  now += 2 * 60_000;
  assert.equal((await ring()).reason, WRITING_ELSEWHERE);
  // ...the buyer page's poll does not ring (and does not count as a ring)...
  const rung = [];
  const filledAtMs = now - 10 * 60_000;
  const poll = await ringIfDue({ id, filledAtMs, gate, ring: async (x) => rung.push(x), now });
  assert.deepEqual(poll, { rang: false, writing: dead.lock.until });
  assert.equal(gate.data.has(`ring/${id}`), false, "a poll that did not ring was counted as a ring");
  // ...and the writer's own 15-second re-ring neither rings nor spends a re-ring.
  const re = await reringIfDue({ id, gate, ring: async (x) => rung.push(x), now });
  assert.deepEqual(re, { rang: false, count: null, writing: dead.lock.until });
  assert.equal(gate.data.has(`rering/${id}`), false);
  assert.deepEqual(rung, []);
  assert.equal(asks.length, 0, "Google was asked while a writer held the reading");

  // The lock expires (budget + margin): the next poll rings, and the ring writes.
  now = dead.lock.until;
  assert.deepEqual(await ringIfDue({ id, filledAtMs, gate, ring: async (x) => rung.push(x), now }), { rang: true });
  assert.deepEqual(rung, [id]);
  const wrote = await ring();
  assert.equal(wrote.ok, true);
  assert.equal(asks.length, 1);
  assert.equal(await liveLock(gate, id, now), null);
  // The re-ring count was never spent while the lock held: both are still there for a later failure.
  assert.deepEqual(await reringIfDue({ id, gate, ring: async () => {}, now }), { rang: true, count: 1 });
  assert.ok(RERINGS >= 2);
});

test("the sweep's drain passes over a reading another run is writing, and does not ring it again", () => {
  // The drain is interpretOne for every reading still owed (interpret.mjs), so the lock answers it;
  // and a reading another run is writing is not one this run re-rings: that run does, if it must.
  assert.equal(reringWorth(WRITING_ELSEWHERE), false);
  const writer = readFileSync(fileURLToPath(new URL("../netlify/functions/interpret.mjs", import.meta.url)), "utf8");
  assert.match(writer, /lock: health,/, "the writer takes no lock");
  assert.match(writer, /const store = getStore\(\{ name: "readings", consistency: "strong" \}\)/);
  assert.match(writer, /const health = getStore\(\{ name: "health", consistency: "strong" \}\)/);
  // Says so in the log, for the named ring and for the drain, and for a re-ring it does not make.
  assert.match(writer, /r\.reason === "writing_elsewhere" \? elsewhere\(r\)/);
  assert.match(writer, /result\.reason === "writing_elsewhere" \? elsewhere\(result\)/);
  assert.match(writer, /another run is writing it \(writing lock \$\{untilText\(r\.until\)\}\); this one does nothing/);
  assert.match(writer, /no re-ring for \$\{id\}: another run is writing it/);
  const poll = readFileSync(fileURLToPath(new URL("../netlify/functions/reading.mjs", import.meta.url)), "utf8");
  assert.match(poll, /a writer is on this reading \(writing lock \$\{untilText\(out\.writing\)\}\); not rung/);
  // The poll's gate is the same health store, strong.
  assert.match(poll, /gate: getStore\(\{ name: "health", consistency: "strong" \}\)/);
  // The poll still waits its two minutes between rings; the lock only adds "not while writing".
  assert.equal(RING_EVERY_MS, 120_000);
});

test("when the lock's store fails, the reading is written anyway (the old behavior), and the answer says so", async () => {
  const store = fakeStore();
  const id = await readyReading(store);
  const broken = { async get() { throw new Error("down"); }, async setJSON() { throw new Error("down"); }, async delete() { throw new Error("down"); } };
  const { asks, generate } = slowModel(1);
  const r = await interpretOne({ id, store, health: fakeStore(), lock: broken, apiKey: "k", generate, sleep: quickSleep });
  assert.equal(r.ok, true);
  assert.equal(r.unlocked, "unreadable");
  assert.equal(asks.length, 1);
  const writeOnly = { async get() { return null; }, async setJSON() { throw new Error("down"); } };
  assert.deepEqual(await takeLock({ gate: writeOnly, id: "x", ms: 1000, sleep: async () => {} }), { ok: true, lock: null, unlocked: "unwritable" });
  // And the poll and the re-ring ring as before when the lock cannot be read.
  assert.deepEqual(await ringIfDue({ id: "x", filledAtMs: Date.now() - 10 * 60_000, gate: broken, ring: async () => {} }), { rang: true });
});

test("without a lock store the job is exactly the old one (no lock taken, no wait)", async () => {
  const store = fakeStore();
  const id = await readyReading(store);
  const { asks, generate } = slowModel(1);
  const r = await interpretOne({ id, store, health: fakeStore(), apiKey: "k", generate, sleep: () => assert.fail("no settle wait without a lock") });
  assert.equal(r.ok, true);
  assert.equal(asks.length, 1);
});

/* ------------------------------------------- the real Blobs client, strong consistency */

test("ON THE REAL NETLIFY BLOBS CLIENT (its own local server, strong reads): two rings at once -> one writer", async () => {
  const dir = mkdtempSync(join(tmpdir(), "hd-lock-"));
  const token = randomBytes(12).toString("hex");
  const server = new BlobsServer({ directory: dir, token });
  // Loopback only (the package's own start() binds every interface).
  const http_ = http.createServer((req, res) => server.handleRequest(req, res));
  const port = await new Promise((r) => http_.listen(0, "127.0.0.1", () => r(http_.address().port)));
  const url = `http://127.0.0.1:${port}`;
  server.address = url; // what its own start() would set (the harness's LoopbackBlobs does the same)
  const open =(name) => getStore({ name, siteID: "lock-test", token, edgeURL: url, uncachedEdgeURL: url, consistency: "strong" });
  try {
    for (let round = 0; round < 5; round++) {
      const store = open(`readings${round}`);
      const health = open(`health${round}`);
      const id = await readyReading(store);
      const { asks, generate } = slowModel(30);
      const job = () => interpretOne({ id, store, health, lock: health, apiKey: "k", generate, sleep: (ms) => new Promise((r) => setTimeout(r, ms === SETTLE_MS ? 150 : 0)) });
      const results = await Promise.all([job(), job()]);
      assert.equal(asks.length, 1, `round ${round}: Google asked ${asks.length} times`);
      assert.deepEqual(results.map((r) => r.ok ? "written" : r.reason).sort(), ["writing_elsewhere", "written"].sort());
      assert.equal((await loadReading(store, id)).reading, TEXT);
      assert.equal(await health.get(lockKey(id), { type: "json", consistency: "strong" }), null, "the lock was not let go");
    }
  } finally {
    await new Promise((r) => http_.close(r));
    rmSync(dir, { recursive: true, force: true });
  }
});
