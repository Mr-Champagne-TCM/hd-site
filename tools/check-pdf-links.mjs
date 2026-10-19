/**
 * Every link the client PDF can carry, checked against the LIVE sites.
 *
 *   node tools/check-pdf-links.mjs [--all]
 *
 * Renders the PDF for the four test charts (test/fixtures/phone-parity, with
 * a placeholder reading of the real structure), collects every link URI it
 * printed, and checks each one:
 *   - the page answers 200 (fetched without its #fragment, redirects followed)
 *   - a #fragment exists on that page: as an id in the prerendered HTML, or
 *     -- for the entries the library builds on arrival (its openHash:
 *     profile-<a>-<b>, channel-<a>-<b>, cross-<k>-<name>) -- as a handler in
 *     the page's own script (and, for a cross, its name in the library data).
 *     Opening each anchor in a real browser is the stronger check.
 * With --all it also checks every anchor the phone's engine can produce
 * (test/fixtures/phone-parity/phone-library-targets.txt), 179 of them.
 * With --pdf <file.pdf> (repeatable) it also checks every link printed in
 * that built PDF -- e.g. a rebuilt sample (fix 7's term links, 10/19).
 *
 * Reads the network; not part of `npm test`.
 */
import { readFileSync } from "node:fs";
import { readingPdf } from "../netlify/lib/readingPdf.mjs";
import { syntheticReading } from "../test/support/syntheticReading.mjs";

const DIR = new URL("../test/fixtures/phone-parity/", import.meta.url);
const SLUGS = ["claude-test-four", "claude-test-three", "claude-test-two", "claude-test"];

const uris = new Set();
for (const slug of SLUGS) {
  const output = JSON.parse(readFileSync(new URL(`${slug}.output.json`, DIR), "utf8"));
  const birth = { date: "1976-12-14", time: "18:18", timeKnown: true, place: "Chicago, Illinois", zone: "America/Chicago" };
  for (const tier of [1, 2]) {
    const r = await readingPdf({ tier, name: "Claude Test", output, reading: syntheticReading(output), birth, inspect: true });
    for (const l of r.links) uris.add(l.uri);
  }
}
for (let i = 0; i < process.argv.length; i++) {
  if (process.argv[i] !== "--pdf") continue;
  const raw = readFileSync(process.argv[i + 1]).toString("latin1");
  for (const m of raw.matchAll(/\/URI \(((?:\\.|[^\\)])*)\)/g)) uris.add(m[1].replace(/\\(.)/g, "$1"));
}
const fromPdf = new Set(uris);
if (process.argv.includes("--all")) {
  for (const u of readFileSync(new URL("phone-library-targets.txt", DIR), "utf8").split(/\r?\n/)) if (u) uris.add(u);
}

const pages = new Map();
async function page(url) {
  if (pages.has(url)) return pages.get(url);
  const res = await fetch(url, { redirect: "follow" });
  const html = res.ok ? await res.text() : "";
  let scripts = "";
  for (const m of html.matchAll(/<script[^>]+src="([^"]+)"/g)) {
    const s = await fetch(new URL(m[1], url));
    if (s.ok) scripts += await s.text();
  }
  const out = { status: res.status, html, scripts };
  pages.set(url, out);
  return out;
}

/** The library builds cross entries from its own data; the name must be in it. */
function crossNamed(scripts, frag) {
  const words = frag.replace(/^cross-[rlj]-/, "").split("-");
  const re = new RegExp(words.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("[^a-z0-9]+"), "i");
  return re.test(scripts);
}

let bad = 0;
for (const u of [...uris].sort()) {
  const [base, frag] = u.split("#");
  const p = await page(base);
  let ok = p.status === 200;
  let how = `${p.status}`;
  if (ok && frag) {
    if (p.html.includes(`id="${frag}"`)) how += " #id";
    else if (/^profile-[1-6]-[1-6]$/.test(frag) && p.scripts.includes("profile-([1-6])-([1-6])")) how += " #opened-on-arrival";
    else if (/^cross-[rlj]-/.test(frag) && p.scripts.includes("cross-([rlj])-(.+)") && crossNamed(p.scripts, frag)) how += " #opened-on-arrival";
    else if (/^channel-\d+-\d+$/.test(frag) && p.scripts.includes("channel-(\\d+)-(\\d+)")) how += " #opened-on-arrival";
    else if (/^gate-(\d+)$/.test(frag) && +frag.slice(5) >= 1 && +frag.slice(5) <= 64 && p.scripts.includes("gate-(\\d+)")) how += " #opened-on-arrival";
    else {
      ok = false;
      how += " #MISSING";
    }
  }
  if (!ok) bad += 1;
  if (!ok || fromPdf.has(u)) console.log(`${ok ? "ok  " : "FAIL"} ${how.padEnd(22)} ${u}${fromPdf.has(u) ? "" : "  (phone target)"}`);
}
console.log(`\n${uris.size} links checked (${fromPdf.size} printed in the test PDFs), ${bad} failed`);
process.exit(bad ? 1 : 0);
