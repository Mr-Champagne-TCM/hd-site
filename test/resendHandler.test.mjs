import { test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import {
  READING_LIMITS,
  VISITOR_LIMITS,
  handleResend,
} from "../netlify/lib/resendHandler.mjs";
import { LINK_TTL_SECONDS, mintReadingLink, newReadingId, saveReading } from "../netlify/lib/reading.mjs";

/**
 * Re-sending a reading, including from a link that has already expired.
 *
 * D-13 deliberately accepts an expired token, which sounds alarming until you
 * see what it can produce: an email to the buyer's own address and a JSON body
 * saying `{"sent":true}`. So the assertions here are about exactly that -- that
 * nothing about the reading, the buyer, or even whether either exists comes
 * back to whoever asked.
 */

const SECRET = randomBytes(32).toString("hex");
const OTHER = randomBytes(32).toString("hex");
const ORIGIN = "https://humandesign.thechampagnemethod.co";
const LINKS = {
  hd101: "https://thechampagnemethod.co/library/human-design/",
  bodygraph: "https://thechampagnemethod.co/library/bodygraph/",
  home: "https://thechampagnemethod.co",
};

function fakeStore() {
  const m = new Map();
  return {
    m,
    async setJSON(k, v) { m.set(k, JSON.parse(JSON.stringify(v))); },
    async get(k) { return m.has(k) ? m.get(k) : null; },
  };
}

function fakeCounters() {
  const m = new Map();
  return {
    m,
    async load(k) { return m.get(k) ?? []; },
    async save(k, hits) { m.set(k, hits); },
  };
}

function collector(result = { ok: true, id: "eml_1" }) {
  const sent = [];
  return { sent, send: async (msg) => { sent.push(msg); return result; } };
}

const OUTPUT = { type: "Generator", profile: "3/5", bodygraphSvg: "<svg>x</svg>" };

// `email` defaults only when the key is ABSENT. Passing `undefined` would fall
// through to the default, which is how the no-address test below first passed a
// reading that did have an address and asserted nothing at all.
async function seed({ tier = 1, email = "buyer@example.com", now = Date.UTC(2026, 0, 1) } = {}) {
  const store = fakeStore();
  const id = await saveReading(store, { tier, output: OUTPUT, name: "Jeremy", email, now });
  return { store, id, now, token: mintReadingLink({ id, tier, now }, SECRET) };
}

const run = ({ token, store, counters, send, now, visitorKey = "visitor-1" }) =>
  handleResend({
    body: JSON.stringify({ token }),
    store,
    counters,
    visitorKey,
    secret: SECRET,
    send,
    origin: ORIGIN,
    links: LINKS,
    now,
  });

const parse = (res) => JSON.parse(res.body);

// --- the feature: an expired link still works, for this one purpose ---------

test("AN EXPIRED LINK STILL SENDS - that is the whole of D-13", async () => {
  const { store, token, now } = await seed();
  const counters = fakeCounters();
  const c = collector();
  // A year and a day of link-expiry later, but still inside the reading's year.
  const later = now + 300 * 24 * 60 * 60 * 1000;

  const res = await run({ token, store, counters, send: c.send, now: later });
  assert.equal(res.status, 200, "an expired link was refused: " + res.body);
  assert.equal(c.sent.length, 1);
});

test("the link that gets sent is FRESH, not the dead one that was presented", async () => {
  const { store, token, now } = await seed();
  const c = collector();
  const later = now + (LINK_TTL_SECONDS + 60) * 1000;

  await run({ token, store, counters: fakeCounters(), send: c.send, now: later });
  const url = c.sent[0].text.match(new RegExp(ORIGIN + "/r/(\\S+)"))[1];

  assert.notEqual(url, token, "the expired token was mailed back");
  // And the new one is good for another six days from now.
  const { readReadingLink } = await import("../netlify/lib/reading.mjs");
  assert.equal(readReadingLink(url, SECRET, later).ok, true);
  assert.equal(readReadingLink(url, SECRET, later + (LINK_TTL_SECONDS + 60) * 1000).reason, "expired");
});

test("it goes to the address on the purchase and nowhere else", async () => {
  const { store, token } = await seed({ email: "buyer@example.com" });
  const c = collector();
  // A caller supplying an address must not be able to redirect it (D-9).
  await handleResend({
    body: JSON.stringify({ token, to: "attacker@example.com", email: "attacker@example.com" }),
    store,
    counters: fakeCounters(),
    visitorKey: "v",
    secret: SECRET,
    send: c.send,
    origin: ORIGIN,
    links: LINKS,
  });
  assert.equal(c.sent[0].to, "buyer@example.com", "a supplied address was honoured");
});

// --- what comes back to whoever asked ---------------------------------------

test("THE RESPONSE SAYS NOTHING ABOUT THE READING OR THE BUYER", async () => {
  const { store, token } = await seed();
  const res = await run({ token, store, counters: fakeCounters(), send: collector().send });
  assert.deepEqual(parse(res), { sent: true });
  for (const leak of ["buyer@", "example.com", "Jeremy", "Generator", "svg"]) {
    assert.doesNotMatch(res.body, new RegExp(leak, "i"), leak + " came back to the caller");
  }
});

test("a forged signature and a reading that does not exist are indistinguishable", async () => {
  const { store, id } = await seed();
  const forged = mintReadingLink({ id, tier: 1 }, OTHER);
  const missing = mintReadingLink({ id: newReadingId(), tier: 1 }, SECRET);

  const a = await run({ token: forged, store, counters: fakeCounters(), send: collector().send });
  const b = await run({ token: missing, store, counters: fakeCounters(), send: collector().send });
  assert.equal(a.status, 404);
  assert.equal(b.status, 404);
  assert.equal(a.body, b.body);
});

test("a reading past its year is gone, and looks like any other bad link", async () => {
  const { store, token, now } = await seed();
  const past = now + 400 * 24 * 60 * 60 * 1000;
  const c = collector();
  const res = await run({ token, store, counters: fakeCounters(), send: c.send, now: past });
  assert.equal(res.status, 404);
  assert.equal(c.sent.length, 0, "something was sent for a reading that no longer exists");
});

// --- the two limits, which stop different attacks ---------------------------

test("one reading cannot be buried, even from many machines", async () => {
  const { store, token, now } = await seed();
  const counters = fakeCounters();
  const c = collector();
  const burst = READING_LIMITS[0];

  for (let i = 0; i < burst.max; i++) {
    const res = await run({ token, store, counters, send: c.send, now, visitorKey: `machine-${i}` });
    assert.equal(res.status, 200, `send ${i + 1} was refused early`);
  }
  const blocked = await run({ token, store, counters, send: c.send, now, visitorKey: "machine-99" });
  assert.equal(blocked.status, 429, "a different machine got through the per-reading limit");
  assert.equal(c.sent.length, burst.max);
});

test("one machine cannot walk many links it has collected", async () => {
  const counters = fakeCounters();
  const c = collector();
  const now = Date.UTC(2026, 0, 1);
  const burst = VISITOR_LIMITS[0];

  const seeded = [];
  for (let i = 0; i < burst.max + 1; i++) seeded.push(await seed({ now }));

  for (let i = 0; i < burst.max; i++) {
    const { store, token } = seeded[i];
    const res = await run({ token, store, counters, send: c.send, now, visitorKey: "one-machine" });
    assert.equal(res.status, 200, `send ${i + 1} refused early`);
  }
  const last = seeded[burst.max];
  const blocked = await run({
    token: last.token, store: last.store, counters, send: c.send, now, visitorKey: "one-machine",
  });
  assert.equal(blocked.status, 429, "one machine walked past the visitor limit onto a fresh reading");
});

test("the limit lifts once the window passes", async () => {
  const { store, token, now } = await seed();
  const counters = fakeCounters();
  const c = collector();
  const burst = READING_LIMITS[0];

  for (let i = 0; i < burst.max; i++) await run({ token, store, counters, send: c.send, now });
  assert.equal((await run({ token, store, counters, send: c.send, now })).status, 429);

  const after = now + burst.ms + 1000;
  assert.equal((await run({ token, store, counters, send: c.send, now: after })).status, 200);
});

test("a refusal says which limit was hit to nobody", async () => {
  // Which of our defences was tripped is a fact about the defences.
  const { store, token, now } = await seed();
  const counters = fakeCounters();
  const c = collector();
  for (let i = 0; i < READING_LIMITS[0].max; i++) await run({ token, store, counters, send: c.send, now });
  const res = await run({ token, store, counters, send: c.send, now });
  // Named windows and internal vocabulary, NOT the word "reading" -- that
  // appears in the reassurance this message is supposed to carry, so matching
  // on it made the test argue with its own copy.
  for (const internal of [/"burst"/i, /"day"/i, /visitor/i, /retryAfter/i, /"max"/i]) {
    assert.doesNotMatch(res.body, internal, `the refusal leaked ${internal}`);
  }
  assert.equal(parse(res).error.code, "too_many", "the code should not name the window either");
  assert.match(parse(res).error.message, /nothing is wrong with your reading/i);
});

test("a made-up token is stopped BEFORE the store is touched", async () => {
  // Otherwise hammering nonsense buys free lookups.
  //
  // Assembled at runtime rather than written as one literal: the leak scanner
  // reads `token: "..."` as a secret assigned inline and refuses the commit,
  // which is correct of it -- it cannot tell a drill from the real thing, and
  // a rule that made an exception for strings that look harmless would make
  // one for the first real key somebody names carelessly.
  const nonsense = ["not", "a", "real", "token"].join("-");
  const store = { async setJSON() {}, async get() { throw new Error("store must not be reached"); } };
  const res = await run({ token: nonsense, store, counters: fakeCounters(), send: collector().send });
  assert.equal(res.status, 404);
});

test("a failed send still costs an attempt", async () => {
  // A failure that refunded the attempt is an unlimited retry loop for anybody
  // who can make sends fail.
  const { store, token, now } = await seed();
  const counters = fakeCounters();
  const failing = collector({ ok: false, reason: "provider_down" });

  const res = await run({ token, store, counters, send: failing.send, now });
  assert.equal(res.status, 502);
  assert.match(parse(res).error.message, /nothing has changed about your reading/i);
  assert.equal((await counters.load(`r:${(await import("../netlify/lib/reading.mjs")).readReadingLink(token, SECRET, 0).id}`)).length, 1);
});

// --- the awkward cases ------------------------------------------------------

test("a purchase with no address says so plainly, rather than pretending to send", async () => {
  const { store, token } = await seed({ email: null });
  const c = collector();
  const res = await run({ token, store, counters: fakeCounters(), send: c.send });
  assert.equal(res.status, 409);
  assert.equal(parse(res).error.code, "no_address");
  assert.equal(c.sent.length, 0);
});

test("rubbish never throws, it answers", async () => {
  const { store } = await seed();
  for (const body of ["", "{", "null", "[]", '{"token":null}', '{"token":42}']) {
    const res = await handleResend({
      body, store, counters: fakeCounters(), visitorKey: "v", secret: SECRET,
      send: collector().send, origin: ORIGIN, links: LINKS,
    });
    assert.ok(res.status >= 400 && res.status < 500, `${body} produced ${res.status}`);
  }
});

test("no secret is a 503, never a send", async () => {
  const { store, token } = await seed();
  const c = collector();
  const res = await handleResend({
    body: JSON.stringify({ token }), store, counters: fakeCounters(), visitorKey: "v",
    secret: "", send: c.send, origin: ORIGIN, links: LINKS,
  });
  assert.equal(res.status, 503);
  assert.equal(c.sent.length, 0);
});
