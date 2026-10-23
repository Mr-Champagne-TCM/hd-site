/**
 * CASES FOR changes-on-fix-list (tools/e2e/regress.mjs), which run.mjs adds
 * after the checks in checks/index.mjs, so the main cases never reach it.
 *
 * The baseline diff (checks/baseline.mjs) and the fix-list claims, on a tiny
 * made-up baseline written into the self-test's own folder:
 *   - known-good: lines and an email subject that changed ONLY their quote
 *     marks (’ for ', “ ” for ") are not changes (Jeremy's GO PDF, 10/23);
 *     a curled line that really changed is claimed by a fix-list pattern
 *     written with a straight '.
 *   - known-bad: a real word change riding along with a quote change is
 *     still a change no fix claims; so is a straight ' put back where the
 *     baseline was curly AND a word changed.
 *   - moves (10/23 rig): a line moved to another page of the same PDF and
 *     curled on the way is claimed by the fix whose `moves` names the pages;
 *     a moved line that also changed a word is not.
 * Words are short and made up.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { baselineDiff } from "../baseline.mjs";
import { regressCheck } from "../../regress.mjs";

const BASE = {
  "page wren-1-buy-t1": ["Wren's chart is ready", "Your chart's key facts.", 'You may ask "Who am I?" now.', "The lantern stays lit."],
  "email ready | Wren's Human Design chart is ready": ["Wren's Human Design chart is ready", "Hello, it's here."],
};
const page = (lines) => ({ kind: "page", id: "wren-1-buy-t1", text: lines.join("\n") });
const mail = (subject, lines) => ({ kind: "email", email: { step: "ready", subject }, text: [subject, ...lines].join("\n") });
const CURLED = [
  page(["Wren’s chart is ready", "Your chart’s key facts.", "You may ask “Who am I?” now.", "The lantern stays lit."]),
  mail("Wren’s Human Design chart is ready", ["Hello, it’s here."]),
];
/** Read back through loadFixList, so the quote-blind matcher it builds is the one tested. */
const FIX = { id: "W-lantern", docs: "^page ", minus: ["^The lantern stays lit\\.$"], plus: ["^Wren's lantern stays lit\\.$"] };

/** A two-page PDF whose second line on page 2 moves up to page 1 (straight quotes, as the 10/21 baseline was). */
const PDF_BASE = {
  "pdf wren-2-upgrade-t2 p1": ["Wren's chart", "Kept as is."],
  "pdf wren-2-upgrade-t2 p2": ["The page after.", "The lantern's glow is yours."],
};
const pdfPage = (n, lines) => ({ kind: "pdf", page: { id: "wren-2-upgrade-t2" }, pdfPage: n, text: lines.join("\n") });
const MOVE = { id: "W-move", about: "a closing line pulled up a page", docs: "^pdf wren-", minus: [], plus: [], moves: "^pdf wren-2-upgrade-t2 p\\d+$" };

export const REGRESS_CASES = [
  {
    kind: "good",
    name: "quote marks curled, nothing else: no changed line, the subject's document still matched",
    docs: CURLED,
    fixes: [],
    want: (d, c) => (c.status === "pass" && !d.changed.length && !d.added.length && !d.gone.length && d.quoteOnly === 5 ? null : `status ${c.status}, changed ${d.changed.length}, added ${d.added.length}, gone ${d.gone.length}, quoteOnly ${d.quoteOnly}`),
  },
  {
    kind: "good",
    name: "a curled line that really changed is claimed by a pattern written with a straight '",
    docs: [page(["Wren’s chart is ready", "Your chart’s key facts.", "You may ask “Who am I?” now.", "Wren’s lantern stays lit."]), CURLED[1]],
    fixes: [FIX],
    want: (d, c) => (c.status === "pass" && c.claimed["W-lantern"] === 2 ? null : `status ${c.status}, claimed ${JSON.stringify(c.claimed)}: ${c.findings.map((f) => f.evidence).join(" | ")}`),
  },
  {
    kind: "bad",
    name: "a word changed along with the quote marks is still a change",
    docs: [page(["Wren’s chart is ready", "Your chart’s main facts.", "You may ask “Who am I?” now.", "The lantern stays lit."]), CURLED[1]],
    fixes: [FIX],
    want: (d, c) =>
      c.status === "fail" && c.findings.some((f) => f.evidence === "Your chart’s main facts.") && c.findings.some((f) => f.evidence === "Your chart's key facts.")
        ? null
        : `status ${c.status}: ${c.findings.map((f) => f.evidence).join(" | ") || "no findings"}`,
  },
  {
    kind: "bad",
    name: "a subject that changed a word, not only its apostrophe, is a new document",
    docs: [CURLED[0], mail("Wren’s Human Design chart is here", ["Hello, it’s here."])],
    fixes: [],
    want: (d, c) => (c.status === "fail" && d.added.length === 1 && d.gone.length === 1 ? null : `status ${c.status}, added ${d.added.length}, gone ${d.gone.length}`),
  },
  // A line MOVED to another page of the same PDF and curled on the way (10/23 rig: Theo's
  // Start here lines, page 4 to page 3) is claimed by the fix whose `moves` names those pages.
  {
    kind: "good",
    name: "a line moved to the page before and curled on the way is claimed as moved",
    base: PDF_BASE,
    docs: [pdfPage(1, ["Wren’s chart", "The lantern’s glow is yours.", "Kept as is."]), pdfPage(2, ["The page after."])],
    fixes: [MOVE],
    want: (d, c) => (c.status === "pass" && c.claimed["W-move"] === 2 ? null : `status ${c.status}, claimed ${JSON.stringify(c.claimed)}: ${c.findings.map((f) => f.evidence).join(" | ")}`),
  },
  {
    kind: "bad",
    name: "a moved line that also changed a word is still a change",
    base: PDF_BASE,
    docs: [pdfPage(1, ["Wren’s chart", "The lantern’s light is yours.", "Kept as is."]), pdfPage(2, ["The page after."])],
    fixes: [MOVE],
    want: (d, c) =>
      c.status === "fail" && c.findings.some((f) => f.evidence === "The lantern’s light is yours.") && c.findings.some((f) => f.evidence === "The lantern's glow is yours.")
        ? null
        : `status ${c.status}: ${c.findings.map((f) => f.evidence).join(" | ") || "no findings"}`,
  },
];

/** Runs each case; returns results in selftest.mjs's shape. */
export async function regressCases(tmp, loadFixList) {
  const out = [];
  let i = 0;
  for (const k of REGRESS_CASES) {
    const dir = join(tmp, `regress-${++i}`);
    mkdirSync(dir, { recursive: true });
    const base = k.base ?? BASE;
    writeFileSync(join(dir, "text.json"), JSON.stringify({ commit: "selftest", at: "2026-10-23", docs: base }));
    const r = { check: "changes-on-fix-list", item: "regression", kind: k.kind, name: k.name, ok: false, why: "", items: [], findings: [] };
    try {
      const fixFile = join(dir, "fixlist.json");
      writeFileSync(fixFile, JSON.stringify({ fixes: k.fixes }));
      const diff = baselineDiff({ baselineDir: dir, docs: k.docs });
      const c = regressCheck(diff, loadFixList(fixFile), base);
      r.findings = c.findings;
      const why = k.want(diff, c);
      if (why) r.why = why;
      else r.ok = true;
    } catch (e) {
      r.why = `could not build: ${e.message}`;
    }
    out.push(r);
  }
  return out;
}
