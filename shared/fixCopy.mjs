/**
 * MOCK COPY -- branch fix-mock-1021 only. The proposed (GREEN) words for the
 * 10/21 live-test fixes, in one place so the page, the PDF and the emails
 * print the same sentence. Shown only behind shared/fixMock.mjs switches.
 */

/** Bug 17, option A (cautious): every value that can move is marked, centers too. */
export const NOON_NOTE_A =
  "Birth time unknown — charted at noon. Type, Authority, Profile and the centers can all shift with the " +
  "time, so each is marked provisional until the time is known.";

/** Bug 17, option B (calm): one sentence, the marks as they are today. */
export const NOON_NOTE_B =
  "Birth time unknown — charted at noon. Most of a chart holds without a time. Type, Authority and Profile " +
  "can shift with it, so those are marked provisional.";

/** Bug 14: the center each authority speaks from. Mental and Lunar have none of their own. */
export const AUTHORITY_CENTER = {
  Emotional: "Solar Plexus",
  Sacral: "Sacral",
  Splenic: "Spleen",
  Ego: "Heart",
  "Ego Manifested": "Heart",
  "Ego Projected": "Heart",
  "Self-Projected": "G",
};
/** Bug 14, option A: what the CENTER note says when the authority has no center. */
export const NO_CENTER = {
  Mental: "None — heard in talking it through",
  Lunar: "None — the Moon’s cycle",
};

/** Bug 4: under Stripe's Pay button on an upgrade that types nothing. */
export const checkoutNextStepKept = (level) =>
  `Next: one look at your kept birth details, then your ${level >= 2 ? "reading is written" : "chart is drawn"}.`;
