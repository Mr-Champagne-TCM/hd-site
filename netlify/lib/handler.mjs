import { check, record } from "./ratelimit.mjs";

/**
 * The free chart request, with the storage and the engine passed in.
 *
 * Written this way so the whole path can be tested without Netlify, without a
 * network and without a clock -- including the one assertion that matters most
 * in T-10: when someone is turned away, the ENGINE IS NEVER CALLED. That is the
 * entire point of putting the bouncer on the free door, and it is the sort of
 * thing that quietly stops being true after a refactor unless a test watches it.
 */

/** Birth data is never written down. Only these leave the request object. */
const ALLOWED_BIRTH_FIELDS = ["date", "time", "zone", "timeKnown", "utc"];

export async function handleChart({ body, ip, now, store, engine }) {
  let request;
  try {
    request = JSON.parse(body);
  } catch {
    return json(400, { error: { code: "bad_json", message: "That request was not readable. Please try again." } });
  }

  const birth = request?.birth;
  if (!birth || typeof birth !== "object") {
    return json(400, {
      error: { code: "no_birth", message: "A birth date, timezone, and whether the time is known are needed." },
    });
  }

  const key = await store.keyFor(ip);
  const hits = await store.load(key);

  const verdict = check(hits, now);
  if (!verdict.allowed) {
    // Nothing reaches the engine. No container starts, no chart is computed,
    // and no compute is spent on a request that was always going to be refused.
    return json(
      429,
      { error: { code: "rate_limited", message: verdict.message } },
      { "Retry-After": String(verdict.retryAfter) },
    );
  }

  await store.save(key, record(hits, now));

  // Only the named fields travel on. A caller cannot smuggle an extra field
  // through this into the engine, and nothing else is ever read off the object.
  const scrubbed = {};
  for (const f of ALLOWED_BIRTH_FIELDS) {
    if (birth[f] !== undefined) scrubbed[f] = birth[f];
  }

  let upstream;
  try {
    upstream = await engine({ birth: scrubbed, tier: 0 });
  } catch {
    return json(502, {
      error: {
        code: "engine_unreachable",
        message: "The chart service did not answer just now. Nothing was charged. Trying again usually works.",
      },
    });
  }

  if (!upstream.ok) {
    // The engine's own message is already written for a person to read, and
    // its codes are stable, so it is passed through rather than reworded.
    return json(upstream.status, upstream.payload);
  }

  return json(200, upstream.payload);
}

function json(status, payload, headers = {}) {
  return {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...headers },
    body: JSON.stringify(payload),
  };
}
