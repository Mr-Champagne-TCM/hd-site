/**
 * THE TRUTH CHECKS. Each one reads what a run captured and says pass or fail,
 * with every finding pinned to the page, PDF page or email it came from and
 * the journey step that produced it. `item` names the 10/21 error-set entry
 * it guards (#n = bug, W = wording, AI = writing pattern), so a regression
 * reads as the item it is.
 *
 * Rules of the house (HD-HANDOFF-2026-10-05.md section 1): US spelling,
 * "on track / off track" and never Signature / Not-self to a buyer, no "shop"
 * in customer copy, requests not commands.
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { pathToFileURL } from "node:url";
import { FIXTURES, REPO, SIBLINGS } from "../harness/paths.mjs";
import { loadReadingFixtures } from "../harness/fakeGemini.mjs";
import { block, editDistance, inSource, loadRun, norm, rows, sentences, tagged, truthFor } from "./load.mjs";
import { ADD_TIME, GATES_NOTE, holdsLine, offerText, usableSpread } from "../../../shared/timeSpread.mjs";
import { birthLine } from "../../../shared/birthLine.mjs";
import { sayTime } from "../../../shared/correctionNote.mjs";
import { MESSAGES } from "../../../shared/customerMessages.mjs";
import { baselineDiff } from "./baseline.mjs";

export const CENTERS = ["Head", "Ajna", "Throat", "G", "Heart", "Sacral", "Spleen", "Solar Plexus", "Root"];
export const AUTHORITY_CENTER = {
  Emotional: "Solar Plexus",
  Sacral: "Sacral",
  Splenic: "Spleen",
  "Ego Manifested": "Heart",
  "Ego Projected": "Heart",
  Ego: "Heart",
  "Self-Projected": "G",
  Mental: null,
  Lunar: null,
};
export const FEELINGS = {
  Generator: ["satisf", "frustrat"],
  "Manifesting Generator": ["satisf", "frustrat"],
  Projector: ["success", "bitter"],
  Manifestor: ["peace", "anger", "angry"],
  Reflector: ["surpris", "disappoint"],
};
const TIER = ["summary", "chart", "reading"];

/** The glance and values rows, by their page label, and the chart field behind each (unknown birth time, 10/22). */
export const LABEL_FIELD = {
  TYPE: "type",
  STRATEGY: "strategy",
  AUTHORITY: "authority",
  PROFILE: "profile",
  "WHEN IT'S ON TRACK": "signature",
  "WHEN IT'S OFF TRACK": "notSelfTheme",
  DEFINITION: "definition",
  "INCARNATION CROSS": "incarnationCross",
  "DEFINED CENTERS": "definedCenters",
  "UNDEFINED CENTERS": "undefinedCenters",
  "OPEN CENTERS": "openCenters",
  CHANNELS: "channels",
  "ACTIVATED GATES": "gates",
};
/** What a kept spread is compared on, against the engine's own /v1/spread answer. */
const SPREAD_KEYS = ["v", "ok", "minutes", "noon", "window", "changes", "segments", "clock", "gates"];
/** The PDF's "add it here" (10/22): the record's never-expiring add-time key, /t/<body>.<mac>. */
export const ADD_TIME_KEY_LINK = /^https?:\/\/[^/]+\/t\/[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;

/**
 * The PDF's glance pages (page 2, and any page after it still under "Your
 * chart at a glance"): which row labels are shown, and which carry the tag --
 * on the label's line ("DEFINITION PROVISIONAL Triple Split") or the line
 * under it, when the label column is too narrow for both.
 */
export function pdfTagged(pages) {
  const shown = new Set();
  const tags = new Set();
  const labels = Object.keys(LABEL_FIELD).sort((a, b) => b.length - a.length);
  for (const pt of pages.filter((x) => /^Your chart at a glance/.test(x))) {
    const ls = pt.split(/\r?\n/).map((l) => l.trim().replace(/’/g, "'"));
    ls.forEach((l, i) => {
      const label = labels.find((x) => l === x || l.startsWith(x + " "));
      if (!label || shown.has(label)) return;
      shown.add(label);
      const rest = l.slice(label.length).trim();
      if (/^PROVISIONAL\b/i.test(rest) || (!rest && /^PROVISIONAL\b/i.test(ls[i + 1] ?? ""))) tags.add(label);
    });
  }
  return { shown, tagged: tags };
}

/**
 * START HERE AND THE READING'S MARGIN NOTES (reading tier, unknown birth
 * time, 10/22): Jeremy's rule is that every line whose value changes during
 * the birth day carries PROVISIONAL beside its label, wherever it prints. So
 * Start here's "Colored in" / "Not colored in" lists, its channels and its
 * profile, and each margin note (the type, Definition, Authority, Center,
 * Profile, Incarnation cross, On track / Off track) carry the tag when their
 * value is in the spread's changes, and only then. `lines` is a page's text
 * or the PDF's pages after page 1, line by line. Returns the findings.
 */
export function laterTags(lines, out, changing, where) {
  const L = lines.map((l) => String(l).trim().replace(/’/g, "'")).filter(Boolean);
  // "Start here" on a page; in the PDF, the page's running head ("Start here HUMAN DESIGN by ...").
  const start = L.findIndex((l) => /^(\d+ )?Start here( HUMAN DESIGN by .*)?$/.test(l));
  if (start < 0) return [];
  const found = [];
  const judge = (i, want, name, has) => {
    if (want && !has) found.push({ what: `${name} changes during the birth day but carries no PROVISIONAL tag beside its label (${where})`, line: L[i] });
    if (!want && has) found.push({ what: `${name} is marked PROVISIONAL but holds all day (${where})`, line: L[i] });
  };
  /* Start here */
  const at = (re) => L.findIndex((l, i) => i > start && re.test(l));
  const colored = at(/^COLORED IN \(\d+\)/);
  if (colored >= 0) judge(colored, changing.has("definedCenters"), "Start here's \"Colored in\" list", /PROVISIONAL$/.test(L[colored]));
  const notColored = at(/^NOT COLORED IN \(\d+\)/);
  if (notColored >= 0) judge(notColored, changing.has("undefinedCenters") || changing.has("openCenters"), "Start here's \"Not colored in\" list", /PROVISIONAL$/.test(L[notColored]));
  // "Your channels" / "(4)" / "PROVISIONAL" on a page; "2 Your channels (4) PROVISIONAL" in the PDF.
  const ch = at(/^(\d+ )?Your channels\b/);
  if (ch >= 0) judge(ch, changing.has("channels"), "Start here's channels", /PROVISIONAL$/.test(L[ch]) || (/^\(\d+\)$/.test(L[ch + 1] ?? "") && L[ch + 2] === "PROVISIONAL") || L[ch + 1] === "PROVISIONAL");
  const pr = at(/^(\d+ )?Your profile\b/);
  if (pr >= 0) judge(pr, changing.has("profile"), "Start here's profile", /PROVISIONAL$/.test(L[pr]) || (/^\d\/\d$/.test(L[pr + 1] ?? "") && L[pr + 2] === "PROVISIONAL") || L[pr + 1] === "PROVISIONAL");
  /* the margin notes, each by its label (the label may wrap in the PDF's narrow margin) */
  const labels = [
    [String(out.type ?? "").toUpperCase(), ["type", "strategy"]],
    ["DEFINITION", ["definition"]],
    [`${String(out.authority ?? "").toUpperCase()} AUTHORITY`, ["authority"]],
    ...(AUTHORITY_CENTER[out.authority] ? [["CENTER", ["authority"]]] : []),
    [`PROFILE ${out.profile ?? ""}`, ["profile"]],
    ["INCARNATION CROSS", ["incarnationCross"]],
    ["ON TRACK, THE FEELING IS", ["signature"]],
    ["OFF TRACK, THE FEELING IS", ["notSelfTheme"]],
  ];
  const after = Math.max(start, pr, ch, notColored, colored);
  for (const [label, fields] of labels) {
    const parts = label.startsWith("ON TRACK") || label.startsWith("OFF TRACK") ? [label, label.replace(" THE FEELING IS", "")] : [label];
    let i = -1;
    let last = -1;
    for (let k = after + 1; k < L.length && i < 0; k++) {
      if (L[k] === parts[0]) [i, last] = [k, k];
      else if (parts[1] && L[k] === parts[1] && L[k + 1] === "THE FEELING IS") [i, last] = [k, k + 1];
    }
    if (i < 0) continue;
    judge(i, fields.some((f) => changing.has(f)), `the reading's margin note ${label}`, L[last + 1] === "PROVISIONAL");
  }
  return found;
}

const clip = (s, n = 160) => {
  const t = String(s ?? "").replace(/\s+/g, " ").trim();
  return t.length > n ? t.slice(0, n - 1) + "…" : t;
};
const around = (text, idx, len, pad = 70) => clip(text.slice(Math.max(0, idx - pad), idx + len + pad), 220);

function check(id, item, title, why) {
  const c = { id, item, title, why, status: "pass", findings: [], looked: 0, combos: new Set(), human: null };
  c.fail = (combo, where, what, evidence = "", extra = {}) => {
    c.findings.push({ combo, where, what, evidence: clip(evidence, 260), ...extra });
    c.status = "fail";
  };
  c.saw = (combo) => {
    c.looked += 1;
    if (combo) c.combos.add(combo);
  };
  return c;
}

const docName = (p) => `${p.kind} page ${p.id}`;

/** Customer-facing text units: every page (shop + website), PDF page and email. */
function documents(run) {
  const docs = [];
  for (const p of run.pages) {
    if (p.kind === "stripe") continue; // the fake Stripe page is ours, not the shop's
    const site = p.kind === "website" ? "website" : "shop";
    docs.push({ id: p.id, kind: p.kind, site, where: `${site} page ${p.id}`, combo: p.journey ?? p.kind, tier: p.tier, fresh: !!p.fresh, text: p.text, page: p });
    if (p.pdfData?.pageText?.length) {
      p.pdfData.pageText.forEach((t, i) => docs.push({ id: `${p.id}.pdf.p${i + 1}`, kind: "pdf", site: "shop", where: `PDF ${p.id} page ${i + 1}`, combo: p.journey, tier: p.tier, fresh: !!p.fresh, text: t, page: p, pdfPage: i + 1 }));
    }
  }
  for (const e of run.emails) {
    if (/^HD readings:/.test(e.subject)) continue; // alerts to Jeremy, checked on their own
    docs.push({ id: e.file, kind: "email", site: "shop", where: `email "${e.subject}"`, combo: e.journey, tier: e.tier, fresh: !!e.fresh, text: `${e.subject}\n${e.text}`, email: e });
  }
  for (const s of run.samples) s.pageText.forEach((t, i) => docs.push({ id: `${s.published}.p${i + 1}`, kind: "sample", site: "website", where: `sample PDF ${s.published} page ${i + 1}`, combo: "website", text: t }));
  return docs;
}

/** The sentence a match sits in (to ask whether it is written in the source). */
function sentenceAround(text, match) {
  const i = text.indexOf(match);
  if (i < 0) return match;
  const start = Math.max(text.lastIndexOf(". ", i) + 2, text.lastIndexOf("\n", i) + 1, 0);
  const endDot = text.indexOf(". ", i + match.length);
  const endNl = text.indexOf("\n", i + match.length);
  const end = Math.min(...[endDot >= 0 ? endDot + 1 : Infinity, endNl >= 0 ? endNl : Infinity, text.length]);
  return text.slice(start, end).trim();
}

/** Find a regex in a text; report each hit once with context. */
function hits(text, re) {
  const out = [];
  const g = new RegExp(re.source, re.flags.includes("g") ? re.flags : re.flags + "g");
  for (const m of text.matchAll(g)) out.push({ match: m[0], ctx: around(text, m.index, m[0].length), index: m.index });
  return out;
}

/**
 * A glance row that opens on an -ing word and never gets a main verb
 * ("Carrying a design that guides…", "Waiting for the proper invitation
 * before…"): a fragment. Two whole-sentence shapes open the same way and are
 * not: an -ing phrase as the subject of a verb ("Waiting for the invitation
 * keeps your energy…"), and an opening phrase then the main clause
 * ("Carrying a steady motor, you finish…"). A verb inside a that / when / so
 * clause is not the sentence's own.
 */
export function glanceFragment(v) {
  const s = String(v ?? "").trim();
  if (!/^[A-Z][a-z]+ing\b/.test(s)) return false;
  if (/^[^.;]*?,\s+(?:you|it|they|we|he|she)\s+(?!and\b|or\b)[a-z]+/.test(s)) return false;
  const w = s.replace(/[“”"(),.;:!?—–]/g, " ").split(/\s+/).filter(Boolean);
  const CLAUSE = /^(?:that|which|who|whom|whose|when|whenever|where|so|because|while|if|until|unless|once|though|although|than|what)$/i;
  const NOT_VERB_AFTER = /^(?:a|an|the|your|my|his|her|its|their|our|these|those|this|that|many|few|some|all|any|each|every|other|what|who|which)$/i;
  const OBJECT = /^(?:a|an|the|your|you|yourself|it|its|them|their|his|her|our|us|me|my|this|these|those|what|how|more|less|most)$/i;
  const MAIN = /^(?:is|was|becomes|will|can|may|must|might|should|could|would)$/i;
  for (let i = 1; i < w.length; i++) {
    if (CLAUSE.test(w[i])) return true;
    if (NOT_VERB_AFTER.test(w[i - 1])) continue;
    if (MAIN.test(w[i])) return false;
    if (/^[a-z]{2,}s$/.test(w[i]) && !/(?:ss|us|is)$/.test(w[i]) && OBJECT.test(w[i + 1] ?? "")) return false;
  }
  return true;
}

/** Hits of `re` that do not fall inside a hit of any `keep` pattern (wording that is right as it is). */
function hitsOutside(text, re, keep) {
  const spans = keep.flatMap((k) => hits(text, k).map((h) => [h.index, h.index + h.match.length]));
  return hits(text, re).filter((h) => !spans.some(([a, b]) => h.index >= a && h.index < b));
}

/**
 * Options beyond the run (all optional; a normal run passes none):
 *   only        check ids to run (the rest, and the changed-words diff, are skipped)
 *   fixtures    the stored live readings to read (default: the data home's)
 *   phoneRoot   the phone app repo whose source is scanned (default: ../hd-reading-app)
 *   websiteGit  (gitLogArgs) => Date | null, when the website last changed (default: git in ../the-champagne-method)
 *   checker     { firstProblem } standing in for the shop's checker in the probe
 * The last four exist so checks/selftest.mjs can test each check on a known
 * document without reading the real repos.
 */
export async function runChecks({ runDir, baselineDir, only = null, fixtures = FIXTURES, phoneRoot = SIBLINGS.phone, websiteGit = null, checker = null }) {
  const run = loadRun(runDir);
  const docs = documents(run);
  const checks = [];
  const add = (c) => (checks.push(c), c);
  const on = (id) => !only || only.includes(id);
  const resultPages = run.pages.filter((p) => p.kind === "result" && p.apiBody);
  const custDocs = docs.filter((d) => !["readings-site-unknown"].includes(d.kind));

  /* ------------------------------------------------ 0. the run itself ---- */
  if (on("run-complete")) {
    const c = add(check("run-complete", "rig", "Every journey ran to the end", "A step that could not finish is a buyer who could not finish."));
    for (const j of run.manifest.journeys) {
      c.saw(j.id);
      const plan = run.combos.journeys.find((x) => x.id === j.id);
      if (plan && j.steps.length < plan.steps.length) c.fail(j.id, `journey ${j.id}`, `stopped after ${j.steps.length} of ${plan.steps.length} steps`);
    }
    for (const e of run.manifest.errors) c.fail(e.step.split("-")[0], `step ${e.step}`, e.error, e.url);
  }
  if (on("no-live-calls")) {
    const c = add(check("no-live-calls", "rig", "Nothing left the machine", "The rig's fetch refuses every outside host; an attempt means a code path the fakes do not cover."));
    c.saw("all");
    for (const b of run.rig.blocked ?? []) c.fail("all", "outbound request", `blocked: ${b.host}${b.path}`);
  }
  if (on("no-incidents")) {
    const c = add(check("no-incidents", "rig", "No alert would have paged Jeremy", "A clean run files no incident. An alert email in the outbox is a failure the buyer may not see."));
    c.saw("all");
    for (const e of run.emails.filter((e) => /^HD readings:/.test(e.subject))) c.fail(e.journey, `alert email`, e.subject, e.text.slice(0, 200));
  }

  /* --------------------------------- 1. values shown = engine values (#2) */
  if (on("values-match-engine")) {
    const c = add(check("values-match-engine", "#2", "Every value shown equals the engine's chart (no \"None\" where data exists)", "The page's table is checked against the full chart the engine computes for the same birth, not against what the tier's API answer happened to carry."));
    for (const p of resultPages) {
      const out = p.apiBody.output;
      const truth = truthFor(run, out);
      c.saw(p.journey);
      if (!truth) {
        c.fail(p.journey, docName(p), "no engine chart found for this birth (rig could not compare)");
        continue;
      }
      const shown = rows(p.text);
      const want = {
        TYPE: truth.type,
        AUTHORITY: truth.authority,
        STRATEGY: truth.strategy,
        DEFINITION: truth.definition,
        "INCARNATION CROSS": truth.incarnationCross,
        "DEFINED CENTERS": (truth.definedCenters ?? []).join(", ") || "None",
        "UNDEFINED CENTERS": (truth.undefinedCenters ?? []).join(", ") || "None",
        "OPEN CENTERS": (truth.openCenters ?? []).join(", ") || "None",
        CHANNELS: (truth.channels ?? []).length ? truth.channels : "None",
        // On every tier since 10/22 ("gates/channels go to summary"), as numbers, lowest first.
        "ACTIVATED GATES": [...(truth.activatedGates ?? [])].map(Number).sort((a, b) => a - b).join(", ") || "None",
      };
      for (const [label, v] of Object.entries(want)) {
        if (!(label in shown)) continue;
        // A reading's glance row is "Projector. <a sentence about it>": the value is the first part.
        const got = shown[label].replace(/PROVISIONAL$/i, "").split(/\.(?:\s|$)/)[0].split(" — ")[0].trim();
        if (label === "CHANNELS") {
          if (Array.isArray(v) && /^none$/i.test(got)) c.fail(p.journey, docName(p), `CHANNELS shows "None"; the chart has ${v.length}: ${v.join(", ")}`, `${label}: ${shown[label]}`);
          else {
            // One channel a line: every one shown must be the chart's, and none missing.
            const pair = (s) => (/^(\d{1,2})-(\d{1,2})\b/.exec(s.trim()) ?? []).slice(1).map(Number).sort((a, b) => a - b).join("-");
            const list = block(p.text, "CHANNELS")?.split("\n").map(pair).filter(Boolean) ?? [];
            const want = (Array.isArray(v) ? v : []).map(pair).filter(Boolean);
            const extra = list.filter((x) => !want.includes(x));
            const missing = want.filter((x) => !list.includes(x));
            if (list.length && (extra.length || missing.length)) c.fail(p.journey, docName(p), `CHANNELS shows ${list.join(", ")}; the engine says ${want.join(", ") || "None"}`, `${extra.length ? `not in the chart: ${extra.join(", ")}` : ""}${extra.length && missing.length ? "; " : ""}${missing.length ? `missing: ${missing.join(", ")}` : ""}`);
          }
          continue;
        }
        const set = (s) => norm(s).split(/,\s*/).sort().join(",");
        if (/CENTERS$/.test(label) ? set(got) !== set(v) : norm(got) !== norm(v)) c.fail(p.journey, docName(p), `${label} shows "${got}", the engine says "${v}"`);
      }
      // The PDF's value table, same rule for the channels.
      if (p.pdfData?.pageText?.length && (truth.channels ?? []).length) {
        const all = p.pdfData.pageText.join("\n");
        const m = all.match(/CHANNELS\s*\n?\s*None/);
        if (m) c.fail(p.journey, `PDF ${p.id}`, `CHANNELS "None" in the PDF; the chart has ${truth.channels.length}`);
      }
      // Emails that list values.
    }
  }

  /* ---------------------------- 2. provisional wherever time unknown (#3, #17) */
  if (on("provisional-marks")) {
    const c = add(check("provisional-marks", "#3 #17", "Unknown birth time: PROVISIONAL on exactly the lines that change during the birth day, beside each one's label", "Charted at noon (Jeremy 10/22): a line that holds all day is not marked; one that changes is, next to its label, never after its value; the gates and the 26 activations always. With no spread kept (an older record), Type, Authority and Profile are marked as before, and so is what Type is made of."));
    for (const p of resultPages.filter((p) => p.apiBody.output?.timeKnown === false)) {
      c.saw(p.journey);
      const t = p.text;
      const out = p.apiBody.output;
      const spread = usableSpread(out);
      if (spread) {
        const changing = new Set(spread.changes);
        // The page: the glance and values tables.
        const tags = tagged(t);
        const r = rows(t);
        for (const [label, field] of Object.entries(LABEL_FIELD)) {
          if (!(label in r)) continue;
          const want = field === "gates" || changing.has(field);
          const has = tags.has(label);
          if (want && !has) {
            const what = ["definedCenters", "undefinedCenters", "openCenters", "channels", "definition"].includes(field) && changing.has("type") ? ` (what Type is made of; Type is provisional)` : "";
            if (field === "gates") c.fail(p.journey, docName(p), `${label} is not marked PROVISIONAL (with no birth time the gates always are)`, `${label}: ${r[label]}`);
            else c.fail(p.journey, docName(p), `${label} changes during the birth day but carries no PROVISIONAL tag beside its label${what}`, `${label}: ${r[label]}`);
          }
          if (!want && has) c.fail(p.journey, docName(p), `${label} is marked PROVISIONAL but holds all day (only lines that change are marked)`, `${label}: ${r[label]}`);
          // Beside the label, never after the value.
          if (/PROVISIONAL$/i.test(r[label] ?? "")) c.fail(p.journey, docName(p), `${label}'s PROVISIONAL sits after its value, not beside its label`, `${label}: ${r[label]}`);
        }
        // The three-lines box: each row's tag beside its words ("How you meet the worldPROVISIONAL · Profile 3/5").
        const box = t.match(/Your chart in (?:three|two|one) lines?([\s\S]*?)(?:Below:|Your chart at a glance)/);
        if (box) {
          for (const [row, field] of [["Your energy", "type"], ["How you decide", "authority"], ["How you meet the world", "profile"]]) {
            const line = box[1].split("\n").map((l) => l.trim()).find((l) => l.startsWith(row));
            if (!line) continue;
            const has = /^[^·]*PROVISIONAL/i.test(line);
            if (changing.has(field) && !has) c.fail(p.journey, docName(p), `the three-lines box states "${row}" with no provisional mark, and it changes during the birth day`, line);
            if (!changing.has(field) && /PROVISIONAL/i.test(line)) c.fail(p.journey, docName(p), `the three-lines box marks "${row}" PROVISIONAL, but it holds all day`, line);
            if (/·.*PROVISIONAL\s*$/i.test(line)) c.fail(p.journey, docName(p), `the three-lines box puts "${row}"'s PROVISIONAL after the value, not beside the row's words`, line);
          }
        }
        // The 26 activations (reading tier): always marked with no birth time.
        if (/Technical values: your \d+ planet numbers/.test(t) && !/planet numbers[^\n]*PROVISIONAL/i.test(t)) c.fail(p.journey, docName(p), "the technical values (the 26 activations) are not marked PROVISIONAL", "");
        // Start here's lists and the reading's margin notes (Jeremy's rule, 10/22: wherever a changing value prints).
        for (const f of laterTags(t.split(/\r?\n/), out, changing, "page")) c.fail(p.journey, docName(p), f.what, f.line);
        // The PDF: page 1's facts line, then the value rows (tag on the label's line, or the line under it).
        if (p.pdfData?.pageText?.length) {
          const first = p.pdfData.pageText[0];
          const facts = first.split("\n").find((l) => /Profile \d\/\d/.test(l)) ?? "";
          for (const [re, field, name] of [[/^[^·]*?(Manifesting Generator|Generator|Projector|Manifestor|Reflector)/, "type", "Type"], [/Profile \d\/\d[^·]*/, "profile", "Profile"], [/[A-Z][\w-]+(?: [A-Z][\w-]+)? authority/, "authority", "Authority"]]) {
            const m = facts.split("·").find((part) => re.test(part)) ?? "";
            const has = /PROVISIONAL/i.test(m);
            if (changing.has(field) && !has) c.fail(p.journey, `PDF ${p.id} page 1`, `page 1 states ${name} with no provisional mark, and it changes during the birth day`, clip(facts, 200));
            if (!changing.has(field) && has) c.fail(p.journey, `PDF ${p.id} page 1`, `page 1 marks ${name} PROVISIONAL, but it holds all day`, clip(facts, 200));
          }
          const pdfTags = pdfTagged(p.pdfData.pageText.slice(1));
          for (const [label, field] of Object.entries(LABEL_FIELD)) {
            if (!pdfTags.shown.has(label)) continue;
            const want = field === "gates" || changing.has(field);
            if (want && !pdfTags.tagged.has(label)) c.fail(p.journey, `PDF ${p.id}`, field === "gates" ? `${label} is not marked PROVISIONAL (with no birth time the gates always are)` : `${label} changes during the birth day but carries no PROVISIONAL tag beside its label`, label);
            if (!want && pdfTags.tagged.has(label)) c.fail(p.journey, `PDF ${p.id}`, `${label} is marked PROVISIONAL but holds all day`, label);
          }
          for (const f of laterTags(p.pdfData.pageText.slice(1).join("\n").split("\n"), out, changing, "pdf")) c.fail(p.journey, `PDF ${p.id}`, f.what, f.line);
        }
      } else {
        // No spread kept (an older record, or the spread could not be had): the marks as before.
        const box = t.match(/Your chart in three lines([\s\S]*?)(Below:|Your chart at a glance)/);
        if (box && !/provisional/i.test(box[1])) c.fail(p.journey, docName(p), "the three-lines box states Type, Authority and Profile with no provisional mark", clip(box[1], 200));
        const r = rows(t);
        for (const label of ["TYPE", "AUTHORITY", "PROFILE"]) if (r[label] && !/provisional/i.test(r[label])) c.fail(p.journey, docName(p), `${label} not marked provisional`, r[label]);
        if (r.TYPE && /provisional/i.test(r.TYPE)) {
          for (const label of ["DEFINED CENTERS", "CHANNELS", "DEFINITION"]) {
            // CHANNELS runs one channel a line; a mark after the last one counts.
            const v = label === "CHANNELS" ? block(t, label) : r[label];
            if (v && !/provisional/i.test(v)) c.fail(p.journey, docName(p), `Type is provisional but ${label} (what Type is made of) is not marked`, `${label}: ${r[label]}`);
          }
        }
        if (p.pdfData?.pageText?.length) {
          const first = p.pdfData.pageText[0];
          if (/Profile \d\/\d/.test(first) && !/provisional/i.test(first)) c.fail(p.journey, `PDF ${p.id} page 1`, "page 1 states Type / Profile / Authority with no provisional mark", clip(first.split("\n").slice(0, 5).join(" "), 200));
        }
      }
    }
    // One story, told one way, on every surface (#17): shop, website, phone app.
    const contradicts = /(?:still accurate|usually|almost always)[^.]{0,140}\bType and Authority\b|\bType and Authority (?:are|is) (?:usually|still|almost always|probably) (?:right|accurate|correct)/i;
    for (const d of custDocs) {
      for (const h of hits(d.text, contradicts)) c.fail(d.combo, d.where, "says Type / Authority are usually right, while the chart says to treat them as provisional", h.ctx);
    }
    const phoneSrc = join(phoneRoot, "app", "src", "main");
    if (existsSync(phoneSrc)) {
      const walk = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(dir, e.name)) : /\.(kt|xml)$/.test(e.name) ? [join(dir, e.name)] : []));
      for (const f of walk(phoneSrc)) {
        const text = readFileSync(f, "utf8").replace(/"\s*\+\s*"/g, "");
        for (const h of hits(text, contradicts)) c.fail("phone", `phone app source ${relative(phoneRoot, f)}`, "the phone tells unknown-time clients Type / Authority are usually right", h.ctx);
      }
      c.saw("phone");
    }
  }

  /* -------------------------------- 2b. an unknown birth time, said (#17, 10/22) */
  if (on("unknown-time-line")) {
    const c = add(check("unknown-time-line", "#17", "Unknown birth time: the one line, its window the engine's, the bar under it, the offer with its link", "Jeremy 10/22: ONE line (\"...It holds for a birth between about X and Y; outside those hours the lines marked PROVISIONAL may change.\"), the bar only, and \"Found your birth time? You're welcome to add it here...\". The window must be the engine's own /v1/spread answer for that birth, kept as it came."));
    for (const p of resultPages.filter((p) => p.apiBody.output?.timeKnown === false)) {
      c.saw(p.journey);
      const out = p.apiBody.output;
      const spread = usableSpread(out);
      if (!spread) {
        // Every unknown-time chart made by this release asks the engine; none kept means the call failed or was refused.
        if (out.timeSpread) c.fail(p.journey, docName(p), "the chart keeps a spread the page cannot use (not ok, or misshapen)", clip(JSON.stringify(out.timeSpread), 160));
        else if (run.spreadTruth.length || /^0\.(?:[6-9]|\d{2,})\./.test(String(run.rig.engine ?? ""))) c.fail(p.journey, docName(p), "no spread kept for this unknown-time chart (the /v1/spread call failed or was refused)");
        continue;
      }
      const t = norm(p.text);
      const line = holdsLine(spread).text;
      if (!t.includes(norm(line))) c.fail(p.journey, docName(p), "the one line about the birth time is missing or not the spread's", line);
      if ((t.match(/this chart is cast at noon/g) ?? []).length > 1) c.fail(p.journey, docName(p), "the birth-time line is said more than once on the page", "");
      if (/charted at noon\. treat type, authority and profile/.test(t)) c.fail(p.journey, docName(p), "the engine's older note is shown beside the one line", "");
      // The engine's own answer for this birth: the kept spread must be exactly one of them.
      if (run.spreadTruth.length) {
        const kept = JSON.stringify(SPREAD_KEYS.map((k) => spread[k]));
        if (!run.spreadTruth.some((x) => JSON.stringify(SPREAD_KEYS.map((k) => x.spread[k])) === kept)) {
          c.fail(p.journey, docName(p), "the window shown is not the engine's /v1/spread answer for this birth", `window ${JSON.stringify(spread.window)}`);
        }
      }
      // The bar: "cast at noon" over it, the clock under it.
      if (!/cast at noon\s*\n\s*12 AM\s*\n\s*6 AM\s*\n\s*12 PM\s*\n\s*6 PM\s*\n\s*12 AM/.test(p.text)) c.fail(p.journey, docName(p), "the bar under the line is missing (no \"cast at noon\" over a midnight-to-midnight clock)", "");
      // The offer, and its link to this link's own time box.
      const offer = offerText(p.tier);
      if (!t.includes(norm(offer))) c.fail(p.journey, docName(p), "the offer to add a found birth time is missing or reworded", offer);
      if (!p.linksList.some((l) => l.text === "add it here" && /#add-time$/.test(l.href))) c.fail(p.journey, docName(p), "\"add it here\" is not a link to #add-time", "");
      // The gates' short note, under the gate numbers.
      if (/ACTIVATED GATES/.test(p.text) && !t.includes(norm(GATES_NOTE))) c.fail(p.journey, docName(p), "the gates are marked but their short note is missing", "");
      // The PDF: the same line, the bar, the offer and a link that opens this reading's time box.
      if (p.pdfData?.pageText?.length) {
        const first = norm(p.pdfData.pageText[0].replace(/\n/g, " "));
        if (!first.includes(norm(line))) c.fail(p.journey, `PDF ${p.id} page 1`, "page 1 lacks the one line about the birth time", line);
        if (!/cast at noon 12 am 6 am 12 pm 6 pm 12 am/.test(first)) c.fail(p.journey, `PDF ${p.id} page 1`, "page 1 lacks the bar (\"cast at noon\" over the clock)", "");
        if (!first.includes(norm(offer))) c.fail(p.journey, `PDF ${p.id} page 1`, "page 1 lacks the offer to add a found birth time", offer);
        // The PDF is kept for years: its "add it here" is the record's own never-expiring key (/t/<key>, 10/22), not the six-day reading link.
        if (!(p.pdfData.links ?? []).some((l) => l.page === 1 && ADD_TIME_KEY_LINK.test(l.href))) c.fail(p.journey, `PDF ${p.id} page 1`, "\"add it here\" in the PDF is not the never-expiring add-time link (/t/<key>)", clip((p.pdfData.links ?? []).filter((l) => l.page === 1).map((l) => l.href.replace(/[A-Za-z0-9_-]{20,}/g, "<token>")).join(" "), 200));
      }
    }
  }

  /* -------------------------- 2c. a birth time found later, added (offer A, 10/22) */
  if (on("add-time")) {
    const c = add(check("add-time", "OfferA", "A birth time found later: added once and free, from the page or the PDF; the chart redone with nothing provisional; both ways in then say kindly it is used", "Jeremy 10/22: \"they can 'update birth time at no cost and get an updated reading'\"; \"TEST THIS HARD!!!!\". The form asks only the time and shows the kept date and place; the PDF's link never expires; once used, the offer is gone everywhere, an upgrade included."));
    const atStep = (s) => run.pages.filter((p) => p.step === s.id);
    const T_ = (e) => run.emails.find((x) => x.file === e.file)?.text ?? "";
    for (const j of run.manifest.journeys) {
      let addedAt = null; // the clock reading ("3:10 PM") once a time is added in this journey
      for (const s of j.steps) {
        if (s.do === "upgrade" && addedAt) {
          // An upgrade after the time was added: the chart keeps it, and the offer stays spent.
          c.saw(j.id);
          for (const p of atStep(s).filter((p) => p.kind === "result")) {
            if (p.apiBody?.output?.timeKnown !== true) c.fail(j.id, docName(p), "the upgrade after the birth time was added is cast with an unknown time again", "");
            if (norm(p.text).includes(norm("Found your birth time?"))) c.fail(j.id, docName(p), "the upgrade offers to add a birth time again (the offer was used)", "");
            if (!p.text.includes(addedAt)) c.fail(j.id, docName(p), `the upgrade's birth line lacks the added time (${addedAt})`, clip(p.text.split("\n").find((l) => / · /.test(l) && /\d{4}/.test(l)) ?? "", 160));
          }
          if (!atStep(s).some((p) => p.kind === "addtime-used")) c.fail(j.id, `step ${s.id}`, "the first link's #add-time was not opened again after the upgrade (the driver captures it)", "");
        }
        if (s.do !== "add-time") continue;
        c.saw(j.id);
        const mine = atStep(s);
        const birth = run.combos.births?.[s.birth] ?? null;
        const time = s.time ?? (run.combos.journeys.find((x) => x.id === j.id)?.steps ?? [])[Number(s.id.split("-")[1]) - 1]?.time ?? null;
        const clock = time ? sayTime(time) : null;
        addedAt = clock;
        /* the form */
        const form = mine.find((p) => p.kind === "addtime-form");
        if (!form) c.fail(j.id, `step ${s.id}`, `the time box did not open from the ${s.via === "pdf" ? "PDF's link" : "page's #add-time"}`, "");
        else {
          const t = norm(form.text);
          if (!t.includes(norm(ADD_TIME.title))) c.fail(j.id, docName(form), `the form's heading "${ADD_TIME.title}" is missing`, "");
          if (!t.includes(norm(ADD_TIME.intro(s.tier)))) c.fail(j.id, docName(form), "the form's opening line is missing or not the tier's", ADD_TIME.intro(s.tier));
          if (/i don.t know|know (my|their) birth time/i.test(form.text)) c.fail(j.id, docName(form), "the form offers \"I don't know\" (the time has just been found)", "");
          if (!(form.buttons ?? []).includes(ADD_TIME.button(s.tier))) c.fail(j.id, docName(form), `the button is not "${ADD_TIME.button(s.tier)}"`, (form.buttons ?? []).join(" | "));
          const kept = birth ? birthLine({ date: birth.date, time: null, timeKnown: false, place: birth.pick, zone: birth.zone }).split(" · ").filter((x) => !/^Time unknown/.test(x)).join(" · ") : null;
          // "Kept from your chart", or "Kept from your summary" on the summary tier (10/22).
          const keptAt = form.text.split("\n").findIndex((l) => /^Kept from your (chart|summary)$/i.test(l.trim()));
          const label = keptAt >= 0 ? form.text.split("\n")[keptAt].trim() : null;
          if (label && norm(label) !== norm(ADD_TIME.kept(s.tier))) c.fail(j.id, docName(form), `the kept line is labeled "${label}", not "${ADD_TIME.kept(s.tier)}"`, "");
          if (/\b(?:corrected|correction)\b/i.test(form.text)) c.fail(j.id, docName(form), "the form speaks of a correction (a time found later is not one)", "");
          if (s.tier === 0 && /\bthis chart\b|\byour PDF\b/.test(form.text)) c.fail(j.id, docName(form), "the summary's form says \"this chart\" or \"your PDF\" (a summary has neither)", "");
          const keptLine = keptAt >= 0 ? form.text.split("\n").slice(keptAt + 1).find((l) => l.trim())?.trim() : null;
          if (!keptLine) c.fail(j.id, docName(form), "the kept birth date and place are not shown with the form", "");
          else {
            if (kept && norm(keptLine) !== norm(kept)) c.fail(j.id, docName(form), "the kept line is not the chart's own date and place", `${keptLine} (want ${kept})`);
            if (/\d{1,2}:\d{2}\s?[AP]M|time unknown|noon/i.test(keptLine)) c.fail(j.id, docName(form), "the kept line shows a time (the time is what is being added)", keptLine);
          }
        }
        if (s.via === "pdf" && s.clockDays >= 6) {
          const exp = mine.find((p) => p.kind === "addtime-link-expired");
          if (!exp || !/expired|run out|six days/i.test(exp.text)) c.fail(j.id, `step ${s.id}`, `${s.clockDays} days on, the page's own link did not read as expired, so the PDF link's lasting was not shown`, clip(exp?.text ?? "", 160));
        }
        /* the chart, redone */
        const after = mine.find((p) => p.kind === "result");
        if (!after) c.fail(j.id, `step ${s.id}`, "no chart was captured after the time was added", "");
        else {
          const out = after.apiBody?.output ?? {};
          const t = norm(after.text);
          if (out.timeKnown !== true) c.fail(j.id, docName(after), "the chart after the time was added is still cast with an unknown time", "");
          if (out.timeSpread) c.fail(j.id, docName(after), "the chart after the time was added still keeps an unknown-time spread", "");
          if (after.apiBody?.addTime !== "used") c.fail(j.id, docName(after), `the page is told "${after.apiBody?.addTime}" where the offer is spent ("used")`, "");
          for (const h of hits(after.text, /PROVISIONAL/)) c.fail(j.id, docName(after), "PROVISIONAL is still on the page after the time was added", h.ctx);
          if (/cast at noon|charted at noon/.test(t)) c.fail(j.id, docName(after), "the page still says the chart is cast at noon", "");
          if (t.includes(norm("Found your birth time?"))) c.fail(j.id, docName(after), "the offer to add a birth time is still on the page after it was used", "");
          if ((after.linksList ?? []).some((l) => /#add-time$/.test(l.href))) c.fail(j.id, docName(after), "an \"add it here\" link is still on the page after the offer was used", "");
          if (clock && !after.text.includes(clock)) c.fail(j.id, docName(after), `the birth line lacks the added time (${clock})`, "");
          if (!/^Your birth time$/im.test(after.text) || (clock && !t.includes(norm(`Birth time added: ${clock}`)))) c.fail(j.id, docName(after), `the calm note ("Your birth time", "Birth time added: ${clock}") is missing`, "");
          // Nothing was wrong: never "correction" or "corrected" for a time found later (10/22).
          for (const h of hits(after.text, /\b(?:correction|corrected)\b/i)) c.fail(j.id, docName(after), "the note for an added time speaks of a correction", h.ctx);
          if (s.tier >= 2) {
            if (/being written/i.test(after.text)) c.fail(j.id, docName(after), "the reading was not written again for the redone chart (still \"being written\")", "");
            if (!after.apiBody?.written) c.fail(j.id, docName(after), "the redone chart has no reading", "");
          }
          if (s.tier >= 1) {
            const pages = after.pdfData?.pageText ?? [];
            if (!pages.length) c.fail(j.id, `PDF ${after.id}`, "no PDF captured for the redone chart", "");
            const all = pages.join("\n");
            for (const h of hits(all, /PROVISIONAL/)) c.fail(j.id, `PDF ${after.id}`, "PROVISIONAL is still in the PDF after the time was added", h.ctx);
            if (/Found\s+your\s+birth\s+time/i.test(all)) c.fail(j.id, `PDF ${after.id}`, "the PDF still offers to add a birth time", "");
            if ((after.pdfData?.links ?? []).some((l) => /\/t\//.test(l.href))) c.fail(j.id, `PDF ${after.id}`, "the PDF still carries an add-time link", "");
            if (pages.length && clock && !pages[0].replace(/\s+/g, " ").includes(clock)) c.fail(j.id, `PDF ${after.id} page 1`, `page 1's birth line lacks the added time (${clock})`, "");
          }
        }
        /* both ways in, again */
        const used = mine.filter((p) => p.kind === "addtime-used");
        const ways = s.tier >= 1 ? ["page", "pdf"] : ["page"];
        for (const via of ways) {
          const p = used.find((x) => x.via === via);
          if (!p) {
            c.fail(j.id, `step ${s.id}`, `the ${via === "pdf" ? "PDF's link" : "page's #add-time"}, opened again after the time was added, did not say it was used`, "");
            continue;
          }
          const t = norm(p.text);
          if (!t.includes(norm(MESSAGES["addtime-used"].heading))) c.fail(j.id, docName(p), `opened again from the ${via}, it does not say "${MESSAGES["addtime-used"].heading}"`, "");
          if (!/hd-readings@thechampagnemethod\.co/.test(p.text)) c.fail(j.id, docName(p), "the used note does not point to hd-readings@", "");
          if (t.includes(norm(ADD_TIME.title))) c.fail(j.id, docName(p), "the time box opens again after the time was added (once only)", "");
        }
        /* the email */
        const ready = (s.emails ?? []).filter((e) => /is ready/.test(e.subject));
        for (const e of ready) {
          const body = T_(e);
          if (!/\/r\/[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/.test(body)) c.fail(j.id, `email "${e.subject}"`, "the ready email for the redone chart has no link to it", "");
          // The second "ready" says what happened (10/22): "..., redone with your birth time".
          if (!/redone with (your|their) birth time$/.test(e.subject) || !/ready, redone with (your|their) birth time\./.test(body)) c.fail(j.id, `email "${e.subject}"`, "the ready email for the redone chart does not say it was redone with the birth time", "");
          for (const h of hits(body, /PROVISIONAL|cast at noon|Found your birth time/i)) c.fail(j.id, `email "${e.subject}"`, "the ready email for the redone chart still speaks of an unknown time", h.ctx);
        }
      }
    }
  }

  /* --------------------------------------- 3. Stripe next-step line (#4) */
  if (on("stripe-next-step")) {
    const c = add(check("stripe-next-step", "#4", "Stripe's line under Pay fits the purchase (no \"type your birth details\" on an upgrade that keeps them)", "custom_text.submit is what the buyer reads at the moment of paying."));
    for (const p of run.pages.filter((p) => p.kind === "stripe" && p.sessionBody)) {
      const s = p.sessionBody;
      const msg = s.rig?.params?.custom_text?.submit?.message ?? "";
      c.saw(p.journey);
      const upgrade = !!s.metadata?.upgrades;
      // A sentence that asks for the birth details ("Next: your birth date,
      // time and place"). One that names them as KEPT ("nothing to type: the
      // birth details you gave are kept") is the fix, and a kept-note in
      // ANOTHER sentence excuses nothing.
      const asks = sentences(msg).some((line) => /birth (?:date|time|details|place)|time and place/i.test(line) && !/\bnothing to (?:type|enter)\b|\bkept\b|\balready\b|\byou gave\b|\bon file\b/i.test(line));
      if (upgrade && asks) c.fail(p.journey, `Stripe page for ${p.id}`, "upgrade with kept details, but Stripe says the birth details come next", msg);
      if (!msg) c.fail(p.journey, `Stripe page for ${p.id}`, "no line under the Pay button");
    }
  }

  /* --------------------------------------- 4. confirm button per tier (#5) */
  if (on("confirm-button-tier")) {
    const c = add(check("confirm-button-tier", "#5", "The confirm button names the tier being bought", "\"make my reading\" on a chart upgrade promises the wrong thing."));
    for (const p of run.pages.filter((p) => p.kind === "confirm")) {
      c.saw(p.journey);
      const word = TIER[p.tier];
      for (const b of p.buttons ?? []) {
        const m = b.match(/^These are right\s*[—-]\s*make my (\w+)/i);
        if (m && m[1].toLowerCase() !== word) c.fail(p.journey, docName(p), `buying the ${word}, the button says "${b}"`, b);
      }
    }
  }

  /* ----------------------------- 5. someone new: "their", not "your" (#16 #19 W8) */
  if (on("someone-new-their")) {
    const c = add(check("someone-new-their", "#16 #19 W", "Someone-new pages, forms and emails speak of THEIR chart", "The buyer is not the person whose chart it is."));
    const yourChart = /\b(?:your|my) (?:birth (?:date|time|details|place)|centers?|incarnation cross|definition|chart(?! for)|summary|reading|type|authority|profile|bodygraph)\b/gi;
    const iDont = /I don['’]t know my birth time/i;
    const titleYour = /title of their chart:\s*[“"]Your Human Design[”"]/i;
    // Wording that matches "your <chart word>" and is right as it is. Each is
    // excused only where it stands (an excuse never covers its neighbors).
    const KEEP = [
      /Reading your bodygraph/gi, // the library guide's title, in every list of it
      /Your reading is made and sent/gi, // the purchase policy: the purchase is the buyer's
      /your (?:chart|summary|reading) (?:stays|is separate)/gi, // the buyer's own chart, named as theirs on purpose
      new RegExp(iDont.source, "gi"), // reported on its own below
    ];
    // What the BUYER reads: the cards, the form they fill, the emails to them.
    // The chart page and PDF are for the person whose chart it is ("The link
    // comes to you, to pass on"), so "your" is right there and is not checked.
    const buyerSide = new Set(["email", "form-blank", "form-filled", "someone-new-tiers"]);
    for (const d of custDocs.filter((d) => d.fresh && d.combo && buyerSide.has(d.kind))) {
      c.saw(d.combo);
      if (iDont.test(d.text)) c.fail(d.combo, d.where, "the someone-new form says \"I don't know my birth time\"", hits(d.text, iDont)[0]?.ctx);
      if (titleYour.test(d.text)) c.fail(d.combo, d.where, "the someone-new form says their chart will be titled \"Your Human Design\"", hits(d.text, titleYour)[0]?.ctx);
      const found = hitsOutside(d.text, yourChart, KEEP);
      // One finding per document, naming every wording it uses.
      if (found.length) {
        const words = [...new Set(found.map((h) => h.match.toLowerCase()))];
        c.fail(d.combo, d.where, `speaks to the buyer about the chart as theirs: ${words.map((w) => `"${w}"`).join(", ")}`, found[0].ctx);
      }
    }
    // A someone-new chart with no name must not take the BUYER's name as its title.
    for (const p of resultPages.filter((p) => p.fresh)) {
      const title = p.text.split("\n")[0].trim();
      const buyer = run.combos.journeys.find((j) => j.id === p.journey)?.buyer ?? "";
      const step = run.manifest.journeys.find((j) => j.id === p.journey)?.steps.find((s) => s.id === p.step);
      if (buyer && title.startsWith(buyer.split(" ")[0]) && step && !step.name) c.fail(p.journey, docName(p), `a chart for someone else, given no name, is titled with the buyer's name: "${title}"`, title);
    }
  }

  /* ----------------------------------------- 6. missing-field count (#1) */
  if (on("form-missing-count")) {
    const c = add(check("form-missing-count", "#1", "The form says how many things are still missing", "A blank form has three things left, not one."));
    for (const p of run.pages.filter((p) => p.kind === "form-blank")) {
      c.saw(p.journey);
      // Any count short of three is the same bug ("Two things left" too).
      const m = p.text.match(/\b(One|Two|1|2) things? left\b[^\n]*/i);
      if (m) c.fail(p.journey, docName(p), `blank form (date, place and time all empty) says ${/^(one|1)$/i.test(m[1]) ? "one thing is" : "two things are"} left`, m[0]);
      if (/THAT['’]S EVERYTHING/.test(p.text)) c.fail(p.journey, docName(p), "\"That's everything\" heading while three things are missing");
    }
  }

  /* ------------------------------------ 7. authority side note (#14) */
  if (on("authority-side-note")) {
    const c = add(check("authority-side-note", "#14", "The authority side note names the authority's own center", "\"CENTER: Single\" prints the definition where a center belongs."));
    for (const p of resultPages.filter((p) => p.apiBody.notes)) {
      const out = p.apiBody.output;
      c.saw(p.journey);
      for (const [section, notes] of Object.entries(p.apiBody.notes)) {
        for (const [label, value] of notes) {
          if (label !== "CENTER") continue;
          const want = AUTHORITY_CENTER[out.authority];
          if (!CENTERS.includes(value)) c.fail(p.journey, `${docName(p)}, side note beside "${section}"`, `CENTER: "${value}" is not a center (${out.authority} authority${want ? `, whose center is ${want}` : ", which has no deciding center"})`, `${label} · ${value}`);
          else if (want && value !== want) c.fail(p.journey, `${docName(p)}, side note`, `CENTER: ${value}, but ${out.authority} authority is the ${want}`);
        }
      }
      if (p.pdfData?.pageText?.length) {
        // The PDF's margin note, "CENTER" over its value: the same rule as the page's. An unknown
        // birth time's PROVISIONAL under the label (10/22) is the label's tag, not the value.
        const all = p.pdfData.pageText.join("\n");
        const want = AUTHORITY_CENTER[out.authority];
        for (const m of all.matchAll(/(?:^|\n)CENTER(?:[ \t]*\n[ \t]*PROVISIONAL)?(?:[ \t]*\n[ \t]*|[ \t]+)([^\n]+)/g)) {
          const v = m[1].trim();
          if (/^(?:Single|Split|Triple Split|Quadruple Split|None)$/.test(v)) c.fail(p.journey, `PDF ${p.id}`, `side note prints "CENTER ${v}" (a definition, not a center)`, `CENTER ${v}`);
          else if (!CENTERS.includes(v)) c.fail(p.journey, `PDF ${p.id}`, `side note prints "CENTER ${v}" (not a center)`, `CENTER ${v}`);
          else if (want && v !== want) c.fail(p.journey, `PDF ${p.id}`, `side note prints "CENTER ${v}", but ${out.authority} authority is the ${want}`, `CENTER ${v}`);
        }
      }
    }
  }

  /* ------------------------------------------- 8. PDF pages filled (#6) */
  if (on("pdf-page-fill")) {
    const c = add(check("pdf-page-fill", "#6", "No PDF page is left almost empty (under 15% filled) and no closing line is orphaned", "Measured on the rendered page: the share of its height that carries any ink."));
    const pdfs = run.pages.filter((p) => p.pdfData?.pageInfo);
    for (const p of pdfs) {
      c.saw(p.journey);
      const info = p.pdfData.pageInfo;
      info.forEach((pg, i) => {
        const text = p.pdfData.pageText[i] ?? "";
        const body = text.split("\n").filter((l) => !/HUMAN DESIGN by THE CHAMPAGNE METHOD|The Champagne Method Coaching and Consulting · thechampagnemethod\.co/.test(l));
        const words = body.join(" ").split(/\s+/).filter(Boolean).length;
        if (pg.fill < 0.15) {
          const orphan = /\babove\b/i.test(body.join(" ")) ? " — and it says \"above\" with nothing above it" : "";
          const onlyCard = /Talk it through with Jeremy/.test(text) && words < 70 ? " — only the coaching card" : "";
          c.fail(p.journey, `PDF ${p.id} page ${pg.n} of ${info.length}`, `${Math.round(pg.fill * 100)}% filled, ${words} words${orphan}${onlyCard}`, clip(body.join(" "), 200), { png: pg.png });
        }
      });
    }
  }

  /* ---------------------------------------------------- 9. links */
  if (on("links")) {
    const c = add(check("links", "links", "Every link opens (200) and every #anchor is there when the page loads with the hash", "Pages, PDFs, emails and the website's sample PDFs; live addresses on our own sites are checked against the local copies."));
    const APP_HASH = { new: "the /u/ page reads #new to open the someone-new cards (an app state, not an element)" };
    const pageById = Object.fromEntries(run.pages.map((p) => [p.id, p]));
    for (const l of run.links.filter((l) => l.kind === "ours")) {
      c.saw("links");
      const where = l.where.slice(0, 3).join(", ") + (l.count > 3 ? ` (+${l.count - 3} more)` : "");
      const combo = (l.where[0] ?? "").split(":")[1]?.split("-")[0] ?? "links";
      if (l.status !== 200) {
        c.fail(combo, where, `${l.status} for ${l.href}`);
        continue;
      }
      if (!l.anchor || l.anchor === "in-view") continue;
      const frag = l.href.split("#")[1];
      if (APP_HASH[frag]) continue;
      // A same-page jump link is pressed on the page itself: the anchor must exist there.
      const src = l.where.map((w) => pageById[w.split(":")[1]]).find((p) => p && p.url.split("#")[0] === l.local.split("#")[0]);
      if (src && (src.ids ?? []).includes(decodeURIComponent(frag))) continue;
      if (src && !src.ids && l.anchor === "present-not-in-view") continue;
      c.fail(combo, where, `#${frag} ${l.anchor === "missing" ? "does not exist" : "exists but is not in view"} when ${l.href.replace(/^https?:\/\/[^/]+/, "")} loads`, l.href);
    }
    const ext = run.links.filter((l) => l.kind === "external");
    c.note = `${ext.length} links to other sites (${[...new Set(ext.map((l) => l.href.split("/")[2]))].join(", ")}) are not opened unless HD_LIVE_LINKS=1.`;
  }

  /* ----------------------------- 10. near-miss banned words (#9 #15) */
  if (on("near-miss-words")) {
    const c = add(check("near-miss-words", "#9 #15", "No near-miss of a banned word, and no other type's feeling word, in what a buyer reads", "Banned words were matched exactly, so \"not-sf\" and \"frustrated\" (in a Projector's reading) passed the checker."));
    const BANNED = ["notself", "signature"];
    const readingsToRead = resultPages.filter((p) => p.tier >= 2 && p.apiBody.written).map((p) => ({ journey: p.journey, where: docName(p), out: p.apiBody.output, w: p.apiBody.written }));
    const known = new Set(readingsToRead.map((r) => JSON.stringify(r.w)));
    for (const f of loadReadingFixtures(fixtures)) {
      if (known.has(JSON.stringify(f.record.written))) continue;
      known.add(JSON.stringify(f.record.written));
      readingsToRead.push({ journey: "stored readings", where: `stored live reading ${f.source} (${f.record.output.type})`, out: f.record.output, w: f.record.written });
    }
    for (const r of readingsToRead) {
      const out = r.out;
      const w = r.w;
      const p = { journey: r.journey };
      const docName = () => r.where;
      c.saw(p.journey);
      // A stored reading was delivered before the fix; what matters now is
      // that the shop's checker would refuse it. Its findings are held, then
      // judged by that checker below.
      const found = [];
      const flag = (...a) => (r.journey === "stored readings" ? found.push(a) : c.fail(...a));
      const placeholder = JSON.stringify(w).includes("[RIG PLACEHOLDER]");
      if (placeholder) continue;
      const own = FEELINGS[out.type] ?? [];
      // The off-track words anywhere in on/off-track text; the on-track words
      // only where they are named as a feeling (success and peace are ordinary words).
      const NEG = ["frustrat", "bitter", "anger", "angry", "disappoint"];
      const POS = ["satisf", "success", "peace", "surpris"];
      const othersNeg = NEG.filter((f) => !own.includes(f) && !(own.includes("anger") && f === "angry"));
      const othersPos = POS.filter((f) => !own.includes(f));
      const track = [w.summary?.Signature, w.summary?.["Not-self"], ...(w.sections ?? []).filter((s) => /on track/i.test(s.heading)).flatMap((s) => [s.lede, ...(s.paragraphs ?? [])])].filter(Boolean).join(" ");
      const all = [Object.values(w.summary ?? {}).join(" "), ...(w.sections ?? []).flatMap((s) => [s.lede, ...(s.paragraphs ?? [])])].filter(Boolean).join(" ");
      // A near miss shares the banned word's opening ("not-s", "sig") and is within
      // two letters of it, so ordinary words ("itself") are not taken for one.
      const seenTok = new Set();
      for (const tok of all.match(/[A-Za-z][A-Za-z-]{2,}/g) ?? []) {
        const t = tok.toLowerCase().replace(/-/g, "");
        if (BANNED.includes(t) || seenTok.has(t)) continue;
        const near = (t.startsWith("nots") && /^not-?s/i.test(tok) && editDistance(t, "notself") <= 3) || (t.startsWith("sig") && editDistance(t, "signature") <= 2);
        if (near) {
          seenTok.add(t);
          flag(p.journey, docName(p), `"${tok}" is a near miss of the banned "${t.startsWith("sig") ? "signature" : "not-self"}"`, around(all, all.indexOf(tok), tok.length));
        }
      }
      for (const f of othersNeg) {
        for (const h of hits(track, new RegExp(`\\b${f}\\w*`, "i"))) flag(p.journey, `${docName(p)}, on track / off track`, `"${h.match}" is another type's feeling word (a ${out.type}'s are ${out.signature} / ${out.notSelfTheme})`, h.ctx);
      }
      for (const f of othersPos) {
        for (const h of hits(track, new RegExp(`\\bfeel\\w*\\s+(?:\\w+\\s+){0,3}${f}\\w*`, "i"))) flag(p.journey, `${docName(p)}, on track / off track`, `"${h.match}": another type's feeling word (a ${out.type}'s are ${out.signature} / ${out.notSelfTheme})`, h.ctx);
      }
      if (found.length) {
        const why = await shopProblem(w, out, checker);
        if (why) (c.delivered ??= []).push(`${r.where}: ${found.length} finding(s); the shop's checker now refuses it (${String(why).slice(0, 90)})`);
        else for (const a of found) c.fail(...a);
      }
    }
    // The shop's own checker, probed with the near-misses it must refuse.
    const probe = await checkerProbe(run, checker);
    for (const pr of probe) {
      c.saw("checker");
      if (!pr.refused) c.fail("checker", "the shop's reading checker (interpretation.mjs firstProblem)", `lets "${pr.word}" through in the ${pr.where} of a ${pr.type} reading`, pr.sample);
    }
    // A probe that found nothing to probe from is said, not passed in silence.
    c.probed = probe.length;
    c.note = probe.length ? `The shop's checker was probed with ${probe.length} near-misses (${[...new Set(probe.map((p) => p.type))].join(", ")}).` : "The shop's checker was NOT probed: no real (non-placeholder) reading on this run's pages that the checker accepts as it is.";
    if (c.delivered?.length) c.note += ` Stored readings delivered before the fix, now refused by the checker: ${c.delivered.join("; ")}.`;
  }

  /* ----------------------------------- 11. doubled sentences (W, AI) */
  if (on("doubled-text")) {
    const c = add(check("doubled-text", "W AI", "Nothing is said twice on one page, PDF or email", "The same clause (6+ words) twice in one document: a heading repeated as its first line, a takeaway printed in Start here and again as the section's opening line."));
    // Units are sentences and their clauses; a heading, a button or a table
    // label repeated is layout, so a repeat counts only when at least one of
    // its copies is written as a sentence (ends . ! ?).
    const unitsOf = (text, placeholder) =>
      text
        .split(/\n+/)
        .flatMap((line) => sentences(line))
        .flatMap((s) => {
          const whole = /[.!?]["”)]?$/.test(s);
          return s.split(/\s+[—–]\s+|;\s+|:\s+/).map((u) => ({ u, whole }));
        })
        .map(({ u, whole }) => ({ u: u.replace(/^[“"(]+|[”")]+$/g, "").replace(/[.!?,]+$/, "").trim(), whole }))
        .filter(({ u }) => u.split(/\s+/).length >= 6 && !/Cross of .*\(\d+\/\d+ \|/.test(u))
        .filter(({ u }) => !placeholder || inSource(u));
    const groups = new Map();
    for (const d of custDocs) {
      if (d.kind === "pdf") {
        const key = d.id.replace(/\.p\d+$/, "");
        if (!groups.has(key)) groups.set(key, { ...d, where: `PDF ${d.page.id}`, text: "" });
        groups.get(key).text += "\n" + d.text.split("\n").filter((l) => !/HUMAN DESIGN by THE CHAMPAGNE METHOD|Coaching and Consulting · thechampagnemethod\.co/.test(l)).join("\n");
      } else if (d.kind === "sample") continue;
      // The library repeats its card labels and pull lines by design; the
      // website pages that describe the readings are still read.
      else if (d.kind === "website" && !/^\/readings\//.test(d.page?.path ?? "")) continue;
      else groups.set(d.id, d);
    }
    /**
     * THE ONE COPY BY DESIGN (fix 1A, Jeremy 10/19): "Your chart in three lines"
     * on the reading tier shows the reading's first try-this line, moved up
     * whole, under "Something to try this week"; the list below still holds it.
     * That one copy is left out of the count; a second copy anywhere else, or
     * the same line twice in the list, is still a repeat.
     */
    const withoutBoxCopy = (text) => text.replace(/^(Something to try this week\s*\n)[^\n]*\n?/gm, "$1");
    for (const d of groups.values()) {
      c.saw(d.combo);
      const count = new Map();
      const text = d.kind === "pdf" || d.kind === "email" ? d.text : withoutBoxCopy(d.text);
      for (const { u, whole } of unitsOf(text, text.includes("[RIG PLACEHOLDER]"))) {
        const k = norm(u);
        const was = count.get(k);
        count.set(k, { n: (was?.n ?? 0) + 1, u, whole: (was?.whole ?? false) || whole });
      }
      const dups = [...count.values()].filter((x) => x.n > 1 && x.whole);
      // Merge overlaps: keep the longest of nested repeats.
      const kept = dups.filter((x) => !dups.some((y) => y !== x && norm(y.u).includes(norm(x.u))));
      for (const x of kept) c.fail(d.combo, d.where, `said ${x.n} times: "${clip(x.u, 120)}"`, "", { ai: !inSource(x.u) });
    }
  }

  /* ------------------------------ 12. my-charts rows distinguishable (#8) */
  if (on("my-charts-rows")) {
    const c = add(check("my-charts-rows", "#8", "\"Email me my charts\": every row can be told apart, and no chart is listed twice", "Older purchases all read \"Your reading · The reading\"; one chart was listed twice."));
    for (const e of run.emails.filter((e) => e.kind === "my-charts")) {
      c.saw("my-charts");
      const lines = e.text.split(/\r?\n/);
      const rowsOut = [];
      for (let i = 0; i < lines.length - 1; i++) if (/^(Open|Enter the birth details):\s*http/.test(lines[i + 1].trim())) rowsOut.push({ label: lines[i].trim(), url: lines[i + 1].replace(/^[^:]+:\s*/, "").trim() });
      const byLabel = new Map();
      for (const r of rowsOut) byLabel.set(r.label, [...(byLabel.get(r.label) ?? []), r]);
      for (const [label, rs] of byLabel) if (rs.length > 1) c.fail("my-charts", `email "${e.subject}"`, `${rs.length} rows read exactly "${label}"`);
      // The same chart twice: two rows whose links open the same chart values.
      c.rows = rowsOut.length;
    }
    // Same chart (same engine values) listed twice, from the store side.
    // (Read whether or not this run seeded older purchases: a chart listed twice
    // is the same bug either way.)
    const mc = run.emails.find((e) => e.kind === "my-charts");
    if (mc) {
      const sigs = new Map();
      const recs = run.pages.filter((p) => p.kind === "result").map((p) => ({ id: p.record?.id, out: p.apiBody?.output }));
      const root = join(run.runDir, "blobs", "entries", "rig-local");
      const store = existsSync(root) ? readdirSync(root).find((d) => /(^|:)readings$/.test(decodeURIComponent(d))) : null;
      const blobDir = store ? join(root, store) : root;
      for (const tokenUrl of mc.text.match(/\/r\/[A-Za-z0-9_.-]+/g) ?? []) {
        const body = tokenUrl.slice(3).split(".")[0];
        let id = null;
        try {
          id = JSON.parse(Buffer.from(body.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8")).r;
        } catch {
          continue;
        }
        let out = recs.find((r) => r.id === id)?.out ?? null;
        if (!out && existsSync(join(blobDir, id))) out = JSON.parse(readFileSync(join(blobDir, id), "utf8")).output;
        if (!out) continue;
        // (Joined with a tab: a cross name carries its own "|".)
        const sig = [out.type, out.profile, out.incarnationCross, (out.definedCenters ?? []).join(",")].join("\t");
        sigs.set(sig, [...(sigs.get(sig) ?? []), id]);
      }
      for (const [sig, ids] of sigs) if (ids.length > 1) c.fail("my-charts", `email "${mc.subject}"`, `one chart listed ${ids.length} times (${sig.split("\t").slice(0, 3).join(", ")})`);
    }
  }

  /* --------------------------------------- 13. my-charts time budget (#7) */
  if (on("my-charts-time")) {
    const c = add(check("my-charts-time", "#7", "\"Email me my charts\" answers within 6 s for a heavy inbox at the live store's speed", "Each Blobs request is slowed to 400 ms (measured live: a hit costs 380-450 ms)."));
    const t = run.manifest.timings?.myCharts;
    c.saw("my-charts");
    const n = run.emails.find((e) => e.kind === "my-charts")?.text.match(/\/r\//g)?.length ?? 0;
    if (!t) c.fail("my-charts", "my-charts", "not measured");
    else if (t.seconds > 6) c.fail("my-charts", "\"Sending…\" on /charts", `${t.seconds} s for ${n} charts (${t.blobOps} store requests at ${t.latencyMs} ms each)`);
    c.measured = t;
  }

  /* ------------------------------ 14. readings site unknown link (#18) */
  if (on("readings-site-unknown")) {
    const c = add(check("readings-site-unknown", "#18", "The phone readings site does not call a link that never existed \"expired\"", "A mistyped link sends the client to ask for a fresh copy of nothing."));
    const p = run.pages.find((p) => p.kind === "readings-site-unknown");
    if (p) {
      c.saw("readings site");
      // The page saying THIS link expired; a line about expired links in general
      // ("an expired link offers a fresh one") is not that claim.
      if (/\b(?:this|the|your) link (?:has )?expired\b|\bhas expired\b|\blink expired\b/i.test(p.text)) c.fail("readings site", "readings.thechampagnemethod.co/r/<never existed>", "says the link has expired", clip(p.text.split("\n").filter(Boolean).slice(1, 3).join(" "), 200));
    } else c.human = "the phone repo's hosting/ was not found next to hd-site";
  }

  /* ------------------------- 15. website claims vs behaviour (#10 #11 #12) */
  if (on("website-claims")) {
    const c = add(check("website-claims", "#10 #11 #12", "What the website says about the readings matches what the shop does", "Read against the run: Stripe's phone setting, what each tier keeps, and the shop's own words."));
    const web = (path) => run.pages.find((p) => p.kind === "website" && p.path === path);
    const readings = web("/readings/");
    const privacy = web("/readings/privacy/");
    const sessions = run.pages.filter((p) => p.sessionBody).map((p) => p.sessionBody);
    const phoneAsked = sessions.some((s) => String(s.rig?.params?.phone_number_collection?.enabled) === "true");
    const summaryKeeps = resultPages.some((p) => p.tier === 0 && p.apiBody.birthLine);
    for (const [doc, name] of [[readings, "/readings/"], [privacy, "/readings/privacy/"]]) {
      if (!doc) continue;
      c.saw("website");
      if (!phoneAsked) {
        // A phone number tied to paying: on its own line (a table row) or the
        // next. The in-person readings' row ("the phone number or email you
        // give", kept in the app on Jeremy's phone) is not about payment.
        const lines = doc.text.split(/\r?\n/);
        lines.forEach((line, i) => {
          const near = `${line} ${lines[i + 1] ?? ""}`;
          const said = /receive your name, email and phone|email and phone from your purchase/i.test(line) || (/phone number/i.test(line) && /payment|Stripe|checkout|purchase/i.test(near));
          if (said) c.fail("website", `website ${name}`, "says a phone number is collected at payment; every checkout in this run has phone collection off", clip(line, 220));
        });
      }
      if (summaryKeeps) for (const h of hits(doc.text, /summary keeps none|summary keeps no|summary (?:does not|doesn't) keep/i)) c.fail("website", `website ${name}`, "says the summary keeps no birth details; the summary keeps them (its page shows the birth line)", h.ctx);
      // Not-self in any case ("Not-self Theme" too); signature only as the term
      // (capitalized), not the ordinary word.
      for (const h of hits(doc.text, /\bSignature\b|SIGNATURE|\b[Nn]ot-[Ss]elf\b|NOT-SELF/)) c.fail("website", `website ${name}`, `"${h.match}" — the shop says "on track" / "off track"`, h.ctx);
    }
    if (!readings) c.human = "the website was not running (no ../the-champagne-method)";
  }

  /* --------------------------------------------- 16. sample PDFs (#13) */
  if (on("sample-pdfs")) {
    const c = add(check("sample-pdfs", "#13", "The website's sample PDFs look like today's PDFs (current title, no \"Timezone:\" line)", "Compared with the PDFs this run's shop produced."));
    const shopTitle = resultPages.find((p) => p.pdfData?.pageText?.[0])?.pdfData.pageText[0].split("\n")[1]?.trim() ?? "";
    for (const s of run.samples) {
      c.saw("website");
      const all = s.pageText.join("\n");
      for (const h of hits(all, /Timezone:\s*UTC[^\n]*/)) c.fail("website", `sample PDF ${s.published}`, "prints a \"Timezone:\" line (the shop's PDFs dropped it)", h.match);
      const first = s.pageText[0]?.split("\n").map((l) => l.trim()).filter(Boolean).slice(0, 3) ?? [];
      const titled = first.some((l) => /’s Human Design$|'s Human Design$/.test(l));
      // Evidence: the PDF's own title field, when it has one (the driver records a missing one as "None").
      if (/’s Human Design$/.test(shopTitle) && !titled) c.fail("website", `sample PDF ${s.published}`, `old title: "${first.join(" / ")}" (shop PDFs: "<name>’s Human Design")`, s.title && s.title !== "None" ? `PDF title field: ${s.title}` : "");
    }
  }

  /* ----------------------- 17. US spelling, and "shop" never to a buyer */
  if (on("us-spelling-no-shop")) {
    const c = add(check("us-spelling-no-shop", "rules", "US spelling everywhere, and \"shop\" never in customer copy", "Jeremy's rule: Center, colored. The shop is \"Human Design by The Champagne Method\" to a buyer."));
    const UK = /\b(centre[sd]?|colour\w*|behaviour\w*|favourite\w*|honour\w*|organis(?:e|ed|es|ing|ation)\w*|recognis(?:e|ed|es|ing)\b|realis(?:e|ed|es|ing)\b|universalis\w*|analys(?:e|ed|ing)\b|programme\w*|travell\w+|labell\w+|catalogue\w*|grey\b|whilst|amongst|licence|defence|practis(?:e|ed|es|ing)\b|apologis\w+|emphasis(?:e|ed|es|ing)\b|minimis\w+|prioritis\w+|criticis(?:e|ed|es|ing)\b|summaris\w+|characteris\w+|energis\w+|judgement)/gi;
    const SHOP = /\bshop\b/gi;
    for (const d of custDocs) {
      c.saw(d.combo);
      const text = d.text.replace(/https?:\/\/\S+/g, "");
      const seen = new Set();
      for (const h of hits(text, UK)) {
        const k = h.match.toLowerCase();
        if (seen.has(k)) continue;
        seen.add(k);
        c.fail(d.combo, d.where, `UK spelling "${h.match}"`, h.ctx, { ai: !inSource(sentenceAround(text, h.match)) });
      }
      for (const h of hits(text, SHOP)) c.fail(d.combo, d.where, `"shop" in customer copy`, h.ctx);
    }
  }

  /* ---------------------------------- 18. tier-aware copy (W, #4 kin) */
  if (on("tier-aware-copy")) {
    const c = add(check("tier-aware-copy", "W", "Copy fits the tier and the moment (summary has no drawing; summary and chart have no \"reading\"; nothing to wait for)", "Each tier's pages, PDFs and emails, read for promises another tier makes."));
    for (const d of custDocs.filter((d) => Number.isInteger(d.tier))) {
      c.saw(d.combo);
      if (d.tier === 0) for (const h of hits(d.text, /Below: your chart and its tables/)) c.fail(d.combo, d.where, "the summary says a chart drawing and tables follow (the summary has no drawing)", h.ctx);
      if (d.tier < 2) {
        for (const h of hits(d.text, /every word in your reading explained/i)) c.fail(d.combo, d.where, `"your reading" on a ${TIER[d.tier]}`, h.ctx);
        if (d.kind === "email") for (const h of hits(d.text, /while you wait/i)) c.fail(d.combo, d.where, `"While you wait" in a ${TIER[d.tier]} email (nothing is being written)`, h.ctx);
      }
      if (d.kind === "pdf" && d.tier === 1) for (const h of hits(d.text, /HUMAN DESIGN INTERPRETATION/)) c.fail(d.combo, d.where, "the chart-only PDF is headed \"HUMAN DESIGN INTERPRETATION\"", h.ctx);
      if (d.kind === "pdf") {
        // Where the PDF names the guide, the address it gives (in that sentence
        // or the next) must be the guide's own.
        const flat = d.text.replace(/\s+/g, " ");
        const END = /[.!?][”"’)]?(?=\s|$)/g;
        for (const h of hits(flat, /Reading your bodygraph/)) {
          const before = [...flat.slice(0, h.index).matchAll(END)].pop();
          const from = before ? before.index + before[0].length : 0;
          const after = [...flat.slice(h.index).matchAll(END)].slice(0, 2).pop();
          const to = Math.min(after ? h.index + after.index + after[0].length : flat.length, h.index + 300);
          const span = flat.slice(from, to).trim();
          if (/thechampagnemethod\.co\/[\w/-]+/.test(span) && !/thechampagnemethod\.co\/library\/bodygraph/.test(span)) c.fail(d.combo, d.where, "names the bodygraph guide but prints only the library's address", "…" + flat.slice(Math.max(from, h.index - 100), to).trim());
        }
      }
    }
  }

  /* -------------------------------- 19. punctuation and small style (W) */
  if (on("style")) {
    const c = add(check("style", "W", "Small style: no stray periods on table values, no spaced hyphen for a dash, \"of the\" lower case, US date order, current footer and privacy dates", "Each is a one-line fix; together they are what makes the page read as finished."));
    for (const p of resultPages) {
      c.saw(p.journey);
      const r = rows(p.text);
      // A value standing alone takes no period ("Projector"). On a reading the
      // row is the value, then the reading's own sentence about it ("Projector.
      // You guide…"): there the period closes the value before a sentence, and
      // the line ends with the sentence's period, which is prose.
      for (const label of ["TYPE", "STRATEGY", "AUTHORITY", "PROFILE"]) {
        const v = r[label]?.replace(/PROVISIONAL$/i, "").trim();
        if (v && /\.$/.test(v) && !/\.\s+\S/.test(v)) c.fail(p.journey, docName(p), `${label} value ends with a period: "${r[label]}"`, "", { once: label });
      }
    }
    const HINT = /\d{8} for \d{1,2} [A-Z][a-z]+ \d{4}/g;
    for (const d of custDocs) {
      for (const h of hits(d.text, /[A-Za-z]\s-\s[A-Za-z]/)) c.fail(d.combo, d.where, "a spaced hyphen used as a dash", h.ctx, { ai: !inSource(sentenceAround(d.text, h.match)) });
      for (const h of hits(d.text, /Cross of The [A-Z]/)) c.fail(d.combo, d.where, `capital "The" inside a cross name: "${h.match}…"`, h.ctx);
      // (A date inside the date hint is reported once, as the hint.)
      for (const h of hitsOutside(d.text, /\b\d{1,2} (?:January|February|March|April|May|June|July|August|September|October|November|December) \d{4}\b/, [HINT])) c.fail(d.combo, d.where, `UK date order "${h.match}"`, h.ctx);
      for (const h of hits(d.text, HINT)) c.fail(d.combo, d.where, "the date hint gives a UK-order example", h.ctx);
    }
    // Website footer version date and the privacy page's "Last updated".
    const site = SIBLINGS.website;
    let gitDate = websiteGit;
    if (!gitDate && existsSync(site)) {
      const { execFileSync } = await import("node:child_process");
      gitDate = (args) => {
        try {
          return new Date(execFileSync("git", ["log", "-1", "--format=%cI", ...args], { cwd: site, encoding: "utf8" }).trim());
        } catch {
          return null;
        }
      };
    }
    if (gitDate) {
      const head = gitDate([]);
      for (const p of run.pages.filter((p) => p.kind === "website")) {
        const m = p.text.match(/v\d+\.\d+\s*·\s*([A-Z][a-z]{2,8}) (\d{4})/);
        if (m && head) {
          const d = new Date(`${m[1]} 1, ${m[2]}`);
          if (!isNaN(d) && (head - d) / 86400_000 > 62) c.fail("website", `website ${p.path} footer`, `"${m[0]}" while the site last changed ${head.toISOString().slice(0, 10)}`, m[0], { once: "footer" });
        }
      }
      const priv = run.pages.find((p) => p.kind === "website" && p.path === "/readings/privacy/");
      const changed = gitDate(["--", "readings/privacy", "src/library/article"]);
      // Either order: once the date reads "October 20, 2026" it is still read.
      const m = priv?.text.match(/Last updated (?:(\d{1,2}) ([A-Z][a-z]+)|([A-Z][a-z]+) (\d{1,2}),?) (\d{4})/);
      if (m && changed) {
        const said = new Date(`${m[2] ?? m[3]} ${m[1] ?? m[4]}, ${m[5]}`);
        if (changed - said > 86400_000) c.fail("website", "website /readings/privacy/", `"${m[0]}" but its text last changed ${changed.toISOString().slice(0, 10)}`, m[0]);
      }
    }
    // One finding per label per page is plenty for the period rule.
    const seen = new Set();
    c.findings = c.findings.filter((f) => {
      const k = `${f.where}|${f.what}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  }

  /* ---------------------------------- 20. drawing vs table names (W) */
  if (on("drawing-names")) {
    const c = add(check("drawing-names", "W", "The drawing names the centers the way the tables do", "\"EGO\" on the bodygraph, \"Heart\" in every table."));
    for (const p of resultPages.filter((p) => p.apiBody.output?.bodygraphSvg)) {
      c.saw(p.journey);
      const labels = [...p.apiBody.output.bodygraphSvg.matchAll(/<text[^>]*>([^<]+)<\/text>/g)].map((m) => m[1].trim()).filter((t) => /^[A-Z][A-Z ]+$/.test(t));
      const tableWords = new Set(CENTERS.map((x) => x.toUpperCase()));
      for (const l of new Set(labels)) if (!tableWords.has(l) && !["SOLAR", "PLEXUS"].includes(l)) c.fail(p.journey, docName(p), `drawing label "${l}" is not a center name the tables use`, "", { once: l });
    }
    const seen = new Set();
    c.findings = c.findings.filter((f) => (seen.has(f.what) ? false : (seen.add(f.what), true)));
  }

  /* --------------------------------- 21. correction note persists (W) */
  if (on("correction-note")) {
    const c = add(check("correction-note", "W", "A correction (Change a detail) stays noted after the chart grows", "Maya's \"Your correction\" note disappeared once the chart became a reading."));
    for (const j of run.manifest.journeys) {
      const plan = run.combos.journeys.find((x) => x.id === j.id);
      const at = plan?.steps.findIndex((s) => s.correct);
      if (at === undefined || at < 0) continue;
      c.saw(j.id);
      const later = resultPages.filter((p) => p.journey === j.id && Number(p.step.split("-")[1]) > at + 1);
      const corrected = resultPages.find((p) => p.journey === j.id && Number(p.step.split("-")[1]) === at + 1);
      if (corrected && !corrected.apiBody.correction) c.fail(j.id, docName(corrected), "the corrected chart carries no correction note");
      for (const p of later) if (!p.apiBody.correction && !/correction/i.test(p.text)) c.fail(j.id, docName(p), `the correction made at step ${at + 1} is no longer noted on the ${TIER[p.tier]}`);
    }
  }

  /* ------------------------------------- 22. fresh-link email (W) */
  if (on("fresh-link-email")) {
    const c = add(check("fresh-link-email", "W", "The fresh-link email says it is a fresh link", "Sent from the expired-link page; it was the plain \"is ready\" email."));
    const e = run.emails.filter((e) => e.kind === "fresh-link");
    c.saw("expired link");
    if (!e.length) c.fail("expired link", "expired-link page", "pressing the button sent no email");
    for (const m of e) if (!/fresh link|new link/i.test(m.text.split("\n").slice(0, 6).join(" ") + m.subject)) c.fail("expired link", `email "${m.subject}"`, "reads as the plain \"is ready\" email; nothing says this is the fresh link they asked for", m.text.split("\n").slice(0, 3).join(" "));
  }

  /* ----------------------------------------- 23. phone width (390px) */
  if (on("phone-width")) {
    const c = add(check("phone-width", "rules", "No page is wider than a phone (390 px)", "Every page state, measured at 390 px."));
    for (const p of run.pages) {
      c.saw(p.journey ?? p.kind);
      if (p.phoneScrollWidth > 392) c.fail(p.journey ?? p.kind, docName(p), `${p.phoneScrollWidth}px wide at 390px`);
    }
  }

  /* ------------------------------------- 24. two emails per purchase */
  if (on("two-emails")) {
    const c = add(check("two-emails", "rules", "Each purchase sends two emails: the receipt, then one \"ready\"; a birth time added sends the one \"ready\"", "Jeremy 10/19 (fix 4A): two, not three; never none. A birth time added (10/22) is no purchase: no receipt, and the chart redone is said in one \"ready\" email with a fresh link."));
    for (const j of run.manifest.journeys)
      for (const s of j.steps) {
        c.saw(j.id);
        const mine = (s.emails ?? []).filter((e) => !/^HD readings:/.test(e.subject));
        const receipts = mine.filter((e) => /^Receipt/.test(e.subject)).length;
        const ready = mine.filter((e) => /is ready/.test(e.subject)).length;
        const want = s.do === "add-time" ? 0 : 1;
        if (receipts !== want || ready !== 1) c.fail(j.id, `step ${s.id}`, `${receipts} receipt(s) and ${ready} "ready" email(s)${s.do === "add-time" ? " for a birth time added (want none and one)" : ""}`, mine.map((e) => e.subject).join(" | "));
      }
  }

  /* --------------------------------------------- 25. AI writing (AI) */
  if (on("ai-writing")) {
    const c = add(check("ai-writing", "AI", "The written reading: firm try-this lines, whole sentences in the glance rows, no known word slips", "Real stored readings only (placeholders skipped). Fixed in the prompt and checker, not by a deploy."));
    const readingsSeen = [];
    // The readings the journeys replayed, then every other stored live reading
    // in the data home (what buyers were actually sent since 10/4).
    const shown = resultPages.filter((p) => p.tier >= 2 && p.apiBody.written).map((p) => ({ combo: p.journey, where: docName(p), w: p.apiBody.written, out: p.apiBody.output }));
    const seenW = new Set(shown.map((s) => JSON.stringify(s.w)));
    for (const f of loadReadingFixtures(fixtures)) {
      const key = JSON.stringify(f.record.written);
      if (seenW.has(key)) continue;
      seenW.add(key);
      shown.push({ combo: "stored readings", where: `stored live reading ${f.source} (${f.record.output.type}, ${f.record.output.profile})`, w: f.record.written, out: f.record.output });
    }
    for (const s of shown) {
      const w = s.w;
      const p = { journey: s.combo, id: s.where };
      const docName = () => s.where;
      if (JSON.stringify(w).includes("[RIG PLACEHOLDER]")) continue;
      c.saw(p.journey);
      readingsSeen.push(p);
      // A stored reading was delivered before the fix: its findings stand only if
      // the shop's checker would still let it through (as for near-miss-words).
      const found = [];
      const flag = (...a) => (s.combo === "stored readings" ? found.push(a) : c.fail(...a));
      const take = (w.sections ?? []).find((s) => /experiment/i.test(s.heading))?.paragraphs?.slice(1) ?? [];
      const soft = take.filter((t) => /^\([^)]*\)\s*(Notice|Watch|Observe|Pay attention|Consider|See how|Try noticing)\b/i.test(t) || /^(Notice|Watch|Observe)\b/.test(t));
      if (take.length && soft.length / take.length >= 0.5) flag(p.journey, docName(p), `${soft.length} of ${take.length} try-this lines open softly ("Notice…", "Watch…", "Observe…")`, soft.slice(0, 2).join(" | "));
      for (const [k, v] of Object.entries(w.summary ?? {})) if (glanceFragment(v)) flag(p.journey, `${docName(p)}, glance row ${k}`, "a fragment, not a sentence (opens on an -ing word and has no main verb)", v);
      const all = [Object.values(w.summary ?? {}).join(" "), ...(w.sections ?? []).flatMap((s) => [s.lede, ...(s.paragraphs ?? [])])].filter(Boolean).join(" ");
      const SLIPS = [/\bbody graph\b/i, /\bThis mechanics\b/, /\bpeople you happen to inhabit\b/i, /\bEntering your open\b/i, /\bmaterial manipulation\b/i, /\bdeeply vulnerable\b/i, /\bmust ride out\b/i, /\bgates? (?:one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty)\b/i];
      for (const re of SLIPS) for (const h of hits(all, re)) flag(p.journey, docName(p), `word slip "${h.match}"`, h.ctx);
      if (found.length) {
        const why = await shopProblem(w, s.out, checker);
        if (why) (c.delivered ??= []).push(`${s.where}: ${found.length} finding(s); the shop's checker now refuses it (${String(why).slice(0, 90)})`);
        else for (const a of found) c.fail(...a);
      }
    }
    c.note = `${readingsSeen.length} real readings read (${readingsSeen.filter((r) => r.journey !== "stored readings").length} on this run's pages, the rest stored live readings).`;
    if (c.delivered?.length) c.note += ` Stored readings delivered before the fix, now refused by the checker: ${c.delivered.length}.`;
  }

  /* --------------------------------------- 26. changed words (baseline) */
  const diff = only ? null : baselineDiff({ runDir, baselineDir, docs });

  for (const c of checks) {
    c.combos = [...c.combos];
    delete c.fail;
    delete c.saw;
    if (c.status === "pass" && c.looked === 0) c.status = c.human ? "skip" : "skip";
  }
  return { at: new Date().toISOString(), runDir, commit: run.rig.commit, website: run.rig.website, engine: run.rig.engine, checks, diff, timings: run.manifest.timings, journeys: run.manifest.journeys.map((j) => ({ id: j.id, about: j.about, steps: j.steps.map((s) => ({ id: s.id, do: s.do, tier: s.tier, birth: s.birth, seconds: s.seconds, emails: (s.emails ?? []).length })) })), gemini: run.rig.gemini, pages: run.pages.length };
}

/**
 * THE CHECKER, PROBED. A stored reading that passes today's checker is taken
 * apart into the model's form, one near-miss is put into its on-track /
 * off-track lines, and the shop's own render + firstProblem is asked again.
 * Every near-miss must be refused. `stand` replaces the shop's firstProblem
 * (the self-test probes a checker it knows the answers of).
 */
/** The shop's own checker on a stored reading: the problem it names, or null when it would let it through. */
async function shopProblem(written, o, stand = null) {
  const lib = (f) => import(pathToFileURL(join(REPO, "netlify", "lib", f)).href);
  const { renderReading } = await lib("structured.mjs");
  const firstProblem = stand?.firstProblem ?? (await lib("interpretation.mjs")).firstProblem;
  const { formFromWritten } = await import("../harness/fakeGemini.mjs");
  const built = renderReading(formFromWritten(written), o);
  return built.problem ?? firstProblem(built.text, o.type, o.profile, o.openCenters, o.undefinedCenters, o.definedCenters);
}

async function checkerProbe(run, stand = null) {
  const lib = (f) => import(pathToFileURL(join(REPO, "netlify", "lib", f)).href);
  const { renderReading } = await lib("structured.mjs");
  const firstProblem = stand?.firstProblem ?? (await lib("interpretation.mjs")).firstProblem;
  const { formFromWritten } = await import("../harness/fakeGemini.mjs");
  const base = run.pages.filter((p) => p.kind === "result" && p.tier >= 2 && p.apiBody?.written && !JSON.stringify(p.apiBody.written).includes("[RIG PLACEHOLDER]"));
  const out = [];
  const byType = new Map();
  for (const p of base) if (!byType.has(p.apiBody.output.type)) byType.set(p.apiBody.output.type, p);
  for (const [type, p] of byType) {
    const o = p.apiBody.output;
    const other = type === "Projector" ? "frustrated" : type === "Manifestor" ? "bitter" : "bitter";
    const cases = [
      { word: "not-sf", where: "off-track line", put: (f) => (f.summary.notSelf = `Because your not-sf feeling is ${o.notSelfTheme.toLowerCase()}, it is a signal to pause.`) },
      { word: "not self", where: "off-track line", put: (f) => (f.summary.notSelf = `Your not self theme shows up as ${o.notSelfTheme.toLowerCase()} when you push.`) },
      { word: "signiture", where: "on-track line", put: (f) => (f.summary.signature = `Your signiture feeling is ${o.signature.toLowerCase()} when you wait.`) },
      { word: other, where: "on track / off track section", put: (f) => (f.working.paragraphs[0] = `${f.working.paragraphs[0]} When you force things, your energy becomes depleted and ${other}.`) },
    ];
    const clean = formFromWritten(p.apiBody.written);
    const cleanText = renderReading(clean, o).text;
    if (!cleanText || firstProblem(cleanText, o.type, o.profile, o.openCenters, o.undefinedCenters, o.definedCenters)) continue; // only probe from a reading the checker accepts
    for (const k of cases) {
      const f = JSON.parse(JSON.stringify(clean));
      if (!f.working?.paragraphs?.length) continue;
      k.put(f);
      const built = renderReading(f, o);
      const problem = built.problem ?? firstProblem(built.text, o.type, o.profile, o.openCenters, o.undefinedCenters, o.definedCenters);
      const sample = k.word === other ? `…your energy becomes depleted and ${other}.` : k.where === "on-track line" ? f.summary.signature : f.summary.notSelf;
      out.push({ type, word: k.word, where: k.where, refused: !!problem, why: problem, sample });
    }
  }
  return out;
}
