/**
 * NOTHING CHANGES THAT IS NOT ON THE FIX LIST.
 *
 * Jeremy, 10/21: "My worry is that our fixes are introducing other errors."
 * The baseline diff (checks/baseline.mjs) lists every line that changed since
 * the baseline, across every page, PDF page and email of every journey. Here
 * each of those lines must be claimed by an entry in fixlist.json: the fix
 * that meant to change it. A line no fix claims is a change nobody asked for,
 * and it fails the run, however harmless it looks.
 *
 * A fix-list entry:
 *   { "id": "W1", "about": "no period after table values",
 *     "docs": "regex on the document key (page <id> | pdf <id> pN | email <step> | <subject> | sample <id>)",
 *     "minus": ["regex a removed line must match", ...],
 *     "plus":  ["regex an added line must match", ...],
 *     "addsDocs": "regex: documents this fix brings in", "dropsDocs": "regex: documents it takes away",
 *     "moves": "regex: PDF pages this fix moves words between" }
 * Lines are compared as the baseline masks them (links, ports, dates).
 *
 * MOVED, NOT CHANGED (`moves`, 10/21 fix 6). A fix that changes where a page
 * breaks -- a closing line pulled up onto the page before -- moves every line
 * after it to another page, and the diff is page by page. A line gone from one
 * page of a PDF and new on another page of the SAME PDF (or from a page that is
 * gone) is claimed as moved by the fix whose `moves` names those pages: the
 * words are exactly the same, only where they fall changed. Nothing else is:
 * a changed word on a moved page still needs its own claim.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { BASELINE, E2E } from "./harness/paths.mjs";

const rx = (s) => (s ? new RegExp(s) : null);

export function loadFixList(file = join(E2E, "fixlist.json")) {
  if (!existsSync(file)) return [];
  return JSON.parse(readFileSync(file, "utf8")).fixes.map((f) => ({
    ...f,
    docsRe: rx(f.docs ?? "."),
    minusRe: (f.minus ?? []).map(rx),
    plusRe: (f.plus ?? []).map(rx),
    addsRe: rx(f.addsDocs),
    dropsRe: rx(f.dropsDocs),
    movesRe: rx(f.moves),
  }));
}

/** The baseline's lines, by document (for the pages a fix took away whole). */
function baselineDocs(dir = BASELINE) {
  try {
    return JSON.parse(readFileSync(join(dir, "text.json"), "utf8")).docs ?? {};
  } catch {
    return {};
  }
}

/** "pdf theo-2-upgrade-t2 p4" -> "pdf theo-2-upgrade-t2": the PDF a page belongs to. */
const pdfOf = (doc) => doc.replace(/ p\d+$/, "");

/** For each fix with `moves`: the lines gone from, and new on, its pages, PDF by PDF. */
function movedLines(diff, fixes, base) {
  const out = new Map();
  for (const f of fixes.filter((f) => f.movesRe)) {
    const gone = new Map();
    const added = new Map();
    const put = (m, doc, lines) => {
      const s = m.get(pdfOf(doc)) ?? new Set();
      for (const l of lines) s.add(l);
      m.set(pdfOf(doc), s);
    };
    for (const ch of diff.changed) {
      if (!f.movesRe.test(ch.doc)) continue;
      put(gone, ch.doc, ch.minus);
      put(added, ch.doc, ch.plus);
    }
    for (const g of diff.gone) if (f.movesRe.test(g)) put(gone, g, base[g] ?? []);
    out.set(f, { gone, added });
  }
  return out;
}

/** The check, shaped like the ones in checks/index.mjs so the report and exit code take it as is. */
export function regressCheck(diff, fixes = loadFixList(), base = baselineDocs()) {
  const c = {
    id: "changes-on-fix-list",
    item: "regression",
    title: "Every changed line is one a fix meant to change",
    why: "A fix that changes anything else may have broken it. Each line here is claimed by no entry in tools/e2e/fixlist.json.",
    status: "pass",
    findings: [],
    looked: 0,
    combos: [],
    human: null,
    claimed: {},
  };
  const fail = (where, what, evidence) => {
    c.findings.push({ combo: "regression", where, what, evidence });
    c.status = "fail";
  };
  if (!diff?.baseline) {
    // No baseline means nothing was compared: that is not a pass.
    fail("baseline", "no baseline to compare with, so changes could not be checked", diff?.note ?? "");
    return c;
  }
  const claim = (f) => (c.claimed[f.id] = (c.claimed[f.id] ?? 0) + 1);
  const moved = movedLines(diff, fixes, base);
  // Gone from this page and new on another page of the same PDF, or the other way round.
  const movedBy = (doc, side, line) =>
    fixes.find((f) => f.movesRe?.test(doc) && moved.get(f)[side === "minus" ? "added" : "gone"].get(pdfOf(doc))?.has(line));
  for (const ch of diff.changed) {
    const mine = fixes.filter((f) => f.docsRe.test(ch.doc));
    for (const [side, lines] of [
      ["minus", ch.minus],
      ["plus", ch.plus],
    ]) {
      for (const line of lines) {
        c.looked += 1;
        const f = mine.find((f) => (side === "minus" ? f.minusRe : f.plusRe).some((r) => r.test(line))) ?? movedBy(ch.doc, side, line);
        if (f) claim(f);
        else fail(ch.doc, side === "minus" ? "a line is gone that no fix removes" : "a line is new that no fix adds", line);
      }
    }
  }
  for (const a of diff.added) {
    c.looked += 1;
    const f = fixes.find((f) => f.addsRe?.test(a.doc));
    if (f) claim(f);
    else fail(a.doc, "a whole document is new that no fix adds", `${a.lines} lines`);
  }
  for (const g of diff.gone) {
    c.looked += 1;
    const f = fixes.find((f) => f.dropsRe?.test(g));
    if (f) claim(f);
    else fail(g, "a whole document is gone that no fix removes", "");
  }
  // A fix that changed nothing is worth a look too (not built, or switched off).
  c.unused = fixes.filter((f) => !c.claimed[f.id]).map((f) => f.id);
  return c;
}
