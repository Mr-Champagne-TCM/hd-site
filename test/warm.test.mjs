import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * THE WARM-UP MUST NOT BE CACHEABLE.
 *
 * This test exists because of a fault that broke nothing and was invisible.
 *
 * Warming used to call `/api/places?q=a&limit=1` -- a real lookup, deliberately
 * tiny, whose only job was to make the engine start. Then the place endpoint
 * was given a CDN cache, correctly, and the warm ping began being answered by
 * the edge in 30ms without ever reaching the engine.
 *
 * Every test still passed. Cached place lookups got measurably faster. And the
 * first real search after an idle spell went back to a five-second cold start
 * -- the exact fault warming was introduced to prevent. It was found by Jeremy
 * typing "ric" on his phone.
 *
 * The shape of that fault is what is guarded here: a warm-up that shares a URL
 * with something a cache is allowed to answer is not a warm-up.
 */

const read = (p) => readFileSync(fileURLToPath(new URL(p, import.meta.url)), "utf8");

const warmClient = read("../src/entry/warm.ts");
const warmFn = read("../netlify/functions/warm.mjs");
const placesFn = read("../netlify/functions/places.mjs");

test("the client warms via /api/warm, not via a cacheable endpoint", () => {
  const fetches = [...warmClient.matchAll(/fetch\(\s*["'`]([^"'`]+)/g)].map((m) => m[1]);
  assert.deepEqual(fetches, ["/api/warm"], "warm.ts fetches something other than /api/warm");
});

test("the warm endpoint refuses to be cached", () => {
  assert.match(warmFn, /"Cache-Control":\s*"no-store"/, "the warm endpoint is cacheable");
  assert.doesNotMatch(warmFn, /max-age|s-maxage|stale-while-revalidate/, "the warm endpoint has a TTL");
});

test("it is served at /api/warm", () => {
  assert.match(warmFn, /export const config = \{ path: "\/api\/warm" \}/);
});

test("THE PLACE ENDPOINT IS CACHEABLE, which is why warming cannot use it", () => {
  // If this ever stops being true the two could share a URL again safely --
  // but then the assertion above should be the thing that is reconsidered,
  // deliberately, rather than this pair drifting into agreement by accident.
  assert.match(placesFn, /public,\s*max-age=\d+/, "the place endpoint is no longer cacheable");
});

test("the warm endpoint reaches the ENGINE, not another edge function", () => {
  // Pinging ourselves would wake nothing. The whole point is the Fly machine.
  assert.match(warmFn, /ENGINE_URL/);
  assert.match(warmFn, /\/v1\/health/);
});

test("a warm-up that fails is silent, never a visible failure", () => {
  // Nobody is waiting on this response. A thrown error here would surface as a
  // console error on a page that is working perfectly well.
  assert.match(warmFn, /catch\s*\{/);
  assert.match(warmFn, /status:\s*204/);
});
