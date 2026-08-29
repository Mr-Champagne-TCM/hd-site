import { getStore } from "@netlify/blobs";
import { paidLevel } from "../lib/checkout.mjs";
import { getSession } from "../lib/stripe.mjs";
import { mintGrant } from "../lib/grant.mjs";
import { mintReadingLink, nameCase, saveReading } from "../lib/reading.mjs";
import { deliveryEmail } from "../lib/deliveryEmail.mjs";
import { record } from "../lib/health.mjs";
import { sendMail } from "../lib/mail.mjs";
import { SITE } from "../lib/siteLinks.mjs";

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

  /**
   * THE PURCHASE IS RECORDED BEFORE THERE IS ANYTHING TO SHOW.
   *
   * The order runs backwards from what you would guess, and it is Jeremy's
   * ruling: no birth-data entry until a payment succeeds and a signed link
   * gives access to the form. So the record written here holds the RECEIPT --
   * name, email, phone, when, what -- and no chart at all. The link points at
   * it immediately, because the link is how they reach the form.
   *
   * Stripe is where those details come from, never the browser. A page that
   * could name the buyer is a page that could name a different one.
   */
  const buyer = session?.customer_details ?? {};
  let url = null;
  try {
    const store = getStore({ name: "readings", consistency: "strong" });
    const id = await saveReading(store, {
      tier: level,
      output: null,
      name: buyer.name ?? null,
      email: buyer.email ?? null,
      phone: buyer.phone ?? null,
      sku: session?.metadata?.sku ?? null,
      purchasedAt: typeof session?.created === "number" ? session.created * 1000 : Date.now(),
    });
    url = `${new URL(request.url).origin}/r/${mintReadingLink({ id, tier: level }, grantSecret)}`;
  } catch (e) {
    // A failure here must NOT fail the claim. The money is taken and the buyer
    // is looking at the page; the grant in the response is what lets them
    // carry on right now. Losing the emailed copy is a problem to fix, not a
    // reason to tell somebody their purchase did not work.
    console.log(`POST /api/claim: could not record the purchase (${e.message})`);
    // The worst failure on this path: money taken, nothing stored, and the page
    // still looks fine. It must reach somebody.
    await record(getStore({ name: "health", consistency: "strong" }), {
      kind: "claim-not-recorded",
      detail: e.message,
    }).catch(() => {});
  }

  /**
   * The email is best-effort for the same reason, and it is sent WITHOUT
   * awaiting anything the response depends on. A buyer who never sees the
   * email still has their reading on screen and can ask for it again.
   */
  if (url && buyer.email && process.env.RESEND_API_KEY) {
    const { subject, html, text } = deliveryEmail({
      tier: level,
      /**
       * THE CAPITALISED NAME, the same one the store keeps.
       *
       * saveReading runs `nameCase` on the way in, so the reading page and the
       * form both say "Asdf Asdf". This email was reading Stripe's raw
       * `customer_details.name` a few lines above and said "Hello asdf asdf,"
       * -- the one surface that skipped the rule, because it had the raw value
       * in hand and never asked the store for the tidy one.
       */
      name: nameCase(buyer.name),
      url,
      links: SITE,
      // Always pending here. This email goes out the moment the card clears,
      // and nobody has entered a birth moment yet -- the link opens a form.
      pending: true,
    });
    const sent = await sendMail(
      { to: buyer.email, subject, html, text },
      { apiKey: process.env.RESEND_API_KEY },
    );
    // Logged either way, and never with the address in it.
    console.log(`POST /api/claim: delivery email ${sent.ok ? "sent" : `failed (${sent.reason})`}`);
    /**
     * RECORDED, not just logged. This send is best-effort on purpose -- losing
     * it must never fail a purchase -- and "best effort, logged" is how a buyer
     * ends up the only person who knows. The reason travels; the address never
     * does.
     */
    if (!sent.ok) {
      await record(getStore({ name: "health", consistency: "strong" }), {
        kind: "claim-email",
        detail: `${sent.reason} (tier ${level})`,
      });
    }
  } else if (url && !buyer.email) {
    console.log("POST /api/claim: no email on the purchase, nothing sent");
  }

  console.log(`POST /api/claim -> 200 (tier ${level}${url ? ", link minted" : ", NO LINK"})`);
  // `url` goes back so the page can offer it immediately -- the buyer is
  // already holding it, so this reveals nothing they do not have.
  return json(200, { grant, level, url });
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
export const config = { path: "/api/claim" };
