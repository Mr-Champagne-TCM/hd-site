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
 *     "addsDocs": "regex: documents this fix brings in", "dropsDocs": "regex: documents it takes away" }
 * Lines are compared as the baseline masks them (links, ports, dates).
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { E2E } from "./harness/paths.mjs";

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
  }));
}

/** The check, shaped like the ones in checks/index.mjs so the report and exit code take it as is. */
export function regressCheck(diff, fixes = loadFixList()) {
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
  for (const ch of diff.changed) {
    const mine = fixes.filter((f) => f.docsRe.test(ch.doc));
    for (const [side, lines] of [
      ["minus", ch.minus],
      ["plus", ch.plus],
    ]) {
      for (const line of lines) {
        c.looked += 1;
        const f = mine.find((f) => (side === "minus" ? f.minusRe : f.plusRe).some((r) => r.test(line)));
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
