/**
 * What can actually be sold today, which is not the same as what has a price.
 *
 * All three tiers have prices and all three exist in the engine. Only the
 * summary can currently be DELIVERED: the drawing and the written reading are
 * not built, so a chart today would be a list of gate numbers with no picture,
 * and a reading would be a receipt for nothing.
 *
 * Taking money for either of those is the one failure with no cheap apology, so
 * the ceiling lives here and both sides read it. The page uses it to decide what
 * to offer; the checkout function uses it to REFUSE, which is the part that
 * matters -- a hidden button is not a block. The buy buttons post a tier number
 * to /api/checkout, and anyone can post that number by hand.
 *
 * Deliberately NOT an environment variable and NOT a query flag. A bypass switch
 * is a backdoor with a friendly name, and the leak scan already refuses that
 * shape on sight. When the bodygraph lands this becomes 1, and when the
 * interpretation lands it becomes 2, each in a commit that says why.
 *
 * ---
 *
 * RAISED TO 1 ON 2026-08-28, and here is the why this file asked for.
 *
 * The chart tier's own words are "your bodygraph, drawn -- a page you can share
 * and a PDF you keep". Both halves now exist:
 *
 *   the page   /r/<token> renders the drawing the engine produces
 *   the PDF    /api/pdf builds it from the same SVG, with the font embedded
 *
 * What is still NOT sellable is tier 2, the written interpretation, which does
 * not exist in any form. This number moves again when it does.
 *
 * The ceiling is enforced in the checkout function, not just in the page. A
 * hidden button is not a block: the buy buttons post a tier number, and anyone
 * can post that number by hand.
 */

/**
 * RAISED TO 2 ON 2026-08-29, and the why this file exists for.
 *
 * The written interpretation now exists end to end: the prompt, the validator,
 * the generator, write-once storage, the background writer, the page and the
 * seven-page PDF. Nothing is being sold that does not exist.
 *
 * WHAT IS STILL TRUE AND WORTH WRITING DOWN: no reading has ever been produced
 * by the real Gemini. Every test above runs against a fake. The ceiling goes up
 * so the purchase paths can be walked at all -- straight to the reading, and up
 * the ladder from the summary -- and it goes up while STRIPE IS IN SANDBOX and
 * the site is unannounced, which is what makes that safe.
 *
 * Jeremy's call, made with both of those in front of him. If a real reading
 * comes back wrong, this number goes back to 1 in one line and one deploy.
 */
export const SELLABLE_MAX_LEVEL = 2;

export function sellable(level) {
  return Number.isInteger(level) && level >= 0 && level <= SELLABLE_MAX_LEVEL;
}
