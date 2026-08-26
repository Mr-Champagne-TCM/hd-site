import { getStore } from "@netlify/blobs";
import { createHash } from "node:crypto";
import { handleChart } from "../lib/handler.mjs";

/**
 * POST /api/chart -- the free summary.
 *
 * Unauthenticated public traffic reaching a metered service, so this free layer
 * is the shield: the JVM never sees a request that was going to be refused.
 *
 * The visitor's IP is never stored. It is hashed with a server-side salt and
 * only the hash is kept, so the counter works without this becoming a log of
 * who visited and when.
 */
export default async (request, context) => {
  if (request.method !== "POST") {
    return new Response(JSON.stringify({ error: { code: "method", message: "Use POST." } }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  const blobs = getStore({ name: "chart-rate", consistency: "strong" });
  const salt = process.env.RATE_SALT || "";

  const store = {
    async keyFor(ip) {
      return createHash("sha256").update(salt).update(String(ip)).digest("hex").slice(0, 32);
    },
    async load(key) {
      const raw = await blobs.get(key, { type: "json" });
      return Array.isArray(raw) ? raw : [];
    },
    async save(key, hits) {
      await blobs.setJSON(key, hits);
    },
  };

  const engine = async (payload) => {
    const res = await fetch(`${process.env.ENGINE_URL}/v1/chart`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Engine-Key": process.env.ENGINE_KEY,
      },
      body: JSON.stringify(payload),
    });
    return { ok: res.ok, status: res.status, payload: await res.json() };
  };

  const ip = context?.ip || request.headers.get("x-nf-client-connection-ip") || "unknown";

  const result = await handleChart({
    body: await request.text(),
    ip,
    now: Date.now(),
    store,
    engine,
  });

  // Status only. The request body carries birth data and is never logged, at
  // any level, in any environment -- a body log would put it into a retention
  // window and would not show up in any manual test.
  console.log(`POST /api/chart -> ${result.status}`);

  return new Response(result.body, { status: result.status, headers: result.headers });
};

export const config = { path: "/api/chart" };
