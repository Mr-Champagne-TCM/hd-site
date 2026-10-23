import { test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { handleMyCharts, ADDRESS_LIMITS, VISITOR_LIMITS } from "../netlify/lib/myChartsHandler.mjs";
import { myChartsEmail } from "../netlify/lib/myChartsEmail.mjs";
import { BACKFILL_KEY, emailKey, ensureIndexed, recordPurchase } from "../netlify/lib/charts.mjs";
import { readReadingLink } from "../netlify/lib/reading.mjs";
import { SITE } from "../netlify/lib/siteLinks.mjs";
import { TIERS } from "../shared/pricing.mjs";

/**
 * "EMAIL ME MY CHARTS" (release 2, Jeremy 10/20 "3B").
 *
 *   the same message whether or not the email has charts
 *   a rate limit
 *   email only to the typed address
 *   ONE link per person's chart (an upgraded chart: its current tier only)
 *   both emails link to "Start a new chart"; "none" links back to the page
 *
 * Made-up people: Alex (alex@example.com) bought for himself and for Sam.
 */

const SECRET = randomBytes(32).toString("hex");
const NOW = Date.parse("2026-10-20T15:00:00Z");
const ORIGIN = "https://humandesign.example";

function memoryStore({ listable = true } = {}) {
  const m = new Map();
  const s = {
    m,
    async setJSON(k, v) {
      m.set(k, JSON.parse(JSON.stringify(v)));
    },
    async get(k) {
      return m.has(k) ? m.get(k) : null;
    },
  };
  if (listable) s.list = async () => ({ blobs: [...m.keys()].map((key) => ({ key })) });
  return s;
}
function counterStore() {
  const m = new Map();
  return { load: async (k) => m.get(k) ?? [], save: async (k, v) => m.set(k, v) };
}

const out = (type, centers = ["Sacral"]) => ({ type, profile: "2/4", authority: "Sacral", definition: "Single", definedCenters: centers, channels: [] });
const KEPT = (name, date = "1991-07-22", place = "Denver, Colorado") => ({ date, time: "17:40", timeKnown: true, place, zone: "America/Denver", name });

const session = (level, email, meta = {}, name = "Alex Rivera") => ({
  payment_status: "paid",
  created: Math.floor(NOW / 1000) - 3600,
  amount_total: 0,
  customer_details: { name, email },
  metadata: { level: String(level), sku: TIERS[level].sku, ...meta },
});

/** Record and fill a purchase, the release-2 way. */
async function buy(readings, index, { level, email = "alex@example.com", meta = {}, output, birth, pending = false }) {
  const id = randomBytes(16).toString("hex");
  await recordPurchase({ readings, index, id, level, session: session(level, email, meta), secret: SECRET, now: NOW });
  if (!pending) {
    const raw = readings.m.get(id);
    readings.m.set(id, { ...raw, output, birth: birth ?? raw.birth, filledAt: Math.floor(NOW / 1000) - 60 });
  }
  return id;
}

function setup() {
  const readings = memoryStore();
  const index = memoryStore();
  // The backfill has nothing older to find in these stores.
  index.m.set(BACKFILL_KEY, { at: 1 });
  return { readings, index, counters: counterStore(), sent: [] };
}

const ask = (ctx, email, { visitorKey = "visitor-1", send } = {}) =>
  handleMyCharts({
    body: JSON.stringify({ email }),
    readings: ctx.readings,
    index: ctx.index,
    counters: ctx.counters,
    visitorKey,
    secret: SECRET,
    send: send ?? (async (m) => (ctx.sent.push(m), { ok: true })),
    origin: ORIGIN,
    links: SITE,
    now: NOW,
  });

const links = (text) => [...text.matchAll(/\/r\/([A-Za-z0-9_.-]+)/g)].map((m) => readReadingLink(m[1], SECRET, NOW));

test("THE SAME ANSWER WHETHER OR NOT THE EMAIL HAS CHARTS", async () => {
  const ctx = setup();
  await buy(ctx.readings, ctx.index, { level: 1, output: out("Generator"), birth: KEPT("Alex") });
  const has = await ask(ctx, "alex@example.com");
  const none = await ask(ctx, "nobody@example.com");
  assert.equal(has.status, 200);
  assert.equal(none.status, 200);
  assert.equal(has.body, none.body, "the page could tell who bought here");
  assert.deepEqual(JSON.parse(has.body), { sent: true });
});

test("EMAIL ONLY TO THE TYPED ADDRESS, and only charts bought with it", async () => {
  const ctx = setup();
  await buy(ctx.readings, ctx.index, { level: 1, output: out("Generator"), birth: KEPT("Alex") });
  await buy(ctx.readings, ctx.index, { level: 2, email: "other@example.com", output: out("Projector"), birth: KEPT("Robin") });
  await ask(ctx, "  ALEX@example.com ");
  assert.equal(ctx.sent.length, 1);
  assert.equal(ctx.sent[0].to, "alex@example.com", "the address is the one typed, tidied -- nothing else");
  assert.doesNotMatch(ctx.sent[0].text, /Robin/, "someone else's chart was listed");
  assert.equal(links(ctx.sent[0].text).length, 1);
});

test("ONE LINK PER PERSON: a summary grown to a reading is listed once, at the reading", async () => {
  const ctx = setup();
  const { readings, index } = ctx;
  const sum = await buy(readings, index, { level: 0, output: out("Manifesting Generator"), birth: KEPT("Alex") });
  const chart = await buy(readings, index, { level: 1, meta: { upgrades: sum }, output: out("Manifesting Generator") });
  const reading = await buy(readings, index, { level: 2, meta: { upgrades: chart }, output: out("Manifesting Generator") });
  // Sam: a new chart for someone else, bought by Alex.
  const sam = await buy(readings, index, { level: 1, meta: { fresh: "1" }, output: out("Projector", ["Spleen"]), birth: KEPT("Sam", "1994-03-03", "Austin, Texas") });

  await ask(ctx, "alex@example.com");
  const found = links(ctx.sent[0].text);
  assert.equal(found.length, 2, "one link per person's chart");
  assert.deepEqual(found.map((l) => l.id).sort(), [reading, sam].sort());
  assert.equal(found.find((l) => l.id === reading).tier, 2, "an upgraded chart at its current tier only");
  assert.match(ctx.sent[0].text, /Alex’s reading — The reading · July 22, 1991 · Denver, Colorado/);
  assert.match(ctx.sent[0].text, /Sam’s chart — The chart · March 3, 1994 · Austin, Texas/);
  assert.doesNotMatch(ctx.sent[0].text, /5:40|17:40/, "no birth time in an email list");
});

test("a paid upgrade not yet confirmed is that person's ONE link, asking for the confirm", async () => {
  const ctx = setup();
  const sum = await buy(ctx.readings, ctx.index, { level: 0, output: out("Generator"), birth: KEPT("Alex") });
  const up = await buy(ctx.readings, ctx.index, { level: 2, meta: { upgrades: sum }, pending: true });
  await ask(ctx, "alex@example.com");
  const found = links(ctx.sent[0].text);
  assert.deepEqual(found.map((l) => l.id), [up]);
  assert.match(ctx.sent[0].text, /Confirm the birth details/);
});

test("OLDER RECORDS (no person) of the same chart are one person; the list fills itself once", async () => {
  const readings = memoryStore();
  const index = memoryStore();
  const older = (tier, output) => {
    const id = randomBytes(16).toString("hex");
    readings.m.set(id, {
      v: 1,
      tier,
      output,
      buyer: { name: "Alex Rivera", email: "alex@example.com", phone: null },
      sku: TIERS[tier].sku,
      purchasedAt: Math.floor(NOW / 1000) - 86_400 * (10 - tier),
      createdAt: Math.floor(NOW / 1000) - 86_400 * (10 - tier),
      filledAt: Math.floor(NOW / 1000) - 86_000 * (10 - tier),
    });
    return id;
  };
  const sum = older(0, out("Generator"));
  const read = older(2, out("Generator"));
  const other = older(1, out("Reflector", []));
  const ctx = { readings, index, counters: counterStore(), sent: [] };
  await ask(ctx, "alex@example.com");
  const found = links(ctx.sent[0].text).map((l) => l.id).sort();
  assert.deepEqual(found, [read, other].sort(), "the older summary and its reading came back twice");
  assert.ok(!found.includes(sum));
  assert.ok(await index.get(BACKFILL_KEY), "the one-time pass did not mark itself done");

  // Done once: a second pass finds the marker and does not run.
  assert.deepEqual(await ensureIndexed({ readings, index, secret: SECRET, now: NOW }), { ran: false });
});

test("THE LIST IS SCRAMBLED: no address, no birth details, in its keys or its rows", async () => {
  const ctx = setup();
  await buy(ctx.readings, ctx.index, { level: 1, output: out("Generator"), birth: KEPT("Alex") });
  for (const [key, value] of ctx.index.m) {
    assert.doesNotMatch(key, /@|alex/i);
    const v = JSON.stringify(value);
    assert.doesNotMatch(v, /@|alex|1991|Denver/i);
  }
  assert.ok(ctx.index.m.has(emailKey(" ALEX@example.com", SECRET)), "the key does not survive casing");
});

test("A RATE LIMIT, per address and per visitor -- and the refusal says nothing about charts", async () => {
  const ctx = setup();
  await buy(ctx.readings, ctx.index, { level: 1, output: out("Generator"), birth: KEPT("Alex") });
  const burst = ADDRESS_LIMITS.find((l) => l.name === "burst").max;
  for (let i = 0; i < burst; i++) assert.equal((await ask(ctx, "alex@example.com", { visitorKey: `v${i}` })).status, 200);
  const limited = await ask(ctx, "alex@example.com", { visitorKey: "fresh-visitor" });
  assert.equal(limited.status, 429);
  // The same refusal for an address with nothing under it.
  for (let i = 0; i < burst; i++) await ask(ctx, "nobody@example.com", { visitorKey: `w${i}` });
  const limitedNone = await ask(ctx, "nobody@example.com", { visitorKey: "another" });
  assert.equal(limitedNone.status, 429);
  assert.equal(limited.body, limitedNone.body);
  assert.equal(ctx.sent.length, burst * 2, "a refused ask still sent an email");

  // One visitor walking many addresses is stopped too.
  const v = setup();
  const vBurst = VISITOR_LIMITS.find((l) => l.name === "burst").max;
  for (let i = 0; i < vBurst; i++) await ask(v, `p${i}@example.com`, { visitorKey: "same" });
  assert.equal((await ask(v, "last@example.com", { visitorKey: "same" })).status, 429);
});

test("an address that is not one is asked about kindly, and nothing is sent", async () => {
  const ctx = setup();
  for (const bad of ["", "alex", "alex@", "@example.com", "a b@example.com", "x".repeat(300) + "@e.com"]) {
    const res = await ask(ctx, bad);
    assert.equal(res.status, 400, bad);
    assert.equal(JSON.parse(res.body).error.key, "mycharts-bad-email");
  }
  assert.equal(ctx.sent.length, 0);
});

test("a send that fails is ours, said calmly -- the same way for both answers", async () => {
  const ctx = setup();
  const res = await ask(ctx, "nobody@example.com", { send: async () => ({ ok: false, reason: "http_500" }) });
  assert.equal(res.status, 502);
  assert.match(JSON.parse(res.body).error.message, /on my side/);
});

// --- the two emails ---------------------------------------------------------------

test("THE LIST EMAIL: a card per chart, and a link to start a new chart", () => {
  const reading = { tier: 2, pending: false, birth: KEPT("Alex"), buyer: { name: "Alex Rivera" } };
  const { subject, html, text } = myChartsEmail({ charts: [{ reading, url: `${ORIGIN}/r/abc.def` }], links: SITE, origin: ORIGIN });
  assert.equal(subject, "Your Human Design charts, with fresh links");
  assert.match(text, /Start a new chart/);
  assert.match(text, new RegExp(`${ORIGIN}/#ways-in`));
  assert.match(html, /href="https:\/\/humandesign\.example\/#ways-in"/);
  assert.match(html, /href="https:\/\/humandesign\.example\/charts\/"/, "the list email also says where to ask again");
});

test("THE NONE EMAIL: a link BACK to Email me my charts, and to start a new chart", () => {
  const { subject, html, text } = myChartsEmail({ charts: [], links: SITE, origin: ORIGIN });
  assert.equal(subject, "Your Human Design charts: none under this email");
  assert.match(text, /There are none under it\./);
  assert.match(html, /href="https:\/\/humandesign\.example\/charts\/"[^>]*>Email me my charts</);
  assert.match(html, /href="https:\/\/humandesign\.example\/#ways-in"[^>]*>Start a new chart</);
  assert.match(text, /nothing was shown to anyone/);
});

test("NEITHER EMAIL CALLS HIS PAGE 'THE SHOP' (Jeremy 10/20: internal only)", () => {
  const reading = { tier: 1, pending: false, birth: KEPT("Alex"), buyer: { name: "Alex Rivera" } };
  for (const e of [myChartsEmail({ charts: [], links: SITE, origin: ORIGIN }), myChartsEmail({ charts: [{ reading, url: "u" }], links: SITE, origin: ORIGIN })]) {
    for (const part of [e.subject, e.text, e.html.replace(/<!--[\s\S]*?-->/g, "")]) assert.doesNotMatch(part, /\bshop\b/i);
  }
});

test("the page posts the address and shows only the same 'Sent' words", () => {
  const page = readFileSync(new URL("../src/MyCharts.tsx", import.meta.url), "utf8");
  assert.match(page, /\/api\/my-charts/);
  assert.match(page, /MY_CHARTS\.sentLine\(state\.to\)/);
  assert.doesNotMatch(page, /charts\.length|found/, "the page must never know what was found");
  const copy = readFileSync(new URL("../src/copy.ts", import.meta.url), "utf8");
  assert.match(copy, /If \$\{email\} has charts here, a fresh link to each one is on its way to it\./);
});

test("the list email's fresh-link line reads as one sentence (no stray capital)", () => {
  const reading = { tier: 1, pending: false, birth: KEPT("Alex"), buyer: { name: "Alex Rivera" } };
  const { html } = myChartsEmail({ charts: [{ reading, url: "u" }], links: SITE, origin: ORIGIN });
  assert.match(html, /sends you a fresh one, or ask again on the <a/);
});
