/**
 * Every price, in one place. No price literal anywhere else, in any repo.
 *
 * A price in three files is a price that will eventually disagree with itself,
 * and the first to find out is a customer holding a page that says one number
 * and a Stripe receipt that says another.
 *
 * Cents, not dollars. Floating-point money is how $11.11 becomes $11.109999.
 *
 * TWO SIZES, AND AN HOUR WITH JEREMY (Jeremy 11/16): "Remove 3 tier model and
 * replace with 2 tier. 1st tier is bodygraph and full chart (like tier 2), at
 * $1.11. Then the 2nd tier is the 3rd current tier, full reading. 44.44 should
 * be a 1:1 meeting." Then: thirty minutes, not an hour; the one-on-one
 * includes the full reading.
 *
 *                                   chart   reading   one-on-one
 *   chart values, centers, cross       yes     yes       yes
 *   the bodygraph drawing + its PDF    yes     yes       yes
 *   the 26 activations                  -      yes       yes
 *   the written reading                 -      yes       yes
 *   30 minutes with Jeremy (Meet)       -       -        yes
 *
 * STORED LEVELS DO NOT MOVE. A record's `tier` is 0 summary, 1 chart, 2
 * reading, as it always was: every record ever sold keeps meaning what it
 * meant. The summary is OFF SALE (availability.mjs) but its records still
 * open. The one-on-one is checkout level 3, and its record is a reading
 * (tier 2) whose sku says it came with the call (`recordTierOf`).
 */

/**
 * The chart card's words (Jeremy 11/16, mock v2 A2, accepted): the drawing and
 * the key facts in plain words. They also read after "The chart contains ..."
 * (the PDF), so they start in lower case there.
 */
const CHART_CARD =
  "Your chart drawn as a picture (the bodygraph), with the key facts in plain words: how your energy works, " +
  "how you decide, how you meet the world. A page to share and a PDF to keep.";
const CHART_CARD_THEIR =
  "Their chart drawn as a picture (the bodygraph), with the key facts in plain words: how their energy works, " +
  "how they decide, how they meet the world. A page to share and a PDF to keep.";

/** OFF SALE since 11/16. Kept: every summary sold still opens, and its label and price are its history. */
export const SUMMARY = {
  sku: "hd_summary",
  cents: 111,
  label: "The summary",
  /** On Stripe's checkout (fix 14B, 10/19): the product's own name and a plain line. */
  checkoutName: "Human Design summary",
  // Neutral (10/22 verbatim read): one Stripe product per tier, so the same words show for a chart bought for someone else.
  checkoutDescription: "The chart’s key facts: type, strategy, authority, profile, centers, channels and activated gates.",
  blurb: "Type, Strategy, Authority, Profile, Definition, your centers, your channels and activated gates, your incarnation cross.",
  /** The same, to a buyer starting a chart for someone else (W8, 10/21): THEIR centers. */
  theirBlurb: "Type, Strategy, Authority, Profile, Definition, their centers, their channels and activated gates, their incarnation cross.",
  /** The first step: nothing is added to anything. */
  adds: null,
};

export const CHART = {
  sku: "hd_chart",
  cents: 111,
  label: "The chart",
  checkoutName: "Human Design chart",
  checkoutDescription: "Your chart drawn as a picture (the bodygraph), every value on it, and a PDF to keep.",
  // A chart bought for someone else (11/16 live round): Stripe's page said "Your chart".
  checkoutDescriptionTheirs: "Their chart drawn as a picture (the bodygraph), every value on it, and a PDF to keep.",
  blurb: CHART_CARD,
  theirBlurb: CHART_CARD_THEIR,
  /** What the chart adds to a summary (old summary records; the step costs nothing now and is not sold). */
  adds: "Your bodygraph drawn, and its PDF to keep.",
  addsTheirs: "Their bodygraph drawn, and its PDF to keep.",
};

export const READING = {
  sku: "hd_reading",
  cents: 1111,
  label: "The reading",
  checkoutName: "Human Design reading",
  checkoutDescription: "Your chart drawn, about 1,700 words written to it, four small things to try, and a PDF to keep.",
  checkoutDescriptionTheirs: "Their chart drawn, about 1,700 words written to it, four small things to try, and a PDF to keep.",
  // Mock v2 A7 (11/16): the upgrade box in plain words, no "planet numbers" (10/31 audit #14).
  blurb: "About 1,700 words written to your chart, four small things to try, and a PDF.",
  theirBlurb: "About 1,700 words written to their chart, four small things to try, and a PDF.",
  /** Under its price on "More for your own chart": what it adds to a chart, and to a summary. */
  adds: "About 1,700 words written to your chart, four small things to try, and a PDF.",
  addsTheirs: "About 1,700 words written to their chart, four small things to try, and a PDF.",
  addsToSummary: "Your bodygraph drawn, about 1,700 words written to your chart, four small things to try, and a PDF.",
  addsToSummaryTheirs: "Their bodygraph drawn, about 1,700 words written to their chart, four small things to try, and a PDF.",
};

/**
 * THE ONE-TO-ONE (Jeremy 11/16): thirty minutes on a video call (Google Meet),
 * the full written reading with it. Sold only once there is a calendar to
 * book (availability.mjs, BOOKING_URL in shared/booking.mjs).
 */
export const SESSION = {
  sku: "hd_session",
  cents: 4444,
  label: "The one-on-one",
  /** The card's own title (mock v2, call 3: "Go through it"). */
  title: "Go through it with Jeremy, one on one",
  checkoutName: "Human Design one-on-one with Jeremy",
  checkoutDescription: "Thirty minutes with Jeremy on a video call, your chart on screen, and your written reading.",
  checkoutDescriptionTheirs: "Thirty minutes with Jeremy on a video call, their chart on screen, and the written reading.",
  blurb: "Thirty minutes on a video call, your chart on screen. Your written reading comes with it, ready before you meet.",
  theirBlurb: "Thirty minutes on a video call, their chart on screen. The written reading comes with it, ready before you meet.",
  after: "After paying, you pick a time on Jeremy’s calendar. The Google Meet link is in the invite.",
  adds: "Thirty minutes with Jeremy on a video call, and the written reading.",
  addsTheirs: "Thirty minutes with Jeremy on a video call, and the written reading.",
  button: "30 minutes with Jeremy",
};

/** A slot for gift purchases. Not in v1, and the schema does not change later. */
export const GIFT = null;

/** What a stored record's `tier` means. Index = the stored number; never reordered. */
export const TIERS = [SUMMARY, CHART, READING];

/** What a checkout's `level` means: the record tiers, then the one-on-one. */
export const LEVELS = [SUMMARY, CHART, READING, SESSION];
export const SESSION_LEVEL = 3;

/** The two sizes on the offer page, cheapest first. */
export const ON_SALE = [CHART, READING];

/** The stored tier a checkout level makes: the one-on-one is a reading with a call. */
export function recordTierOf(level) {
  return Number.isInteger(level) ? Math.min(level, READING_LEVEL) : level;
}
const READING_LEVEL = 2;

/** The level a stored record stands at: a one-on-one's reading counts as the one-on-one. */
export function ownedLevelOf(record) {
  if (!record || !Number.isInteger(record.tier)) return -1;
  return record.sku === SESSION.sku ? SESSION_LEVEL : record.tier;
}

/**
 * Under Stripe's Pay button (fix 14B, 10/19): what comes next, so the step
 * after paying is no surprise.
 */
export const CHECKOUT_NEXT_STEP = "Next: your birth date, time and place (about two minutes).";
/** The same line for a chart bought for someone else (10/22 verbatim read): their details come next. */
export const CHECKOUT_NEXT_STEP_THEIR = "Next: their birth date, time and place (about two minutes).";

/**
 * The same line on an upgrade whose chart keeps its birth details: nothing to type (fix 4, 10/21).
 * `ownedLevel`: what the buyer already has. A reading's owner taking the one-on-one keeps the reading
 * they have (interpretJob wordsToCarry), so nothing "is written" for them: they book (11/16 local run).
 */
export const checkoutNextStepKept = (level, ownedLevel = -1, theirs = false) => {
  // A chart bought for someone else is theirs here too (11/16 live round: it said "your").
  const w = theirs ? "their" : "your";
  return level >= SESSION_LEVEL
    ? ownedLevel >= 2
      ? `Next: one look at ${w} kept birth details, then you pick a time for your thirty minutes.`
      : `Next: one look at ${w} kept birth details, then ${w} reading is written and you pick a time for your thirty minutes.`
    : `Next: one look at ${w} kept birth details, then ${w} ${level >= 2 ? "reading is written" : "chart is drawn"}.`;
};

/**
 * WHAT YOU HAVE ALREADY PAID COMES OFF WHAT YOU PAY NEXT.
 *
 * Jeremy's rule, unchanged by the two sizes (11/16). Every route lands on the
 * same total:
 *
 *   chart                $1.11
 *   chart -> reading     $10.00   (=$11.11 - $1.11)
 *   chart -> one-on-one  $43.33   (=$44.44 - $1.11)
 *   reading -> one-on-one $33.33  (=$44.44 - $11.11)
 *
 * The credit is the owned tier's price TODAY (checkout.mjs upgradeCredit). A
 * step that would cost nothing (an old summary to the chart, both $1.11) is
 * never sold: Stripe cannot take $0.00, and the page does not offer it.
 */
export function priceFor(tier, alreadyPaidCents = 0) {
  const due = tier.cents - alreadyPaidCents;
  if (due < 0) throw new Error(`Credit ${alreadyPaidCents} exceeds ${tier.sku} at ${tier.cents}`);
  return due;
}

/** The two sizes, for the offer page: each with what it costs from the one before. */
export function ladder() {
  let paid = 0;
  return ON_SALE.map((tier) => {
    const due = priceFor(tier, paid);
    const row = { tier, level: LEVELS.indexOf(tier), full: tier.cents, due, credit: paid };
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
