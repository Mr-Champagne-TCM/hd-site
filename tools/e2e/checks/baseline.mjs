/**
 * "CHANGED WORDS SINCE LAST RELEASE": every captured page, PDF page and email
 * reduced to its lines, with what changes on every run masked out (links,
 * ports, ids, today's date), and compared with the baseline saved after the
 * last release. Jeremy reads this list instead of reading everything.
 *
 * Save a baseline (after a release is live and read):  run.mjs --update-baseline
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { loadRun } from "./load.mjs";

const MONTHS = "January|February|March|April|May|June|July|August|September|October|November|December";
const today = () => {
  const d = new Date();
  return `${d.toLocaleString("en-US", { month: "long" })} ${d.getDate()}, ${d.getFullYear()}`;
};

function mask(line) {
  return line
    .replace(/https?:\/\/127\.0\.0\.1:\d+/g, "<shop>")
    .replace(/\/(r|u)\/[A-Za-z0-9_.-]{20,}/g, "/$1/<link>")
    .replace(/[?&]t=[A-Za-z0-9_.%-]{20,}/g, "?t=<link>")
    .replace(/cs_test_rig[0-9a-f]+/g, "<session>")
    .replace(/\b[0-9a-f]{32}\b/g, "<id>")
    .replace(new RegExp(today().replace(/ /g, "\\s"), "g"), "<today>")
    .replace(new RegExp(`(Date:\\s*)(${MONTHS}) \\d{1,2}, \\d{4}`, "g"), "$1<date>")
    .replace(/\s+/g, " ")
    .trim();
}

/** A stable name for each document, the same from run to run. */
function keyOf(d) {
  if (d.kind === "email") return `email ${d.email.step ?? d.email.kind} | ${mask(d.email.subject)}`;
  if (d.kind === "pdf") return `pdf ${d.page.id} p${d.pdfPage}`;
  if (d.kind === "sample") return `sample ${d.id}`;
  return `page ${d.id}`;
}

function docsToLines(docs) {
  const out = {};
  for (const d of docs) {
    const k = keyOf(d);
    const lines = d.text.split(/\r?\n/).map(mask).filter((l) => l && !/^\d+$/.test(l));
    out[k] = out[k] ? [...out[k], ...lines] : lines;
  }
  return out;
}

export function baselineDiff({ baselineDir, docs }) {
  const now = docsToLines(docs.filter((d) => d.kind !== "stripe"));
  const file = join(baselineDir, "text.json");
  if (!existsSync(file)) return { baseline: null, note: "No baseline yet. After the next release is live and read, run with --update-baseline.", changed: [], added: [], gone: [] };
  const base = JSON.parse(readFileSync(file, "utf8"));
  const changed = [];
  const added = [];
  for (const [k, lines] of Object.entries(now)) {
    const old = base.docs[k];
    if (!old) {
      added.push({ doc: k, lines: lines.length });
      continue;
    }
    const was = new Set(old);
    const is = new Set(lines);
    const plus = lines.filter((l) => !was.has(l));
    const minus = old.filter((l) => !is.has(l));
    if (plus.length || minus.length) changed.push({ doc: k, plus: [...new Set(plus)], minus: [...new Set(minus)] });
  }
  const gone = Object.keys(base.docs).filter((k) => !now[k]);
  return { baseline: { commit: base.commit, at: base.at }, changed, added, gone };
}

export function saveBaseline({ runDir, baselineDir, commit }) {
  const run = loadRun(runDir);
  // Same documents the checks read (re-derived so this can run alone).
  const docs = [];
  for (const p of run.pages) {
    if (p.kind === "stripe") continue;
    docs.push({ id: p.id, kind: p.kind, text: p.text });
    p.pdfData?.pageText?.forEach((t, i) => docs.push({ kind: "pdf", page: p, pdfPage: i + 1, text: t }));
  }
  for (const e of run.emails) if (!/^HD readings:/.test(e.subject)) docs.push({ kind: "email", email: e, text: `${e.subject}\n${e.text}` });
  for (const s of run.samples) s.pageText.forEach((t, i) => docs.push({ kind: "sample", id: `${s.published}.p${i + 1}`, text: t }));
  mkdirSync(baselineDir, { recursive: true });
  writeFileSync(join(baselineDir, "text.json"), JSON.stringify({ commit, at: new Date().toISOString(), from: runDir, docs: docsToLines(docs) }, null, 0));
}
