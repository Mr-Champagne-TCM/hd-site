import { test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { handleReading } from "../netlify/lib/readingHandler.mjs";
import { LINK_TTL_SECONDS, fillReading, mintReadingLink, newReadingId, saveReading } from "../netlify/lib/reading.mjs";

/**
 * Opening a reading link.
 *
 * The link is a bearer token with no login behind it, by design, so the
 * assertions worth writing are all about what a stranger holding a URL can get
 * -- and what a legitimate holder must NOT be handed along with their chart.
 */

const SECRET = randomBytes(32).toString("hex");
const OTHER = randomBytes(32).toString("hex");

function fakeStore() {
  const m = new Map();
  return {
    m,
    async setJSON(k, v) { m.set(k, JSON.parse(JSON.stringify(v))); },
    async get(k) { return m.has(k) ? m.get(k) : null; },
  };
}

const OUTPUT = { type: "Generator", profile: "3/5", channels: ["34-20"], bodygraphSvg: "<svg>x</svg>" };

const BUYER = {
  name: "Jeremy",
  email: "buyer@example.com",
  phone: "+15125550142",
  sku: "hd_chart",
};

async function seed(tier = 1, extra = {}) {
  const store = fakeStore();
  const id = await saveReading(store, { tier, output: OUTPUT, ...BUYER, ...extra });
  return { store, id, token: mintReadingLink({ id, tier }, SECRET) };
}

const open = async (store, token, now) =>
  handleReading({ body: JSON.stringify({ token }), store, secret: SECRET, now });

const parse = (res) => JSON.parse(res.body);

// --- the happy path, and what it does and does not carry --------------------

test("a good link returns the reading, labelled with the buyer's name", async () => {
  const { store, token } = await seed(1);
  const res = await open(store, token);
  assert.equal(res.status, 200);

  const body = parse(res);
  assert.equal(body.tier, 1);
  assert.equal(body.label, "The chart");
  assert.equal(body.name, "Jeremy");
  assert.deepEqual(body.output, OUTPUT);
});

test("THE EMAIL AND PHONE NEVER LEAVE THE SERVER", async () => {
  // A link is closer to guessable than an account is, and the blast radius of a
  // leaked one should be a chart, not an identity. The re-send button says
  // "send it to me" -- the address is chosen by the server, never by the page.
  const { store, token } = await seed(1);
  const res = await open(store, token);
  const raw = res.body;

  assert.doesNotMatch(raw, /buyer@example\.com/, "the email was returned to the browser");
  assert.doesNotMatch(raw, /5125550142/, "the phone was returned to the browser");
  assert.equal(parse(res).canResend, true, "but the page must still know a re-send is possible");
});

test("a reading with no email says a re-send is not possible", async () => {
  const { store, token } = await seed(1, { email: undefined });
  assert.equal(parse(await open(store, token)).canResend, false);
});

test("a reading stored without birth details sends none, and no birth line", async () => {
  const { store, token } = await seed(1);
  const raw = await open(store, token).then((r) => r.body);
  for (const leak of ["1985", "Chicago", '"date"', '"utc"', '"zone"', '"place"']) {
    assert.doesNotMatch(raw, new RegExp(leak, "i"), `${leak} appeared in a reading response`);
  }
  assert.equal(JSON.parse(raw).birthLine, null);
});

test("kept birth details reach the page only as the PDF's birth line (Jeremy 10/16)", async () => {
  // The raw fields stay on the server; the page gets the one sentence the PDF
  // prints under the name.
  const store = fakeStore();
  const id = await saveReading(store, { tier: 1, output: null, ...BUYER });
  await fillReading(store, id, OUTPUT, Date.now(), {
    date: "1976-12-14", time: "18:18", timeKnown: true, place: "Chicago, Illinois", zone: "America/Chicago",
  });
  const token = mintReadingLink({ id, tier: 1 }, SECRET);
  const raw = await open(store, token).then((r) => r.body);
  // No time zone printed since fix 20A (10/19); it is still kept, server-side.
  assert.equal(JSON.parse(raw).birthLine, "December 14, 1976 · 6:18 PM · Chicago, Illinois");
  for (const leak of ['"date"', '"zone"', '"place"', "America/Chicago", '"18:18"', "UTC-06"]) {
    assert.doesNotMatch(raw, new RegExp(leak), `${leak} appeared in a reading response`);
  }
});

test("17A: the name typed for the chart is kept with the birth details and titles the reading", async () => {
  const store = fakeStore();
  const id = await saveReading(store, { tier: 1, output: null, ...BUYER });
  await fillReading(store, id, OUTPUT, Date.now(), {
    date: "1976-12-14", time: "18:18", timeKnown: true, place: "Chicago, Illinois", zone: "America/Chicago",
    name: "  Mary  <b>Jane</b> ",
  });
  const kept = await store.get(id, { type: "json" });
  assert.equal(kept.birth.name, "Mary bJane/b", "the name is kept with the birth block, cleaned");
  assert.equal(kept.output.name, undefined, "the name never goes into the engine's output");
  const token = mintReadingLink({ id, tier: 1 }, SECRET);
  const body = JSON.parse(await open(store, token).then((r) => r.body));
  assert.equal(body.name, "Mary bJane/b");
});

test("17A: a pending reading offers the buyer's first name for the form", async () => {
  const store = fakeStore();
  const id = await saveReading(store, { tier: 2, output: null, ...BUYER });
  const token = mintReadingLink({ id, tier: 2 }, SECRET);
  const body = JSON.parse(await open(store, token).then((r) => r.body));
  assert.equal(body.pending, true);
  assert.equal(body.chartName, String(BUYER.name).split(" ")[0]);
});

test("9A: the PDF's page count is sent once there is a PDF, never while the words are being written", async () => {
  const store = fakeStore();
  const id = await saveReading(store, { tier: 1, output: null, ...BUYER });
  await fillReading(store, id, OUTPUT, Date.now());
  const token = mintReadingLink({ id, tier: 1 }, SECRET);
  const counted = [];
  const countPages = async (r) => (counted.push(r.tier), 3);
  const body = JSON.parse((await handleReading({ body: JSON.stringify({ token }), store, secret: SECRET, countPages })).body);
  assert.equal(body.pdfPages, 3);
  // A reading still being written has no PDF worth counting.
  const id2 = await saveReading(store, { tier: 2, output: null, ...BUYER });
  await fillReading(store, id2, OUTPUT, Date.now());
  const t2 = mintReadingLink({ id: id2, tier: 2 }, SECRET);
  const b2 = JSON.parse((await handleReading({ body: JSON.stringify({ token: t2 }), store, secret: SECRET, countPages })).body);
  assert.equal(b2.writing, true);
  assert.equal(b2.pdfPages, null);
  // A count that fails is no count, never a failed page.
  const b3 = JSON.parse(
    (await handleReading({ body: JSON.stringify({ token }), store, secret: SECRET, countPages: async () => { throw new Error("x"); } })).body,
  );
  assert.equal(b3.pdfPages, 3, "cached from the first count");
});

// --- the upgrade, per D-11 --------------------------------------------------

test("an upgrade is offered below the top tier", async () => {
  for (const [tier, expected] of [[0, "The chart"], [1, "The reading"]]) {
    const { store, token } = await seed(tier);
    const body = parse(await open(store, token));
    assert.equal(body.upgrade.level, tier + 1);
    assert.equal(body.upgrade.label, expected);
  }
});

test("NO upgrade is offered at the top tier, because there is nothing above it", async () => {
  const { store, token } = await seed(2);
  assert.equal(parse(await open(store, token)).upgrade, null);
});

test("the upgrade decision is made here, not left to the page", async () => {
  // A page that forgets to check must not be able to advertise something that
  // does not exist, and the email and the screen must give the same answer.
  const { store, token } = await seed(2);
  assert.doesNotMatch((await open(store, token)).body, /upgrade":\s*\{/);
});

// --- what a stranger gets ---------------------------------------------------

test("a forged signature and a missing reading are INDISTINGUISHABLE", async () => {
  // Otherwise the endpoint becomes a way to ask whether a given reading exists.
  const { store, id } = await seed(1);

  const forged = mintReadingLink({ id, tier: 1 }, OTHER);
  const nonexistent = mintReadingLink({ id: newReadingId(), tier: 1 }, SECRET);

  const a = await open(store, forged);
  const b = await open(store, nonexistent);

  assert.equal(a.status, 404);
  assert.equal(b.status, 404);
  assert.equal(a.body, b.body, "the two failures can be told apart");
});

test("a tier raised by hand in the link gets nothing", async () => {
  const { store, id } = await seed(0);
  // Signed honestly at tier 2 but pointing at a tier-0 reading: the closest a
  // forger gets if the secret ever leaked and they guessed an id.
  const res = await open(store, mintReadingLink({ id, tier: 2 }, SECRET));
  assert.equal(res.status, 404, "a tier mismatch served something");
});

test("an expired link says so, because that is the one failure a person can act on", async () => {
  const now = Date.UTC(2026, 0, 1);
  const store = fakeStore();
  const id = await saveReading(store, { tier: 1, output: OUTPUT, ...BUYER, now });
  const token = mintReadingLink({ id, tier: 1, now }, SECRET);

  const res = await open(store, token, now + (LINK_TTL_SECONDS + 60) * 1000);
  assert.equal(res.status, 410);
  const body = parse(res);
  assert.equal(body.error.code, "link_expired");
  // And it must say the reading survives, or it reads as "your purchase is gone".
  assert.match(body.error.message, /kept for a year/);
  assert.match(body.error.message, /sent to you again/);
});

test("rubbish never throws, it answers", async () => {
  const { store } = await seed(1);
  for (const body of ["", "{", "null", "[]", '{"token":null}', '{"token":42}', '{"nope":1}']) {
    const res = await handleReading({ body, store, secret: SECRET });
    assert.ok(res.status >= 400 && res.status < 500, `${body} produced ${res.status}`);
    assert.ok(parse(res).error.code, "failed without a code");
  }
});

test("a missing secret is a 503, not a way in", async () => {
  const { store, token } = await seed(1);
  const res = await handleReading({ body: JSON.stringify({ token }), store, secret: "" });
  assert.equal(res.status, 503);
  assert.equal(parse(res).error.code, "misconfigured");
});

test("a store that is down is a failure, never an empty reading", async () => {
  const angry = { async setJSON() {}, async get() { throw new Error("blobs are down"); } };
  const token = mintReadingLink({ id: newReadingId(), tier: 1 }, SECRET);
  const res = await handleReading({ body: JSON.stringify({ token }), store: angry, secret: SECRET });
  // 10/16: still a failure, never an empty reading -- but OURS. It used to be
  // the 404 "that link could not be opened", which told a buyer holding a good
  // link that their link was the problem.
  assert.equal(res.status, 503);
  assert.equal(JSON.parse(res.body).error.key, "reading-unavailable");
});

// --- caching ----------------------------------------------------------------

test("a reading is never cached by anything in between", async () => {
  const { store, token } = await seed(1);
  const res = await open(store, token);
  assert.match(res.headers["Cache-Control"], /no-store/);
  assert.match(res.headers["Cache-Control"], /private/);
});

test("every error is uncacheable too, so a 404 cannot stick to a good link", async () => {
  const { store } = await seed(1);
  const res = await open(store, mintReadingLink({ id: newReadingId(), tier: 1 }, SECRET));
  assert.match(res.headers["Cache-Control"], /no-store/);
});

// --- a reading that has been paid for but not yet computed ------------------
//
// The ordinary state of every purchase for the minute or two between the card
// and the form. It is not an error and must not look like one.

test("a pending reading says so, and carries no chart", async () => {
  const store = fakeStore();
  const id = await saveReading(store, { tier: 1, output: null, ...BUYER });
  const token = mintReadingLink({ id, tier: 1 }, SECRET);

  const body = parse(await open(store, token));
  assert.equal(body.pending, true);
  assert.equal(body.output, null);
  assert.equal(body.name, "Jeremy", "the receipt is there even though the chart is not");
  assert.equal(body.label, "The chart");
});

test("NO UPGRADE IS OFFERED BEFORE THEY HAVE SEEN WHAT THEY BOUGHT", async () => {
  // Selling the next tier to somebody still waiting on the first reads as a
  // shop rather than a threshold, which is the register this site avoids.
  const store = fakeStore();
  const id = await saveReading(store, { tier: 0, output: null, ...BUYER });
  const body = parse(await open(store, mintReadingLink({ id, tier: 0 }, SECRET)));
  assert.equal(body.pending, true);
  assert.equal(body.upgrade, null, "an upgrade was offered on a reading with nothing in it yet");
});

test("a filled reading is explicitly NOT pending", async () => {
  // Absent would be falsy and would work by accident. The page branches on
  // this, so it is stated rather than implied.
  const { store, token } = await seed(1);
  const body = parse(await open(store, token));
  assert.equal(body.pending, false);
});
