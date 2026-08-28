import { getStore } from "@netlify/blobs";
import { handleReading } from "../lib/readingHandler.mjs";

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

  const result = await handleReading({
    body: await request.text(),
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

  return new Response(result.body, { status: result.status, headers: result.headers });
};

function json(status, payload) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store, private" },
  });
}

export const config = { path: "/api/reading" };
