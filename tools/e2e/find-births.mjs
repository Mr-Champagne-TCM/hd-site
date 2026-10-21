#!/usr/bin/env node
/**
 * Find a MADE-UP birth for every chart shape the rig needs (Reflector, Ego,
 * Mental, 0-5 channels...), by asking the local engine about a deterministic
 * walk of dates, times and US towns. Prints JSON to paste into combos.mjs.
 * Nobody real: the walk is arithmetic, not anybody's birthday.
 *
 * usage: node tools/e2e/find-births.mjs
 */
import { engineCache, startEngine } from "./harness/engine.mjs";

const TOWNS = [
  ["Tulsa, Oklahoma", "America/Chicago"],
  ["Boise, Idaho", "America/Boise"],
  ["Reno, Nevada", "America/Los_Angeles"],
  ["Dayton, Ohio", "America/New_York"],
  ["Fargo, North Dakota", "America/Chicago"],
  ["Tucson, Arizona", "America/Phoenix"],
];

const WANT = {
  reflector: (c) => c.type === "Reflector",
  egoManifested: (c) => c.authority === "Ego Manifested",
  egoProjected: (c) => c.authority === "Ego Projected",
  mental: (c) => c.authority === "Mental",
  selfProjected: (c) => c.authority === "Self-Projected",
  splenicProjector: (c) => c.type === "Projector" && c.authority === "Splenic",
  manifestor: (c) => c.type === "Manifestor" && c.authority === "Emotional",
  ch1: (c) => c.channels?.length === 1 && c.type === "Generator",
  ch2: (c) => c.channels?.length === 2 && c.type === "Manifesting Generator",
  ch3: (c) => c.channels?.length === 3,
  ch4: (c) => c.channels?.length === 4 && c.timeKnown,
  ch5: (c) => c.channels?.length === 5,
  ch6: (c) => c.channels?.length >= 6,
};

const engine = await startEngine({ log: console.error });
if (!engine.url) {
  console.error("needs the local engine");
  process.exit(1);
}
const cache = engineCache(engine);
const found = {};
let n = 0;
outer: for (let y = 1961; y < 2004; y += 1) {
  for (let i = 0; i < 40; i++) {
    n++;
    const m = 1 + ((y * 7 + i * 5) % 12);
    const d = 1 + ((y * 3 + i * 11) % 28);
    const hh = (y + i * 7) % 24;
    const mm = (i * 13) % 60;
    const [place, zone] = TOWNS[(y + i) % TOWNS.length];
    const date = `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    const time = `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
    const { status, json } = await cache.ask("POST", "/v1/chart", JSON.stringify({ birth: { date, time, zone, timeKnown: true }, tier: 2 }));
    if (status !== 200) continue;
    for (const [k, ok] of Object.entries(WANT)) {
      if (!found[k] && ok(json)) {
        found[k] = { date, time, place, zone, type: json.type, authority: json.authority, profile: json.profile, channels: json.channels.length, definition: json.definition };
        console.error(`${k}: ${date} ${time} ${place} -> ${json.type} / ${json.authority} / ${json.channels.length} ch`);
      }
    }
    if (Object.keys(WANT).every((k) => found[k])) break outer;
  }
}
console.error(`${n} charts asked`);
console.log(JSON.stringify(found, null, 1));
await engine.stop();
