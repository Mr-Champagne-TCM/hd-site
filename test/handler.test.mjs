import { test } from "node:test";
import assert from "node:assert/strict";
import { handleChart } from "../netlify/lib/handler.mjs";
import { HOUR } from "../netlify/lib/ratelimit.mjs";

const T0 = Date.parse("2026-08-26T12:00:00Z");
const BIRTH = { date: "1985-06-25", zone: "America/Chicago", timeKnown: false };

function fakeStore() {
  const data = new Map();
  return {
    data,
    async keyFor(ip) { return `k:${ip}`; },
    async load(key) { return data.get(key) ?? []; },
    async save(key, hits) { data.set(key, hits); },
  };
}

function fakeEngine(reply = { ok: true, status: 200, payload: { type: "Generator" } }) {
  const calls = [];
  const fn = async (payload) => { calls.push(payload); return reply; };
  fn.calls = calls;
  return fn;
}

const post = (over = {}) => handleChart({
  body: JSON.stringify({ birth: BIRTH }),
  ip: "203.0.113.7",
  now: T0,
  store: fakeStore(),
  engine: fakeEngine(),
  ...over,
});

test("a first request reaches the engine and comes back", async () => {
  const engine = fakeEngine();
  const res = await post({ engine });
  assert.equal(res.status, 200);
  assert.equal(engine.calls.length, 1);
  assert.equal(engine.calls[0].tier, 0, "the edge always asks for tier 0");
});

/**
 * T-10, and the whole reason the bouncer stands on the free door.
 */
test("the 21st request in an hour is refused AND the engine records no call", async () => {
  const store = fakeStore();
  const engine = fakeEngine();
  for (let i = 0; i < 20; i++) {
    const r = await handleChart({ body: JSON.stringify({ birth: BIRTH }), ip: "1.2.3.4", now: T0, store, engine });
    assert.equal(r.status, 200, `call ${i + 1}`);
  }
  assert.equal(engine.calls.length, 20);

  const res = await handleChart({ body: JSON.stringify({ birth: BIRTH }), ip: "1.2.3.4", now: T0, store, engine });
  assert.equal(res.status, 429);
  assert.equal(engine.calls.length, 20, "the engine must not have been called for the refused request");
});

test("a refusal says Retry-After, in seconds", async () => {
  const store = fakeStore();
  const engine = fakeEngine();
  for (let i = 0; i < 20; i++) {
    await handleChart({ body: JSON.stringify({ birth: BIRTH }), ip: "9.9.9.9", now: T0, store, engine });
  }
  const res = await handleChart({ body: JSON.stringify({ birth: BIRTH }), ip: "9.9.9.9", now: T0, store, engine });
  const after = Number(res.headers["Retry-After"]);
  assert.ok(after > 0 && after <= 3600, `Retry-After should be inside the hour, got ${after}`);
});

test("one visitor's limit is not another's", async () => {
  const store = fakeStore();
  const engine = fakeEngine();
  for (let i = 0; i < 20; i++) {
    await handleChart({ body: JSON.stringify({ birth: BIRTH }), ip: "5.5.5.5", now: T0, store, engine });
  }
  assert.equal((await handleChart({ body: JSON.stringify({ birth: BIRTH }), ip: "5.5.5.5", now: T0, store, engine })).status, 429);
  assert.equal((await handleChart({ body: JSON.stringify({ birth: BIRTH }), ip: "6.6.6.6", now: T0, store, engine })).status, 200);
});

test("an hour later the same visitor is served again", async () => {
  const store = fakeStore();
  const engine = fakeEngine();
  for (let i = 0; i < 20; i++) {
    await handleChart({ body: JSON.stringify({ birth: BIRTH }), ip: "7.7.7.7", now: T0, store, engine });
  }
  const res = await handleChart({ body: JSON.stringify({ birth: BIRTH }), ip: "7.7.7.7", now: T0 + HOUR, store, engine });
  assert.equal(res.status, 200);
});

test("nothing but the named birth fields reaches the engine", async () => {
  const engine = fakeEngine();
  await handleChart({
    body: JSON.stringify({
      // Obviously-invented values. Test fixtures in a public repo are published
      // text, and the first draft of this line used a real client's name.
      birth: { ...BIRTH, name: "Example Person", email: "someone@example.invalid", notes: "x", tier: 2 },
      tier: 2,
    }),
    ip: "8.8.8.8", now: T0, store: fakeStore(), engine,
  });
  assert.deepEqual(Object.keys(engine.calls[0].birth).sort(), ["date", "timeKnown", "zone"]);
  assert.equal(engine.calls[0].tier, 0, "a caller must not be able to ask for a paid tier here");
});

test("an unreachable engine says so plainly, and says nothing was charged", async () => {
  const engine = async () => { throw new Error("ECONNREFUSED"); };
  const res = await handleChart({ body: JSON.stringify({ birth: BIRTH }), ip: "4.4.4.4", now: T0, store: fakeStore(), engine });
  assert.equal(res.status, 502);
  const payload = JSON.parse(res.body);
  assert.match(payload.error.message, /nothing was charged/i);
  // The upstream fault must not travel. Checked against what a real leak looks
  // like -- an errno, a stack frame, a file path -- not against the word
  // "error", which is the name of the field this response is supposed to have.
  assert.doesNotMatch(res.body, /ECONNREFUSED|ETIMEDOUT|at .*\.mjs|node:internal|\/netlify\//);
});

test("the visitor's IP is never what gets stored", async () => {
  const store = fakeStore();
  await handleChart({ body: JSON.stringify({ birth: BIRTH }), ip: "198.51.100.9", now: T0, store, engine: fakeEngine() });
  const stored = JSON.stringify([...store.data.entries()]);
  // The fake store keys on the raw ip; the real one hashes it. What this asserts
  // is that the handler asks the store for a key rather than using the ip itself.
  assert.ok(stored.includes("k:198.51.100.9"), "the handler should key through store.keyFor");
});

test("a missing birth object is asked about, not guessed at", async () => {
  const res = await handleChart({ body: JSON.stringify({}), ip: "3.3.3.3", now: T0, store: fakeStore(), engine: fakeEngine() });
  assert.equal(res.status, 400);
  assert.equal(JSON.parse(res.body).error.code, "no_birth");
});
