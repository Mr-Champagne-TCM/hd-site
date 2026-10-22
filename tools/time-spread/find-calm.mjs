#!/usr/bin/env node
/**
 * IS THERE A BIRTH DAY WHERE NOTHING CHANGES? (mock TIME, Jeremy 10/22)
 *
 * Asked of the engine, not assumed. Two passes over made-up dates:
 *
 *   1. For each date, the two Suns' lines (the Profile) at the first and last
 *      minute of the local day. The Sun never turns back, so the same line at
 *      both ends would mean the Profile held all day.
 *   2. The calmest days found -- hourly casts, fewest values changing, widest
 *      stretch around noon -- then the real spread for the best of them.
 *
 *   node tools/time-spread/find-calm.mjs [--n=3000] [--seed=7] [--out=<file>]
 */
import { writeFileSync } from "node:fs";
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
import { WINDOW_FIELDS, birthDay, birthSpread, valuesOf } from "./oracle.mjs";
import { holdsLine } from "../../shared/timeSpread.mjs";

const arg = (k, d) => (process.argv.find((a) => a.startsWith(`--${k}=`)) ?? `--${k}=${d}`).split("=").slice(1).join("=");
const N = Number(arg("n", 3000));
let seed = Number(arg("seed", 7)) >>> 0;
const R = () => {
  seed = (seed + 0x6d2b79f5) >>> 0;
  let t = seed;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const ZONES = ["America/New_York", "America/Chicago", "America/Los_Angeles", "Europe/London", "Asia/Kolkata", "Australia/Sydney", "America/Sao_Paulo", "Asia/Tokyo", "Africa/Johannesburg", "Pacific/Auckland"];

function pool(n) {
  let a = 0;
  const q = [];
  const go = () => {
    if (a >= n || !q.length) return;
    a++;
    const { f, res, rej } = q.shift();
    f().then(res, rej).finally(() => (a--, go()));
  };
  return (f) => new Promise((res, rej) => (q.push({ f, res, rej }), go()));
}
const run = pool(12);

const engine = await startEngine({ port: await freePort(), mode: "local" });
if (!engine.url) process.exit(2);
// Every engine call goes through one queue: a burst of hundreds of drawings at once runs the JVM out of memory.
const ask = (birth, tier = 2) => run(() => askNow(birth, tier));
const askNow = async (birth, tier) => {
  const r = await fetch(`${engine.url}/v1/chart`, { method: "POST", headers: { "Content-Type": "application/json", "X-Engine-Key": engine.key }, body: JSON.stringify({ birth, tier }) });
  return r.json();
};
const sunLines = (c) => `${c.personality.find((a) => a.planet === "SUN").line}/${c.design.find((a) => a.planet === "SUN").line}`;


try {
  const dates = Array.from({ length: N }, () => {
    const t = Date.UTC(1940, 0, 1) + Math.floor(R() * 25567) * 86_400_000;
    return { date: new Date(t).toISOString().slice(0, 10), zone: ZONES[Math.floor(R() * ZONES.length)] };
  });
  // 1. The Profile at both ends of the day.
  let held = 0;
  let bothSunsMoved = 0;
  const firstPass = await Promise.all(
    dates.map((b) =>
      (async () => {
        const day = birthDay(b.date, b.zone);
        const [a, z] = await Promise.all([
          ask({ utc: new Date(day.start).toISOString() }),
          ask({ utc: new Date(day.start + (day.minutes - 1) * 60_000).toISOString() }),
        ]);
        const [pa, da] = sunLines(a).split("/");
        const [pz, dz] = sunLines(z).split("/");
        if (pa === pz && da === dz) held++;
        if (pa !== pz && da !== dz) bothSunsMoved++;
        return { ...b, day };
      })(),
    ),
  );
  // 2. Hourly casts: how many values change, how wide the noon stretch.
  const hourly = await Promise.all(
    firstPass.slice(0, Math.min(800, N)).map((b) =>
      (async () => {
        const ks = [];
        for (let k = 0; k < b.day.minutes; k += 60) ks.push(k);
        ks.push(b.day.minutes - 1);
        const vals = await Promise.all(ks.map((k) => ask({ utc: new Date(b.day.start + k * 60_000).toISOString() }, 1).then(valuesOf)));
        const noonI = ks.findIndex((k) => k >= b.day.noon);
        const same = (i) => WINDOW_FIELDS.every((f) => vals[i][f] === vals[noonI][f]);
        let lo = noonI;
        while (lo > 0 && same(lo - 1)) lo--;
        let hi = noonI;
        while (hi < ks.length - 1 && same(hi + 1)) hi++;
        const changing = WINDOW_FIELDS.filter((f) => new Set(vals.map((v) => v[f])).size > 1);
        return { date: b.date, zone: b.zone, changing, hours: ks[hi] - ks[lo] };
      })(),
    ),
  );
  hourly.sort((a, b) => a.changing.length - b.changing.length || b.hours - a.hours);
  const best = [];
  for (const c of hourly.slice(0, 12)) {
    const noonChart = await ask({ date: c.date, zone: c.zone, timeKnown: false });
    const s = await birthSpread({ date: c.date, zone: c.zone, cast: (utc) => ask({ utc }), noonChart });
    best.push({ date: c.date, zone: c.zone, changes: s.changes, window: s.window, minutes: s.minutes, line: holdsLine(s).text, spread: s });
  }
  best.sort((a, b) => a.changes.length - b.changes.length || b.window[1] - b.window[0] - (a.window[1] - a.window[0]));
  const out = {
    dates: N,
    profileHeldAllDay: held,
    bothSunsChangedLine: bothSunsMoved,
    fewestChangingValues: hourly[0]?.changing.length,
    calmest: best.slice(0, 5).map(({ spread, ...r }) => r),
  };
  console.log(JSON.stringify(out, null, 1));
  const file = arg("out", "");
  if (file) writeFileSync(file, JSON.stringify({ ...out, calmestSpread: best[0] }, null, 1));
} finally {
  await engine.stop();
}
