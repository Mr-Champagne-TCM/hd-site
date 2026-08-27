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
  library: "The Library",
  toCoaching: "Coaching",
};

/**
 * Where the rest of the practice lives.
 *
 * The main site has an intuitive flow already and that is the baseline; this
 * page joins it rather than starting a second one. So: a small number of links,
 * each landing where it is genuinely wanted, and none of them duplicated in
 * three places.
 */
export const SITE = {
  home: "https://thechampagnemethod.co",
  library: "https://thechampagnemethod.co/library/",
  hd101: "https://thechampagnemethod.co/library/human-design/",
  bodygraph: "https://thechampagnemethod.co/library/bodygraph/",
  connect: "https://thechampagnemethod.co/#connect",
};

/**
 * Reading matched to what someone is actually holding.
 *
 * Both pieces are already free and public in the library, so nothing is being
 * withheld here -- the only question is placement, and each lands where it is
 * wanted. From the app's own handoff: "the guide answers 'what am I looking at'
 * for someone holding a paid reading, HD 101 answers 'what is this system' for
 * a stranger. Different readers."
 */
export const RESOURCES = {
  title: "Free reading, either way",
  body:
    "Two pieces in the library, written for exactly these two moments. Both are free and always " +
    "will be, whether or not anything is bought here.",
  items: [
    {
      href: "https://thechampagnemethod.co/library/human-design/",
      tag: "Goes with the summary",
      title: "Human Design, plainly",
      blurb:
        "What it is, what it is not, and the one thing it is actually useful for. Six minutes, " +
        "no jargon you have to look up — and it explains every word in a summary.",
    },
    {
      href: "https://thechampagnemethod.co/library/bodygraph/",
      tag: "Goes with the chart",
      title: "Reading your bodygraph",
      blurb:
        "The picture itself: what the shapes mean, why some are filled and some are not, and " +
        "what to make of the difference. Written for someone holding their own chart.",
    },
  ],
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
  title: "Measured against the sky",
  body:
    "Human Design calculators do not all agree with each other. So rather than pick one and match " +
    "it, this engine is measured against the thing they are all approximating: where the planets " +
    "actually were.",

  /**
   * Physics is the authority here, not another vendor.
   *
   * The old framing had somebody else holding the ruler — "matched exactly",
   * "checked against", "79 of 84". Every one of those sentences made Genetic
   * Matrix the authority and this engine the student. The numbers have not
   * changed; who they are measured against has.
   *
   * What is deliberately NOT claimed: that positions are corrected to JPL. The
   * Neptune correction is measured, works, and is parked until it can go through
   * the full release gate. "Measured against" is true today; "adapted to" would
   * be a claim about code that is not running.
   */
  checks: [
    [
      "0.46″",
      "average distance from NASA's Jet Propulsion Laboratory ephemeris — the planetary " +
        "positions used to navigate spacecraft. In birth-time terms, about eleven seconds of clock",
    ],
    [
      "2.6 million",
      "activations computed and checked across 100,000 charts. No other Human Design service " +
        "publishes an error rate at all",
    ],
    [
      "15 of 15",
      "cases where established calculators contradict one another — two independent engines " +
        "landed where this one does, on every single one",
    ],
    [
      "20×",
      "how much more the field disagrees with itself than this engine differs from the " +
        "astronomical record",
    ],
  ] as const,

  closing:
    "That last number is the honest shape of it. Where calculators split over doctrine they " +
    "disagree on roughly six charts in a thousand; this engine's own residual — a Sun-line profile " +
    "sitting within half an arcsecond of a boundary — is about one in three thousand. Two " +
    "engines built on the same ephemeris still disagree with each other. There is no perfect " +
    "answer available to anyone, so the number is published rather than implied.",
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
  /**
   * Where the asking starts and where it stops.
   *
   * Reported as "it is hard to tell when you're done" -- three fields in a
   * column give no edge, so there is no moment where somebody can see they have
   * finished. Two labelled rules put a top and a bottom on it, and the closing
   * one counts down rather than just sitting there.
   */
  startRule: "Three things, then you’re done",
  endRule: "That’s everything",
  restart: "Start a new chart",
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
