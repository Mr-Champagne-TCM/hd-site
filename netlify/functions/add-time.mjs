import { getStore } from "@netlify/blobs";
import { createHash } from "node:crypto";
import { handleAddTime } from "../lib/addTime.mjs";
import { loadReading, mintReadingLink } from "../lib/reading.mjs";
import { deliveryEmail } from "../lib/deliveryEmail.mjs";
import { alertSender, customerError, guard, noteFailure } from "../lib/failures.mjs";
import { sendMail } from "../lib/mail.mjs";
import { SITE } from "../lib/siteLinks.mjs";
import { TRIGGER_HEADER, triggerToken } from "../lib/trigger.mjs";

/**
 * POST /api/add-time -- a birth time found later, added once (Jeremy 10/22).
 * netlify/lib/addTime.mjs has the rules; this wires the stores, the engine,
 * the writer's doorbell and the "ready" email.
 *
 * The request body carries a birth time and is never logged, at any level.
 */
const health = () => getStore({ name: "health", consistency: "strong" });

const note = (kind, { detail, paid = false, ref } = {}) =>
  noteFailure(health(), kind, {
    detail,
    paid,
    ref,
    send: alertSender(process.env.RESEND_API_KEY),
    site: process.env.URL,
  });

/** As the chart form's: stopped at eight, so the buyer is answered in words, never by a timeout page. */
const ENGINE_TIMEOUT_MS = 8000;

export default guard("addtime", async (request, context) => {
  if (request.method !== "POST") {
    return new Response(JSON.stringify({ error: { code: "method", message: "Use POST." } }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  const secret = process.env.GRANT_SECRET;
  const salt = process.env.RATE_SALT;
  if (!secret || !salt) {
    console.log(`POST /api/add-time -> 503 (missing: ${[!secret && "GRANT_SECRET", !salt && "RATE_SALT"].filter(Boolean).join(", ")})`);
    await note("addtime-misconfigured", { detail: "GRANT_SECRET or RATE_SALT is not set" });
    const { status, payload } = customerError("addtime-misconfigured");
    return new Response(JSON.stringify(payload), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });
  }

  const rate = getStore({ name: "chart-rate", consistency: "strong" });
  const claimStore = getStore({ name: "add-time", consistency: "strong" });
  const readings = getStore({ name: "readings", consistency: "strong" });

  const counters = {
    // The same salted hash the chart form keeps: never the address itself.
    async keyFor(ip) {
      return "t:" + createHash("sha256").update(salt).update(String(ip)).digest("hex").slice(0, 32);
    },
    async load(key) {
      const raw = await rate.get(key, { type: "json" });
      return Array.isArray(raw) ? raw : [];
    },
    async save(key, hits) {
      await rate.setJSON(key, hits);
    },
  };
  const claims = {
    async get(id) {
      const raw = await claimStore.get(`claim:${id}`, { type: "json" });
      return Number.isFinite(raw?.at) ? raw.at : null;
    },
    async set(id, at) {
      await claimStore.setJSON(`claim:${id}`, { at });
    },
    async del(id) {
      await claimStore.delete(`claim:${id}`);
    },
  };

  const engine = async (payload) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), ENGINE_TIMEOUT_MS);
    try {
      const res = await fetch(`${process.env.ENGINE_URL}/v1/chart`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Engine-Key": process.env.ENGINE_KEY },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
      const body = await res.json().catch(() => null);
      if (res.ok && body === null) return { ok: false, status: 502, payload: null };
      return { ok: res.ok, status: res.status, payload: body };
    } finally {
      clearTimeout(timer);
    }
  };

  /**
   * THE CHART IS REDONE, SO SAY SO -- the same "ready" email a first chart
   * gets, with a fresh six-day link. On the reading tier the words are written
   * again first, so the writer is rung and ITS email goes when they are.
   */
  const deliver = async ({ id, tier }) => {
    if (tier >= 2) {
      await ringTheWriter(request, id).catch(() => {});
      return;
    }
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) return;
    const reading = await loadReading(readings, id, Date.now());
    const to = reading?.buyer?.email;
    if (!to) {
      await note("ready-email-no-address", { detail: `add-time, tier ${tier}`, paid: true });
      return;
    }
    const url = `${new URL(request.url).origin}/r/${mintReadingLink({ id, tier }, secret)}`;
    const { subject, html, text } = deliveryEmail({
      tier,
      name: reading.buyer.name,
      chartName: reading.birth?.name ?? null,
      url,
      links: SITE,
      pending: false,
      someoneNew: reading.fresh === true,
    });
    const sent = await sendMail({ to, subject, html, text }, { apiKey });
    console.log(`add-time: ready-email ${sent.ok ? "sent" : `failed (${sent.reason})`}`);
    if (!sent.ok) await note("ready-email", { detail: `add-time: ${sent.reason} (tier ${tier})`, paid: true });
  };

  const ip = context?.ip || request.headers.get("x-nf-client-connection-ip") || "unknown";
  const result = await handleAddTime({
    body: await request.text(),
    ip,
    now: Date.now(),
    readings,
    counters,
    claims,
    engine,
    secret,
    deliver,
    report: ({ kind, detail, paid, ref }) => note(kind, { detail, paid, ref }),
  });

  // Status only: the body carries a birth time and is never logged.
  console.log(`POST /api/add-time -> ${result.status}`);
  return new Response(result.body, { status: result.status, headers: result.headers });
}, { health });

export const config = { path: "/api/add-time" };

/** The writer's doorbell, as the chart form rings it (functions/chart.mjs). */
async function ringTheWriter(request, id) {
  const token = triggerToken(process.env.GRANT_SECRET);
  if (!token) return;
  const origin = process.env.URL || new URL(request.url).origin;
  const res = await fetch(`${origin}/api/interpret`, {
    method: "POST",
    headers: { [TRIGGER_HEADER]: token, "Content-Type": "application/json" },
    body: JSON.stringify({ id }),
  });
  console.log(`add-time: rang the writer -> ${res.status}`);
}
