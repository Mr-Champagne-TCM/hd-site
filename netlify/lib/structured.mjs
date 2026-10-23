/**
 * THE READING AS A FORM, NOT A LETTER.
 *
 * Measured 2026-10-04 on four charts, sixteen drafts: 3.5 Flash Lite passed
 * three. Every refusal was the model RECALLING something it had been handed --
 * a heading it renamed or dropped, a signature word from another type, a
 * channel's centres written backwards. A fact we write ourselves cannot be
 * miscopied, so the model now fills one slot per section and this file builds
 * the document from them:
 *
 *   - headings, the summary labels, the disclaimer: ours, verbatim;
 *   - "10-34 (Exploration), G to Sacral": the engine's, when it sends
 *     channelLines (0.3.0+); before that the model still writes the prefix;
 *   - "Line 2 (Hermit), conscious": ours, from the profile.
 *
 * The output is the same plain text the old prompt asked for, so every
 * validator, the parser, the page and the PDF run on it unchanged. That is
 * deliberate: the checks keep checking, and nothing downstream had to move.
 */

import {
  DISCLAIMER,
  SUMMARY_MARKER,
  MECHANICS,
  INTERPRETATION,
  TAKEAWAYS,
  SUMMARY_KEYS,
  SUMMARY_LABELS,
  TYPE_WORDS,
  negatedAt,
  GATE_CENTER,
  CHANNEL_CENTRES,
  MOTOR_CENTRES,
  channelKey,
} from "./interpretation.mjs";
import { PROFILE_LINE_NAMES } from "./mechanics.mjs";

/** Slot names for the six interpretation sections, in INTERPRETATION order. */
const SECTION_SLOTS = ["energy", "decide", "meet", "consistent", "takeIn", "working"];
const SUMMARY_SLOTS = ["type", "strategy", "authority", "profile", "signature", "notSelf"];

const S = (description) => ({ type: "STRING", description });

/**
 * THE TWO SLOTS NAMED AFTER THE OLD WORDS (10/7). The slots are called
 * "signature" and "notSelf", and on the first live run with the prompt rule
 * against the old words, every draft that still wrote them (3 of 17) wrote them
 * HERE: "Your signature feeling of satisfaction...". The note sits on the slot
 * itself, where the model is writing. oldWordProblem refuses what still slips.
 */
/** profileLines: the model wrote "your first profile line" for the first DIGIT (10/7). */
const PROFILE_LINE_SENTENCE =
  "ONE sentence, at most 26 words, about THIS line only. Call it by its own number, never \"first\" or \"second\" line.";

const TRACK_SLOTS = ["signature", "notSelf"];
const TRACK_SLOT =
  'ONE sentence, at most 22 words, on how it feels. Never the words "signature" or "not-self": the page says "when it\'s on track" / "when it\'s off track".' +
  // 10/7: Manifestors kept writing "Your frustration..." (a Generator's word).
  " Name the feeling only with the reader's own word from the facts, never another type's.";
/**
 * A TRY-THIS LINE (Jeremy 10/21 shape A; 10/22 two sentences). The shape in
 * words, never a sentence to fill in: on 10/22 eleven delivered lines were
 * this note's old example copied, and the next prompt's placeholders were
 * written out as they stood. gemini.mjs refuses a run of 8+ words from here.
 */
const TAKEAWAY_SLOT =
  'TWO sentences. First: the chart feature in parentheses, one time phrase, one small moment, then "you might" and one action, ending with a period. ' +
  'Second: opens "Notice", says what to notice, then ", so" and why starting small helps. Words of your own, never these.';

/**
 * NOTES ON THE TEXT SLOTS ONLY, AND "Words of your own, never these." KEPT
 * (10/23, measured on the live model). On v3 drafts the model sometimes
 * filled whole forms with the type name -- "string" in every text slot, 0 in
 * the line numbers, 421 tokens. A note on every object, list and number was
 * tried (10/22, offline) and made it far worse: 4 of 6 asks came back as
 * placeholders, and the summary rows came back as the bare value
 * ("Type: generator") -- the summary note said "one per chart value". With
 * the notes on the text slots only, as here, and the try-this note's last
 * words kept, 0 of 14 asks did (diag-o-B, diag-o-F, diag-p-F); with those
 * last words dropped, 3 of 6 did again (diag-o-C). A form that still comes
 * back as placeholders is refused (renderReading), re-asked, and counted as
 * "gemini-placeholder".
 */
const SECTION = {
  type: "OBJECT",
  properties: {
    lede: S("ONE sentence, at most 25 words, stating the whole point of the section. Contains \"you\"."),
    paragraphs: {
      type: "ARRAY",
      items: S("60-75 words. Names the chart value it rests on."),
      minItems: 2,
      maxItems: 2,
    },
  },
  required: ["lede", "paragraphs"],
  propertyOrdering: ["lede", "paragraphs"],
};

/** Gemini's responseSchema (OpenAPI subset). Every slot required. */
export const READING_SCHEMA = {
  type: "OBJECT",
  properties: {
    summary: {
      type: "OBJECT",
      properties: Object.fromEntries(
        SUMMARY_SLOTS.map((k) => [k, S(TRACK_SLOTS.includes(k) ? TRACK_SLOT : "ONE sentence, at most 22 words.")]),
      ),
      required: SUMMARY_SLOTS,
      propertyOrdering: SUMMARY_SLOTS,
    },
    incarnationCross: S("ONE paragraph, 55-75 words, on the life theme of the cross exactly as supplied."),
    definition: S("ONE paragraph, 45-60 words, on what their definition means mechanically."),
    channels: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          channel: S("The channel's numbers exactly as supplied, e.g. \"10-34\"."),
          sentence: S("ONE sentence, at most 26 words."),
        },
        required: ["channel", "sentence"],
        propertyOrdering: ["channel", "sentence"],
      },
    },
    profileLines: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          line: { type: "INTEGER" },
          // 10/7: "Your first profile line" under Line 6 -- every 6/2 draft that night.
          sentence: S(PROFILE_LINE_SENTENCE),
        },
        required: ["line", "sentence"],
        propertyOrdering: ["line", "sentence"],
      },
      minItems: 2,
      maxItems: 2,
    },
    ...Object.fromEntries(SECTION_SLOTS.map((k) => [k, SECTION])),
    experimentIntro: S("ONE paragraph: these are invitations to test, not instructions; they are the authority."),
    takeaways: {
      type: "ARRAY",
      // Shape A (Jeremy 10/21) in two sentences (10/22: "This sentence division adds
      // clarity and avoids a needlessly lengthy sentence"). Rules only, no example:
      // 11 delivered lines on 10/22 were the old example sentence copied.
      items: S(TAKEAWAY_SLOT),
      minItems: 4,
      maxItems: 4,
    },
  },
  required: [
    "summary", "incarnationCross", "definition", "channels", "profileLines",
    ...SECTION_SLOTS, "experimentIntro", "takeaways",
  ],
  propertyOrdering: [
    "summary", "incarnationCross", "definition", "channels", "profileLines",
    ...SECTION_SLOTS, "experimentIntro", "takeaways",
  ],
};

/**
 * EVERY NOTE THE MODEL READS IN THE FORM, one string per slot description, in
 * schema order. With the prompt, these are what copyProblem (interpretation.mjs)
 * holds a draft against: a run of 8+ words from either is a copy, not writing.
 */
export function schemaNotes(schema = READING_SCHEMA) {
  const out = [];
  const walk = (o) => {
    if (Array.isArray(o)) o.forEach(walk);
    else if (o && typeof o === "object") {
      for (const [k, v] of Object.entries(o)) {
        if (k === "description" && typeof v === "string") out.push(v);
        else walk(v);
      }
    }
  };
  walk(schema);
  return out;
}

/**
 * WORDS THAT BELONG TO OTHER TYPES. Handed to the model by name, per chart.
 * Five of thirteen refusals in the benchmark were exactly this: "Satisfaction"
 * on a Projector, "Bitterness" on a Reflector. The facts already said
 * "Signature: Success"; saying what is NOT theirs is the part that was missing.
 */
export function reservedWords(type) {
  const own = TYPE_WORDS[type];
  if (!own) return [];
  const all = new Set(Object.values(TYPE_WORDS).flatMap((w) => [w.signature, w.notSelf]));
  all.delete(own.signature);
  all.delete(own.notSelf);
  return [...all];
}

/**
 * THE OTHER TYPES' WORDS IN EVERY FORM (10/23 round). Named as nouns only
 * ("Frustration"), they still came back as "frustrated", "frustrating",
 * "satisfying" in the on / off track writing: 19 refusals in round v3p, 0
 * first-try passes for 7 Manifestors. Named in every form, per chart, 2 of 14
 * asks on the same Manifestor and Projector charts (diag-ab-pR) against 6 of
 * 14 (diag-ab-p).
 */
const WORD_FORMS = {
  Satisfaction: "satisfaction, satisfied, satisfying",
  Frustration: "frustration, frustrated, frustrating",
  Success: "success, successful",
  Bitterness: "bitterness, bitter",
  Surprise: "surprise, surprised, surprising",
  Disappointment: "disappointment, disappointed, disappointing",
  Peace: "peace, peaceful",
  Anger: "anger, angry",
};

/**
 * FACT CARDS (10/23, an A/B arm; OFF in production until measured). The facts
 * name each center's state but not what a center is, so the model supplied
 * the meaning and got it wrong: "Throat ... a powerful motor", "the Heart
 * connects to the Throat". A card is a compact note per center, never a
 * sentence to copy: its state (with the gates lit on an undefined one), motor
 * or not, the centers its channels join it to (the gate table the fact checks
 * use), and three themes from Jeremy's library (HD-Library-Work
 * content/centers.json and the library one-liners). A split chart's parts are
 * named, with the reminder that a split is not a bridge.
 */
export const FACT_CARDS = false;
const CARD_ORDER = ["Head", "Ajna", "Throat", "G", "Heart", "Sacral", "Spleen", "Solar Plexus", "Root"];
const CARD_THEMES = {
  Head: "questions, inspiration, pressure to figure things out",
  Ajna: "making sense of things, opinions, ideas and concepts",
  Throat: "words, actions, being seen and heard",
  G: "identity, direction, love",
  Heart: "willpower, promises, self-worth",
  Sacral: "life force, work energy, keeping going",
  Spleen: "instinct, health, well-being right now",
  "Solar Plexus": "emotions in waves, feelings, clarity with time",
  Root: "pressure, the drive to get going, stress",
};
const PART_WORDS = ["one part", "another part", "a third part", "a fourth part"];
const andList = (xs) => (xs.length < 2 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs.at(-1)}`);

export function factCards(output) {
  const defined = Array.isArray(output?.definedCenters) ? output.definedCenters : [];
  const undef = Array.isArray(output?.undefinedCenters) ? output.undefinedCenters : [];
  const open = Array.isArray(output?.openCenters) ? output.openCenters : [];
  const channels = [];
  for (const ch of Array.isArray(output?.channels) ? output.channels : []) {
    const m = /^(\d{1,2})\s*-\s*(\d{1,2})/.exec(String(ch));
    const key = m && channelKey(+m[1], +m[2]);
    if (key && CHANNEL_CENTRES.has(key)) channels.push([key, CHANNEL_CENTRES.get(key)]);
  }
  const lit = new Set(
    [...(Array.isArray(output?.personality) ? output.personality : []), ...(Array.isArray(output?.design) ? output.design : [])]
      .map((a) => Number(a?.gate))
      .filter(Number.isFinite),
  );
  const lines = ["Center notes for this chart, in brief (state; motor or not; channels; themes):"];
  for (const c of CARD_ORDER) {
    let state;
    if (defined.includes(c)) state = "defined";
    else if (undef.includes(c)) {
      const gates = [...lit].filter((g) => GATE_CENTER[g] === c).sort((a, b) => a - b);
      state = gates.length ? `undefined, ${gates.length > 1 ? "gates" : "gate"} ${andList(gates.map(String))} lit` : "undefined";
    } else if (open.includes(c)) state = "open, no gate lit";
    else continue;
    const joins = channels
      .filter(([, pair]) => pair.includes(c))
      .map(([key, pair]) => `to the ${pair[0] === c ? pair[1] : pair[0]} by Channel ${key}`);
    const wired = joins.length ? `joined ${joins.join(" and ")}` : "no channel";
    lines.push(`${c}: ${state}; ${MOTOR_CENTRES.includes(c) ? "a motor" : "not a motor"}; ${wired}; themes: ${CARD_THEMES[c]}.`);
  }
  if (/split/i.test(String(output?.definition ?? "")) && defined.length) {
    const parent = Object.fromEntries(defined.map((c) => [c, c]));
    const find = (x) => (parent[x] === x ? x : (parent[x] = find(parent[x])));
    for (const [, [a, b]] of channels) if (a in parent && b in parent) parent[find(a)] = find(b);
    const parts = [];
    for (const c of CARD_ORDER) {
      if (!(c in parent)) continue;
      const part = parts.find((p) => find(p[0]) === find(c));
      if (part) part.push(c);
      else parts.push([c]);
    }
    if (parts.length > 1) {
      lines.push(
        `The split's parts: ${parts.map((p, i) => `${andList(p)} (${PART_WORDS[i] ?? "another part"})`).join("; ")}. ` +
          "No channel of this chart joins one part to another; the split is not a bridge.",
      );
    }
  }
  return lines.join("\n");
}

/** Extra lines appended to the chart facts for the structured request. */
export function structuredFacts(output, { cards = FACT_CARDS } = {}) {
  const lines = [];
  const reserved = reservedWords(output?.type);
  if (reserved.length) {
    lines.push(
      `Words that belong to OTHER types and must not appear anywhere in this reading, in any form: ${reserved.map((w) => WORD_FORMS[w] ?? w.toLowerCase()).join("; ")}.`,
    );
  }
  // 10/23 rounds: endings set in money ("when financial commitments arise") 20 times in three rounds,
  // the prompt's own rule notwithstanding; named here, per reading, as the other types' words are.
  // Narrowed the same day to the topics of financial advice (Jeremy: "work and purchases are OK"),
  // as interpretation.mjs FINANCE is.
  lines.push(`Never in a try-this line, in any form: ${MONEY_WORDS}.`);
  // 10/23: "This separation creates an inner bridge" in "Your definition" on 74 stored drafts of split
  // charts (31 delivered at run time; splitBridgeProblem). Said per chart, as the money words are.
  if (/split/i.test(String(output?.definition ?? ""))) lines.push(SPLIT_FACT);
  if (Array.isArray(output?.channelLines) && output.channelLines.length) {
    lines.push(`Channel lines (printed for you, write only the sentence): ${output.channelLines.join("; ")}`);
  }
  if (cards) lines.push(factCards(output));
  return lines.length ? "\n" + lines.join("\n") + "\n" : "";
}
const MONEY_WORDS = "finances, financial, budget, debt, loans, taxes, mortgage, investments, savings, bank accounts";
const SPLIT_FACT =
  "This chart's definition is split: its defined centers form separate groups that no channel of this chart joins, " +
  "and other people's gates or the transits are what join them. Never write that the split creates, forms or builds a bridge.";

/**
 * #4 / F45, Jeremy's ruling (option C, 2026-09-09): look for the Projector's
 * invitation ONLY where strategy is actually stated -- the Strategy line and
 * "How you decide". Everywhere else "invitation" is just a word, and the Line 2
 * sentence "until the right invitation draws you out" is legitimate. The slots
 * make "where" exact instead of a guess about paragraphs.
 */
export function strategyProblem(json, type) {
  if (!type || type === "Projector") return null;
  const decide = json?.decide ?? {};
  const places = [
    ["Strategy line", json?.summary?.strategy],
    ["How you decide", [decide.lede, ...(Array.isArray(decide.paragraphs) ? decide.paragraphs : [])].join(" ")],
  ];
  for (const [where, text] of places) {
    const t = String(text ?? "");
    for (const re of INVITATION) {
      for (const m of t.matchAll(re)) {
        if (negatedAt(t, m.index, m.index + m[0].length, type)) continue;
        return `The reading's ${where} gives a ${type} the Projector's invitation strategy.`;
      }
    }
  }
  return null;
}

/**
 * WHAT COUNTS AS "AN INVITATION" HERE (10/7, live refusals). The rule used to
 * refuse any word starting "invit", so the VERB refused honest strategy
 * lines: "Your strategy invites you to wait for something to respond to" on a
 * Manifesting Generator (twice), "Your Lunar authority invites you to take
 * your time" on a Reflector. Something inviting YOU to respond is not the
 * Projector strategy; waiting for AN invitation is. So only the thing that is
 * waited for counts:
 *   - the noun: "invitation(s)", or "invite(s)" RIGHT after an article, "for"
 *     or "any" ("the invite", "wait for invites") -- not "invites you";
 *   - being invited: "until you are invited", "wait to be invited", "once invited".
 * And a denied mention passes ("without needing an invitation", negatedAt).
 */
const INVITATION = [
  /\binvitations?\b/gi,
  // noun only, right after an article / for / any: "your process invites friction" is the verb (live 10/7)
  /\b(?:an?|the|any|for)\s+invites?\b(?!\s+(?:you|your|yourself|them|people|others|us|him|her|it|a|an|the)\b)/gi,
  /\b(?:be|being|been|is|are|am|was|were|get|gets|getting|got|until|till|unless|once|when|you're|you\u2019re)\s+invited\b/gi,
];

const clean = (s) => String(s ?? "").replace(/\s+/g, " ").trim();

/**
 * Build the plain-text reading from the filled form.
 *
 * Returns { text } or { problem } -- a problem is a slot the model left empty
 * or a channel it invented, and it travels as a refusal like any other.
 */
/**
 * PLACEHOLDERS, NOT WRITING (10/22 round). A form whose text slots hold the
 * name of their type ("string" in all of them, or "yaml"), or only one of them:
 * "Type: string" printed in the summary box of a draft otherwise written in
 * full. Refused before anything is built, and re-asked like any refusal;
 * interpretJob files it as "gemini-placeholder" so health counts it on its
 * own. On all 386 stored forms: the 29 made of placeholders (28 "string", 1
 * "yaml") and the 2 with one "string" slot, and nothing else; none of the 142
 * v2-era forms.
 */
export const PLACEHOLDERS = "The reading form came back with placeholders";
const PLACEHOLDER = /^(?:string|str|text|yaml|json|integer|number|boolean|null|undefined|placeholder|todo|tbd|lorem ipsum|\.\.\.|…)$/i;
export function placeholderProblem(json) {
  const leaves = [];
  const walk = (v) => {
    if (typeof v === "string") leaves.push(v.trim());
    else if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === "object") Object.values(v).forEach(walk);
  };
  walk(json);
  const hits = leaves.filter((s) => PLACEHOLDER.test(s)).map((s) => s.toLowerCase());
  if (!hits.length) return null;
  const count = (w) => hits.filter((h) => h === w).length;
  const word = [...new Set(hits)].sort((a, b) => count(b) - count(a) || (a < b ? -1 : 1))[0];
  return `${PLACEHOLDERS}: "${word}" in ${hits.length} of ${leaves.length} slots.`;
}

/**
 * WHERE EACH SLOT LANDS (10/23, re-asking only the failing part). Beside the
 * text, renderReading returns `spans`: every model-written slot's id and where
 * its words start and end in `text` (the prefixes, labels and headings are ours
 * and belong to no slot). The text is built exactly as before; reask.mjs uses
 * the spans to say which slot a refusal points at.
 *
 * Slot ids: summary_<type|strategy|authority|profile|signature|notSelf>,
 * incarnationCross, definition, channel_<a>_<b>, profileLine_<n>,
 * <section>_lede, <section>_paragraph_<n>, experimentIntro, takeaway_<n>
 * (n counts from 1).
 */
export function renderReading(json, output) {
  if (!json || typeof json !== "object") return { problem: "The reading came back unreadable." };
  const placeholders = placeholderProblem(json);
  if (placeholders) return { problem: placeholders };
  const wrongStrategy = strategyProblem(json, output?.type);
  if (wrongStrategy) return { problem: wrongStrategy };
  const sum = json.summary ?? {};
  const out = [SUMMARY_MARKER, ""];
  const marks = [];
  // One line made of our prefix and one slot's words.
  const put = (prefix, value, id) => {
    marks.push([out.length, prefix.length, id]);
    out.push(prefix + clean(value));
  };
  SUMMARY_KEYS.forEach((label, i) => {
    put(`${SUMMARY_LABELS[label] ?? label}: `, sum[SUMMARY_SLOTS[i]], `summary_${SUMMARY_SLOTS[i]}`);
  });
  out.push("");

  out.push(MECHANICS[0], "");
  put("", json.incarnationCross, "incarnationCross");
  out.push("");
  out.push(MECHANICS[1], "");
  put("", json.definition, "definition");
  out.push("");

  // CHANNELS: the prefix comes from the engine when it can.
  out.push(MECHANICS[2], "");
  const given = Array.isArray(output?.channels) ? output.channels : [];
  const lines = Array.isArray(output?.channelLines) ? output.channelLines : [];
  const said = new Map(
    (Array.isArray(json.channels) ? json.channels : []).map((c) => [
      String(c?.channel ?? "").replace(/[^\d-]/g, ""),
      clean(c?.sentence),
    ]),
  );
  if (!given.length) {
    out.push("No defined channels.", "");
  } else {
    for (let i = 0; i < given.length; i++) {
      const numbers = String(given[i]).split(" ")[0];
      const sentence = said.get(numbers);
      if (!sentence) return { problem: `The reading left channel ${numbers} without a sentence.` };
      // Before engine 0.3.0 there is no channelLines; the numbers and name
      // alone are still facts, and no direction is better than a wrong one.
      const prefix = lines[i] ?? given[i];
      put(`${prefix}: `, sentence, `channel_${numbers.replace("-", "_")}`);
    }
    out.push("");
  }

  // PROFILE LINES: "Line 2 (Hermit), conscious" is ours.
  out.push(MECHANICS[3], "");
  const m = /^(\d)\/(\d)/.exec(String(output?.profile ?? ""));
  const pl = new Map(
    (Array.isArray(json.profileLines) ? json.profileLines : []).map((p) => [Number(p?.line), clean(p?.sentence)]),
  );
  if (m) {
    [[m[1], "conscious"], [m[2], "unconscious"]].forEach(([n, side]) => {
      put(`Line ${n} (${PROFILE_LINE_NAMES[n]}), ${side}: `, pl.get(Number(n)) ?? "", `profileLine_${n}`);
    });
  }
  out.push("");

  INTERPRETATION.forEach((heading, i) => {
    const slot = SECTION_SLOTS[i];
    const sec = json[slot] ?? {};
    out.push(heading, "");
    put("", sec.lede, `${slot}_lede`);
    out.push("");
    const paras = Array.isArray(sec.paragraphs) ? sec.paragraphs : [];
    for (let j = 0; j < paras.length; j++) {
      put("", paras[j], `${slot}_paragraph_${j + 1}`);
      out.push("");
    }
  });

  out.push(TAKEAWAYS, "");
  put("", json.experimentIntro, "experimentIntro");
  out.push("");
  const tries = Array.isArray(json.takeaways) ? json.takeaways : [];
  for (let j = 0; j < tries.length; j++) {
    put("", tries[j], `takeaway_${j + 1}`);
    out.push("");
  }
  out.push(DISCLAIMER);
  const starts = [];
  let at = 0;
  for (const line of out) {
    starts.push(at);
    at += line.length + 1;
  }
  const spans = marks.map(([li, col, id]) => ({ id, start: starts[li] + col, end: starts[li] + out[li].length }));
  return { text: out.join("\n"), spans };
}

/**
 * A SLOT OF THE FORM, BY ID (10/23). `setSlots(json, { id: words })` returns a
 * copy of the form with those slots holding those words: how a re-asked part
 * goes back into its own draft (reask.mjs), and how a slot is blanked to see
 * whether a refusal rests on it. Where the page would read a list by its value
 * (a channel's numbers, a profile line's number), the LAST entry with that
 * value is the one printed (renderReading's Map), so it is the one set; a
 * channel or line the form lacks is added.
 */
export function setSlots(json, values) {
  const f = JSON.parse(JSON.stringify(json && typeof json === "object" ? json : {}));
  const list = (k) => (Array.isArray(f[k]) ? f[k] : (f[k] = []));
  const lastAt = (arr, same) => {
    for (let i = arr.length - 1; i >= 0; i--) if (same(arr[i])) return i;
    return -1;
  };
  for (const [id, value] of Object.entries(values)) {
    let m;
    if ((m = /^summary_(\w+)$/.exec(id))) {
      if (!f.summary || typeof f.summary !== "object") f.summary = {};
      f.summary[m[1]] = value;
    } else if (id === "incarnationCross" || id === "definition" || id === "experimentIntro") {
      f[id] = value;
    } else if ((m = /^channel_(\d+)_(\d+)$/.exec(id))) {
      const numbers = `${m[1]}-${m[2]}`;
      const arr = list("channels");
      const i = lastAt(arr, (c) => String(c?.channel ?? "").replace(/[^\d-]/g, "") === numbers);
      if (i >= 0) arr[i] = { ...arr[i], sentence: value };
      else arr.push({ channel: numbers, sentence: value });
    } else if ((m = /^profileLine_(\d)$/.exec(id))) {
      const arr = list("profileLines");
      const i = lastAt(arr, (p) => Number(p?.line) === Number(m[1]));
      if (i >= 0) arr[i] = { ...arr[i], sentence: value };
      else arr.push({ line: Number(m[1]), sentence: value });
    } else if ((m = /^(\w+)_lede$/.exec(id)) && SECTION_SLOTS.includes(m[1])) {
      if (!f[m[1]] || typeof f[m[1]] !== "object") f[m[1]] = {};
      f[m[1]].lede = value;
    } else if ((m = /^(\w+)_paragraph_(\d+)$/.exec(id)) && SECTION_SLOTS.includes(m[1])) {
      if (!f[m[1]] || typeof f[m[1]] !== "object") f[m[1]] = {};
      if (!Array.isArray(f[m[1]].paragraphs)) f[m[1]].paragraphs = [];
      f[m[1]].paragraphs[Number(m[2]) - 1] = value;
    } else if ((m = /^takeaway_(\d+)$/.exec(id))) {
      list("takeaways")[Number(m[1]) - 1] = value;
    }
  }
  return f;
}

/** A slot's words in the form, as the page would print them ("" when the form has none). */
export function getSlot(json, id) {
  const f = json && typeof json === "object" ? json : {};
  const last = (arr, same) => {
    const list = Array.isArray(arr) ? arr : [];
    for (let i = list.length - 1; i >= 0; i--) if (same(list[i])) return list[i];
    return null;
  };
  let m;
  if ((m = /^summary_(\w+)$/.exec(id))) return clean(f.summary?.[m[1]]);
  if (id === "incarnationCross" || id === "definition" || id === "experimentIntro") return clean(f[id]);
  if ((m = /^channel_(\d+)_(\d+)$/.exec(id))) {
    return clean(last(f.channels, (c) => String(c?.channel ?? "").replace(/[^\d-]/g, "") === `${m[1]}-${m[2]}`)?.sentence);
  }
  if ((m = /^profileLine_(\d)$/.exec(id))) return clean(last(f.profileLines, (p) => Number(p?.line) === Number(m[1]))?.sentence);
  if ((m = /^(\w+)_lede$/.exec(id))) return clean(f[m[1]]?.lede);
  if ((m = /^(\w+)_paragraph_(\d+)$/.exec(id))) return clean(f[m[1]]?.paragraphs?.[Number(m[2]) - 1]);
  if ((m = /^takeaway_(\d+)$/.exec(id))) return clean(f.takeaways?.[Number(m[1]) - 1]);
  return "";
}

/** The form's own note for a slot (its description in READING_SCHEMA), so a re-asked part keeps its rules. */
export function slotNote(id) {
  const P = READING_SCHEMA.properties;
  let m;
  if ((m = /^summary_(\w+)$/.exec(id))) return P.summary.properties[m[1]]?.description ?? null;
  if (id === "incarnationCross" || id === "definition" || id === "experimentIntro") return P[id].description;
  if (/^channel_\d+_\d+$/.test(id)) return P.channels.items.properties.sentence.description;
  if (/^profileLine_\d$/.test(id)) return P.profileLines.items.properties.sentence.description;
  if ((m = /^(\w+)_lede$/.exec(id)) && SECTION_SLOTS.includes(m[1])) return SECTION.properties.lede.description;
  if ((m = /^(\w+)_paragraph_\d+$/.exec(id)) && SECTION_SLOTS.includes(m[1])) return SECTION.properties.paragraphs.items.description;
  if (/^takeaway_\d+$/.test(id)) return P.takeaways.items.description;
  return null;
}

/** Where a slot is, in the page's words ("paragraph 2 of "How you decide""). */
export function slotLabel(id) {
  let m;
  if ((m = /^summary_(\w+)$/.exec(id))) {
    const key = SUMMARY_KEYS[SUMMARY_SLOTS.indexOf(m[1])] ?? m[1];
    return `the "${SUMMARY_LABELS[key] ?? key}" line`;
  }
  if (id === "incarnationCross") return `"${MECHANICS[0]}"`;
  if (id === "definition") return `"${MECHANICS[1]}"`;
  if (id === "experimentIntro") return `the paragraph that opens "${TAKEAWAYS}"`;
  if ((m = /^channel_(\d+)_(\d+)$/.exec(id))) return `the sentence for Channel ${m[1]}-${m[2]}`;
  if ((m = /^profileLine_(\d)$/.exec(id))) return `the sentence for Line ${m[1]}`;
  if ((m = /^(\w+)_lede$/.exec(id))) return `the opening sentence of "${INTERPRETATION[SECTION_SLOTS.indexOf(m[1])]}"`;
  if ((m = /^(\w+)_paragraph_(\d+)$/.exec(id))) return `paragraph ${m[2]} of "${INTERPRETATION[SECTION_SLOTS.indexOf(m[1])]}"`;
  if ((m = /^takeaway_(\d+)$/.exec(id))) return `try-this line ${m[1]}`;
  return id;
}

/** The slot ids of one interpretation section, as the page prints them (lede, then each paragraph). */
export function sectionSlots(slot, json) {
  const n = Array.isArray(json?.[slot]?.paragraphs) ? json[slot].paragraphs.length : 2;
  return [`${slot}_lede`, ...Array.from({ length: n }, (_, j) => `${slot}_paragraph_${j + 1}`)];
}

/** Which form slot a section heading's words belong to ("What you take in from others" -> "takeIn"). */
export function sectionOf(heading) {
  const i = INTERPRETATION.indexOf(heading);
  return i >= 0 ? SECTION_SLOTS[i] : null;
}

/** The slot a summary label names ("When it's on track" -> summary_signature). */
export function summarySlotOf(label) {
  const key = Object.entries(SUMMARY_LABELS).find(([, v]) => v === label)?.[0] ?? label;
  const i = SUMMARY_KEYS.indexOf(key);
  return i >= 0 ? `summary_${SUMMARY_SLOTS[i]}` : null;
}
