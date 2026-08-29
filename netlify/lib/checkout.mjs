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
/**
 * WHAT COMES OFF THE PRICE, from two proofs of what is already owned.
 *
 * Lifted out of the endpoint so it can be tested without Stripe, because this
 * is the arithmetic that overcharged a real buyer: credit used to come only
 * from a GRANT held in the tab that paid, and the path we tell everybody to use
 * -- the link in their email, on a later visit -- has no such tab.
 *
 * Both inputs are verified signatures, checked by the caller. Neither is a
 * claim anybody can type. The BETTER of the two wins: somebody holding a chart
 * link and a stale summary grant is credited for the chart.
 *
 * Credit is only ever for a tier BELOW the one being bought. Buying something
 * cheaper than what you hold is not an upgrade and earns nothing back.
 */
export function creditFor({ grantTier = -1, linkTier = -1, level }) {
  const owned = Math.max(
    Number.isInteger(grantTier) ? grantTier : -1,
    Number.isInteger(linkTier) ? linkTier : -1,
  );
  if (owned < 0 || owned >= level) return 0;
  return TIERS[owned]?.cents ?? 0;
}

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
    /**
     * CONSENT COLLECTION IS OFF UNTIL JEREMY AGREES TO STRIPE'S EXTRA TERMS.
     *
     * Switching it on broke checkout outright, live, and the button reported
     * only "the payment page did not open". Stripe's actual answer, found in
     * the function log rather than guessed at a second time:
     *
     *   To set `consent_collection.promotions`, please visit
     *   dashboard.stripe.com/settings/checkout to agree to the Terms of
     *   Service.
     *
     * That is a terms agreement and belongs to the account holder, not to
     * whoever is editing this file. Restore the line below once it is accepted:
     *
     *     consent_collection: { promotions: "auto" },
     *
     * Until then the phone and email are still collected -- delivery needs
     * them (D-7) -- but nobody is asked about marketing, and NOBODY MAY BE
     * MARKETED TO on the strength of having bought something. Delivery consent
     * and marketing consent are different permissions (D-9), and the absence of
     * the question is not a yes.
     */
    /**
     * A customer record every time, and it is REQUIRED rather than tidy.
     *
     * In payment mode Stripe creates a customer only `if_required`, and a
     * consent answer has nothing to attach to without one -- so asking for
     * consent while leaving this at its default makes the whole session fail
     * to create. That is exactly what happened: the buy button reported "the
     * payment page did not open", live, with no clue as to why, because the
     * Stripe error is logged rather than shown.
     *
     * It is also the thing D-9c needs. Credit at upgrade is keyed to the email
     * on the earlier purchase, and looking that up means the earlier purchase
     * has to be attached to a customer rather than floating loose. Same record
     * is the contact list.
     */
    customer_creation: "always",
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
