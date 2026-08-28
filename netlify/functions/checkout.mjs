import { sessionParams } from "../lib/checkout.mjs";
import { createSession } from "../lib/stripe.mjs";
import { readGrant } from "../lib/grant.mjs";
import { TIERS } from "../../shared/pricing.mjs";
import { sellable } from "../../shared/availability.mjs";

/**
 * POST /api/checkout -- start a purchase.
 *
 * Takes the tier being bought and, optionally, a grant proving what the buyer
 * already owns. Returns the URL of a Stripe-hosted page to send them to.
 *
 * THE AMOUNT IS NOT AN INPUT. It is computed from the tier and from a VERIFIED
 * grant, so "I already paid for the chart" is not a sentence anyone can type to
 * get the reading at the after-the-chart price. A checkout that trusts a
 * client-supplied credit is a checkout whose prices are suggestions.
 */
export default async (request) => {
  if (request.method !== "POST") return json(405, { error: { code: "method", message: "POST only." } });

  const key = process.env.STRIPE_SECRET_KEY;
  const grantSecret = process.env.GRANT_SECRET;
  if (!key || !grantSecret) {
    console.log("POST /api/checkout -> 503 (missing configuration)");
    return json(503, {
      error: { code: "misconfigured", message: "Checkout is briefly unavailable. Nothing was charged." },
    });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return json(400, { error: { code: "bad_json", message: "That request was not readable." } });
  }

  const level = Number(body?.level);
  if (!Number.isInteger(level) || level < 0 || level >= TIERS.length) {
    return json(400, { error: { code: "bad_tier", message: "That is not something on offer." } });
  }

  /**
   * Refused here, not hidden on the page.
   *
   * The buy buttons post a tier number, and anyone can post that number by
   * hand -- so the page not offering a chart is not the same as a chart not
   * being purchasable. This is the block. Everything the page does about it is
   * decoration on top.
   */
  if (!sellable(level)) {
    console.log(`POST /api/checkout -> 409 (tier ${level} not sellable yet)`);
    return json(409, {
      error: {
        code: "not_yet",
        message:
          "That one is not ready to buy yet. Nothing was charged — the summary is available now.",
      },
    });
  }

  // What they already own, taken from the grant and nowhere else. A grant that
  // does not verify is worth exactly as much as no grant: zero credit, full
  // price. It is never an error -- somebody arriving fresh has no grant, and
  // that is the normal case.
  const held = readGrant(body?.grant, grantSecret);
  const alreadyPaidCents = held.ok && held.tier < level ? TIERS[held.tier].cents : 0;

  const origin = new URL(request.url).origin;

  try {
    const session = await createSession(key, sessionParams({ level, alreadyPaidCents, origin }));
    console.log(`POST /api/checkout -> 200 (tier ${level}, credit ${alreadyPaidCents})`);
    return json(200, { url: session.url });
  } catch (e) {
    // Stripe's message is for a developer; the visitor gets one written for a
    // visitor. The detail goes to the log, where it is useful and not alarming.
    console.log(`POST /api/checkout -> 502 (${e.code || e.message})`);
    return json(502, {
      error: {
        code: "checkout_unavailable",
        message: "The payment page did not open just now. Nothing was charged — another try usually works.",
      },
    });
  }
};

function json(status, payload) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });
}

/**
 * The route lives with the function, the way chart.mjs and places.mjs do.
 * Netlify serves a v2 function at its own declared path; without this it is
 * reachable only at /.netlify/functions/... and /api/... is a 404 -- which is
 * exactly how the first deploy of this shipped.
 */
export const config = { path: "/api/checkout" };
