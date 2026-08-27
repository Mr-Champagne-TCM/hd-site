/**
 * Every word on the page, in one file.
 *
 * Here rather than scattered through components so the voice can be read in one
 * sitting and checked in one pass. The rules it is checked against:
 *
 *   Requests and invitations, never commands. Nothing on this page tells a
 *   visitor what to do. "If you'd like to see yours" rather than "Get yours
 *   now". Buttons are named for what they are, not for what to do.
 *
 *   Threshold, not brochure. No countdowns, no "only N left", no intro pricing,
 *   no urgency of any kind. A price that moves is a countdown wearing a coat.
 *
 *   No shame. Nothing here suggests the reader is doing life wrong.
 *
 *   Individualised. No universal framework, no promise that this explains
 *   everyone. It is a lens, offered.
 *
 * The prices are imported from shared/pricing.mjs and never written here. A
 * price in two files is a price that will disagree with itself.
 */

export const NAV = {
  brand: "The Champagne Method",
  toCoaching: "Coaching",
};

export const HERO = {
  eyebrow: "Human Design",
  title: "A map of how your energy works.",
  standfirst:
    "Drawn from the exact moment you were born — not a personality test, and not a prediction. " +
    "What it describes is mechanics: where your energy is consistent, where it is open to " +
    "everyone else’s, and how you are built to arrive at a decision.",
  note: "Nothing on your chart is a limit.",
};

/**
 * The credibility line.
 *
 * This does the job the free tier used to do. When the summary cost nothing, a
 * visitor could satisfy themselves that the engine was worth paying for by
 * simply using it. Now the case has to be made before the card, so it is made
 * with a receipt rather than with adjectives: a low price reads as low value, a
 * checked number reads as confidence.
 *
 * Every figure here is from validation/RESULTS.md. None of it is rounded up.
 */
export const CREDIBILITY = {
  title: "Where these charts come from",
  body:
    "The chart is computed here, by an engine written for this practice rather than licensed from " +
    "anyone. That means it can be checked, and it has been.",
  checks: [
    ["16 of 16", "reference charts from Genetic Matrix, matched exactly"],
    ["79 of 84", "targeted cases against Human Design Hub and Bodygraph, two independent engines"],
    ["100,000", "charts swept against a third engine, agreeing on 99.89% of activations"],
    ["0.46″", "average difference from JPL Horizons — about eleven seconds of clock time"],
  ] as const,
  closing:
    "The five cases that disagree are Sun-line profiles sitting within half an arcsecond of a " +
    "boundary, roughly one chart in three thousand. That is written down here rather than left out, " +
    "because a number you can check is worth more than a claim you cannot.",
};

export const EXAMPLE = {
  title: "What the summary looks like",
  caption:
    "An example, not a real person — 25 June 1985, Chicago, birth time unknown. " +
    "Yours would be your own, and would say so if the time were missing.",
};

export const TIERS_INTRO = {
  title: "Three ways in",
  body:
    "The price is here before anything is asked of you, and what you have already paid comes off " +
    "what you pay next. Every route to the full reading costs the same in the end.",
};

export const LADDER_NOTE =
  "Straight to the reading, or a step at a time — the total is identical either way. " +
  "Nobody is charged twice for the same start.";

export const ENTRY = {
  title: "If you’d like to see your own",
  body:
    "Three things are needed: the date, the place, and the time if it is known. " +
    "An unknown time is welcome — the chart is cast at noon and says so plainly, " +
    "and the parts that depend on a time are marked as provisional rather than quietly guessed.",
  timeUnknownLabel: "I don’t know my birth time",
  timeUnknownHelp:
    "Most of a chart holds without one. The Moon is the fast mover, and it carries the Profile " +
    "with it — so a chart without a time is genuinely useful and honestly incomplete.",
};

export const PRIVACY_NOTE =
  "Your birth details are used to compute the chart and then discarded. They are not stored, " +
  "not logged, and not written to disk at any point.";

export const FOOTER = {
  disclaimer:
    "Readings describe a Human Design chart and are offered for self-reflection. They are not " +
    "medical, psychological, legal or financial advice, and they do not predict the future.",
  attribution: "Place and timezone data from GeoNames, CC BY 4.0.",
  coaching: "thechampagnemethod.co",
};
