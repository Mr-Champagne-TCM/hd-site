import { getStore } from "@netlify/blobs";

/**
 * GET /api/places?q=... — town lookup for the birth-place field.
 *
 * Separate from /api/chart on purpose, and metered separately. A place lookup
 * happens on EVERY KEYSTROKE: the app's guidance is explicit that the field
 * recomputes on every character, with no minimum length and no debounce long
 * enough to feel broken. Charging those against the chart allowance would let
 * one person spell "Wichita Falls" and be locked out of the chart they came for.
 *
 * Cached by query, because prefixes repeat enormously. Everyone typing
 * "wichita" types "w", "wi", "wic" on the way, and the answer to each never
 * changes — the index is a fixed file. A cache hit costs no engine call at all,
 * which also means the machine is not woken to answer "lo" for the hundredth
 * time.
 */

/** The index is a fixed file, so an answer is good until the file changes. */
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/** Generous, because this is keystrokes rather than purchases. */
const PER_HOUR = 600;
const WINDOW_MS = 60 * 60 * 1000;

export default async (request, context) => {
  const url = new URL(request.url);
  const raw = (url.searchParams.get("q") || "").trim();
  const limit = Math.min(Math.max(Number(url.searchParams.get("limit")) || 8, 1), 20);

  if (!raw) return json(200, { places: [] });
  // Long enough to be a typo, not long enough to be an attack.
  if (raw.length > 80) return json(200, { places: [] });

  const key = process.env.ENGINE_KEY;
  const engineUrl = process.env.ENGINE_URL;
  const salt = process.env.RATE_SALT;
  if (!key || !engineUrl || !salt) {
    console.log("GET /api/places -> 503 (missing configuration)");
    return json(503, {
      error: {
        code: "misconfigured",
        message: "Place search is briefly unavailable. The rest of the page still works.",
      },
    });
  }

  const cacheKey = `${raw.toLowerCase()}|${limit}`;
  const cache = getStore({ name: "places-cache", consistency: "eventual" });

  try {
    const hit = await cache.get(cacheKey, { type: "json" });
    if (hit && Date.now() - hit.at < CACHE_TTL_MS) {
      return json(200, { places: hit.places }, { "X-Cache": "hit" });
    }
  } catch {
    // A cache that cannot be read is not a reason to fail; it is a reason to
    // do the work.
  }

  // Metered per visitor, on its own counter. The IP is hashed with the same
  // salt the chart limiter uses, so this does not become a record of who
  // searched for which town.
  const ip = context?.ip || request.headers.get("x-nf-client-connection-ip") || "unknown";
  const who = await sha256(salt + ip);
  const counters = getStore({ name: "places-rate", consistency: "strong" });
  let hits = [];
  try {
    const raw = await counters.get(who, { type: "json" });
    if (Array.isArray(raw)) hits = raw;
  } catch {
    /* treated as empty */
  }
  const now = Date.now();
  hits = hits.filter((t) => now - t < WINDOW_MS);
  if (hits.length >= PER_HOUR) {
    return json(429, {
      error: {
        code: "rate_limited",
        message:
          "That is a great many place searches in an hour. Nothing is wrong and nothing was " +
          "charged — it clears on its own shortly.",
      },
    });
  }
  await counters.setJSON(who, [...hits, now]);

  let payload;
  try {
    const res = await fetch(
      `${engineUrl}/v1/places?q=${encodeURIComponent(raw)}&limit=${limit}`,
      { headers: { "X-Engine-Key": key } },
    );
    if (!res.ok) {
      // A place lookup failing is not worth an error state on the page: the
      // field simply finds nothing, and typing continues.
      console.log(`GET /api/places -> upstream ${res.status}`);
      return json(200, { places: [] });
    }
    payload = await res.json();
  } catch {
    console.log("GET /api/places -> upstream unreachable");
    return json(200, { places: [] });
  }

  const places = Array.isArray(payload?.places) ? payload.places : [];
  try {
    await cache.setJSON(cacheKey, { at: Date.now(), places });
  } catch {
    /* a cache that cannot be written still returns the right answer */
  }

  // The query is never logged. Somebody's birth town is birth data.
  console.log(`GET /api/places -> 200 (${places.length})`);
  return json(200, { places }, { "X-Cache": "miss" });
};

async function sha256(text) {
  const bytes = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 32);
}

function json(status, payload, headers = {}) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      // The index is fixed, so a browser may keep an answer briefly too.
      "Cache-Control": status === 200 ? "private, max-age=300" : "no-store",
      ...headers,
    },
  });
}

export const config = { path: "/api/places" };
