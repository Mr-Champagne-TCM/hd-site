import { SHOP } from "./libraryLinks.mjs";
import { HINT } from "./linkHints.mjs";

/**
 * THE FOOTER THEME, the words and links in one place (Jeremy 10/16-17).
 *
 * Accepted in the email footer mock v2 (option E, colour 4): two names side
 * by side, stacked on a phone --
 *
 *   "Human Design by The Champagne Method"         -> the shop
 *     "Charts and readings, for you or someone close to you."
 *   "The Champagne Method Coaching and Consulting" -> thechampagnemethod.co
 *     "Coaching, if you'd like to go further."
 *
 * Then (10/17, footer-everywhere mock): "same footer on all emails", and the
 * same ending on the shop's own pages. The email (netlify/lib/emailFooter.mjs),
 * the shop pages (src/FooterTheme.tsx) and the plain error pages
 * (netlify/lib/messagePage.mjs) all read these, so the words cannot drift.
 *
 * "by" is always lowercase. The HD name is in gold (each surface's own gold);
 * the business name is lavender, never white ("i dont like the white(ish)").
 */

export const HD_NAME = "Human Design by The Champagne Method";
export const BUSINESS_NAME = "The Champagne Method Coaching and Consulting";

/** The line under the HD name. */
export const HD_LINE = "Charts and readings, for you or someone close to you.";
/** The line under the business name (C1's words, Jeremy 10/16). */
export const COACH_LINE = "Coaching, if you’d like to go further.";

export const HD_URL = SHOP;
export const COACH_URL = "https://thechampagnemethod.co";

/** Colour 4 of mock v2, lavender: 6.5:1 on the email navy, far from the gold. */
export const COACH_COLOR = "#a78bfa";

/** The privacy link's words, the same wherever it appears. */
export const PRIVACY_LABEL = "What we keep, and for how long";

/** The two columns, HD first. `hdColor` is the surface's own gold. */
export function footerColumns(hdColor, coachColor = COACH_COLOR) {
  return [
    // `hint`: the link label (title + aria-label) saying where each name goes (10/23).
    { href: HD_URL, name: HD_NAME, line: HD_LINE, color: hdColor, hint: HINT.readings },
    { href: COACH_URL, name: BUSINESS_NAME, line: COACH_LINE, color: coachColor, hint: HINT.home },
  ];
}
