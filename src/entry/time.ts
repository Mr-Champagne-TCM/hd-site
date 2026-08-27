/**
 * Birth time, typed on a phone.
 *
 * The fault this replaces: the field was a plain text input with
 * `inputMode="numeric"`, which gives a number pad with NO COLON on it, while
 * the validation demanded "HH:MM". There was no way to satisfy it and no way
 * forward — a dead end reached by typing four digits, on a real phone, exactly
 * where a real person would reach it.
 *
 * So the colon is never typed. It appears on its own after two digits, and
 * everything here works from the digits.
 */

/** "0317" -> "03:17". Inserts the colon so nobody has to find one. */
export function formatTimeInput(raw: string): string {
  const d = raw.replace(/\D/g, "").slice(0, 4);
  if (d.length <= 2) return d;
  return `${d.slice(0, 2)}:${d.slice(2)}`;
}

export type Meridiem = "AM" | "PM";

/**
 * The digits, a clock mode and a meridiem -> "HH:MM" in 24-hour form, or null
 * while it is not yet a real time.
 *
 * Midnight and noon are the two that catch people out: 12 AM is 00, 12 PM is
 * 12, and neither follows the pattern the other eleven hours do.
 */
export function toTwentyFourHour(
  raw: string,
  clock: 12 | 24,
  meridiem: Meridiem,
): string | null {
  const d = raw.replace(/\D/g, "");
  if (d.length !== 4) return null;
  let hour = Number(d.slice(0, 2));
  const minute = Number(d.slice(2));
  if (Number.isNaN(hour) || Number.isNaN(minute)) return null;
  if (minute > 59) return null;

  if (clock === 24) {
    if (hour > 23) return null;
    return `${pad(hour)}:${pad(minute)}`;
  }

  if (hour < 1 || hour > 12) return null;
  if (meridiem === "AM" && hour === 12) hour = 0;
  else if (meridiem === "PM" && hour !== 12) hour += 12;
  return `${pad(hour)}:${pad(minute)}`;
}

/** Says what is wrong, in words, or null when nothing is. */
export function timeProblem(raw: string, clock: 12 | 24): string | null {
  const d = raw.replace(/\D/g, "");
  if (d.length === 0) return null;
  if (d.length < 4) return null; // still being typed; not a mistake yet
  const hour = Number(d.slice(0, 2));
  const minute = Number(d.slice(2));
  if (minute > 59) return "There are only sixty minutes in an hour.";
  if (clock === 24 && hour > 23) return "On a 24-hour clock the hours run 00 to 23.";
  if (clock === 12 && (hour < 1 || hour > 12)) return "On a 12-hour clock the hours run 1 to 12.";
  return null;
}

/** 24-hour "14:30" shown back on whichever clock is in use. */
export function displayTime(hhmm: string, clock: 12 | 24): string {
  const m = /^(\d{2}):(\d{2})$/.exec(hhmm);
  if (!m) return hhmm;
  const h = Number(m[1]);
  if (clock === 24) return hhmm;
  const suffix = h < 12 ? "AM" : "PM";
  const twelve = h % 12 === 0 ? 12 : h % 12;
  return `${twelve}:${m[2]} ${suffix}`;
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}
