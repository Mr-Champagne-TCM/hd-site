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

/** Extra lines appended to the chart facts for the structured request. */
export function structuredFacts(output) {
  const lines = [];
  const reserved = reservedWords(output?.type);
  if (reserved.length) {
    lines.push(
      `Words that belong to OTHER types and must not appear anywhere in this reading, in any form: ${reserved.map((w) => WORD_FORMS[w] ?? w.toLowerCase()).join("; ")}.`,
    );
  }
  // 10/23 rounds: endings set in money ("when financial commitments arise") 20 times in three rounds,
  // the prompt's own rule notwithstanding; named here, per reading, as the other types' words are.
  lines.push(`Never in a try-this line, in any form: ${MONEY_WORDS}.`);
  if (Array.isArray(output?.channelLines) && output.channelLines.length) {
    lines.push(`Channel lines (printed for you, write only the sentence): ${output.channelLines.join("; ")}`);
  }
  return lines.length ? "\n" + lines.join("\n") + "\n" : "";
}
const MONEY_WORDS = "money, finances, financial, budget, bills, expenses";

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

export function renderReading(json, output) {
  if (!json || typeof json !== "object") return { problem: "The reading came back unreadable." };
  const placeholders = placeholderProblem(json);
  if (placeholders) return { problem: placeholders };
  const wrongStrategy = strategyProblem(json, output?.type);
  if (wrongStrategy) return { problem: wrongStrategy };
  const sum = json.summary ?? {};
  const out = [SUMMARY_MARKER, ""];
  SUMMARY_KEYS.forEach((label, i) => {
    out.push(`${SUMMARY_LABELS[label] ?? label}: ${clean(sum[SUMMARY_SLOTS[i]])}`);
  });
  out.push("");

  out.push(MECHANICS[0], "", clean(json.incarnationCross), "");
  out.push(MECHANICS[1], "", clean(json.definition), "");

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
      out.push(`${prefix}: ${sentence}`);
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
      out.push(`Line ${n} (${PROFILE_LINE_NAMES[n]}), ${side}: ${pl.get(Number(n)) ?? ""}`);
    });
  }
  out.push("");

  INTERPRETATION.forEach((heading, i) => {
    const sec = json[SECTION_SLOTS[i]] ?? {};
    out.push(heading, "", clean(sec.lede), "");
    for (const p of Array.isArray(sec.paragraphs) ? sec.paragraphs : []) out.push(clean(p), "");
  });

  out.push(TAKEAWAYS, "", clean(json.experimentIntro), "");
  for (const t of Array.isArray(json.takeaways) ? json.takeaways : []) out.push(clean(t), "");
  out.push(DISCLAIMER);
  return { text: out.join("\n") };
}
