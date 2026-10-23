import { birthRecord } from "./reading.mjs";

/**
 * "CHANGE A DETAIL" IS A CORRECTION BY THE SAME PERSON (Jeremy 10/19).
 *
 *   "In this case, they are explicitly changing a detail. Then we track that
 *    as their NEW and ACCURATE birth details (track old entry(s) too for
 *    convenience and lookup later during website issue resolution)."
 *
 * So: the corrected details become the record's details; the details they
 * replaced go into the record's `history` (when, what changed) for support
 * lookup only; and the reading page gets a `correction` it turns into a calm
 * note (shared/correctionNote.mjs) -- what changed, and whether Type, Profile
 * or Authority came out differently.
 *
 * Pure functions. The chart handler decides when they apply.
 */

/** The values a reader would notice moving. Jeremy: "if Type/Profile/Authority changes, say so kindly." */
export const NOTICED = ["type", "profile", "authority"];

/** Which of date / time / place / name differ between two kept birth records. */
export function birthChanges(was, now) {
  const a = birthRecord(was);
  const b = birthRecord(now);
  if (!a || !b) return [];
  const out = [];
  if (a.date !== b.date) out.push("date");
  const ta = a.timeKnown === false ? null : a.time;
  const tb = b.timeKnown === false ? null : b.time;
  if (ta !== tb) out.push("time");
  if ((a.place ?? "") !== (b.place ?? "") || a.zone !== b.zone) out.push("place");
  if ((a.name ?? "") !== (b.name ?? "")) out.push("name");
  return out;
}

/** Type / Profile / Authority that moved between two engine outputs. */
export function chartMoves(before, after) {
  if (!before || !after) return [];
  const out = [];
  for (const field of NOTICED) {
    const was = before[field];
    const now = after[field];
    if (was == null || now == null) continue;
    if (String(was).trim() !== String(now).trim()) out.push({ field, was: String(was).trim(), now: String(now).trim() });
  }
  return out;
}

/**
 * The rest of the chart that moved (10/22 verbatim read: an added time moved a
 * cross, a definition and a channel, and the note named only the Profile):
 * "definition", "incarnationCross", "centers", "channels", in that order.
 */
export function alsoMoved(before, after) {
  if (!before || !after) return [];
  const same = (a, b) => JSON.stringify(Array.isArray(a) ? [...a].sort() : a ?? null) === JSON.stringify(Array.isArray(b) ? [...b].sort() : b ?? null);
  const out = [];
  if (!same(before.definition, after.definition)) out.push("definition");
  if (!same(before.incarnationCross, after.incarnationCross)) out.push("incarnationCross");
  if (["definedCenters", "undefinedCenters", "openCenters"].some((k) => !same(before[k], after[k]))) out.push("centers");
  if (!same(before.channels, after.channels)) out.push("channels");
  return out;
}

/** The few birth fields the note may name back to its own buyer. */
function shown(b) {
  const r = birthRecord(b);
  if (!r) return {};
  return { date: r.date, time: r.time, timeKnown: r.timeKnown, place: r.place ?? null, ...(r.name ? { name: r.name } : {}) };
}

/**
 * The correction to keep with the record, or null when nothing changed and
 * nothing moved. `type` is "correction" (Change a detail), "time-added" (a
 * birth time found later, added once: 10/22, its own words, never
 * "correction") or "first-details" (an older summary's details typed once,
 * compared only by the chart).
 */
export function buildCorrection({ type = "correction", was = null, now = null, before = null, after = null, at = Date.now() }) {
  const details = type === "correction" || type === "time-added";
  const changed = details ? birthChanges(was, now) : [];
  const chart = chartMoves(before, after);
  if (!changed.length && !chart.length) return null;
  // A time added also says what else moved (the correction note keeps its own words).
  const also = type === "time-added" ? alsoMoved(before, after) : [];
  return {
    type,
    at: Math.floor(at / 1000),
    changed,
    ...(details ? { was: shown(was), now: shown(now) } : {}),
    chart,
    ...(also.length ? { also } : {}),
  };
}

/** The history entry for a correction: the details as they WERE, and what changed. */
export function historyEntry({ was, now, at = Date.now() }) {
  const changed = birthChanges(was, now);
  if (!changed.length) return null;
  return { at: Math.floor(at / 1000), was: birthRecord(was), changed };
}
