import { test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";

import { KINDS, SEVERITY, alertContext, alertSender, noteFailure } from "../netlify/lib/failures.mjs";
import { PLAYBOOK, countTouched, optionLines, whichLines } from "../netlify/lib/playbook.mjs";
import { NOTES, fillNote } from "../netlify/lib/alertNotes.mjs";
import {
  DAILY_DIGEST_DAYS,
  RELEASE_DATE,
  WEEKLY_FROM,
  alert,
  cleanRef,
  digest,
  digestPlan,
  reportFailure,
} from "../netlify/lib/health.mjs";
import { codeFor, DASHBOARD_STEPS, handleRetryCode, readRetryToken, retryLink, RETRY_LINK_TTL_MS } from "../netlify/lib/retryCode.mjs";
import { handleClaim } from "../netlify/lib/claimHandler.mjs";
import { mintReadingLink, readReadingLink, readingIdForSession } from "../netlify/lib/reading.mjs";

/**
 * WHEN JEREMY IS PAGED (10/16): "I need a brief as well as options to resolve
 * for them." / "No refunds offered. Can make a 0% code to retry."
 */

const SECRET = randomBytes(32).toString("hex");
const ORIGIN = "https://shop.example";
const STRIPE = "sk_test_x";
const READING = "0123456789abcdef0123456789abcdef";
const SESSION = "cs_test_" + "b".repeat(40);
const NOW = Date.parse("2026-10-16T19:03:00Z");

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
    async delete(k) {
      data.delete(k);
    },
    async list() {
      return { blobs: [...data.keys()].map((key) => ({ key })) };
    },
  };
}

const ctx = (over = {}) => alertContext({ grantSecret: SECRET, origin: ORIGIN, stripeKey: STRIPE, now: () => NOW, ...over });

/** Every kind that can page: page-jeremy outright, or once money was taken. */
const PAGING = Object.entries(KINDS)
  .filter(([, k]) => k.severity === SEVERITY.PAGE || k.paid === SEVERITY.PAGE)
  .map(([kind]) => kind);

// --- the table ------------------------------------------------------------------------

test("EVERY page-jeremy kind has a brief and at least one option", () => {
  assert.ok(PAGING.length >= 40, `only ${PAGING.length} paging kinds found`);
  for (const kind of PAGING) {
    const play = PLAYBOOK[kind];
    assert.ok(play, `${kind}: no playbook row`);
    assert.ok(typeof play.brief === "string" && play.brief.length > 20, `${kind}: no brief`);
    assert.ok(play.options.length >= 1, `${kind}: no options`);
    assert.ok(["buyer", "visitor", "system"].includes(play.who), `${kind}: who`);
  }
});

test("the playbook names no kind that failures.mjs does not have", () => {
  for (const kind of Object.keys(PLAYBOOK)) assert.ok(KINDS[kind], `${kind} is not a kind`);
});

test("options are drawn only from resend / note / retry code", () => {
  for (const [kind, play] of Object.entries(PLAYBOOK)) {
    for (const o of play.options) {
      assert.ok(["resend", "resend-when-written", "code"].includes(o) || (o.startsWith("note:") && NOTES[o.slice(5)]), `${kind}: ${o}`);
    }
  }
});

test("NO OPTION, NOTE OR BRIEF EVER MENTIONS A REFUND", () => {
  const variants = [{}, { link: `${ORIGIN}/r/x`, retryLink: `${ORIGIN}/api/admin/retry-code?t=x` }];
  for (const kind of Object.keys(PLAYBOOK)) {
    for (const v of variants) {
      const words = [...optionLines({ kind }, v), PLAYBOOK[kind].brief, PLAYBOOK[kind].fix ?? "", PLAYBOOK[kind].auto ?? ""].join(" ");
      assert.doesNotMatch(words, /refund|money back|reimburs/i, kind);
    }
  }
  for (const [key, words] of Object.entries(NOTES)) assert.doesNotMatch(words, /refund|money back|reimburs/i, key);
});

test("the ready-made notes are in Jeremy's voice: warm, no command, no blame, no jargon", () => {
  for (const key of Object.keys(NOTES)) {
    const words = fillNote(key, { kind: "claim-email" });
    assert.doesNotMatch(words, /\bplease\b/i, `${key}: a plea`);
    assert.doesNotMatch(words, /^(Try|Check|Enter|Click|Reload|Refresh|Contact|Email|Wait|Open|Use)\b/, `${key}: opens with a command`);
    assert.doesNotMatch(words, /\b(error|exception|stripe|gemini|engine|blob|server|500|502|503|invalid)\b/i, `${key}: jargon`);
    assert.doesNotMatch(words, /\byou (did|made|entered) .*wrong|your mistake|your fault/i, `${key}: blames`);
    assert.match(words, /Jeremy$/, `${key}: unsigned`);
  }
  assert.match(fillNote("safe-link", { link: "https://shop.example/r/abc" }), /Here is your link: https:\/\/shop\.example\/r\/abc/);
  assert.match(fillNote("safe-link", {}), /\[their reading link\]/, "a missing link stays visible");
});

// --- one alert -------------------------------------------------------------------------

test("THE ALERT: brief (when + how many), which (Stripe + reading links), numbered options", async () => {
  const health = store();
  const sent = [];
  const send = async (m) => sent.push(m);
  send.context = ctx();
  await noteFailure(health, "claim-email", {
    detail: "rejected (tier 1)",
    paid: true,
    ref: { session: SESSION, reading: READING, tier: 1, payment: "pi_" + "c".repeat(24) },
    send,
    site: ORIGIN,
    now: NOW,
  });
  assert.equal(sent.length, 1);
  const { subject, text, html } = sent[0];
  assert.match(subject, /claim-email failed \(1 buyer\)/);
  // BRIEF
  assert.match(text, /BRIEF\nFri, Oct 16, 2:03 PM CDT -- A buyer paid and their reading link was made, but the email carrying it did not go\. Touches 1 buyer in the last 24 hours\./);
  // WHICH: one tap to Stripe (test mode carries /test) and to their reading
  assert.match(text, new RegExp(`https://dashboard\\.stripe\\.com/test/checkout/sessions/${SESSION}`));
  // A payment id carries no mode of its own; it follows its checkout session's.
  assert.match(text, /https:\/\/dashboard\.stripe\.com\/test\/payments\/pi_c+/);
  const link = text.match(/Their reading link: (https:\/\/shop\.example\/r\/\S+)/)?.[1];
  assert.ok(link, "no reading link");
  const opened = readReadingLink(link.split("/r/")[1], SECRET, NOW);
  assert.equal(opened.ok, true);
  assert.equal(opened.id, READING);
  // OPTIONS: resend, a ready-made note with their link filled in, a retry code
  assert.match(text, /OPTIONS TO RESOLVE\n  1\. Resend their link: open their reading link/);
  assert.match(text, /  2\. Reply with a ready-made note/);
  assert.ok(text.includes(`"Your purchase went through and your reading is safe. Here is your link: ${link}`));
  assert.match(text, /  3\. Give a free retry code \(one use, 100% off the tier they bought, or any tier when that is not known\).*one tap -> https:\/\/shop\.example\/api\/admin\/retry-code\?t=/);
  assert.match(text, /Severity: page-jeremy \(money was taken\)/);
  // HTML has real links
  assert.match(html, /<a href="https:\/\/dashboard\.stripe\.com\/test\/checkout\/sessions\//);
  assert.match(html, /<ol[^>]*>.*<li/s);
  // The note is copied to a buyer, so its link is shown whole -- never shortened.
  const quote = html.match(/border-left:3px solid #c9a227[^>]*>(.*?)<\/div>/s)[1];
  assert.ok(quote.includes(`>${link}</a>`), "the note's link was shortened");
});

test("a live session links to the live dashboard", () => {
  const live = "cs_live_" + "d".repeat(30);
  const [w] = whichLines({ ref: { session: live } });
  assert.equal(w.href, `https://dashboard.stripe.com/checkout/sessions/${live}`);
});

test("NOTHING PERSONAL REACHES AN ALERT: only shape-checked ids are kept", async () => {
  assert.deepEqual(cleanRef({ reading: READING, session: SESSION, email: "someone@example.invalid", name: "A Person", tier: 1 }), {
    reading: READING,
    session: SESSION,
    tier: 1,
  });
  assert.equal(cleanRef({ reading: "someone@example.invalid", session: "not-a-session" }), null);
  const health = store();
  const sent = [];
  const send = async (m) => sent.push(m);
  send.context = ctx();
  await noteFailure(health, "claim-email", {
    detail: "rejected",
    ref: { reading: READING, tier: 1, email: "someone@example.invalid", name: "A Person", birth: "1990-01-01" },
    send,
    now: NOW,
  });
  for (const body of [sent[0].text, sent[0].html, JSON.stringify([...health.data.values()])]) {
    assert.doesNotMatch(body, /someone@example|A Person|1990-01-01/);
  }
});

test("no Stripe key at runtime: no one-tap link, the dashboard steps instead", async () => {
  const sent = [];
  const send = async (m) => sent.push(m);
  send.context = ctx({ stripeKey: undefined });
  await noteFailure(store(), "claim-not-recorded", { paid: true, ref: { session: SESSION, reading: READING }, send, now: NOW });
  assert.doesNotMatch(sent[0].text, /retry-code\?t=/);
  assert.match(sent[0].text, /Stripe dashboard -> Product catalogue -> Coupons/);
  // No tier = no reading yet = no link offered that leads nowhere.
  assert.doesNotMatch(sent[0].text, /Their reading link/);
  assert.match(sent[0].text, /ALREADY HAPPENING: The purchase watcher/);
});

test("HOW MANY BUYERS: distinct purchases of that kind in the last 24 hours", async () => {
  const health = store();
  const sent = [];
  const send = async (m) => sent.push(m);
  const other = "fedcba9876543210fedcba9876543210";
  // Two earlier incidents of the kind (one buyer twice, one other buyer), one too old.
  await noteFailure(health, "claim-email", { ref: { reading: READING }, now: NOW - 3 * 3600_000 });
  await noteFailure(health, "claim-email", { ref: { reading: READING }, now: NOW - 2 * 3600_000 });
  await noteFailure(health, "claim-email", { ref: { reading: other }, now: NOW - 90 * 60_000 });
  await noteFailure(health, "claim-email", { ref: { reading: "1".repeat(32) }, now: NOW - 30 * 3600_000 });
  await noteFailure(health, "claim-email", { ref: { reading: "2".repeat(32) }, send, now: NOW });
  assert.equal(sent.length, 1);
  assert.match(sent[0].text, /Touches 3 buyers in the last 24 hours/);
  assert.match(sent[0].subject, /\(3 buyers\)/);
  assert.equal(countTouched([{ ref: { session: SESSION } }, { ref: { session: SESSION } }, {}]), 2);
});

test("the quiet hour still holds: one alert per kind per hour, with the new format", async () => {
  const health = store();
  const sent = [];
  const send = async (m) => sent.push(m);
  for (let i = 0; i < 4; i++) await noteFailure(health, "gemini-503", { ref: { reading: READING, tier: 2 }, send, now: NOW + i * 60_000 });
  assert.equal(sent.length, 1);
  assert.match(sent[0].text, /ALREADY HAPPENING: The writer is asked again every 15 minutes/);
});

test("a kind with no playbook row still alerts plainly (and never throws)", () => {
  const out = alert({ kind: "ready-email", detail: "resend 500", at: NOW, severity: "needs-follow-up" }, { linkFor: () => { throw new Error("x"); } });
  assert.match(out.subject, /ready-email failed/);
  assert.match(out.text, /resend 500/);
});

// --- the call sites pass WHICH ------------------------------------------------------------

test("claim: an email that did not go pages with the session, the reading id and a working link", async () => {
  const seen = [];
  const r = await handleClaim({
    body: JSON.stringify({ session_id: SESSION }),
    stripeKey: STRIPE,
    grantSecret: SECRET,
    getSession: async () => ({
      payment_status: "paid",
      payment_intent: "pi_" + "e".repeat(24),
      metadata: { level: "1", sku: "chart" },
      customer_details: { name: "Example Person", email: "someone@example.invalid" },
      created: 1_760_000_000,
    }),
    readings: store(),
    send: async () => ({ ok: false, reason: "rejected" }),
    note: async (kind, opts) => seen.push({ kind, ...opts }),
    origin: ORIGIN,
    links: {},
  });
  assert.equal(r.status, 200);
  const email = seen.find((s) => s.kind === "claim-email");
  assert.deepEqual(email.ref, { session: SESSION, reading: readingIdForSession(SESSION, SECRET), payment: "pi_" + "e".repeat(24), tier: 1 });
});

// --- the free retry code ---------------------------------------------------------------------

function fakeStripe({ fail = null, session = null } = {}) {
  const calls = [];
  return {
    calls,
    async getSession(id) {
      calls.push(["session", id]);
      if (!session) throw Object.assign(new Error("no such session"), { status: 404 });
      return session;
    },
    async ensureProduct(product) {
      calls.push(["product", product]);
      return { id: product.id, active: true };
    },
    async createCoupon(params, opts) {
      calls.push(["coupon", params, opts]);
      if (fail) throw Object.assign(new Error("no"), { status: fail });
      return { id: "coupon_x" };
    },
    async createPromotionCode(params, opts) {
      calls.push(["promo", params, opts]);
      return { id: "promo_x", code: params.code };
    },
  };
}
const INCIDENT = { id: `${NOW}-12345`, kind: "claim-email", ref: { reading: READING, tier: 1 } };
const minted = (stripe) => stripe.calls.filter(([what]) => what === "coupon" || what === "promo");
const tokenOf = (link) => new URL(link).searchParams.get("t");

test("RETRY LINK: only made when it can be protected (secret, origin, Stripe key, incident id)", () => {
  assert.ok(retryLink({ incident: INCIDENT, now: NOW }, { secret: SECRET, origin: ORIGIN, stripeKey: STRIPE }));
  assert.equal(retryLink({ incident: INCIDENT, now: NOW }, { secret: SECRET, origin: ORIGIN }), null);
  assert.equal(retryLink({ incident: INCIDENT, now: NOW }, { origin: ORIGIN, stripeKey: STRIPE }), null);
  assert.equal(retryLink({ incident: { kind: "x" }, now: NOW }, { secret: SECRET, origin: ORIGIN, stripeKey: STRIPE }), null);
  // Nothing on the incident can say which tier was bought: the link is still
  // made, and its code works on any tier (Jeremy 10/16).
  assert.ok(retryLink({ incident: { id: INCIDENT.id, kind: "checkout-crash" }, now: NOW }, { secret: SECRET, origin: ORIGIN, stripeKey: STRIPE }));
  // A checkout session can say it, so the link is made.
  assert.ok(retryLink({ incident: { id: INCIDENT.id, kind: "claim-not-recorded", ref: { session: SESSION } }, now: NOW }, { secret: SECRET, origin: ORIGIN, stripeKey: STRIPE }));
});

test("RETRY LINK: signed for its purpose alone -- a reading link is not one, and tampering fails", () => {
  const t = tokenOf(retryLink({ incident: INCIDENT, now: NOW }, { secret: SECRET, origin: ORIGIN, stripeKey: STRIPE }));
  assert.equal(readRetryToken(t, SECRET, NOW).ok, true);
  assert.equal(readRetryToken(t, "another-secret-entirely", NOW).ok, false);
  assert.equal(readRetryToken(t.slice(0, -2) + "xx", SECRET, NOW).ok, false);
  assert.equal(readRetryToken(mintReadingLink({ id: READING, tier: 1, now: NOW }, SECRET), SECRET, NOW).ok, false);
  assert.equal(readRetryToken(t, SECRET, NOW + RETRY_LINK_TTL_MS + 1).reason, "expired");
});

test("RETRY CODE: opening the link makes nothing; the button makes one code, once", async () => {
  const s = store();
  const stripe = fakeStripe();
  const t = tokenOf(retryLink({ incident: INCIDENT, now: NOW }, { secret: SECRET, origin: ORIGIN, stripeKey: STRIPE }));

  const look = await handleRetryCode({ method: "GET", token: t, store: s, secret: SECRET, stripe, now: NOW + 1000 });
  assert.equal(look.status, 200);
  assert.match(look.html, /Make the code/);
  assert.equal(stripe.calls.length, 0, "a GET (a mail scanner) made a code");
  assert.equal(look.headers["Cache-Control"], "no-store, private");

  const made = await handleRetryCode({ method: "POST", token: t, store: s, secret: SECRET, stripe, now: NOW + 2000 });
  assert.equal(made.status, 200);
  const code = codeFor(INCIDENT.id, SECRET);
  assert.match(made.html, new RegExp(code));
  assert.match(made.html, /covers The chart only/);
  const [[, coupon, copts], [, promo, popts]] = minted(stripe);
  assert.equal(coupon.percent_off, 100);
  assert.equal(coupon.duration, "once");
  assert.equal(coupon.max_redemptions, 1);
  // Held to the tier they bought (tier 1, the chart) -- and only that one.
  assert.deepEqual(coupon.applies_to, { products: ["hd_chart"] });
  assert.equal(promo.max_redemptions, 1);
  assert.equal(promo.code, code);
  assert.equal(copts.idempotencyKey, `retry-coupon-${INCIDENT.id}`);
  assert.equal(popts.idempotencyKey, `retry-promo-${INCIDENT.id}`);

  // Again, and from a digest's link for the SAME incident: the same code, no second mint.
  const t2 = tokenOf(retryLink({ incident: INCIDENT, now: NOW + 86_400_000 }, { secret: SECRET, origin: ORIGIN, stripeKey: STRIPE }));
  for (const token of [t, t2]) {
    const again = await handleRetryCode({ method: "POST", token, store: s, secret: SECRET, stripe, now: NOW + 90_000_000 });
    assert.match(again.html, /already made its one code/);
    assert.match(again.html, new RegExp(code));
  }
  assert.equal(minted(stripe).length, 2, "a second press made a second code");
});

test("RETRY CODE: expired, forged, no key, Stripe refusing -- each says so, with the dashboard steps", async () => {
  const t = tokenOf(retryLink({ incident: INCIDENT, now: NOW }, { secret: SECRET, origin: ORIGIN, stripeKey: STRIPE }));
  const expired = await handleRetryCode({ method: "POST", token: t, store: store(), secret: SECRET, stripe: fakeStripe(), now: NOW + RETRY_LINK_TTL_MS + 1 });
  assert.equal(expired.status, 410);
  assert.match(expired.html, /Coupons/);
  const forged = await handleRetryCode({ method: "GET", token: "abc.def", store: store(), secret: SECRET, stripe: fakeStripe(), now: NOW });
  assert.equal(forged.status, 404);
  const noKey = await handleRetryCode({ method: "POST", token: t, store: store(), secret: SECRET, stripe: null, now: NOW });
  assert.equal(noKey.status, 503);
  assert.match(noKey.html, /Coupons/);

  const s = store();
  const denied = await handleRetryCode({ method: "POST", token: t, store: s, secret: SECRET, stripe: fakeStripe({ fail: 403 }), now: NOW });
  assert.equal(denied.status, 502);
  assert.match(denied.html, /not allowed to make coupons/);
  assert.equal(s.data.size, 0, "a failed mint left the link spent");
  for (const r of [expired, forged, noKey, denied]) assert.doesNotMatch(r.html, /refund/i);
});

test("RETRY CODE: the coupon names the tier's product, which is made sure of first, for every tier", async () => {
  for (const [tier, product] of [[0, "hd_summary"], [1, "hd_chart"], [2, "hd_reading"]]) {
    const stripe = fakeStripe();
    const incident = { id: `${NOW}-${tier + 7}`, kind: "gemini-503", ref: { reading: READING, tier } };
    const t = tokenOf(retryLink({ incident, now: NOW }, { secret: SECRET, origin: ORIGIN, stripeKey: STRIPE }));
    const r = await handleRetryCode({ method: "POST", token: t, store: store(), secret: SECRET, stripe, now: NOW });
    assert.equal(r.status, 200, `tier ${tier}`);
    const order = stripe.calls.map(([what]) => what);
    assert.deepEqual(order, ["product", "coupon", "promo"], "the product is made sure of before the coupon names it");
    assert.equal(stripe.calls[0][1].id, product);
    const coupon = stripe.calls[1][1];
    assert.deepEqual(coupon.applies_to.products, [product]);
    assert.equal(coupon.percent_off, 100);
    assert.equal(coupon.max_redemptions, 1);
    assert.equal(stripe.calls[2][1].max_redemptions, 1);
    assert.equal(stripe.calls[2][1].coupon, "coupon_x");
  }
});

test("RETRY CODE: an older link without a tier finds it on the incident on file, then on their Stripe checkout", async () => {
  const id = `${NOW}-555`;
  // A link sealed before tiers travelled in it (no `t`), from a session-only incident.
  const t = tokenOf(retryLink({ incident: { id, kind: "claim-not-recorded", ref: { session: SESSION } }, now: NOW }, { secret: SECRET, origin: ORIGIN, stripeKey: STRIPE }));
  assert.equal(readRetryToken(t, SECRET, NOW).tier, null);

  // 1. The incident on file names the tier.
  const s1 = store();
  await s1.setJSON(`incident/${id}`, { id, kind: "claim-not-recorded", ref: { session: SESSION, tier: 2 } });
  const st1 = fakeStripe();
  const r1 = await handleRetryCode({ method: "POST", token: t, store: s1, secret: SECRET, stripe: st1, now: NOW });
  assert.equal(r1.status, 200);
  assert.deepEqual(minted(st1)[0][1].applies_to, { products: ["hd_reading"] });
  assert.ok(!st1.calls.some(([w]) => w === "session"), "Stripe was asked when the incident already said");

  // 2. Only the session: Stripe's paid checkout says which tier.
  const s2 = store();
  await s2.setJSON(`incident/${id}`, { id, kind: "claim-not-recorded", ref: { session: SESSION } });
  const st2 = fakeStripe({ session: { payment_status: "paid", metadata: { level: "0", sku: "hd_summary" } } });
  const r2 = await handleRetryCode({ method: "POST", token: t, store: s2, secret: SECRET, stripe: st2, now: NOW });
  assert.equal(r2.status, 200);
  assert.deepEqual(st2.calls.find(([w]) => w === "session"), ["session", SESSION]);
  assert.deepEqual(minted(st2)[0][1].applies_to, { products: ["hd_summary"] });
});

test("RETRY CODE: AN UNKNOWN TIER GETS AN ANY-TIER CODE (Jeremy 10/16: 'more is better to smooth things over')", async () => {
  const id = `${NOW}-777`;
  const t = tokenOf(retryLink({ incident: { id, kind: "claim-not-recorded", ref: { session: SESSION } }, now: NOW }, { secret: SECRET, origin: ORIGIN, stripeKey: STRIPE }));
  const cases = [
    // the incident has expired out of the store
    { s: store(), stripe: fakeStripe() },
    // the session is not paid
    { s: store(), stripe: fakeStripe({ session: { payment_status: "unpaid", metadata: { level: "1" } } }), file: true },
    // the session names a tier that does not exist
    { s: store(), stripe: fakeStripe({ session: { payment_status: "paid", metadata: { level: "7" } } }), file: true },
    // Stripe does not answer about the session
    { s: store(), stripe: fakeStripe(), file: true },
  ];
  for (const [n, c] of cases.entries()) {
    if (c.file) await c.s.setJSON(`incident/${id}`, { id, kind: "claim-not-recorded", ref: { session: SESSION } });
    // Opening the page says the code works on any tier, and makes nothing.
    const look = await handleRetryCode({ method: "GET", token: t, store: c.s, secret: SECRET, stripe: c.stripe, now: NOW });
    assert.equal(look.status, 200, `case ${n} GET`);
    assert.match(look.html, /100% off ANY tier \(which tier they bought is not known: /);
    assert.match(look.html, /Make the code/);
    assert.equal(minted(c.stripe).length, 0, `case ${n}: a GET made a code`);

    const made = await handleRetryCode({ method: "POST", token: t, store: c.s, secret: SECRET, stripe: c.stripe, now: NOW });
    assert.equal(made.status, 200, `case ${n} POST`);
    assert.match(made.html, new RegExp(codeFor(id, SECRET)));
    assert.match(made.html, /covers any tier/);
    const [[, coupon], [, promo]] = minted(c.stripe);
    // No product restriction at all -- but still one use, 100% off, once.
    assert.equal(coupon.applies_to, undefined, `case ${n}: an unknown tier was held to a product`);
    assert.equal(coupon.percent_off, 100);
    assert.equal(coupon.duration, "once");
    assert.equal(coupon.max_redemptions, 1);
    assert.equal(promo.max_redemptions, 1);
    assert.equal(coupon.metadata.tier, "any");
    assert.ok(!c.stripe.calls.some(([w]) => w === "product"), `case ${n}: a product was made for an any-tier code`);

    // Pressed again: the same code, still "any tier", no second mint.
    const again = await handleRetryCode({ method: "POST", token: t, store: c.s, secret: SECRET, stripe: c.stripe, now: NOW + 5000 });
    assert.match(again.html, /already made its one code/);
    assert.match(again.html, /covers any tier/);
    assert.equal(minted(c.stripe).length, 2, `case ${n}: a second press made a second code`);
  }
});

test("RETRY CODE: a KNOWN tier is still held to that tier, never widened to any", async () => {
  const stripe = fakeStripe();
  const t = tokenOf(retryLink({ incident: INCIDENT, now: NOW }, { secret: SECRET, origin: ORIGIN, stripeKey: STRIPE }));
  const r = await handleRetryCode({ method: "POST", token: t, store: store(), secret: SECRET, stripe, now: NOW });
  assert.equal(r.status, 200);
  assert.doesNotMatch(r.html, /any tier/);
  assert.deepEqual(minted(stripe)[0][1].applies_to, { products: ["hd_chart"] });
  assert.equal(minted(stripe)[0][1].metadata.tier, "1");
});

test("RETRY CODE: the by-hand steps cover both cases -- their tier when known, any tier when not", () => {
  assert.match(DASHBOARD_STEPS, /if it is known which they bought, tick "Apply to specific products" and pick only that one/);
  assert.match(DASHBOARD_STEPS, /if it is not known, leave that unticked so the code works on any tier/);
  assert.doesNotMatch(DASHBOARD_STEPS, /refund/i);
});

test("RETRY CODE: the page says which tier the code covers before the button is pressed", async () => {
  const t = tokenOf(retryLink({ incident: INCIDENT, now: NOW }, { secret: SECRET, origin: ORIGIN, stripeKey: STRIPE }));
  const look = await handleRetryCode({ method: "GET", token: t, store: store(), secret: SECRET, stripe: fakeStripe(), now: NOW });
  assert.match(look.html, /100% off The chart only \(the tier they bought\)/);
});

// --- the digest -------------------------------------------------------------------------------

test("DIGEST CADENCE: daily for 30 days after RELEASE_DATE, then Mondays only", () => {
  assert.equal(RELEASE_DATE, "2026-10-16");
  assert.equal(DAILY_DIGEST_DAYS, 30);
  assert.equal(WEEKLY_FROM, Date.parse("2026-11-15T00:00:00Z"));
  assert.deepEqual(digestPlan(Date.parse("2026-10-17T13:00:00Z")), { send: true, days: 1, cadence: "daily" });
  assert.deepEqual(digestPlan(Date.parse("2026-11-14T13:00:00Z")), { send: true, days: 1, cadence: "daily" });
  assert.deepEqual(digestPlan(Date.parse("2026-11-15T13:00:00Z")), { send: false, days: 7, cadence: "weekly" }); // a Sunday
  assert.deepEqual(digestPlan(Date.parse("2026-11-16T13:00:00Z")), { send: true, days: 7, cadence: "weekly" }); // Monday
  assert.deepEqual(digestPlan(Date.parse("2026-11-17T13:00:00Z")), { send: false, days: 7, cadence: "weekly" });
});

test("THE DIGEST'S PAGED ITEMS CARRY THEIR BRIEFS: which buyers, links, options", () => {
  const found = [
    { id: `${NOW}-1`, kind: "claim-email", severity: "page-jeremy", customer: null, detail: "rejected", ref: { session: SESSION, reading: READING, tier: 1 }, at: NOW },
    { id: `${NOW - 5}-2`, kind: "claim-email", severity: "page-jeremy", customer: null, detail: "rejected", ref: { reading: "f".repeat(32), tier: 1 }, at: NOW - 5 },
    { kind: "ready-email", severity: "needs-follow-up", detail: "timeout", at: NOW - 9 },
    { kind: "reading-link-expired", severity: "internal-only", customer: "reading-link-expired", at: NOW - 10 },
  ];
  const { subject, text, html } = digest({ found, days: 1, site: "https://thechampagnemethod.co", context: ctx() });
  assert.match(subject, /3 problems to follow up, 1 internal-only \(1d\)/);
  assert.match(text, /failed in the last day\./);
  // The groups are unchanged...
  for (const g of ["PAGED YOU", "TO FOLLOW UP", "INTERNAL ONLY", "WHAT CUSTOMERS WERE SHOWN"]) assert.ok(text.includes(g), g);
  // ...and the paged ones now carry their briefs.
  assert.match(text, /BRIEFS AND OPTIONS FOR WHAT PAGED YOU/);
  assert.match(text, /BRIEF: A buyer paid and their reading link was made, but the email carrying it did not go\. Touches 2 buyers in the last day\./);
  assert.match(text, new RegExp(`Stripe checkout https://dashboard\\.stripe\\.com/test/checkout/sessions/${SESSION}`));
  assert.match(text, /Their reading link https:\/\/shop\.example\/r\//);
  assert.match(text, /free retry code \(one tap\): https:\/\/shop\.example\/api\/admin\/retry-code\?t=/);
  assert.match(text, /OPTIONS TO RESOLVE:\n      1\. Resend their link/);
  assert.doesNotMatch(text, /refund/i);
  assert.match(html, /<a href="https:\/\/dashboard\.stripe\.com/);
  // The follow-up kind gets no brief block of its own.
  assert.doesNotMatch(text, /  ready-email\n    BRIEF/);
});

test("reportFailure keeps its old contract for callers that pass nothing new", async () => {
  const s = store();
  const sent = [];
  const r = await reportFailure(s, { kind: "ready-email", detail: "resend 500", now: NOW, send: async (m) => sent.push(m) });
  assert.equal(r.alerted, true);
  assert.match(sent[0].text, /resend 500/);
  assert.ok(sent[0].html, "an html body is always offered");
});

test("alertSender carries its context, so every call site gets the links untouched", () => {
  const send = alertSender("re_fixture", ctx());
  assert.equal(typeof send.context.linkFor, "function");
  assert.equal(alertSender(undefined), undefined, "no key, no sender: record only");
});
