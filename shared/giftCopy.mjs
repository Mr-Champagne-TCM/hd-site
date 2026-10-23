/**
 * A CHART BOUGHT FOR SOMEONE ELSE, AS THE PERSON IT IS FOR READS IT
 * (decision 30, GO v3, pending Jeremy; 10/23 read F6).
 *
 * The credit lines on a chart's page and on its PDF said "What you have
 * already paid comes off what you pay next" and "The link in your email is
 * what proves it". On a gift, the person it is for paid nothing and was sent
 * no email: the buyer was. These say the same facts so they are true for
 * either reader -- the buyer, or the person the chart is for -- in Jeremy's
 * voice: plain, and nobody told what to do. The credit itself is unchanged:
 * it belongs to the chart, through its link.
 */

/** "This chart was a gift. What was paid for it comes off what is paid next — nobody pays twice for the same thing." */
export const giftCredit = (word) =>
  `This ${word} was a gift. What was paid for it comes off what is paid next — nobody pays twice for the same thing.`;

/** The PDF's page 3: where the credit lives, for a chart whose email went to the buyer. */
export const GIFT_PROOF =
  "The link in the email that came with the purchase is what proves it, so going further from there means the credit is already applied.";

/** When the next step is not on sale yet. */
export const GIFT_CREDIT_KEEPS = "The credit keeps, and this link is how you come back to it.";
