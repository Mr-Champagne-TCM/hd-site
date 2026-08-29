import { test } from "node:test";
import assert from "node:assert/strict";
import { interpretOne } from "../netlify/lib/interpretJob.mjs";
import { generateReading } from "../netlify/lib/gemini.mjs";
import {
  DISCLAIMER,
  HEADINGS,
  SUMMARY_KEYS,
  SUMMARY_MARKER,
  chartFactsOnly,
  promptProblem,
} from "../netlify/lib/interpretation.mjs";
import { saveReading, fillReading, loadReading } from "../netlify/lib/reading.mjs";
import { TEXT } from "./support/tier2Fixture.mjs";

/**
 * Writing the reading tier.
 *
 * The thing under test is what somebody is handed for forty-four dollars, so
 * none of this is allowed to depend on Google being reachable.
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

async function readyReading(tier = 2) {
  const store = fakeStore();
  const id = await saveReading(store, {
    tier,
    output: null,
    name: "Jeremy Champagne",
    email: "buyer@example.com",
    phone: null,
    sku: "reading",
    purchasedAt: Date.now(),
  });
  await fillReading(store, id, OUTPUT);
  return { store, id };
}

const ok = async () => ({ ok: true, text: TEXT });

/**
 * A STAND-IN PROMPT. The real one is configuration, not code -- it cannot live
 * in a public repo -- so nothing here may depend on it being present. This is
 * built from the validator's own constants, which is also the point: what these
 * tests check is the PLUMBING, and whether a real prompt agrees with the
 * validator is checked at runtime by `promptProblem`, against the prompt that
 * is actually deployed rather than a copy of it.
 */
const FAKE_PROMPT = [
  SUMMARY_MARKER,
  ...SUMMARY_KEYS.map((k) => `${k}:`),
  ...HEADINGS,
  DISCLAIMER,
].join("\n");

test("a reading is written, filed, and the buyer is told", async () => {
  const { store, id } = await readyReading();
  const emails = [];
  const r = await interpretOne({
    id,
    store,
    health: fakeStore(),
    apiKey: "k",
    grantSecret: "s".repeat(32),
    origin: "https://x",
    generate: ok,
    deliver: { email: async (m) => emails.push(m) },
  });
  assert.equal(r.ok, true);
  const after = await loadReading(store, id);
  assert.ok(after.reading.includes("Your incarnation cross"));
  assert.equal(emails.length, 1);
  assert.equal(emails[0].to, "buyer@example.com");
  assert.match(emails[0].url, /^https:\/\/x\/r\/.+/);
});

test("A READING IS WRITTEN ONCE, and running the job again does not rewrite it", async () => {
  // A model asked twice answers twice. A document that changes under somebody
  // quoting it back to their coach is worse than one that is imperfect -- and
  // this job has to be safe to run twice, because the sweeper will.
  const { store, id } = await readyReading();
  const base = { id, store, health: fakeStore(), apiKey: "k", generate: ok };
  await interpretOne(base);
  const first = (await loadReading(store, id)).reading;

  const second = await interpretOne({
    ...base,
    generate: async () => ({ ok: true, text: TEXT.replace("IN SHORT", "IN SHORT") + " DIFFERENT" }),
  });
  assert.equal(second.ok, false);
  assert.equal(second.reason, "already_written");
  assert.equal((await loadReading(store, id)).reading, first, "the reading was rewritten");
});

test("THE CHART TIER NEVER GETS READING-TIER CONTENT", async () => {
  const { store, id } = await readyReading(1);
  const r = await interpretOne({ id, store, health: fakeStore(), apiKey: "k", generate: ok });
  assert.equal(r.reason, "wrong_tier");
  assert.equal((await loadReading(store, id)).reading, null);
});

test("a purchase with no chart yet is left alone", async () => {
  const store = fakeStore();
  const id = await saveReading(store, {
    tier: 2,
    output: null,
    name: "J",
    email: "b@example.com",
    phone: null,
    sku: "reading",
    purchasedAt: Date.now(),
  });
  const r = await interpretOne({ id, store, health: fakeStore(), apiKey: "k", generate: ok });
  assert.equal(r.reason, "no_chart_yet");
});

test("A FAILED GENERATION IS REPORTED, because nobody else can see it", async () => {
  // The buyer has a chart and is waiting for words that are never coming, and
  // every other surface looks fine.
  const { store, id } = await readyReading();
  const health = fakeStore();
  const r = await interpretOne({
    id,
    store,
    health,
    apiKey: "k",
    generate: async () => ({ ok: false, reason: "malformed", detail: "missing a section" }),
  });
  assert.equal(r.ok, false);
  const incidents = [...health.data.values()];
  assert.equal(incidents.length, 1);
  assert.equal(incidents[0].kind, "interpretation-malformed");
  assert.equal(incidents[0].detail, "missing a section");
});

test("nothing about the chart reaches the incident", async () => {
  const { store, id } = await readyReading();
  const health = fakeStore();
  await interpretOne({
    id,
    store,
    health,
    apiKey: "k",
    generate: async () => ({ ok: false, reason: "http", detail: "gemini 429" }),
  });
  const written = JSON.stringify([...health.data.values()]);
  for (const secret of ["Manifesting", "Charisma", "Jeremy", "example.com", "Eden"]) {
    assert.ok(!written.includes(secret), `"${secret}" reached the health store`);
  }
});

// --- the call itself, without a network ------------------------------------

test("ONLY CHART VALUES CROSS THE WIRE", async () => {
  // The rule that cannot be fixed after the fact, asserted against the ACTUAL
  // request body rather than against the helper that builds it.
  let sent = null;
  await generateReading(
    { ...OUTPUT, name: "Jeremy Champagne", email: "buyer@example.com", birth: { date: "1983-09-17" } },
    {
      apiKey: "k",
      prompt: FAKE_PROMPT,
      fetchImpl: async (_url, init) => {
        sent = init.body;
        return { ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text: TEXT }] } }] }) };
      },
    },
  );
  for (const secret of ["Jeremy", "Champagne", "buyer@example.com", "1983", "09-17"]) {
    assert.ok(!sent.includes(secret), `"${secret}" was sent to Google`);
  }
  assert.ok(sent.includes("Manifesting Generator"), "the chart did not travel either");
});

test("the key travels in a header, never in the URL", async () => {
  // A URL ends up in logs, in proxies, and in error reports.
  let url = null;
  let headers = null;
  await generateReading(OUTPUT, {
    apiKey: "SECRET-KEY",
    prompt: FAKE_PROMPT,
    fetchImpl: async (u, init) => {
      url = u;
      headers = init.headers;
      return { ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text: TEXT }] } }] }) };
    },
  });
  assert.ok(!url.includes("SECRET-KEY"), "the api key is in the request URL");
  assert.equal(headers["x-goog-api-key"], "SECRET-KEY");
});

test("a malformed answer is retried exactly once, and other failures are not", async () => {
  // Measured by the app: over twelve generations the model dropped a required
  // heading twice. A bad key fails identically the second time -- nothing to
  // gain, and a second bill to pay.
  let calls = 0;
  const bad = await generateReading(OUTPUT, {
    apiKey: "k",
    prompt: FAKE_PROMPT,
    fetchImpl: async () => {
      calls += 1;
      return { ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text: "too short" }] } }] }) };
    },
  });
  assert.equal(bad.ok, false);
  assert.equal(bad.reason, "malformed");
  assert.equal(calls, 2, "a malformed reading was not retried once");

  let httpCalls = 0;
  const refused = await generateReading(OUTPUT, {
    apiKey: "k",
    prompt: FAKE_PROMPT,
    fetchImpl: async () => {
      httpCalls += 1;
      return { ok: false, status: 403, json: async () => ({}) };
    },
  });
  assert.equal(refused.reason, "http");
  assert.equal(httpCalls, 1, "a refusal was retried");
});

test("A MALFORMED READING IS NEVER STORED", async () => {
  // The validator is the whole reason the generator was written second.
  const { store, id } = await readyReading();
  const r = await interpretOne({
    id,
    store,
    health: fakeStore(),
    apiKey: "k",
    generate: (output, opts) =>
      generateReading(output, {
        ...opts,
        prompt: FAKE_PROMPT,
        fetchImpl: async () => ({
          ok: true,
          json: async () => ({ candidates: [{ content: { parts: [{ text: "a plausible paragraph." }] } }] }),
        }),
      }),
  });
  assert.equal(r.ok, false);
  assert.equal((await loadReading(store, id)).reading, null, "rubbish was filed as a reading");
});

test("the error body from Google is never echoed, only its status", async () => {
  // An error body can quote the request back, and the request is a chart.
  const r = await generateReading(OUTPUT, {
    apiKey: "k",
    prompt: FAKE_PROMPT,
    fetchImpl: async () => ({
      ok: false,
      status: 400,
      json: async () => ({ error: { message: "bad request: Manifesting Generator ..." } }),
    }),
  });
  assert.equal(r.detail, "gemini 400");
  assert.ok(!r.detail.includes("Manifesting"));
});

test("a dropped connection and a timeout are both answers, not throws", async () => {
  const dropped = await generateReading(OUTPUT, {
    apiKey: "k",
    prompt: FAKE_PROMPT,
    fetchImpl: async () => {
      throw new Error("socket hang up");
    },
  });
  assert.equal(dropped.reason, "network");

  const timedOut = await generateReading(OUTPUT, {
    apiKey: "k",
    prompt: FAKE_PROMPT,
    fetchImpl: async () => {
      const e = new Error("aborted");
      e.name = "AbortError";
      throw e;
    },
  });
  assert.equal(timedOut.reason, "timeout");
});

test("no key is a refusal, not a crash", async () => {
  assert.equal((await generateReading(OUTPUT, {})).reason, "misconfigured");
});

test("A PROMPT THAT HAS FALLEN BEHIND THE VALIDATOR IS NAMED, not suffered", () => {
  // The prompt is configuration now -- it cannot be committed to a public repo
  // -- so it CAN drift from the validator, which a committed constant could
  // not. A prompt missing a heading fails every reading, for every buyer, with
  // a message about the model rather than about the configuration.
  assert.equal(promptProblem(FAKE_PROMPT), null, "the stand-in prompt does not satisfy the validator");
  assert.match(promptProblem(""), /No reading prompt is configured/);
  assert.match(
    promptProblem(FAKE_PROMPT.replace(HEADINGS[5], "")),
    new RegExp(HEADINGS[5]),
    "a missing heading was not named",
  );
  assert.match(
    promptProblem(FAKE_PROMPT.replace("Signature:", "")),
    /Signature/,
    "a missing summary row was not named",
  );
});

test("NO PROMPT, NO REQUEST", async () => {
  // A reading written to a prompt we did not choose is worse than no reading,
  // and nothing must be sent to Google before that is settled.
  let called = false;
  const r = await generateReading(OUTPUT, {
    apiKey: "k",
    prompt: "",
    fetchImpl: async () => {
      called = true;
      return { ok: true, json: async () => ({}) };
    },
  });
  assert.equal(r.reason, "misconfigured");
  assert.equal(r.detail, "no READING_PROMPT");
  assert.equal(called, false, "a request went out with no prompt");
});

test("the facts helper and the request agree about what a chart is", () => {
  const facts = chartFactsOnly(OUTPUT);
  assert.match(facts, /^Type: Manifesting Generator$/m);
  assert.match(facts, /^Channels: 20-34 \(Charisma\)$/m);
});
