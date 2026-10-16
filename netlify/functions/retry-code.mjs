import { getStore } from "@netlify/blobs";
import { handleRetryCode } from "../lib/retryCode.mjs";
import { createCoupon, createPromotionCode } from "../lib/stripe.mjs";

/**
 * GET/POST /api/admin/retry-code -- the one-tap free retry code from an alert.
 *
 * The thin half; every rule (signed, expiring, one use per incident, GET makes
 * nothing) lives in ../lib/retryCode.mjs, tested with a fake Stripe.
 *
 * Nothing here is reachable without a link this site signed. A stranger who
 * finds the path gets "Not a working link" and nothing else.
 */
export default async (request) => {
  try {
    const url = new URL(request.url);
    let token = url.searchParams.get("t") ?? "";
    if (request.method === "POST") {
      const form = await request.formData().catch(() => null);
      token = String(form?.get("t") ?? token);
    } else if (request.method !== "GET") {
      return new Response("Method not allowed", { status: 405 });
    }

    const stripeKey = process.env.STRIPE_SECRET_KEY;
    const result = await handleRetryCode({
      method: request.method,
      token,
      store: getStore({ name: "health", consistency: "strong" }),
      secret: process.env.GRANT_SECRET,
      stripe: stripeKey
        ? {
            createCoupon: (params, opts) => createCoupon(stripeKey, params, opts),
            createPromotionCode: (params, opts) => createPromotionCode(stripeKey, params, opts),
          }
        : null,
      now: Date.now(),
    });
    // Status only; never the token or the code.
    console.log(`${request.method} /api/admin/retry-code -> ${result.status}`);
    return new Response(result.html, { status: result.status, headers: result.headers });
  } catch (e) {
    console.log(`retry-code: unexpected failure (${e?.name ?? "Error"})`);
    return new Response("Nothing was made. The Stripe dashboard can make the code by hand (Coupons).", {
      status: 500,
      headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
    });
  }
};

export const config = { path: "/api/admin/retry-code", method: ["GET", "POST"] };
