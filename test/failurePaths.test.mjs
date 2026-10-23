import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { randomBytes } from "node:crypto";

import { KINDS, SEVERITY, customerError, describe, engineKind, geminiKind, guard, noteFailure } from "../netlify/lib/failures.mjs";
import { MESSAGES, customerText } from "../shared/customerMessages.mjs";
import { digest } from "../netlify/lib/health.mjs";
import { handleClaim } from "../netlify/lib/claimHandler.mjs";
import { handleChart } from "../netlify/lib/handler.mjs";
import { handleReading } from "../netlify/lib/readingHandler.mjs";
import { handlePdf } from "../netlify/lib/pdfHandler.mjs";
import { handleResend } from "../netlify/lib/resendHandler.mjs";
import { interpretOne } from "../netlify/lib/interpretJob.mjs";
import { fillReading, loadReading, mintReadingLink, readingIdForSession, saveReading } from "../netlify/lib/reading.mjs";
import { messagePage } from "../netlify/lib/messagePage.mjs";

/**
 * EVERY FAILURE A CUSTOMER CAN HIT, MADE TO HAPPEN ON PURPOSE (Jeremy 10/16:
 * "errors on our side should not look like errors to the customer").
 *
 * Each test injects one failure with a fake and asserts the three things the
 * taxonomy promises: the STATUS the customer's request gets, the customer
 * message KEY (so the words are the catalogue's, never raw), and the KIND that
 * was recorded (granular, no personal data).
 */

const SECRET = randomBytes(32).toString("hex");
const BUYER = { name: "Example Person", email: "someone@example.invalid", phone: null };
const RAW = /ECONNREFUSED|AbortError|TypeError|ReferenceError|stack|at .*\.mjs|blobs are down|stripe 5\d\d|key reaches|HH:MM|IANA|ISO-8601|timeKnown/;

function store() {
  const data = new Map();
  return {
    data,
    async setJSON(k, v) {
      data.set(k, JSON.parse(JSON.stringify(v)));
    },
    async get(k) {
      return data.has(k) ? data.get(k) : null;
    },
    async list() {
      return { blobs: [...data.keys()].map((key) => ({ key })) };
    },
  };
}
const broken = () => ({
  async setJSON() {
    throw new Error("blobs are down");
  },
  async get() {
    throw new Error("blobs are down");
  },
  async list() {
    throw new Error("blobs are down");
  },
});
const notes = () => {
  const seen = [];
  const note = async (kind, opts = {}) => seen.push({ kind, ...opts });
  return { seen, note };
};
const kinds = (seen) => seen.map((s) => s.kind);
const parse = (r) => (typeof r.body === "string" ? JSON.parse(r.body) : r.payload);

// --- the taxonomy itself ----------------------------------------------------

test("every kind names a real severity and a real customer sentence", () => {
  const severities = new Set(Object.values(SEVERITY));
  for (const [kind, e] of Object.entries(KINDS)) {
    assert.ok(severities.has(e.severity), `${kind}: severity ${e.severity}`);
    if (e.paid) assert.ok(severities.has(e.paid), `${kind}: paid severity`);
    for (const paid of [false, true]) {
      const key = describe(kind, { paid }).customer;
      if (key) assert.ok(MESSAGES[key], `${kind}: no message "${key}"`);
    }
  }
});

test("every kind the code files is in the registry", async () => {
  // A kind nobody registered falls back to follow-up, which is safe -- but it
  // means nobody decided what the customer sees. So the code is read.
  const used = new Set();
  for (const dir of ["netlify/functions/", "netlify/lib/"]) {
    for (const name of await readdir(new URL(`../${dir}`, import.meta.url))) {
      if (!name.endsWith(".mjs")) continue;
      const src = await readFile(new URL(`../${dir}${name}`, import.meta.url), "utf8");
      for (const m of src.matchAll(/(?:note|fail|failWith|noteFailure\([^,]+,|customerError|unavailable)\(\s*"([a-z0-9-]+)"/g)) used.add(m[1]);
      for (const m of src.matchAll(/noteFailure\(\s*\w+(?:\(\))?,\s*"([a-z0-9-]+)"/g)) used.add(m[1]);
      for (const m of src.matchAll(/kind:\s*"([a-z0-9-]+)"/g)) used.add(m[1]);
    }
  }
  assert.ok(used.size > 30, `only ${used.size} kinds found -- the scan is broken`);
  const unknown = [...used].filter((k) => !KINDS[k]);
  assert.deepEqual(unknown, [], `kinds used but never registered: ${unknown.join(", ")}`);
});

test("THE CUSTOMER'S WORDS: plain, no blame, no jargon, no commands", () => {
  for (const [key, m] of Object.entries(MESSAGES)) {
    if (m.text === null) continue; // computed elsewhere (ratelimit.mjs)
    assert.doesNotMatch(m.text, /\b(error|exception|timezone|IANA|HH:MM|ISO|tier|undefined|null|stripe|gemini|engine|blob|server|500|502|503)\b/i, key);
    assert.doesNotMatch(m.text, /\bplease\b/i, `${key}: "please" -- an invitation, not a plea`);
    assert.doesNotMatch(m.text, /^(Try|Check|Enter|Reload|Refresh|Contact|Email|Wait)\b/, `${key}: opens with a command`);
    assert.doesNotMatch(m.text, /\byou (did|made|entered) .*wrong|\binvalid\b/i, `${key}: blames`);
    assert.ok(m.text.length < 330, `${key}: too long for a panel`);
  }
});

test("money is named wherever it might be on the customer's mind", () => {
  for (const key of ["checkout-unavailable", "chart-slow-free", "chart-form-unreadable", "claim-not-paid"]) {
    assert.match(customerText(key), /nothing was charged/i, key);
  }
  for (const key of ["chart-slow-paid", "chart-not-saved", "purchase-safe-setup-pending", "claim-confirm-later"]) {
    assert.match(customerText(key), /safe/i, key);
  }
});

test("our-side failures carry a next step; the customer acts only on their own typo", () => {
  for (const [key, m] of Object.entries(MESSAGES)) {
    if (m.text === null) continue;
    assert.match(m.text, /usually|reaches|will|could you|can be|on the home page|page has|whenever|is a perfectly|the summary|go through|nothing needs|clears on its own/i, `${key}: no next step`);
  }
  const acting = Object.entries(MESSAGES).filter(([, m]) => m.act).map(([k]) => k).sort();
  // Release 2: a mistyped address on "Email me my charts" is theirs to fix too.
  // 10/22: a mistyped time on "Add your birth time" is theirs to fix too.
  assert.deepEqual(acting, ["addtime-check-time", "chart-check-date", "chart-check-place", "chart-check-time", "mycharts-bad-email"]);
});

test("engine answers map onto kinds the customer can act on, or ours", () => {
  assert.equal(engineKind(400, "bad_birth_date"), "engine-400-bad-date");
  assert.equal(engineKind(400, "no_birth_time"), "engine-400-bad-time");
  assert.equal(engineKind(400, "no_time_known"), "engine-400-bad-time");
  assert.equal(engineKind(400, "bad_birth_zone"), "engine-400-bad-place");
  assert.equal(engineKind(400, "bad_json"), "engine-400-other");
  assert.equal(engineKind(401, "bad_key"), "engine-401-key");
  assert.equal(engineKind(403, "tier_not_allowed"), "engine-403-tier");
  assert.equal(engineKind(429, "rate_limited"), "engine-429-key-limit");
  assert.equal(engineKind(502, undefined), "engine-5xx");
  assert.equal(engineKind(404, "not_found"), "engine-unexpected");
});

test("writer failures are named by the wall they hit", () => {
  assert.equal(geminiKind("http", "gemini 503"), "gemini-503");
  assert.equal(geminiKind("http", "gemini 429"), "gemini-429");
  assert.equal(geminiKind("http", "gemini 400"), "gemini-http");
  assert.equal(geminiKind("timeout"), "gemini-timeout");
  assert.equal(geminiKind("network"), "gemini-network");
  assert.equal(geminiKind("malformed"), "gemini-refused-5x");
  assert.equal(geminiKind("misconfigured"), "gemini-misconfigured");
  assert.equal(geminiKind("nonsense"), "gemini-unknown");
});

test("a paid buyer's engine trouble pages Jeremy; a stranger's is follow-up", () => {
  assert.equal(describe("engine-timeout").severity, SEVERITY.FOLLOW_UP);
  assert.equal(describe("engine-timeout", { paid: true }).severity, SEVERITY.PAGE);
  assert.equal(describe("engine-timeout").customer, "chart-slow-free");
  assert.equal(describe("engine-timeout", { paid: true }).customer, "chart-slow-paid");
});

// --- recording ------------------------------------------------------------------

test("noteFailure: page-jeremy alerts, the rest only record, and neither ever throws", async () => {
  const health = store();
  const sent = [];
  const send = async (m) => sent.push(m);
  await noteFailure(health, "claim-email", { detail: "rejected (tier 1)", send, now: 1000 });
  await noteFailure(health, "reading-link-expired", { detail: "link expired", send, now: 2000 });
  await noteFailure(health, "ready-email", { detail: "timeout", send, now: 3000 });
  assert.equal(sent.length, 1, "only the page-jeremy kind emailed");
  assert.match(sent[0].subject, /claim-email failed/);
  assert.match(sent[0].text, /Severity: page-jeremy/);
  assert.match(sent[0].text, /Customer saw: nothing/);
  const entries = [...health.data.values()].filter((e) => e.kind);
  assert.deepEqual(
    entries.map((e) => [e.kind, e.severity]).sort(),
    [
      ["claim-email", "page-jeremy"],
      ["reading-link-expired", "internal-only"],
      ["ready-email", "needs-follow-up"],
    ],
  );
  assert.equal(entries.find((e) => e.kind === "reading-link-expired").customer, "reading-link-expired");
  // A broken store and a throwing sender are both swallowed.
  assert.deepEqual(await noteFailure(broken(), "claim-email", { send: async () => { throw new Error("x"); } }), {
    recorded: false,
    alerted: false,
  });
});

test("the alert tells Jeremy what the customer was shown, in their words", async () => {
  const health = store();
  const sent = [];
  await noteFailure(health, "engine-timeout", { paid: true, detail: "tier 2, paid link: AbortError", send: async (m) => sent.push(m) });
  assert.match(sent[0].text, /Something on my side is slow right now. Your purchase is safe/);
  assert.match(sent[0].text, /chart-slow-paid/);
});

test("THE DIGEST GROUPS BY SEVERITY: what customers saw vs internal noise", () => {
  const found = [
    { kind: "claim-email", severity: "page-jeremy", customer: null, detail: "rejected", at: 5 },
    { kind: "engine-timeout", severity: "page-jeremy", customer: "chart-slow-paid", detail: "x", at: 4 },
    { kind: "ready-email", severity: "needs-follow-up", detail: "timeout", at: 3 },
    { kind: "reading-link-expired", severity: "internal-only", customer: "reading-link-expired", at: 2 },
    { kind: "reading-link-expired", severity: "internal-only", customer: "reading-link-expired", at: 1 },
  ];
  const { subject, text } = digest({ found });
  assert.match(subject, /3 problems to follow up, 2 internal-only/);
  assert.match(text, /PAGED YOU/);
  assert.match(text, /TO FOLLOW UP/);
  assert.match(text, /INTERNAL ONLY/);
  assert.match(text, /2 x reading-link-expired/);
  assert.match(text, /WHAT CUSTOMERS WERE SHOWN/);
  assert.match(text, /chart-slow-paid: "Something on my side is slow/);
  assert.ok(text.indexOf("PAGED YOU") < text.indexOf("TO FOLLOW UP"));
  assert.ok(text.indexOf("TO FOLLOW UP") < text.indexOf("INTERNAL ONLY"));
});

test("internal-only noise alone does not make the subject look like trouble", () => {
  const { subject, text } = digest({
    found: [{ kind: "engine-400-bad-date", severity: "internal-only", customer: "chart-check-date", at: 1 }],
  });
  assert.match(subject, /all clear, 1 internal-only/);
  assert.match(text, /engine-400-bad-date/);
});

// --- claim: the money has moved ---------------------------------------------------

const SESSION_ID = "cs_test_" + "a".repeat(40);
const paidSession = { payment_status: "paid", metadata: { level: "1", sku: "chart" }, customer_details: BUYER, created: 1_760_000_000 };

function claim(over = {}) {
  const n = notes();
  const sent = [];
  return {
    n,
    sent,
    run: () =>
      handleClaim({
        body: JSON.stringify({ session_id: SESSION_ID }),
        stripeKey: "sk_test_fixture",
        grantSecret: SECRET,
        getSession: async () => paidSession,
        readings: store(),
        send: async (m) => (sent.push(m), { ok: true }),
        note: n.note,
        origin: "https://shop.example",
        links: {},
        ...over,
      }),
  };
}

test("claim, happy path: a link, an email, nothing recorded", async () => {
  const c = claim();
  const r = await c.run();
  assert.equal(r.status, 200);
  assert.match(r.payload.url, /^https:\/\/shop\.example\/r\//);
  assert.equal(c.sent.length, 1);
  assert.deepEqual(kinds(c.n.seen), []);
});

test("claim, missing configuration: calm 503, page Jeremy", async () => {
  const c = claim({ stripeKey: "" });
  const r = await c.run();
  assert.equal(r.status, 503);
  assert.equal(r.payload.error.key, "claim-confirm-later");
  assert.deepEqual(kinds(c.n.seen), ["claim-misconfigured"]);
});

test("claim, Stripe unreachable: the purchase is safe and reloading works", async () => {
  const c = claim({ getSession: async () => { const e = new Error("stripe 503 upstream"); e.status = 503; throw e; } });
  const r = await c.run();
  assert.equal(r.status, 502);
  assert.equal(r.payload.error.key, "claim-confirm-later");
  assert.match(r.payload.error.message, /reloading this page/);
  assert.doesNotMatch(JSON.stringify(r.payload), RAW);
  assert.deepEqual(kinds(c.n.seen), ["claim-stripe-unreachable"]);
  assert.match(c.n.seen[0].detail, /stripe 503/);
});

test("claim, a made-up session: not found, nothing charged said plainly elsewhere", async () => {
  const c = claim({ body: JSON.stringify({ session_id: "nope" }) });
  const r = await c.run();
  assert.equal(r.status, 400);
  assert.equal(r.payload.error.key, "claim-not-found");
  assert.deepEqual(kinds(c.n.seen), ["claim-bad-session"]);
});

test("claim, not paid: 402 and nothing charged", async () => {
  const c = claim({ getSession: async () => ({ payment_status: "unpaid" }) });
  const r = await c.run();
  assert.equal(r.status, 402);
  assert.equal(r.payload.error.key, "claim-not-paid");
  assert.deepEqual(kinds(c.n.seen), ["claim-not-paid"]);
});

test("claim, the store will not save: STILL a 200 with the grant, Jeremy paged", async () => {
  const c = claim({ readings: broken() });
  const r = await c.run();
  assert.equal(r.status, 200, "money taken, and the buyer was told it failed");
  assert.ok(r.payload.grant);
  assert.equal(r.payload.url, null);
  assert.equal(r.payload.notice.key, "purchase-safe-setup-pending");
  assert.equal(c.sent.length, 0, "an email went out with no link in it");
  assert.deepEqual(kinds(c.n.seen), ["claim-not-recorded"]);
  assert.equal(c.n.seen[0].paid, true);
  assert.equal(describe("claim-not-recorded").severity, SEVERITY.PAGE);
});

test("claim, one store blip: the second try saves it", async () => {
  const s = store();
  let fail = 1;
  const flaky = { ...s, async setJSON(k, v) { if (fail-- > 0) throw new Error("blip"); return s.setJSON(k, v); } };
  const c = claim({ readings: flaky });
  const r = await c.run();
  assert.equal(r.status, 200);
  assert.ok(r.payload.url);
  assert.deepEqual(kinds(c.n.seen), []);
});

test("claim, a READ blip never writes a blank record over a reading that has a chart", async () => {
  // The latent fault behind the strict load: a repeat claim whose read
  // blipped used to look like "never saved" and wrote a pending record over
  // the filled one.
  const s = store();
  const id = readingIdForSession(SESSION_ID, SECRET);
  await saveReading(s, { id, tier: 1, output: null, name: "A", email: "a@example.invalid", phone: null, sku: "chart", purchasedAt: Date.now() });
  await fillReading(s, id, { type: "Generator" });
  const blind = { ...s, async get() { throw new Error("read blip"); } };
  const c = claim({ readings: blind });
  const r = await c.run();
  assert.equal(r.status, 200);
  assert.equal((await loadReading(s, id)).pending, false, "the filled reading was overwritten");
  assert.deepEqual(kinds(c.n.seen), ["claim-not-recorded"]);
});

test("claim, the delivery email fails or throws: 200, link on screen, Jeremy paged", async () => {
  for (const send of [async () => ({ ok: false, reason: "rejected" }), async () => { throw new TypeError("boom"); }]) {
    const c = claim({ send });
    const r = await c.run();
    assert.equal(r.status, 200);
    assert.ok(r.payload.url);
    assert.deepEqual(kinds(c.n.seen), ["claim-email"]);
    assert.doesNotMatch(c.n.seen[0].detail, /@/, "an address reached the incident");
  }
});

test("claim, no address on the purchase: noted for follow-up", async () => {
  const c = claim({ getSession: async () => ({ ...paidSession, customer_details: { name: "A" } }) });
  const r = await c.run();
  assert.equal(r.status, 200);
  assert.deepEqual(kinds(c.n.seen), ["claim-no-address"]);
});

// --- the birth-details form ---------------------------------------------------

const BIRTH = { date: "1985-06-25", zone: "America/Chicago", timeKnown: false };
const counters = () => ({ async keyFor(ip) { return `k:${ip}`; }, async load() { return []; }, async save() {} });

async function paidChart({ engine, readings, deliver }) {
  const r = readings ?? store();
  const id = await saveReading(r, { tier: 2, output: null, ...BUYER, sku: "reading", purchasedAt: Date.now() });
  const reading = mintReadingLink({ id, tier: 2 }, SECRET);
  const n = notes();
  const res = await handleChart({
    body: JSON.stringify({ reading, birth: BIRTH }),
    ip: "1.2.3.4",
    now: Date.now(),
    store: counters(),
    engine,
    grantSecret: SECRET,
    readings: r,
    deliver,
    report: async (i) => n.seen.push(i),
  });
  return { res, seen: n.seen };
}

async function freeChart({ engine, store: s = counters() }) {
  const n = notes();
  const res = await handleChart({
    body: JSON.stringify({ birth: BIRTH }),
    ip: "1.2.3.4",
    now: Date.now(),
    store: s,
    engine,
    grantSecret: SECRET,
    report: async (i) => n.seen.push(i),
  });
  return { res, seen: n.seen };
}

const abort = async () => { const e = new Error("This operation was aborted"); e.name = "AbortError"; throw e; };

test("chart, engine too slow (free): 'slow on our side', nothing charged, follow-up", async () => {
  const { res, seen } = await freeChart({ engine: abort });
  assert.equal(res.status, 503);
  assert.equal(parse(res).error.key, "chart-slow-free");
  assert.doesNotMatch(res.body, RAW);
  assert.deepEqual(kinds(seen), ["engine-timeout"]);
  assert.equal(seen[0].paid, false);
});

test("chart, engine too slow (paid): purchase safe, details kept, Jeremy paged", async () => {
  const { res, seen } = await paidChart({ engine: abort });
  assert.equal(res.status, 503);
  assert.equal(parse(res).error.key, "chart-slow-paid");
  assert.match(parse(res).error.message, /details are still in the form/);
  assert.deepEqual(kinds(seen), ["engine-timeout"]);
  assert.equal(seen[0].paid, true);
});

test("chart, engine unreachable: told apart from slow", async () => {
  const { seen } = await freeChart({ engine: async () => { throw new TypeError("fetch failed"); } });
  assert.deepEqual(kinds(seen), ["engine-unreachable"]);
});

for (const [code, kind, key] of [
  ["bad_birth_date", "engine-400-bad-date", "chart-check-date"],
  ["bad_birth_time", "engine-400-bad-time", "chart-check-time"],
  ["bad_birth_zone", "engine-400-bad-place", "chart-check-place"],
]) {
  test(`chart, engine 400 ${code}: the customer is asked, kindly, to check that one field`, async () => {
    const { res, seen } = await freeChart({
      engine: async () => ({ ok: false, status: 400, payload: { error: { code, message: "Use HH:MM in 24-hour time, IANA, ISO-8601." } } }),
    });
    assert.equal(res.status, 400);
    assert.equal(parse(res).error.key, key);
    assert.doesNotMatch(res.body, RAW, "the engine's developer text reached the customer");
    assert.deepEqual(kinds(seen), [kind]);
    assert.equal(describe(kind).severity, SEVERITY.INTERNAL);
  });
}

for (const [status, code, kind] of [
  [401, "bad_key", "engine-401-key"],
  [403, "tier_not_allowed", "engine-403-tier"],
  [429, "rate_limited", "engine-429-key-limit"],
  [500, "internal", "engine-5xx"],
  [502, undefined, "engine-5xx"],
]) {
  test(`chart, engine ${status}: ours, never the engine's words`, async () => {
    const { res, seen } = await paidChart({
      engine: async () => ({ ok: false, status, payload: code ? { error: { code, message: "This key reaches tier 1. Tier 2 was asked for." } } : null }),
    });
    assert.equal(res.status, 503);
    assert.equal(parse(res).error.key, "chart-slow-paid");
    assert.doesNotMatch(res.body, RAW);
    assert.deepEqual(kinds(seen), [kind]);
    assert.equal(describe(kind, { paid: true }).severity, SEVERITY.PAGE);
  });
}

test("chart, the rate counter store is down: fails OPEN, the chart is drawn", async () => {
  const angry = { async keyFor() { return "k"; }, async load() { throw new Error("blobs are down"); }, async save() { throw new Error("x"); } };
  const { res, seen } = await freeChart({ store: angry, engine: async () => ({ ok: true, status: 200, payload: { type: "Generator" } }) });
  assert.equal(res.status, 200);
  assert.deepEqual(kinds(seen), ["chart-rate-store"]);
});

test("chart, the upgrade comparison cannot read the store: skipped, the chart is served", async () => {
  const s = store();
  let reads = 0;
  // The first read (loading this purchase for its address) fails; the rest work.
  const blip = { ...s, async get(k) { if (reads++ === 0) throw new Error("blip"); return s.get(k); }, async list() { throw new Error("blip"); } };
  const { res } = await paidChart({ readings: blip, engine: async () => ({ ok: true, status: 200, payload: { type: "Generator" } }) });
  assert.equal(res.status, 200);
});

test("chart, the ready-email sender throws: the buyer still gets the chart, follow-up noted", async () => {
  const { res, seen } = await paidChart({
    engine: async () => ({ ok: true, status: 200, payload: { type: "Generator" } }),
    deliver: async () => { throw new ReferenceError("record is not defined"); },
  });
  assert.equal(res.status, 200);
  assert.deepEqual(kinds(seen), ["ready-email"]);
});

test("chart, the shop's own rate limit: the existing sentence, recorded as noise", async () => {
  const full = { async keyFor() { return "k"; }, async load() { return Array.from({ length: 200 }, () => Date.now()); }, async save() {} };
  const { res, seen } = await freeChart({ store: full, engine: async () => assert.fail("engine called") });
  assert.equal(res.status, 429);
  assert.equal(parse(res).error.key, "chart-too-many");
  assert.match(parse(res).error.message, /nothing was charged/i);
  assert.deepEqual(kinds(seen), ["chart-rate-limited"]);
});

// --- the reading page ------------------------------------------------------------

async function readingCall({ s, token }) {
  const n = notes();
  const res = await handleReading({ body: JSON.stringify({ token }), store: s, secret: SECRET, note: n.note });
  return { res, seen: n.seen };
}

test("reading, the store does not answer: 'nothing is lost', not 'bad link'", async () => {
  const s = store();
  const id = await saveReading(s, { tier: 1, output: null, ...BUYER, sku: "chart", purchasedAt: Date.now() });
  const { res, seen } = await readingCall({ s: broken(), token: mintReadingLink({ id, tier: 1 }, SECRET) });
  assert.equal(res.status, 503);
  assert.equal(parse(res).error.key, "reading-unavailable");
  // Said on every tier, so never "your reading" (10/22 verbatim read): this is a chart.
  assert.equal(parse(res).error.heading, "Nothing is lost");
  assert.doesNotMatch(`${parse(res).error.heading} ${parse(res).error.message}`, /reading/i);
  assert.deepEqual(kinds(seen), ["reading-store-unavailable"]);
});

test("reading, expired and forged links keep their answers, recorded as noise", async () => {
  const s = store();
  const id = await saveReading(s, { tier: 1, output: null, ...BUYER, sku: "chart", purchasedAt: Date.now() });
  const old = mintReadingLink({ id, tier: 1, now: Date.now() - 30 * 86_400_000 }, SECRET);
  const a = await readingCall({ s, token: old });
  assert.equal(a.res.status, 410);
  assert.equal(parse(a.res).error.code, "link_expired");
  // The tier's own word (10/22 verbatim read): a chart's expired link keeps "your chart".
  assert.equal(parse(a.res).error.message, "This link has expired — they last six days. Your chart is kept for a year, so it can be sent to you again.");
  assert.deepEqual(kinds(a.seen), ["reading-link-expired"]);
  const b = await readingCall({ s, token: "forged.token" });
  assert.equal(b.res.status, 404);
  assert.deepEqual(kinds(b.seen), ["reading-link-bad"]);
});

test("reading, an expired link says the tier it was signed for: summary, chart, reading", async () => {
  const s = store();
  const said = [];
  for (const tier of [0, 1, 2]) {
    const id = await saveReading(s, { tier, output: null, ...BUYER, sku: ["summary", "chart", "reading"][tier], purchasedAt: Date.now() });
    const { res } = await readingCall({ s, token: mintReadingLink({ id, tier, now: Date.now() - 30 * 86_400_000 }, SECRET) });
    said.push(parse(res).error.message.match(/Your (\w+) is kept for a year/)?.[1]);
  }
  assert.deepEqual(said, ["summary", "chart", "reading"]);
});

// --- the PDF download --------------------------------------------------------------

async function pdfCall({ s, token, build = async () => new Uint8Array([37, 80, 68, 70]), accept = "text/html" }) {
  const n = notes();
  const res = await handlePdf({ token, secret: SECRET, store: s, build, links: {}, accept, note: n.note });
  return { res, seen: n.seen };
}
async function filledChart() {
  const s = store();
  const id = await saveReading(s, { tier: 1, output: null, ...BUYER, sku: "chart", purchasedAt: Date.now() });
  await fillReading(s, id, { type: "Generator" });
  return { s, token: mintReadingLink({ id, tier: 1 }, SECRET) };
}

test("pdf, the builder throws: a calm PAGE, never a raw JSON body in a browser tab", async () => {
  const { s, token } = await filledChart();
  const { res, seen } = await pdfCall({ s, token, build: async () => { throw new TypeError("Cannot read properties of undefined"); } });
  assert.equal(res.status, 500);
  assert.match(res.headers["Content-Type"], /text\/html/);
  assert.match(res.body, /Your PDF didn.t come together just now/);
  assert.match(res.body, /href="\/r\//, "no way back to the reading");
  assert.doesNotMatch(res.body, /pdf_failed|\{"error"|Cannot read properties/);
  assert.deepEqual(kinds(seen), ["pdf-build-failed"]);
});

test("pdf, a caller that asks only for JSON still gets JSON", async () => {
  const { s, token } = await filledChart();
  const { res } = await pdfCall({ s, token, accept: "application/json", build: async () => { throw new Error("x"); } });
  assert.equal(parse(res).error.key, "pdf-unavailable");
});

test("pdf, the store does not answer: ours, with the way back", async () => {
  const { token } = await filledChart();
  const { res, seen } = await pdfCall({ s: broken(), token });
  assert.equal(res.status, 503);
  assert.match(res.body, /Your PDF didn.t come together/);
  assert.deepEqual(kinds(seen), ["pdf-store-unavailable"]);
});

test("pdf, expired / not ready / bad link: each its own page", async () => {
  const s = store();
  const id = await saveReading(s, { tier: 1, output: null, ...BUYER, sku: "chart", purchasedAt: Date.now() });
  const pending = await pdfCall({ s, token: mintReadingLink({ id, tier: 1 }, SECRET) });
  assert.equal(pending.res.status, 409);
  assert.match(pending.res.body, /haven.t been entered yet/);
  assert.deepEqual(kinds(pending.seen), ["pdf-not-ready"]);

  const old = await pdfCall({ s, token: mintReadingLink({ id, tier: 1, now: Date.now() - 30 * 86_400_000 }, SECRET) });
  assert.equal(old.res.status, 410);
  assert.match(old.res.body, /fresh link/);
  // A chart's PDF says chart, and goes back to the chart (10/22 verbatim read).
  assert.match(old.res.body, /Your chart is kept for a year, and a fresh link can be sent from your page./);
  assert.match(old.res.body, />Back to your chart</);
  assert.doesNotMatch(old.res.body, /your reading/i);
  assert.deepEqual(kinds(old.seen), ["pdf-link-expired"]);

  const bad = await pdfCall({ s, token: "forged.token" });
  assert.equal(bad.res.status, 404);
  assert.doesNotMatch(bad.res.body, /href="\/r\//, "a forged link was offered a way 'back'");
  assert.deepEqual(kinds(bad.seen), ["pdf-link-bad"]);
});

test("pdf, the happy path hands back bytes and records nothing", async () => {
  const { s, token } = await filledChart();
  const { res, seen } = await pdfCall({ s, token });
  assert.equal(res.status, 200);
  assert.ok(res.bytes);
  assert.deepEqual(kinds(seen), []);
});

// --- sending the link again ------------------------------------------------------

async function resendCall({ s, counters: c, send }) {
  const id = await saveReading(s.real ?? s, { tier: 1, output: null, ...BUYER, sku: "chart", purchasedAt: Date.now() });
  const n = notes();
  const res = await handleResend({
    body: JSON.stringify({ token: mintReadingLink({ id, tier: 1 }, SECRET) }),
    store: s.view ?? s,
    counters: c ?? { async load() { return []; }, async save() {} },
    visitorKey: "v",
    secret: SECRET,
    send: send ?? (async () => ({ ok: true })),
    origin: "https://shop.example",
    links: {},
    note: n.note,
  });
  return { res, seen: n.seen };
}

test("resend, the sender fails: the same calm sentence, follow-up noted", async () => {
  for (const send of [async () => ({ ok: false, reason: "provider_down" }), async () => { throw new Error("x"); }]) {
    const { res, seen } = await resendCall({ s: store(), send });
    assert.equal(res.status, 502);
    assert.equal(parse(res).error.key, "resend-unavailable");
    assert.deepEqual(kinds(seen), ["resend-email-failed"]);
  }
});

test("resend, the counter store throws: ours, not a crash", async () => {
  const { res, seen } = await resendCall({ s: store(), counters: { async load() { return []; }, async save() { throw new Error("down"); } } });
  assert.equal(res.status, 503);
  assert.equal(parse(res).error.key, "resend-unavailable");
  assert.deepEqual(kinds(seen), ["resend-store-unavailable"]);
});

test("resend, the reading store throws: ours, not 'that link could not be opened'", async () => {
  const real = store();
  const { res, seen } = await resendCall({ s: { real, view: broken() } });
  assert.equal(res.status, 503);
  assert.deepEqual(kinds(seen), ["resend-store-unavailable"]);
});

test("resend, too many: the customer is told it will go through, the record says which limit", async () => {
  const full = { async load() { return Array.from({ length: 30 }, () => Date.now()); }, async save() {} };
  const { res, seen } = await resendCall({ s: store(), counters: full });
  assert.equal(res.status, 429);
  assert.equal(parse(res).error.code, "too_many");
  assert.deepEqual(kinds(seen), ["resend-too-many"]);
  assert.match(seen[0].detail, /visitor limit/);
  assert.doesNotMatch(res.body, /visitor|reading limit/);
});

// --- the writer ------------------------------------------------------------------

async function waitingReading() {
  const s = store();
  const id = await saveReading(s, { tier: 2, output: null, ...BUYER, sku: "reading", purchasedAt: Date.now() });
  await fillReading(s, id, { type: "Generator", profile: "1/3" });
  return { s, id };
}

for (const [made, kind] of [
  [{ ok: false, reason: "http", detail: "gemini 503" }, "gemini-503"],
  [{ ok: false, reason: "http", detail: "gemini 429" }, "gemini-429"],
  [{ ok: false, reason: "timeout", detail: "no reply" }, "gemini-timeout"],
  [{ ok: false, reason: "network", detail: "no reply" }, "gemini-network"],
]) {
  test(`writer, ${kind}: paged by name, the buyer only ever sees 'being written'`, async () => {
    const { s, id } = await waitingReading();
    const health = store();
    const alerts = [];
    const r = await interpretOne({
      id,
      store: s,
      health,
      apiKey: "k",
      prompt: "p",
      generate: async () => made,
      deliver: { alert: async (m) => alerts.push(m) },
      origin: "https://shop.example",
    });
    assert.equal(r.ok, false);
    const filed = [...health.data.values()].filter((e) => e.kind);
    // A first timeout is re-asked once, and noted (internal) before the page (10/22).
    assert.deepEqual(filed.map((e) => e.kind), kind === "gemini-timeout" ? ["gemini-timeout-reasked", kind] : [kind]);
    assert.equal(filed.at(-1).severity, "page-jeremy");
    assert.equal(filed.at(-1).customer, "reading-writing-long");
    assert.equal(alerts.length, 1);
    assert.match(alerts[0].subject, new RegExp(kind));
  });
}

test("writer, the 'it is ready' email fails: recorded, where it used to be a log line", async () => {
  const { s, id } = await waitingReading();
  const health = store();
  const r = await interpretOne({
    id,
    store: s,
    health,
    apiKey: "k",
    prompt: "p",
    grantSecret: SECRET,
    origin: "https://shop.example",
    generate: async () => ({ ok: true, text: "A reading." }),
    deliver: { email: async () => { throw new Error("ready-email rejected"); } },
  });
  assert.equal(r.ok, true);
  const filed = [...health.data.values()].filter((e) => e.kind);
  assert.deepEqual(filed.map((e) => [e.kind, e.severity]), [["reading-ready-email", "needs-follow-up"]]);
});

// --- the net under every function ------------------------------------------------

test("guard: anything thrown becomes the path's calm sentence, recorded as <name>-crash", async () => {
  const health = store();
  const handler = guard("reading", async () => { throw new ReferenceError("record is not defined"); }, { health: () => health });
  const res = await handler(new Request("https://shop.example/api/reading", { method: "POST" }));
  assert.equal(res.status, 500);
  const body = await res.json();
  assert.equal(body.error.key, "reading-unavailable");
  assert.doesNotMatch(JSON.stringify(body), RAW);
  const filed = [...health.data.values()].filter((e) => e.kind);
  assert.deepEqual(filed.map((e) => [e.kind, e.severity]), [["reading-crash", "page-jeremy"]]);
  assert.match(filed[0].detail, /ReferenceError/);
});

test("guard: a store that cannot even be opened is caught too", async () => {
  const handler = guard("claim", async () => { throw new Error("x"); }, { health: () => { throw new Error("no blobs here"); } });
  const res = await handler(new Request("https://shop.example/api/claim", { method: "POST" }));
  assert.equal(res.status, 500);
  assert.equal((await res.json()).error.key, "claim-confirm-later");
});

test("guard: a navigation path answers with a page", async () => {
  const handler = guard("pdf", async () => { throw new Error("x"); }, {
    health: () => null,
    page: (e, status) => new Response(messagePage({ heading: e.heading, message: e.message }), { status, headers: { "Content-Type": "text/html" } }),
  });
  const res = await handler(new Request("https://shop.example/api/pdf"));
  assert.match(await res.text(), /HUMAN DESIGN by THE CHAMPAGNE METHOD COACHING AND CONSULTING/);
});

test("the message page escapes what it is given and links the readings address", () => {
  const html = messagePage({ heading: "<b>x</b>", message: customerText("our-side-generic"), back: "//evil.example" });
  assert.doesNotMatch(html, /<b>x<\/b>/);
  assert.match(html, /mailto:hd-readings@thechampagnemethod\.co/);
  assert.doesNotMatch(html, /evil\.example/, "a protocol-relative 'back' link got through");
});

test("customerError never lets raw text through, and falls back to the generic net", () => {
  const { status, payload } = customerError("not-a-registered-kind");
  assert.equal(status, 500);
  assert.equal(payload.error.key, "our-side-generic");
});
