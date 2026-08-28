/**
 * GET /api/warm -- wake the engine before anybody is waiting on it.
 *
 * WHY THIS IS ITS OWN ENDPOINT, which is a lesson rather than a design.
 *
 * The warm-up used to be `/api/places?q=a&limit=1`: a real lookup, deliberately
 * tiny, whose only purpose was to make the engine start. It worked until the
 * place endpoint was given a CDN cache, at which point the warm ping began
 * being answered by the edge in 30ms and NEVER REACHED THE ENGINE at all.
 *
 * Nothing failed. No test broke, no log line appeared, and the place search got
 * measurably faster on every cached query -- while the first real lookup after
 * an idle spell went back to paying a five-second cold start, which is the
 * exact fault warming was introduced to fix. Reported as "ric took over 5
 * seconds to produce results".
 *
 * So a warm-up must not share a URL with a cacheable answer. This one is
 * `no-store`, returns nothing worth caching, and cannot be satisfied by
 * anything between the browser and the engine.
 *
 * It asks the engine for its HEALTH rather than for a place, which is cheaper
 * on the engine and needs no key handling here. Waking is the whole job.
 */
export default async () => {
  const engineUrl = process.env.ENGINE_URL;
  if (!engineUrl) {
    // Not an error worth surfacing. Nobody is waiting on this response, and a
    // failed warm-up costs a slow first lookup rather than a broken page.
    console.log("GET /api/warm -> 204 (no ENGINE_URL)");
    return blank();
  }

  try {
    // Short, because the point is to START the machine, not to wait for it. If
    // it is cold, this request is what wakes it and the timeout does not
    // matter -- the machine keeps booting after we stop listening.
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 4000);
    try {
      await fetch(`${engineUrl}/v1/health`, { signal: controller.signal });
    } finally {
      clearTimeout(timer);
    }
  } catch {
    /* a warm-up that fails is a slow first lookup, never a visible failure */
  }

  return blank();
};

function blank() {
  return new Response(null, {
    status: 204,
    headers: {
      // The whole point. A cached warm-up is not a warm-up.
      "Cache-Control": "no-store",
    },
  });
}

export const config = { path: "/api/warm" };
