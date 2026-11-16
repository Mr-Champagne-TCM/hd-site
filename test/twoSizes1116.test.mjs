import { test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import {
  CHART,
  LEVELS,
  ON_SALE,
  READING,
  SESSION,
  SESSION_LEVEL,
  SUMMARY,
  TIERS,
  ladder,
  money,
  ownedLevelOf,
  priceFor,
  recordTierOf,
} from "../shared/pricing.mjs";
import { nextOffer, offersFor, sellable } from "../shared/availability.mjs";
import { BOOKING_URL } from "../shared/booking.mjs";
import { closingCard } from "../shared/readingCopy.mjs";
import { checkoutCredit, paidLevel, sessionParams, upgradeCredit } from "../netlify/lib/checkout.mjs";
import { chainHead, recordPurchase } from "../netlify/lib/charts.mjs";
import { loadReading, mintReadingLink, readReadingLink, saveReading } from "../netlify/lib/reading.mjs";
import { handleReading } from "../netlify/lib/readingHandler.mjs";
import { deliveryEmail } from "../netlify/lib/deliveryEmail.mjs";
import { SITE } from "../netlify/lib/siteLinks.mjs";

/**
 * TWO SIZES AND A ONE-TO-ONE (Jeremy 11/16): "Remove 3 tier model and replace
 * with 2 tier ... 44.44 should be a 1:1 meeting." Then: thirty minutes, the
 * full reading with it, the free call for the coaching funnel only.
 */

const SECRET = randomBytes(32).toString("hex");
const NOW = Date.parse("2026-11-16T15:00:00Z");
const CAL = "https://calendly.com/example/thirty-minutes";
const src = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

function memoryStore() {
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

const OUTPUT = { type: "Generator", profile: "2/4", authority: "Sacral", definedCenters: ["Sacral", "Throat"] };
const KEPT = { date: "1991-07-22", time: "17:40", timeKnown: true, place: "Denver, Colorado", zone: "America/Denver", name: "Alex" };

async function bought(store, tier, sku = TIERS[tier].sku) {
  const id = await saveReading(store, { tier, sku, output: null, name: "Alex Rivera", email: "alex@example.com", now: NOW - 86_400_000 });
  store.m.set(id, { ...store.m.get(id), output: OUTPUT, filledAt: Math.floor(NOW / 1000) - 80_000, birth: KEPT });
  return id;
}

/* ------------------------------------------------------------------ prices */

test("the prices: the chart, the reading, the one-to-one; the summary keeps its price as history", () => {
  assert.deepEqual([CHART, READING, SESSION].map((t) => t.cents), [111, 1111, 4444]);
  assert.equal(money(SESSION.cents).length, 6);
  assert.equal(SUMMARY.cents, 111);
  assert.deepEqual(ON_SALE, [CHART, READING]);
  assert.deepEqual(TIERS, [SUMMARY, CHART, READING], "stored tiers never move");
  assert.deepEqual(LEVELS, [SUMMARY, CHART, READING, SESSION]);
  assert.equal(SESSION_LEVEL, 3);
});

test("the offer page's ladder is the two sizes, with the chart's price coming off the reading", () => {
  assert.deepEqual(
    ladder().map(({ tier, level, full, due, credit }) => [tier.sku, level, full, due, credit]),
    [
      ["hd_chart", 1, 111, 111, 0],
      ["hd_reading", 2, 1111, 1000, 111],
    ],
  );
});

test("credit: chart -> reading 1000, chart -> one-to-one 4333, reading -> one-to-one 3333 (cents)", () => {
  const due = (owned, level) => priceFor(LEVELS[level], upgradeCredit({ headTier: owned, level }));
  assert.equal(due(1, 2), 1000);
  assert.equal(due(1, 3), 4333);
  assert.equal(due(2, 3), 3333);
  assert.equal(due(0, 1), 0, "an old summary to the chart is $0.00 -- never sold");
});

/* -------------------------------------------------------------- what is sold */

test("the summary is off sale; the one-to-one only with a calendar", () => {
  assert.equal(sellable(0), false);
  assert.equal(sellable(1), true);
  assert.equal(sellable(2), true);
  assert.equal(BOOKING_URL, null, "TODO(Jeremy): no booking link yet");
  assert.equal(sellable(3), false, "a call with no calendar is sold");
  assert.equal(sellable(3, { bookingUrl: CAL }), true);
});

test("what each chart can still become: never a $0.00 step, never what it has", () => {
  assert.deepEqual(offersFor(-1), [1, 2]);
  assert.deepEqual(offersFor(0), [2], "a summary skips the chart");
  assert.deepEqual(offersFor(1), [2]);
  assert.deepEqual(offersFor(2), []);
  assert.deepEqual(offersFor(1, { bookingUrl: CAL }), [2, 3]);
  assert.deepEqual(offersFor(2, { bookingUrl: CAL }), [3]);
  assert.deepEqual(offersFor(3, { bookingUrl: CAL }), [], "a one-to-one is the top");
  assert.equal(nextOffer(0), 2);
  assert.equal(nextOffer(2), null);
});

test("NOTHING DUE IS NOTHING SOLD: the checkout function refuses a $0.00 checkout before Stripe", () => {
  const fn = src("netlify/functions/checkout.mjs");
  assert.match(fn, /if \(priceFor\(LEVELS\[level\], alreadyPaidCents\) <= 0\) \{[\s\S]{0,200}checkout-not-sellable/);
  // ...and it sits before the session is made.
  assert.ok(fn.indexOf("priceFor(LEVELS[level], alreadyPaidCents) <= 0") < fn.indexOf("createSession(key"));
  assert.match(fn, /level >= LEVELS\.length/, "level 3 is a level; 4 is not");
});

/* ------------------------------------------------- the one-to-one, end to end */

test("a one-to-one is checkout level 3, stored as a reading whose sku says it came with the call", async () => {
  assert.equal(recordTierOf(3), 2);
  assert.equal(recordTierOf(1), 1);
  const p = sessionParams({ level: 3, origin: "https://x" });
  assert.equal(p.metadata.level, "3");
  assert.equal(p.metadata.sku, "hd_session");
  assert.equal(paidLevel({ payment_status: "paid", metadata: { level: "3" } }), 3);
  assert.equal(paidLevel({ payment_status: "paid", metadata: { level: "4" } }), null);

  const readings = memoryStore();
  const id = randomBytes(16).toString("hex");
  await recordPurchase({
    readings,
    id,
    level: 3,
    session: { metadata: { level: "3", sku: "hd_session" }, customer_details: { name: "Alex Rivera", email: "alex@example.com" }, amount_total: 4444, created: NOW / 1000 },
    secret: SECRET,
    now: NOW,
  });
  const rec = await loadReading(readings, id, NOW);
  assert.equal(rec.tier, 2);
  assert.equal(rec.sku, "hd_session");
  assert.equal(ownedLevelOf(rec), 3);
});

test("a reading's owner who books the one-to-one: credited the reading's price, and the new record grows from the reading", async () => {
  const readings = memoryStore();
  const reading = await bought(readings, 2);
  const credit = await checkoutCredit({
    body: { level: 3, reading: mintReadingLink({ id: reading, tier: 2 }, SECRET), upgrade: true },
    secret: SECRET,
    level: 3,
    head: (x) => chainHead(readings, x, NOW),
    readLink: readReadingLink,
    now: NOW,
  });
  assert.equal(credit.alreadyPaidCents, READING.cents);
  assert.equal(credit.upgrades, reading);
  const id = randomBytes(16).toString("hex");
  await recordPurchase({
    readings,
    id,
    level: 3,
    session: { metadata: { level: "3", sku: "hd_session", upgrades: reading }, customer_details: { email: "alex@example.com" }, amount_total: 3333, created: NOW / 1000 },
    secret: SECRET,
    now: NOW,
  });
  const grown = await loadReading(readings, id, NOW);
  assert.equal(grown.grewFrom, reading);
  assert.deepEqual(grown.birth, (await loadReading(readings, reading, NOW)).birth, "nothing to retype");
  assert.equal((await loadReading(readings, reading, NOW)).grewTo, id);
});

test("the claim and the watcher store and link the one-to-one as a reading, and say it was one", () => {
  const claim = src("netlify/lib/claimHandler.mjs");
  assert.match(claim, /const tier = recordTierOf\(level\);/);
  assert.match(claim, /mintReadingLink\(\{ id, tier \}, grantSecret\)/);
  assert.match(claim, /session: level === SESSION_LEVEL,/);
  const watcher = src("netlify/lib/reconcile.mjs");
  assert.match(watcher, /mintReadingLink\(\{ id, tier: recordTierOf\(level\) \}, grantSecret\)/);
  assert.match(watcher, /session: level === SESSION_LEVEL,/);
  assert.match(src("netlify/lib/charts.mjs"), /tier: recordTierOf\(level\),/);
});

test("a one-to-one's page says so, offers nothing more, and carries the booking link", async () => {
  const readings = memoryStore();
  const id = await bought(readings, 2, "hd_session");
  readings.m.set(id, { ...readings.m.get(id), reading: "x", writtenAt: Math.floor(NOW / 1000) });
  const res = await handleReading({ body: JSON.stringify({ token: mintReadingLink({ id, tier: 2, now: NOW }, SECRET) }), store: readings, secret: SECRET, now: NOW });
  const body = JSON.parse(res.body);
  assert.equal(body.session, true);
  assert.equal(body.booking, BOOKING_URL);
  assert.equal(body.offerSession, false);
  assert.equal(body.upgrade, null);
});

test("a one-to-one's emails say where to pick the time; nobody else's do", () => {
  const receipt = deliveryEmail({ tier: 2, session: true, name: "Alex", url: "https://x.test/r/a.b", links: SITE, pending: true, amountCents: 4444 });
  assert.match(receipt.text, /YOUR THIRTY MINUTES WITH JEREMY/);
  assert.match(receipt.text, /What: Human Design: the one-to-one/);
  const ready = deliveryEmail({ tier: 2, session: true, name: "Alex", url: "https://x.test/r/a.b", links: SITE });
  assert.match(ready.text, /YOUR THIRTY MINUTES WITH JEREMY/);
  assert.doesNotMatch(deliveryEmail({ tier: 2, name: "Alex", url: "https://x.test/r/a.b", links: SITE }).text, /THIRTY MINUTES WITH JEREMY/);
});

/* -------------------------------------------------------- the closing card */

test("the closing card: the free call never; the one-to-one when sold; the booking for a one-to-one", () => {
  assert.equal(closingCard({}), null);
  assert.equal(closingCard({ offer: false, url: "/u/t" }), null);
  const offer = closingCard({ offer: true, url: "/u/t", word: "chart" });
  assert.equal(offer.head, "Go through it with Jeremy, one to one");
  assert.match(offer.body, /^Thirty minutes on a video call, your chart on screen\. Your written reading comes with it, ready before you meet\. \$44\.44, and what you paid for this chart comes off\.$/);
  assert.equal(offer.url, "/u/t");
  const booking = closingCard({ session: true, bookingUrl: CAL });
  assert.equal(booking.head, "Your thirty minutes with Jeremy");
  assert.equal(booking.url, CAL);
  for (const c of [offer, booking]) assert.doesNotMatch(JSON.stringify(c), /free|#connect/);
  // Nothing in the shop's pages or PDF prints the free call any more.
  for (const f of ["src/CoachCard.tsx", "netlify/lib/readingPdf.mjs"]) assert.doesNotMatch(src(f), /COACH\./, f);
});

/* ------------------------------------------------------------- the offer page */

test("the offer page: two cards, invitations for buttons, the one-to-one only when sold", () => {
  const app = src("src/App.tsx");
  assert.match(app, /grid gap-4 sm:grid-cols-2/);
  assert.match(app, /`\$\{tier\.label\}, \$\{money\(full\)\} →`/);
  assert.match(app, /\{sellable\(SESSION_LEVEL\) && \(\s*<OneToOneCard/);
  assert.doesNotMatch(app, /Buy \$\{tier\.label/);
  assert.doesNotMatch(app, /Take \$\{whoseOf/);
  assert.match(app, /Add the written reading \(\$\{money\(t\.cents - paid\)\}\) →/);
  assert.match(app, /Add 30 minutes with Jeremy \(\$\{money\(t\.cents - paid\)\}\) →/);
});
