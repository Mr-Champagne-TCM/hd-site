import { test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { mintGrant, readGrant, tierFor } from "../netlify/lib/grant.mjs";

/**
 * The entitlement boundary.
 *
 * These are the tests that decide whether paid work can be taken for free, so
 * they are written as attacks rather than as demonstrations. Each one is
 * something a stranger would actually try.
 */

// Generated per run rather than written down. A test does not need a literal
// to be deterministic -- it needs two secrets that differ -- and a repo with no
// key material in it, real or pretend, is one less thing to have to think about.
const SECRET = randomBytes(32).toString("hex");
const OTHER = randomBytes(32).toString("hex");

test("a freshly minted grant reads back at the tier it was minted for", () => {
  for (const tier of [0, 1, 2]) {
    const g = mintGrant({ tier, sku: `sku_${tier}` }, SECRET);
    const read = readGrant(g, SECRET);
    assert.equal(read.ok, true);
    assert.equal(read.tier, tier);
    assert.equal(read.sku, `sku_${tier}`);
  }
});

test("a grant signed with another secret is refused", () => {
  const g = mintGrant({ tier: 2 }, OTHER);
  assert.deepEqual(readGrant(g, SECRET), { ok: false, reason: "bad_signature" });
});

test("editing the tier upward invalidates the signature", () => {
  // The obvious attack: buy the cheapest thing, edit the payload, ask for the
  // dearest. The body is not encrypted -- it does not need to be. It needs to
  // be unforgeable.
  const g = mintGrant({ tier: 0, sku: "hd_summary" }, SECRET);
  const [body] = g.split(".");
  const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
  assert.equal(payload.t, 0, "precondition: the tier really is in the clear");

  payload.t = 2;
  const forgedBody = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const forged = `${forgedBody}.${g.split(".")[1]}`;

  assert.deepEqual(readGrant(forged, SECRET), { ok: false, reason: "bad_signature" });
});

test("an expired grant is refused", () => {
  const now = Date.now();
  const g = mintGrant({ tier: 1, ttlSeconds: 60, now }, SECRET);
  assert.equal(readGrant(g, SECRET, now + 59_000).ok, true);
  assert.deepEqual(readGrant(g, SECRET, now + 61_000), { ok: false, reason: "expired" });
});

test("rubbish is refused without throwing", () => {
  for (const junk of ["", ".", "a.", ".b", "no-dot", "a.b.c", "x".repeat(600), null, undefined, 42, {}]) {
    const r = readGrant(junk, SECRET);
    assert.equal(r.ok, false, `should refuse ${JSON.stringify(junk)}`);
    assert.ok(typeof r.reason === "string");
  }
});

test("a tier outside the three that exist cannot be minted", () => {
  for (const bad of [-1, 3, 1.5, "1", null]) {
    assert.throws(() => mintGrant({ tier: bad }, SECRET), /bad tier/);
  }
});

test("minting without a secret is an error, not a grant anyone can forge", () => {
  assert.throws(() => mintGrant({ tier: 0 }, ""), /no secret/);
});

/* ---------------------------------------------------------------------- */
/* The launch switch                                                       */
/* ---------------------------------------------------------------------- */

test("paywall off serves tier 0 and nothing more", () => {
  // Today's behaviour, and the point is the ceiling: an absent grant gets the
  // summary, never the chart.
  const r = tierFor({ token: undefined, paywall: false, secret: SECRET });
  assert.equal(r.tier, 0);
  assert.equal(r.via, "open");
});

test("paywall on serves nothing without a grant", () => {
  const r = tierFor({ token: undefined, paywall: true, secret: SECRET });
  assert.equal(r.tier, null);
  assert.equal(r.via, "refused");
});

test("a broken grant never falls back to a paid tier", () => {
  // The failure that would matter: a verification bug that treats "cannot read
  // this" as "must be fine". With the paywall down the worst case is the free
  // summary; with it up the worst case is nothing.
  const forged = mintGrant({ tier: 2 }, OTHER);
  assert.equal(tierFor({ token: forged, paywall: false, secret: SECRET }).tier, 0);
  assert.equal(tierFor({ token: forged, paywall: true, secret: SECRET }).tier, null);
});

test("a missing secret cannot open the door", () => {
  // A deploy that forgot the secret must fail closed. Serving tier 2 to
  // everybody because an env var is absent is the exact shape of the outage
  // that becomes a giveaway.
  const g = mintGrant({ tier: 2 }, SECRET);
  assert.equal(tierFor({ token: g, paywall: true, secret: undefined }).tier, null);
  assert.equal(tierFor({ token: g, paywall: false, secret: undefined }).tier, 0);
});

test("a real grant still works with the paywall up", () => {
  const g = mintGrant({ tier: 2, sku: "hd_reading" }, SECRET);
  const r = tierFor({ token: g, paywall: true, secret: SECRET });
  assert.equal(r.tier, 2);
  assert.equal(r.via, "grant");
  assert.equal(r.sku, "hd_reading");
});
