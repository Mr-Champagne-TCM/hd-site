import { paidLevel } from "../lib/checkout.mjs";
import { getSession } from "../lib/stripe.mjs";
import { mintGrant } from "../lib/grant.mjs";

/**
 * POST /api/claim -- turn a finished purchase into an entitlement.
 *
 * The buyer comes back from Stripe holding a session id. That id is not proof
 * of anything: it travels in a URL, it can be copied, and it exists whether or
 * not anybody paid. So it is not trusted. It is used to ASK STRIPE, and Stripe's
 * answer is the proof.
 *
 * Only then is a grant minted, and the tier comes from the session's metadata --
 * set on our server when the price was set -- rather than from anything the
 * browser says. The thing bought and the thing delivered cannot drift apart.
 *
 * A 100%-off discount code produces a $0.00 session that Stripe still reports as
 * paid, so a comped reading takes this exact path. There is no test-only branch
 * to behave differently from the real one (D-8).
 */
export default async (request) => {
  if (request.method !== "POST") return json(405, { error: { code: "method", message: "POST only." } });

  const key = process.env.STRIPE_SECRET_KEY;
  const grantSecret = process.env.GRANT_SECRET;
  if (!key || !grantSecret) {
    console.log("POST /api/claim -> 503 (missing configuration)");
    return json(503, {
      error: { code: "misconfigured", message: "That could not be confirmed just now." },
    });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return json(400, { error: { code: "bad_json", message: "That request was not readable." } });
  }

  const id = body?.session_id;
  // Stripe session ids are `cs_` plus a long token. A length cap because this
  // parses what a stranger sends and nothing here should be unbounded.
  if (typeof id !== "string" || !id.startsWith("cs_") || id.length > 256) {
    return json(400, { error: { code: "bad_session", message: "That purchase could not be found." } });
  }

  let session;
  try {
    session = await getSession(key, id);
  } catch (e) {
    console.log(`POST /api/claim -> 502 (${e.code || e.message})`);
    return json(502, {
      error: {
        code: "claim_unavailable",
        message: "Your purchase could not be confirmed just now. It is safe — try reloading in a moment.",
      },
    });
  }

  const level = paidLevel(session);
  if (level === null) {
    // Not paid, still processing, or a session someone made up. All three get
    // the same answer, because telling them apart tells a stranger which ids
    // are real.
    console.log(`POST /api/claim -> 402 (payment_status ${session?.payment_status})`);
    return json(402, {
      error: { code: "not_paid", message: "That purchase has not completed. Nothing was charged." },
    });
  }

  // Short-lived on purpose. A grant is spent within minutes of buying; the
  // artefact it unlocks is kept far longer (D-7). A long-lived grant would be a
  // bearer token worth stealing.
  const grant = mintGrant({ tier: level, sku: session?.metadata?.sku, ttlSeconds: 3600 }, grantSecret);
  console.log(`POST /api/claim -> 200 (tier ${level})`);
  return json(200, { grant, level });
};

function json(status, payload) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });
}
