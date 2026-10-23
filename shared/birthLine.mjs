import { curly } from "./curlyQuotes.mjs";

/**
 * The birth line under the client's name, in words a client reads without
 * decoding -- the phone app's PdfExport.birthLine, ported (Jeremy 10/16):
 *
 *   "December 14, 1976 · 6:18 PM · Chicago, Illinois"
 *
 * An unknown time says so in place of the clock time, since the chart is cast
 * at noon. The zone's offset AT THAT BIRTH MOMENT (so a summer birth in
 * Chicago is UTC-05:00) is still worked out, as java.time does on the phone,
 * but no longer printed (fix 20A, 10/19) -- see `birthOffset`.
 *
 * Returns null when there is nothing to print: a reading stored before the
 * shop kept birth details (16 October 2026) has none, and its PDF simply has
 * no birth line -- never an invented one.
 */

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/** Minutes east of UTC for `zone` at the UTC instant `ms`. */
function offsetMinutes(zone, ms) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: zone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(new Date(ms));
  const get = (t) => Number(parts.find((p) => p.type === t)?.value);
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  return Math.round((asUtc - Math.floor(ms / 1000) * 1000) / 60000);
}

/** The offset in force at a LOCAL wall-clock moment in `zone`. */
export function zoneOffsetAt(zone, y, mo, d, h, mi) {
  const local = Date.UTC(y, mo - 1, d, h, mi);
  let off = offsetMinutes(zone, local);
  // Twice: the first guess is taken at the wrong instant on a DST day.
  off = offsetMinutes(zone, local - off * 60000);
  return off;
}

function fmtOffset(min) {
  const sign = min < 0 ? "-" : "+";
  const a = Math.abs(min);
  return `UTC${sign}${String(Math.floor(a / 60)).padStart(2, "0")}:${String(a % 60).padStart(2, "0")}`;
}

/**
 * `birth` is what the shop keeps with a reading:
 * { date: "1976-12-14", time: "18:18" | null, timeKnown, place: "Chicago, Illinois", zone: "America/Chicago" }
 */
export function birthLine(birth) {
  if (!birth || typeof birth !== "object") return null;
  const dm = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(birth.date ?? "").trim());
  if (!dm) return null;
  const [y, mo, d] = [Number(dm[1]), Number(dm[2]), Number(dm[3])];
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  const known = birth.timeKnown !== false;
  let h = 12;
  let mi = 0;
  if (known) {
    const tm = /^(\d{1,2}):(\d{2})(?::\d{2})?$/.exec(String(birth.time ?? "").trim());
    if (!tm) return null;
    h = Number(tm[1]);
    mi = Number(tm[2]);
    if (h > 23 || mi > 59) return null;
  }
  const zone = String(birth.zone ?? "").trim();
  const place = String(birth.place ?? "").trim();
  let off;
  try {
    off = zoneOffsetAt(zone, y, mo, d, h, mi);
  } catch {
    return null;
  }
  if (!Number.isFinite(off)) return null;
  const day = `${MONTHS[mo - 1]} ${d}, ${y}`;
  const clock = known
    ? `${((h + 11) % 12) + 1}:${String(mi).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`
    : "Time unknown (charted at noon)";
  /**
   * NO "Timezone: UTC-06:00" ON THE LINE ANY MORE (Jeremy 10/19, fix 20A,
   * reversing his 10/16 call): a newcomer read it as jargon on the first line.
   * The zone is still kept with the reading and still worked out here -- an
   * unreadable zone still means no line at all -- and the chart is still cast
   * from it. It is only not printed. `birthOffset` gives it to anyone who needs
   * it (the record, a support question).
   */
  // A place with an apostrophe ("Coeur d'Alene, Idaho") is curled here, where it is shown,
  // like every other word a reader sees; the town search's own data and the kept place stay
  // exactly as they are (decision 8, 10/23, pending Jeremy).
  return [day, clock, ...(place ? [curly(place)] : [])].join(" · ");
}

/** "UTC-06:00": the zone's offset at that birth moment, or null. Never printed for a reader. */
export function birthOffset(birth) {
  if (!birth || typeof birth !== "object") return null;
  const dm = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(birth.date ?? "").trim());
  if (!dm) return null;
  const tm = birth.timeKnown === false ? null : /^(\d{1,2}):(\d{2})/.exec(String(birth.time ?? "").trim());
  if (birth.timeKnown !== false && !tm) return null;
  try {
    const off = zoneOffsetAt(String(birth.zone ?? "").trim(), +dm[1], +dm[2], +dm[3], tm ? +tm[1] : 12, tm ? +tm[2] : 0);
    return Number.isFinite(off) ? fmtOffset(off) : null;
  } catch {
    return null;
  }
}
