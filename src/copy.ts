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

/**
 * FIX 13A (Jeremy 10/19): the header's library link is the HUMAN DESIGN
 * library, by name ("The Library" landed on the coaching library, where HD is
 * sixth of six), and it shows on a phone too, as "Library", beside Coaching.
 */
export const NAV = {
  brand: "The Champagne Method",
  library: "The Human Design library",
  libraryShort: "Library",
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
/** The readings address, written to by buyers -- never the personal inbox (D-12). */
export const CONTACT = "hd-readings@thechampagnemethod.co";

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
      title: "The Human Design library",
      blurb:
        "Every part of a chart, one layer at a time: a line to start, more if it pulls at you. " +
        "It explains every word in a summary.",
    },
    {
      href: "https://thechampagnemethod.co/library/bodygraph/",
      tag: "Goes with the chart",
      title: "Reading your bodygraph",
      blurb:
        "The picture itself: what the shapes mean, why some are colored in and some are not, and " +
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
 * v3 (10/16, Jeremy: "get simpler, and then make the profound statements as we
 * flow through the whys and get to the why us"): written for someone who knows
 * nothing about planets or ephemerides. No arcseconds on the page; every number
 * is said in a unit a buyer already has (seconds of birth time, charts in a
 * thousand). Physics still holds the ruler, not another vendor.
 *
 * Every figure is from hd-reading-app validation/RESULTS.md, section "2026-10-16
 * (evening) -- the shop's 'Measured against the sky' numbers, re-measured for
 * engine 0.5.0" (script validation/accuracy_v050.py). None of it is rounded up.
 */
export const CREDIBILITY = {
  title: "Measured against the sky",
  // "around the time you were born", not "at the moment": the design half of a
  // chart is taken about 88 days (88 degrees of Sun) before birth. "NASA's own
  // record" = JPL Horizons; every body the engine computes was checked against
  // it in the 10/15 survey (RESULTS.md, "every body vs JPL").
  //
  // Jeremy's edits on v3 (10/16), his words exactly: the "and this one doesn't
  // copy any of them!" clause carries emphasis (bold, italic, a little larger),
  // and the NASA sentence stands on its own line as a calm pull-line (italic
  // Fraunces, gold -- the site's pull-line vocabulary). The body is therefore a
  // list of parts with an emphasis flag, rendered by Credibility() in App.tsx.
  body: [
    {
      text:
        "Your chart is worked out from where the Sun, the Moon and the planets were around the " +
        "time you were born. If a calculator places one of them even slightly wrong, part of your " +
        "chart can come out wrong with it. Human Design calculators do not all agree on those " +
        "places, ",
    },
    { text: "and this one doesn't copy any of them!", emphasis: true },
  ] as ReadonlyArray<{ text: string; emphasis?: boolean }>,
  standout: "It is checked against NASA's own record of where everything actually was.",

  checks: [
    [
      // 14 s = the Sun's typical (RMS) error against JPL on 1,000 random births
      // 1900-2030: 0.576″, at ~24.4 s of clock per ″ (the Sun moves 0.9856°/day).
      // Mean error 11 s; worst 49 s. A time rounded to the nearest minute is off
      // by up to 30 s (RMS 17 s, mean 15 s), so "less doubt than the clock" holds
      // on either measure. "than the birth record imposed" (Jeremy's words, 10/16): the
      // birth record's own rounding to the minute. The old 0.46″ came from 9
      // charts, not the 24 it said.
      // The Sun is NOT corrected; it is the same as in every release since August.
      "14 seconds",
      "how closely this engine typically follows the Sun, checked against NASA's record across " +
        "1,000 test charts and counted in birth time. The Sun sets your profile. A birth time " +
        "written to the nearest minute can already be up to 30 seconds out, so the calculation " +
        "adds less doubt than the birth record imposed",
    ],
    [
      // 2.6 million = 26 activations (13 bodies x personality + design; Earth and
      // the nodes are "planets" in Human Design's own vocabulary) x 100,000 charts,
      // every one compared with two other calculators (hdpy, dturk): 99.94% agree.
      // Jupiter to Pluto are corrected against JPL (Neptune since 0.4.0 on 10/7,
      // the other four since 0.5.0 on 10/16): 0.077-0.098″ against the Sun's
      // 0.576″, so the chance of a wrong line is about 6x smaller than the Sun's.
      // "places them more precisely" is about position. In birth-time seconds the
      // slow planets are NOT closer (they move so slowly that 0.08″ is 22 s to
      // 8 min of clock), which is why this does not say "follows" like card 1.
      // No "too" after "record": the Sun is checked against NASA, not corrected.
      "2.6 million",
      "planet positions worked out and checked, across 100,000 test charts. The five slowest " +
        "planets, Jupiter to Pluto, are now corrected against NASA's record, and this engine " +
        "places them even more precisely than it places the Sun",
    ],
    [
      // The 15 doctrine cases (spot100.csv, category doctrine_type): this engine
      // and an open-source calculator (dturk's humandesign_api) gave different
      // Types for the same instant with the same channels, i.e. they read the
      // motor-to-throat rule differently. Human Design Hub and Bodygraph were each
      // asked (Aug 2026) and each sided with this engine 15 of 15 (re-scored
      // against 0.5.0: unchanged).
      // "read the rules differently", not "gave different answers": the same two
      // services sided AGAINST this engine on 5 other cases (Sun-line profiles at
      // a boundary, an ephemeris question), so the card is held to rule splits.
      "15 of 15",
      "tie-breaks this engine won. Where it and another calculator read the rules differently " +
        "for the same birth, two more independent calculators were asked to settle it, and both " +
        "sided with this engine every time",
    ],
    [
      // 1 in 3,000: profile depends only on the two Suns (birth and design), and
      // the design Sun carries the birth Sun's error exactly. Expected profile
      // change against JPL = 2 x |error| / 3,375″ = 1 in 2,932 (RMS) to 1 in 3,735
      // (mean error); measured against another calculator 1 in 3,125.
      // 6 in 1,000: 619 of 100,000 charts where this engine and dturk give a
      // different Type with identical channels -- a split over the rules, not the
      // sky. It is NOT "other calculators disagree with each other": that pair
      // includes this engine, hence "over the rules themselves".
      "1 in 3,000",
      "roughly how often this engine's profile could differ from NASA's record, and only when the " +
        "Sun sits right on the border between two profiles. Calculators disagree over the rules " +
        "themselves on about 6 charts in every 1,000",
    ],
  ] as const,

  // "the very same planet data", not "NASA data": hdpy and dturk both run Swiss
  // Ephemeris in its Moshier mode (no .se1 files) and still differ on 83 of 2.6
  // million activations. The hedge on the last sentence stays: it is a claim
  // about every competitor, made only as far as can be checked.
  closing:
    "So why measure at all? Because a reading is only as good as the chart underneath it. No " +
    "calculator is perfect: two built on the very same planet data still disagree now and then. " +
    "So instead of promising perfection, this one is measured, and the result is published here " +
    "for you to see. As far as I can find, no other Human Design service shows you its error " +
    "rate at all.",
};

/**
 * ONE EXAMPLE EVERYWHERE (Jeremy 10/16): the summary below, the readings page,
 * its PDF and excerpt, and the library's marked example charts are all his own
 * chart -- "OK to use mine", "my name is OK". Said plainly, with no "not a real
 * person" any more, because it is one.
 */
export const EXAMPLE = {
  title: "What the summary looks like",
  caption:
    "An example: Jeremy Champagne's own chart — September 17, 1983, Wichita Falls, Texas. " +
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
  /** Fix 15B (10/19): the fold-out under the time field. */
  whyTime: "Why the time matters",
  whyTimeBody:
    "The Moon moves fast, and it carries your profile with it. A few minutes either way can change " +
    "it, so the time on a birth certificate is best if you have it. An unknown time is fine too: " +
    "the chart says plainly which parts depend on it.",
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

/**
 * KEPT, SINCE 16 OCTOBER 2026 (Jeremy: "a veer from our initial approach.
 * Update Ts and Cs/privacy as needed"). A paid chart now keeps the birth
 * details it was cast from -- date, time or unknown, place, time zone -- with
 * the reading, for the reading's own year, so the PDF can print the birth line
 * under the name the way the phone's PDF does. Said plainly, before the form.
 */
/*
 * 10/19: fix 15B drops "your link is active for 6 days" (it read as the reading
 * vanishing), and fix 17A adds the name for the chart, which is kept the same
 * way as the birth details.
 */
export const PRIVACY_NOTE_PAID =
  "The name and birth details you enter are kept with your reading, so your page and PDF can " +
  "show whose chart it is and when and where they were born. Your reading is kept for a year, " +
  "and your email always brings you back to it.";

/**
 * Tier 0 (the summary) keeps no birth details at all, so it keeps the stronger
 * sentence; the chart and the reading keep them for the PDF's birth line.
 */
export function privacyFor(tier: number): string {
  return tier > 0 ? PRIVACY_NOTE_PAID : PRIVACY_NOTE;
}

/**
 * FIX 3A (Jeremy 10/19): "Who makes this", under the opening, with his current
 * site photo and a plain "How it's made" line about the AI. His one line
 * paraphrases his own My Story; the AI facts are the privacy page's.
 */
export const WHO_MAKES = {
  label: "Who makes this",
  line:
    "I’m Jeremy Champagne. I came up in engineering, then turned to working with people instead " +
    "of parts; that became The Champagne Method, my coaching practice. I read every email that comes in.",
  howLabel: "How it’s made: ",
  myStory: "https://thechampagnemethod.co/#my-story",
};

/** FIX 5B: one plain line under his accuracy words, which stay exactly as they are. */
export const PLAIN_ACCURACY =
  "In plain words: across 1,000 test charts it was typically right to within 14 seconds of " +
  "birth time, closer than a birth time written to the minute.";

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
    "birth details went in wrong, write to hd-readings@thechampagnemethod.co — I read these " +
    "myself, and I will do what I can.",
  attribution: "Place and timezone data from GeoNames, CC BY 4.0.",
  coaching: "thechampagnemethod.co",
};
