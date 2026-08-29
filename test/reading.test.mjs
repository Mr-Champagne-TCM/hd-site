import { test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import {
  LINK_TTL_SECONDS,
  READING_TTL_SECONDS,
  fillReading,
  loadReading,
  mintReadingLink,
  nameCase,
  newReadingId,
  readReadingLink,
  readingIdForSession,
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
  assert.equal((await loadReading(store, id)).buyer.email, null);
});

/**
 * THE FIVE THINGS KEPT ABOUT A BUYER, named by Jeremy: name, email, phone, the
 * time of the purchase, and what was purchased. Not four, not six.
 *
 * Each has a job, which is why the list is asserted whole rather than
 * field-by-field as convenient. The name is how the page says whose reading
 * this is WITHOUT keeping a birthday -- an earlier draft of this module stored
 * only the email and concluded the page could not be labelled at all, which was
 * wrong, and wrong in the direction of asking for data that was never needed.
 */
test("the buyer is kept as exactly the five fields, and no others", async () => {
  const store = fakeStore();
  const now = Date.UTC(2026, 7, 28);
  const id = await saveReading(store, {
    tier: 1,
    output: OUTPUT,
    name: "Jeremy",
    email: "buyer@example.com",
    phone: "+15125550142",
    sku: "hd_chart",
    purchasedAt: now,
    now,
  });

  const raw = store.m.get(id);
  assert.deepEqual(Object.keys(raw.buyer).sort(), ["email", "name", "phone"]);
  assert.equal(raw.buyer.name, "Jeremy");
  assert.equal(raw.buyer.phone, "+15125550142");
  assert.equal(raw.sku, "hd_chart");
  assert.equal(raw.purchasedAt, Math.floor(now / 1000));

  // Nothing else about a person got in.
  assert.deepEqual(
    Object.keys(raw).sort(),
    ["buyer", "createdAt", "output", "purchasedAt", "sku", "tier", "v"],
  );
});

test("an extra field a caller passes does not reach the store", async () => {
  // Written field by field rather than spread, because a spread is how a field
  // nobody meant to keep ends up kept.
  const store = fakeStore();
  const id = await saveReading(store, {
    tier: 1,
    output: OUTPUT,
    name: "Jeremy",
    ip: "203.0.113.9",
    referrer: "https://example.com",
    cardLast4: "4242",
  });
  const raw = store.m.get(id);
  for (const smuggled of ["ip", "referrer", "cardLast4"]) {
    assert.equal(smuggled in raw, false, smuggled + " reached the store");
    assert.equal(smuggled in raw.buyer, false, smuggled + " reached the buyer block");
  }
});

test("blank and non-string buyer fields become null rather than empty strings", async () => {
  const store = fakeStore();
  const id = await saveReading(store, {
    tier: 0,
    output: OUTPUT,
    name: "   ",
    email: 42,
    phone: null,
  });
  assert.deepEqual((await loadReading(store, id)).buyer, { name: null, email: null, phone: null });
});

test("a reading written before the buyer block still yields its email", async () => {
  // v1 records carried a bare `email`. An early buyer must not lose the one
  // address a re-send could go to because the shape moved on.
  const store = fakeStore();
  const id = newReadingId();
  store.m.set(id, {
    v: 1,
    tier: 1,
    output: OUTPUT,
    email: "early@example.com",
    createdAt: Math.floor(Date.now() / 1000),
  });
  const back = await loadReading(store, id);
  assert.equal(back.buyer.email, "early@example.com");
  assert.equal(back.buyer.name, null);
});

test("the year runs from the PURCHASE, not from when the record was written", async () => {
  // A reading re-rendered after a fix keeps its purchase date. Measuring from
  // createdAt would silently hand that buyer another year.
  const store = fakeStore();
  const bought = Date.UTC(2026, 0, 1);
  const rerendered = bought + 300 * 24 * 60 * 60 * 1000;
  const id = await saveReading(store, {
    tier: 1,
    output: OUTPUT,
    purchasedAt: bought,
    now: rerendered,
  });

  const stillInside = bought + (READING_TTL_SECONDS - 60) * 1000;
  const past = bought + (READING_TTL_SECONDS + 60) * 1000;
  assert.ok(await loadReading(store, id, stillInside), "died before its year was up");
  assert.equal(await loadReading(store, id, past), null, "outlived its year by inheriting a later write");
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
  assert.equal(still.buyer.email, "b@example.com", "and the address to re-send to must survive too");
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

// --- a reading starts pending, and is filled exactly once -------------------
//
// The order runs backwards from what you would guess: somebody pays FIRST, and
// only then is there a form to enter a birth moment into. So a record exists
// from the moment the money settles, holding the receipt and no chart.

test("a reading created at purchase is pending, and says so", async () => {
  const store = fakeStore();
  const id = await saveReading(store, { tier: 1, output: null, name: "Jeremy", email: "b@example.com" });
  const back = await loadReading(store, id);
  assert.equal(back.pending, true);
  assert.equal(back.output, null);
  // The receipt is there even though the chart is not.
  assert.equal(back.buyer.name, "Jeremy");
  assert.equal(back.tier, 1);
});

test("PENDING AND NON-EXISTENT ARE DIFFERENT THINGS", async () => {
  // One means "enter your details", the other means "this link is not real".
  // Confusing them would either lose a paying customer or invite a stranger
  // into a form.
  const store = fakeStore();
  const pending = await saveReading(store, { tier: 1, output: null });
  assert.ok(await loadReading(store, pending), "a pending reading read as missing");
  assert.equal(await loadReading(store, newReadingId()), null);
});

test("a record with NO output key at all is corrupt, not pending", async () => {
  // Absent was never written by saveReading. Serving it as pending would invite
  // somebody to enter a birth moment into a record we do not understand.
  const store = fakeStore();
  const id = newReadingId();
  store.m.set(id, { v: 1, tier: 1, buyer: {}, createdAt: 0 });
  assert.equal(await loadReading(store, id), null);
});

test("filling a pending reading works, and it stops being pending", async () => {
  const store = fakeStore();
  const id = await saveReading(store, { tier: 1, output: null, name: "Jeremy", email: "b@example.com" });
  const r = await fillReading(store, id, OUTPUT);
  assert.equal(r.ok, true);

  const back = await loadReading(store, id);
  assert.equal(back.pending, false);
  assert.deepEqual(back.output, OUTPUT);
  assert.equal(back.buyer.name, "Jeremy", "the receipt survived the fill");
});

test("A FILLED READING CANNOT BE REFILLED", async () => {
  // Otherwise anybody holding the link could replace somebody's chart with one
  // cast from a birth moment of their choosing -- silently, on a reading that
  // had already been delivered and read.
  const store = fakeStore();
  const id = await saveReading(store, { tier: 1, output: null, name: "Jeremy" });
  await fillReading(store, id, OUTPUT);

  const second = await fillReading(store, id, { type: "Projector", profile: "1/3" });
  assert.equal(second.ok, false);
  assert.equal(second.reason, "already_filled");
  assert.deepEqual((await loadReading(store, id)).output, OUTPUT, "the chart was overwritten");
});

test("filling something that does not exist is a reason, not a crash", async () => {
  assert.deepEqual(await fillReading(fakeStore(), newReadingId(), OUTPUT), {
    ok: false,
    reason: "not_found",
  });
});

test("birth data cannot get in through fillReading either", async () => {
  const store = fakeStore();
  const id = await saveReading(store, { tier: 1, output: null });
  for (const field of ["date", "utc", "place"]) {
    await assert.rejects(() => fillReading(store, id, { ...OUTPUT, [field]: "x" }), /birth data/);
  }
  assert.equal((await loadReading(store, id)).pending, true, "a refused fill still changed the record");
});

test("the purchase year is unchanged by filling it later", async () => {
  const store = fakeStore();
  const bought = Date.UTC(2026, 0, 1);
  const id = await saveReading(store, { tier: 1, output: null, purchasedAt: bought, now: bought });
  // They pay, then wander off for a month before entering their details.
  await fillReading(store, id, OUTPUT, bought + 30 * 24 * 60 * 60 * 1000);

  const back = await loadReading(store, id, bought + 60_000);
  assert.equal(back.purchasedAt, Math.floor(bought / 1000), "the purchase date moved");
  assert.equal(await loadReading(store, id, bought + (READING_TTL_SECONDS + 60) * 1000), null);
});

test("undefined output is a caller bug, not a silent pending", async () => {
  await assert.rejects(
    () => saveReading(fakeStore(), { tier: 1 }),
    /must be an object or null/,
  );
});

// --- the buyer's name, capitalised once, at the store -----------------------

test("a name typed in lower case is capitalised", () => {
  assert.equal(nameCase("asdf asdf"), "Asdf Asdf");
  assert.equal(nameCase("jeremy champagne"), "Jeremy Champagne");
});

test("terms break on hyphens and apostrophes, not just spaces", () => {
  // Jeremy asked for O'Brien by spelling it that way.
  assert.equal(nameCase("o'brien"), "O'Brien");
  assert.equal(nameCase("mary-jane smith"), "Mary-Jane Smith");
  assert.equal(nameCase("van der belt"), "Van Der Belt");
  // A curly apostrophe is the one a phone actually types.
  assert.equal(nameCase("o\u2019brien"), "O\u2019Brien");
});

test("THE REST OF EACH TERM IS LEFT ALONE", () => {
  // A naive title-case flattens half the surnames in Scotland and Ireland.
  assert.equal(nameCase("McDonald"), "McDonald");
  assert.equal(nameCase("MacLeod"), "MacLeod");
  assert.equal(nameCase("van der BERG"), "Van Der BERG");
  assert.equal(nameCase("JEREMY"), "JEREMY", "shouting is not ours to correct");
});

test("whitespace is tidied without changing the name", () => {
  assert.equal(nameCase("  spaced   out "), "Spaced Out");
});

test("a missing or unusable name is null, never a crash or an empty string", () => {
  for (const bad of ["", "   ", null, undefined, 42, {}, []]) {
    assert.equal(nameCase(bad), null, JSON.stringify(bad) + " produced something");
  }
});

test("names outside the Latin alphabet are not mangled", () => {
  // \p{L} covers them, and a script with no case is returned unchanged.
  assert.equal(nameCase("陈"), "陈");
  assert.equal(nameCase("élodie martin"), "Élodie Martin");
});

test("the store capitalises, so nothing downstream has to", async () => {
  // Three surfaces show this name -- the email, the reading page and the entry
  // form. Capitalising in three places is how they come to disagree.
  const store = fakeStore();
  const id = await saveReading(store, { tier: 1, output: OUTPUT, name: "o'brien mary-jane" });
  assert.equal((await loadReading(store, id)).buyer.name, "O'Brien Mary-Jane");
});

test("AN INNER CAPITAL IS PRESERVED, NEVER INVENTED", async () => {
  // The first version of the test above asserted that `mcdonald` becomes
  // `McDonald`. It does not, and it should not: raising the first letter of a
  // term is a rule; knowing that this particular m wants a capital D four
  // letters later is a guess, and it would be wrong on `macey` and `mcguffin`
  // does not exist.
  //
  // So `McDonald` survives being typed, and `mcdonald` becomes `Mcdonald`.
  // The person who cares about their own capitals types them.
  assert.equal(nameCase("McDonald"), "McDonald");
  assert.equal(nameCase("mcdonald"), "Mcdonald");

  const store = fakeStore();
  const id = await saveReading(store, { tier: 1, output: OUTPUT, name: "McDonald" });
  assert.equal((await loadReading(store, id)).buyer.name, "McDonald");
});

/**
 * ONE PAYMENT BUYS ONE READING, however many times the claim runs.
 *
 * The Stripe session id travels in the success URL, so it lives in the buyer's
 * own history and can be sent to /api/claim again -- by a reload, a restored
 * tab, a bookmark, or deliberately. Before this, every claim minted a fresh
 * random reading and sent another delivery email: one payment, unlimited
 * copies, and a store that grows for free.
 *
 * The id is derived from the session instead, so the second claim computes the
 * same id, finds the first one's work, and writes nothing.
 */
test("A REPEATED CLAIM CANNOT MINT A SECOND READING", async () => {
  const store = fakeStore();
  const session = "cs_test_" + randomBytes(12).toString("hex");

  const first = readingIdForSession(session, SECRET);
  await saveReading(store, { id: first, tier: 1, output: null, name: "Grace Hopper", email: "g@example.invalid" });

  // The same payment, claimed again.
  const second = readingIdForSession(session, SECRET);
  assert.equal(second, first, "the same session produced two different readings");

  const found = await loadReading(store, second);
  assert.ok(found, "the second claim could not see the first one's reading");
  assert.equal(found.tier, 1);
});

test("a different payment is a different reading", () => {
  const a = readingIdForSession("cs_test_aaa", SECRET);
  const b = readingIdForSession("cs_test_bbb", SECRET);
  assert.notEqual(a, b);
});

test("the id is not computable without the secret, because it travels in a URL", () => {
  const mine = readingIdForSession("cs_test_aaa", SECRET);
  const theirs = readingIdForSession("cs_test_aaa", "a different secret entirely");
  assert.notEqual(mine, theirs, "anyone holding a session id could compute the storage key");
});

test("a session-derived id is the same shape as a random one", () => {
  // Every id check in this module, and every reading already in the store,
  // has to stay exactly as valid as it was.
  assert.match(readingIdForSession("cs_test_aaa", SECRET), /^[0-9a-f]{32}$/);
  assert.match(newReadingId(), /^[0-9a-f]{32}$/);
});

test("saveReading refuses an id that is not the right shape", async () => {
  const store = fakeStore();
  await assert.rejects(
    () => saveReading(store, { id: "nope", tier: 0, output: null }),
    /bad id/,
  );
});
