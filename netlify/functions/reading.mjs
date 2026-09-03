import { getStore } from "@netlify/blobs";
import { handleReading } from "../lib/readingHandler.mjs";
import { loadReading, readReadingLink } from "../lib/reading.mjs";
import { ringIfDue } from "../lib/ring.mjs";
import { TRIGGER_HEADER, triggerToken } from "../lib/trigger.mjs";

/**
 * POST /api/reading -- open a signed reading link.
 *
 * The thin half. Everything that could be got wrong lives in
 * ../lib/readingHandler.mjs, where it is tested without Netlify, without a
 * network and without a clock. This wires it to the real store and the real
 * secret and does nothing else.
 *
 * POST rather than GET, with the token in the BODY rather than the query
 * string. A link is a bearer token, and a token in a URL ends up in access
 * logs, in a Referer header on the way to any outbound link, and in a browser's
 * history sync. The address bar still carries it -- that is unavoidable, it is
 * how somebody arrives -- but nothing downstream of that has to.
 */
export default async (request) => {
  if (request.method !== "POST") {
    return json(405, { error: { code: "method", message: "Use POST." } });
  }

  const secret = process.env.GRANT_SECRET;
  if (!secret) {
    // Refusing is the honest failure. It says what is wrong and it cannot be
    // mistaken for working -- unlike a fallback, which would serve nothing and
    // look exactly like a link that had expired.
    console.log("POST /api/reading -> 503 (GRANT_SECRET is not set)");
    return json(503, {
      error: { code: "misconfigured", message: "Readings are briefly unavailable. Please try again shortly." },
    });
  }

  const rawBody = await request.text();
  const result = await handleReading({
    body: rawBody,
    // Strong consistency: somebody arriving from an email seconds after their
    // purchase must not be told their reading does not exist because a replica
    // has not caught up yet. That is the worst possible first impression, and
    // it would be intermittent enough to be hard to believe in a bug report.
    store: getStore({ name: "readings", consistency: "strong" }),
    secret,
    now: Date.now(),
  });

  // Status only. Never the token, never the reading id, never the name -- a log
  // line is a retention window, and this one would hold both a bearer token and
  // the identity it opens.
  console.log(`POST /api/reading -> ${result.status}`);

  /**
   * THE BUYER'S OWN PAGE RINGS THE WRITER when their reading is still
   * unwritten past the grace period and nobody has rung for it lately. See
   * ../lib/ring.mjs for why: both hosted schedulers failed in one week. This
   * runs after the answer is built and never changes it; a failed ring is a
   * missed nudge, and the next poll will try again.
   */
  if (result.status === 200) {
    await nudgeIfStuck(rawBody, result.body, secret, request).catch(() => {});
  }

  return new Response(result.body, { status: result.status, headers: result.headers });
};

async function nudgeIfStuck(rawBody, answer, secret, request) {
  let parsed;
  try {
    parsed = JSON.parse(answer);
  } catch {
    return;
  }
  if (!parsed || parsed.writing !== true) return;
  let token;
  try {
    token = JSON.parse(rawBody)?.token;
  } catch {
    return;
  }
  const link = readReadingLink(token, secret, Date.now());
  if (!link.ok) return;
  const store = getStore({ name: "readings", consistency: "strong" });
  const reading = await loadReading(store, link.id, Date.now());
  if (!reading || reading.reading || reading.pending) return;
  const filledAtMs = Number(reading.filledAt) * 1000;
  const origin = process.env.URL || new URL(request.url).origin;
  const ringToken = triggerToken(secret);
  if (!ringToken) return;
  const out = await ringIfDue({
    id: link.id,
    filledAtMs,
    gate: getStore({ name: "health", consistency: "strong" }),
    ring: async (id) => {
      const res = await fetch(`${origin}/api/interpret`, {
        method: "POST",
        headers: { [TRIGGER_HEADER]: ringToken, "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      console.log(`reading: rang the writer for a stuck reading -> ${res.status}`);
    },
  });
  if (!out.rang) return;
}

function json(status, payload) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store, private" },
  });
}

export const config = { path: "/api/reading" };
