/**
 * THE WRITER, REPLAYED. Gemini is never called. The fetch router sends
 * generativelanguage.googleapis.com here, and the answer is built from a
 * STORED READING: the exact words the live shop delivered for the same chart
 * (fixtures in the data home, from /api/reading). The stored `written` view is
 * turned back into the form the model fills (structured.mjs READING_SCHEMA),
 * so the real renderer, the real checker and the real retry loop all run on
 * it -- a word the checker misses live is missed here too.
 *
 * Which reading: the one whose activations match the facts on the wire
 * (chartFactsOnly prints every activation, so a match is the same birth).
 *
 * No stored reading for this chart (a Reflector, an Ego authority...): a
 * PLAINLY MARKED placeholder reading, built from the facts so it satisfies the
 * checker. It exists so the reading-tier PAGES, PDFs and emails can be tested
 * for every chart shape; its wording is never judged (the report says which
 * readings were placeholders).
 */
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
// The shop's near-miss and try-this checks, where the checked-out shop has them (10/21 fixes on);
// code from before it has none, never refuses a stored reading, and never asks twice.
const {
  nearMissProblem = () => null,
  takeawayProblem = () => null,
  slipProblem = () => null,
  glanceFragment = () => false,
  sanitize = (t) => t,
  TAKEAWAYS = "Things to experiment with",
} = await import("../../../netlify/lib/interpretation.mjs");
// The writer's whole check (10/22, prompt v3 rev l), where the checked-out shop has it.
const { draftCheck = null } = await import("../../../netlify/lib/gemini.mjs");
const { renderReading = null } = await import("../../../netlify/lib/structured.mjs");

const INTERPRETATION = [
  "Your energy, and how it starts",
  "How you decide",
  "How you meet the world",
  "What is consistently yours",
  "What you take in from others",
  "When it's on track, and when it's off track",
];
const OLD = { "When it is working, and when it is not": INTERPRETATION[5] };
const SLOTS = ["energy", "decide", "meet", "consistent", "takeIn", "working"];

const acts = (v) => (Array.isArray(v) ? v.map((a) => `${String(a.planet ?? "").toLowerCase()} ${a.gate}.${a.line}`).join(", ") : "");

/** The model's form, from a stored reading's parsed view. */
export function formFromWritten(written) {
  const s = written?.summary ?? {};
  const json = {
    summary: {
      type: s.Type ?? "",
      strategy: s.Strategy ?? "",
      authority: s.Authority ?? "",
      profile: s.Profile ?? "",
      signature: s.Signature ?? "",
      notSelf: s["Not-self"] ?? "",
    },
    channels: [],
    profileLines: [],
    takeaways: [],
  };
  for (const sec of written?.sections ?? []) {
    const heading = OLD[sec.heading] ?? sec.heading;
    const paras = sec.paragraphs ?? [];
    if (heading === "Your incarnation cross") json.incarnationCross = paras.join(" ");
    else if (heading === "Your definition") json.definition = paras.join(" ");
    else if (heading === "Your channels") {
      for (const p of paras) {
        const m = /^(\d+-\d+)\b[^:]*:\s*(.*)$/.exec(p);
        if (m) json.channels.push({ channel: m[1], sentence: m[2] });
      }
    } else if (heading === "Your profile lines") {
      for (const p of paras) {
        const m = /^Line (\d)\b[^:]*:\s*(.*)$/.exec(p);
        if (m) json.profileLines.push({ line: Number(m[1]), sentence: m[2] });
      }
    } else if (heading === "Things to experiment with") {
      json.experimentIntro = paras[0] ?? "";
      json.takeaways = paras.slice(1);
    } else {
      const i = INTERPRETATION.indexOf(heading);
      if (i >= 0) json[SLOTS[i]] = { lede: sec.lede ?? "", paragraphs: paras };
    }
  }
  return json;
}

function facts(text) {
  const get = (label) => (text.match(new RegExp(`^${label}: (.*)$`, "m"))?.[1] ?? "").trim();
  const list = (label) => {
    const v = get(label);
    return !v || v === "none" ? [] : v.split(", ").map((x) => x.trim());
  };
  return {
    type: get("Type"),
    strategy: get("Strategy"),
    authority: get("Inner Authority"),
    profile: get("Profile"),
    definition: get("Definition"),
    signature: get("When it's on track, the feeling is") || get("Signature"),
    notSelf: get("When it's off track, the feeling is") || get("Not-Self Theme"),
    cross: get("Incarnation Cross"),
    defined: list("Defined centers"),
    undefined: list("Undefined centers \\(not colored in, but carrying gates\\)"),
    open: list("Open centers \\(not colored in, with no gates at all\\)"),
    channels: list("Channels"),
    personality: get("Personality activations"),
    design: get("Design activations"),
    timeUnknown: /birth time was not known/.test(text),
  };
}

const LINE_NAMES = { 1: "Investigator", 2: "Hermit", 3: "Martyr", 4: "Opportunist", 5: "Heretic", 6: "Role Model" };

/** A plainly marked placeholder that names every value the checker looks for. */
export function placeholderForm(f) {
  const [a, b] = (f.profile.match(/^(\d)\/(\d)/) ?? [null, "1", "3"]).slice(1);
  const one = (list, state) => list.map((c) => `Your ${c} center is ${state}.`).join(" ");
  const para = (topic) =>
    `[RIG PLACEHOLDER] This paragraph stands in for the written ${topic} of a ${f.type} chart, so the page and the PDF have a real length to lay out. ` +
    `It repeats nothing a buyer would read, and it is here only so every section of the reading has words in it for the rig to measure.`;
  const sec = (topic) => ({ lede: `[RIG PLACEHOLDER] The lead line for ${topic}, which you can skip.`, paragraphs: [para(topic), para(topic + " (second)")] });
  return {
    summary: {
      type: `[RIG PLACEHOLDER] You are a ${f.type}.`,
      strategy: `[RIG PLACEHOLDER] Your strategy is to ${f.strategy.toLowerCase()}.`,
      authority: `[RIG PLACEHOLDER] Your ${f.authority} authority is how you decide.`,
      profile: `[RIG PLACEHOLDER] Your profile is ${f.profile}.`,
      signature: `[RIG PLACEHOLDER] On track, the feeling is ${f.signature.toLowerCase()}.`,
      notSelf: `[RIG PLACEHOLDER] Off track, the feeling is ${f.notSelf.toLowerCase()}.`,
    },
    incarnationCross: `[RIG PLACEHOLDER] Your cross is the ${f.cross}. ${para("cross")}`,
    definition: `[RIG PLACEHOLDER] Your definition is ${f.definition}.`,
    channels: f.channels.map((c) => ({ channel: c.split(" ")[0], sentence: `[RIG PLACEHOLDER] The sentence for channel ${c.split(" ")[0]}.` })),
    profileLines: [
      { line: Number(a), sentence: `[RIG PLACEHOLDER] Line ${a} (${LINE_NAMES[a]}) is your conscious line.` },
      { line: Number(b), sentence: `[RIG PLACEHOLDER] Line ${b} (${LINE_NAMES[b]}) is your unconscious line.` },
    ],
    energy: sec("energy"),
    decide: sec("decisions"),
    meet: sec("meeting the world"),
    consistent: { ...sec("what is consistently yours"), paragraphs: [para("what is consistently yours") + " " + (one(f.defined, "defined") || "No center is defined."), para("consistency (second)")] },
    takeIn: { ...sec("what you take in"), paragraphs: [para("what you take in") + " " + one(f.undefined, "undefined"), para("what you take in (second)") + " " + one(f.open, "open")] },
    working: sec("being on track, or off it"),
    experimentIntro: "[RIG PLACEHOLDER] These are invitations to test, not instructions.",
    // As long as real ones (about 45 words, the shape the prompt asks for), so a
    // PDF's last page is filled the way a real reading fills it: one-line
    // stand-ins left the last page under 15% and failed pdf-page-fill (10/21).
    takeaways: [
      `(Authority) The next time a small choice is yours alone, like what to cook tonight, you might wait for your ${f.authority} authority before you answer. Notice what changes, so the wait is familiar when a heavier choice comes along.`,
      `(Strategy) This week, on an easy plan like a walk after dinner, you might follow your strategy from start to finish. Notice how the plan feels an hour later, so the strategy is familiar when more depends on it.`,
      `(Profile ${f.profile}) Over the next few days, in an easy catch-up with a friend, you might let one line of your profile lead the conversation. Notice how it is received, so that line is familiar when an opening matters more.`,
      `(Type) Once or twice this week, on something light like a short errand, you might work the way a ${f.type} is built to. Notice how your energy holds up afterward, so that pace is familiar when the week is fuller.`,
    ],
  };
}

export function loadReadingFixtures(dir) {
  const out = [];
  let files = [];
  try {
    files = readdirSync(dir).filter((f) => f.endsWith(".json"));
  } catch {
    return out;
  }
  for (const f of files) {
    let j;
    try {
      j = JSON.parse(readFileSync(join(dir, f), "utf8"));
    } catch {
      continue;
    }
    for (const [i, r] of (Array.isArray(j) ? j : [j]).entries()) {
      if (!r?.written || !r?.output?.personality) continue;
      out.push({ source: Array.isArray(j) ? `${f}#${i}` : f, key: `${acts(r.output.personality)}|${acts(r.output.design)}`, record: r });
    }
  }
  return out;
}

/**
 * THE NEXT DRAFT, after the shop refused a stored reading. Replayed word for
 * word, a reading the checker now refuses (Rowan's live reading is bug 15's
 * "depleted and frustrated") would be refused five times over, and the run
 * would show an outage the live shop would not have: the model writes again.
 * So a repeat request for the same chart gets the stored words without the
 * sentences the shop's own near-miss check names -- the smallest rewrite that
 * passes, and a no-op for a reading with no near miss.
 *
 * Two more rules came with the try-this rewrite (10/21): a UK spelling is
 * written the US way, and try-this lines the shop refuses (every stored one
 * opens "Notice / Watch") are replaced by the placeholder's own four, in the
 * shape the new prompt asks for: each its own, two sentences, unmarked (10/22:
 * the shop refuses square brackets in a try-this line). A stored reading
 * written to the new prompt keeps its own lines. Whatever else the writer's
 * whole check still refuses, redraft() below takes out.
 */
const US = [
  [/\b(c)entre(s|d)?\b/gi, (_, c, e = "") => `${c}enter${e === "d" ? "ed" : e}`],
  [/\b(colo|behavio|favo|hono|neighbo|labo|endeavo|rumo|savo|harbo)ur/gi, "$1r"],
  [/\b(recogn|real|organ|emphas|priorit|minim|maxim|energ|harmon|critic|apolog|sympath)is(e|ed|es|ing|able|ation)\b/gi, "$1iz$2"],
  [/\banalys(e|ed|ing)\b/gi, "analyz$1"],
  [/\bpractis(e|ed|es|ing)\b/gi, (_, e) => ({ e: "practice", ed: "practiced", es: "practices", ing: "practicing" })[e]],
  [/\bprogramme(s?)\b/gi, "program$1"],
  [/\b(travel|cancel|label|model)l(ed|ing|er|ers)\b/gi, "$1$2"],
  [/\bfulfil(s|ment)?\b/gi, (_, e = "") => (e === "ment" ? "fulfillment" : `fulfill${e}`)],
  [/\bgrey\b/gi, "gray"],
  [/\blearnt\b/gi, "learned"],
  [/\bspelt\b/gi, "spelled"],
  [/\bwhilst\b/gi, "while"],
  [/\bamongst\b/gi, "among"],
  [/\bdefence\b/gi, "defense"],
  [/\blicence\b/gi, "license"],
];
const usSpelling = (v) =>
  typeof v === "string" ? US.reduce((t, [re, to]) => t.replace(re, to), v) : Array.isArray(v) ? v.map(usSpelling) : v && typeof v === "object" ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, usSpelling(x)])) : v;
const ON_TRACK = INTERPRETATION[5];
/**
 * A glance row written again whole: each row its own sentence, sharing no run of
 * words with another (10/22 full rig: a common tail read as a repeat on the
 * page and the PDF), and never "signature".
 */
export const STAND_IN_ROWS = {
  type: "The rig stood this type row in for the model.",
  strategy: "A stand-in strategy row sits here for this run.",
  authority: "This authority line was replaced while the rig ran.",
  profile: "Here the profile row carries placeholder words instead.",
  signature: "An on-track row filled in by the test bench.",
  notSelf: "Off-track wording swapped out during the local check.",
};
const standInRow = (k) => STAND_IN_ROWS[k] ?? "A glance row the rig put in place of a refused one.";
export function nextDraft(form, f) {
  const type = f.type;
  // A sentence the shop refuses: a near miss, or a known word slip (10/21).
  const named = (heading) => (s) => nearMissProblem(`${heading}\n\n${s}\n`, type) !== null || slipProblem(`${heading}\n\n${s}\n`) !== null;
  const keep = (text, bad) =>
    typeof text === "string" ? text.split(/(?<=[.!?])\s+/).filter((s) => !bad(s)).join(" ") : text;
  const onTrack = named(ON_TRACK);
  const anywhere = named(INTERPRETATION[1]);
  const sec = (s, bad) => (s ? { ...s, lede: keep(s.lede, bad), paragraphs: (s.paragraphs ?? []).map((p) => keep(p, bad)) } : s);
  const out = JSON.parse(JSON.stringify(form));
  out.summary.signature = keep(out.summary.signature, onTrack);
  out.summary.notSelf = keep(out.summary.notSelf, onTrack);
  for (const slot of SLOTS) out[slot] = sec(out[slot], slot === "working" ? onTrack : anywhere);
  out.takeaways = (out.takeaways ?? []).map((t) => keep(t, anywhere));
  // The mechanics paragraphs too (a slip like "gates fifty" sits in the cross).
  for (const k of ["incarnationCross", "definition"]) out[k] = keep(out[k], anywhere);
  for (const list of [out.channels, out.profileLines]) for (const x of list ?? []) x.sentence = keep(x.sentence, anywhere);
  // A no-op on words already spelled the US way.
  const written = usSpelling(out);
  // A glance row that is a fragment is written again whole (AI3, 10/21): a stand-in of its own per row, so no two rows read the same.
  for (const k of Object.keys(written.summary ?? {})) {
    const row = String(written.summary[k] ?? "");
    // A fragment, or a row under five words (the 10/17 bare-word rule).
    if (glanceFragment(row) || row.split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w)).length < 5)
      written.summary[k] = standInRow(k);
  }
  const tryThis = [TAKEAWAYS, written.experimentIntro ?? "", ...(written.takeaways ?? [])].join("\n\n") + "\n";
  if (takeawayProblem(tryThis)) {
    // The refused try-this lines are stood in for by the placeholder's four: each
    // its own, two sentences, the shape the prompt asks for (10/22). Unmarked:
    // the shop refuses square brackets in a try-this line (a slot left from the
    // instructions), and the rest of this reading is still the model's own
    // words, judged as such. The gemini log says which drafts were stood in for.
    written.takeaways = placeholderForm(f).takeaways;
  }
  return written;
}

/** The chart the facts describe, for the shop's own checks (the fake model sees only the facts). */
const NOTE_FIELDS = {
  Type: ["type"],
  Strategy: ["strategy"],
  "Inner Authority": ["authority"],
  Profile: ["profile"],
  Definition: ["definition"],
  "the on-track feeling": ["signature"],
  Signature: ["signature"],
  "the off-track feeling": ["notSelfTheme"],
  "Not-Self Theme": ["notSelfTheme"],
  "Incarnation Cross": ["incarnationCross"],
  "the centers' states (defined, undefined or open)": ["definedCenters", "undefinedCenters", "openCenters"],
  Channels: ["channels"],
};
export function outputFromFacts(f, text) {
  const out = {
    type: f.type,
    strategy: f.strategy,
    authority: f.authority,
    profile: f.profile,
    definition: f.definition,
    signature: f.signature,
    notSelfTheme: f.notSelf,
    incarnationCross: f.cross,
    definedCenters: f.defined,
    undefinedCenters: f.undefined,
    openCenters: f.open,
    channels: f.channels,
    timeKnown: !f.timeUnknown,
  };
  const note = /^NOTE: birth time was not known.*$/m.exec(text)?.[0] ?? "";
  if (!note) return out;
  if (/every value above holds at any birth time/.test(note)) return { ...out, timeSpread: { ok: true, window: [0, 1439], changes: [] } };
  const list = /values can change with the birth time: (.*?)\. Every other value/.exec(note)?.[1] ?? "";
  // Each name the NOTE can say, found in its list ("Profile, the centers' states (defined, undefined or open) and Channels").
  const said = (name) => new RegExp(`(?:^|, | and )${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?=,| and |$)`).test(list);
  const fields = Object.entries(NOTE_FIELDS).flatMap(([name, f]) => (said(name) ? f : []));
  return /Measured across the whole birth day/.test(note) ? { ...out, timeSpread: { ok: true, window: [0, 1439], changes: fields } } : { ...out, provisional: fields };
}

/** Every string a form carries, with a way to change it: [where, get, set]. */
function formStrings(form) {
  const out = [];
  const at = (obj, key, where) => typeof obj?.[key] === "string" && out.push([where, () => obj[key], (v) => (obj[key] = v)]);
  for (const k of Object.keys(form.summary ?? {})) at(form.summary, k, `summary.${k}`);
  for (const slot of SLOTS) {
    const s = form[slot];
    if (!s) continue;
    at(s, "lede", `${slot}.lede`);
    (s.paragraphs ?? []).forEach((_, i) => at(s.paragraphs, i, `${slot}.p${i}`));
  }
  for (const k of ["incarnationCross", "definition", "experimentIntro"]) at(form, k, k);
  (form.takeaways ?? []).forEach((_, i) => at(form.takeaways, i, `takeaways.${i}`));
  for (const list of [form.channels, form.profileLines]) for (const x of list ?? []) at(x, "sentence", "sentence");
  return out;
}

/**
 * THE NEXT DRAFT, HELD TO THE WRITER'S WHOLE CHECK (10/22, prompt v3 rev l). The
 * smallest rewrite (nextDraft), then, while the shop's own draftCheck still
 * refuses it: the sentence it quotes is dropped (a glance row or try-this line
 * is stood in for instead). A draft the checker cannot be satisfied that way
 * gives the plainly marked placeholder, so a reading-tier journey always gets
 * a reading -- the live shop's model writes again until one passes.
 */
export function redraft(stored, f, { instruction = "", facts: text = "" } = {}) {
  const form = nextDraft(stored, f);
  if (!draftCheck || !renderReading) return form;
  const output = outputFromFacts(f, text);
  const norm = (s) => String(s).replace(/\s+/g, " ").trim();
  for (let i = 0; i < 80; i++) {
    const built = renderReading(form, output);
    if (built.problem) break;
    const problem = draftCheck(sanitize(built.text), output, { instruction, facts: text, json: true });
    if (!problem) return form;
    // The checker quotes what it refused, last: `...: "<the words>"`, the refused words in the
    // middle of some context (cut with "..."). The sentence at the middle is the one refused.
    const quoted = norm(/"([^"]*)"\s*$/.exec(problem)?.[1]?.replace(/^\.\.\.|\.\.\.$|…$/g, "") ?? "");
    const mid = Math.floor(quoted.length / 2);
    const from = Math.max(quoted.lastIndexOf(". ", mid) + 2, 0);
    const to = quoted.indexOf(". ", mid);
    const piece = quoted.slice(from, to < 0 ? undefined : to).trim().slice(0, 40);
    if (piece.length < 6) break;
    const hit = formStrings(form).find(([, get]) => norm(get()).includes(piece));
    if (!hit) break;
    const [where, get, set] = hit;
    if (where.startsWith("takeaways.")) {
      const stand = placeholderForm(f).takeaways;
      if (JSON.stringify(form.takeaways) === JSON.stringify(stand)) break;
      form.takeaways = stand;
    } else if (where.startsWith("summary.")) {
      const row = standInRow(where.slice(8));
      if (get() === row) break;
      set(row);
    } else {
      const kept = get()
        .split(/(?<=[.!?])\s+/)
        .filter((s) => !norm(s).includes(piece) && !piece.includes(norm(s).slice(0, 40)));
      if (kept.join(" ") === get()) break;
      set(kept.join(" "));
    }
  }
  return placeholderForm(f);
}

export function fakeGemini({ dir, fixturesDir }) {
  mkdirSync(dir, { recursive: true });
  const fixtures = loadReadingFixtures(fixturesDir);
  const asked = [];
  const tries = new Map(); // chart -> requests so far this run
  async function api(request) {
    const body = await request.json().catch(() => null);
    const text = body?.contents?.[0]?.parts?.map((p) => p.text ?? "").join("") ?? "";
    const f = facts(text);
    const key = `${f.personality}|${f.design}`;
    const again = (tries.get(key) ?? 0) > 0;
    tries.set(key, (tries.get(key) ?? 0) + 1);
    // Newest stored reading for this chart wins (the live shop's latest words).
    const hit = fixtures.filter((x) => x.key === key).sort((a, b) => (b.record.purchasedAt ?? 0) - (a.record.purchasedAt ?? 0))[0];
    const stored = hit ? formFromWritten(hit.record.written) : null;
    const instruction = body?.system_instruction?.parts?.map((p) => p.text ?? "").join("") ?? "";
    const form = stored ? (again ? redraft(stored, f, { instruction, facts: text }) : stored) : placeholderForm(f);
    const n = asked.length + 1;
    const entry = { n, at: Date.now(), type: f.type, authority: f.authority, profile: f.profile, cross: f.cross, source: hit ? `${hit.source}${again ? " (next draft)" : ""}` : "placeholder" };
    asked.push(entry);
    writeFileSync(join(dir, `${String(n).padStart(3, "0")}.json`), JSON.stringify({ ...entry, facts: text, form }, null, 1));
    return new Response(
      JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(form) }], role: "model" }, finishReason: "STOP" }] }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  }
  return { api, asked, fixtures };
}
