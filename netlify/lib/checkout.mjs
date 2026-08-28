import { TIERS, priceFor } from "../../shared/pricing.mjs";

/**
 * What we ask Stripe for, worked out here so it can be tested without a network.
 *
 * The amount is NEVER passed in from the browser. It is computed from the tier
 * and whatever the buyer has already paid, using the same `priceFor` the offer
 * page prints -- so the number on the page and the number on the card are the
 * same number by construction rather than by agreement. A checkout that trusts
 * a client-supplied amount is a checkout where the price is whatever the buyer
 * types.
 *
 * Stripe's API is form-encoded with square-bracket nesting rather than JSON,
 * which is why this builds a flat list of key/value pairs.
 */

/** Cheapest first, so the index IS the tier. */
export function tierAt(level) {
  if (!Number.isInteger(level) || level < 0 || level >= TIERS.length) return null;
  return TIERS[level];
}

/**
 * Turn a nested object into Stripe's `a[b][c]=d` form encoding.
 *
 * Written out rather than pulled from the Stripe SDK because the SDK is a
 * dependency we do not otherwise need: this file makes two API calls in total,
 * both with fetch, and a package that ships its own HTTP stack to do that is
 * weight without benefit.
 */
export function formEncode(obj, prefix = "") {
  const out = [];
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || v === null) continue;
    const key = prefix ? `${prefix}[${k}]` : k;
    if (typeof v === "object" && !Array.isArray(v)) {
      out.push(...formEncode(v, key));
    } else if (Array.isArray(v)) {
      v.forEach((item, i) => {
        if (typeof item === "object") out.push(...formEncode(item, `${key}[${i}]`));
        else out.push([`${key}[${i}]`, String(item)]);
      });
    } else {
      out.push([key, String(v)]);
    }
  }
  return out;
}

/**
 * The parameters for one Checkout Session.
 *
 * `alreadyPaidCents` is what the buyer has already bought, and it comes from a
 * VERIFIED grant rather than from the request body -- otherwise "I already
 * bought the chart" would be a sentence anyone could type to get the reading at
 * the discounted step price.
 */
export function sessionParams({ level, alreadyPaidCents = 0, origin }) {
  const tier = tierAt(level);
  if (!tier) throw new Error(`sessionParams: no tier ${level}`);
  const due = priceFor(tier, alreadyPaidCents);

  return {
    mode: "payment",
    /**
     * A phone number, and a recorded answer about being contacted.
     *
     * Stripe always collects an email -- it needs one for the receipt -- so that
     * arrives whether or not it is asked for. The phone does not, and Stripe has
     * no optional mode: switching this on makes it REQUIRED, which is friction
     * on a small purchase and was accepted deliberately.
     *
     * It has a purchase use rather than being a pretext: D-7 delivers by email
     * OR TEXT, and both go to the details on the purchase.
     *
     * `consent_collection` is the part that matters later. Delivering to
     * somebody who bought is one thing; marketing to them is a different thing
     * legally, and for SMS in the US it is a different thing with a price on it.
     * Asking once, here, means the contact list arrives already sorted into who
     * may be marketed to and who may only be delivered to -- rather than that
     * being worked out afterwards, or found out the hard way.
     */
    phone_number_collection: { enabled: true },
    consent_collection: { promotions: "auto" },
    // The buyer types a discount code on Stripe's page, not ours. We never
    // validate a code, never count redemptions, and never hold one (D-8).
    allow_promotion_codes: true,
    // Where they land afterwards. The session id is how the page claims what
    // was bought -- see claim.mjs for why that is safe.
    // The anchor is load-bearing. Without it a buyer lands at the TOP of the
    // page while the confirmation renders inside the form far below, so a
    // payment that worked looks like a payment that vanished. Reported as
    // "no way to tell this was successful by looking back at the site".
    success_url: `${origin}/?paid={CHECKOUT_SESSION_ID}#yours`,
    cancel_url: `${origin}/#yours`,
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: "usd",
          unit_amount: due,
          product_data: { name: tier.label, description: tier.blurb },
        },
      },
    ],
    // Read back on claim. The tier a session was FOR is decided here, on the
    // server, at the moment the price is set -- so the thing bought and the
    // thing delivered cannot drift apart.
    metadata: { level: String(level), sku: tier.sku },
  };
}

/**
 * Did this session actually get paid for?
 *
 * `payment_status` is the field that matters, not `status`. A session can be
 * `complete` while payment is still processing, and a $0.00 session -- which is
 * what a 100%-off discount code produces -- reports `paid` with no charge. That
 * is deliberate: the free path and the paid path are the same path (D-8).
 */
export function paidLevel(session) {
  if (!session || session.payment_status !== "paid") return null;
  const level = Number(session?.metadata?.level);
  return Number.isInteger(level) && level >= 0 && level < TIERS.length ? level : null;
}
