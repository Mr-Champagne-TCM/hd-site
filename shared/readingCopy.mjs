/**
 * Words the result page and BOTH PDFs (the shop's and, ported, the phone's)
 * print the same way -- newcomer-review fixes accepted 10/19. One place, so
 * the page, the PDF and the phone cannot drift.
 */

/**
 * FIX 6A: the planet-number grid, folded closed on the page and named and
 * explained in the PDF (a PDF cannot fold). Mock words, as approved.
 */
/** Numbers in words, as the rest of the copy says them (decision 25, 10/23): 26 is "twenty-six". */
const COUNT_WORDS = Object.freeze({ 26: "twenty-six" });
export const techTitle = (n = 26) => `Technical values: your ${COUNT_WORDS[n] ?? n} planet numbers`;
export const TECH_TITLE_NOTE = "(for the curious)";
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
 *   a one-to-one's reading   where to pick the thirty minutes (BOOKING_URL)
 *   anything else            the paid one-to-one, when it is sold (`offer`)
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
