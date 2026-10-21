/**
 * Every price, in one place. No price literal anywhere else, in any repo.
 *
 * A price in three files is a price that will eventually disagree with itself,
 * and the first to find out is a customer holding a page that says one number
 * and a Stripe receipt that says another.
 *
 * Cents, not dollars. Floating-point money is how $11.11 becomes $11.109999.
 */

export const SUMMARY = {
  sku: "hd_summary",
  cents: 111,
  label: "The summary",
  /** On Stripe's checkout (fix 14B, 10/19): the product's own name and a plain line. */
  checkoutName: "Human Design summary",
  checkoutDescription: "Your chart's key facts in plain words: type, strategy, authority, profile and more.",
  blurb: "Type, Strategy, Authority, Profile, Definition, your centers, your incarnation cross.",
  /** The same, to a buyer starting a chart for someone else (W8, 10/21): THEIR centers. */
  theirBlurb: "Type, Strategy, Authority, Profile, Definition, their centers, their incarnation cross.",
};

export const CHART = {
  sku: "hd_chart",
  cents: 1111,
  label: "The chart",
  checkoutName: "Human Design chart",
  checkoutDescription: "Your bodygraph drawn, your chart's values, and a PDF to keep.",
  blurb: "Your bodygraph, drawn — a page you can share and a PDF you keep — with your channels and activated gates.",
  theirBlurb: "Their bodygraph, drawn — a page you can share and a PDF you keep — with their channels and activated gates.",
};

export const READING = {
  sku: "hd_reading",
  cents: 4444,
  label: "The reading",
  checkoutName: "Human Design reading",
  checkoutDescription: "Your chart, a written reading of about 1,200 words, and a PDF to keep.",
  blurb: "All twenty-six activations with the planet behind each, and the written interpretation.",
  theirBlurb: "All twenty-six activations with the planet behind each, and the written interpretation.",
};

/** A slot for gift purchases. Not in v1, and the schema does not change later. */
export const GIFT = null;

/** Cheapest first. The ladder, in order. */
export const TIERS = [SUMMARY, CHART, READING];

/**
 * Under Stripe's Pay button (fix 14B, 10/19): what comes next, so the step
 * after paying is no surprise.
 */
export const CHECKOUT_NEXT_STEP = "Next: your birth date, time and place (about 2 minutes).";

/** The same line on an upgrade whose chart keeps its birth details: nothing to type (fix 4, 10/21). */
export const checkoutNextStepKept = (level) =>
  `Next: one look at your kept birth details, then your ${level >= 2 ? "reading is written" : "chart is drawn"}.`;

/**
 * WHAT YOU HAVE ALREADY PAID COMES OFF WHAT YOU PAY NEXT.
 *
 * Jeremy's rule, and it has a property worth saying out loud: every route to the
 * reading costs exactly $44.44. Straight there, or a dollar at the door and then
 * up, or all three steps - the total is the same number every time.
 *
 *   summary            $1.11
 *   summary -> chart   $10.00   (=$11.11 - $1.11)
 *   chart -> reading   $33.33   (=$44.44 - $11.11)
 *
 *   $1.11 + $10.00 + $33.33 = $44.44
 *
 * This replaces the spec's earlier arrangement, where the ladder came to $38
 * against $44 direct and P-3 had to apologise for the difference in copy. There
 * is now nothing to apologise for: nobody is punished for starting small and
 * nobody is punished for going straight to the end.
 */
export function priceFor(tier, alreadyPaidCents = 0) {
  const due = tier.cents - alreadyPaidCents;
  if (due < 0) throw new Error(`Credit ${alreadyPaidCents} exceeds ${tier.sku} at ${tier.cents}`);
  return due;
}

/** The whole ladder, for the offer page. */
export function ladder() {
  let paid = 0;
  return TIERS.map((tier) => {
    const due = priceFor(tier, paid);
    const row = { tier, full: tier.cents, due, credit: paid };
    paid = tier.cents;
    return row;
  });
}

export function money(cents) {
  return `$${(cents / 100).toFixed(2)}`;
}

/**
 * What Stripe takes, US standard: 2.9% + 30c.
 *
 * Two numbers, named separately, because conflating them is how a table ends up
 * reporting the fee where it means the take-home. `fee` is what Stripe keeps.
 * `net` is what lands in the account. `netPercent` is the share YOU keep.
 */
export function stripe(cents) {
  const fee = Math.round(cents * 0.029) + 30;
  const net = cents - fee;
  return {
    fee,
    net,
    feePercent: (fee / cents) * 100,
    netPercent: (net / cents) * 100,
  };
}
