import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { RING_AFTER_MS, RING_EVERY_MS, ringIfDue, shouldRing } from "../netlify/lib/ring.mjs";

/**
 * THE BUYER'S OWN PAGE IS THE SAFETY NET.
 *
 * Both hosted schedulers failed in the same week (Netlify's stopped invoking,
 * GitHub's cron fired every few hours against a fifteen-minute schedule), and
 * a reading refused twice waited on luck. The page polling for its reading is
 * the one thing that reliably happens; these pin the gate that turns a poll
 * into a ring without turning every poll into one.
 */

const T0 = Date.UTC(2026, 8, 3, 12, 0, 0);

test("a chart filed a moment ago is left alone -- the purchase already rang", () => {
  assert.equal(shouldRing({ filledAtMs: T0 - 10_000, lastRingMs: null, now: T0 }), false);
});

test("a chart unwritten past the grace period rings once", () => {
  assert.equal(shouldRing({ filledAtMs: T0 - RING_AFTER_MS - 1, lastRingMs: null, now: T0 }), true);
});

test("a second poll inside the window does not ring again", () => {
  const filledAtMs = T0 - 10 * 60_000;
  assert.equal(shouldRing({ filledAtMs, lastRingMs: T0 - 5_000, now: T0 }), false);
  assert.equal(shouldRing({ filledAtMs, lastRingMs: T0 - RING_EVERY_MS - 1, now: T0 }), true);
});

test("rubbish never rings", () => {
  for (const bad of [undefined, null, NaN, "soon"]) {
    assert.equal(shouldRing({ filledAtMs: bad, lastRingMs: null, now: T0 }), false);
  }
});

function fakeGate() {
  const m = new Map();
  return {
    m,
    async get(k) { return m.has(k) ? m.get(k) : null; },
    async setJSON(k, v) { m.set(k, JSON.parse(JSON.stringify(v))); },
  };
}

test("ringIfDue rings, remembers, and then holds its peace", async () => {
  const gate = fakeGate();
  const rung = [];
  const ring = async (id) => rung.push(id);
  const filledAtMs = T0 - 10 * 60_000;
  assert.deepEqual(await ringIfDue({ id: "abc", filledAtMs, gate, ring, now: T0 }), { rang: true });
  assert.deepEqual(await ringIfDue({ id: "abc", filledAtMs, gate, ring, now: T0 + 30_000 }), { rang: false });
  assert.deepEqual(await ringIfDue({ id: "abc", filledAtMs, gate, ring, now: T0 + RING_EVERY_MS + 1 }), { rang: true });
  assert.deepEqual(rung, ["abc", "abc"]);
});

test("a broken gate or a failed ring is a missed nudge, never a thrown error", async () => {
  const angry = { async get() { throw new Error("down"); }, async setJSON() { throw new Error("down"); } };
  const filledAtMs = T0 - 10 * 60_000;
  assert.deepEqual(await ringIfDue({ id: "x", filledAtMs, gate: angry, ring: async () => {}, now: T0 }), { rang: true });
  assert.deepEqual(await ringIfDue({ id: "x", filledAtMs, gate: fakeGate(), ring: async () => { throw new Error("no"); }, now: T0 }), { rang: false });
});

test("THE READING ENDPOINT RINGS -- structurally, because it holds the secret", () => {
  const src = readFileSync(fileURLToPath(new URL("../netlify/functions/reading.mjs", import.meta.url)), "utf8");
  assert.match(src, /ringIfDue/, "the reading endpoint no longer rings the writer for a stuck reading");
  assert.match(src, /TRIGGER_HEADER/, "the ring does not carry the trigger token");
});

/* ------------------------------------------- RETRY SOONER (Jeremy 10/23: "Better to retry sooner") */

test("an unwritten reading rings the writer again, RERINGS times at most, then the sweep carries on as before", async () => {
  const { RERINGS, reringIfDue } = await import("../netlify/lib/ring.mjs");
  const gate = fakeGate();
  const rung = [];
  const ring = async (id) => rung.push(id);
  for (let i = 0; i < RERINGS + 3; i++) await reringIfDue({ id: "abc", gate, ring, now: T0 + i * 60_000 });
  assert.deepEqual(rung, Array(RERINGS).fill("abc"));
  assert.equal(gate.m.get("rering/abc").count, RERINGS);
  // The page's poll counts it as a ring: no second ring from the page a moment later.
  assert.equal(shouldRing({ filledAtMs: T0 - 10 * 60_000, lastRingMs: gate.m.get("ring/abc").at, now: gate.m.get("ring/abc").at + 30_000 }), false);
  // Each reading has its own count.
  assert.deepEqual(await reringIfDue({ id: "xyz", gate, ring, now: T0 }), { rang: true, count: 1 });
});

test("bounded even when the store is not: a count that cannot be written rings nothing", async () => {
  const { reringIfDue } = await import("../netlify/lib/ring.mjs");
  const rung = [];
  const readOnly = { async get() { return null; }, async setJSON() { throw new Error("down"); } };
  assert.deepEqual(await reringIfDue({ id: "abc", gate: readOnly, ring: async (id) => rung.push(id), now: T0 }), { rang: false, count: 0 });
  assert.deepEqual(rung, []);
  const angryRing = await reringIfDue({ id: "abc", gate: fakeGate(), ring: async () => { throw new Error("no"); }, now: T0 });
  assert.equal(angryRing.rang, false, "a failed ring is a missed nudge, never a thrown error");
});

test("only endings another job could change ring again: not a reading written, missing or misconfigured", async () => {
  const { reringWorth } = await import("../netlify/lib/ring.mjs");
  for (const r of ["malformed", "timeout", "http", "network", "unreadable", "out_of_time", "unknown"]) assert.equal(reringWorth(r), true, r);
  for (const r of ["already_written", "not_found", "wrong_tier", "no_chart_yet", "misconfigured", "no_chart"]) assert.equal(reringWorth(r), false, r);
});

test("the writer rings itself again for what it could not write, once per run, inside its fifteen minutes", () => {
  const writer = readFileSync(fileURLToPath(new URL("../netlify/functions/interpret.mjs", import.meta.url)), "utf8");
  assert.match(writer, /reringIfDue\(/);
  assert.match(writer, /if \(out\.rang\) return;/, "one ring per run");
  assert.match(writer, /RERING_GAP_MS \+ 30_000 > deadline \+ 60_000/, "only while it fits the fifteen minutes");
  // The sweep is unchanged: still every fifteen minutes, still only rings.
  const sweep = readFileSync(fileURLToPath(new URL("../netlify/functions/sweep.mjs", import.meta.url)), "utf8");
  assert.match(sweep, /schedule: "\*\/15 \* \* \* \*"/);
});
