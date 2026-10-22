/**
 * THE CASES. For every check: a KNOWN-GOOD document (taken from the base run,
 * corrected the way the fix would correct it, plus look-alikes that are right
 * as they are) that the check must pass, and KNOWN-BAD versions of that same
 * document, each with ONE error planted in the shape the 10/21 live test
 * found it, that the check must fail with a finding naming it.
 *
 *   check   the check id (checks/index.mjs)
 *   item    the error-set entry it stands for (errorset.json)
 *   take    what to copy from the base run (see mini.mjs)
 *   good(m) correct the copy; the check must PASS (no finding, not "skip")
 *   bad[]   { name, plant(m), expect: /a finding names it/, count? }
 *           each is planted on top of good(m); the check must FAIL
 *
 * Planted words are short and made up (Wren, Ash, lanterns). Nothing here is
 * copied from a reading, a chart or a real person.
 *
 * Checks measured by the driver rather than read from text (PDF fill, phone
 * width, links, timings, emails per step) are tested by changing the numbers
 * the driver RECORDED in the manifest, which is the closest honest method:
 * the check reads only those numbers.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { AUTHORITY_CENTER, FEELINGS } from "../index.mjs";
import { norm, sentences, truthFor } from "../load.mjs";
import { P } from "./mini.mjs";
import { GATES_NOTE, holdsLine, offerText } from "../../../../shared/timeSpread.mjs";

/* ------------------------------------------------------------ helpers ---- */

/** Replace a "LABEL\nvalue" row's value (CHANNELS: the whole one-a-line block). */
function setRow(text, label, value) {
  const ls = text.split(/\r?\n/);
  const at = ls.findIndex((l) => l.trim().replace(/’/g, "'") === label);
  if (at < 0) throw new Error(`no ${label} row on this page`);
  let i = at + 1;
  while (i < ls.length && !ls[i].trim()) i++;
  let end = i + 1;
  if (label === "CHANNELS") while (end < ls.length && /^\s*(?:\d{1,2}-\d{1,2}\b|PROVISIONAL$)/i.test(ls[end])) end++;
  ls.splice(i, end - i, ...[].concat(value));
  return ls.join("\n");
}
const getRow = (text, label) => {
  const ls = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const at = ls.findIndex((l) => l.replace(/’/g, "'") === label);
  return at >= 0 ? ls[at + 1] : null;
};
/** Insert a line after the first line matching `re` (or at the end). */
function addAfter(text, re, line) {
  const ls = text.split(/\r?\n/);
  const at = ls.findIndex((l) => re.test(l));
  ls.splice(at >= 0 ? at + 1 : ls.length, 0, line);
  return ls.join("\n");
}
const append = (text, line) => `${text}\n${line}\n`;
/** The CHANNELS block's line range [start, end): one channel a line, or None, plus any PROVISIONAL line. */
function channelBlock(ls) {
  const at = ls.findIndex((l) => l.trim() === "CHANNELS");
  if (at < 0) return null;
  let i = at + 1;
  while (i < ls.length && !ls[i].trim()) i++;
  let end = i + 1;
  while (end < ls.length && /^\s*(?:\d{1,2}-\d{1,2}\b|PROVISIONAL$)/i.test(ls[end])) end++;
  return [i, end];
}
/** A PROVISIONAL line after the last channel (where a fix might put the mark), or without it. */
function markChannels(text, on) {
  const ls = text.split(/\r?\n/);
  const r = channelBlock(ls);
  if (!r) return text;
  const block = ls.slice(r[0], r[1]).filter((l) => !/^\s*PROVISIONAL$/i.test(l)).map((l) => l.replace(/PROVISIONAL$/i, ""));
  ls.splice(r[0], r[1] - r[0], ...block, ...(on ? ["PROVISIONAL"] : []));
  return ls.join("\n");
}
/** The second line with words on it (a PDF's or a page's title line). */
function setTitleLine(text, title) {
  const ls = text.split("\n");
  const idx = ls.map((l, i) => (l.trim() ? i : -1)).filter((i) => i >= 0)[1];
  if (idx !== undefined) ls[idx] = title;
  return ls.join("\n");
}

/** Every sentence whose 6+ word clause was already said, dropped (the fix for a doubled line). */
function dedupe(texts) {
  const seen = new Set();
  return texts.map((text) =>
    text
      .split("\n")
      .map((line) => {
        const kept = [];
        for (const s of sentences(line)) {
          const units = s
            .split(/\s+[—–]\s+|;\s+|:\s+/)
            .map((u) => norm(u.replace(/^[“"(]+|[”")]+$/g, "").replace(/[.!?,]+$/, "")))
            .filter((u) => u.split(/\s+/).length >= 6);
          if (units.some((u) => seen.has(u))) continue;
          units.forEach((u) => seen.add(u));
          kept.push(s);
        }
        return kept.join(" ");
      })
      .join("\n"),
  );
}

const MARK = /\[RIG PLACEHOLDER\]\s*/g;
/** A placeholder reading made real: the rig's stand-in sentences, without the marker. */
const unmark = (written) => JSON.parse(JSON.stringify(written).replace(MARK, ""));

const isResult = (p) => p.kind === "result" && !!p.api;
const withPdf = (p) => !!p.pdf?.textFile;
const placeholderReading = (p, B) => isResult(p) && p.tier === 2 && JSON.stringify(B.api(p)?.written ?? "").includes("[RIG PLACEHOLDER]");
const receipt = (e) => /^Receipt/.test(e.subject);
const ready = (e) => /is ready/.test(e.subject);
const truthOf = (m, out) => truthFor({ truth: readdirSync(join(m.dir, "truth")).map((f) => ({ chart: JSON.parse(readFileSync(join(m.dir, "truth", f), "utf8")) })) }, out);
const token = (id) => `${Buffer.from(JSON.stringify({ r: id, t: 2, x: 1 })).toString("base64url")}.sig`;
const hex = (n) => n.toString(16).padStart(32, "0");

/* -------------------------------- an unknown birth time, measured (10/22) */

/** A made-up spread in the engine's /v1/spread shape: four lines change; the chart holds from 12:06 AM to 2:20 PM. */
const SPREAD = {
  v: 1,
  ok: true,
  minutes: 1440,
  noon: 720,
  window: [6, 860],
  changes: ["profile", "definedCenters", "undefinedCenters", "channels"],
  segments: {
    profile: [[0, "2/5"], [6, "3/5"], [861, "3/6"]],
    definedCenters: [[0, "G, Root"], [861, "G, Root, Spleen"]],
    undefinedCenters: [[0, "Head, Spleen"], [861, "Head"]],
    channels: [[0, "16-48"], [861, "16-48, 18-58"]],
  },
  clock: [[0, 0]],
  gates: "change",
};
const SPREAD_KEY = "2001-12-05_America-Los_Angeles_t1";
const LINE = holdsLine(SPREAD).text;
const BAR = ["cast at noon", "12 AM", "6 AM", "12 PM", "6 PM", "12 AM"].join("\n");

/**
 * The base run's unknown-time pages, said the way the release says them for
 * SPREAD: the one line, the bar and the offer under the three lines; the tag
 * beside each changing row's label (and the gates'), nowhere else; the PDF's
 * page 1 and value rows the same; the engine's answer kept as the harness
 * keeps it.
 */
function measuredPages(m) {
  for (const p of m.pages) {
    m.editApi(p, (a) => {
      a.output.timeSpread = SPREAD;
    });
    m.edit(p, (t) => {
      let s = t
        .replace(/PROVISIONAL$/gm, "")
        .replace(/^\s*PROVISIONAL\s*$/gm, "")
        .replace(/^.*Charted at noon: these are provisional\..*\n?/m, "")
        .replace(/^Birth time unknown[^\n]*\n?/m, "")
        .replace(/(?:still accurate|usually|almost always)[^.]{0,140}\bType and Authority\b[^.]*\./gi, "")
        .replace(/^How you meet the world( · Profile)/m, "How you meet the worldPROVISIONAL$1");
      s = addAfter(s, /^Below:/, [LINE, BAR, offerText(p.tier)].join("\n"));
      for (const label of ["PROFILE", "DEFINED CENTERS", "UNDEFINED CENTERS", "CHANNELS"]) s = s.replace(new RegExp(`^${label}$`, "m"), `${label}\nPROVISIONAL`);
      if (!/^ACTIVATED GATES$/m.test(s)) {
        const ls = s.split("\n");
        const r = channelBlock(ls);
        ls.splice(r[1], 0, "ACTIVATED GATES", "PROVISIONAL", "2, 5, 7, 10", GATES_NOTE);
        s = ls.join("\n");
      }
      return s.replace(/(Technical values: your \d+ planet numbers \(for the curious\))/, "$1PROVISIONAL");
    });
    m.editLinks(p, (ls) => [...ls, { text: "add it here", href: "http://127.0.0.1:1/r/tok#add-time" }]);
    if (p.pdf?.textFile) {
      m.editPdf(p, (pages) =>
        pages.map((t, i) => {
          if (i === 0) {
            let s = t.replace(/^Birth time was not known[^\n]*\n?/m, "").replace(/(Profile \d\/\d[^·\n]*?)(\s+·)/, "$1 PROVISIONAL$2");
            const ls = s.split("\n");
            const at = ls.findIndex((l) => /Profile \d\/\d/.test(l));
            ls.splice(at + 1, 0, LINE, "cast at noon", "12 AM 6 AM 12 PM 6 PM 12 AM", offerText(p.tier));
            return ls.join("\n");
          }
          if (i !== 1) return t;
          let s = t;
          for (const label of ["PROFILE", "DEFINED CENTERS", "UNDEFINED CENTERS", "CHANNELS"]) s = s.replace(new RegExp(`^${label} `, "m"), `${label} PROVISIONAL `);
          const ls = s.split("\n");
          let end = ls.findIndex((l) => /^CHANNELS /.test(l)) + 1;
          while (end < ls.length && /^\d{1,2}-\d{1,2}\b/.test(ls[end])) end++;
          ls.splice(end, 0, "ACTIVATED GATES", "PROVISIONAL", "2, 5, 7, 10", GATES_NOTE);
          return ls.join("\n");
        }),
      );
      m.editPdfLinks(p, (ls) => [...ls, { page: 1, href: "https://humandesign.thechampagnemethod.co/r/tok#add-time" }]);
    }
  }
  m.spreadTruth(SPREAD_KEY, SPREAD);
}

/** The shop's checker as the fix should leave it: every near-miss refused. */
export const STRICT = {
  firstProblem(text, type) {
    if (/\bnot-?sf\b|\bnot self\b|\bsigniture\b/i.test(text)) return "a near miss of a banned word";
    const own = FEELINGS[type] ?? [];
    for (const w of ["frustrat", "bitter", "anger", "angry", "disappoint"]) {
      if (own.includes(w) || (own.includes("anger") && w === "angry")) continue;
      if (new RegExp(`\\b${w}`, "i").test(text)) return `another type's feeling word (${w})`;
    }
    return null;
  },
};
/** The checker with the 10/21 gap: it lets everything through. */
const PERMISSIVE = { firstProblem: () => null };

/** US spelling for the UK forms the check knows (the fix for a UK word). */
const US = [
  [/centre/gi, "center"], [/colour/gi, "color"], [/behaviour/gi, "behavior"], [/favourite/gi, "favorite"], [/honour/gi, "honor"],
  [/organis/gi, "organiz"], [/recognis/gi, "recogniz"], [/realis/gi, "realiz"], [/universalis/gi, "universaliz"], [/analys(e|ed|ing)\b/gi, "analyz$1"],
  [/programme/gi, "program"], [/travell/gi, "travel"], [/labell/gi, "label"], [/catalogue/gi, "catalog"], [/\bgrey\b/gi, "gray"],
  [/whilst/gi, "while"], [/amongst/gi, "among"], [/licence/gi, "license"], [/defence/gi, "defense"], [/practis(e|ed|es|ing)\b/gi, "practic$1"],
  [/apologis/gi, "apologiz"], [/emphasis(e|ed|es|ing)\b/gi, "emphasiz$1"], [/minimis/gi, "minimiz"], [/prioritis/gi, "prioritiz"], [/criticis/gi, "criticiz"],
  [/summaris/gi, "summariz"], [/characteris/gi, "characteriz"], [/energis/gi, "energiz"], [/judgement/gi, "judgment"],
];
const usSpell = (t) => US.reduce((s, [re, to]) => s.replace(re, to), t);

/** Someone-new copy said about THEIR chart (the fix for #16 #19 W8). */
const KEEP_AS_IS = /Reading your bodygraph|Your reading is made and sent|your (?:chart|summary|reading) (?:stays|is separate)/gi;
function theirify(t) {
  const kept = [];
  return t
    .replace(KEEP_AS_IS, (m) => (kept.push(m), `\u0000${kept.length - 1}\u0000`))
    .replace(/I don['’]t know my birth time/g, "I don’t know their birth time")
    .replace(/title of their chart:\s*[“"]Your Human Design[”"]/g, "title of their chart: “Wren’s Human Design”")
    .replace(/\b(your|my) (birth (?:date|time|details|place)|centers?|incarnation cross|definition|chart(?! for)|summary|reading|type|authority|profile|bodygraph)\b/gi, (m, w, rest) => `${w[0] === w[0].toUpperCase() ? "Their" : "their"} ${rest}`)
    .replace(/\u0000(\d+)\u0000/g, (m, i) => kept[Number(i)]);
}

/* -------------------------------------------------------------- cases ---- */

export const CASES = [
  /* ------------------------------------------------------- the rig ---- */
  {
    check: "run-complete",
    item: "rig",
    take: { journeys: [P("any journey with 2+ steps", (j) => j.steps.length >= 2)] },
    good(m) {
      const j = m.manifest.journeys[0];
      m.combos.journeys[0].steps = j.steps.map((s) => ({ do: s.do, tier: s.tier }));
    },
    bad: [
      { name: "a journey that stopped after its first step", plant: (m) => (m.manifest.journeys[0].steps = m.manifest.journeys[0].steps.slice(0, 1)), expect: /stopped after 1 of \d+ steps/ },
      { name: "a step that errored", plant: (m) => m.manifest.errors.push({ step: `${m.manifest.journeys[0].steps[0].id}`, error: "Timed out waiting for the Pay button", url: "http://127.0.0.1/x" }), expect: /Timed out waiting for the Pay button/ },
    ],
  },
  {
    check: "no-live-calls",
    item: "rig",
    take: {},
    good(m) {
      m.rig.blocked = [];
    },
    bad: [{ name: "a call to an outside host", plant: (m) => m.rig.blocked.push({ host: "api.outside.example", path: "/v1/lantern" }), expect: /blocked: api\.outside\.example\/v1\/lantern/ }],
  },
  {
    check: "no-incidents",
    item: "rig",
    take: {},
    good() {},
    bad: [{ name: "an alert email to Jeremy", plant: (m) => m.alert("HD readings: a reading failed its checker three times", "Made-up alert for the self-test."), expect: /HD readings: a reading failed its checker/ }],
  },

  /* ------------------------------------------------------------ #2 ---- */
  {
    check: "values-match-engine",
    item: "#2",
    take: { pages: [P("a summary page (known time) whose chart has channels", (p, B) => isResult(p) && p.tier === 0 && B.api(p)?.output?.timeKnown !== false && (B.truth(B.api(p).output)?.channels?.length ?? 0) > 0)], truth: true },
    good(m) {
      const p = m.pages[0];
      const t = truthOf(m, m.api(p).output);
      if (!t) throw new Error("no engine chart for the summary's birth");
      m.edit(p, (s) => setRow(s, "CHANNELS", t.channels?.length ? t.channels : ["None"]));
    },
    bad: [
      { name: "#2: CHANNELS None on a summary whose chart has channels", plant: (m) => m.edit(m.pages[0], (s) => setRow(s, "CHANNELS", ["None"])), expect: /CHANNELS shows "None"; the chart has/ },
      { name: "a channel the chart does not have", plant: (m) => m.edit(m.pages[0], (s) => setRow(s, "CHANNELS", [...(truthOf(m, m.api(m.pages[0]).output).channels ?? []), "12-22 (Openness)"])), expect: /not in the chart: 12-22/ },
      { name: "a Type the engine did not give", plant: (m) => m.edit(m.pages[0], (s) => setRow(s, "TYPE", truthOf(m, m.api(m.pages[0]).output).type === "Reflector" ? "Generator" : "Reflector")), expect: /TYPE shows "(Reflector|Generator)", the engine says/ },
    ],
  },

  /* ------------------------------------------------------- #3 #17 ---- */
  {
    check: "provisional-marks",
    item: "#3 #17",
    take: {
      pages: [
        P("an unknown-time summary", (p, B) => isResult(p) && p.tier === 0 && B.api(p)?.output?.timeKnown === false),
        P("an unknown-time page with a PDF", (p, B) => isResult(p) && withPdf(p) && B.api(p)?.output?.timeKnown === false),
      ],
    },
    good(m) {
      for (const p of m.pages) {
        m.edit(p, (t) => {
          // The three-lines box says so, every row that Type is made of carries the mark.
          let s = t.replace(/^.*Charted at noon: these are provisional\..*\n?/m, "");
          if (/Your chart in three lines/.test(s)) s = addAfter(s, /Your chart in three lines/, "Charted at noon: these are provisional.");
          for (const label of ["TYPE", "STRATEGY", "AUTHORITY", "PROFILE", "DEFINED CENTERS", "DEFINITION"]) {
            const v = getRow(s, label);
            if (v && !/provisional/i.test(v)) s = setRow(s, label, `${v}PROVISIONAL`);
          }
          s = markChannels(s, true);
          return s.replace(/(?:still accurate|usually|almost always)[^.]{0,140}\bType and Authority\b[^.]*\./gi, "");
        });
        if (p.pdf?.textFile) m.editPdf(p, (pages) => pages.map((t, i) => (i === 0 ? t.replace(/(Profile \d\/\d[^\n]*)/, (l) => (/provisional/i.test(l) ? l : `${l} · provisional`)) : t)));
      }
      m.phoneFile("kotlin/Entry.kt", 'Text("Charted at noon: treat Type, Authority and Profile as provisional.")\n');
    },
    bad: [
      // Every mark in the box goes: the line under it (live code) and the one on each row (fix 3).
      { name: "#3: the three-lines box with no provisional mark", plant: (m) => m.edit(m.pages[0], (t) => t.replace(/(Your chart in three lines)([\s\S]*?)(Below:|Your chart at a glance)/, (_, a, box, b) => a + box.replace(/^Charted at noon: these are provisional\.\n?/m, "").replace(/provisional/gi, "") + b)), expect: /three-lines box states Type, Authority and Profile with no provisional mark/ },
      { name: "#3: PDF page 1 with no provisional mark", plant: (m) => m.editPdf(m.pages[1], (pages) => pages.map((t, i) => (i === 0 ? t.replace(/ · provisional/g, "").replace(/provisional/gi, "") : t))), expect: /page 1 states Type \/ Profile \/ Authority with no provisional mark/ },
      { name: "#17: Type provisional, its centers not", plant: (m) => m.edit(m.pages[0], (t) => setRow(t, "DEFINED CENTERS", getRow(t, "DEFINED CENTERS").replace(/PROVISIONAL$/, ""))), expect: /Type is provisional but DEFINED CENTERS/ },
      { name: "#17: Type provisional, its channels not", plant: (m) => m.edit(m.pages[0], (t) => markChannels(t, false)), expect: /Type is provisional but CHANNELS/ },
      { name: "TYPE row not marked", plant: (m) => m.edit(m.pages[0], (t) => setRow(t, "TYPE", getRow(t, "TYPE").replace(/PROVISIONAL$/, ""))), expect: /TYPE not marked provisional/ },
      { name: "#17: the phone says Type and Authority are usually right", plant: (m) => m.phoneFile("kotlin/Entry.kt", 'Text("Still accurate: most gates and centers, and usually your Type and Authority.")\n'), expect: /phone app source .*usually right|usually right.*phone/ },
      { name: "#17: the shop page says Type and Authority are usually right", plant: (m) => m.edit(m.pages[0], (t) => append(t, "Even so, your Type and Authority are usually right.")), expect: /usually right, while the chart says/ },
    ],
  },

  /* ------------------------ #3 #17, unknown time MEASURED (10/22) ---- */
  // The same check on a chart that keeps the engine's spread: PROVISIONAL on exactly the lines
  // that change, beside each label (the base run's pages, re-said the way the release says them).
  {
    check: "provisional-marks",
    item: "#3 #17",
    take: {
      pages: [
        P("an unknown-time summary", (p, B) => isResult(p) && p.tier === 0 && B.api(p)?.output?.timeKnown === false),
        P("an unknown-time page with a PDF", (p, B) => isResult(p) && withPdf(p) && B.api(p)?.output?.timeKnown === false),
      ],
    },
    good: (m) => measuredPages(m),
    bad: [
      { name: "#3: the three-lines box leaves a changing row unmarked", plant: (m) => m.edit(m.pages[0], (t) => t.replace("How you meet the worldPROVISIONAL", "How you meet the world")), expect: /three-lines box states "How you meet the world" with no provisional mark/ },
      { name: "#3: PDF page 1 leaves the changing Profile unmarked", plant: (m) => m.editPdf(m.pages[1], (pages) => pages.map((t, i) => (i === 0 ? t.replace(/ PROVISIONAL(?=\s+·)/, "") : t))), expect: /page 1 states Profile with no provisional mark/ },
      { name: "a changing center row with no tag", plant: (m) => m.edit(m.pages[0], (t) => t.replace("DEFINED CENTERS\nPROVISIONAL\n", "DEFINED CENTERS\n")), expect: /DEFINED CENTERS changes during the birth day but carries no PROVISIONAL tag/ },
      { name: "a line that holds all day, marked", plant: (m) => m.edit(m.pages[0], (t) => t.replace(/^TYPE\n/m, "TYPE\nPROVISIONAL\n")), expect: /TYPE is marked PROVISIONAL but holds all day/ },
      { name: "the tag after the value, not beside the label", plant: (m) => m.edit(m.pages[0], (t) => t.replace(/^PROFILE\nPROVISIONAL\n(.+)$/m, "PROFILE\n$1PROVISIONAL")), expect: /PROFILE's PROVISIONAL sits after its value/ },
      { name: "the gates unmarked", plant: (m) => m.edit(m.pages[0], (t) => t.replace("ACTIVATED GATES\nPROVISIONAL\n", "ACTIVATED GATES\n")), expect: /ACTIVATED GATES is not marked PROVISIONAL/ },
      { name: "the 26 activations unmarked", plant: (m) => m.edit(m.pages[1], (t) => t.replace(/(planet numbers[^\n]*?)\s*PROVISIONAL/, "$1")), expect: /technical values .* not marked PROVISIONAL/ },
      { name: "a steady PDF row marked", plant: (m) => m.editPdf(m.pages[1], (pages) => pages.map((t, i) => (i === 1 ? t.replace(/^OPEN CENTERS /m, "OPEN CENTERS PROVISIONAL ") : t))), expect: /OPEN CENTERS is marked PROVISIONAL but holds all day/ },
    ],
  },
  {
    check: "unknown-time-line",
    item: "#17",
    take: {
      pages: [
        P("an unknown-time summary", (p, B) => isResult(p) && p.tier === 0 && B.api(p)?.output?.timeKnown === false),
        P("an unknown-time page with a PDF", (p, B) => isResult(p) && withPdf(p) && B.api(p)?.output?.timeKnown === false),
      ],
    },
    good: (m) => measuredPages(m),
    bad: [
      { name: "the one line missing", plant: (m) => m.edit(m.pages[0], (t) => t.replace(LINE, "")), expect: /one line about the birth time is missing/ },
      { name: "the line's hours not the spread's", plant: (m) => m.edit(m.pages[0], (t) => t.replace("about 2:15", "about 3:15")), expect: /one line about the birth time is missing or not the spread's/ },
      { name: "a window that is not the engine's", plant: (m) => m.spreadTruth(SPREAD_KEY, { ...SPREAD, window: [6, 870] }), expect: /not the engine's \/v1\/spread answer/ },
      { name: "the bar missing", plant: (m) => m.edit(m.pages[0], (t) => t.replace(BAR, "")), expect: /the bar under the line is missing/ },
      { name: "the offer missing", plant: (m) => m.edit(m.pages[0], (t) => t.replace(offerText(0), "")), expect: /offer to add a found birth time is missing/ },
      { name: "the offer worded as an order", plant: (m) => m.edit(m.pages[0], (t) => t.replace("You’re welcome to add it here", "Add it here")), expect: /offer to add a found birth time is missing or reworded/ },
      { name: "add it here, not a link", plant: (m) => m.editLinks(m.pages[0], (ls) => ls.filter((l) => l.text !== "add it here")), expect: /"add it here" is not a link to #add-time/ },
      { name: "the gates' note missing", plant: (m) => m.edit(m.pages[0], (t) => t.replace(GATES_NOTE, "")), expect: /their short note is missing/ },
      { name: "the line said twice", plant: (m) => m.edit(m.pages[0], (t) => t.replace(LINE, `${LINE}\n${LINE}`)), expect: /said more than once/ },
      { name: "the engine's older note beside it", plant: (m) => m.edit(m.pages[0], (t) => t.replace(LINE, `${LINE}\nBirth time unknown — charted at noon. Treat Type, Authority and Profile as provisional.`)), expect: /older note is shown beside the one line/ },
      { name: "PDF page 1 without the line", plant: (m) => m.editPdf(m.pages[1], (pages) => pages.map((t, i) => (i === 0 ? t.replace(LINE, "") : t))), expect: /page 1 lacks the one line/ },
      { name: "PDF add it here with no link", plant: (m) => m.editPdfLinks(m.pages[1], (ls) => ls.filter((l) => !/#add-time$/.test(l.href))), expect: /does not link to the reading's #add-time/ },
      { name: "a chart with no spread kept, on an engine that has them", plant: (m) => m.editApi(m.pages[0], (a) => void delete a.output.timeSpread), expect: /no spread kept for this unknown-time chart/ },
    ],
  },

  /* ------------------------------------------------------------ #4 ---- */
  {
    check: "stripe-next-step",
    item: "#4",
    take: {
      pages: [
        P("a Stripe page for an upgrade", (p, B) => p.kind === "stripe" && !!B.session(p)?.metadata?.upgrades),
        P("a Stripe page for a new purchase", (p, B) => p.kind === "stripe" && !!p.session && !B.session(p)?.metadata?.upgrades),
      ],
    },
    good(m) {
      const set = (p, msg) => m.editSession(p, (s) => ((s.rig ??= {}).params ??= {}, (s.rig.params.custom_text = { submit: { message: msg } }), s));
      set(m.pages[0], "Nothing to type: the birth details you gave are kept. It is ready in about 2 minutes.");
      // A new purchase does ask for them next: right as it is.
      set(m.pages[1], "Next: your birth date, time and place (about 2 minutes).");
    },
    bad: [
      { name: "#4: an upgrade told its birth details come next", plant: (m) => m.editSession(m.pages[0], (s) => (s.rig.params.custom_text.submit.message = "Next: your birth date, time and place (about 2 minutes).", s)), expect: /upgrade with kept details, but Stripe says the birth details come next/ },
      { name: "#4 with a kept-note in the next sentence (it excuses nothing)", plant: (m) => m.editSession(m.pages[0], (s) => (s.rig.params.custom_text.submit.message = "Next: your birth date, time and place (about 2 minutes). Your details are kept for a year.", s)), expect: /birth details come next/ },
      { name: "no line under Pay", plant: (m) => m.editSession(m.pages[0], (s) => (s.rig.params.custom_text.submit.message = "", s)), expect: /no line under the Pay button/ },
    ],
  },

  /* ------------------------------------------------------------ #5 ---- */
  {
    check: "confirm-button-tier",
    item: "#5",
    take: { pages: [P("a chart-upgrade confirm page", (p) => p.kind === "confirm" && p.tier === 1), P("a reading-upgrade confirm page", (p) => p.kind === "confirm" && p.tier === 2)] },
    good(m) {
      m.pages[0].buttons = ["These are right — make my chart", "Change a detail"];
      m.pages[1].buttons = ["These are right — make my reading", "Change a detail"];
    },
    bad: [{ name: "#5: make my reading on a chart upgrade", plant: (m) => (m.pages[0].buttons[0] = "These are right — make my reading"), expect: /buying the chart, the button says "These are right — make my reading"/ }],
  },

  /* ------------------------------------------------- #16 #19 W8 ---- */
  {
    check: "someone-new-their",
    item: "#16 #19 W8",
    take: {
      pages: [
        P("the someone-new tiers page", (p) => p.kind === "someone-new-tiers"),
        P("a someone-new blank form", (p) => p.kind === "form-blank" && p.fresh),
        P("a someone-new filled form", (p) => p.kind === "form-filled" && p.fresh),
        P("a someone-new result page", (p) => isResult(p) && p.fresh),
      ],
      steps: [P("a someone-new purchase", (j, s) => s.do === "someone-new" && (s.emails ?? []).some(receipt) && (s.emails ?? []).some(ready))],
    },
    good(m) {
      for (const p of m.pages.slice(0, 3)) m.edit(p, theirify);
      for (const e of m.mails()) m.editMail(e, theirify);
      // Right as they are: the guide's title, the purchase policy, the buyer's own chart.
      m.edit(m.pages[0], (t) => append(t, "Reading your bodygraph\nYour reading is made and sent the moment you ask for it.\nWhat you paid stays with your own chart, and your chart stays as it is."));
      for (const e of m.mails()) m.editMail(e, (t) => append(t, "Reading your bodygraph — the free guide to the drawing."));
      // A nameless chart for someone else, titled without the buyer's name.
      const r = m.pages[3];
      const step = m.manifest.journeys.flatMap((j) => j.steps).find((s) => s.id === r.step);
      if (step) step.name = "";
      else m.manifest.journeys.push({ id: r.journey, steps: [{ id: r.step, do: "someone-new", tier: r.tier, name: "", emails: [] }] });
      if (!m.combos.journeys.some((j) => j.id === r.journey)) m.combos.journeys.push({ id: r.journey, buyer: "Wren Testwell", steps: [] });
      m.combos.journeys.find((j) => j.id === r.journey).buyer = "Wren Testwell";
      m.edit(r, (t) => t.replace(/^[^\n]*/, "Your Human Design"));
    },
    bad: [
      { name: "#16: the ready email says Your summary", plant: (m) => m.editMail(m.mails(ready)[0], (t) => append(t, "Your summary is ready.")), expect: /"your summary"/ },
      { name: "#16: the receipt says Your birth date", plant: (m) => m.editMail(m.mails(receipt)[0], (t) => append(t, "Next: Your birth date, time and place.")), expect: /"your birth date"/ },
      { name: "#19: the form says I don't know my birth time (reported once)", plant: (m) => m.edit(m.pages[1], (t) => append(t, "I don’t know my birth time")), expect: /says "I don't know my birth time"/, count: 1 },
      { name: "#19: the form titles their chart Your Human Design", plant: (m) => m.edit(m.pages[1], (t) => append(t, "It is the title of their chart: “Your Human Design”.")), expect: /their chart will be titled "Your Human Design"/ },
      { name: "W8: the tiers card says your centers", plant: (m) => m.edit(m.pages[0], (t) => append(t, "Type, Strategy, Authority, Profile, Definition, your centers, your incarnation cross.")), expect: /"your centers", "your incarnation cross"/ },
      { name: "a your-chart line beside the footer (an excuse never covers its neighbors)", plant: (m) => m.editMail(m.mails(ready)[0], (t) => append(t, "Open your chart here.\nCharts and readings, for you or someone close to you.")), expect: /"your chart"/ },
      { name: "a nameless gift chart titled with the buyer's name", plant: (m) => m.edit(m.pages[3], (t) => t.replace(/^[^\n]*/, "Wren Testwell’s Human Design")), expect: /given no name, is titled with the buyer's name/ },
    ],
  },

  /* ------------------------------------------------------------ #1 ---- */
  {
    check: "form-missing-count",
    item: "#1",
    take: { pages: [P("a blank form", (p) => p.kind === "form-blank")] },
    good(m) {
      m.edit(m.pages[0], (t) => t.replace(/^.*\bthings? left\b.*$/gim, "Three things left: the date, the place and the time.").replace(/THAT['’]S EVERYTHING/g, "THREE THINGS LEFT"));
    },
    bad: [
      { name: "#1: one thing left on a blank form", plant: (m) => m.edit(m.pages[0], (t) => t.replace(/^Three things left:.*$/m, "One thing left: the day you were born.")), expect: /says one thing is left/ },
      { name: "two things left on a blank form", plant: (m) => m.edit(m.pages[0], (t) => t.replace(/^Three things left:.*$/m, "Two things left: the place and the time.")), expect: /says two things are left/ },
      { name: "That's everything over a blank form", plant: (m) => m.edit(m.pages[0], (t) => append(t, "THAT’S EVERYTHING")), expect: /"That's everything" heading while three things are missing/ },
    ],
  },

  /* ----------------------------------------------------------- #14 ---- */
  {
    check: "authority-side-note",
    item: "#14",
    take: { pages: [P("a reading (with PDF) whose authority has a center", (p, B) => isResult(p) && p.tier === 2 && withPdf(p) && !!B.api(p)?.notes && !!AUTHORITY_CENTER[B.api(p)?.output?.authority])] },
    good(m) {
      const p = m.pages[0];
      const want = AUTHORITY_CENTER[m.api(p).output.authority];
      m.editApi(p, (a) => {
        for (const notes of Object.values(a.notes)) for (const n of notes) if (n[0] === "CENTER") n[1] = want;
      });
      m.editPdf(p, (pages) => pages.map((t) => t.replace(/(^|\n)CENTER([ \t]*\n[ \t]*)[^\n]+/g, `$1CENTER$2${want}`)));
    },
    bad: [
      { name: "#14: CENTER Single on the page", plant: (m) => m.editApi(m.pages[0], (a) => Object.values(a.notes).forEach((ns) => ns.forEach((n) => n[0] === "CENTER" && (n[1] = "Single")))), expect: /CENTER: "Single" is not a center/ },
      { name: "#14: CENTER Single in the PDF", plant: (m) => m.editPdf(m.pages[0], (pages) => pages.map((t) => t.replace(/(^|\n)CENTER([ \t]*\n[ \t]*)[^\n]+/g, "$1CENTER$2Single"))), expect: /side note prints "CENTER Single" \(a definition, not a center\)/ },
      { name: "the wrong center on the page", plant: (m) => m.editApi(m.pages[0], (a) => Object.values(a.notes).forEach((ns) => ns.forEach((n) => n[0] === "CENTER" && (n[1] = n[1] === "Root" ? "Head" : "Root")))), expect: /authority is the/ },
      { name: "the wrong center in the PDF", plant: (m) => m.editPdf(m.pages[0], (pages) => pages.map((t) => t.replace(/(^|\n)CENTER([ \t]*\n[ \t]*)([^\n]+)/g, (a, s, gap, v) => `${s}CENTER${gap}${v === "Root" ? "Head" : "Root"}`))), expect: /side note prints "CENTER (Root|Head)", but/ },
    ],
  },

  /* ------------------------------------------------------------ #6 ---- */
  {
    check: "pdf-page-fill",
    item: "#6",
    // The driver measures fill on the rendered page; the check reads that number.
    take: { pages: [P("a PDF of 3+ pages", (p) => isResult(p) && withPdf(p) && (p.pdf.pageInfo?.length ?? 0) >= 3)] },
    good(m) {
      const p = m.pages[0];
      p.pdf.pageInfo = p.pdf.pageInfo.map((pg) => ({ ...pg, fill: Math.max(pg.fill, 0.4) }));
      // Right as it is: a last page with the coaching card AND enough on it.
      m.editPdf(p, (pages) => pages.map((t, i) => (i === pages.length - 1 ? `${t}\nTalk it through with Jeremy` : t)));
    },
    bad: [
      { name: "#6: a last page that is only the coaching card", plant: (m) => { const p = m.pages[0]; p.pdf.pageInfo.at(-1).fill = 0.12; m.editPdf(p, (pages) => pages.map((t, i) => (i === pages.length - 1 ? "Talk it through with Jeremy\nA free 30-minute conversation." : t))); }, expect: /12% filled.*only the coaching card/ },
      { name: "#6: a near-empty page that points 'above'", plant: (m) => { const p = m.pages[0]; p.pdf.pageInfo[2].fill = 0.04; m.editPdf(p, (pages) => pages.map((t, i) => (i === 2 ? "Every word above is explained in the free library." : t))); }, expect: /4% filled.*says "above" with nothing above it/ },
      { name: "a page under 15%", plant: (m) => (m.pages[0].pdf.pageInfo[1].fill = 0.1), expect: /page 2 of \d+.*10% filled/ },
    ],
  },

  /* --------------------------------------------------------- links ---- */
  {
    check: "links",
    item: "links",
    // The driver opens each link and records status and anchor; the check reads those.
    take: { pages: [P("any result page", isResult)] },
    good(m) {
      const p = m.pages[0];
      const shop = m.manifest.shop ?? "http://127.0.0.1:1";
      const site = m.manifest.website ?? "http://127.0.0.1:2";
      p.url = `${shop}/r/selftest-page`;
      p.ids = ["root", "start-here"];
      const L = (href, extra = {}) => ({ href, local: href, where: [`page:${p.id}`], count: 1, kind: "ours", status: 200, ...extra });
      m.manifest.links = [
        L(`${shop}/charts/`),
        L(`${site}/library/human-design/#type`, { anchor: "in-view" }),
        // Right as they are: a jump link on its own page, and the /u/ page's #new app state.
        L(`${shop}/r/selftest-page#start-here`, { anchor: "present-not-in-view" }),
        L(`${shop}/u/selftest#new`, { anchor: "missing" }),
        { href: "https://example.org/", where: [`page:${p.id}`], count: 1, kind: "external" },
      ];
    },
    bad: [
      { name: "a link that answers 404", plant: (m) => (m.manifest.links[0].status = 404), expect: /404 for .*\/charts\// },
      { name: "an anchor that does not exist", plant: (m) => (m.manifest.links[1].anchor = "missing"), expect: /#type does not exist/ },
      { name: "an anchor not in view", plant: (m) => (m.manifest.links[1].anchor = "present-not-in-view"), expect: /#type exists but is not in view/ },
      { name: "a jump link to an id the page lacks", plant: (m) => (m.pages[0].ids = ["root"]), expect: /#start-here exists but is not in view/ },
    ],
  },

  /* ------------------------------------------------- #9 #15 AI5 ---- */
  {
    check: "near-miss-words",
    item: "#9 #15 AI5",
    // A Projector, as in the live test (#15: "depleted and frustrated").
    take: { pages: [P("a Projector placeholder reading page (its stand-in words made real)", (p, B) => placeholderReading(p, B) && B.api(p).output.type === "Projector")] },
    probed: true,
    good(m) {
      m.editApi(m.pages[0], (a) => {
        a.written = unmark(a.written);
        const s = a.written.sections.find((x) => /on track/i.test(x.heading));
        // Right as they are: words that only look like the banned ones.
        s.paragraphs.push("A signal is a signpost in itself; the notes say so.");
      });
    },
    bad: [
      { name: "#9: not-sf in the off-track line", plant: (m) => m.editApi(m.pages[0], (a) => (a.written.summary["Not-self"] = `Because your not-sf feeling is ${a.output.notSelfTheme.toLowerCase()}, it is a signal to pause.`)), expect: /"not-sf" is a near miss of the banned "not-self"/ },
      { name: "signiture in the on-track line", plant: (m) => m.editApi(m.pages[0], (a) => (a.written.summary.Signature = `Your signiture feeling is ${a.output.signature.toLowerCase()}.`)), expect: /"signiture" is a near miss of the banned "signature"/ },
      { name: "#15: another type's feeling word on track / off track", plant: (m) => m.editApi(m.pages[0], (a) => { const other = (FEELINGS[a.output.type] ?? []).includes("frustrat") ? "bitter" : "frustrated"; a.written.sections.find((x) => /on track/i.test(x.heading)).paragraphs.push(`When you force things, your energy becomes depleted and ${other}.`); }), expect: /"(frustrated|bitter)" is another type's feeling word/ },
      // A stored reading fails only when the shop's checker would still let it through.
      { name: "#15 in a stored live reading the checker would let through", plant: (m) => { m.opts.checker = PERMISSIVE; const a = m.api(m.pages[0]); const w = JSON.parse(JSON.stringify(a.written)); const other = (FEELINGS[a.output.type] ?? []).includes("frustrat") ? "bitterness" : "frustration"; w.sections.find((x) => /on track/i.test(x.heading)).paragraphs.push(`Pushing brings ${other}.`); m.fixture("stored.json", [{ tier: 2, output: a.output, written: w }]); }, expect: /stored live reading stored\.json#0.*another type's feeling word/ },
      { name: "AI5: the shop's checker lets the near-misses through", plant: (m) => (m.opts.checker = PERMISSIVE), expect: /lets "not-sf" through/ },
    ],
  },

  /* ---------------------------------------------------- W6 AI2 ---- */
  {
    check: "doubled-text",
    item: "W6 AI2",
    take: { pages: [P("the expired-link page", (p) => p.kind === "expired"), P("the cut-short-link page", (p) => p.kind === "cut-short"), P("a reading page with its PDF", (p) => isResult(p) && p.tier === 2 && withPdf(p))] },
    good(m) {
      for (const p of m.pages) {
        m.edit(p, (t) => dedupe([t.replace(MARK, "")])[0]);
        if (p.pdf?.textFile) m.editPdf(p, (pages) => dedupe(pages));
      }
      // Right as they are: a heading said twice is layout; so is a cross name in two tables.
      m.edit(m.pages[2], (t) => append(t, "Things you might try this week\nThings you might try this week\nRight Angle Cross of the Wren (1/2 | 3/4)\nRight Angle Cross of the Wren (1/2 | 3/4)"));
    },
    bad: [
      { name: "W6: the expired page says the same clause twice", plant: (m) => m.edit(m.pages[0], (t) => append(t, "A fresh one can be sent now — to the address on your purchase, and only there.\nYour link can be sent again — to the address on your purchase, and only there.")), expect: /said \d times: "to the address on your purchase, and only there"/ },
      { name: "W6: the cut-short page repeats its heading as its first line", plant: (m) => m.edit(m.pages[1], (t) => (/^That link could not be opened$/m.test(t) ? addAfter(t, /^That link could not be opened$/, "That link could not be opened. Try the email it came in.") : append(t, "That link could not be opened\nThat link could not be opened. Try the email it came in."))), expect: /said 2 times: "That link could not be opened"/ },
      { name: "AI2: a takeaway in Start here and again as the section's first line", plant: (m) => m.edit(m.pages[2], (t) => append(append(t, "Wren keeps a lantern lit for the slow walk home."), "Wren keeps a lantern lit for the slow walk home.")), expect: /said 2 times: "Wren keeps a lantern lit for the slow walk home"/ },
      // 10/21: stand-in try-this lines once made the whole reading count as a placeholder, and its real words went unjudged.
      { name: "AI2 on a reading whose try-this lines are rig stand-ins", plant: (m) => m.edit(m.pages[2], (t) => append(append(append(t, "(Type) [RIG STAND-IN] The next time a small job comes, you might start at once and notice the pace, so it is familiar later."), "Wren keeps a lantern lit for the slow walk home."), "Wren keeps a lantern lit for the slow walk home.")), expect: /said 2 times: "Wren keeps a lantern lit for the slow walk home"/ },
    ],
  },

  /* ------------------------------------------------------------ #8 ---- */
  {
    check: "my-charts-rows",
    item: "#8",
    take: { myCharts: true, pages: [P("a result page", isResult), P("a result page for another birth", (p, B) => isResult(p) && p.birth !== B.manifest.pages.find(isResult)?.birth)] },
    good(m) {
      const [a, b] = m.pages;
      const shop = m.manifest.shop;
      const e = m.manifest.myChartsEmails[0];
      if (!e) throw new Error("the base run has no my-charts email");
      // Two rows of the same tier, told apart by name: right as it is.
      m.editMail(e, () => `Hello,\n\nHere is a fresh link to each one bought with this email:\n\nWren’s reading — The reading · June 1, 1990 · Fargo, North Dakota\nOpen: ${shop}/r/${token(a.record.id)}\n\nAsh’s reading — The reading · May 2, 1985 · Reno, Nevada\nOpen: ${shop}/r/${token(b.record.id)}\n\nEach link is new and works for 6 days.\n`);
    },
    bad: [
      { name: "#8: rows that read the same", plant: (m) => m.editMail(m.manifest.myChartsEmails[0], (t) => t.replace(/^Wren’s reading — The reading.*$/m, "Your reading — The reading").replace(/^Ash’s reading — The reading.*$/m, "Your reading — The reading")), expect: /2 rows read exactly "Your reading — The reading"/ },
      { name: "#8: one chart listed twice (an older copy of the same chart)", plant: (m) => { const id = hex(0x5e1f7e57); m.blob(id, { tier: 1, output: m.api(m.pages[0]).output }); m.editMail(m.manifest.myChartsEmails[0], (t) => t.replace(/Open: (\S+)\/r\/\S+\n\nEach/, `Open: $1/r/${token(id)}\n\nEach`)); }, expect: /one chart listed 2 times/ },
    ],
  },

  /* ------------------------------------------------------------ #7 ---- */
  {
    check: "my-charts-time",
    item: "#7",
    // The driver times "Sending…" with every store request slowed; the check reads that time.
    take: { myCharts: true },
    good(m) {
      m.manifest.timings.myCharts = { seconds: 3.4, latencyMs: 400, blobOps: 8 };
    },
    bad: [
      { name: "#7: twenty seconds for a heavy inbox", plant: (m) => (m.manifest.timings.myCharts = { seconds: 20.12, latencyMs: 400, blobOps: 46 }), expect: /20\.12 s for \d+ charts/ },
      { name: "not measured", plant: (m) => delete m.manifest.timings.myCharts, expect: /not measured/ },
    ],
  },

  /* ----------------------------------------------------------- #18 ---- */
  {
    check: "readings-site-unknown",
    item: "#18",
    take: {},
    good(m) {
      const p = m.base.manifest.pages.find((x) => x.kind === "readings-site-unknown");
      const text = p ? m.base.text(p) : "HUMAN DESIGN by THE CHAMPAGNE METHOD\n\nThis link has expired\n";
      // Right as it is: a line about expired links in general.
      m.addPage({ id: "readings-site-unknown", kind: "readings-site-unknown" }, `${text.replace(/This link has expired/g, "This link was not found")}\nAn expired link offers a fresh one; this one was never made.\n`);
    },
    bad: [{ name: "#18: a link that never existed called expired", plant: (m) => m.edit(m.page("readings-site-unknown"), (t) => append(t, "This link has expired")), expect: /says the link has expired/ }],
  },

  /* ------------------------------------------------- #10 #11 #12 ---- */
  {
    check: "website-claims",
    item: "#10 #11 #12",
    take: {
      pages: [
        P("the website's /readings/ page", (p) => p.kind === "website" && p.path === "/readings/"),
        P("the website's privacy page", (p) => p.kind === "website" && p.path === "/readings/privacy/"),
        P("a Stripe page", (p) => p.kind === "stripe" && !!p.session),
        P("a summary page", (p) => isResult(p) && p.tier === 0),
      ],
    },
    good(m) {
      const [readings, privacy, stripe, summary] = m.pages;
      m.edit(readings, (t) => t.replace(/the summary keeps none of them/gi, "the summary keeps them too").replace(/\bSignature\b|SIGNATURE/g, (w) => (w === "SIGNATURE" ? "ON TRACK" : "On track")).replace(/\b[Nn]ot-[Ss]elf\b|NOT-SELF/g, (w) => (w === "NOT-SELF" ? "OFF TRACK" : "Off track")));
      m.edit(privacy, (t) => append(t.replace(/email address and phone number/g, "email address").replace(/name, email and phone/g, "name and email"), "Some readings are made face to face, on Jeremy’s phone, rather than bought here.\nYour name and the phone number or email you give\tIn the readings app on Jeremy’s phone, until you ask for them to be removed"));
      m.editSession(stripe, (s) => (((s.rig ??= {}).params ??= {}).phone_number_collection = { enabled: "false" }, s));
      m.editApi(summary, (a) => ((a.birthLine ||= "June 1, 1990 · 6:00 AM · Fargo, North Dakota"), a));
    },
    bad: [
      { name: "#10: the summary keeps none of them", plant: (m) => m.edit(m.pages[0], (t) => append(t, "Your PDF shows when and where you were born — and the summary keeps none of them.")), expect: /says the summary keeps no birth details/ },
      { name: "#11: Signature / Not-Self Theme", plant: (m) => m.edit(m.pages[0], (t) => append(t, "Profile, Definition, Signature and Not-Self Theme.")), expect: /"Signature" — the shop says "on track"/ },
      { name: "#11: Not-self written lower case", plant: (m) => m.edit(m.pages[0], (t) => append(t, "Your Not-self theme, named.")), expect: /"Not-self" — the shop says "on track"/ },
      { name: "#12: phone number at the payment page", plant: (m) => m.edit(m.pages[1], (t) => append(t, "Your name, email address and phone number\tThe payment page\tTo send you what you bought")), expect: /phone number is collected at payment/ },
      { name: "#12: Stripe receives your phone", plant: (m) => m.edit(m.pages[1], (t) => append(t, "Stripe takes the payment. They receive your name, email and phone.")), expect: /phone number is collected at payment/ },
    ],
  },

  /* ----------------------------------------------------------- #13 ---- */
  {
    check: "sample-pdfs",
    item: "#13",
    take: { samples: 1, pages: [P("a shop PDF", (p) => isResult(p) && withPdf(p))] },
    good(m) {
      const title = (pages) => pages.map((t, i) => (i === 0 ? setTitleLine(t, "Wren’s Human Design") : t));
      m.editPdf(m.pages[0], title);
      m.editSample(m.manifest.samples[0], (pages) => title(pages).map((t) => t.replace(/[ \t]*·?[ \t]*Timezone:[^\n]*/g, "")));
    },
    bad: [
      { name: "#13: a Timezone line", plant: (m) => m.editSample(m.manifest.samples[0], (pages) => pages.map((t, i) => (i === 0 ? `${t}\nTimezone: UTC-05:00` : t))), expect: /prints a "Timezone:" line/ },
      { name: "#13: the old title", plant: (m) => m.editSample(m.manifest.samples[0], (pages) => pages.map((t, i) => (i === 0 ? t.replace("Wren’s Human Design", "Wren Testwell") : t))), expect: /old title/ },
    ],
  },

  /* -------------------------------------------------------- rules ---- */
  {
    check: "us-spelling-no-shop",
    item: "rules",
    take: { pages: [P("a chart page with its PDF", (p) => isResult(p) && p.tier === 1 && withPdf(p)), P("a website page", (p) => p.kind === "website")] },
    good(m) {
      for (const p of m.pages) {
        m.edit(p, usSpell);
        if (p.pdf?.textFile) m.editPdf(p, (pages) => pages.map(usSpell));
      }
      // Right as they are: US words that look like UK ones, and "shop" inside an address.
      m.edit(m.pages[0], (t) => append(t, "Centered in practice: the analysis gave emphasis to travel, labeled and cataloged at the workshop. https://shop.example.org/shop"));
    },
    bad: [
      { name: "colour", plant: (m) => m.edit(m.pages[0], (t) => append(t, "Some centers are colour-filled.")), expect: /UK spelling "colour/ },
      { name: "centre", plant: (m) => m.edit(m.pages[1], (t) => append(t, "Your Sacral centre is steady.")), expect: /UK spelling "centre"/ },
      { name: "shop in customer copy", plant: (m) => m.edit(m.pages[0], (t) => append(t, "Thank you for visiting the shop.")), expect: /"shop" in customer copy/ },
    ],
  },

  /* --------------------------------------------- W2 W3 W5 W12 ---- */
  {
    check: "tier-aware-copy",
    item: "W2 W3 W5 W12",
    take: {
      pages: [P("a summary page", (p) => isResult(p) && p.tier === 0), P("a chart page with its PDF", (p) => isResult(p) && p.tier === 1 && withPdf(p)), P("a reading page with its PDF", (p) => isResult(p) && p.tier === 2 && withPdf(p))],
      steps: [P("a summary purchase", (j, s) => s.tier === 0 && (s.emails ?? []).some(receipt)), P("a reading purchase", (j, s) => s.tier === 2 && (s.emails ?? []).some(receipt))],
    },
    good(m) {
      const fix = (tier) => (t) => {
        let s = t.replace(/“Reading\s+your\s+bodygraph\.?”/g, "“Reading your bodygraph” (thechampagnemethod.co/library/bodygraph)");
        if (tier === 0) s = s.replace(/Below: your chart and its tables\.?/g, "Below: your summary’s values.");
        if (tier < 2) s = s.replace(/every word in your reading explained/gi, "every word in your chart explained").replace(/while you wait,?\s*/gi, "");
        if (tier === 1) s = s.replace(/HUMAN DESIGN INTERPRETATION/g, "HUMAN DESIGN");
        return s;
      };
      for (const p of m.pages) {
        m.edit(p, fix(p.tier));
        if (p.pdf?.textFile) m.editPdf(p, (pages) => pages.map(fix(p.tier)));
      }
      for (const e of m.mails()) m.editMail(e, fix(e._step.tier));
      // Right as they are, on the tier they belong to.
      m.edit(m.pages[1], (t) => append(t, "Below: your chart and its tables."));
      m.edit(m.pages[2], (t) => append(t, "Every part of a chart, and every word in your reading explained."));
      m.editMail(m.mails((e) => e._step.tier === 2 && receipt(e))[0], (t) => append(t, "WHILE YOU WAIT, FREE IN THE LIBRARY:"));
      m.editPdf(m.pages[2], (pages) => pages.map((t, i) => (i === 0 && !/HUMAN DESIGN INTERPRETATION/.test(t) ? `HUMAN DESIGN INTERPRETATION by THE CHAMPAGNE METHOD\n${t}` : t)));
    },
    bad: [
      { name: "W2: the summary promises a chart and its tables", plant: (m) => m.edit(m.pages[0], (t) => append(t, "Below: your chart and its tables.")), expect: /the summary says a chart drawing and tables follow/ },
      { name: "W3: your reading, to a summary buyer", plant: (m) => m.edit(m.pages[0], (t) => append(t, "Every part of a chart, and every word in your reading explained.")), expect: /"your reading" on a summary/ },
      { name: "W3: your reading, to a chart buyer", plant: (m) => m.edit(m.pages[1], (t) => append(t, "Every part of a chart, and every word in your reading explained.")), expect: /"your reading" on a chart/ },
      { name: "W5: While you wait on a summary receipt", plant: (m) => m.editMail(m.mails((e) => e._step.tier === 0 && receipt(e))[0], (t) => append(t, "WHILE YOU WAIT, FREE IN THE LIBRARY:")), expect: /"While you wait" in a summary email/ },
      { name: "W12: the chart-only PDF headed INTERPRETATION", plant: (m) => m.editPdf(m.pages[1], (pages) => pages.map((t, i) => (i === 0 ? `HUMAN DESIGN INTERPRETATION by THE CHAMPAGNE METHOD\n${t}` : t))), expect: /the chart-only PDF is headed "HUMAN DESIGN INTERPRETATION"/ },
      { name: "W12: the bodygraph guide given the library's address", plant: (m) => m.editPdf(m.pages[1], (pages) => pages.map((t, i) => (i === pages.length - 1 ? `${t}\nEvery word is explained in the free library, and the drawing on page 1 in “Reading your\nbodygraph.” Both are free, at thechampagnemethod.co/library/human-design.` : t))), expect: /names the bodygraph guide but prints only the library's address/ },
    ],
  },

  /* --------------------------------------- W1 W4 W9 W10 W14 ---- */
  {
    check: "style",
    item: "W1 W4 W9 W10 W14",
    take: {
      pages: [
        P("a summary page", (p) => isResult(p) && p.tier === 0),
        P("a reading page", (p) => isResult(p) && p.tier === 2),
        P("a form page", (p) => /^form/.test(p.kind)),
        P("the website's privacy page", (p) => p.kind === "website" && p.path === "/readings/privacy/"),
        P("the website's home page", (p) => p.kind === "website" && p.path === "/"),
      ],
    },
    good(m) {
      // When the website last changed, as git would say: the site on 10/21, the privacy text on 10/20.
      m.opts.websiteGit = (args) => new Date(args.length ? "2026-10-20T15:00:00Z" : "2026-10-21T15:00:00Z");
      const MONTH = "January|February|March|April|May|June|July|August|September|October|November|December";
      const fix = (t) =>
        t
          .replace(/([A-Za-z])\s-\s([A-Za-z])/g, "$1 — $2")
          .replace(/Cross of The ([A-Z])/g, "Cross of the $1")
          .replace(new RegExp(`\\b(\\d{1,2}) (${MONTH}) (\\d{4})\\b`, "g"), "$2 $1, $3")
          .replace(/(v\d+\.\d+\s*·\s*)[A-Z][a-z]{2,8} \d{4}/g, "$1Oct 2026")
          .replace(/Last updated [^.\n]*\d{4}/g, "Last updated October 20, 2026");
      for (const p of m.pages) {
        m.edit(p, fix);
        if (p.pdf?.textFile) m.editPdf(p, (pages) => pages.map(fix));
      }
      for (const label of ["TYPE", "STRATEGY", "AUTHORITY", "PROFILE"]) {
        m.edit(m.pages[0], (t) => {
          const v = getRow(t, label);
          return v ? setRow(t, label, v.replace(/\.(PROVISIONAL)?$/i, "$1")) : t;
        });
      }
      // Right as they are: a reading's row is the value, then a sentence; hyphens inside words.
      m.edit(m.pages[1], (t) => setRow(t, "TYPE", `${(getRow(t, "TYPE") ?? "Projector").split(".")[0]}. Wren keeps a lantern lit for the quiet hours.`));
      m.edit(m.pages[0], (t) => append(t, "A self-reliant, well-known design; channel 4-63."));
      if (!/Last updated/.test(m.text(m.pages[3]))) m.edit(m.pages[3], (t) => append(t, "Last updated October 20, 2026."));
      if (!/v\d+\.\d+\s*·/.test(m.text(m.pages[4]))) m.edit(m.pages[4], (t) => append(t, "v2.3 · Oct 2026"));
    },
    bad: [
      { name: "W1: a value alone ending with a period", plant: (m) => m.edit(m.pages[0], (t) => setRow(t, "TYPE", `${getRow(t, "TYPE").replace(/PROVISIONAL$/, "")}.`)), expect: /TYPE value ends with a period/ },
      { name: "W1: a provisional value ending with a period", plant: (m) => m.edit(m.pages[0], (t) => setRow(t, "AUTHORITY", `${getRow(t, "AUTHORITY").replace(/PROVISIONAL$/, "")}.PROVISIONAL`)), expect: /AUTHORITY value ends with a period/ },
      { name: "W4: a spaced hyphen for a dash", plant: (m) => m.edit(m.pages[0], (t) => append(t, "Birth time unknown - charted at noon.")), expect: /a spaced hyphen used as a dash/ },
      { name: "W14: Cross of The", plant: (m) => m.edit(m.pages[0], (t) => append(t, "Left Angle Cross of The Wren (1/2 | 3/4)")), expect: /capital "The" inside a cross name/ },
      { name: "W10: the date hint in UK order (reported once)", plant: (m) => m.edit(m.pages[2], (t) => append(t, "Month, day, then the four-digit year — 06251985 for 25 June 1985")), expect: /the date hint gives a UK-order example/, count: 1 },
      { name: "W10: a UK-order date on the website", plant: (m) => m.edit(m.pages[3], (t) => append(t, "The birth details changed on 16 October 2026.")), expect: /UK date order "16 October 2026"/ },
      { name: "W9: a footer months behind the site", plant: (m) => m.edit(m.pages[4], (t) => t.replace(/(v\d+\.\d+\s*·\s*)[A-Z][a-z]{2,8} \d{4}/, "$1Aug 2026")), expect: /footer/ },
      { name: "W9: Last updated before the privacy text last changed", plant: (m) => m.edit(m.pages[3], (t) => t.replace(/Last updated October 20, 2026/, "Last updated October 18, 2026")), expect: /"Last updated October 18, 2026" but its text last changed/ },
    ],
  },

  /* ----------------------------------------------------------- W13 ---- */
  {
    check: "drawing-names",
    item: "W13",
    take: { pages: [P("a page with the drawing", (p, B) => isResult(p) && !!B.api(p)?.output?.bodygraphSvg)] },
    good(m) {
      m.editApi(m.pages[0], (a) => ((a.output.bodygraphSvg = a.output.bodygraphSvg.replace(/>(\s*)EGO(\s*)</g, ">$1HEART$2<")), a));
    },
    bad: [{ name: "W13: EGO in the drawing", plant: (m) => m.editApi(m.pages[0], (a) => ((a.output.bodygraphSvg = a.output.bodygraphSvg.replace(/<\/svg>\s*$/, '<text x="1" y="1">EGO</text></svg>')), a)), expect: /drawing label "EGO"/ }],
  },

  /* ----------------------------------------------------------- W15 ---- */
  {
    check: "correction-note",
    item: "W15",
    take: { journeys: [P("a journey with three result steps", (j, B) => B.manifest.pages.filter((p) => isResult(p) && p.journey === j.id).length >= 3)] },
    good(m) {
      const j = m.manifest.journeys[0];
      const results = m.base.manifest.pages.filter((p) => isResult(p) && p.journey === j.id).slice(0, 3);
      for (const p of results) m.include(p);
      m.combos.journeys[0].steps = j.steps.map((s, i) => ({ do: s.do, tier: s.tier, ...(i === 1 ? { correct: { time: "06:40" } } : {}) }));
      const note = { type: "correction", changed: ["time"], was: { time: "06:25" }, now: { time: "06:40" } };
      for (const p of m.pages.slice(1)) {
        m.editApi(p, (a) => ((a.correction = note), a));
        m.edit(p, (t) => addAfter(t, /./, "YOUR CORRECTION\nBirth time changed from 6:25 AM to 6:40 AM."));
      }
    },
    bad: [
      { name: "W15: the note gone once the chart grows", plant: (m) => { const p = m.pages[2]; m.editApi(p, (a) => ((a.correction = null), a)); m.edit(p, (t) => t.replace(/YOUR CORRECTION\nBirth time changed[^\n]*\n?/, "")); }, expect: /no longer noted on the/ },
      { name: "the corrected chart with no note", plant: (m) => m.editApi(m.pages[1], (a) => ((a.correction = null), a)), expect: /the corrected chart carries no correction note/ },
    ],
  },

  /* ------------------------------------------------------------ W7 ---- */
  {
    check: "fresh-link-email",
    item: "W7",
    take: { fresh: true },
    good(m) {
      const e = m.manifest.freshLinkEmails[0];
      if (!e) throw new Error("the base run has no fresh-link email");
      e.subject = "A fresh link to Wren’s Human Design reading";
      m.editMail(e, (t) => t.replace(/^([^\n]*\n)/, "$1\nHere is the fresh link you asked for.\n").replace(/^(?![\s\S]*fresh link)/, "Here is the fresh link you asked for.\n"));
    },
    bad: [
      { name: "W7: the plain is-ready email", plant: (m) => { const e = m.manifest.freshLinkEmails[0]; e.subject = "Wren’s Human Design reading is ready"; m.editMail(e, (t) => t.replace(/fresh link|new link/gi, "reading")); }, expect: /reads as the plain "is ready" email/ },
      { name: "no email sent", plant: (m) => (m.manifest.freshLinkEmails = []), expect: /pressing the button sent no email/ },
    ],
  },

  /* ----------------------------------------------------------- rules ---- */
  {
    check: "phone-width",
    item: "rules",
    // The driver measures scrollWidth at 390 px; the check reads that number.
    take: { pages: [P("any page", () => true), P("another page", () => true)] },
    good(m) {
      for (const p of m.pages) p.phoneScrollWidth = 390;
    },
    bad: [{ name: "a page wider than a phone", plant: (m) => (m.pages[1].phoneScrollWidth = 512), expect: /512px wide at 390px/ }],
  },
  {
    check: "two-emails",
    item: "4A",
    // The emails each step sent, as the driver recorded them.
    take: { journeys: [P("a journey", () => true)] },
    good(m) {
      const s = m.manifest.journeys[0].steps[0];
      // Right as it is: an alert to Jeremy is not one of the buyer's two.
      s.emails.push(m.addMail("950-alert", "HD readings: a made-up alert", "Made-up alert."));
    },
    bad: [
      { name: "4A: three emails for one purchase", plant: (m) => { const s = m.manifest.journeys[0].steps[0]; const r = s.emails.find(ready); s.emails.push(m.addMail("951-ready-again", r.subject, "Hello again.")); }, expect: /1 receipt\(s\) and 2 "ready" email\(s\)/ },
      { name: "none at all", plant: (m) => (m.manifest.journeys[0].steps[0].emails = []), expect: /0 receipt\(s\) and 0 "ready"/ },
    ],
  },

  /* ---------------------------------------------- AI1 AI3 AI4 ---- */
  {
    check: "ai-writing",
    item: "AI1 AI3 AI4",
    take: { pages: [P("a placeholder reading page (its stand-in words made real)", placeholderReading)] },
    good(m) {
      m.editApi(m.pages[0], (a) => {
        const w = unmark(a.written);
        // Right as they are: -ing openers that ARE sentences, one soft line in four, the right spellings.
        Object.assign(w.summary, {
          Type: "Carrying a steady motor, you finish what you start.",
          Strategy: "Waiting for the invitation keeps your energy for the right door.",
          Authority: "Listening to your own voice is how you decide.",
          Profile: "Living it first makes the lesson yours.",
        });
        const ex = w.sections.find((s) => /experiment/i.test(s.heading));
        ex.paragraphs = [ex.paragraphs[0], "(Authority) Before you answer, say the choice out loud once.", "(Strategy) Wait for one clear invitation this week.", "(Profile) Notice when you want to hide, and take one hour alone.", "(Type) Rest before you are tired, once a day."];
        w.sections.find((s) => !/experiment/i.test(s.heading) && s.paragraphs?.length).paragraphs.push("Your bodygraph shows gate 21 and gate 48.");
        a.written = w;
      });
    },
    bad: [
      { name: "AI1: soft try-this lines", plant: (m) => m.editApi(m.pages[0], (a) => { const ex = a.written.sections.find((s) => /experiment/i.test(s.heading)); ex.paragraphs = [ex.paragraphs[0], "(Authority) Notice how a choice feels after a night.", "(Strategy) Watch what happens when you wait.", "(Profile) Observe the room before you speak.", "(Type) Rest before you are tired."]; }), expect: /3 of 4 try-this lines open softly/ },
      { name: "AI3: a fragment opening on -ing", plant: (m) => m.editApi(m.pages[0], (a) => (a.written.summary.Type = "Carrying a lantern that guides travelers through the dusk.")), expect: /glance row Type.*a fragment/ },
      { name: "AI3: a fragment with a when-clause", plant: (m) => m.editApi(m.pages[0], (a) => (a.written.summary.Signature = "Finding deep calm when you recognize your own pace.")), expect: /glance row Signature.*a fragment/ },
      { name: "AI3: a fragment with a before-phrase", plant: (m) => m.editApi(m.pages[0], (a) => (a.written.summary.Strategy = "Waiting for the proper invitation before committing your energy to new paths.")), expect: /glance row Strategy.*a fragment/ },
      { name: "AI4: body graph", plant: (m) => m.editApi(m.pages[0], (a) => a.written.sections[0].paragraphs.push("Your body graph holds the map.")), expect: /word slip "body graph"/ },
      { name: "AI4: gate numbers spelled out", plant: (m) => m.editApi(m.pages[0], (a) => a.written.sections[0].paragraphs.push("Through gates twenty-one and forty-eight you build.")), expect: /word slip "gates twenty"/ },
      // A stored reading fails only when the shop's checker would still let it through.
      { name: "AI1 in a stored live reading the checker would let through", plant: (m) => { m.opts.checker = PERMISSIVE; const a = m.api(m.pages[0]); const w = JSON.parse(JSON.stringify(a.written)); const ex = w.sections.find((s) => /experiment/i.test(s.heading)); ex.paragraphs = [ex.paragraphs[0], "Notice the pause.", "Watch the room.", "Observe the wave.", "Notice the door."]; m.fixture("stored.json", [{ tier: 2, output: a.output, written: w }]); }, expect: /stored live reading stored\.json#0.*4 of 4 try-this lines open softly/ },
    ],
  },
];
