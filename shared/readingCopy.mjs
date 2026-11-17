/**
 * Words the result page and BOTH PDFs (the shop's and, ported, the phone's)
 * print the same way -- newcomer-review fixes accepted 10/19. One place, so
 * the page, the PDF and the phone cannot drift.
 */

/**
 * FIX 6A: the planet-number grid, folded closed on the page and named and
 * explained in the PDF (a PDF cannot fold). Mock words, as approved.
 */
/**
 * Q7c (11/16, accepted): named for what it is, and said to be optional. `n` is kept for the
 * callers that pass the count; the title no longer prints it.
 */
export const techTitle = (_n = 26) => "The raw numbers behind your chart";
export const TECH_TITLE_NOTE = "(optional)";

/**
 * Q6 + Q7b (11/16, accepted): a few plain words under each label, the same on the offer page's
 * example, the chart page and the PDF. Keyed by the chart's own field names.
 */
export const MEANINGS = Object.freeze({
  type: "how your energy works",
  strategy: "how to meet what comes",
  authority: "how you best decide",
  profile: "the role you play",
  definition: "how your parts connect",
  signature: "how it feels when it fits",
  notSelfTheme: "the sign it’s off course",
  incarnationCross: "your life’s theme",
  definedCenters: "what’s steady in you",
  undefinedCenters: "where you take in others",
  openCenters: "where you take in others most",
  channels: "steady links between centers",
  gates: "the traits lit in your chart",
});

/** Q7b: the heading over the chart's values, and its note. */
export const DETAILS_TITLE = "The details";
export const DETAILS_NOTE = "(each explained in the free library)";

/** Q7c: the line over "Your centers" in Start here (page and PDF). */
export const CENTERS_LINE = "Your 9 centers are the shapes on the drawing.";

/**
 * Q7a (11/16, accepted): the key under the drawing names the colors a newcomer sees.
 * The swatches are the engine drawing's own: #F0F3F9 is the white, #7C5BFF the purple.
 */
export const CHART_KEY = Object.freeze([
  ["White", "from your birth moment (what you know)", "#F0F3F9"],
  ["Purple", "from about 3 months before birth (what your body knows)", "#7C5BFF"],
  ["Both", "from both moments", "#F0F3F9", "#7C5BFF"],
  ["Open", "not activated — open to others", "#1F3151"],
]);
export const TECH_HOW =
  "How to read them: 21.5 is gate 21, line 5. The planet beside each number is the one that lit " +
  "that gate. Personality is the moment you were born; Design is about three months earlier. " +
  "Nothing here needs learning to use your reading.";

import { SESSION, money } from "./pricing.mjs";
import { BOOKING_URL, bookingShown } from "./booking.mjs";

/**
 * FIX 10B: the coaching card at the end of the reading (page and PDF), with
 * Jeremy's current site photo (the-champagne-method src/assets/approach-candid.jpg,
 * cropped round). The link is his free conversation on the coaching home.
 */
/*
 * OFF THE HD PAGES AND PDFS SINCE 11/16 (Jeremy: "keep the 30 min free call for
 * coaching funnel only"). Kept as the record of what the free call says on
 * thechampagnemethod.co; nothing in the shop prints it now -- closingCard() does.
 */
export const COACH = Object.freeze({
  head: "Talk it through with Jeremy",
  body: "If something in here stirred a question, Jeremy offers thirty minutes, free, with no pitch at the end.",
  link: "A free thirty-minute conversation",
  url: "https://thechampagnemethod.co/#connect",
  shown: "thechampagnemethod.co/#connect",
});

/**
 * THE CARD THAT ENDS A CHART OR A READING (page and PDF), since 11/16:
 *
 *   a one-on-one's reading   where to pick the thirty minutes (BOOKING_URL)
 *   anything else            the paid one-on-one, when it is sold (`offer`)
 *   otherwise                no card at all
 *
 * `url`: where the offer's link goes -- the page passes its own upgrade link,
 * so what was paid comes off; the PDF passes the shop.
 */
export function closingCard({ session = false, offer = false, word = "chart", url = null, bookingUrl = BOOKING_URL } = {}) {
  if (session) {
    return bookingUrl
      ? {
          head: "Your thirty minutes with Jeremy",
          body: "Pick a time on Jeremy’s calendar. The Google Meet link is in the invite.",
          link: "Pick a time",
          url: bookingUrl,
          shown: bookingShown(bookingUrl),
        }
      : { head: "Your thirty minutes with Jeremy", body: "Jeremy will write to you with times for your thirty minutes.", link: null, url: null, shown: null };
  }
  if (!offer || !url) return null;
  return {
    head: SESSION.title,
    body: `${SESSION.blurb} ${money(SESSION.cents)}, and what you paid for this ${word} comes off.`,
    link: SESSION.button,
    url,
    shown: url.replace(/^https?:\/\//, "").replace(/\/$/, ""),
  };
}
