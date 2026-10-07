import { DISCLAIMER, HEADINGS, SUMMARY_KEYS, firstProblem } from "../../netlify/lib/interpretation.mjs";

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
 * repeats the label would trip it.
 */
export const row = (k) => `Row ${SUMMARY_KEYS.indexOf(k) + 1} value.`;

/** A reading that passes the whole chain for `chart`, with named sections replaced. */
export function reading(chart, overrides = {}) {
  const filler = "word ".repeat(70).trim();
  const parts = ["IN SHORT", "", ...SUMMARY_KEYS.map((k) => `${k}: ${row(k)}`), ""];
  for (const h of HEADINGS) {
    const first = overrides[h] ?? (h === S5 ? `${whiteCentres(chart)} ${filler}` : filler);
    parts.push(h, "", first, "", filler, "");
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
