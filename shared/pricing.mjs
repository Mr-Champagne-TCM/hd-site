/**
 * Every price, in one place. No price literal anywhere else, in any repo.
 *
 * A price in three files is a price that will eventually disagree with itself,
 * and the first person to find out is a customer looking at one number on the
 * page and a different one on a Stripe receipt.
 *
 * Cents, not dollars. Floating point money is how $11.00 becomes $10.999999.
 */

export const SUMMARY = {
  sku: "hd_summary",
  cents: 111,
  label: "The summary",
  blurb: "Type, Strategy, Authority, Profile, Definition, your centres and your incarnation cross.",
};

export const CHART = {
  sku: "hd_chart",
  cents: 1100,
  label: "The chart",
  blurb: "Your bodygraph, drawn — as a page you can share and a PDF you keep — with your channels and activated gates.",
};

export const READING = {
  sku: "hd_reading",
  cents: 4400,
  label: "The reading",
  blurb: "All twenty-six activations with the planet behind each, and the written interpretation.",
};

export const UPGRADE = {
  sku: "hd_upgrade",
  cents: 2700,
  label: "Add the reading",
  blurb: "Everything the reading has, applied to the chart you already hold. Same link, same passcode.",
};

/** A slot for gift purchases. Not in v1, but the schema does not change later. */
export const GIFT = null;

export const TIERS = [SUMMARY, CHART, READING];

/**
 * Buying the chart and then adding the reading comes to less than the reading
 * bought outright. That is said out loud on the offer page rather than left for
 * someone to discover: an arithmetic quirk stated plainly is a kindness, and the
 * same quirk found later is something a customer resents.
 */
export const LADDER_TOTAL = CHART.cents + UPGRADE.cents; // 3800
export const LADDER_SAVING = READING.cents - LADDER_TOTAL; // 600

export function money(cents) {
  return `$${(cents / 100).toFixed(2).replace(/\.00$/, "")}`;
}

/**
 * What Stripe takes, US standard: 2.9% + 30 cents.
 *
 * Here so the arithmetic is visible rather than remembered. On the summary the
 * flat 30 cents dominates -- 33 cents of $1.11, 29% -- which is the known and
 * accepted cost of putting a card in front of the front door.
 */
export function stripeFee(cents) {
  return Math.round(cents * 0.029) + 30;
}
