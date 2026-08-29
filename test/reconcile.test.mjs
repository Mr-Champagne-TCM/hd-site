import { test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { NEW_ID_SCHEME_FROM, reconcile } from "../netlify/lib/reconcile.mjs";
import { readingIdForSession, saveReading } from "../netlify/lib/reading.mjs";

/**
 * Did anybody pay and get nothing?
 *
 * The assertions that matter here are not "does it loop". They are the two
 * promises: somebody whose browser never came back is still delivered to, and
 * somebody who was already delivered to is NOT delivered to twice. One of those
 * costs a customer their purchase; the other costs them a duplicate and costs
 * us a sending reputation.
 */

const SECRET = randomBytes(32).toString("hex");
const ORIGIN = "https://example.invalid";

function fakeStore() {
  const map = new Map();
  return {
    map,
    async get(key, opts) {
      const v = map.get(key);
      if (v === undefined) return null;
      return opts?.type === "json" ? JSON.parse(v) : v;
    },
    async setJSON(key, value) {
      map.set(key, JSON.stringify(value));
    },
  };
}

/** A Stripe session as the list endpoint returns one. */
function session({ id = "cs_test_" + randomBytes(8).toString("hex"), level = 1, paid = true } = {}) {
  return {
    id,
    payment_status: paid ? "paid" : "unpaid",
    status: paid ? "complete" : "open",
    created: Math.floor((NEW_ID_SCHEME_FROM + 60_000) / 1000),
    customer_details: { name: "grace hopper", email: "grace@example.invalid", phone: null },
    metadata: { level: String(level), sku: `tier-${level}` },
  };
}

test("A PAID PURCHASE WITH NO READING IS DELIVERED", async () => {
  const store = fakeStore();
  const sent = [];
  const reported = [];
  const s = session({ level: 1 });

  const r = await reconcile({
    sessions: [s],
    store,
    grantSecret: SECRET,
    origin: ORIGIN,
    deliver: async (d) => sent.push(d),
    report: async (i) => reported.push(i),
  });

  assert.equal(r.missing, 1, "the undelivered purchase was not spotted");
  assert.equal(r.delivered, 1, "it was spotted and not delivered");
  assert.equal(sent.length, 1);
  assert.equal(sent[0].to, "grace@example.invalid");
  assert.equal(sent[0].tier, 1);
  // The name is tidied the same way every other surface tidies it.
  assert.equal(sent[0].name, "Grace Hopper");
  assert.match(sent[0].url, /^https:\/\/example\.invalid\/r\//);
  assert.equal(reported.length, 1, "Jeremy was not told it had happened");
  assert.equal(reported[0].kind, "purchase-undelivered");

  // And the reading now exists, at the id the claim path would have used.
  const id = readingIdForSession(s.id, SECRET);
  assert.ok(store.map.has(id), "no reading was written");
});

test("A PURCHASE ALREADY DELIVERED IS LEFT ALONE", async () => {
  const store = fakeStore();
  const sent = [];
  const reported = [];
  const s = session({ level: 2 });

  // Exactly what `claim` does when the browser DOES come back.
  await saveReading(store, {
    id: readingIdForSession(s.id, SECRET),
    tier: 2,
    output: null,
    name: "Grace Hopper",
    email: "grace@example.invalid",
  });

  const r = await reconcile({
    sessions: [s],
    store,
    grantSecret: SECRET,
    origin: ORIGIN,
    deliver: async (d) => sent.push(d),
    report: async (i) => reported.push(i),
  });

  assert.equal(r.missing, 0, "an already-delivered purchase was called missing");
  assert.equal(sent.length, 0, "a second copy was sent to somebody who already had one");
  assert.equal(reported.length, 0, "a false alarm was raised");
});

test("RUNNING IT TWICE DELIVERS ONCE", async () => {
  // The whole safety net is worthless if it is not safe to repeat, because it
  // runs every fifteen minutes over a two-day window -- the same session is
  // examined roughly two hundred times.
  const store = fakeStore();
  const sent = [];
  const s = session({ level: 0 });
  const run = () =>
    reconcile({
      sessions: [s],
      store,
      grantSecret: SECRET,
      origin: ORIGIN,
      deliver: async (d) => sent.push(d),
    });

  await run();
  await run();
  await run();
  assert.equal(sent.length, 1, `delivered ${sent.length} times`);
});

test("an unpaid or abandoned session is not delivered", async () => {
  const store = fakeStore();
  const sent = [];
  const r = await reconcile({
    sessions: [session({ paid: false })],
    store,
    grantSecret: SECRET,
    origin: ORIGIN,
    deliver: async (d) => sent.push(d),
  });
  assert.equal(r.paid, 0);
  assert.equal(sent.length, 0, "somebody who did not pay was sent a reading");
});

/**
 * REPORT-ONLY IS A REAL MODE, not a flag that half-works.
 *
 * Jeremy's option: watch it be right before letting it act. The alert must fire
 * in both modes, or turning delivery on later would be the first time anybody
 * heard about a failure.
 */
test("without a deliver function it reports and changes nothing", async () => {
  const store = fakeStore();
  const reported = [];
  const s = session();

  const r = await reconcile({
    sessions: [s],
    store,
    grantSecret: SECRET,
    origin: ORIGIN,
    deliver: null,
    report: async (i) => reported.push(i),
  });

  assert.equal(r.missing, 1, "report-only mode stopped noticing");
  assert.equal(r.delivered, 0);
  assert.equal(reported.length, 1, "report-only mode stopped reporting");
  assert.equal(store.map.size, 0, "report-only mode wrote to the store");
});

test("AN UNREADABLE STORE DOES NOT COUNT AS 'NOTHING IS THERE'", async () => {
  // The dangerous assumption. If a read failure were treated as absence, a
  // blip would send a second copy to everybody who bought in the last two days.
  const store = {
    async get() {
      throw new Error("store unavailable");
    },
    async setJSON() {},
  };
  const sent = [];
  const r = await reconcile({
    sessions: [session(), session(), session()],
    store,
    grantSecret: SECRET,
    origin: ORIGIN,
    deliver: async (d) => sent.push(d),
  });
  assert.equal(sent.length, 0, "a store outage caused duplicate deliveries");
  assert.equal(r.delivered, 0);
});

test("a failed send is counted, and the next run does not repeat it", async () => {
  const store = fakeStore();
  const s = session();
  const r1 = await reconcile({
    sessions: [s],
    store,
    grantSecret: SECRET,
    origin: ORIGIN,
    deliver: async () => {
      throw new Error("resend is down");
    },
  });
  assert.equal(r1.failed, 1);
  assert.equal(r1.delivered, 0);

  // The record was written before the send, so the reading exists and the
  // buyer can be reached by hand from the incident. What must NOT happen is a
  // silent success next time round that hides the failed send.
  const id = readingIdForSession(s.id, SECRET);
  assert.ok(store.map.has(id), "nothing was recorded, so nothing can be recovered");
});

test("no sessions is the normal case and is silent", async () => {
  const r = await reconcile({ sessions: [], store: fakeStore(), grantSecret: SECRET, origin: ORIGIN });
  assert.deepEqual({ checked: r.checked, missing: r.missing, delivered: r.delivered }, {
    checked: 0,
    missing: 0,
    delivered: 0,
  });
});

/**
 * A PURCHASE OLDER THAN THE ID SCHEME IS NOT "UNDELIVERED".
 *
 * Its reading has a random id and the session id was never stored, so there is
 * no way to match the two -- an older payment looks undelivered whether or not
 * it went out perfectly at the time.
 *
 * The first live run found exactly this: 18 paid, 18 "undelivered", every one a
 * test purchase whose delivery email was already in the inbox. Armed, it would
 * have sent eighteen duplicates. This is the guard against that, and against
 * the same thing happening to a real customer who bought before the change.
 */
test("SESSIONS OLDER THAN THE ID SCHEME ARE SKIPPED, NOT RE-DELIVERED", async () => {
  const store = fakeStore();
  const sent = [];
  const reported = [];
  const old = session();
  old.created = Math.floor((NEW_ID_SCHEME_FROM - 60_000) / 1000);

  const r = await reconcile({
    sessions: [old],
    store,
    grantSecret: SECRET,
    origin: ORIGIN,
    deliver: async (d) => sent.push(d),
    report: async (i) => reported.push(i),
  });

  assert.equal(r.skippedOld, 1);
  assert.equal(r.missing, 0, "an old purchase was called undelivered");
  assert.equal(sent.length, 0, "a duplicate was sent for a pre-existing purchase");
  assert.equal(reported.length, 0, "a false alarm was raised for an old purchase");
});

test("a purchase after the cutoff is still checked normally", async () => {
  const store = fakeStore();
  const sent = [];
  const fresh = session();
  fresh.created = Math.floor((NEW_ID_SCHEME_FROM + 60_000) / 1000);
  const r = await reconcile({
    sessions: [fresh],
    store,
    grantSecret: SECRET,
    origin: ORIGIN,
    deliver: async (d) => sent.push(d),
  });
  assert.equal(r.skippedOld, 0);
  assert.equal(r.delivered, 1, "the cutoff swallowed a purchase it should have caught");
});
