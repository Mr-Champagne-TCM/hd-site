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

/**
 * FIX 10B: the coaching card at the end of the reading (page and PDF), with
 * Jeremy's current site photo (the-champagne-method src/assets/approach-candid.jpg,
 * cropped round). The link is his free conversation on the coaching home.
 */
export const COACH = Object.freeze({
  head: "Talk it through with Jeremy",
  body: "If something in here stirred a question, Jeremy offers thirty minutes, free, with no pitch at the end.",
  link: "A free thirty-minute conversation",
  url: "https://thechampagnemethod.co/#connect",
  shown: "thechampagnemethod.co/#connect",
});
