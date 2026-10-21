/**
 * THE SHOP, RUNNING LOCALLY, WITH EVERY OUTSIDE SERVICE FAKED.
 *
 * One Node process serves:
 *   - the built site (dist/, the same files Netlify publishes) with the
 *     netlify.toml rewrites (/r/*, /u/*, /charts -> app.html);
 *   - every Netlify function under /api/*, imported from netlify/functions/
 *     and called exactly as Netlify calls a v2 function (Request in,
 *     Response out; background functions answer 202 and run on);
 *   - Netlify Blobs, from @netlify/blobs' own local server, behind a proxy
 *     that can add per-request latency (the my-charts time budget);
 *   - the chart engine (local JVM + cache, engine.mjs) at /__engine;
 *   - a fake Stripe (api + hosted page), a fake Resend outbox and a replayed
 *     Gemini, reached through a fetch() that refuses EVERY other host -- so a
 *     live call cannot happen by accident, and an attempt is reported;
 *   - the phone app's readings site handler (/__readings/r/<id>), against an
 *     empty local store;
 *   - /__rig/* controls for the driver.
 *
 * Nothing here is deployed and nothing reaches a real service.
 */
import http from "node:http";
import { createHash, randomBytes } from "node:crypto";
import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { extname, join } from "node:path";
import { pathToFileURL } from "node:url";
import { BlobsServer } from "@netlify/blobs/server";
import { fakeStripe } from "./fakeStripe.mjs";
import { fakeMail } from "./fakeMail.mjs";
import { fakeGemini } from "./fakeGemini.mjs";
import { engineCache, startEngine } from "./engine.mjs";
import { REPO, SIBLINGS } from "./paths.mjs";

const MIME = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml",
  ".json": "application/json", ".jpg": "image/jpeg", ".png": "image/png", ".ico": "image/x-icon",
  ".woff2": "font/woff2", ".txt": "text/plain", ".webmanifest": "application/manifest+json", ".pdf": "application/pdf",
};

const listen = (server, port = 0) =>
  new Promise((resolve) => server.listen(port, "127.0.0.1", () => resolve(server.address().port)));

async function readBody(req) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  return Buffer.concat(chunks);
}

async function sendResponse(res, response) {
  const headers = {};
  response.headers.forEach((v, k) => (headers[k] = v));
  const buf = Buffer.from(await response.arrayBuffer());
  res.writeHead(response.status, headers);
  res.end(buf);
}

export async function startRig({ runDir, fixturesDir, engineMode = "local", log = () => {} }) {
  mkdirSync(runDir, { recursive: true });
  const logFile = join(runDir, "harness.log");
  const hlog = (...a) => appendFileSync(logFile, a.join(" ") + "\n");

  // Function logs go to the run's log, not the terminal. (They never carry
  // birth data or tokens -- the site's own rule -- so the file is safe to read.)
  const realLog = console.log;
  console.log = (...a) => hlog("[fn]", ...a.map(String));

  /* ---------------------------------------------------------- blobs ---- */
  const blobToken = randomBytes(12).toString("hex");
  const blobsDir = join(runDir, "blobs");
  mkdirSync(blobsDir, { recursive: true });
  const blobOps = { count: 0 };
  const blobs = new LoopbackBlobs({ directory: blobsDir, token: blobToken, onRequest: () => (blobOps.count += 1) });
  const { port: blobsPort } = await blobs.start();
  let latencyMs = 0;
  /*
   * WINDOWS CANNOT NAME A FILE WITH : | * ? " < >, and the local Blobs server
   * keeps each key as a file -- so keys like "v:<visitor>" (the resend and
   * my-charts counters) or "<deploy>|<query>|25" (the place cache) fail to
   * write and the client retries for 25 s. Netlify's real store has no such
   * limit, so the proxy swaps each for a look-alike character on the way in
   * and back on the way out of a listing.
   */
  const ILLEGAL = { ":": "꞉", "|": "∣", "*": "∗", "?": "？", '"': "＂", "<": "＜", ">": "＞" };
  const BACK = Object.fromEntries(Object.entries(ILLEGAL).map(([a, b]) => [b, a]));
  const alias = (seg) => {
    let s;
    try {
      s = decodeURIComponent(seg);
    } catch {
      return seg;
    }
    return /[:|*?"<>]/.test(s) ? encodeURIComponent(s.replace(/[:|*?"<>]/g, (c) => ILLEGAL[c])) : seg;
  };
  /*
   * ONE REQUEST PER KEY AT A TIME. The local server writes a key's file in
   * place, so a read that lands mid-write gets half a JSON document (seen:
   * the page polling a reading while the writer stored it, "load failed
   * (SyntaxError)"). Netlify's store is atomic per key; this makes the local
   * one behave the same.
   */
  const lanes = new Map();
  const inLane = (key, job) => {
    const prev = lanes.get(key) ?? Promise.resolve();
    const run = prev.then(job, job);
    const tail = run.catch(() => {});
    lanes.set(key, tail);
    tail.then(() => lanes.get(key) === tail && lanes.delete(key));
    return run;
  };
  const blobProxy = http.createServer((req, res) => {
    inLane(req.url.split("?")[0], () => blobRequest(req, res)).catch(() => {
      if (!res.headersSent) res.writeHead(502);
      res.end();
    });
  });
  const blobRequest = async (req, res) => {
    if (latencyMs) await new Promise((r) => setTimeout(r, latencyMs));
    const body = req.method === "GET" || req.method === "HEAD" ? undefined : await readBody(req);
    const headers = Object.fromEntries(Object.entries(req.headers).filter(([k]) => !["host", "connection", "content-length", "transfer-encoding"].includes(k)));
    const [path, query = ""] = req.url.split("?");
    const parts = path.split("/");
    for (let i = 3; i < parts.length; i++) parts[i] = alias(parts[i]);
    const q = query.replace(/(^|&)(prefix=)([^&]*)/, (_, a, b, v) => a + b + alias(v));
    const upstream = await REAL_FETCH(`http://127.0.0.1:${blobsPort}${parts.join("/")}${q ? "?" + q : ""}`, { method: req.method, headers, body });
    if (parts.length <= 3 && (upstream.headers.get("content-type") ?? "").includes("json")) {
      const text = (await upstream.text()).replace(/[꞉∣∗？＂＜＞]/g, (c) => BACK[c]);
      res.writeHead(upstream.status, { "content-type": upstream.headers.get("content-type") });
      return res.end(text);
    }
    await sendResponse(res, upstream);
  };
  const proxyPort = await listen(blobProxy);
  const blobURL = `http://127.0.0.1:${proxyPort}`;

  /* --------------------------------------------------------- engine ---- */
  const engine = await startEngine({ mode: engineMode, log: (m) => (hlog(m), log(m)) });
  const cache = engineCache(engine, { log: hlog });
  const engineKey = randomBytes(18).toString("hex");
  const truthDir = join(runDir, "truth");
  mkdirSync(truthDir, { recursive: true });
  const engineCalls = [];

  /* ---------------------------------------------------------- server ---- */
  const server = http.createServer();
  const port = await listen(server);
  const origin = `http://127.0.0.1:${port}`;

  const stripe = fakeStripe({ origin, dir: join(runDir, "stripe") });
  const mail = fakeMail({ dir: join(runDir, "outbox") });
  const gemini = fakeGemini({ dir: join(runDir, "gemini"), fixturesDir });
  const blocked = [];

  /* The only network the site gets. */
  globalThis.fetch = async (input, init) => {
    const request = input instanceof Request ? input : new Request(input, init);
    const url = new URL(request.url);
    if (url.hostname === "127.0.0.1" || url.hostname === "localhost") return REAL_FETCH(input, init);
    if (url.hostname === "api.stripe.com") return stripe.api(request);
    if (url.hostname === "api.resend.com") return mail.api(request);
    if (url.hostname === "generativelanguage.googleapis.com") return gemini.api(request);
    blocked.push({ at: Date.now(), host: url.hostname, path: url.pathname });
    hlog(`BLOCKED outbound request to ${url.hostname}${url.pathname}`);
    throw new TypeError(`rig: outbound network to ${url.hostname} is blocked`);
  };

  /* -------------------------------------------------- the environment ---- */
  const secret = () => randomBytes(32).toString("hex");
  Object.assign(process.env, {
    URL: origin,
    GRANT_SECRET: secret(),
    RATE_SALT: secret(),
    RING_SECRET: secret(),
    // The right SHAPE, so stripe.mjs's checkKey passes; it opens nothing.
    STRIPE_SECRET_KEY: "sk_test_rig-local-fake",
    RESEND_API_KEY: "re_rig-local-fake",
    GEMINI_API_KEY: "rig-local-replay",
    ENGINE_URL: `${origin}/__engine`,
    ENGINE_KEY: engineKey,
    PAYWALL: "1",
    DEPLOY_ID: "rig",
    NETLIFY_BLOBS_CONTEXT: Buffer.from(
      JSON.stringify({ edgeURL: blobURL, uncachedEdgeURL: blobURL, siteID: "rig-local", token: blobToken, deployID: "rig" }),
    ).toString("base64"),
  });

  /* A stand-in prompt in the config store: no private words, but it carries
     what promptProblem checks for and selects form mode, as the live one does. */
  const { getStore } = await import("@netlify/blobs");
  await getStore({ name: "config", consistency: "strong" }).set(
    "reading-prompt",
    "RIG STAND-IN PROMPT. Fill the JSON form. Center states: DEFINED, UNDEFINED, OPEN. Four takeaways. " +
      "Slots: energy, decide, meet, consistent, takeIn, working.",
  );

  /* ------------------------------------------------------- functions ---- */
  const fnDir = join(REPO, "netlify", "functions");
  const routes = [];
  for (const f of readdirSync(fnDir).filter((f) => f.endsWith(".mjs"))) {
    const mod = await import(pathToFileURL(join(fnDir, f)).href);
    if (mod.config?.path) routes.push({ name: f.replace(/\.mjs$/, ""), path: mod.config.path, background: !!mod.config.background, handler: mod.default });
  }
  const inflight = new Set();
  let lastBackgroundAt = 0;

  /* ---------------------------------------------- the readings site ---- */
  let readingsSite = null;
  const phoneLib = join(SIBLINGS.phone, "hosting", "netlify", "lib", "delivery.mjs");
  if (existsSync(phoneLib)) {
    try {
      const { makeHandler } = await import(pathToFileURL(phoneLib).href);
      const empty = { getWithMetadata: async () => null, get: async () => null, delete: async () => {}, setJSON: async () => {}, list: async () => ({ blobs: [] }) };
      const mem = new Map();
      const healthStore = { get: async (k) => mem.get(k) ?? null, setJSON: async (k, v) => mem.set(k, v), set: async (k, v) => mem.set(k, v), list: async () => ({ blobs: [...mem.keys()].map((key) => ({ key })) }), delete: async (k) => mem.delete(k) };
      readingsSite = makeHandler({ deliverables: () => empty, health: () => healthStore, send: () => async () => ({ ok: true }) });
    } catch (e) {
      hlog(`readings site: could not load (${e.message})`);
    }
  }

  /* ------------------------------------------------------ static dist ---- */
  const dist = join(REPO, "dist");
  function staticFile(pathname) {
    if (/^\/(r|u)\/.+/.test(pathname) || /^\/charts(\/.*)?$/.test(pathname)) return { file: join(dist, "app.html"), status: 200 };
    let p = decodeURIComponent(pathname);
    if (p.endsWith("/")) p += "index.html";
    const f = join(dist, p);
    if (f.startsWith(dist) && existsSync(f) && statSync(f).isFile()) return { file: f, status: 200 };
    if (existsSync(f + ".html")) return { file: f + ".html", status: 200 };
    return { file: join(dist, "404.html"), status: 404 };
  }

  server.on("request", async (req, res) => {
    const url = new URL(req.url, origin);
    try {
      /* --- controls --- */
      if (url.pathname === "/__rig/idle") {
        const t0 = Date.now();
        while (Date.now() - t0 < 180_000) {
          if (inflight.size === 0 && Date.now() - lastBackgroundAt > 400) break;
          await new Promise((r) => setTimeout(r, 100));
        }
        res.writeHead(200, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({ idle: inflight.size === 0, waitedMs: Date.now() - t0 }));
      }
      if (url.pathname === "/__rig/latency") {
        latencyMs = Number(url.searchParams.get("ms") ?? 0) || 0;
        blobOps.count = 0;
        res.writeHead(200, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({ latencyMs }));
      }
      if (url.pathname === "/__rig/blob-ops") {
        res.writeHead(200, { "Content-Type": "application/json" });
        return res.end(JSON.stringify(blobOps));
      }
      if (url.pathname === "/__rig/state") {
        res.writeHead(200, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({ mails: mail.sent.length, sessions: stripe.sessions.size, gemini: gemini.asked, blocked, engine: { version: engine.version, ...cache.stats } }));
      }
      if (url.pathname.startsWith("/__rig/session/")) {
        const s = stripe.sessions.get(url.pathname.split("/").pop());
        res.writeHead(s ? 200 : 404, { "Content-Type": "application/json" });
        return res.end(JSON.stringify(s ?? null));
      }
      if (url.pathname === "/__rig/mint") {
        // A link for a stored record, signed with this run's secret: how the
        // rig reaches the expired-link page without waiting six days.
        const { mintReadingLink } = await import(pathToFileURL(join(REPO, "netlify", "lib", "reading.mjs")).href);
        const id = url.searchParams.get("id");
        const tier = Number(url.searchParams.get("tier"));
        const ttl = Number(url.searchParams.get("ttl") ?? 3600);
        const now = Date.now() - (ttl < 0 ? 7 * 86400_000 : 0);
        const token = mintReadingLink({ id, tier, ttlSeconds: ttl < 0 ? 3600 : ttl, now }, process.env.GRANT_SECRET);
        res.writeHead(200, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({ token }));
      }
      if (url.pathname === "/__rig/record") {
        // Which stored record a link names (for the driver's bookkeeping).
        const { readReadingLink } = await import(pathToFileURL(join(REPO, "netlify", "lib", "reading.mjs")).href);
        const link = readReadingLink(url.searchParams.get("t"), process.env.GRANT_SECRET, Date.now());
        res.writeHead(200, { "Content-Type": "application/json" });
        return res.end(JSON.stringify(link));
      }
      if (url.pathname === "/__rig/seed" && req.method === "POST") {
        // Write records straight into the readings store, the way OLDER code
        // wrote them (no `person`, no birth): the pre-release-2 purchases the
        // live inbox holds. Also adds them to the email index.
        const body = JSON.parse((await readBody(req)).toString("utf8"));
        const readings = getStore({ name: "readings", consistency: "strong" });
        for (const r of body.records ?? []) await readings.setJSON(r.id, r.record);
        res.writeHead(200, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({ seeded: (body.records ?? []).length }));
      }

      /* --- fake Stripe's hosted page --- */
      const pay = url.pathname.match(/^\/__stripe\/pay\/([^/]+)$/);
      if (pay) {
        const form = req.method === "POST" ? new URLSearchParams((await readBody(req)).toString("utf8")) : null;
        const out = stripe.page(req.method, pay[1], form);
        if (out.location) {
          res.writeHead(303, { Location: out.location });
          return res.end();
        }
        res.writeHead(out.status, { "Content-Type": "text/html; charset=utf-8" });
        return res.end(out.html);
      }

      /* --- the engine --- */
      if (url.pathname.startsWith("/__engine/")) {
        const path = url.pathname.replace(/^\/__engine/, "") + url.search;
        if (req.headers["x-engine-key"] !== engineKey) {
          res.writeHead(401, { "Content-Type": "application/json" });
          return res.end(JSON.stringify({ error: { code: "no_key", message: "bad key" } }));
        }
        const body = req.method === "POST" ? (await readBody(req)).toString("utf8") : null;
        const ans = await cache.ask(req.method, path, body);
        if (path.startsWith("/v1/chart") && body) {
          const ask = JSON.parse(body);
          const b = ask.birth ?? {};
          const key = `${b.date}_${b.timeKnown === false ? "unknown" : String(b.time).replace(":", "")}_${String(b.zone).replace(/\//g, "-")}`;
          engineCalls.push({ at: Date.now(), tier: ask.tier, key, status: ans.status });
          if (ans.status === 200) {
            const truth = ask.tier === 2 ? ans : await cache.ask("POST", "/v1/chart", JSON.stringify({ ...ask, tier: 2 }));
            writeFileSync(join(truthDir, key + ".json"), JSON.stringify(truth.json));
          }
          appendFileSync(join(runDir, "engine-calls.jsonl"), JSON.stringify(engineCalls.at(-1)) + "\n");
        }
        res.writeHead(ans.status, { "Content-Type": "application/json" });
        return res.end(JSON.stringify(ans.json));
      }

      /* --- the phone app's readings site --- */
      const rs = url.pathname.match(/^\/__readings\/r\/([^/]*)$/);
      if (rs && readingsSite) {
        const request = new Request(`https://readings.thechampagnemethod.co/r/${rs[1]}`, { method: req.method });
        return sendResponse(res, await readingsSite(request, { params: { id: rs[1] } }));
      }

      /* --- functions --- */
      const route = routes.find((r) => r.path === url.pathname);
      if (route) {
        const body = req.method === "GET" || req.method === "HEAD" ? undefined : await readBody(req);
        const headers = new Headers();
        for (const [k, v] of Object.entries(req.headers)) if (typeof v === "string") headers.set(k, v);
        const request = new Request(url.href, { method: req.method, headers, body });
        // Each journey is its own visitor (the driver says which), as each buyer
        // is live -- otherwise one IP makes every purchase and the per-visitor
        // limits (chart, resend, my-charts) refuse the run halfway.
        const visitor = String(req.headers["x-rig-visitor"] ?? "");
        const vh = createHash("sha256").update(visitor).digest();
        const ip = visitor ? `10.77.${vh[0]}.${vh[1]}` : "127.0.0.1";
        const context = { ip, deploy: { id: "rig" }, site: { url: origin }, params: {}, waitUntil: () => {} };
        if (route.background) {
          lastBackgroundAt = Date.now();
          const job = Promise.resolve()
            .then(() => route.handler(request, context))
            .catch((e) => hlog(`background ${route.name} threw ${e?.message}`))
            .finally(() => {
              inflight.delete(job);
              lastBackgroundAt = Date.now();
            });
          inflight.add(job);
          res.writeHead(202);
          return res.end();
        }
        const t0 = Date.now();
        const response = await route.handler(request, context);
        hlog(`${req.method} ${url.pathname} -> ${response.status} ${Date.now() - t0}ms`);
        return sendResponse(res, response);
      }
      if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/.netlify/")) {
        res.writeHead(404, { "Content-Type": "text/plain" });
        return res.end("no such function");
      }

      /* --- the site --- */
      const { file, status } = staticFile(url.pathname);
      if (!existsSync(file)) {
        res.writeHead(404, { "Content-Type": "text/plain" });
        return res.end("not found (is dist/ built?)");
      }
      res.writeHead(status, { "Content-Type": MIME[extname(file)] ?? "application/octet-stream" });
      res.end(readFileSync(file));
    } catch (e) {
      hlog(`harness error on ${req.method} ${url.pathname}: ${e?.stack ?? e}`);
      if (!res.headersSent) res.writeHead(500, { "Content-Type": "text/plain" });
      res.end("rig harness error");
    }
  });

  hlog(`rig up: ${origin} (functions: ${routes.map((r) => r.name).join(", ")})`);
  return {
    origin,
    engine,
    stripe,
    mail,
    gemini,
    blocked,
    engineCalls,
    cacheStats: cache.stats,
    async stop() {
      console.log = realLog;
      globalThis.fetch = REAL_FETCH;
      await new Promise((r) => server.close(r));
      server.closeAllConnections?.();
      await new Promise((r) => blobProxy.close(r));
      blobProxy.closeAllConnections?.();
      await blobs.stop();
      await engine.stop();
    },
  };
}

const REAL_FETCH = globalThis.fetch;

/** The Blobs package's local server, on loopback only (its own start() binds every interface). */
class LoopbackBlobs extends BlobsServer {
  async start() {
    mkdirSync(this.directory, { recursive: true });
    const server = http.createServer((req, res) => this.handleRequest(req, res));
    this.server = server;
    return new Promise((resolve) =>
      server.listen(0, "127.0.0.1", () => {
        const address = server.address();
        this.address = `http://127.0.0.1:${address.port}`;
        resolve(address);
      }),
    );
  }
}

