import { DISCLAIMER, HEADINGS, SUMMARY_KEYS, TAKEAWAYS, firstProblem } from "../../netlify/lib/interpretation.mjs";

/**
 * THE REAL CALL PATH, FOR THE AUDIT SUITES (approved 9/9, "#6").
 *
 * Every false alarm in the three-state audit came from a harness that called
 * one validator directly instead of the chain production runs. Round two's
 * headline bug was `openCentreProblem` declared with three parameters and called
 * with two; round four's auditor then made the same mistake calling
 * `centreCountProblem` by hand and reported four refusals that did not exist.
 * A test that skips `firstProblem` tests a door no buyer goes through.
 *
 * So these suites build a whole reading and ask `firstProblem` about it. The
 * one thing that makes that awkward is that a bare reading is itself refused --
 * section 5 must name the chart's white centres -- so the default section 5
 * here names them, plainly and without a possessive state claim, and a test
 * that is about something else leaves it alone.
 */

/** "The Head and Solar Plexus are open here. The Heart is undefined here." */
export function whiteCentres(chart) {
  const say = (list, state) =>
    list.length ? `The ${list.join(" and ")} ${list.length > 1 ? "are" : "is"} ${state} here.` : "";
  return [say(chart.openCenters ?? [], "open"), say(chart.undefinedCenters ?? [], "undefined")]
    .filter(Boolean)
    .join(" ");
}

export const S5 = "What you take in from others";

/**
 * A summary row placeholder. Not "Signature value.": the old words are refused
 * in the on / off track lines now (oldWordProblem), and a placeholder that
 * repeats the label would trip it. Five words or more: an on / off track row
 * under 5 words is refused too (trackRowProblem, 10/17).
 */
export const row = (k) => `Row ${SUMMARY_KEYS.indexOf(k) + 1} value, a whole sentence.`;

/** Four try-this lines in shape A, each tagged and each beginning its own way. Made up. */
export const TRY_THIS = [
  "(Strategy) The next time a small choice comes, you might pause first. Notice the answer, so the pause is familiar later.",
  "(Profile) This week, on an easy job, you might start at once. Notice your energy, so that pace is familiar later.",
  "(Definition) Once or twice this week, you might try a small thing twice. Notice what changes, so trying is familiar later.",
  "(Channel) Over the next few days, when a plan feels stuck, you might wait a day. Notice what joins up, so the wait is familiar later.",
];

/** A reading that passes the whole chain for `chart`, with named sections replaced. */
export function reading(chart, overrides = {}) {
  const filler = "word ".repeat(70).trim();
  const parts = ["IN SHORT", "", ...SUMMARY_KEYS.map((k) => `${k}: ${row(k)}`), ""];
  for (const h of HEADINGS) {
    const first = overrides[h] ?? (h === S5 ? `${whiteCentres(chart)} ${filler}` : filler);
    // The try-this section: its intro (or the override, standing as the intro), then
    // four lines in the shape the checker asks for (10/21).
    if (h === TAKEAWAYS) parts.push(h, "", first, "", ...TRY_THIS.flatMap((t) => [t, ""]));
    else parts.push(h, "", first, "", filler, "");
  }
  parts.push(DISCLAIMER);
  return parts.join("\n");
}

/**
 * The chain, exactly as interpretJob reaches it. Profile is null: the fixture
 * has no "Your profile lines" list, and that check would otherwise answer first
 * and mask what is under test.
 */
export const check = (text, chart) =>
  firstProblem(text, chart.type ?? null, null, chart.openCenters, chart.undefinedCenters, chart.definedCenters);
