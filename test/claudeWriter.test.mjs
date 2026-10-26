import { test } from "node:test";
import assert from "node:assert/strict";
import { toJsonSchema, failureKind, cost, askClaude, ANTHROPIC_URL } from "../netlify/lib/claude.mjs";
import { claudeWriter, creditMonth, normalLimit, SWITCH_AT, OUT_RECHECK_MS, addSpend, monthSpend, worstWriterAsk } from "../netlify/lib/writer.mjs";
import { geminiKind } from "../netlify/lib/failures.mjs";
import { generateReading } from "../netlify/lib/gemini.mjs";
import { READING_SCHEMA } from "../netlify/lib/structured.mjs";

/**
 * CLAUDE WRITES, GEMINI CATCHES (10/23, Jeremy's T4 + T5 plan). No network: the writer's `ask` and
 * Gemini's `fetchImpl` are stand-ins.
 */

function memStore() {
  const data = new Map();
  return {
    data,
    async get(k) { return data.has(k) ? JSON.parse(JSON.stringify(data.get(k))) : null; },
    async setJSON(k, v) { data.set(k, JSON.parse(JSON.stringify(v))); },
    async list({ prefix = "" } = {}) { return { blobs: [...data.keys()].filter((k) => k.startsWith(prefix)).map((key) => ({ key })) }; },
  };
}
const ASK = { instruction: "PROMPT", user: "FACTS", schema: READING_SCHEMA, timeoutMs: 90_000 };
const OCT_20 = Date.UTC(2026, 9, 20, 12);

function walk(s, visit) {
  visit(s);
  for (const v of Object.values(s.properties ?? {})) walk(v, visit);
  if (s.items) walk(s.items, visit);
}

test("the reading form becomes a closed JSON schema with no length constraints", () => {
  const s = toJsonSchema(READING_SCHEMA);
  assert.equal(s.type, "object");
  let objects = 0;
  walk(s, (n) => {
    assert.ok(!("minItems" in n) && !("maxItems" in n) && !("propertyOrdering" in n));
    assert.equal(n.type, n.type?.toLowerCase());
    if (n.properties) {
      objects++;
      assert.equal(n.additionalProperties, false);
      assert.deepEqual(new Set(n.required), new Set(Object.keys(n.properties)));
    }
  });
  assert.ok(objects >= 3);
  assert.equal(toJsonSchema({ type: "ARRAY", items: { type: "STRING" }, minItems: 2, maxItems: 2, description: "Two." }).description, "Two. Exactly 2 items.");
});

test("the credit month runs from the 16th, and a normal draft gets 150 s", () => {
  assert.equal(creditMonth(Date.UTC(2026, 9, 16)), "2026-10");
  assert.equal(creditMonth(Date.UTC(2026, 10, 15, 23)), "2026-10");
  assert.equal(creditMonth(Date.UTC(2026, 10, 16)), "2026-11");
  assert.equal(creditMonth(Date.UTC(2026, 0, 3)), "2025-12");
  assert.equal(normalLimit(90_000), 150_000);
  assert.equal(normalLimit(150_000), 150_000);
  assert.equal(normalLimit(45_000), 90_000);
});

test("failures are sorted by what they mean", () => {
  assert.equal(failureKind({ status: 429, error: { error: { type: "rate_limit_error", message: "slow" } } }), "busy");
  assert.equal(failureKind({ status: 529, error: { error: { type: "overloaded_error" } } }), "busy");
  assert.equal(failureKind({ status: 503 }), "busy");
  assert.equal(failureKind({ status: 429, error: { error: { details: { error_code: "enforced_spend_limit_reached" } } } }), "outOfCredit");
  assert.equal(failureKind({ status: 400, error: { error: { message: "Your credit balance is too low to access the Anthropic API." } } }), "outOfCredit");
  assert.equal(failureKind({ status: 400, error: { error: { message: "You have reached your specified workspace API usage limits" } } }), "outOfCredit");
  assert.equal(failureKind({ status: 401 }), "rejected");
  assert.equal(failureKind(new Error("socket hang up")), "network");
  assert.ok(Math.abs(cost({ input_tokens: 1000, output_tokens: 10_000 }) - 0.204) < 1e-9);
  assert.ok(Math.abs(cost({ input_tokens: 1000, output_tokens: 10_000 }, true) - 0.408) < 1e-9);
});

test("fast first; a busy fast ask is asked again at once at normal speed with 150 s", async () => {
  const calls = [];
  const store = memStore();
  const w = claudeWriter({
    apiKey: "k", store, clock: () => OCT_20,
    ask: async (a) => { calls.push({ fast: a.fast, timeoutMs: a.timeoutMs }); return calls.length === 1 ? { ok: false, failure: "busy" } : { ok: true, text: "{}", cost: 0.3, org: "tcm" }; },
  });
  const r = await w(ASK);
  assert.deepEqual(calls, [{ fast: true, timeoutMs: 90_000 }, { fast: false, timeoutMs: 150_000 }]);
  assert.deepEqual(r, { ok: true, text: "{}", by: "claude-normal" });
  assert.ok(Math.abs((await monthSpend(store, "2026-10")) - 0.3) < 1e-9);
});

test("a fast ask refused (fast mode not on the account) gets one normal try; refused again, the reading waits", async () => {
  const calls = [];
  const w = claudeWriter({
    apiKey: "k", store: memStore(), clock: () => OCT_20,
    ask: async (a) => { calls.push(a.fast); return calls.length === 1 ? { ok: false, failure: "rejected", detail: "400" } : { ok: true, text: "{}", cost: 0.3, org: "tcm" }; },
  });
  assert.deepEqual(await w(ASK), { ok: true, text: "{}", by: "claude-normal" });
  assert.deepEqual(calls, [true, false]);
  // Refused at normal speed too (a dead key): the reading waits, after exactly two asks; nothing else writes.
  let asked = 0;
  const dead = claudeWriter({ apiKey: "k", store: memStore(), clock: () => OCT_20, ask: async () => { asked++; return { ok: false, failure: "rejected" }; } });
  assert.deepEqual(await dead(ASK), { ok: false, reason: "claude", detail: "rejected" });
  assert.equal(asked, 2);
});

test("the request goes to api.anthropic.com even when the environment names another address", async () => {
  const before = process.env.ANTHROPIC_BASE_URL;
  process.env.ANTHROPIC_BASE_URL = "https://gateway.invalid/anthropic";
  const urls = [];
  try {
    const r = await askClaude({
      apiKey: "k", instruction: "PROMPT", user: "FACTS", schema: READING_SCHEMA, fast: true, timeoutMs: 5_000,
      fetchImpl: async (url) => { urls.push(String(url)); throw new Error("no network in tests"); },
    });
    assert.equal(r.ok, false);
  } finally {
    if (before === undefined) delete process.env.ANTHROPIC_BASE_URL; else process.env.ANTHROPIC_BASE_URL = before;
  }
  assert.ok(urls.length >= 1);
  for (const u of urls) assert.ok(u.startsWith(`${ANTHROPIC_URL}/`), u);
});

test("past the switch, every ask is normal speed, and the switch is said once", async () => {
  const sent = [];
  const store = memStore();
  await addSpend(store, "2026-10", SWITCH_AT - 0.5, OCT_20);
  const speeds = [];
  const w = claudeWriter({
    apiKey: "k", store, clock: () => OCT_20, notify: async (m) => sent.push(m.subject),
    ask: async (a) => { speeds.push(a.fast); return { ok: true, text: "{}", cost: 0.6, org: "tcm" }; },
  });
  assert.equal((await w(ASK)).by, "claude-fast");
  assert.equal((await w(ASK)).by, "claude-normal");
  assert.equal((await w(ASK)).by, "claude-normal");
  assert.deepEqual(speeds, [true, false, false]);
  assert.equal(sent.filter((s) => s.endsWith(": switch")).length, 1);
});

test("out of credit: the reading waits, said once, and Claude is asked again only after an hour", async () => {
  const sent = [];
  let asked = 0;
  let now = OCT_20;
  let credit = false;
  const store = memStore();
  const w = claudeWriter({
    apiKey: "k", store, clock: () => now, notify: async (m) => sent.push(m.subject),
    ask: async () => { asked++; return credit ? { ok: true, text: "{}", cost: 0.5, org: "tcm" } : { ok: false, failure: "outOfCredit" }; },
  });
  assert.deepEqual(await w(ASK), { ok: false, reason: "claude", detail: "out of credit this month" });
  now += OUT_RECHECK_MS - 60_000;
  const held = await w(ASK);
  assert.equal(held.ok, false);
  assert.equal(held.reason, "claude");
  assert.match(held.detail, /^out of credit this month \(checked again \d\d:\d\d UTC\)$/);
  assert.equal(asked, 1, "no ask while the hour runs");
  // Jeremy raised the limit: the next check finds credit, and the flag is cleared.
  credit = true;
  now += 2 * 60_000;
  assert.equal((await w(ASK)).ok, true);
  assert.equal(asked, 2);
  assert.equal((await w(ASK)).ok, true);
  assert.equal(asked, 3);
  assert.equal(sent.filter((s) => s.endsWith(": out")).length, 1);
});

test("the near-limit alert sits $20 under the hd-live limit, so it can fire", async () => {
  const sent = [];
  const store = memStore();
  await addSpend(store, "2026-10", 149.8, OCT_20);
  const w = claudeWriter({ apiKey: "k", store, clock: () => OCT_20, limit: 170, notify: async (m) => sent.push(m.text), ask: async () => ({ ok: true, text: "{}", cost: 0.5, org: "tcm" }) });
  await w(ASK);
  await w(ASK);
  const near = sent.filter((t) => /\$20 from the \$170 hd-live limit/.test(t));
  assert.equal(near.length, 1);
  assert.ok(!sent.some((t) => /Gemini/.test(t)));
});

test("the test account's key never writes a customer's reading", async () => {
  const sent = [];
  const w = claudeWriter({ apiKey: "k", store: memStore(), clock: () => OCT_20, notify: async (m) => sent.push(m.subject), blockOrgs: ["test-org"], ask: async () => ({ ok: true, text: "{}", cost: 0.5, org: "test-org" }) });
  assert.deepEqual(await w(ASK), { ok: false, reason: "claude", detail: "wrong claude account" });
  assert.equal(sent.length, 1);
  const pinned = claudeWriter({ apiKey: "k", store: memStore(), clock: () => OCT_20, expectOrg: "tcm-org", ask: async () => ({ ok: true, text: "{}", cost: 0.5, org: "someone-else" }) });
  assert.deepEqual(await pinned(ASK), { ok: false, reason: "claude", detail: "wrong claude account" });
});

test("a timeout goes back to the job, which asks again with longer; no key or letter mode is a setup fault", async () => {
  const w = claudeWriter({ apiKey: "k", store: memStore(), clock: () => OCT_20, ask: async () => ({ ok: false, failure: "timeout", detail: "claude took too long" }) });
  assert.deepEqual(await w(ASK), { ok: false, reason: "timeout", detail: "claude took too long" });
  const none = claudeWriter({ apiKey: null, store: memStore(), ask: async () => assert.fail("asked") });
  assert.equal((await none(ASK)).reason, "misconfigured");
  const letter = claudeWriter({ apiKey: "k", store: memStore(), ask: async () => assert.fail("asked") });
  assert.equal((await letter({ ...ASK, schema: null })).reason, "misconfigured");
});

test("generateReading: Claude's answer goes through the same checker, and Gemini is not called", async () => {
  let geminiCalls = 0;
  const fetchImpl = async () => { geminiCalls++; throw new Error("gemini must not be asked"); };
  const output = { type: "Generator", profile: "1/3", authority: "Sacral", definedCenters: [], undefinedCenters: [], openCenters: [], channels: [] };
  const r = await generateReading(output, {
    apiKey: "gemini-key", prompt: "PROMPT", shape: "json", fetchImpl,
    writer: async () => ({ ok: true, text: "this is not the form", by: "claude-fast" }),
  });
  assert.equal(r.ok, false);
  assert.equal(r.reason, "malformed");
  assert.equal(geminiCalls, 0);
});

test("generateReading: when Claude cannot write, Google is never asked, even with a Gemini key at hand", async () => {
  let geminiCalls = 0;
  const fetchImpl = async () => { geminiCalls++; return new Response("{}", { status: 503 }); };
  const output = { type: "Generator", profile: "1/3", authority: "Sacral", definedCenters: [], undefinedCenters: [], openCenters: [], channels: [] };
  const r = await generateReading(output, {
    apiKey: "gemini-key", prompt: "PROMPT", shape: "json", fetchImpl,
    writer: async () => ({ ok: false, reason: "claude", detail: "busy" }),
  });
  assert.deepEqual([r.ok, r.reason, r.detail], [false, "claude", "busy"]);
  assert.equal(geminiCalls, 0);
  assert.equal(geminiKind(r.reason, r.detail), "claude-unavailable");
});

test("one ask's worst case is the fast limit plus the normal-speed limit (the job's budget uses it)", () => {
  assert.equal(worstWriterAsk(90_000), 240_000);
  assert.equal(worstWriterAsk(150_000), 300_000);
  assert.equal(worstWriterAsk(45_000), 135_000);
});

test("readings written at the same time never lose each other's spend", async () => {
  const store = memStore();
  const w = claudeWriter({ apiKey: "k", store, clock: () => OCT_20, ask: async () => { await new Promise((r) => setTimeout(r, 5)); return { ok: true, text: "{}", cost: 0.57, org: "tcm" }; } });
  await Promise.all(Array.from({ length: 5 }, () => w(ASK)));
  assert.ok(Math.abs((await monthSpend(store, "2026-10")) - 2.85) < 1e-6);
});
