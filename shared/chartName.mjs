/**
 * WHOSE CHART THIS IS (Jeremy 10/19, fix 17A).
 *
 * The birth form asks, optionally, for a "Name for this chart", filled with the
 * buyer's first name and changeable for a gift. It is the title of the page and
 * of the PDF -- "Alex's Human Design" -- and it is kept with the reading exactly
 * like the birth details (reading.mjs `birthRecord`), for the reading's year.
 * It is never sent to the engine or to the writer.
 *
 * One title function for the page, the PDF and (ported) the phone, so the three
 * cannot disagree about an apostrophe.
 */

/** The most a name may be: long enough for "Mary-Jane O'Brien-Smith", short enough for one title line. */
export const CHART_NAME_MAX = 40;

/**
 * A typed name made safe to keep and to print: trimmed, spaces collapsed,
 * control characters and angle brackets gone, at most CHART_NAME_MAX
 * characters. Empty means none.
 */
export function cleanChartName(raw) {
  if (typeof raw !== "string") return null;
  const s = raw
    .replace(/[\u0000-\u001f\u007f<>]/g, "")
    .trim()
    .replace(/\s+/g, " ")
    .slice(0, CHART_NAME_MAX)
    .trim();
  return s || null;
}

/** "Alex" -> "Alex’s Human Design"; "James" -> "James’s Human Design"; none -> "Your Human Design". */
export function chartTitle(name) {
  const n = cleanChartName(name);
  return n ? `${n}’s Human Design` : "Your Human Design";
}

/** The first name the form starts with: the buyer's own, first word only ("Alex Rivera" -> "Alex"). */
export function firstName(full) {
  const n = cleanChartName(full);
  return n ? n.split(" ")[0] : "";
}
