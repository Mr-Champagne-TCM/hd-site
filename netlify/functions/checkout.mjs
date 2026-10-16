import { checkoutProduct, creditFor, sessionParams } from "../lib/checkout.mjs";
import { createSession, ensureProduct } from "../lib/stripe.mjs";
import { readGrant } from "../lib/grant.mjs";
import { readReadingLink } from "../lib/reading.mjs";
import { TIERS } from "../../shared/pricing.mjs";
import { sellable } from "../../shared/availability.mjs";
import { getStore } from "@netlify/blobs";
import { alertSender, customerError, guard, noteFailure } from "../lib/failures.mjs";

const health = () => getStore({ name: "health", consistency: "strong" });

/** Nothing has been charged on this path, ever -- every message says so. */
async function failWith(kind, detail) {
  await noteFailure(health(), kind, {
    detail,
    send: alertSender(process.env.RESEND_API_KEY),
    site: process.env.URL,
  });
  const { status, payload } = customerError(kind);
  return json(status, payload);
}

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
export default guard("checkout", async (request) => {
  if (request.method !== "POST") return json(405, { error: { code: "method", message: "POST only." } });

  const key = process.env.STRIPE_SECRET_KEY;
  const grantSecret = process.env.GRANT_SECRET;
  if (!key || !grantSecret) {
    console.log("POST /api/checkout -> 503 (missing configuration)");
    // Nobody can buy anything while this is so: page.
    return failWith("checkout-misconfigured", "STRIPE_SECRET_KEY or GRANT_SECRET is not set");
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return failWith("checkout-bad-request", "body is not json");
  }

  const level = Number(body?.level);
  if (!Number.isInteger(level) || level < 0 || level >= TIERS.length) {
    return failWith("checkout-bad-request", `level ${String(body?.level).slice(0, 10)}`);
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
    return failWith("checkout-not-sellable", `tier ${level}`);
  }

  /**
   * WHAT THEY ALREADY OWN. Two proofs, and the SECOND one is the fix for an
   * overcharge Jeremy found by walking the site with his own card.
   *
   *   the GRANT   lives in the browser tab that paid. Good for the minutes
   *               right after a purchase, worthless the moment that tab closes.
   *
   *   the LINK    is the signed reading token. It survives the tab, the device
   *               and the week, because it arrived by email.
   *
   * He upgraded from a page reached by his emailed link on a later visit. There
   * was no grant in that tab, so the credit was zero and Stripe asked for the
   * whole price -- while the PDF in his hand said "what you have already paid
   * comes off the price there". The promise was false, and it was false on the
   * ONE PATH WE TELL EVERYBODY TO USE.
   *
   * Both are server-verified signatures, so neither is a sentence anyone can
   * type. The better of the two wins: somebody holding a chart link and a
   * summary grant is credited for the chart.
   */
  const held = readGrant(body?.grant, grantSecret);
  const link = readReadingLink(body?.reading, grantSecret, Date.now());
  const alreadyPaidCents = creditFor({
    grantTier: held.ok ? held.tier : -1,
    linkTier: link.ok ? link.tier : -1,
    level,
  });

  const origin = new URL(request.url).origin;

  // The tier's own Stripe product, so a free retry code can be held to it
  // (lib/retryCode.mjs). Without it the sale still goes ahead, inline as before.
  const product = await checkoutProduct({
    level,
    mode: /^[sr]k_live_/.test(key.trim()) ? "live" : "test",
    ensure: (p) => ensureProduct(key, p),
    note: (detail) => noteFailure(health(), "checkout-product-missing", { detail }),
  });

  try {
    const session = await createSession(key, sessionParams({ level, alreadyPaidCents, origin, product }));
    console.log(`POST /api/checkout -> 200 (tier ${level}, credit ${alreadyPaidCents}${product ? "" : ", inline product"})`);
    return json(200, { url: session.url });
  } catch (e) {
    // Stripe's message is for a developer; the visitor gets one written for a
    // visitor. The detail goes to the log, where it is useful and not alarming.
    console.log(`POST /api/checkout -> 502 (${e.code || e.message})`);
    return failWith("checkout-stripe-failed", `stripe ${e?.status ?? e?.name ?? "error"}${e?.code ? ` ${e.code}` : ""}`);
  }
}, { health });

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
