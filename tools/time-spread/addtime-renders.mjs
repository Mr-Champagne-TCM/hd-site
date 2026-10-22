#!/usr/bin/env node
/**
 * REVIEW RENDERS FOR "ADD YOUR BIRTH TIME" (10/22): every screen, email and
 * PDF state of the self-serve flow, from real records made through the real
 * chart request on the local rig (tools/e2e/harness), at 1280 and 390 px with
 * device scale 2 (so every crop reads at 2x). Made-up people only:
 *
 *   ari-t1    unknown time, chart: the PDF's link (/t/<key>), the engine down
 *             once (the calm error), then added; used from both ways in
 *   remy-t2   unknown time, reading: before (Start here and margin tags), the
 *             form on the page, added, the reading written again, used
 *   theo-t0   unknown time, summary: the form on the page, added, used
 *   rowan-t1  a known time: "already has its birth time", both ways in
 *   pend-t1   paid, not cast yet: the PDF key's page
 *   old-t1    a chart from before birth details were kept: "can't be added here"
 *   gone      a key for a chart no longer kept; a key that is not one
 *
 *   node tools/time-spread/addtime-renders.mjs --out=<folder outside the repo>
 *
 * Needs `npm run build` first (the page is served from dist/), Java, uv. The
 * engine is HD_WORKSPACE's hd-engine (0.6.0). Its answers are cached under a
 * data home of the renders' own (<out>/data); nothing reaches any outside
 * service. (<out>/data/fixtures is a JUNCTION: `cmd /c rmdir` it before
 * deleting the folder.)
 */
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, symlinkSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, "..", "..");
const arg = (k, d) => (process.argv.find((a) => a.startsWith(`--${k}=`)) ?? `--${k}=${d}`).split("=").slice(1).join("=");
const OUT = resolve(arg("out", ""));
if (!arg("out", "")) throw new Error("--out=<folder> is needed (outside the repo: renders hold bodygraphs)");
mkdirSync(OUT, { recursive: true });

const realHome = process.env.HD_E2E_HOME ? resolve(process.env.HD_E2E_HOME) : join(resolve(REPO, ".."), "..", "hd-e2e");
const home = join(OUT, "data");
mkdirSync(home, { recursive: true });
const fixtures = join(home, "fixtures");
if (!existsSync(fixtures)) symlinkSync(join(realHome, "fixtures"), fixtures, "junction");
process.env.HD_E2E_HOME = home;

const { startRig } = await import(pathToFileURL(join(REPO, "tools", "e2e", "harness", "server.mjs")).href);
const runDir = join(home, "run");
const rig = await startRig({ runDir, fixturesDir: fixtures, engineMode: "local", log: (m) => console.error(m) });
const { getStore } = await import("@netlify/blobs");
const { fillReading, loadReading, mintReadingLink, saveReading } = await import(pathToFileURL(join(REPO, "netlify", "lib", "reading.mjs")).href);
const { mintAddTimeKey } = await import(pathToFileURL(join(REPO, "netlify", "lib", "addTime.mjs")).href);

const ARI = { date: "1987-04-19", time: null, zone: "America/Chicago", place: "Fargo, North Dakota", name: "Ari Testwell" };
const REMY = { date: "1983-01-27", time: null, zone: "America/New_York", place: "Savannah, Georgia", name: "Remy Testwell" };
const THEO = { date: "2001-12-05", time: null, zone: "America/Los_Angeles", place: "Spokane, Washington", name: "Theo Testwell" };
const ROWAN = { date: "1990-02-11", time: "06:25", zone: "America/Denver", place: "Albuquerque, New Mexico", name: "Rowan Testwell" };
const CASES = [
  { id: "ari-t1", tier: 1, ...ARI, add: "07:30", via: "pdf", engineDownFirst: true },
  { id: "remy-t2", tier: 2, ...REMY, add: "22:50", via: "page" },
  { id: "theo-t0", tier: 0, ...THEO, add: "15:10", via: "page" },
  { id: "rowan-t1", tier: 1, ...ROWAN },
];

const readings = getStore({ name: "readings", consistency: "strong" });
const manifest = { origin: rig.origin, outbox: join(runDir, "outbox"), cases: [], keys: {} };
const idle = async () => {
  for (let i = 0; i < 60; i++) if ((await fetch(`${rig.origin}/__rig/idle`).then((r) => r.json())).idle) break;
};

try {
  for (const c of CASES) {
    const id = await saveReading(readings, { tier: c.tier, output: null, name: c.name, email: "rig-buyer@example.com", sku: ["hd_summary", "hd_chart", "hd_reading"][c.tier], purchasedAt: Date.now() });
    const token = mintReadingLink({ id, tier: c.tier, ttlSeconds: 6 * 86400 }, process.env.GRANT_SECRET);
    const birth = { date: c.date, zone: c.zone, place: c.place, name: c.name, ...(c.time ? { time: c.time, timeKnown: true } : { timeKnown: false }) };
    const res = await fetch(`${rig.origin}/api/chart`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-nf-client-connection-ip": `198.51.100.${manifest.cases.length + 60}` },
      body: JSON.stringify({ reading: token, birth }),
    });
    if (!res.ok) throw new Error(`${c.id}: chart ${res.status} ${(await res.text()).slice(0, 300)}`);
    await idle();
    let pdf = null;
    if (c.tier >= 1) {
      const r = await fetch(`${rig.origin}/api/pdf?t=${encodeURIComponent(token)}`);
      if (!r.ok) throw new Error(`${c.id}: pdf ${r.status}`);
      pdf = join(OUT, `${c.id}-before.pdf`);
      writeFileSync(pdf, Buffer.from(await r.arrayBuffer()));
    }
    manifest.cases.push({ ...c, recordId: id, token, key: mintAddTimeKey(id, process.env.GRANT_SECRET), pdf });
    console.error(`${c.id}: cast`);
  }

  // Paid, not cast yet: the PDF key's page says the chart is still to be made.
  const pend = await saveReading(readings, { tier: 1, output: null, name: "Pat Testwell", email: "rig-buyer@example.com", sku: "hd_chart", purchasedAt: Date.now() });
  manifest.keys.pending = mintAddTimeKey(pend, process.env.GRANT_SECRET);
  // A chart from before birth details were kept (16 Oct): the time cannot be added on a page.
  const rowan = await loadReading(readings, manifest.cases.find((c) => c.id === "rowan-t1").recordId, Date.now());
  const old = await saveReading(readings, { tier: 1, output: null, name: null, email: "rig-buyer@example.com", sku: "hd_chart", purchasedAt: Date.now() });
  await fillReading(readings, old, { ...rowan.output, timeKnown: false }, Date.now());
  manifest.keys.none = mintAddTimeKey(old, process.env.GRANT_SECRET);
  manifest.oldToken = mintReadingLink({ id: old, tier: 1, ttlSeconds: 6 * 86400 }, process.env.GRANT_SECRET);
  // A key for a chart no longer kept (signed, but its record is gone), and one that is not a key at all.
  manifest.keys.gone = mintAddTimeKey(randomBytes(16).toString("hex"), process.env.GRANT_SECRET);
  manifest.keys.bad = "not-a-key";
  writeFileSync(join(OUT, "manifest.json"), JSON.stringify(manifest, null, 1));

  // Not spawnSync: the shop is served from THIS process, and must keep answering while Chrome reads it.
  const py = spawn(
    "uv",
    ["run", "--quiet", "--with", "playwright", "--with", "pypdf", "--with", "pypdfium2", "--with", "pillow", "python", "-I", join(HERE, "addtime-renders.py"), join(OUT, "manifest.json"), OUT],
    { stdio: "inherit" },
  );
  const code = await new Promise((r) => py.on("exit", r));
  if (code !== 0) throw new Error(`addtime-renders.py exited ${code}`);
} finally {
  await rig.stop();
}
