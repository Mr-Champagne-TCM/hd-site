#!/usr/bin/env node
/**
 * PARITY, PART 1: THE LOCAL ENGINE GIVES THE LIVE ENGINE'S CHARTS.
 *
 * Every chart the rig judges comes from ../hd-engine's jars run on this
 * machine. If those jars drew a different chart from the one on Fly, every
 * values check would be comparing the shop against the wrong truth: an error
 * could be hidden, or one invented. So, before the rig is trusted, each live
 * record captured on 10/21 (the exact JSON /api/reading returned) is asked
 * again of the local engine, same birth and tier, and every value is compared
 * (the drawing too, character for character). Only computedAt may differ.
 *
 *   node tools/e2e/parity/engine.mjs [--live=<capture folder>]
 *
 * Records from an older engine (before 0.5.0 corrected Jupiter to Pluto) and
 * records with no birth line (before 10/16 the store kept none) are listed as
 * not comparable, never as passing. Values go only to the data home; the
 * terminal names fields, not birth data (one record is Jeremy's own).
 * Exit code 1 on any difference.
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { isDeepStrictEqual } from "node:util";
import { startEngine } from "../harness/engine.mjs";
import { HOME } from "../harness/paths.mjs";

const arg = (name, dflt = null) => {
  const a = process.argv.find((x) => x.startsWith(`--${name}=`));
  return a ? a.slice(a.indexOf("=") + 1) : dflt;
};
const say = (m) => process.stdout.write(m + "\n");
const J = (f) => JSON.parse(readFileSync(f, "utf8"));

const LIVE = arg("live", join(HOME, "live-2026-10-21"));
const ENGINE_NOW = "0.5.0";
const IGNORE = new Set(["computedAt"]);
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/** "February 11, 1990 · 6:25 AM · Albuquerque, New Mexico" -> { date, time|null, place } */
function parseBirthLine(line) {
  const parts = String(line ?? "").split(" · ").map((s) => s.trim());
  if (parts.length !== 3) return null;
  const d = parts[0].match(/^(\w+) (\d{1,2}), (\d{4})$/);
  if (!d || !MONTHS.includes(d[1])) return null;
  const date = `${d[3]}-${String(MONTHS.indexOf(d[1]) + 1).padStart(2, "0")}-${d[2].padStart(2, "0")}`;
  let time = null;
  const t = parts[1].match(/^(\d{1,2}):(\d{2}) (AM|PM)$/);
  if (t) {
    const h = (Number(t[1]) % 12) + (t[3] === "PM" ? 12 : 0);
    time = `${String(h).padStart(2, "0")}:${t[2]}`;
  } else if (!/^Time unknown/.test(parts[1])) return null;
  return { date, time, place: parts[2] };
}

function liveRecords() {
  const recs = [];
  const dir = join(LIVE, "api");
  for (const f of readdirSync(dir).filter((f) => f.endsWith(".json")).sort()) {
    const j = J(join(dir, f));
    if (Array.isArray(j)) j.forEach((r, i) => recs.push({ source: `${f} #${i}`, rec: r }));
    else recs.push({ source: f, rec: j });
  }
  return recs;
}

const engine = await startEngine({ mode: "local", log: (m) => say("  " + m) });
if (!engine.url) {
  say("parity/engine: the local engine did not start, so nothing was compared (this is a failure, not a pass).");
  process.exit(2);
}
const ask = async (method, path, body = null) => {
  const res = await fetch(`${engine.url}${path}`, {
    method,
    headers: { "Content-Type": "application/json", "X-Engine-Key": engine.key },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  return { status: res.status, json: await res.json().catch(() => null) };
};

const zones = new Map();
async function zoneFor(place) {
  if (zones.has(place)) return zones.get(place);
  const town = place.split(",")[0];
  const r = await ask("GET", `/v1/places?q=${encodeURIComponent(town)}&limit=25`);
  const hit = r.json?.places?.find((p) => p.label === place);
  zones.set(place, hit?.zone ?? null);
  return hit?.zone ?? null;
}

const results = [];
const seen = new Set();
try {
  for (const { source, rec } of liveRecords()) {
    const out = rec.output;
    const row = { source, name: rec.name ?? null, tier: rec.tier, engine: out?.engineVersion ?? null };
    const birth = parseBirthLine(rec.birthLine);
    if (!out) row.verdict = "no chart in this record";
    else if (out.engineVersion !== ENGINE_NOW) row.verdict = `not comparable: made by engine ${out.engineVersion}`;
    else if (!birth) row.verdict = "not comparable: no birth line";
    if (row.verdict) {
      results.push(row);
      continue;
    }
    // The same chart at the same tier is asked once (summary + chart of one buyer share a birth, not a tier).
    const dedupe = `${rec.birthLine}|${rec.tier}`;
    if (seen.has(dedupe)) {
      results.push({ ...row, verdict: "same birth and tier as a record above" });
      continue;
    }
    seen.add(dedupe);
    const zone = await zoneFor(birth.place);
    if (!zone) {
      results.push({ ...row, verdict: "FAIL: the local place list has no exact match for the live place" });
      continue;
    }
    const body = { birth: birth.time ? { date: birth.date, time: birth.time, zone, timeKnown: true } : { date: birth.date, zone, timeKnown: false }, tier: rec.tier };
    const local = await ask("POST", "/v1/chart", body);
    if (local.status !== 200) {
      results.push({ ...row, verdict: `FAIL: local engine answered ${local.status}` });
      continue;
    }
    const keys = new Set([...Object.keys(out), ...Object.keys(local.json)].filter((k) => !IGNORE.has(k)));
    const differ = [];
    for (const k of [...keys].sort()) if (!isDeepStrictEqual(out[k], local.json[k])) differ.push({ field: k, live: out[k], local: local.json[k] });
    results.push({ ...row, fields: keys.size, verdict: differ.length ? `FAIL: ${differ.length} field(s) differ` : "match", differ });
  }
} finally {
  await engine.stop();
}

const outDir = join(HOME, "parity");
mkdirSync(outDir, { recursive: true });
const file = join(outDir, `engine-${new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19)}.json`);
writeFileSync(file, JSON.stringify({ live: LIVE, engine: engine.version, results }, null, 1));

const compared = results.filter((r) => r.fields);
const failed = results.filter((r) => /^FAIL/.test(r.verdict));
say("");
say(`parity/engine: local engine ${engine.version} vs ${LIVE}`);
for (const r of results) {
  const what = r.differ?.length ? `  (${r.differ.map((d) => d.field).join(", ")})` : "";
  say(`  ${r.verdict.padEnd(46)} ${r.source}  tier ${r.tier}${r.fields ? `  ${r.fields} fields` : ""}${what}`);
}
say("");
const skipped = results.filter((r) => !r.fields && !/^FAIL/.test(r.verdict));
say(`${compared.length} live charts compared, ${failed.length} failing, ${skipped.length} not comparable (listed above, with why)`);
say(`details: ${file}`);
process.exit(failed.length ? 1 : compared.length ? 0 : 2);
