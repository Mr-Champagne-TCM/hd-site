/**
 * AN UNKNOWN BIRTH TIME, MEASURED -- in ONE engine call (Jeremy 10/22).
 *
 * The chart is still cast at noon. When it is made, the shop asks the engine
 * once more, at `POST /v1/spread` (engine 0.6.0), how far that noon chart can
 * be trusted through the birth day, and keeps the answer with the chart as
 * `timeSpread`:
 *
 *   { v: 1, ok, minutes, noon, window, changes, segments, clock, gates }
 *
 *   minutes   real minutes in the local birth day (23 or 25 hours on a DST day)
 *   noon      the minute index of local noon
 *   window    [first, last] minute index of the stretch holding noon in which
 *             every value a buyer reads equals the noon chart's
 *   changes   the values that change during the day (and so are PROVISIONAL)
 *   segments  for each of those, its stretches: [[startMinute, value], ...]
 *   clock     the wall clock: [[minuteIndex, wallMinuteOfDay], ...]
 *   gates     "change" or "same": whether the gate list moves at all that day
 *
 * The request is the /v1/chart birth object without the time -- `{date, zone,
 * timeKnown: false}` -- plus the tier, with the same key header. The engine
 * casts the whole day in process (the shop's mock made ~160 chart calls for
 * the same answer; tools/time-spread/oracle.mjs keeps that scan as the test
 * oracle, and nothing in netlify/ casts more than once).
 *
 * TWO CHECKS BEFORE IT IS KEPT, so a page never draws a spread that is not
 * about the chart beside it:
 *   - the answer has the shape above, every number inside the day;
 *   - the spread's noon is the STORED chart: every value that changes has, at
 *     noon, the stored chart's value, and the engine's own `ok` is true. Two
 *     engine versions answering the chart and the spread (a deploy between the
 *     two calls), or a clock in doubt, fail it: no spread, and Jeremy hears.
 *
 * A spread that cannot be had never stops the chart: the page then says what
 * it said before (the engine's note, Type, Authority and Profile provisional).
 * Nothing here stores or logs a birth: the answer holds minutes and values.
 */

/** The values the window is built from (the engine's BirthSpread.WINDOW_FIELDS). */
export const WINDOW_FIELDS = Object.freeze([
  "type",
  "strategy",
  "authority",
  "profile",
  "definition",
  "signature",
  "notSelfTheme",
  "incarnationCross",
  "definedCenters",
  "undefinedCenters",
  "openCenters",
  "channels",
]);

const sorted = (v) => (Array.isArray(v) ? [...v].map(String).sort() : []);

/**
 * One chart's window values, each as one comparable string, exactly as the
 * engine compares them: center lists as sorted sets, channels by their numbers.
 */
export function valuesOf(chart) {
  const c = chart ?? {};
  const out = {};
  for (const f of WINDOW_FIELDS) {
    if (f === "definedCenters" || f === "undefinedCenters" || f === "openCenters") out[f] = sorted(c[f]).join(", ");
    else if (f === "channels") out[f] = sorted((c.channels ?? []).map((x) => String(x).split(" ")[0])).join(", ");
    else out[f] = String(c[f] ?? "");
  }
  return out;
}

/** The value `field` has at minute k (a field that never changes keeps its noon value). */
export function valueAt(spread, field, k, noonValue) {
  const runs = spread.segments?.[field];
  if (!runs) return noonValue;
  let v = runs[0][1];
  for (const [s, val] of runs) if (s <= k) v = val;
  return v;
}

const int = (n) => Number.isInteger(n);

/** Why an answer is not a spread (a sentence for Jeremy's note), or null when it is one. */
export function shapeProblem(s) {
  if (!s || typeof s !== "object") return "no answer";
  if (s.v !== 1) return `version ${s.v}`;
  if (typeof s.ok !== "boolean") return "no ok";
  if (!int(s.minutes) || s.minutes < 1380 || s.minutes > 1500) return "minutes out of range";
  const N = s.minutes;
  if (!int(s.noon) || s.noon < 0 || s.noon >= N) return "noon out of range";
  const w = s.window;
  if (!Array.isArray(w) || w.length !== 2 || !int(w[0]) || !int(w[1]) || w[0] < 0 || w[1] >= N || w[0] > s.noon || w[1] < s.noon) {
    return "window out of range";
  }
  if (!Array.isArray(s.changes) || s.changes.some((f) => !WINDOW_FIELDS.includes(f))) return "unknown change";
  if (!s.segments || typeof s.segments !== "object" || Array.isArray(s.segments)) return "no segments";
  for (const [f, runs] of Object.entries(s.segments)) {
    if (!s.changes.includes(f)) return `segments for ${f}, which does not change`;
    if (!Array.isArray(runs) || runs.length < 2) return `segments for ${f} too short`;
    let last = -1;
    for (const r of runs) {
      if (!Array.isArray(r) || r.length !== 2 || !int(r[0]) || typeof r[1] !== "string") return `segments for ${f} malformed`;
      if (r[0] <= last || r[0] >= N || (last === -1 && r[0] !== 0)) return `segments for ${f} out of order`;
      last = r[0];
    }
  }
  if (s.changes.some((f) => !s.segments[f])) return "a change with no segments";
  if (!Array.isArray(s.clock) || !s.clock.length || s.clock.some((c) => !Array.isArray(c) || c.length !== 2 || !int(c[0]) || !int(c[1]))) {
    return "no clock";
  }
  if (s.clock[0][0] !== 0) return "clock does not start the day";
  if (s.gates !== "change" && s.gates !== "same") return "no gates";
  return null;
}

/** Why this spread is not about this chart, or null when its noon is the stored chart. */
export function noonProblem(spread, chart) {
  if (spread.ok !== true) return "engine says its noon is not the chart";
  const stored = valuesOf(chart);
  for (const f of Object.keys(spread.segments)) {
    // A list the stored chart does not carry is not compared (it is not shown either).
    if (f === "channels" && !Array.isArray(chart?.channels)) continue;
    if (valueAt(spread, f, spread.noon, null) !== stored[f]) return `noon ${f} differs from the chart`;
  }
  return null;
}

/** Only the wire fields travel into the record (never anything else the engine adds). */
const KEPT = ["v", "ok", "minutes", "noon", "window", "changes", "segments", "clock", "gates"];

/**
 * Ask the engine once and check the answer.
 *
 *   ask({ birth, tier })  the engine's POST /v1/spread, as {ok, status, payload}
 *   birth                 the scrubbed birth: only date and zone are sent
 *   tier                  the tier the chart itself was asked at
 *   chart                 the chart just made (and about to be stored)
 *
 * Resolves to { spread } or { spread: null, why }. Throws only if `ask` does
 * (a timeout, the network); the caller notes that and carries on.
 */
export async function measureSpread({ ask, birth, tier, chart }) {
  const r = await ask({ birth: { date: birth.date, zone: birth.zone, timeKnown: false }, tier });
  if (!r?.ok) return { spread: null, why: `engine ${r?.status ?? "?"} ${r?.payload?.error?.code ?? ""}`.trim() };
  const shape = shapeProblem(r.payload);
  if (shape) return { spread: null, why: `answer: ${shape}` };
  const noon = noonProblem(r.payload, chart);
  if (noon) return { spread: null, why: noon };
  const spread = {};
  for (const k of KEPT) spread[k] = r.payload[k];
  return { spread };
}
