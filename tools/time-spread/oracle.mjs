/**
 * THE TEST ORACLE for an unknown birth time's spread -- NEVER the shop's.
 *
 * This was the shop's mock (10/22): ~160 chart casts per unknown-time chart.
 * The shop now asks the engine ONCE (POST /v1/spread, engine 0.6.0, through
 * netlify/lib/birthSpread.mjs), and this scan stays here, outside netlify/,
 * as an independent second answer: the unit tests' fake engine answers
 * /v1/spread with it, and tools/time-spread/property.mjs holds the engine's
 * endpoint to it and to dense casts of the real day.
 *
 * It works out how far a noon chart can be trusted: it casts the whole birth
 * day in the birth place's own local time and reports
 *
 *   - which chart values change during that day (and so are PROVISIONAL),
 *   - the stretch around noon in which every one of them is the noon chart's
 *     (the "holds between" window), exact to the minute, and
 *   - for each value that changes, its stretches through the day.
 *
 * WHAT IS COMPARED: the values a buyer reads -- Type, Strategy, Authority,
 * Profile, Definition, the two feelings (lookups from Type), the Incarnation
 * Cross, the three center lists and the channels. Gates and the 26 activations
 * are left out of the window on purpose (Jeremy: the gate list moves with the
 * Moon every few hours, so it is always marked PROVISIONAL instead).
 *
 * HOW IT KNOWS IT MISSED NOTHING. Every value above is worked out from 28
 * numbers: the gate of each of the 26 activations, plus the line of the two
 * Suns (the Profile). Each of those moves at most once in ten minutes (the
 * Moon, the fastest, takes about ten hours to cross a gate and the Sun about a
 * day to cross a line). So the day is cast every ten minutes, and between two
 * casts:
 *   - none of the 28 moved: nothing changed in between;
 *   - one moved: the values changed at most once, at the minute it moved,
 *     found by halving the stretch;
 *   - two or more moved: the stretch is halved until each half has one.
 * The result is exact to the minute, which is all a typed birth time carries.
 *
 * REAL TIME, REAL DAYS. The day runs from the first instant whose local date is
 * the birth date to the first instant of the next one -- 23 hours on a spring-
 * forward day, 25 on a fall-back day -- and every minute of it is cast as an
 * exact instant (the engine's `utc` input), so the repeated hour of a fall-back
 * day is covered both times. Minute k is `start + k minutes`; the wall clock it
 * shows is stored with the result so a page can label it without a timezone
 * table.
 *
 * The engine is passed in (`cast`), so this runs against the live engine, the
 * local one, or a fake in the tests. Nothing here stores or logs a birth.
 */

const MIN = 60_000;

/**
 * THE TIER THE SCAN CASTS AT: the reading tier, local tools only. Its 26
 * activations are what make the scan provably complete (see above); they
 * never leave this module -- the result holds minutes and the buyer-facing
 * values, nothing else. (In the shop this is the engine's own work, in one
 * /v1/spread call.)
 */
export const SCAN_TIER = 2;

/** The values the window is built from, in the order they are read. */
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

/* ------------------------------------------------------------ time zones */

const fmts = new Map();
function formatter(zone) {
  let f = fmts.get(zone);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone: zone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    fmts.set(zone, f);
  }
  return f;
}

/** The wall clock at instant `ms` in `zone`, as the UTC milliseconds of that wall time. */
export function wallAt(ms, zone) {
  const p = {};
  for (const { type, value } of formatter(zone).formatToParts(new Date(ms))) p[type] = value;
  const y = Number(p.year);
  return Date.UTC(y, Number(p.month) - 1, Number(p.day), Number(p.hour) % 24, Number(p.minute), Number(p.second));
}

/** The zone's offset at instant `ms`, in milliseconds (wall minus UTC). */
export function offsetAt(ms, zone) {
  // Seconds only: Intl does not print milliseconds, so compare whole seconds.
  const s = Math.floor(ms / 1000) * 1000;
  return wallAt(s, zone) - s;
}

/**
 * The instant a local wall time names, resolved the way the engine (Java's
 * ZonedDateTime) resolves it: a time in an overlap takes the EARLIER instant,
 * a time in a gap is moved later by the gap's length.
 */
export function localInstant(wallMs, zone) {
  const before = offsetAt(wallMs - 2 * 86_400_000, zone);
  const after = offsetAt(wallMs + 2 * 86_400_000, zone);
  const cands = new Set([before, after, offsetAt(wallMs - before, zone), offsetAt(wallMs - after, zone)]);
  const valid = [...cands].map((o) => wallMs - o).filter((t) => wallAt(t, zone) === wallMs);
  if (valid.length) return Math.min(...valid);
  // A gap: the offset in force just before it, which lands the wall time later.
  return wallMs - before;
}

function parseDate(date) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(date ?? ""));
  if (!m) throw new Error(`birthSpread: bad date ${date}`);
  return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

/**
 * The birth day in the birth place: its first instant, the next day's first
 * instant, how many whole minutes lie between, and where local noon falls.
 */
export function birthDay(date, zone) {
  const d0 = parseDate(date);
  const start = localInstant(d0, zone);
  const end = localInstant(d0 + 86_400_000, zone);
  const minutes = Math.round((end - start) / MIN);
  const noonAt = localInstant(d0 + 12 * 3_600_000, zone);
  const noon = Math.round((noonAt - start) / MIN);
  /**
   * The wall clock, minute by minute, as "starts at" plus the minutes where it
   * jumps (a DST change): [[k, wall minute of day]]. A plain day is one entry.
   */
  const wallMin = (k) => Math.round((wallAt(start + k * MIN, zone) - d0) / MIN);
  const clock = [[0, wallMin(0)]];
  const onTrack = (k) => wallMin(k) === clock.at(-1)[1] + (k - clock.at(-1)[0]);
  // Offsets change at most a few times a day: check each hour, then find the minute.
  for (let h = 60; h < minutes + 60; h += 60) {
    const k = Math.min(h, minutes - 1);
    if (onTrack(k)) continue;
    let lo = Math.max(clock.at(-1)[0], k - 60);
    let hi = k;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (onTrack(mid)) lo = mid;
      else hi = mid;
    }
    clock.push([hi, wallMin(hi)]);
  }
  return { start, end, minutes, noon, clock };
}

/** Wall-clock minute of day (0..1439, can repeat on a fall-back day) for minute index k. */
export function wallMinute(clock, k) {
  let w = clock[0];
  for (const c of clock) if (c[0] <= k) w = c;
  return w[1] + (k - w[0]);
}

/* -------------------------------------------------------------- the chart */

const list = (v) => (Array.isArray(v) ? [...v].map(String).sort() : []);

/**
 * The window values of one engine answer, each as one comparable string.
 * Center and channel lists compare as sets (sorted); channels by their numbers.
 */
export function valuesOf(chart) {
  const c = chart ?? {};
  const out = {};
  for (const f of WINDOW_FIELDS) {
    if (f === "definedCenters" || f === "undefinedCenters" || f === "openCenters") out[f] = list(c[f]).join(", ");
    else if (f === "channels") out[f] = list((c.channels ?? []).map((x) => String(x).split(" ")[0])).join(", ");
    else out[f] = String(c[f] ?? "");
  }
  return out;
}

/** The 28 numbers every window value is worked out from (null without activations). */
export function piecesOf(chart) {
  const p = chart?.personality;
  const d = chart?.design;
  if (!Array.isArray(p) || !Array.isArray(d) || !p.length || !d.length) return null;
  const sun = (side) => side.find((a) => a.planet === "SUN")?.line ?? null;
  return [...p.map((a) => `p${a.planet}:${a.gate}`), ...d.map((a) => `d${a.planet}:${a.gate}`), `pSUN.line:${sun(p)}`, `dSUN.line:${sun(d)}`];
}

const sameValues = (a, b) => WINDOW_FIELDS.every((f) => a[f] === b[f]);
const moved = (a, b) => {
  if (!a || !b || a.length !== b.length) return Infinity;
  let n = 0;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) n++;
  return n;
};

/** At most `n` at once. */
function limiter(n) {
  let active = 0;
  const queue = [];
  const next = () => {
    if (active >= n || !queue.length) return;
    active++;
    const { job, resolve, reject } = queue.shift();
    job()
      .then(resolve, reject)
      .finally(() => {
        active--;
        next();
      });
  };
  return (job) =>
    new Promise((resolve, reject) => {
      queue.push({ job, resolve, reject });
      next();
    });
}

/**
 * The spread of one birth day.
 *
 *   date, zone    the birth date and IANA zone, as the shop keeps them
 *   cast(iso)     the engine's answer at that exact UTC instant (reading tier:
 *                 the 26 activations are what make the scan provably complete)
 *   noonChart     optional: the chart actually stored. Its values must equal
 *                 the scan's own noon cast, or the result says `ok: false`
 *                 (the two disagree on the zone's clock that day).
 *
 * Returns what a record keeps (`timeSpread`): minutes, noon, window, changes,
 * segments, clock, gates -- plus `casts` and `ms` for the report.
 */
export async function birthSpread({ date, zone, cast, step = 10, concurrency = 8, noonChart = null }) {
  const t0 = Date.now();
  const day = birthDay(date, zone);
  const N = day.minutes;
  const run = limiter(concurrency);
  const memo = new Map();
  let casts = 0;
  const get = (k) => {
    if (!memo.has(k)) {
      memo.set(
        k,
        run(async () => {
          casts++;
          const chart = await cast(new Date(day.start + k * MIN).toISOString());
          const pieces = piecesOf(chart);
          if (!pieces) throw new Error("birthSpread: the engine answer has no activations (cast at the reading tier)");
          return { values: valuesOf(chart), pieces, gates: list(chart.activatedGates).join(",") };
        }),
      );
    }
    return memo.get(k);
  };

  // 1. Every `step` minutes, the last minute of the day, and noon itself.
  const scan = new Set([N - 1, day.noon]);
  for (let k = 0; k < N; k += step) scan.add(k);
  const points = [...scan].sort((a, b) => a - b);
  await Promise.all(points.map(get));

  // 2. Between each pair, find every minute where something we show moved.
  const edges = new Set();
  const refine = async (p, q) => {
    const [a, b] = await Promise.all([get(p), get(q)]);
    const n = moved(a.pieces, b.pieces);
    if (n === 0) {
      if (!sameValues(a.values, b.values)) throw new Error("birthSpread: values changed with no activation moving");
      return;
    }
    if (q - p === 1) {
      if (!sameValues(a.values, b.values)) edges.add(q);
      return;
    }
    // One piece moved and nothing shown changed: it moved once and changed nothing.
    if (n === 1 && sameValues(a.values, b.values)) return;
    const m = (p + q) >> 1;
    await Promise.all([refine(p, m), refine(m, q)]);
  };
  await Promise.all(points.slice(1).map((q, i) => refine(points[i], q)));

  // 3. Stretches: the day cut at every edge, each stretch's values read from a cast at its start.
  const starts = [0, ...[...edges].sort((a, b) => a - b)];
  const at = await Promise.all(starts.map(get));
  const segments = {};
  for (const f of WINDOW_FIELDS) {
    const runs = [];
    starts.forEach((k, i) => {
      const v = at[i].values[f];
      if (!runs.length || runs.at(-1)[1] !== v) runs.push([k, v]);
    });
    if (runs.length > 1) segments[f] = runs;
  }
  const changes = WINDOW_FIELDS.filter((f) => segments[f]);

  // 4. The window: the stretch holding noon (stretches are cut only where a value changes).
  let w = 0;
  for (let i = 0; i < starts.length; i++) if (starts[i] <= day.noon) w = i;
  const window = [starts[w], (starts[w + 1] ?? N) - 1];

  // 5. The gate list (never in the window): does it move at all today?
  const all = await Promise.all([...memo.keys()].map(get));
  const gatesChange = new Set(all.map((x) => x.gates)).size > 1;

  // 6. The stored chart must be the scan's own noon, or the clock of the day is in doubt.
  const noonValues = (await get(day.noon)).values;
  let ok = true;
  if (noonChart) {
    const stored = valuesOf(noonChart);
    ok = WINDOW_FIELDS.every((f) => (f === "channels" && !Array.isArray(noonChart.channels) ? true : stored[f] === noonValues[f]));
  }

  return {
    v: 1,
    ok,
    minutes: N,
    noon: day.noon,
    window,
    changes,
    segments,
    clock: day.clock,
    gates: gatesChange ? "change" : "same",
    casts,
    ms: Date.now() - t0,
  };
}

/** The values the spread says minute k has (for the tests and the property check). */
export function valueAt(spread, field, k, noonValue) {
  const runs = spread.segments[field];
  if (!runs) return noonValue;
  let v = runs[0][1];
  for (const [s, val] of runs) if (s <= k) v = val;
  return v;
}
