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
