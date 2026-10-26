import { getStore } from "@netlify/blobs";
import { COUNTS_STORE, handleCount } from "../lib/counts.mjs";

/**
 * POST /api/count {e: "visit" | "buy", src, tier?, kind?} -- one visit to the offer page, or one Buy click, as a
 * plain daily total (lib/counts.mjs). No cookie is read or set, the address is not looked at, nothing is logged.
 */
export default async (request) => {
  if (request.method !== "POST") return new Response(null, { status: 405 });
  const status = await handleCount({
    text: await request.text().catch(() => ""),
    store: getStore({ name: COUNTS_STORE, consistency: "strong" }),
  });
  return new Response(null, { status });
};

export const config = { path: "/api/count" };
