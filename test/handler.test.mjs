import { test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { handleChart } from "../netlify/lib/handler.mjs";
import { HOUR } from "../netlify/lib/ratelimit.mjs";
import { mintGrant } from "../netlify/lib/grant.mjs";
import { loadReading, mintReadingLink, saveReading } from "../netlify/lib/reading.mjs";

/**
 * Two different stores, and they are not interchangeable.
 *
 * `counterStore` is the rate limiter's -- keyed by a hashed IP, holding
 * timestamps. `memoryStore` is the readings blob store, shaped like Netlify
 * Blobs. Passing one where the other belongs is a mistake worth making
 * impossible to make quietly, so they are named for what they hold.
 */
function counterStore() {
  const data = new Map();
  return {
    data,
    async keyFor(ip) { return `k:${ip}`; },
    async load(key) { return data.get(key) ?? []; },
    async save(key, hits) { data.set(key, hits); },
  };
}

function memoryStore() {
  const m = new Map();
  return {
    m,
    async setJSON(k, v) { m.set(k, JSON.parse(JSON.stringify(v))); },
    async get(k) { return m.has(k) ? m.get(k) : null; },
  };
}

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
  // The summary asks for the chart tier's answer (its channels and gates) and keeps only its share (10/22).
  assert.equal(engine.calls[0].tier, 1, "the summary asks for the chart-level answer");
});

/**
 * THE TIER SPLIT (Jeremy 10/22): "gates/channels go to summary (with no
 * explanation)... chart option should only show the BG as upgrade". The
 * summary keeps the channel list and the gate numbers -- never the drawing,
 * the channel directions or the activations -- on its answer AND its record.
 */
test("the summary keeps channels and activated gates, never the drawing", async () => {
  const chartAnswer = {
    type: "Projector", strategy: "Wait for the invitation", authority: "Self-Projected", profile: "4/1",
    definition: "Single", notSelfTheme: "Bitterness", signature: "Success",
    incarnationCross: "Right Angle Cross of The Sphinx (1/2 | 7/13)",
    definedCenters: ["Throat", "G"], undefinedCenters: ["Head"], openCenters: ["Heart"], timeKnown: true,
    channels: ["1-8 (Inspiration)"], channelLines: ["1-8 Inspiration: G to Throat"], activatedGates: [8, 1, 13],
    bodygraphSvg: "<svg/>", personality: [{ planet: "SUN", gate: 1, line: 1 }], design: [],
  };
  const engine = fakeEngine({ ok: true, status: 200, payload: chartAnswer });
  const readings = memoryStore();
  const secret = randomBytes(32).toString("hex");
  const id = "a".repeat(32);
  await saveReading(readings, { id, tier: 0, output: null, purchasedAt: T0 });
  const res = await post({ engine, readings, grantSecret: secret, body: JSON.stringify({ birth: BIRTH, reading: mintReadingLink({ id, tier: 0 }, secret, T0) }) });
  assert.equal(res.status, 200);
  assert.equal(engine.calls[0].tier, 1);
  for (const answer of [JSON.parse(res.body), (await loadReading(readings, id, T0)).output]) {
    assert.deepEqual(answer.channels, ["1-8 (Inspiration)"]);
    assert.deepEqual(answer.activatedGates, [8, 1, 13]);
    for (const k of ["bodygraphSvg", "channelLines", "personality", "design"]) assert.equal(answer[k], undefined, k);
    assert.equal(answer.type, "Projector");
  }
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
  // Tier 1 is the summary's own ask (its channels and gates); a caller's "tier: 2" changes nothing.
  assert.equal(engine.calls[0].tier, 1, "a caller must not be able to ask for a paid tier here");
});

test("an unreachable engine says so plainly, and says nothing was charged", async () => {
  const engine = async () => { throw new Error("ECONNREFUSED"); };
  const res = await handleChart({ body: JSON.stringify({ birth: BIRTH }), ip: "4.4.4.4", now: T0, store: fakeStore(), engine });
  assert.equal(res.status, 503);
  const payload = JSON.parse(res.body);
  assert.match(payload.error.message, /nothing was charged/i);
  assert.equal(payload.error.key, "chart-slow-free");
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

// --- a reading link is also an entitlement ----------------------------------
//
// Somebody arriving from their delivery email has a signed link and no grant --
// the grant lived in the tab they closed. The link says which tier was paid for
// just as authoritatively, because we signed it when the money settled.

test("a reading link entitles a chart, with no grant at all", async () => {
  const secret = randomBytes(32).toString("hex");
  const readings = memoryStore();
  const id = await saveReading(readings, { tier: 1, output: null, name: "Jeremy" });
  const link = mintReadingLink({ id, tier: 1 }, secret);

  const asked = [];
  const res = await handleChart({
    body: JSON.stringify({ reading: link, birth: { utc: "1985-06-25T17:00:00Z" } }),
    ip: "1.2.3.4",
    now: Date.now(),
    store: counterStore(),
    engine: async (payload) => {
      asked.push(payload);
      return { ok: true, status: 200, payload: { type: "Generator", profile: "3/5" } };
    },
    grantSecret: secret,
    paywall: true,
    readings,
  });

  assert.equal(res.status, 200, "a paid link was refused: " + res.body);
  assert.equal(asked[0].tier, 1, "the engine was asked for the wrong tier");
});

test("THE LINK'S TIER WINS OVER A STALE GRANT LEFT IN A TAB", async () => {
  // Otherwise an old tier-0 grant quietly downgrades what somebody bought.
  const secret = randomBytes(32).toString("hex");
  const readings = memoryStore();
  const id = await saveReading(readings, { tier: 2, output: null });
  const link = mintReadingLink({ id, tier: 2 }, secret);
  const staleGrant = mintGrant({ tier: 0, sku: "hd_summary" }, secret);

  const asked = [];
  await handleChart({
    body: JSON.stringify({ reading: link, grant: staleGrant, birth: { utc: "1985-06-25T17:00:00Z" } }),
    ip: "1.2.3.4",
    now: Date.now(),
    store: counterStore(),
    engine: async (p) => { asked.push(p); return { ok: true, status: 200, payload: {} }; },
    grantSecret: secret,
    paywall: true,
    readings,
  });
  assert.equal(asked[0].tier, 2, "a stale grant downgraded a paid link");
});

test("the computed chart is PUT AWAY, so the link shows it next time", async () => {
  const secret = randomBytes(32).toString("hex");
  const readings = memoryStore();
  const id = await saveReading(readings, { tier: 1, output: null, name: "Jeremy" });
  const link = mintReadingLink({ id, tier: 1 }, secret);
  const chart = { type: "Generator", profile: "3/5", bodygraphSvg: "<svg>x</svg>" };

  await handleChart({
    body: JSON.stringify({ reading: link, birth: { utc: "1985-06-25T17:00:00Z" } }),
    ip: "1.2.3.4",
    now: Date.now(),
    store: counterStore(),
    engine: async () => ({ ok: true, status: 200, payload: chart }),
    grantSecret: secret,
    paywall: true,
    readings,
  });

  const back = await loadReading(readings, id);
  assert.equal(back.pending, false, "the reading is still pending after a chart was computed");
  assert.deepEqual(back.output, chart);
  assert.equal(back.buyer.name, "Jeremy", "the receipt was lost in the fill");
});

test("A SECOND SUBMISSION CANNOT REPLACE A CHART ALREADY DELIVERED", async () => {
  const secret = randomBytes(32).toString("hex");
  const readings = memoryStore();
  const id = await saveReading(readings, { tier: 1, output: null });
  const link = mintReadingLink({ id, tier: 1 }, secret);
  const first = { type: "Generator", profile: "3/5" };
  const second = { type: "Projector", profile: "1/3" };

  const submit = (payload) =>
    handleChart({
      body: JSON.stringify({ reading: link, birth: { utc: "1985-06-25T17:00:00Z" } }),
      ip: "1.2.3.4",
      now: Date.now(),
      store: counterStore(),
      engine: async () => ({ ok: true, status: 200, payload }),
      grantSecret: secret,
      paywall: true,
      readings,
    });

  await submit(first);
  const res = await submit(second);

  // The person still gets their chart back -- the request is not failed.
  assert.equal(res.status, 200);
  // But the stored one is untouched.
  assert.deepEqual((await loadReading(readings, id)).output, first, "a stored chart was overwritten");
});

/**
 * 10/16, A CHANGED RULING. This used to assert a 200: "the person is waiting",
 * so a paid chart that could not be filed was handed over anyway. But since
 * the form sends a paid buyer straight on to their reading link, that 200
 * landed them on a still-pending reading -- an EMPTY form, no explanation.
 * Now the store gets one more try, and if that fails too they stay on the
 * form with what they typed, told their purchase is safe; Jeremy is paged.
 */
test("a storage failure keeps the buyer on the form, purchase safe, Jeremy paged", async () => {
  const secret = randomBytes(32).toString("hex");
  const readings = memoryStore();
  const id = await saveReading(readings, { tier: 1, output: null });
  const link = mintReadingLink({ id, tier: 1 }, secret);

  const broken = { ...readings, async setJSON() { throw new Error("blobs are down"); } };
  const seen = [];
  const res = await handleChart({
    body: JSON.stringify({ reading: link, birth: { utc: "1985-06-25T17:00:00Z" } }),
    ip: "1.2.3.4",
    now: Date.now(),
    store: counterStore(),
    engine: async () => ({ ok: true, status: 200, payload: { type: "Generator" } }),
    grantSecret: secret,
    paywall: true,
    readings: broken,
    report: async (i) => seen.push(i),
  });
  assert.equal(res.status, 503);
  const body = JSON.parse(res.body);
  assert.equal(body.error.key, "chart-not-saved");
  assert.match(body.error.message, /purchase is safe/i);
  assert.doesNotMatch(res.body, /blobs are down/);
  assert.deepEqual(seen.map((i) => [i.kind, i.paid]), [["chart-not-saved", true]]);
});

test("a storage BLIP is absorbed by the second try", async () => {
  const secret = randomBytes(32).toString("hex");
  const readings = memoryStore();
  const id = await saveReading(readings, { tier: 1, output: null });
  const link = mintReadingLink({ id, tier: 1 }, secret);
  let failures = 1;
  const flaky = {
    ...readings,
    async setJSON(k, v) {
      if (failures-- > 0) throw new Error("blip");
      return readings.setJSON(k, v);
    },
  };
  const res = await handleChart({
    body: JSON.stringify({ reading: link, birth: { utc: "1985-06-25T17:00:00Z" } }),
    ip: "1.2.3.4",
    now: Date.now(),
    store: counterStore(),
    engine: async () => ({ ok: true, status: 200, payload: { type: "Generator" } }),
    grantSecret: secret,
    paywall: true,
    readings: flaky,
  });
  assert.equal(res.status, 200);
});

test("a FORGED reading link does not entitle anything", async () => {
  const secret = randomBytes(32).toString("hex");
  const other = randomBytes(32).toString("hex");
  const readings = memoryStore();
  const id = await saveReading(readings, { tier: 2, output: null });

  let called = false;
  const res = await handleChart({
    body: JSON.stringify({
      reading: mintReadingLink({ id, tier: 2 }, other),
      birth: { utc: "1985-06-25T17:00:00Z" },
    }),
    ip: "1.2.3.4",
    now: Date.now(),
    store: counterStore(),
    engine: async () => { called = true; return { ok: true, status: 200, payload: {} }; },
    grantSecret: secret,
    paywall: true,
    readings,
  });
  assert.equal(res.status, 402, "a forged link bought a chart");
  assert.equal(called, false, "the engine was called for a forged link");
});

// --- the email that says it is ready ----------------------------------------
//
// The first email goes out when the card clears and contains a door to a FORM,
// because there is no chart yet. Jeremy, having just made one: "as soon as the
// bodygraph is shown, an email should be in flight with link/code, right? I
// didn't get one."

test("filling a reading sends the it-is-ready email", async () => {
  const secret = randomBytes(32).toString("hex");
  const readings = memoryStore();
  const id = await saveReading(readings, { tier: 1, output: null, name: "Jeremy" });
  const link = mintReadingLink({ id, tier: 1 }, secret);

  const delivered = [];
  await handleChart({
    body: JSON.stringify({ reading: link, birth: { utc: "1985-06-25T17:00:00Z" } }),
    ip: "1.2.3.4",
    now: Date.now(),
    store: counterStore(),
    engine: async () => ({ ok: true, status: 200, payload: { type: "Generator" } }),
    grantSecret: secret,
    paywall: true,
    readings,
    deliver: async (x) => { delivered.push(x); },
  });

  assert.equal(delivered.length, 1, "no ready-email was sent");
  assert.equal(delivered[0].id, id);
  assert.equal(delivered[0].tier, 1);
});

test("A DOUBLE-SUBMITTED FORM DOES NOT SEND A SECOND EMAIL", async () => {
  // fillReading is write-once, so the second submission lands in the
  // already-filled branch -- which is also what stops a second email.
  const secret = randomBytes(32).toString("hex");
  const readings = memoryStore();
  const id = await saveReading(readings, { tier: 1, output: null });
  const link = mintReadingLink({ id, tier: 1 }, secret);

  const delivered = [];
  const submit = () =>
    handleChart({
      body: JSON.stringify({ reading: link, birth: { utc: "1985-06-25T17:00:00Z" } }),
      ip: "1.2.3.4",
      now: Date.now(),
      store: counterStore(),
      engine: async () => ({ ok: true, status: 200, payload: { type: "Generator" } }),
      grantSecret: secret,
      paywall: true,
      readings,
      deliver: async (x) => { delivered.push(x); },
    });

  await submit();
  const second = await submit();
  assert.equal(second.status, 200, "the person must still get their chart back");
  assert.equal(delivered.length, 1, "a second email went out on a re-submit");
});

test("the free path sends nothing, having nobody to write to", async () => {
  // No reading link, no `deliver`, no email. The summary on the offer page is
  // handed over and forgotten, which is correct there.
  const secret = randomBytes(32).toString("hex");
  const res = await handleChart({
    body: JSON.stringify({ birth: { utc: "1985-06-25T17:00:00Z" } }),
    ip: "1.2.3.4",
    now: Date.now(),
    store: counterStore(),
    engine: async () => ({ ok: true, status: 200, payload: { type: "Generator" } }),
    grantSecret: secret,
    paywall: false,
  });
  assert.equal(res.status, 200);
});

test("a failed send does not fail the chart - the person is looking at it", async () => {
  const secret = randomBytes(32).toString("hex");
  const readings = memoryStore();
  const id = await saveReading(readings, { tier: 1, output: null });
  const link = mintReadingLink({ id, tier: 1 }, secret);

  const res = await handleChart({
    body: JSON.stringify({ reading: link, birth: { utc: "1985-06-25T17:00:00Z" } }),
    ip: "1.2.3.4",
    now: Date.now(),
    store: counterStore(),
    engine: async () => ({ ok: true, status: 200, payload: { type: "Generator" } }),
    grantSecret: secret,
    paywall: true,
    readings,
    deliver: async () => { throw new Error("resend is down"); },
  });
  assert.equal(res.status, 200, "a failed email took the chart down with it");
  assert.equal((await loadReading(readings, id)).pending, false, "and it must still be stored");
});

// --- a paid chart keeps its birth details for the PDF (Jeremy 10/16) ---------

test("a paid chart is filed with its birth details; the engine still gets no place", async () => {
  const secret = randomBytes(32).toString("hex");
  const readings = memoryStore();
  const id = await saveReading(readings, { tier: 2, output: null, name: "Claude Test" });
  const link = mintReadingLink({ id, tier: 2 }, secret);
  const engine = fakeEngine({ ok: true, status: 200, payload: { type: "Manifestor", profile: "1/3" } });
  const birth = { date: "1976-12-14", time: "18:18", timeKnown: true, zone: "America/Chicago", place: "Chicago, Illinois" };
  const res = await handleChart({
    body: JSON.stringify({ reading: link, birth }),
    ip: "1.2.3.4",
    now: Date.now(),
    store: counterStore(),
    engine,
    grantSecret: secret,
    paywall: true,
    readings,
  });
  assert.equal(res.status, 200, res.body);
  assert.deepEqual(Object.keys(engine.calls[0].birth).sort(), ["date", "time", "timeKnown", "zone"]);
  assert.deepEqual((await loadReading(readings, id)).birth, birth);
});

test("a refused (unpaid) chart keeps nothing", async () => {
  const readings = memoryStore();
  const res = await handleChart({
    body: JSON.stringify({ birth: { ...BIRTH, place: "Chicago, Illinois" } }),
    ip: "1.2.3.5",
    now: T0,
    store: counterStore(),
    engine: fakeEngine(),
    grantSecret: randomBytes(32).toString("hex"),
    paywall: true,
    readings,
  });
  assert.equal(res.status, 402);
  assert.equal(readings.m.size, 0);
});
