import { describe } from "./failures.mjs";
import { customerText } from "../../shared/customerMessages.mjs";

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
 * THE SIGN-OFF IS NOT IN THE WORDS BELOW (Jeremy 10/16). It is added by
 * `signOff(kind)`, from the failure the note answers:
 *
 *   "Very Respectfully, Jeremy"  money was involved -- the buyer paid, or may
 *                                have, before it went wrong
 *   "Respectfully, Jeremy"       nothing was charged (checkout never opened)
 *
 * Server-side only. These are never shown on a page.
 */
export const NOTES = {
  "safe-link":
    "Your purchase went through and your reading is safe. Here is your link: {link} It's kept for a year, so it can be sent again whenever you need it.",
  "setting-up":
    "Your purchase went through and your reading is safe with me. Your link is being set up now and will be in your inbox shortly. Thank you for your patience.",
  "confirm-later":
    "Your payment came through and your reading is safe. Our side couldn't confirm it right away, so your link is on its way to you by email. Thank you for your patience.",
  "chart-again":
    "Your purchase went through and is safe. Your chart couldn't be drawn just now, which was on our side, and it's working again. Whenever you're ready, your link opens the same page: {link}",
  "writing":
    "Your chart is in and your reading is being written. It's taking longer than it should today, which is on our side. It will arrive in your inbox the moment it's ready, with nothing more needed from you.",
  "reading-page":
    "Your reading is safe and your link is fine. The page couldn't be opened for a little while, which was on our side, and it's back now: {link}",
  "pdf":
    "Your reading is safe. The PDF couldn't be made just now, which was on our side. Your reading is at your link, and the download is there whenever you'd like it: {link}",
  "link-again":
    "Here is your reading link: {link} It's kept for a year, so it can be sent again whenever you need it.",
  "checkout-down":
    "Thank you for stopping by for a reading. The checkout wasn't working on our side for a little while, and nothing was charged. It's working again now, whenever you'd like to come back: {shop}",
  "places-down":
    "The birthplace search wasn't working on our side for a little while. It's back now, and your link opens the same page whenever you're ready: {link}",
};

export const SIGN_OFF = Object.freeze({
  MONEY: "Very Respectfully, Jeremy",
  NO_MONEY: "Respectfully, Jeremy",
});

/**
 * WAS MONEY INVOLVED? Read from the failure taxonomy, not decided note by note.
 *
 * Nothing was charged only when the words that kind shows its customer say so
 * -- "Nothing was charged" -- whether or not the request carried a paid link.
 * That is the checkout path, where Stripe's page never opened. Everything else
 * happened to someone who had bought, or may have: a purchase being confirmed,
 * a chart or reading behind the paywall, a reading link, a PDF, a resend, a
 * watcher that found a paid session. And an incident recorded as `paid` is
 * money taken, whatever its kind.
 *
 * When it cannot be told -- no kind given -- the answer is yes: "Very
 * Respectfully" to someone who paid nothing costs nothing, the other way round
 * does.
 *
 * (failures.mjs is imported here, and reaches this file again through
 * health.mjs and playbook.mjs. Nothing below is used while the modules load,
 * only when a note is filled, so the circle is harmless.)
 */
const NOTHING_CHARGED = /\bnothing (was|has been) charged\b/i;

export function moneyInvolved(kind, { paid = false } = {}) {
  if (paid || !kind) return true;
  const shown = [describe(kind, { paid: false }).customer, describe(kind, { paid: true }).customer];
  return !shown.every((key) => key && NOTHING_CHARGED.test(customerText(key)));
}

/** The line a note ends on. */
export function signOff(kind, { paid = false } = {}) {
  return moneyInvolved(kind, { paid }) ? SIGN_OFF.MONEY : SIGN_OFF.NO_MONEY;
}

/**
 * A note with its blanks filled and its sign-off added. Missing values stay
 * visible as brackets. `kind` (and `paid`) is the failure the note answers.
 */
export function fillNote(key, { link, shop, kind, paid = false } = {}) {
  const words = NOTES[key];
  if (!words) return null;
  const filled = words
    .replace("{link}", link || "[their reading link]")
    .replace("{shop}", shop || "https://humandesign.thechampagnemethod.co");
  return `${filled} ${signOff(kind, { paid })}`;
}
