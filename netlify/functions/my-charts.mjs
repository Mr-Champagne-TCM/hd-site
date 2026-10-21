import { getStore } from "@netlify/blobs";
import { createHash } from "node:crypto";
import { handleMyCharts } from "../lib/myChartsHandler.mjs";
import { INDEX_STORE } from "../lib/charts.mjs";
import { sendMail } from "../lib/mail.mjs";
import { SITE } from "../lib/siteLinks.mjs";
import { alertSender, customerError, guard, noteFailure } from "../lib/failures.mjs";

const health = () => getStore({ name: "health", consistency: "strong" });
const note = (kind, { detail } = {}) =>
  noteFailure(health(), kind, { detail, send: alertSender(process.env.RESEND_API_KEY), site: process.env.URL });

/**
 * POST /api/my-charts -- "Email me my charts" (release 2, Jeremy 10/20).
 *
 * The thin half; the judgement is in ../lib/myChartsHandler.mjs. Answers
 * `{"sent":true}` whether or not the address has charts, and sends only to the
 * address typed. Never logs the address.
 */
export default guard("mycharts", async (request, context) => {
  if (request.method !== "POST") {
    return json(405, { error: { code: "method", message: "Use POST." } });
  }
  const secret = process.env.GRANT_SECRET;
  const apiKey = process.env.RESEND_API_KEY;
  const salt = process.env.RATE_SALT;
  if (!secret || !apiKey || !salt) {
    const missing = [!secret && "GRANT_SECRET", !apiKey && "RESEND_API_KEY", !salt && "RATE_SALT"].filter(Boolean).join(", ");
    console.log(`POST /api/my-charts -> 503 (missing: ${missing})`);
    await note("mycharts-misconfigured", { detail: `missing ${missing}` });
    const { status, payload } = customerError("mycharts-misconfigured");
    return json(status, payload);
  }

  // The same rate store as "Email me this link", with keys of its own (mv:, ma:).
  const blobs = getStore({ name: "resend-rate", consistency: "strong" });
  const counters = {
    async load(key) {
      const raw = await blobs.get(key, { type: "json" }).catch(() => null);
      return Array.isArray(raw) ? raw : [];
    },
    async save(key, hits) {
      await blobs.setJSON(key, hits);
    },
  };
  // A salted hash of the IP, never the IP itself (as chart.mjs and resend.mjs).
  const ip = context?.ip || request.headers.get("x-nf-client-connection-ip") || "unknown";
  const visitorKey = createHash("sha256").update(salt).update(String(ip)).digest("hex").slice(0, 32);

  const result = await handleMyCharts({
    body: await request.text(),
    readings: getStore({ name: "readings", consistency: "strong" }),
    index: getStore({ name: INDEX_STORE, consistency: "strong" }),
    counters,
    visitorKey,
    secret,
    send: (message) => sendMail(message, { apiKey }),
    origin: new URL(request.url).origin,
    links: SITE,
    now: Date.now(),
    note,
  });

  // Status only. Never the address, never what was found.
  console.log(`POST /api/my-charts -> ${result.status}`);
  return new Response(result.body, { status: result.status, headers: result.headers });
}, { health });

function json(status, payload) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store, private" },
  });
}

export const config = { path: "/api/my-charts" };
