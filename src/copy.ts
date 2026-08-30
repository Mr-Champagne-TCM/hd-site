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
  /**
   * What each tier actually is, shown with real output from the example chart.
   *
   * It lives on the main site rather than here, which is Jeremy's call and the
   * cheap one: that repo publishes to GitHub Pages for nothing, while every
   * publish of this one spends Netlify credits. A page that will be edited for
   * its wording rather than its behaviour belongs on the free side.
   */
  readings: "https://thechampagnemethod.co/readings/",
  library: "https://thechampagnemethod.co/library/",
  hd101: "https://thechampagnemethod.co/library/human-design/",
  bodygraph: "https://thechampagnemethod.co/library/bodygraph/",
  connect: "https://thechampagnemethod.co/#connect",
  /** What a purchase collects and what becomes of it. Mirrored in
   *  netlify/lib/siteLinks.mjs -- test/siteLinks.test.mjs asserts they agree. */
  privacy: "https://thechampagnemethod.co/readings/privacy/",
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
  /**
   * NOT "Free reading, either way". On a site whose product is called a
   * reading, that sentence offers a free one. Jeremy read it exactly that way:
   * "implies they get a free human design reading". It meant reading MATTER.
   */
  title: "Free to read, either way",
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

/**
 * The line that does the funnelling, and where it now sits.
 *
 * "If you'd like to see your own" was introducing the entry form at the bottom
 * of the page. Jeremy's call: it is the strongest invitation on the page and it
 * belongs ABOVE the prices, where it turns three cards from a menu into an
 * answer to a question somebody is already asking.
 *
 * "Three ways in" is not discarded -- it still has a job, naming what the three
 * cards ARE. It just stops being the headline and becomes the label, which is
 * what it was doing all along.
 */
export const TIERS_INTRO = {
  lead: "If you’d like to see your own",
  title: "Three ways in",
  notYet: "Not ready to buy yet — the drawing and the written reading are still being made.",
  body:
    "The price is here before anything is asked of you, and what you have already paid comes off " +
    "what you pay next. Every route to the full reading costs the same in the end.",
};

/**
 * What is said on a tier that cannot be delivered yet.
 *
 * Honest about the reason rather than vague about the timing. "Coming soon" is
 * a promise with a date hidden in it; this says what is missing and does not
 * pretend to know when.
 */
export const LADDER_NOTE =
  "Straight to the reading, or a step at a time — the total is identical either way. " +
  "What you have already paid goes towards whatever you choose next, so nobody pays twice " +
  "for the same thing.";

export const ENTRY = {
  /**
   * Plainer than it was, because the invitation moved up to the prices. This
   * heading is a caption on a form now rather than the page's pitch -- and the
   * whole section is on its way out, once entry lives behind a signed link.
   */
  title: "Your birth details",
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

/**
 * Two promises, because only one of them stays true once money changes hands.
 *
 * The free summary genuinely keeps nothing: the details are used, the answer is
 * returned, and nothing touches a disk. That sentence is a real part of the
 * offer -- it is why somebody hands over a birth moment at all -- so it is not
 * watered down to cover a case most visitors never reach.
 *
 * A purchase is different and has to say so. The reading is saved, and the
 * reading has the buyer's birth date and place printed on it, so keeping the
 * document keeps the details. Storing only the rendered file and claiming
 * nothing was kept would be true in a database and false in the world.
 *
 * Said BEFORE the card, never after. A privacy sentence that appears once
 * somebody is already committed reads as something you hoped they would miss.
 *
 * One function rather than two strings loose in the file, for the same reason
 * P-1 keeps prices in one module: a promise written in two places is a promise
 * that will eventually disagree with itself.
 */
export const PRIVACY_NOTE =
  "Your birth details are used to compute the chart and then discarded. They are not stored, " +
  "not logged, and not written to disk at any point.";

export const PRIVACY_NOTE_PAID =
  "Your birth details are used to make your reading and then discarded. The reading itself is " +
  "saved so it can be delivered to you — your link is active for 6 days.";

/** Tier 0 is the free summary; anything above it is bought and is kept. */
export function privacyFor(tier: number): string {
  return tier > 0 ? PRIVACY_NOTE_PAID : PRIVACY_NOTE;
}

export const FOOTER = {
  disclaimer:
    "Readings describe a Human Design chart and are offered for self-reflection. They are not " +
    "medical, psychological, legal or financial advice, and they do not predict the future.",
  /**
   * ALL PURCHASES ARE FINAL. Jeremy's decision, 2026-08-29.
   *
   * SAID BEFORE THE CARD, NOT AFTER IT. A refund policy discovered afterwards
   * is not a policy, it is an excuse -- and practically, card networks let a
   * buyer dispute whatever the seller's sign says. A clearly shown policy is
   * the only version that is worth anything as evidence, and the only version
   * that is fair to somebody deciding.
   *
   * SOFTLY, POLITELY, CLEARLY -- his words, and the order matters. "No refunds"
   * is clear and neither of the other two. The wording below is final without
   * being defensive, and it leaves a door: he can offer a discount on another
   * reading, case by case, by email. That stays UNPROMISED here on purpose --
   * naming a mechanism turns a kindness into an entitlement, and then into an
   * argument about who qualifies.
   *
   * NOT A REFUND PATH FOR MISTYPED BIRTH DETAILS EITHER. Also his call: he
   * handles those himself, from his own app, one at a time. Automating it can
   * wait until the volume asks for it.
   */
  terms:
    "All purchases are final. Your reading is made and sent the moment you ask for it, so there " +
    "is nothing to send back — and I would rather say so plainly here than leave you to find " +
    "out later. Two exceptions, and I would rather name the exceptions than have you wonder: if " +
    "something did not arrive, or did not work, that is mine to put right. And if your " +
    "birth details went in wrong, write to me — I read these myself, and I will do what I can.",
  attribution: "Place and timezone data from GeoNames, CC BY 4.0.",
  coaching: "thechampagnemethod.co",
};
