import { getStore } from "@netlify/blobs";
import { alertSender, customerError, guard, noteFailure } from "../lib/failures.mjs";
import { rankPlaces } from "../lib/placeRank.mjs";

const health = () => getStore({ name: "health", consistency: "strong" });

/**
 * A LOOKUP RUNS ON EVERY KEYSTROKE, so an engine outage would file one
 * incident per letter typed. One per instance per minute is plenty to see it.
 */
const NOTE_EVERY_MS = 60_000;
const lastNoted = new Map();
async function note(kind, detail) {
  const now = Date.now();
  if (now - (lastNoted.get(kind) ?? 0) < NOTE_EVERY_MS) return;
  lastNoted.set(kind, now);
  await noteFailure(health(), kind, { detail, send: alertSender(process.env.RESEND_API_KEY), site: process.env.URL });
}

/**
 * THE TOWN SEARCH IS DOWN, SAID AS SUCH (10/16). An empty list used to be the
 * whole answer, and the field then said "No town by that name yet -- another
 * spelling may find it": the customer was sent hunting for a spelling of
 * their own birthplace while the fault was ours. `unavailable` lets the
 * field say what is actually true. Never cached: an outage must not outlive
 * itself at the edge.
 */
function unavailable(kind) {
  const { payload } = customerError(kind);
  return json(200, { places: [], unavailable: true, message: payload.error.message, key: payload.error.key }, {
    "Cache-Control": "no-store",
  });
}

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

/**
 * A cache in FRONT of the cache, and the measurement that put it there.
 *
 * Measured against the live site: the engine answers in about 100ms, a Blobs
 * cache HIT costs 380-450ms, and a miss 480-700ms. So the durable cache was
 * saving roughly 150ms while spending 200ms of its own to do it -- the round
 * trip to the blob store had become most of what a lookup cost.
 *
 * This map lives in the function instance and is checked first. A warm instance
 * answers from memory with no store call at all. It is small, per-instance, and
 * lost when the instance recycles, which is exactly right for a cache whose
 * source of truth is a fixed file: losing it costs one slow lookup.
 *
 * Bounded, because a map that only grows is a leak with a friendly name.
 */
const MEMORY_MAX = 500;
const memory = new Map();

function remember(key, places) {
  // Oldest out first. Map preserves insertion order, so the first key is the
  // least recently added.
  if (memory.size >= MEMORY_MAX) memory.delete(memory.keys().next().value);
  memory.set(key, places);
}

/** Generous, because this is keystrokes rather than purchases. */
const PER_HOUR = 600;
const WINDOW_MS = 60 * 60 * 1000;

export default guard("places", async (request, context) => {
  const url = new URL(request.url);
  const raw = (url.searchParams.get("q") || "").trim();
  const limit = Math.min(Math.max(Number(url.searchParams.get("limit")) || 8, 1), 40);

  if (!raw) return json(200, { places: [] });
  // Long enough to be a typo, not long enough to be an attack.
  if (raw.length > 80) return json(200, { places: [] });

  const key = process.env.ENGINE_KEY;
  const engineUrl = process.env.ENGINE_URL;
  const salt = process.env.RATE_SALT;
  if (!key || !engineUrl || !salt) {
    console.log("GET /api/places -> 503 (missing configuration)");
    await note("places-misconfigured", "ENGINE_KEY, ENGINE_URL or RATE_SALT is not set");
    return unavailable("places-misconfigured");
  }

  // The deploy id is part of the key, and that is not decoration.
  //
  // Without it a cached answer outlives the code that produced it: the state
  // fallback shipped and "Texas" kept returning the old town-only list, because
  // the cache had a seven-day TTL and no idea anything had changed. A stale
  // answer that looks fresh is worse than no cache, and it is invisible — the
  // only reason this was caught is that a never-typed query returned something
  // different from a typed one.
  // NEITHER ENV VAR REACHES A FUNCTION AT RUNTIME, which defeated the whole
  // paragraph above without ever saying so. Proof from production on
  // 8 September: every key in the places-cache store reads `dev|<query>|<n>`,
  // so the version has been a constant since the day it was added, and a stale
  // answer could have outlived its code exactly as feared. DEPLOY_ID and
  // COMMIT_REF are BUILD variables; a running function never sees them.
  //
  // The deploy id IS available, on the v2 context object this handler already
  // receives. The env vars stay as fallbacks: they cost one line and this is
  // strictly better than the constant it replaces, whatever the runtime hands
  // over. Confirm after the next deploy by listing the store -- new keys must
  // no longer begin `dev|`.
  const version = context?.deploy?.id || process.env.DEPLOY_ID || process.env.COMMIT_REF || "dev";
  const cacheKey = `${version}|${raw.toLowerCase()}|${limit}`;
  const cache = getStore({ name: "places-cache", consistency: "eventual" });

  // Memory first. This is the whole point of the layer above.
  // Ranked on every way out (batch-1024 item 6): an answer kept before the ranking still reads town-first.
  const remembered = memory.get(cacheKey);
  if (remembered) {
    return json(200, { places: rankPlaces(raw, remembered) }, { "X-Cache": "memory" });
  }

  try {
    const hit = await cache.get(cacheKey, { type: "json" });
    if (hit && Date.now() - hit.at < CACHE_TTL_MS) {
      const ranked = rankPlaces(raw, hit.places);
      remember(cacheKey, ranked);
      return json(200, { places: ranked }, { "X-Cache": "hit" });
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
    /* treated as empty: the counter fails open */
    await note("places-rate-store", "counter read failed");
  }
  const now = Date.now();
  hits = hits.filter((t) => now - t < WINDOW_MS);
  if (hits.length >= PER_HOUR) {
    await note("places-rate-limited", `${PER_HOUR} an hour`);
    const { status, payload } = customerError("places-rate-limited");
    return json(status, payload);
  }
  try {
    await counters.setJSON(who, [...hits, now]);
  } catch {
    // A counter that cannot be written used to throw, and the field showed
    // nothing at all. The lookup is what the person is waiting for.
    await note("places-rate-store", "counter write failed");
  }

  let payload;
  try {
    const res = await fetch(
      `${engineUrl}/v1/places?q=${encodeURIComponent(raw)}&limit=${limit}`,
      // A deadline of our own, so a stuck engine is answered in words rather
      // than by the platform cutting the function off.
      { headers: { "X-Engine-Key": key }, signal: AbortSignal.timeout(6000) },
    );
    if (!res.ok) {
      console.log(`GET /api/places -> upstream ${res.status}`);
      await note("places-engine-down", `engine ${res.status}`);
      return unavailable("places-engine-down");
    }
    payload = await res.json();
  } catch (e) {
    console.log("GET /api/places -> upstream unreachable");
    await note("places-engine-down", `engine ${e?.name ?? "unreachable"}`);
    return unavailable("places-engine-down");
  }

  // The town before the country: "Denver" no longer lists Danish towns on their country's name
  // ahead of town-name matches (batch-1024 item 6, lib/placeRank.mjs). Same rows, town-first order.
  const places = rankPlaces(raw, Array.isArray(payload?.places) ? payload.places : []);
  remember(cacheKey, places);
  try {
    await cache.setJSON(cacheKey, { at: Date.now(), places });
  } catch {
    /* a cache that cannot be written still returns the right answer */
  }

  // The query is never logged. Somebody's birth town is birth data.
  console.log(`GET /api/places -> 200 (${places.length})`);
  return json(200, { places }, { "X-Cache": "miss" });
}, {
  health,
  // Even the net answers in the shape the field reads.
  page: (e) =>
    json(200, { places: [], unavailable: true, message: e.message, key: e.key }, { "Cache-Control": "no-store" }),
});

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
      /**
       * PUBLIC, NOT PRIVATE, AND THAT ONE WORD WAS THE LAG.
       *
       * Reported three times: "birth place lookup search results are still SO
       * LAGGY". Measured against the live endpoint rather than guessed at --
       * every prefix of "austin", cold and warm, came back in 180-230ms, and
       * the response headers said why:
       *
       *     Cache-Status: "Netlify Durable"; fwd=bypass
       *     Cache-Status: "Netlify Edge";    fwd=miss
       *
       * `private` tells the CDN it may not keep this. So every keystroke from
       * every visitor reached the function, forever -- the two caches inside
       * this file were doing real work and still could not help, because the
       * request had already crossed the network to get to them.
       *
       * Nothing here is private. It is town names and timezones from a fixed
       * public index; the QUERY belongs to a person but the ANSWER does not,
       * and the CDN stores answers keyed by URL, not askers.
       *
       * s-maxage is an hour rather than the seven days that caused the last
       * stale-place bug. Netlify purges the edge on deploy, and an hour bounds
       * the damage if it ever does not.
       *
       * A cache hit no longer runs the rate limiter, which is correct: the
       * limiter exists to protect compute, and a hit costs none. Forcing
       * misses with unique queries still meets it.
       */
      "Cache-Control":
        status === 200
          ? "public, max-age=300, s-maxage=3600, stale-while-revalidate=86400"
          : "no-store",
      ...headers,
    },
  });
}

export const config = { path: "/api/places" };
