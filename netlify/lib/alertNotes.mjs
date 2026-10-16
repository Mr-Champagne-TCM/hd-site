/**
 * THE READY-MADE NOTES an alert offers Jeremy to send a buyer (10/16).
 *
 * Jeremy: "When I'm paged, I need a brief as well as options to resolve for
 * them." One of those options is a reply he can paste, so the words are here,
 * written in his voice and held to the same rules as the customer sentences in
 * shared/customerMessages.mjs (tools/voice-check.mjs reads this file too):
 *
 *   warm and plain     no jargon, nothing about servers, keys or Stripe
 *   invitation         "whenever you're ready", never "click", "try", "check"
 *   no blame           "on our side", never "your details were wrong"
 *   NO REFUND          Jeremy 10/16: "No refunds offered." A free retry code
 *                      is offered instead (lib/playbook.mjs, option c).
 *
 * `{link}` is filled with the buyer's own reading link when the alert can
 * make one, and left as a bracketed placeholder when it cannot. `{shop}` is
 * the shop's front door.
 *
 * Server-side only. These are never shown on a page.
 */
export const NOTES = {
  "safe-link":
    "Your purchase went through and your reading is safe. Here is your link: {link} It's kept for a year, so it can be sent again whenever you need it. Warmly, Jeremy",
  "setting-up":
    "Your purchase went through and your reading is safe with me. Your link is being set up now and will be in your inbox shortly. Thank you for your patience. Warmly, Jeremy",
  "confirm-later":
    "Your payment came through and your reading is safe. Our side couldn't confirm it right away, so your link is on its way to you by email. Thank you for your patience. Warmly, Jeremy",
  "chart-again":
    "Your purchase went through and is safe. Your chart couldn't be drawn just now, which was on our side, and it's working again. Whenever you're ready, your link opens the same page: {link} Warmly, Jeremy",
  "writing":
    "Your chart is in and your reading is being written. It's taking longer than it should today, which is on our side. It will arrive in your inbox the moment it's ready, with nothing more needed from you. Warmly, Jeremy",
  "reading-page":
    "Your reading is safe and your link is fine. The page couldn't be opened for a little while, which was on our side, and it's back now: {link} Warmly, Jeremy",
  "pdf":
    "Your reading is safe. The PDF couldn't be made just now, which was on our side. Your reading is at your link, and the download is there whenever you'd like it: {link} Warmly, Jeremy",
  "link-again":
    "Here is your reading link: {link} It's kept for a year, so it can be sent again whenever you need it. Warmly, Jeremy",
  "checkout-down":
    "Thank you for stopping by for a reading. The checkout wasn't working on our side for a little while, and nothing was charged. It's working again now, whenever you'd like to come back: {shop} Warmly, Jeremy",
  "places-down":
    "The birthplace search wasn't working on our side for a little while. It's back now, and your link opens the same page whenever you're ready: {link} Warmly, Jeremy",
};

/** A note with its blanks filled. Missing values stay visible as brackets. */
export function fillNote(key, { link, shop } = {}) {
  const words = NOTES[key];
  if (!words) return null;
  return words
    .replace("{link}", link || "[their reading link]")
    .replace("{shop}", shop || "https://humandesign.thechampagnemethod.co");
}
