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
import { block, editDistance, inSource, loadRun, norm, rows, sentences, truthFor } from "./load.mjs";
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
    const c = add(check("provisional-marks", "#3 #17", "Unknown birth time: every Type / Authority / Profile shown is marked provisional, and so is what Type is made of", "Charted at noon. The three-lines box states Type, Authority and Profile too, and the centers decide the Type."));
    for (const p of resultPages.filter((p) => p.apiBody.output?.timeKnown === false)) {
      c.saw(p.journey);
      const t = p.text;
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
        // The PDF's margin note, "CENTER" over its value: the same rule as the page's.
        const all = p.pdfData.pageText.join("\n");
        const want = AUTHORITY_CENTER[out.authority];
        for (const m of all.matchAll(/(?:^|\n)CENTER(?:[ \t]*\n[ \t]*|[ \t]+)([^\n]+)/g)) {
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
    for (const d of groups.values()) {
      c.saw(d.combo);
      const count = new Map();
      for (const { u, whole } of unitsOf(d.text, d.text.includes("[RIG PLACEHOLDER]"))) {
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
    const c = add(check("two-emails", "rules", "Each purchase sends two emails: the receipt, then one \"ready\"", "Jeremy 10/19 (fix 4A): two, not three; never none."));
    for (const j of run.manifest.journeys)
      for (const s of j.steps) {
        c.saw(j.id);
        const mine = (s.emails ?? []).filter((e) => !/^HD readings:/.test(e.subject));
        const receipts = mine.filter((e) => /^Receipt/.test(e.subject)).length;
        const ready = mine.filter((e) => /is ready/.test(e.subject)).length;
        if (receipts !== 1 || ready !== 1) c.fail(j.id, `step ${s.id}`, `${receipts} receipt(s) and ${ready} "ready" email(s)`, mine.map((e) => e.subject).join(" | "));
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
      const take = (w.sections ?? []).find((s) => /experiment/i.test(s.heading))?.paragraphs?.slice(1) ?? [];
      const soft = take.filter((t) => /^\([^)]*\)\s*(Notice|Watch|Observe|Pay attention|Consider|See how|Try noticing)\b/i.test(t) || /^(Notice|Watch|Observe)\b/.test(t));
      if (take.length && soft.length / take.length >= 0.5) c.fail(p.journey, docName(p), `${soft.length} of ${take.length} try-this lines open softly ("Notice…", "Watch…", "Observe…")`, soft.slice(0, 2).join(" | "));
      for (const [k, v] of Object.entries(w.summary ?? {})) if (glanceFragment(v)) c.fail(p.journey, `${docName(p)}, glance row ${k}`, "a fragment, not a sentence (opens on an -ing word and has no main verb)", v);
      const all = [Object.values(w.summary ?? {}).join(" "), ...(w.sections ?? []).flatMap((s) => [s.lede, ...(s.paragraphs ?? [])])].filter(Boolean).join(" ");
      const SLIPS = [/\bbody graph\b/i, /\bThis mechanics\b/, /\bpeople you happen to inhabit\b/i, /\bEntering your open\b/i, /\bmaterial manipulation\b/i, /\bdeeply vulnerable\b/i, /\bmust ride out\b/i, /\bgates? (?:one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty)\b/i];
      for (const re of SLIPS) for (const h of hits(all, re)) c.fail(p.journey, docName(p), `word slip "${h.match}"`, h.ctx);
    }
    c.note = `${readingsSeen.length} real readings read (${readingsSeen.filter((r) => r.journey !== "stored readings").length} on this run's pages, the rest stored live readings).`;
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
