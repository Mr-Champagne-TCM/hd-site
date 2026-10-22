#!/usr/bin/env node
/**
 * REVIEW RENDERS for the release (10/22 build): real records made through the
 * real chart request on the local rig (tools/e2e/harness), then the real page
 * at 1280 and 390 px (device scale 2, so every crop can be read at 2x), its
 * text, and the real PDF, page by page. Made-up people only:
 *
 *   rowan-t0/t1/t2   a KNOWN birth time, summary, chart and reading
 *   theo-t0/t1/t2    an UNKNOWN birth time, summary, chart and reading
 *   six-t1           a known time with six channels (the chart PDF's page 2 is fullest)
 *   nia-t1           unknown time, the hardest edge (noon sits by a Type change)
 *
 *   node tools/time-spread/renders.mjs --out=<folder outside the repo>
 *
 * Needs `npm run build` first (the page is served from dist/), Java, uv. The
 * engine is the one HD_WORKSPACE's hd-engine builds (engine 0.6.0 answers
 * /v1/spread; an older one leaves unknown-time charts with the engine's note).
 * Its answers are cached under a data home of the renders' own (<out>/data);
 * nothing reaches any outside service.
 */
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, symlinkSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, "..", "..");
const arg = (k, d) => (process.argv.find((a) => a.startsWith(`--${k}=`)) ?? `--${k}=${d}`).split("=").slice(1).join("=");
const OUT = resolve(arg("out", ""));
if (!arg("out", "")) throw new Error("--out=<folder> is needed (outside the repo: renders hold bodygraphs)");
mkdirSync(OUT, { recursive: true });

// The renders' own data home: the rig's stored readings (read only, a junction), its own engine cache.
// (A junction: remove it with `cmd /c rmdir <out>\data\fixtures` before deleting the folder.)
const realHome = process.env.HD_E2E_HOME ? resolve(process.env.HD_E2E_HOME) : join(resolve(REPO, ".."), "..", "hd-e2e");
const home = join(OUT, "data");
mkdirSync(home, { recursive: true });
const fixtures = join(home, "fixtures");
if (!existsSync(fixtures)) symlinkSync(join(realHome, "fixtures"), fixtures, "junction");
process.env.HD_E2E_HOME = home;

const { startRig } = await import(pathToFileURL(join(REPO, "tools", "e2e", "harness", "server.mjs")).href);
const rig = await startRig({ runDir: join(home, "run"), fixturesDir: fixtures, engineMode: "local", log: (m) => console.error(m) });
const { getStore } = await import("@netlify/blobs");
const { saveReading, mintReadingLink } = await import(pathToFileURL(join(REPO, "netlify", "lib", "reading.mjs")).href);
const T = await import(pathToFileURL(join(REPO, "shared", "timeSpread.mjs")).href);

const ROWAN = { date: "1990-02-11", time: "06:25", zone: "America/Denver", place: "Albuquerque, New Mexico", name: "Rowan Testwell" };
const THEO = { date: "2001-12-05", time: null, zone: "America/Los_Angeles", place: "Spokane, Washington", name: "Theo Testwell" };
const CASES = [
  ...[0, 1, 2].map((tier) => ({ id: `rowan-t${tier}`, tier, ...ROWAN })),
  ...[0, 1, 2].map((tier) => ({ id: `theo-t${tier}`, tier, ...THEO })),
  { id: "six-t1", tier: 1, date: "1961-09-03", time: "08:09", zone: "America/Los_Angeles", place: "Reno, Nevada", name: "Six Testwell" },
  { id: "nia-t1", tier: 1, date: "1979-08-30", time: null, zone: "America/New_York", place: "New York, New York", name: "Nia Testwell" },
];

const readings = getStore({ name: "readings", consistency: "strong" });
const manifest = { origin: rig.origin, engine: rig.engine?.version ?? null, cases: [] };
try {
  for (const c of CASES) {
    const id = await saveReading(readings, {
      tier: c.tier,
      output: null,
      name: c.name,
      email: "rig-buyer@example.com",
      sku: ["hd_summary", "hd_chart", "hd_reading"][c.tier],
      purchasedAt: Date.now(),
    });
    const token = mintReadingLink({ id, tier: c.tier, ttlSeconds: 6 * 86400 }, process.env.GRANT_SECRET);
    const birth = { date: c.date, zone: c.zone, place: c.place, name: c.name, ...(c.time ? { time: c.time, timeKnown: true } : { timeKnown: false }) };
    const res = await fetch(`${rig.origin}/api/chart`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-nf-client-connection-ip": `198.51.100.${manifest.cases.length + 40}` },
      body: JSON.stringify({ reading: token, birth }),
    });
    const out = await res.json();
    if (!res.ok) throw new Error(`${c.id}: chart ${res.status} ${JSON.stringify(out).slice(0, 300)}`);
    // The reading tier's words are written in the background; wait for the rig to go quiet.
    for (let i = 0; i < 60; i++) {
      const idle = await fetch(`${rig.origin}/__rig/idle`).then((r) => r.json());
      if (idle.idle) break;
    }
    let pdf = null;
    if (c.tier >= 1) {
      const r = await fetch(`${rig.origin}/api/pdf?t=${encodeURIComponent(token)}`);
      if (!r.ok) throw new Error(`${c.id}: pdf ${r.status}`);
      pdf = join(OUT, `${c.id}.pdf`);
      writeFileSync(pdf, Buffer.from(await r.arrayBuffer()));
    }
    const s = T.usableSpread(out);
    manifest.cases.push({ ...c, token, pdf, spread: s ? { window: s.window, changes: s.changes, line: T.holdsLine(s).text } : null });
    console.error(`${c.id}: ${s ? `spread window ${s.window}, changes ${s.changes.join(",")}` : c.time ? "known time" : "NO SPREAD (engine without /v1/spread?)"}`);
  }
  writeFileSync(join(OUT, "manifest.json"), JSON.stringify(manifest, null, 1));

  // Not spawnSync: the shop is served from THIS process, and must keep answering while Chrome reads it.
  const py = spawn(
    "uv",
    ["run", "--quiet", "--with", "playwright", "--with", "pypdf", "--with", "pypdfium2", "--with", "pillow", "python", "-I", join(HERE, "renders.py"), join(OUT, "manifest.json"), OUT],
    { stdio: "inherit" },
  );
  const code = await new Promise((r) => py.on("exit", r));
  if (code !== 0) throw new Error(`renders.py exited ${code}`);
} finally {
  await rig.stop();
}
