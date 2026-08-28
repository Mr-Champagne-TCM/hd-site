import { test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import {
  LINK_TTL_SECONDS,
  READING_TTL_SECONDS,
  loadReading,
  mintReadingLink,
  newReadingId,
  readReadingLink,
  saveReading,
} from "../netlify/lib/reading.mjs";

/**
 * The kept reading, and the one link that reaches it.
 *
 * The assertions that matter here are not "does it round-trip". They are the
 * three promises this layer makes to somebody who paid: their birth details
 * are NOT in the store, a stranger cannot reach their reading, and a link that
 * has died does not take the reading with it.
 */

/**
 * Generated, never written down -- the same rule grant.test.mjs follows, and
 * the leak scanner enforced it on the first draft of this file. A repo with no
 * secrets in it should have no strings that LOOK like secrets either, because
 * the day one is real is the day nobody re-reads the line.
 */
const SECRET = randomBytes(32).toString("hex");
const OTHER = randomBytes(32).toString("hex");

/** A store shaped like Netlify Blobs, kept in a Map. */
function fakeStore() {
  const m = new Map();
  return {
    m,
    async setJSON(k, v) {
      m.set(k, JSON.parse(JSON.stringify(v)));
    },
    async get(k) {
      return m.has(k) ? m.get(k) : null;
    },
  };
}

const OUTPUT = {
  type: "Generator",
  profile: "3/5",
  definedCenters: ["Sacral", "Throat"],
  channels: ["34-20"],
  bodygraphSvg: "<svg>...</svg>",
};

const b64urlOf = (s) =>
  Buffer.from(s).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

const payloadOf = (token) =>
  JSON.parse(
    Buffer.from(token.split(".")[0].replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8"),
  );

// --- what is kept ----------------------------------------------------------

test("the engine output is kept whole, not picked over", async () => {
  const store = fakeStore();
  const id = await saveReading(store, { tier: 1, output: OUTPUT, email: "buyer@example.com" });
  const back = await loadReading(store, id);
  assert.deepEqual(back.output, OUTPUT, "a field this module does not know about must survive");
  assert.equal(back.tier, 1);
});

test("BIRTH DATA IS REFUSED, loudly, rather than stored quietly", async () => {
  // The privacy copy says the details are used and discarded. If one ever
  // reaches this function it is a bug upstream, and storing it would make that
  // copy false without anything going red.
  const store = fakeStore();
  for (const field of ["date", "time", "zone", "utc", "birth", "place", "lat", "lon"]) {
    await assert.rejects(
      () => saveReading(store, { tier: 1, output: { ...OUTPUT, [field]: "x" } }),
      /birth data/,
      field + " was accepted into the store",
    );
  }
  assert.equal(store.m.size, 0, "something was written despite the refusal");
});

test("a reading with no email is allowed - a re-send simply has nowhere to go", async () => {
  const store = fakeStore();
  const id = await saveReading(store, { tier: 0, output: OUTPUT });
  assert.equal((await loadReading(store, id)).email, null);
});

// --- who can reach it ------------------------------------------------------

test("an id is 128 bits of CSPRNG and they do not repeat", () => {
  const seen = new Set();
  for (let i = 0; i < 500; i++) {
    const id = newReadingId();
    assert.match(id, /^[0-9a-f]{32}$/);
    assert.equal(seen.has(id), false, "a reading id repeated");
    seen.add(id);
  }
});

test("a link opens exactly the reading it was minted for", () => {
  const id = newReadingId();
  const r = readReadingLink(mintReadingLink({ id, tier: 2 }, SECRET), SECRET);
  assert.equal(r.ok, true);
  assert.equal(r.id, id);
  assert.equal(r.tier, 2);
});

test("a link signed with another secret is refused", () => {
  const link = mintReadingLink({ id: newReadingId(), tier: 1 }, OTHER);
  const r = readReadingLink(link, SECRET);
  assert.equal(r.ok, false);
  assert.equal(r.reason, "bad_signature");
});

test("editing the tier in a link invalidates it - it cannot be upgraded by hand", () => {
  const link = mintReadingLink({ id: newReadingId(), tier: 0 }, SECRET);
  const mac = link.split(".")[1];
  const payload = payloadOf(link);
  payload.t = 2;
  const r = readReadingLink(b64urlOf(JSON.stringify(payload)) + "." + mac, SECRET);
  assert.equal(r.ok, false, "a hand-edited tier was accepted");
  assert.equal(r.reason, "bad_signature");
});

test("editing the reading id in a link invalidates it - no walking the store", () => {
  const link = mintReadingLink({ id: newReadingId(), tier: 1 }, SECRET);
  const [body, mac] = link.split(".");
  assert.equal(readReadingLink(body.slice(0, -2) + "aa." + mac, SECRET).ok, false);
});

test("rubbish in never throws, it answers", () => {
  for (const bad of [undefined, null, "", "x", "a.b", ".", "x.".repeat(600), 42, {}]) {
    const r = readReadingLink(bad, SECRET);
    assert.equal(r.ok, false, JSON.stringify(bad) + " was accepted");
    assert.equal(typeof r.reason, "string");
  }
});

test("no secret means no link, in both directions", () => {
  assert.throws(() => mintReadingLink({ id: newReadingId(), tier: 1 }, ""), /no secret/);
  assert.equal(readReadingLink("a.b", "").reason, "misconfigured");
});

// --- the two clocks, which are different on purpose (D-9d) -----------------

test("the link is six days and the reading is a year", () => {
  assert.equal(LINK_TTL_SECONDS, 6 * 24 * 60 * 60);
  assert.equal(READING_TTL_SECONDS, 365 * 24 * 60 * 60);
  assert.ok(READING_TTL_SECONDS > LINK_TTL_SECONDS * 50, "the purchase must outlive the link by a lot");
});

test("an expired link is refused", () => {
  const now = Date.UTC(2026, 0, 1);
  const link = mintReadingLink({ id: newReadingId(), tier: 1, now }, SECRET);
  assert.equal(readReadingLink(link, SECRET, now + LINK_TTL_SECONDS * 1000 - 1000).ok, true);
  assert.equal(readReadingLink(link, SECRET, now + LINK_TTL_SECONDS * 1000 + 1000).reason, "expired");
});

test("A DEAD LINK DOES NOT KILL THE READING - that is what a re-send is for", async () => {
  const store = fakeStore();
  const now = Date.UTC(2026, 0, 1);
  const id = await saveReading(store, { tier: 1, output: OUTPUT, email: "b@example.com", now });

  const link = mintReadingLink({ id, tier: 1, now }, SECRET);
  const wayLater = now + 300 * 24 * 60 * 60 * 1000;

  assert.equal(readReadingLink(link, SECRET, wayLater).reason, "expired", "the link should be long dead");
  const still = await loadReading(store, id, wayLater);
  assert.ok(still, "the reading died with its link, which is the wrong lifetime");
  assert.equal(still.email, "b@example.com", "and the address to re-send to must survive too");
});

test("a reading past its year is not served, even though it is still in the bucket", async () => {
  const store = fakeStore();
  const now = Date.UTC(2026, 0, 1);
  const id = await saveReading(store, { tier: 1, output: OUTPUT, now });
  const overdue = now + (READING_TTL_SECONDS + 60) * 1000;
  assert.equal(await loadReading(store, id, overdue), null);
  assert.equal(store.m.size, 1, "the test is only meaningful if it IS still in the bucket");
});

// --- what a broken or hostile request looks like ---------------------------

test("a made-up id is not loaded, and cannot be a path", async () => {
  const store = fakeStore();
  for (const bad of ["", "..", "../secrets", "ZZZ", "a".repeat(31), "a".repeat(33), null, 7]) {
    assert.equal(await loadReading(store, bad), null, JSON.stringify(bad) + " was looked up");
  }
});

test("a store that throws is a missing reading, not a crash", async () => {
  const angry = {
    async setJSON() {},
    async get() {
      throw new Error("blob store is down");
    },
  };
  assert.equal(await loadReading(angry, newReadingId()), null);
});

test("a corrupt record is refused rather than half-rendered", async () => {
  const store = fakeStore();
  const id = newReadingId();
  for (const junk of [null, "a string", {}, { tier: 1 }, { output: OUTPUT }, { tier: "1", output: OUTPUT }]) {
    store.m.set(id, junk);
    assert.equal(await loadReading(store, id), null, JSON.stringify(junk) + " was served");
  }
});

test("a bad tier never reaches the store", async () => {
  const store = fakeStore();
  for (const tier of [-1, 3, 1.5, "1", null, undefined]) {
    await assert.rejects(() => saveReading(store, { tier, output: OUTPUT }), /bad tier/);
  }
  assert.equal(store.m.size, 0);
});
