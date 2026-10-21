import { getStore } from "@netlify/blobs";
import { getSession } from "../lib/stripe.mjs";
import { handleClaim } from "../lib/claimHandler.mjs";
import { alertSender, guard, noteFailure } from "../lib/failures.mjs";
import { sendMail } from "../lib/mail.mjs";
import { SITE } from "../lib/siteLinks.mjs";
import { INDEX_STORE } from "../lib/charts.mjs";

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
 *
 * The thin half. Everything that can go wrong lives in ../lib/claimHandler.mjs,
 * where a test makes each failure happen on purpose (10/16).
 */
const health = () => getStore({ name: "health", consistency: "strong" });

export default guard(
  "claim",
  async (request) => {
    if (request.method !== "POST") return json(405, { error: { code: "method", message: "POST only." } });

    const mailKey = process.env.RESEND_API_KEY;
    const result = await handleClaim({
      body: await request.text(),
      stripeKey: process.env.STRIPE_SECRET_KEY,
      grantSecret: process.env.GRANT_SECRET,
      getSession,
      readings: getStore({ name: "readings", consistency: "strong" }),
      // The per-email list of charts, behind "Email me my charts" (release 2).
      index: getStore({ name: INDEX_STORE, consistency: "strong" }),
      send: mailKey ? (message) => sendMail(message, { apiKey: mailKey }) : null,
      note: (kind, { detail, paid, ref } = {}) =>
        noteFailure(health(), kind, { detail, paid, ref, send: alertSender(mailKey), site: process.env.URL }),
      origin: new URL(request.url).origin,
      links: SITE,
    });
    return json(result.status, result.payload);
  },
  { health },
);

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
export const config = { path: "/api/claim" };
