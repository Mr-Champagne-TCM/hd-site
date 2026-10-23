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
];

/** Runs each case; returns results in selftest.mjs's shape. */
export async function regressCases(tmp, loadFixList) {
  const out = [];
  let i = 0;
  for (const k of REGRESS_CASES) {
    const dir = join(tmp, `regress-${++i}`);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "text.json"), JSON.stringify({ commit: "selftest", at: "2026-10-23", docs: BASE }));
    const r = { check: "changes-on-fix-list", item: "regression", kind: k.kind, name: k.name, ok: false, why: "", items: [], findings: [] };
    try {
      const fixFile = join(dir, "fixlist.json");
      writeFileSync(fixFile, JSON.stringify({ fixes: k.fixes }));
      const diff = baselineDiff({ baselineDir: dir, docs: k.docs });
      const c = regressCheck(diff, loadFixList(fixFile), BASE);
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
