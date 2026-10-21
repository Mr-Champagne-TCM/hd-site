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
import { nearMissProblem } from "../../../netlify/lib/interpretation.mjs";

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
    working: sec("on track and off track"),
    experimentIntro: "[RIG PLACEHOLDER] These are invitations to test, not instructions.",
    takeaways: [
      `(Authority) [RIG PLACEHOLDER] An experiment with your ${f.authority} authority.`,
      `(Strategy) [RIG PLACEHOLDER] An experiment with your strategy.`,
      `(Profile ${f.profile}) [RIG PLACEHOLDER] An experiment with your profile.`,
      `(Type) [RIG PLACEHOLDER] An experiment with being a ${f.type}.`,
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
 */
const ON_TRACK = INTERPRETATION[5];
export function nextDraft(form, type) {
  const named = (heading) => (s) => nearMissProblem(`${heading}\n\n${s}\n`, type) !== null;
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
  return out;
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
    const form = stored ? (again ? nextDraft(stored, f.type) : stored) : placeholderForm(f);
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
