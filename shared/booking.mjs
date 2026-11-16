/**
 * WHERE A ONE-TO-ONE BUYER PICKS A TIME (Jeremy 11/16: "google!" -- a Google Calendar booking page, thirty
 * minutes, Google Meet in the invite).
 *
 * TWO PARTS, ON PURPOSE.
 *
 *   ONE_TO_ONE_ON_SALE   a plain public switch. The page needs to know whether to show the one-to-one card;
 *                        it does not need the link.
 *   BOOKING_URL          the link itself. It is NOT in this file: this repository is public, and this module
 *                        is bundled into the page's own code, so a link written here could be read by anyone
 *                        and a time booked without paying. It comes from the site's settings instead
 *                        (HD_BOOKING_URL in the Netlify environment), which only the server can read. It
 *                        reaches a buyer three ways, all server-side and all after payment: the email, the
 *                        reading page's answer for a one-to-one's own reading (readingHandler), and the PDF.
 *
 * In the browser BOOKING_URL is always null. On the server it is null until the setting exists, and then the
 * one-to-one is not sold there either (availability.mjs; checkout answers "not sellable"): nobody pays for a
 * call they cannot book. Putting it on sale = set HD_BOOKING_URL, keep the switch true, deploy.
 */
export const ONE_TO_ONE_ON_SALE = true;

/** True in a visitor's browser, false in a function, a test or a build script. */
export const IN_BROWSER = typeof window !== "undefined" && typeof document !== "undefined";

/** An https link out of the site's settings, or null. `env` is given in tests. */
export function bookingUrlFrom(env) {
  const raw = typeof env?.HD_BOOKING_URL === "string" ? env.HD_BOOKING_URL.trim() : "";
  return /^https:\/\/\S+$/.test(raw) ? raw : null;
}

const ENV = typeof process !== "undefined" && process?.env ? process.env : null;
export const BOOKING_URL = ONE_TO_ONE_ON_SALE && !IN_BROWSER ? bookingUrlFrom(ENV) : null;

/** The same link as shown in words (the PDF prints it). */
export function bookingShown(url = BOOKING_URL) {
  return typeof url === "string" ? url.replace(/^https?:\/\//, "").replace(/\/$/, "") : null;
}
