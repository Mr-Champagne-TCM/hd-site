/**
 * Everything one run captured, loaded once for the checks: page states, the
 * API answers they were drawn from, PDFs (text per page, fill, links),
 * emails, Stripe sessions, the engine's full tier-2 answer for every birth
 * ("truth"), the website pages and sample PDFs, and the source text of the
 * shop and website (to tell static copy from AI or data).
 */
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { extname, join } from "node:path";
import { E2E, REPO, SIBLINGS } from "../harness/paths.mjs";

const J = (f) => JSON.parse(readFileSync(f, "utf8"));
const T = (f) => (existsSync(f) ? readFileSync(f, "utf8") : "");

/** The same normalisation verbatim.mjs used on 10/21: quotes, dashes, spaces. */
export const norm = (s) =>
  String(s ?? "")
    .replace(/&apos;|&#39;|&rsquo;|&lsquo;|\\u2019|\\u2018/g, "'")
    .replace(/&quot;|&ldquo;|&rdquo;|\\u201c|\\u201d/g, '"')
    .replace(/&mdash;|\\u2014/g, "—")
    .replace(/&ndash;|\\u2013/g, "–")
    .replace(/&amp;/g, "&")
    .replace(/&nbsp;|\\u00a0| /g, " ")
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/\\'/g, "'")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();

const SRC_EXT = new Set([".ts", ".tsx", ".mjs", ".js", ".html", ".json", ".md", ".txt"]);
const SKIP = new Set(["node_modules", ".git", "dist", "docs", "build", "test", "tests", "fixtures", "e2e", ".netlify", "tmp"]);
function walk(dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    if (SKIP.has(name)) continue;
    const p = join(dir, name);
    const s = statSync(p);
    if (s.isDirectory()) walk(p, out);
    else if (SRC_EXT.has(extname(name)) && s.size < 2_000_000) out.push(p);
  }
  return out;
}

let corpusCache = null;
/** Shop + website source, normalised (JSX and "a" + "b" joins collapsed). */
export function sourceCorpus() {
  if (corpusCache) return corpusCache;
  let c = "";
  for (const root of [join(REPO, "src"), join(REPO, "shared"), join(REPO, "netlify"), join(SIBLINGS.website, "src"), join(SIBLINGS.website, "readings")]) {
    for (const f of walk(root)) {
      const raw = readFileSync(f, "utf8").replace(/["'`]\s*\+\s*["'`]/g, "").replace(/\{" "\}/g, " ");
      c += "\n" + norm(raw);
    }
  }
  corpusCache = c;
  return c;
}
/** Is this sentence copy written in the source (true), or data / AI (false)? */
export function inSource(sentence) {
  const n = norm(sentence);
  return n.length >= 8 && sourceCorpus().includes(n);
}

export function loadRun(runDir) {
  const m = J(join(runDir, "manifest.json"));
  const rig = existsSync(join(runDir, "rig.json")) ? J(join(runDir, "rig.json")) : {};
  // The journeys this run was driven with. A run that saved its own copy is
  // re-checked against that, not against today's combos.json (which may have
  // grown a step since, and would read as "stopped after 2 of 3 steps").
  const combos = J(existsSync(join(runDir, "combos.json")) ? join(runDir, "combos.json") : join(E2E, "combos.json"));
  const pages = m.pages.map((p) => {
    const text = T(join(runDir, p.text));
    const links = existsSync(join(runDir, p.links)) ? J(join(runDir, p.links)) : [];
    const api = p.api && existsSync(join(runDir, p.api)) ? J(join(runDir, p.api)) : null;
    const session = p.session && existsSync(join(runDir, p.session)) ? J(join(runDir, p.session)) : null;
    let pdf = null;
    if (p.pdf?.textFile && existsSync(p.pdf.textFile)) {
      pdf = { ...p.pdf, pageText: J(p.pdf.textFile), links: J(p.pdf.linksFile) };
    } else if (p.pdf) pdf = { ...p.pdf, pageText: [], links: [] };
    return { ...p, text, linksList: links, apiBody: api, sessionBody: session, pdfData: pdf };
  });
  const emails = [];
  const seen = new Set();
  const addMail = (e, ctx) => {
    if (!e?.file || seen.has(e.file)) return;
    seen.add(e.file);
    emails.push({ ...e, ...ctx, text: T(e.file + ".txt"), html: T(e.file + ".html") });
  };
  for (const j of m.journeys) for (const s of j.steps) for (const e of s.emails ?? []) addMail(e, { journey: j.id, step: s.id, tier: s.tier, do: s.do, fresh: s.do === "someone-new" });
  for (const e of m.freshLinkEmails ?? []) addMail(e, { journey: "extras", step: "link-expired", kind: "fresh-link" });
  for (const e of m.myChartsEmails ?? []) addMail(e, { journey: "extras", step: "my-charts", kind: "my-charts" });
  // Anything else the outbox holds (alerts to Jeremy, mostly).
  const ob = join(runDir, "outbox");
  if (existsSync(ob)) for (const f of readdirSync(ob).filter((f) => f.endsWith(".json")).sort()) addMail(J(join(ob, f)), { journey: "other", step: "other" });

  const truth = [];
  const td = join(runDir, "truth");
  if (existsSync(td)) for (const f of readdirSync(td)) truth.push({ key: f.replace(/\.json$/, ""), chart: J(join(td, f)) });

  return { runDir, manifest: m, rig, combos, pages, emails, truth, samples: (m.samples ?? []).map((s) => ({ ...s, pageText: existsSync(s.textFile) ? J(s.textFile) : [] })), links: m.links ?? [] };
}

/** The engine's full answer for the chart a page shows (matched on its own values). */
export function truthFor(run, output) {
  if (!output) return null;
  const sig = (o) => [o.type, o.profile, o.incarnationCross, [...(o.definedCenters ?? [])].sort().join(","), o.timeKnown].join("|");
  const want = sig(output);
  return run.truth.find((t) => sig(t.chart) === want)?.chart ?? null;
}

/** "LABEL\nvalue" rows in captured page text (the glance and value tables). */
export function rows(text) {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const out = {};
  const LABELS = ["TYPE", "STRATEGY", "AUTHORITY", "PROFILE", "WHEN IT'S ON TRACK", "WHEN IT'S OFF TRACK", "DEFINITION", "INCARNATION CROSS", "DEFINED CENTERS", "UNDEFINED CENTERS", "OPEN CENTERS", "CHANNELS"];
  for (let i = 0; i < lines.length - 1; i++) {
    const l = lines[i].replace(/’/g, "'");
    if (LABELS.includes(l) && !(l in out)) out[l] = lines[i + 1];
  }
  return out;
}

/**
 * A value that runs over several lines: CHANNELS prints one channel a line,
 * and a PROVISIONAL mark may follow the last one. rows() keeps only the first.
 */
export function block(text, label) {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const at = lines.findIndex((l) => l.replace(/’/g, "'") === label);
  if (at < 0 || at === lines.length - 1) return null;
  const out = [lines[at + 1]];
  for (let i = at + 2; i < lines.length && /^(?:\d{1,2}-\d{1,2}\b|PROVISIONAL$)/i.test(lines[i]); i++) out.push(lines[i]);
  return out.join("\n");
}

export const sentences = (text) =>
  String(text ?? "")
    .replace(/\s+/g, " ")
    .split(/(?<=[.!?])\s+(?=[A-Z“"(])/)
    .map((s) => s.trim())
    .filter(Boolean);

export function editDistance(a, b) {
  const m = a.length;
  const n = b.length;
  const d = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)]);
  for (let j = 1; j <= n; j++) d[0][j] = j;
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[m][n];
}
