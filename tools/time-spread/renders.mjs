#!/usr/bin/env node
/**
 * THE MOCK'S RENDERS (mock TIME, Jeremy 10/22): real records made through the
 * real chart request on the local rig (tools/e2e/harness), then the real page
 * at 1280 and 390, the real PDF, and the phone screen drawn for the mock.
 *
 *   node tools/time-spread/renders.mjs --out=<folder outside the repo> [--calm=<find-calm json>]
 *
 * Needs `npm run build` first (the page is served from dist/), Java, uv.
 * The engine's answers are cached under a data home of the mock's own
 * (<out>/data), never the rig's, and nothing reaches any outside service.
 */
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, "..", "..");
const arg = (k, d) => (process.argv.find((a) => a.startsWith(`--${k}=`)) ?? `--${k}=${d}`).split("=").slice(1).join("=");
const OUT = resolve(arg("out", ""));
if (!arg("out", "")) throw new Error("--out=<folder> is needed (outside the repo: renders hold bodygraphs)");
mkdirSync(OUT, { recursive: true });

// The mock's own data home: the rig's stored readings (read only), its own engine cache.
const realHome = join(resolve(REPO, ".."), "..", "hd-e2e");
const home = join(OUT, "data");
mkdirSync(home, { recursive: true });
const fixtures = join(home, "fixtures");
if (!existsSync(fixtures)) symlinkSync(join(realHome, "fixtures"), fixtures, "junction");
process.env.HD_E2E_HOME = home;
process.env.HD_FIX = "TIME";

const { startRig } = await import(pathToFileURL(join(REPO, "tools", "e2e", "harness", "server.mjs")).href);
const rig = await startRig({ runDir: join(home, "run"), fixturesDir: fixtures, engineMode: "local", log: (m) => console.error(m) });
const { getStore } = await import("@netlify/blobs");
const { saveReading, mintReadingLink } = await import(pathToFileURL(join(REPO, "netlify", "lib", "reading.mjs")).href);
const T = await import(pathToFileURL(join(REPO, "shared", "timeSpread.mjs")).href);

const calm = arg("calm", "") ? JSON.parse(readFileSync(arg("calm", ""), "utf8")).calmest[0] : null;
const CASES = [
  { id: "a-theo", tier: 2, date: "2001-12-05", zone: "America/Los_Angeles", place: "Spokane, Washington", name: "Theo Testwell", buyer: "Theo Testwell" },
  { id: "b-ny", tier: 1, date: "1979-08-30", zone: "America/New_York", place: "New York, New York", name: "Nia Testwell", buyer: "Nia Testwell" },
  ...(calm ? [{ id: "c-calmest", tier: 1, date: calm.date, zone: calm.zone, place: calm.zone === "America/Los_Angeles" ? "Los Angeles, California" : calm.zone.split("/").pop().replace(/_/g, " "), name: "Cal Testwell", buyer: "Cal Testwell" }] : []),
  { id: "d-boise-gift", tier: 1, date: "1966-04-02", zone: "America/Boise", place: "Boise, Idaho", name: null, buyer: "Emery Testwell", gift: true },
];

const readings = getStore({ name: "readings", consistency: "strong" });
const manifest = { origin: rig.origin, cases: [] };
try {
  for (const c of CASES) {
    const id = await saveReading(readings, {
      tier: c.tier,
      output: null,
      name: c.buyer,
      email: "rig-buyer@example.com",
      sku: ["hd_summary", "hd_chart", "hd_reading"][c.tier],
      purchasedAt: Date.now(),
      ...(c.gift ? { fresh: true } : {}),
    });
    const token = mintReadingLink({ id, tier: c.tier, ttlSeconds: 6 * 86400 }, process.env.GRANT_SECRET);
    const t0 = Date.now();
    const res = await fetch(`${rig.origin}/api/chart`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-nf-client-connection-ip": `198.51.100.${manifest.cases.length + 20}` },
      body: JSON.stringify({ reading: token, birth: { date: c.date, zone: c.zone, place: c.place, timeKnown: false, ...(c.name ? { name: c.name } : {}) } }),
    });
    const out = await res.json();
    if (!res.ok || !out.timeSpread) throw new Error(`${c.id}: chart ${res.status} ${JSON.stringify(out).slice(0, 300)}`);
    const ms = Date.now() - t0;
    await fetch(`${rig.origin}/__rig/idle`).then((r) => r.json());
    const s = out.timeSpread;
    const pdfs = {};
    for (const [variant, flags] of [["rows", "TIME"], ["bar", "TIME,TIMEBAR"], ["offerB", "TIME,TIMEOFFERB"]]) {
      if (variant === "offerB" && c.id !== "a-theo") continue;
      process.env.HD_FIX = flags;
      const r = await fetch(`${rig.origin}/api/pdf?t=${encodeURIComponent(token)}`);
      if (!r.ok) throw new Error(`${c.id}: pdf ${r.status}`);
      const f = join(OUT, `${c.id}-pdf-${variant}.pdf`);
      writeFileSync(f, Buffer.from(await r.arrayBuffer()));
      pdfs[variant] = f;
    }
    process.env.HD_FIX = "TIME";
    manifest.cases.push({ ...c, recordId: id, token, chartMs: ms, spread: s, line: T.holdsLine(s).text, pdfs, output: out });
    console.error(`${c.id}: chart + spread in ${ms} ms (${s.casts} casts), window ${s.window}, changes ${s.changes.join(",")}`);
  }

  // The "same all day" design, which no real birth day can show (the Sun crosses a Profile line every day):
  // the calmest real chart, with a made-up spread in which nothing changes. Labelled as made up.
  {
    const base = manifest.cases.find((x) => x.id === "c-calmest") ?? manifest.cases[1];
    const madeUp = { ...base.spread, changes: [], segments: {}, window: [0, base.spread.minutes - 1], gates: "change" };
    const output = { ...base.output, timeSpread: madeUp };
    const id = await saveReading(readings, { tier: 1, output, name: "Same Testwell", email: "rig-buyer@example.com", sku: "hd_chart", purchasedAt: Date.now(), birth: { date: base.date, zone: base.zone, place: base.place, timeKnown: false, name: "Same Testwell" } });
    const token = mintReadingLink({ id, tier: 1, ttlSeconds: 6 * 86400 }, process.env.GRANT_SECRET);
    const r = await fetch(`${rig.origin}/api/pdf?t=${encodeURIComponent(token)}`);
    const f = join(OUT, "c2-MADE-UP-same-all-day-pdf-rows.pdf");
    writeFileSync(f, Buffer.from(await r.arrayBuffer()));
    manifest.cases.push({ id: "c2-MADE-UP-same-all-day", tier: 1, token, spread: madeUp, line: T.holdsLine(madeUp).text, pdfs: { rows: f }, output, madeUp: true });
  }

  // The phone screen, drawn for the mock (the phone app's ChartPane, Theme.kt colors).
  for (const c of manifest.cases) {
    for (const rows of [true, false]) {
      const html = phoneMock(c, rows);
      const f = join(OUT, `${c.id}-phone-mock-${rows ? "rows" : "bar"}.html`);
      writeFileSync(f, html);
      (c.phone ??= {})[rows ? "rows" : "bar"] = f;
    }
  }
  writeFileSync(join(OUT, "manifest.json"), JSON.stringify({ ...manifest, cases: manifest.cases.map(({ output, ...c }) => c) }, null, 1));

  // Not spawnSync: the shop is served from THIS process, and must keep answering while Chrome reads it.
  const py = spawn(
    "uv",
    ["run", "--quiet", "--with", "playwright", "--with", "pypdfium2", "--with", "pillow", "python", "-I", join(HERE, "renders.py"), join(OUT, "manifest.json"), OUT],
    { stdio: "inherit" },
  );
  const code = await new Promise((r) => py.on("exit", r));
  if (code !== 0) throw new Error(`renders.py exited ${code}`);
} finally {
  await rig.stop();
}

/* --------------------------------------------------------- the phone mock */

function phoneMock(c, rows) {
  const o = c.output;
  const s = c.spread;
  const marked = T.markedFields({ ...o, timeSpread: s });
  const esc = (x) => String(x ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;");
  const tag = `<span class="tag">PROVISIONAL</span>`;
  const line = T.holdsLine(s).parts.map((p) => (p.tag ? tag : esc(p.t))).join("");
  const row = (label, value, field) =>
    `<div class="row"><div class="lab">${esc(label)}${marked.has(field) ? ` ${tag}` : ""}</div><div class="val">${esc(value)}</div></div>`;
  const section = (title, body, field) => `<div class="sec">${esc(title)}${marked.has(field) ? ` ${tag}` : ""}</div><div class="body">${body}</div>`;
  const list = (v, none = "None") => (Array.isArray(v) && v.length ? esc(v.join(", ")) : none);
  const svg = T.spreadSvg(s, { width: 358, rows, palette: "phone", font: "Roboto, sans-serif", size: 11 }).svg;
  const offer = T.offerLine(c.tier, "A");
  const drawing = typeof o.bodygraphSvg === "string" ? o.bodygraphSvg : "";
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=390">
<link href="https://fonts.googleapis.com/css2?family=Roboto:wght@400;500;700&display=swap" rel="stylesheet">
<style>
body{margin:0;background:#0E1A2B;color:#F2EFE9;font-family:Roboto,sans-serif;width:390px}
.mock{background:#C9A227;color:#0E1A2B;font:700 11px Roboto;letter-spacing:.12em;text-transform:uppercase;padding:6px 16px}
.pane{padding:14px 16px 28px}
.card{border:1px solid #24384F;border-radius:6px;background:#0E1A2B;padding:6px;margin-bottom:18px}
.card svg{width:100%;height:auto;display:block}
.note{font-size:13px;line-height:19px;color:#F2EFE9;margin:0 0 4px}
.tag{color:#D9B443;font-weight:700;font-size:10px;letter-spacing:.14em}
.offer{font-size:12px;line-height:17px;color:#9FB0C4;margin:8px 0 16px}
.offer a{color:#D9B443}
.row{display:flex;padding:5px 0;font-size:14px}
.lab{width:140px;padding-right:10px;color:#9FB0C4}
.val{flex:1;font-weight:500}
.sec{color:#C9A227;font-size:14px;font-weight:500;margin-top:18px;margin-bottom:6px}
.body{font-size:14px}
</style></head><body>
<div class="mock">Drawn for the mock · not the built phone app</div>
<div class="pane">
<div class="card">${drawing}</div>
<p class="note">${line}</p>
${svg}
<p class="offer">${esc(offer.before)}<a>${esc(offer.link)}</a>${esc(offer.after)}</p>
${row("Type", o.type, "type")}
${row("Strategy", o.strategy, "strategy")}
${row("Authority", o.authority, "authority")}
${row("Profile", o.profile, "profile")}
${row("Definition", o.definition, "definition")}
${row("When it's on track", `The feeling is ${String(o.signature).toLowerCase()}`, "signature")}
${row("When it's off track", `The feeling is ${String(o.notSelfTheme).toLowerCase()}`, "notSelfTheme")}
${row("Cross", o.incarnationCross, "incarnationCross")}
${section(`Defined centers (${(o.definedCenters ?? []).length})`, list(o.definedCenters, "None - Reflector"), "definedCenters")}
${section(`Undefined centers (${(o.undefinedCenters ?? []).length})`, list(o.undefinedCenters), "undefinedCenters")}
${section(`Open centers (${(o.openCenters ?? []).length})`, list(o.openCenters), "openCenters")}
${section(`Channels (${(o.channels ?? []).length})`, (o.channels ?? []).map(esc).join("<br>") || "None", "channels")}
${Array.isArray(o.personality) ? `<div class="sec">▸ Technical values: your 26 planet numbers <span style="color:#9FB0C4;font-weight:400">(for the curious)</span> ${tag}</div>` : ""}
${Array.isArray(o.activatedGates) ? section(`Gates (${o.activatedGates.length})`, esc(o.activatedGates.join(", ")), "gates") : ""}
</div></body></html>`;
}
