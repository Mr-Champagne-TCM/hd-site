import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { deployContext, mayPage, noteDeployContext } from "../netlify/lib/deployContext.mjs";
import { guard, noteFailure } from "../netlify/lib/failures.mjs";
import { checkFailureRate, reportFailure } from "../netlify/lib/health.mjs";

/**
 * BATCH-1024 ITEM 4 (10/23 21:47): a draft deployed with no secrets filed a
 * "places-misconfigured" incident, severity page-jeremy, into the LIVE health
 * store -- every deploy shares the blob stores. Only production files
 * page-jeremy incidents and sends alerts now; any other deploy context logs
 * and stops. Nothing known (tests, the local rig) behaves as production did.
 */

const ENV_KEYS = ["CONTEXT", "NETLIFY_BLOBS_CONTEXT", "ENGINE_KEY", "ENGINE_URL", "RATE_SALT", "RESEND_API_KEY", "URL"];
const savedEnv = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
const realFetch = globalThis.fetch;
const realNetlify = globalThis.Netlify;

afterEach(() => {
  noteDeployContext(null);
  for (const [k, v] of Object.entries(savedEnv)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  globalThis.fetch = realFetch;
  if (realNetlify === undefined) delete globalThis.Netlify;
  else globalThis.Netlify = realNetlify;
});

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
    async list({ prefix = "" } = {}) {
      return { blobs: [...m.keys()].filter((k) => k.startsWith(prefix)).map((key) => ({ key })) };
    },
  };
}
const incidentsIn = (store) => [...store.m.entries()].filter(([k]) => k.startsWith("incident/")).map(([, v]) => v);

/** A console.log that is also kept, so the test can read what the function said. */
async function logged(fn) {
  const lines = [];
  const real = console.log;
  console.log = (...a) => lines.push(a.join(" "));
  try {
    return { result: await fn(), lines };
  } finally {
    console.log = real;
  }
}

function sender() {
  const sent = [];
  const send = async (m) => sent.push(m);
  return { sent, send };
}

test("item 4: where the deploy context comes from -- the handed context first, then Netlify's global, then CONTEXT", () => {
  delete process.env.CONTEXT;
  assert.equal(deployContext(), null);
  assert.equal(mayPage(), true, "nothing known must behave as production did");
  process.env.CONTEXT = "branch-deploy";
  assert.equal(deployContext(), "branch-deploy");
  globalThis.Netlify = { context: { deploy: { context: "deploy-preview" } } };
  assert.equal(deployContext(), "deploy-preview");
  noteDeployContext({ deploy: { context: "production" } });
  assert.equal(deployContext(), "production");
  assert.equal(mayPage(), true);
  // A context with no deploy block (the rig's) changes nothing.
  noteDeployContext({ deploy: { id: "rig" } });
  assert.equal(deployContext(), "production");
  noteDeployContext(null);
  delete globalThis.Netlify;
  for (const c of ["deploy-preview", "branch-deploy", "dev", "draft"]) {
    process.env.CONTEXT = c;
    assert.equal(mayPage(), false, c);
  }
  // A global that throws outside a request is passed over.
  globalThis.Netlify = {
    get context() {
      throw new Error("not in a request");
    },
  };
  process.env.CONTEXT = "production";
  assert.equal(deployContext(), "production");
});

test("item 4: production -- the page-jeremy incident is filed and Jeremy is paged, as before", async () => {
  noteDeployContext({ deploy: { context: "production" } });
  const store = memoryStore();
  const { sent, send } = sender();
  const r = await noteFailure(store, "places-misconfigured", { detail: "ENGINE_KEY, ENGINE_URL or RATE_SALT is not set", send, site: "https://x.test" });
  assert.equal(r.recorded, true);
  assert.equal(r.alerted, true);
  assert.equal(incidentsIn(store).length, 1);
  assert.equal(incidentsIn(store)[0].severity, "page-jeremy");
  assert.equal(sent.length, 1);
});

test("item 4: unknown context (tests, the rig) -- filed and paged, as before", async () => {
  delete process.env.CONTEXT;
  const store = memoryStore();
  const { sent, send } = sender();
  const r = await noteFailure(store, "places-misconfigured", { detail: "d", send });
  assert.equal(r.alerted, true);
  assert.equal(incidentsIn(store).length, 1);
  assert.equal(sent.length, 1);
});

test("item 4: a draft or preview -- no page-jeremy incident, no alert, a line in the log", async () => {
  for (const how of ["handed", "global", "env"]) {
    noteDeployContext(null);
    delete globalThis.Netlify;
    delete process.env.CONTEXT;
    if (how === "handed") noteDeployContext({ deploy: { context: "deploy-preview" } });
    if (how === "global") globalThis.Netlify = { context: { deploy: { context: "deploy-preview" } } };
    if (how === "env") process.env.CONTEXT = "deploy-preview";
    const store = memoryStore();
    const { sent, send } = sender();
    // With a sender (secrets present) and without one (the 10/23 draft had none).
    for (const s of [send, undefined]) {
      const { result, lines } = await logged(() => noteFailure(store, "places-misconfigured", { detail: "d", send: s }));
      assert.deepEqual(result, { recorded: false, alerted: false, notProduction: true }, how);
      assert.ok(lines.some((l) => /places-misconfigured: not filed and no alert -- deploy context "deploy-preview" is not production/.test(l)), lines.join("\n"));
    }
    assert.equal(store.m.size, 0, `${how}: something was written`);
    assert.equal(sent.length, 0, `${how}: Jeremy was paged`);
  }
});

test("item 4: a draft still keeps a follow-up incident on file (only page-jeremy is held back), and pages nobody", async () => {
  noteDeployContext({ deploy: { context: "branch-deploy" } });
  const store = memoryStore();
  const { sent, send } = sender();
  const r = await noteFailure(store, "checkout-stripe-failed", { detail: "stripe 500", send });
  assert.equal(r.alerted, false);
  assert.equal(incidentsIn(store).length, 1);
  assert.equal(incidentsIn(store)[0].severity, "needs-follow-up");
  assert.equal(sent.length, 0);
});

test("item 4: reportFailure and the sweep's rate alarm page only from production", async () => {
  noteDeployContext({ deploy: { context: "deploy-preview" } });
  const store = memoryStore();
  const { sent, send } = sender();
  const r = await logged(() => reportFailure(store, { kind: "claim-crash", detail: "x", severity: "page-jeremy", send }));
  assert.equal(r.result.alerted, false);
  assert.equal(store.m.size, 0);
  // Six refused drafts in the hour (the alarm's limit), on file from production earlier.
  const now = Date.now();
  for (let i = 0; i < 6; i++) store.m.set(`incident/${now - 1000 * (i + 1)}-${i}`, { kind: "gemini-refused", at: now - 1000 * (i + 1) });
  const rate = await logged(() => checkFailureRate(store, { now, send }));
  assert.equal(rate.result.alarmed, true);
  assert.equal(rate.result.alerted, false);
  assert.equal(sent.length, 0);
  assert.equal(incidentsIn(store).filter((i) => i.kind === "reading-failure-rate").length, 0);
  // The same store from production: the alarm files and pages.
  noteDeployContext({ deploy: { context: "production" } });
  const live = await checkFailureRate(store, { now, send });
  assert.equal(live.alerted, true);
  assert.equal(sent.length, 1);
});

test("item 4: guard() takes the deploy context from the function's own context object", async () => {
  const store = memoryStore();
  const { sent } = sender();
  const crash = guard(
    "checkout",
    async () => {
      throw new Error("boom");
    },
    { health: () => store },
  );
  process.env.RESEND_API_KEY = "re_made_up_never_used";
  globalThis.fetch = async () => {
    throw new Error("nothing may be sent from a draft");
  };
  const r = await logged(() => crash(new Request("https://draft--site.netlify.app/api/checkout", { method: "POST" }), { deploy: { context: "deploy-preview" } }));
  assert.equal(r.result.status, 500);
  assert.equal(store.m.size, 0, "a draft's crash was filed as page-jeremy");
  assert.ok(r.lines.some((l) => /checkout-crash: not filed and no alert/.test(l)));
  assert.equal(sent.length, 0);
});

/** The places function as the 10/23 draft ran it: no engine secrets. Blob writes go through `fetch`, recorded here. */
async function placesWith(deploy, tag) {
  delete process.env.ENGINE_KEY;
  delete process.env.ENGINE_URL;
  delete process.env.RATE_SALT;
  delete process.env.RESEND_API_KEY;
  delete process.env.CONTEXT;
  process.env.NETLIFY_BLOBS_CONTEXT = Buffer.from(
    JSON.stringify({ edgeURL: "http://127.0.0.1:9", uncachedEdgeURL: "http://127.0.0.1:9", siteID: "made-up", token: "made-up", deployID: "made-up" }),
  ).toString("base64");
  const calls = [];
  globalThis.fetch = async (url, init = {}) => {
    calls.push({ url: String(url), method: init.method ?? "GET" });
    return new Response(null, { status: 200 });
  };
  noteDeployContext(null);
  // A fresh copy of the function each time: its own once-a-minute note gate starts empty.
  const places = (await import(`../netlify/functions/places.mjs?${tag}`)).default;
  const res = await logged(() => places(new Request("https://site.example/api/places?q=Denver"), { deploy }));
  return { res: res.result, lines: res.lines, calls };
}

test("item 4: the 10/23 case end to end -- a no-secrets draft's places call writes nothing to the health store", async () => {
  const draft = await placesWith({ id: "d1", context: "deploy-preview" }, "draft");
  assert.equal(draft.res.status, 200);
  assert.equal((await draft.res.json()).unavailable, true);
  assert.deepEqual(draft.calls, [], `the draft wrote: ${JSON.stringify(draft.calls)}`);
  assert.ok(draft.lines.some((l) => /places-misconfigured: not filed and no alert -- deploy context "deploy-preview"/.test(l)));

  const prod = await placesWith({ id: "p1", context: "production" }, "prod");
  assert.equal(prod.res.status, 200);
  const writes = prod.calls.filter((c) => c.method.toUpperCase() === "PUT" && /health/.test(c.url) && /incident/.test(c.url));
  assert.equal(writes.length, 1, `production did not file it: ${JSON.stringify(prod.calls)}`);
});

test("item 4: the digest is sent only from production", async () => {
  globalThis.fetch = async () => {
    throw new Error("nothing may be sent from a draft");
  };
  const watch = (await import("../netlify/functions/watch.mjs?draft")).default;
  const r = await logged(() => watch(new Request("https://draft--site.netlify.app/"), { deploy: { context: "deploy-preview" } }));
  assert.equal(r.result.status, 204);
  assert.ok(r.lines.some((l) => /watch: deploy context "deploy-preview" is not production, no digest/.test(l)));
});
