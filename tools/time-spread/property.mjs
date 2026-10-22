#!/usr/bin/env node
/**
 * THE UNKNOWN-TIME SPREAD, PROVED AGAINST THE ENGINE (mock, Jeremy 10/22:
 * "We demonstrate confidence with these offers, so lets certainly be competent").
 *
 * For hundreds of MADE-UP births (dates 1940-2010, zones all over the world:
 * southern hemisphere, half- and three-quarter-hour zones, DST-change days),
 * runs netlify/lib/birthSpread.mjs exactly as the shop would, then casts the
 * birth day densely, independently, and checks every claim it made:
 *
 *   A. REAL TIME: every 5 minutes of the real day (23/25 hours on DST days),
 *      plus each window edge and one and two minutes past it, plus every
 *      stretch boundary the spread reported and the minute before it:
 *        1. inside the window, every window value equals the noon chart;
 *        2. one minute outside each edge, at least one value differs (unless
 *           the window reaches the end of the day); two minutes out is counted;
 *        3. every value at every cast equals what the spread says it is then;
 *        4. the values marked PROVISIONAL are exactly the ones seen changing;
 *        5. "the same all day" only when nothing was seen changing;
 *        6. the drawing: at most three rows, and each edge of the gold stretch
 *           is where one of its rows changes (nothing ends unexplained).
 *   B. THE CUSTOMER'S WAY: every 5 minutes of the wall clock, cast as a typed
 *      time (date + HH:MM + zone, as the shop sends it, the engine's own zone
 *      rules), compared with what the spread claims for that typed time.
 *
 * Needs Java (the local engine, tools/e2e/harness/engine.mjs). Nothing leaves
 * this machine. Births are random but seeded, so a run can be repeated.
 *
 *   node tools/time-spread/property.mjs [--n=320] [--seed=1022] [--timing=30] [--out=<dir>]
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { startEngine } from "../e2e/harness/engine.mjs";
import { createServer } from "node:net";

/** A port nobody holds right now (the rig picks one at random, and other rigs may be running). */
const freePort = () =>
  new Promise((res) => {
    const srv = createServer();
    srv.listen(0, "127.0.0.1", () => {
      const { port } = srv.address();
      srv.close(() => res(port));
    });
  });
import { WINDOW_FIELDS, birthDay, birthSpread, localInstant, valueAt, valuesOf } from "../../netlify/lib/birthSpread.mjs";
import { graphRows, holdsLine } from "../../shared/timeSpread.mjs";

const arg = (k, d) => (process.argv.find((a) => a.startsWith(`--${k}=`)) ?? `--${k}=${d}`).split("=").slice(1).join("=");
const N = Number(arg("n", 320));
const SEED = Number(arg("seed", 1022));
const TIMING = Number(arg("timing", 30));
/**
 * --mutate=<kind> TESTS THE TEST: plants one error in every spread before it is
 * checked, and the run must then FAIL on every birth. Kinds: window-end (one
 * minute too long), window-start (one minute too early), segment (a stretch
 * starts a minute late), unmark (a changing value left unmarked), extra-mark
 * (a steady value marked).
 */
const MUTATE = arg("mutate", "");
const OUT = resolve(arg("out", "time-spread-out"));
mkdirSync(OUT, { recursive: true });

/* ------------------------------------------------------------ the births */

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const R = rng(SEED);
const pick = (xs) => xs[Math.floor(R() * xs.length)];

const ZONES = [
  "America/New_York", "America/Chicago", "America/Denver", "America/Los_Angeles", "America/Phoenix", "America/Anchorage",
  "Pacific/Honolulu", "America/Boise", "America/St_Johns", "America/Halifax", "America/Mexico_City", "America/Sao_Paulo",
  "America/Argentina/Buenos_Aires", "America/Santiago", "America/Havana", "America/Caracas", "America/Bogota",
  "Europe/London", "Europe/Paris", "Europe/Berlin", "Europe/Moscow", "Europe/Istanbul", "Africa/Cairo",
  "Africa/Johannesburg", "Africa/Lagos", "Africa/Monrovia", "Africa/Nairobi", "Asia/Tehran", "Asia/Kabul", "Asia/Kolkata",
  "Asia/Kathmandu", "Asia/Dhaka", "Asia/Yangon", "Asia/Shanghai", "Asia/Tokyo", "Asia/Singapore", "Asia/Manila",
  "Australia/Adelaide", "Australia/Darwin", "Australia/Sydney", "Australia/Perth", "Australia/Lord_Howe",
  "Pacific/Auckland", "Pacific/Chatham", "Pacific/Kiritimati", "America/Noronha", "Atlantic/Azores",
];
const DST_ZONES = [
  "America/New_York", "America/Chicago", "America/Los_Angeles", "America/St_Johns", "America/Sao_Paulo", "America/Santiago",
  "America/Havana", "Europe/London", "Europe/Paris", "Europe/Moscow", "Asia/Tehran", "Australia/Sydney",
  "Australia/Adelaide", "Australia/Lord_Howe", "Pacific/Auckland", "Pacific/Chatham", "Africa/Cairo", "America/Mexico_City",
];

const iso = (ms) => new Date(ms).toISOString().slice(0, 10);
function randomDate() {
  const from = Date.UTC(1940, 0, 1);
  const to = Date.UTC(2010, 11, 31);
  return iso(from + Math.floor(R() * ((to - from) / 86_400_000)) * 86_400_000);
}
/** A day in `zone` whose length is not 24 hours, in a random year (or null). */
function dstDay(zone) {
  for (let tries = 0; tries < 8; tries++) {
    const y = 1940 + Math.floor(R() * 71);
    const days = [];
    for (let t = Date.UTC(y, 0, 1); t < Date.UTC(y + 1, 0, 1); t += 86_400_000) {
      try {
        if (birthDay(iso(t), zone).minutes !== 1440) days.push(iso(t));
      } catch {
        /* a day that does not exist */
      }
    }
    if (days.length) return pick(days);
  }
  return null;
}

const births = [];
const dstTarget = Math.round(N * 0.25);
while (births.length < dstTarget) {
  const zone = pick(DST_ZONES);
  const date = dstDay(zone);
  if (date) births.push({ date, zone, why: "dst-day" });
}
while (births.length < N) births.push({ date: randomDate(), zone: pick(ZONES), why: "random" });
// Plus the four named cases, always.
births.unshift(
  { date: "2001-12-05", zone: "America/Los_Angeles", why: "theo" },
  { date: "1979-08-30", zone: "America/New_York", why: "ny-type-flip" },
  { date: "1966-04-02", zone: "America/Boise", why: "boise-gift" },
);

/* ------------------------------------------------------------ the engine */

const engine = await startEngine({ port: await freePort(), mode: "local", log: (m) => process.stderr.write(m + "\n") });
if (!engine.url) {
  console.error("No local engine (needs Java and ../hd-engine's build). Nothing tested.");
  process.exit(2);
}
let engineCasts = 0;
async function ask(birth, tier = 2) {
  for (let attempt = 0; ; attempt++) {
    try {
      engineCasts++;
      const r = await fetch(`${engine.url}/v1/chart`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Engine-Key": engine.key },
        body: JSON.stringify({ birth, tier }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(`engine ${r.status} ${JSON.stringify(j).slice(0, 200)}`);
      return j;
    } catch (e) {
      if (attempt >= 2 || /engine 4\d\d/.test(e.message)) throw e;
      await new Promise((r) => setTimeout(r, 200));
    }
  }
}
function pool(n) {
  let active = 0;
  const q = [];
  const next = () => {
    if (active >= n || !q.length) return;
    active++;
    const { job, res, rej } = q.shift();
    job().then(res, rej).finally(() => {
      active--;
      next();
    });
  };
  return (job) => new Promise((res, rej) => (q.push({ job, res, rej }), next()));
}
const verifyPool = pool(24);
const MIN = 60_000;

/* ----------------------------------------------------------- one birth */

async function prove(b, { concurrency = 8 } = {}) {
  const out = { ...b, failures: [] };
  const fail = (claim, detail) => out.failures.push({ claim, ...detail });
  const noonChart = await ask({ date: b.date, zone: b.zone, timeKnown: false });
  const noon = valuesOf(noonChart);
  const t0 = Date.now();
  const s = await birthSpread({ date: b.date, zone: b.zone, cast: (utc) => ask({ utc }), noonChart, concurrency });
  out.ms = Date.now() - t0;
  if (MUTATE) plant(s, MUTATE);
  out.casts = s.casts;
  out.minutes = s.minutes;
  out.window = s.window;
  out.changes = s.changes;
  out.ok = s.ok;
  out.line = holdsLine(s).text;
  if (!s.ok) fail("noon-matches-stored", { detail: "the scan's noon differs from the engine's own noon cast" });
  const day = birthDay(b.date, b.zone);
  const [a, z] = s.window;
  const rows = graphRows(s);
  out.rows = rows.map((r) => r.label);
  if (rows.length > 3) fail("rows-at-most-three", { rows: out.rows });
  for (const e of [a > 0 ? a : null, z < s.minutes - 1 ? z + 1 : null].filter((x) => x !== null)) {
    if (!rows.some((r) => r.segments.some((x) => x.start === e))) fail("rows-explain-edges", { edge: e, rows: out.rows });
  }

  // A. Real time.
  const ks = new Set();
  for (let k = 0; k < s.minutes; k += 5) ks.add(k);
  ks.add(s.minutes - 1);
  for (const k of [a, z, a - 1, a - 2, z + 1, z + 2]) if (k >= 0 && k < s.minutes) ks.add(k);
  for (const f of s.changes) for (const [k] of s.segments[f] ?? []) for (const j of [k - 1, k]) if (j >= 0 && j < s.minutes) ks.add(j);
  const real = new Map();
  await Promise.all(
    [...ks].map((k) =>
      verifyPool(async () => {
        real.set(k, valuesOf(await ask({ utc: new Date(day.start + k * MIN).toISOString() })));
      }),
    ),
  );
  out.verifyCasts = real.size;
  const seen = new Set();
  let insideChecked = 0;
  for (const [k, v] of real) {
    for (const f of WINDOW_FIELDS) {
      if (v[f] !== noon[f]) seen.add(f);
      const claimed = valueAt(s, f, k, noon[f]);
      if (v[f] !== claimed) fail("value-as-claimed", { k, field: f, claimed, got: v[f] });
    }
    if (k >= a && k <= z) {
      insideChecked++;
      const off = WINDOW_FIELDS.filter((f) => v[f] !== noon[f]);
      if (off.length) fail("inside-window-equals-noon", { k, fields: off });
    }
  }
  out.insideChecked = insideChecked;
  const differs = (k) => WINDOW_FIELDS.some((f) => real.get(k)[f] !== noon[f]);
  out.edges = { start: a === 0 ? "midnight" : null, end: z === s.minutes - 1 ? "midnight" : null };
  if (a > 0) {
    if (!differs(a - 1)) fail("outside-start-differs", { k: a - 1 });
    out.edges.start = differs(a - 1) ? "1min" : "no";
    if (a > 1) out.edges.start2 = differs(a - 2);
  }
  if (z < s.minutes - 1) {
    if (!differs(z + 1)) fail("outside-end-differs", { k: z + 1 });
    out.edges.end = differs(z + 1) ? "1min" : "no";
    if (z < s.minutes - 2) out.edges.end2 = differs(z + 2);
  }
  const marked = new Set(s.changes);
  const missingMark = [...seen].filter((f) => !marked.has(f));
  const extraMark = [...marked].filter((f) => !seen.has(f));
  if (missingMark.length || extraMark.length) fail("marked-equals-changing", { missingMark, extraMark });
  if ((s.changes.length === 0) !== (seen.size === 0)) fail("same-all-day-only-if-nothing-changes", { seen: [...seen] });

  // B. The customer's way: typed wall-clock times, the engine's own zone rules.
  const d0 = Date.parse(b.date + "T00:00:00Z");
  let typed = 0;
  await Promise.all(
    Array.from({ length: 288 }, (_, i) => i * 5).map((m) =>
      verifyPool(async () => {
        const hh = String(Math.floor(m / 60)).padStart(2, "0");
        const mm = String(m % 60).padStart(2, "0");
        const v = valuesOf(await ask({ date: b.date, time: `${hh}:${mm}`, zone: b.zone, timeKnown: true }));
        const t = localInstant(d0 + m * MIN, b.zone);
        const k = Math.round((t - day.start) / MIN);
        typed++;
        if (k < 0 || k >= s.minutes) return; // a typed time the engine moves into the next day (a gap at midnight)
        for (const f of WINDOW_FIELDS) {
          const claimed = valueAt(s, f, k, noon[f]);
          if (v[f] !== claimed) fail("typed-time-as-claimed", { time: `${hh}:${mm}`, k, field: f, claimed, got: v[f] });
        }
      }),
    ),
  );
  out.typedCasts = typed;
  return out;
}

/** One planted error, in place. */
function plant(s, kind) {
  // One minute too wide, at the named edge (the other edge when that one is the day's end).
  const later = () => (s.window[1] < s.minutes - 1 ? (s.window[1] += 1) : (s.window[0] -= 1));
  const earlier = () => (s.window[0] > 0 ? (s.window[0] -= 1) : (s.window[1] += 1));
  if (kind === "window-end") later();
  if (kind === "window-start") earlier();
  if (kind === "segment") {
    const f = s.changes[0];
    s.segments[f][1][0] += 1;
  }
  if (kind === "unmark") {
    const f = s.changes.shift();
    delete s.segments[f];
  }
  if (kind === "extra-mark") {
    const f = WINDOW_FIELDS.find((x) => !s.changes.includes(x));
    s.changes.push(f);
  }
}

/* --------------------------------------------------------------- the run */

const started = Date.now();
const timing = [];
try {
  // Clean timing first: births one at a time, nothing else running.
  for (const b of births.slice(0, TIMING)) {
    const noonChart = await ask({ date: b.date, zone: b.zone, timeKnown: false });
    const t0 = Date.now();
    const s = await birthSpread({ date: b.date, zone: b.zone, cast: (utc) => ask({ utc }), noonChart });
    timing.push({ ms: Date.now() - t0, casts: s.casts });
  }
  const results = [];
  const births4 = pool(4);
  let done = 0;
  await Promise.all(
    births.map((b) =>
      births4(async () => {
        let r;
        try {
          r = await prove(b);
        } catch (e) {
          r = { ...b, failures: [{ claim: "ran", error: String(e?.message ?? e) }] };
        }
        results.push(r);
        done++;
        if (done % 25 === 0 || r.failures.length) {
          process.stderr.write(`${done}/${births.length}${r.failures.length ? `  FAIL ${b.date} ${b.zone}: ${JSON.stringify(r.failures[0])}` : ""}\n`);
        }
      }),
    ),
  );

  const sorted = (xs) => [...xs].sort((a, b) => a - b);
  const q = (xs, p) => sorted(xs)[Math.min(xs.length - 1, Math.floor(p * xs.length))];
  const claims = {};
  for (const r of results) for (const f of r.failures) claims[f.claim] = (claims[f.claim] ?? 0) + 1;
  const summary = {
    seed: SEED,
    births: results.length,
    dstDays: results.filter((r) => r.minutes && r.minutes !== 1440).length,
    dayLengths: Object.entries(results.reduce((m, r) => ((m[r.minutes] = (m[r.minutes] ?? 0) + 1), m), {})),
    zones: new Set(results.map((r) => r.zone)).size,
    passed: results.filter((r) => !r.failures.length).length,
    failed: results.filter((r) => r.failures.length).length,
    failuresByClaim: claims,
    sameAllDay: results.filter((r) => r.changes && !r.changes.length).length,
    profileChanged: results.filter((r) => r.changes?.includes("profile")).length,
    changes: Object.fromEntries(WINDOW_FIELDS.map((f) => [f, results.filter((r) => r.changes?.includes(f)).length])),
    windowReachesMidnight: results.filter((r) => r.window && (r.window[0] === 0 || r.window[1] === r.minutes - 1)).length,
    edge2minDiffers: {
      start: results.filter((r) => r.edges?.start2 === true).length + " of " + results.filter((r) => r.edges && "start2" in r.edges).length,
      end: results.filter((r) => r.edges?.end2 === true).length + " of " + results.filter((r) => r.edges && "end2" in r.edges).length,
    },
    checks: {
      realCasts: results.reduce((n, r) => n + (r.verifyCasts ?? 0), 0),
      insideWindowCasts: results.reduce((n, r) => n + (r.insideChecked ?? 0), 0),
      typedCasts: results.reduce((n, r) => n + (r.typedCasts ?? 0), 0),
    },
    spreadCasts: { median: q(results.map((r) => r.casts ?? 0), 0.5), p95: q(results.map((r) => r.casts ?? 0), 0.95), max: Math.max(...results.map((r) => r.casts ?? 0)) },
    timing: timing.length
      ? { births: timing.length, msMedian: q(timing.map((t) => t.ms), 0.5), msP95: q(timing.map((t) => t.ms), 0.95), msMax: Math.max(...timing.map((t) => t.ms)), castsMedian: q(timing.map((t) => t.casts), 0.5) }
      : null,
    engineCasts,
    wallSeconds: Math.round((Date.now() - started) / 1000),
    engineVersion: engine.version,
  };
  writeFileSync(join(OUT, "results.json"), JSON.stringify(results, null, 1));
  writeFileSync(join(OUT, "summary.json"), JSON.stringify(summary, null, 1));
  console.log(JSON.stringify(summary, null, 1));
  const firstFail = results.find((r) => r.failures.length);
  if (firstFail) console.log("FIRST COUNTEREXAMPLE:", JSON.stringify({ date: firstFail.date, zone: firstFail.zone, failures: firstFail.failures.slice(0, 5) }));
  process.exitCode = summary.failed ? 1 : 0;
} finally {
  await engine.stop();
}
