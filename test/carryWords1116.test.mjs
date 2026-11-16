import { test } from "node:test";
import assert from "node:assert/strict";
import { interpretOne, wordsToCarry } from "../netlify/lib/interpretJob.mjs";
import { saveReading, fillReading, fillInterpretation, loadReading } from "../netlify/lib/reading.mjs";
import { TEXT } from "./support/tier2Fixture.mjs";

/**
 * THE READING THEY ALREADY HAVE (Jeremy 11/16: "Go on all fixes").
 *
 * Someone who owns the written reading and books the one-to-one gets a new record. Its words are the ones they
 * already have -- the writer is not asked again -- when the chart is the same. Anything else is written fresh.
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
const BIRTH = { date: "1972-06-18", time: "14:30", timeKnown: true, zone: "America/Chicago", place: "Duluth, Minnesota, United States" };

function fakeStore() {
  const data = new Map();
  return {
    data,
    async setJSON(key, value) {
      data.set(key, JSON.parse(JSON.stringify(value)));
    },
    async get(key) {
      return data.get(key) ?? null;
    },
    async list() {
      return { blobs: [...data.keys()].map((key) => ({ key })) };
    },
  };
}

/** A filled record; `words` writes its reading too. */
async function record(store, { tier = 2, sku = "reading", grewFrom = null, output = OUTPUT, birth = BIRTH, words = null }) {
  const id = await saveReading(store, { tier, output: null, name: "Sage Testwell", email: "buyer@example.com", phone: null, sku, purchasedAt: Date.now(), grewFrom });
  await fillReading(store, id, output, Date.now(), birth);
  if (words) await fillInterpretation(store, id, words);
  return id;
}

const never = async () => {
  throw new Error("the writer was asked");
};
const job = (store, id, extra = {}) => ({
  id,
  store,
  health: fakeStore(),
  apiKey: "k",
  grantSecret: "s".repeat(32),
  origin: "https://x",
  generate: never,
  ...extra,
});

test("a one-to-one bought by a reading's owner carries the reading they have: the writer is not asked", async () => {
  const store = fakeStore();
  const first = await record(store, { words: TEXT });
  const session = await record(store, { sku: "hd_session", grewFrom: first });
  const emails = [];
  const r = await interpretOne(job(store, session, { deliver: { email: async (m) => emails.push(m) } }));
  assert.equal(r.ok, true);
  assert.equal(r.carried, true);
  assert.equal(r.asks, 0);
  assert.equal((await loadReading(store, session)).reading, (await loadReading(store, first)).reading, "word for word");
  // They are still told, and the email knows it is a one-to-one (the booking link rides on `session`).
  assert.equal(emails.length, 1);
  assert.equal(emails[0].session, true);
});

test("a plain reading's ready email is not a one-to-one's", async () => {
  const store = fakeStore();
  const id = await record(store, {});
  const emails = [];
  await interpretOne(job(store, id, { generate: async () => ({ ok: true, text: TEXT }), deliver: { email: async (m) => emails.push(m) } }));
  assert.equal(emails[0].session, false);
});

test("details corrected on the way: the chart may have moved, so it is written fresh", async () => {
  const store = fakeStore();
  const first = await record(store, { words: TEXT });
  const moved = await record(store, { sku: "hd_session", grewFrom: first, birth: { ...BIRTH, time: "02:30" } });
  assert.equal(await wordsToCarry({ store, reading: await loadReading(store, moved) }), null);
  const other = await record(store, { sku: "hd_session", grewFrom: first, output: { ...OUTPUT, profile: "3/5" } });
  assert.equal(await wordsToCarry({ store, reading: await loadReading(store, other) }), null);
  let asked = 0;
  const r = await interpretOne(job(store, moved, { generate: async () => (asked++, { ok: true, text: TEXT }) }));
  assert.equal(r.ok, true);
  assert.equal(asked, 1);
  assert.equal(r.carried, undefined);
});

test("nothing to carry from a chart, from an unwritten reading, or with no record behind it", async () => {
  const store = fakeStore();
  const chart = await record(store, { tier: 1, sku: "chart" });
  const fromChart = await record(store, { grewFrom: chart });
  assert.equal(await wordsToCarry({ store, reading: await loadReading(store, fromChart) }), null);
  const unwritten = await record(store, {});
  const fromUnwritten = await record(store, { sku: "hd_session", grewFrom: unwritten });
  assert.equal(await wordsToCarry({ store, reading: await loadReading(store, fromUnwritten) }), null);
  const alone = await record(store, {});
  assert.equal(await wordsToCarry({ store, reading: await loadReading(store, alone) }), null);
  const lost = await record(store, { sku: "hd_session", grewFrom: "0".repeat(32) });
  assert.equal(await wordsToCarry({ store, reading: await loadReading(store, lost) }), null);
});
