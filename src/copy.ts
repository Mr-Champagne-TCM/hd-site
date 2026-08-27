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
  title: "Where these charts come from",
  body:
    "The chart is computed here, by an engine written for this practice rather than licensed from " +
    "anyone. That means it can be checked against other people’s, and it has been — most usefully " +
    "on the cases where established calculators disagree with each other.",
  /**
   * Ordered by what a sceptic would actually find convincing, not by size.
   *
   * The first line is the one no competitor can print. Human Design engines do
   * not all agree; there is a genuine doctrine split over motor-to-throat chain
   * rules, and on every contested case two independent hosted engines came down
   * on the side this one takes. That is a stronger claim than any count.
   *
   * The Genetic Matrix figure was leading this list and reading as a small
   * sample. It is not a sample -- those charts were chosen BECAUSE they are the
   * hard ones. It says so now, and it sits further down where it belongs.
   */
  checks: [
    [
      "15 of 15",
      "contested cases — where Human Design calculators genuinely disagree with one another, " +
        "two independent engines both came down on the side this one takes",
    ],
    [
      "100,000",
      "charts checked against another engine end to end, agreeing on 99.89% of all activations",
    ],
    [
      "0.46″",
      "average difference from JPL Horizons, the astronomical reference — about eleven seconds " +
        "of clock time, when birth times are recorded to the minute at best",
    ],
    [
      "16 hard cases",
      "reference charts from Genetic Matrix, picked for the doctrine, rare-authority and " +
        "boundary cases that break engines — matched exactly, all sixteen",
    ],
  ] as const,
  closing:
    "Across 84 targeted cases put through Human Design Hub and Bodygraph, 79 matched. The five " +
    "that did not are Sun-line profiles sitting within half an arcsecond of a boundary — about one " +
    "chart in three thousand. That is written here rather than left out, because a number you can " +
    "check is worth more than a claim you cannot.",
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
