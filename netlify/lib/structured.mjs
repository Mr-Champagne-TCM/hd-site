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
  "ONE sentence, at most 26 words. Name the line by its number (\"the 6 line\"), never as the \"first\" or \"second\" line.";

const TRACK_SLOTS = ["signature", "notSelf"];
const TRACK_SLOT =
  'ONE sentence, at most 22 words, on how it feels. Never the words "signature" or "not-self": the page says "when it\'s on track" / "when it\'s off track".';
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
      items: S("ONE sentence beginning with the chart feature in parentheses, e.g. \"(Channel 10-34) Watch what happens when...\"."),
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

/** Extra lines appended to the chart facts for the structured request. */
export function structuredFacts(output) {
  const lines = [];
  const reserved = reservedWords(output?.type);
  if (reserved.length) {
    lines.push(
      `Words that belong to OTHER types and must not appear anywhere in this reading: ${reserved.join(", ")}.`,
    );
  }
  if (Array.isArray(output?.channelLines) && output.channelLines.length) {
    lines.push(`Channel lines (printed for you, write only the sentence): ${output.channelLines.join("; ")}`);
  }
  return lines.length ? "\n" + lines.join("\n") + "\n" : "";
}

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
 *   - the noun: "invitation(s)", or "invite(s)" after an article or "for"
 *     ("the right invite", "wait for invites") -- but not "invites you";
 *   - being invited: "until you are invited", "wait to be invited", "once invited".
 * And a denied mention passes ("without needing an invitation", negatedAt).
 */
const INVITATION = [
  /\binvitations?\b/gi,
  /\b(?:an?|the|your|their|any|for)\s+(?:[a-z]+\s+)?invites?\b(?!\s+(?:you|your|yourself|them|people|others|us|him|her|it|a|an|the)\b)/gi,
  /\b(?:be|being|been|is|are|am|was|were|get|gets|getting|got|until|till|unless|once|when|you're|you\u2019re)\s+invited\b/gi,
];

const clean = (s) => String(s ?? "").replace(/\s+/g, " ").trim();

/**
 * Build the plain-text reading from the filled form.
 *
 * Returns { text } or { problem } -- a problem is a slot the model left empty
 * or a channel it invented, and it travels as a refusal like any other.
 */
export function renderReading(json, output) {
  if (!json || typeof json !== "object") return { problem: "The reading came back unreadable." };
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
