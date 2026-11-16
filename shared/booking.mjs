/**
 * WHERE A ONE-TO-ONE BUYER PICKS A TIME (Jeremy 11/16).
 *
 * TODO(Jeremy): the private booking link for the thirty-minute one-to-one
 * (Calendly or a Google Calendar booking page, Google Meet in the invite).
 * Until it is set, the one-to-one is NOT sold anywhere (availability.mjs):
 * nobody pays for a call they cannot book. Setting it is this one line, a
 * test run and a deploy.
 */
export const BOOKING_URL = null;

/** The same link as shown in words (the PDF prints it). */
export function bookingShown(url = BOOKING_URL) {
  return typeof url === "string" ? url.replace(/^https?:\/\//, "").replace(/\/$/, "") : null;
}
