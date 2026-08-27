/**
 * Choosing a birth date, which is not the same problem as choosing a date.
 *
 * Ported from `BirthDate.kt` in the reading app, rule for rule. That file was
 * written after the Material calendar proved wrong for this job: for somebody
 * born in 1983 it costs three navigations — pick a year, tap through months one
 * at a time, then find a day — to reach a date they know by heart, with a client
 * watching.
 *
 * The rules that matter, each recording a fault:
 *
 *   Month, day and year are on screen together and picked directly.
 *
 *   The month is NAMED, never numbered. `06/07` is June 7 in the US and 6 July
 *   nearly everywhere else; the text parser has to detect that, guess, and flag
 *   it. A control offering a named month means the ambiguity cannot arise. Any
 *   control offering a numeric month has put the bug back.
 *
 *   The day is clamped to the month. Choose 31 January, switch to February, and
 *   something has to give. Note that 31 February does NOT throw in most date
 *   libraries — it rolls forward to 3 March, which is a real date for the wrong
 *   moment, and that is the whole class of failure being avoided here.
 *
 *   Leap years are not optional. 29 February 1992 is somebody's birthday.
 */

/** Days in that month, leap years included. */
export function daysInMonth(year: number, month: number): number {
  // Day 0 of the next month is the last day of this one, and the runtime does
  // the leap-year arithmetic rather than a table that could be wrong.
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** The last valid day of that month, so 31 February can never be chosen. */
export function clampDay(year: number, month: number, day: number): number {
  const last = daysInMonth(year, month);
  return Math.min(Math.max(day, 1), last);
}

/**
 * "1983-09-17" -> [1983, 9, 17]. Falls back to a plausible adult birth year.
 *
 * Nobody being read at a booth was born this year, so an empty field opens
 * around thirty-five years back rather than at today or at 1900. A year column
 * starting at 1900 when the client was born in 1983 is a calendar with extra
 * steps.
 */
export function splitDate(iso: string, fallbackYear: number): [number, number, number] {
  const m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(iso.trim());
  if (!m) return [fallbackYear, 1, 1];
  const y = Number(m[1]);
  const mo = Math.min(Math.max(Number(m[2]), 1), 12);
  return [y, mo, clampDay(y, mo, Number(m[3]))];
}

/**
 * Digits typed as MMDDYYYY, or null while still incomplete or impossible.
 *
 * Typing stays available because when a client rattles the numbers off, typing
 * beats any picker. Punctuation is ignored, and nothing is committed until the
 * date is complete AND real — committing early would turn "0931" into a date
 * while the person is still mid-keystroke.
 */
export function typedDate(digits: string): string | null {
  const d = digits.replace(/\D/g, "");
  if (d.length !== 8) return null;
  const mo = Number(d.slice(0, 2));
  const day = Number(d.slice(2, 4));
  const y = Number(d.slice(4));
  if (mo < 1 || mo > 12) return null;
  if (y < 1900 || y > 2100) return null;
  // Rejected rather than rolled forward. 31 February is not 3 March.
  if (day < 1 || day > daysInMonth(y, mo)) return null;
  return `${pad(y, 4)}-${pad(mo, 2)}-${pad(day, 2)}`;
}

export function toIso(year: number, month: number, day: number): string {
  return `${pad(year, 4)}-${pad(month, 2)}-${pad(clampDay(year, month, day), 2)}`;
}

function pad(n: number, width: number): string {
  return String(n).padStart(width, "0");
}

/** Named, never numbered. */
export const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
] as const;

/** How a chosen date reads back to the person who chose it. */
export function humanDate(iso: string): string {
  const [y, m, d] = splitDate(iso, 0);
  if (!y) return "";
  return `${d} ${MONTHS[m - 1]} ${y}`;
}
