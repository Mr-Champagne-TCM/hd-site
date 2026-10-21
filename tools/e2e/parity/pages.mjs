#!/usr/bin/env node
/**
 * PARITY, PART 2: THE RIG'S PAGES SAY WHAT THE LIVE PAGES SAID.
 *
 * On 10/21 the live shop was bought from by made-up people and every page,
 * PDF and website page was captured word for word (hd-e2e\live-2026-10-21).
 * The rig drives the same people through the same code (main 9dbff6f, website
 * 494cc30). If the rig's words differ from the live words, the rig is not
 * testing what buyers see: it could hide a live error or invent one.
 *
 * Each live capture is paired with the rig page that stands for it (PAIRS
 * below) and compared line by line, after masking only what changes on every
 * run (links, ports, purchase dates). Every difference is either on the
 * KNOWN list, with its reason, or it fails. A live capture with no rig page is
 * listed as a gap, never skipped quietly.
 *
 *   node tools/e2e/parity/pages.mjs --run=<rig run folder> [--live=<capture folder>]
 *
 * Exit code 1 on any unexplained difference or gap.
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { HOME } from "../harness/paths.mjs";

const arg = (name, dflt = null) => {
  const a = process.argv.find((x) => x.startsWith(`--${name}=`));
  return a ? a.slice(a.indexOf("=") + 1) : dflt;
};
const say = (m) => process.stdout.write(m + "\n");
const J = (f) => JSON.parse(readFileSync(f, "utf8"));
const T = (f) => (existsSync(f) ? readFileSync(f, "utf8") : null);

const LIVE = arg("live", join(HOME, "live-2026-10-21"));
const RUN = arg("run");
if (!RUN || !existsSync(join(RUN, "manifest.json"))) {
  say("usage: node tools/e2e/parity/pages.mjs --run=<rig run folder> [--live=<capture folder>]");
  process.exit(2);
}

/** live capture -> the rig page standing for it. pdf: also compare its PDF. */
const PAIRS = [
  { live: "home", rig: "offer" },
  { live: "r1-summary", rig: "rowan-1-buy-t0" },
  { live: "r1-chart", rig: "rowan-2-upgrade-t1", pdf: true },
  { live: "r1-reading", rig: "rowan-3-upgrade-t2", pdf: true },
  { live: "r2-chart", rig: "maya-2-upgrade-t1", pdf: true },
  { live: "r2-reading", rig: "maya-3-upgrade-t2", pdf: true },
  { live: "r3-reading", rig: "theo-2-upgrade-t2", pdf: true },
  { live: "sage-chart", rig: "sage-1-buy-t1", pdf: true },
  { live: "quinn-summary", rig: "sage-2-someone-new-t0" },
  { live: "badlink", rig: "link-cut-short" },
  // Earlier links opened again once the chart had grown (live: the summary link after the chart
  // upgrade, the chart link after the reading upgrade; Theo's summary link after the reading).
  { live: "run1-oldlink", rig: "rowan-2-upgrade-t1-old1" },
  { live: "run1-oldchartlink", rig: "rowan-3-upgrade-t2-old2" },
  { live: "run2-oldlink", rig: "maya-2-upgrade-t1-old1" },
  { live: "run2-oldchartlink", rig: "maya-3-upgrade-t2-old2" },
  { live: "run3-oldlink", rig: "theo-2-upgrade-t2-old1" },
  { live: "jeremy", rig: null, why: "Jeremy's own reading: a real person, never driven by the rig", expected: true },
  // The website, crawled live vs served locally from the same commit.
  { live: "crawl:thechampagnemethod.co_readings", rig: "web-readings" },
  { live: "crawl:thechampagnemethod.co_readings_privacy", rig: "web-readings-privacy" },
  { live: "crawl:thechampagnemethod.co_library", rig: "web-library" },
  { live: "crawl:thechampagnemethod.co_library_human-design", rig: "web-library-human-design" },
  { live: "crawl:thechampagnemethod.co_library_bodygraph", rig: "web-library-bodygraph" },
  { live: "crawl:thechampagnemethod.co_tools", rig: "web-tools" },
  { live: "crawl:thechampagnemethod.co", rig: "web-home" },
  { live: "crawl:humandesign.thechampagnemethod.co_charts", rig: "my-charts" },
];

/**
 * Differences the rig makes on purpose, each with its reason. A line pair is
 * known when the live line matches `live` and the rig line matches `rig`
 * (either may be null: a line only one side has).
 */
const KNOWN = [];

const MONTHS = "January|February|March|April|May|June|July|August|September|October|November|December";
function mask(line) {
  return line
    .replace(/https?:\/\/127\.0\.0\.1:\d+/g, "<shop>")
    .replace(/https?:\/\/humandesign\.thechampagnemethod\.co/g, "<shop>")
    .replace(/\/(r|u)\/[A-Za-z0-9_.-]{20,}/g, "/$1/<link>")
    .replace(/[?&]t=[A-Za-z0-9_.%-]{20,}/g, "?t=<link>")
    .replace(new RegExp(`\\b(${MONTHS}) \\d{1,2}, 202\\d\\b`, "g"), "<date>")
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/ /g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
// PDF text keeps its "===== PAGE n =====" lines, so a page break that moves is a difference too.
const toLines = (text) => String(text ?? "").split(/\r?\n/).map(mask).filter(Boolean);

/** Line diff (longest common subsequence): what only live has, what only the rig has, in order. */
function diffLines(a, b) {
  const m = a.length;
  const n = b.length;
  const L = Array.from({ length: m + 1 }, () => new Uint32Array(n + 1));
  for (let i = m - 1; i >= 0; i--) for (let j = n - 1; j >= 0; j--) L[i][j] = a[i] === b[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
  const out = [];
  let i = 0;
  let j = 0;
  while (i < m && j < n) {
    if (a[i] === b[j]) {
      i++;
      j++;
    } else if (L[i + 1][j] >= L[i][j + 1]) out.push({ live: a[i++], rig: null });
    else out.push({ live: null, rig: b[j++] });
  }
  while (i < m) out.push({ live: a[i++], rig: null });
  while (j < n) out.push({ live: null, rig: b[j++] });
  // Pair a live-only line with the rig-only line right after it: one changed line, not two.
  const paired = [];
  for (let k = 0; k < out.length; k++) {
    const d = out[k];
    const nx = out[k + 1];
    if (d.live !== null && nx && nx.rig !== null && nx.live === null) {
      paired.push({ live: d.live, rig: nx.rig });
      k++;
    } else paired.push(d);
  }
  return paired;
}

const knownFor = (d) =>
  KNOWN.find((k) => (k.live === null ? d.live === null : d.live !== null && k.live.test(d.live)) && (k.rig === null ? d.rig === null : d.rig !== null && k.rig.test(d.rig)));

const m = J(join(RUN, "manifest.json"));
const pageById = new Map(m.pages.map((p) => [p.id, p]));
function liveText(id) {
  if (id.startsWith("crawl:")) return T(join(LIVE, "crawl", id.slice(6) + ".txt"));
  return T(join(LIVE, "cap", id + ".txt"));
}

const results = [];
function compare(name, liveRaw, rigRaw) {
  const diffs = diffLines(toLines(liveRaw), toLines(rigRaw)).map((d) => ({ ...d, known: knownFor(d)?.why ?? null }));
  const unexplained = diffs.filter((d) => !d.known);
  results.push({ name, lines: toLines(liveRaw).length, verdict: unexplained.length ? `FAIL: ${unexplained.length} line(s) differ` : diffs.length ? `match (${diffs.length} known)` : "match", diffs });
}

for (const p of PAIRS) {
  const live = liveText(p.live);
  if (live === null) {
    results.push({ name: p.live, verdict: "FAIL: live capture missing", diffs: [] });
    continue;
  }
  if (!p.rig) {
    results.push({ name: p.live, verdict: p.expected ? `not compared: ${p.why}` : `GAP: ${p.why}`, diffs: [] });
    continue;
  }
  const page = pageById.get(p.rig);
  if (!page) {
    results.push({ name: `${p.live} vs ${p.rig}`, verdict: "FAIL: the rig run has no such page", diffs: [] });
    continue;
  }
  compare(`${p.live} vs ${p.rig}`, live, T(join(RUN, page.text)));
  if (p.pdf) {
    const livePdf = T(join(LIVE, "cap", `${p.live}.pdf0.txt`));
    const rigPdf = page.pdf?.textFile && existsSync(page.pdf.textFile) ? J(page.pdf.textFile).map((t, i) => `===== PAGE ${i + 1} =====\n${t}`).join("\n") : null;
    if (livePdf === null || rigPdf === null) results.push({ name: `${p.live} PDF`, verdict: `FAIL: PDF text missing on the ${livePdf === null ? "live" : "rig"} side`, diffs: [] });
    else compare(`${p.live} PDF vs ${p.rig} PDF`, livePdf, rigPdf);
  }
}

// The website's sample PDFs: the live files, byte for byte, against the ones the rig read.
const sha = (f) => createHash("sha256").update(readFileSync(f)).digest("hex");
for (const s of m.samples ?? []) {
  const live = join(LIVE, "samples", basename(s.published));
  if (!existsSync(live)) results.push({ name: `sample ${s.published}`, verdict: "GAP: no live copy of this sample", diffs: [] });
  else if (!existsSync(s.file)) results.push({ name: `sample ${s.published}`, verdict: "FAIL: the rig did not read this sample", diffs: [] });
  else results.push({ name: `sample ${s.published}`, verdict: sha(live) === sha(s.file) ? "match (same bytes)" : "FAIL: the file differs from live", diffs: [] });
}

const outDir = join(HOME, "parity");
mkdirSync(outDir, { recursive: true });
const file = join(outDir, `pages-${basename(RUN)}.json`);
writeFileSync(file, JSON.stringify({ live: LIVE, run: RUN, results }, null, 1));

const bad = results.filter((r) => /^(FAIL|GAP)/.test(r.verdict));
say(`parity/pages: rig run ${basename(RUN)} vs ${basename(LIVE)}`);
for (const r of results) {
  say(`  ${r.verdict.padEnd(34)} ${r.name}`);
  for (const d of r.diffs.filter((d) => !d.known).slice(0, 6))
    say(d.live === d.rig ? `      a page break moved near: ${d.live}` : `      live: ${d.live ?? "(none)"}\n      rig:  ${d.rig ?? "(none)"}`);
}
say("");
say(`${results.filter((r) => /^match/.test(r.verdict)).length} match, ${results.filter((r) => /^FAIL/.test(r.verdict)).length} differ, ${results.filter((r) => /^GAP/.test(r.verdict)).length} gaps`);
say(`details: ${file}`);
process.exit(bad.length ? 1 : 0);
