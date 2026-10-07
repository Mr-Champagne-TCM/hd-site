/**
 * TIER 2 -- the written interpretation.
 *
 * PORTED FROM THE APP, not reinvented. `hd-reading-app`'s `Reading.kt` has been
 * generating these for real clients; its prompt, its section list and its
 * validator are the product. Rewriting them here would give two different
 * readings depending on which door somebody came in through, which is the same
 * fault E-1 exists to prevent for the engine.
 *
 * THE PRIVACY RULE IS THE FIRST THING IN THIS FILE, because it is the one that
 * cannot be fixed after the fact:
 *
 *   GEMINI RECEIVES CHART VALUES ONLY. Never a name, never a birth date, never
 *   a birth time, never a place. Google offers no deletion path for API
 *   content, so the protection is that identifying data is never sent at all.
 *
 * `chartFactsOnly` is the ONLY thing that goes over the wire, and the test
 * beside this file feeds it a record full of identity and asserts none of it
 * survives. If you add a field, check it against that rule first.
 *
 * WHAT IS NOT HERE YET: the network call. This module is the CONTRACT -- what
 * is asked for, and what counts as an acceptable answer -- and it is written
 * first on purpose. A generator is worth nothing until something can say the
 * answer came back wrong.
 */

import { profileWithNames } from "./mechanics.mjs";

export const DISCLAIMER =
  "This reading describes a Human Design chart and is offered for self-reflection. " +
  "It is not medical, psychological, legal or financial advice, and it does not " +
  "predict the future.";

export const SUMMARY_MARKER = "IN SHORT";
export const TAKEAWAYS = "Things to experiment with";

/** The four mechanics headings, in order, copied exactly. */
export const MECHANICS = [
  "Your incarnation cross",
  "Your definition",
  "Your channels",
  "Your profile lines",
];

/** The six interpretation headings, in order, copied exactly. */
export const INTERPRETATION = [
  "Your energy, and how it starts",
  "How you decide",
  "How you meet the world",
  "What is consistently yours",
  "What you take in from others",
  "When it's on track, and when it's off track",
];

export const HEADINGS = [...MECHANICS, ...INTERPRETATION, TAKEAWAYS];

/**
 * ON TRACK / OFF TRACK (Jeremy 10/5, option C): readers see "When it's on
 * track" and "When it's off track" where Human Design says Signature and
 * Not-self. The keys stay Signature / Not-self inside the code, so every check
 * keeps its meaning; only what is printed changes.
 *
 * Readings written before the change carry the old section heading. They are
 * read as the new one, so they still display and print -- and nothing in them
 * is rewritten.
 */
export const OLD_HEADINGS = { "When it is working, and when it is not": INTERPRETATION[5] };
export const SUMMARY_LABELS = { Signature: "When it's on track", "Not-self": "When it's off track" };
const S6_AT = /\n(?:When it is working, and when it is not|When it['\u2019]s on track, and when it['\u2019]s off track)\n/;
/** Where section 6 starts in `body`, old or new heading, searching from `from`. -1 if absent. */
function section6At(body, from = 0) {
  const m = S6_AT.exec(body.slice(from));
  return m ? from + m.index : -1;
}

/** Rows of the at-a-glance panel, in panel order. */
export const SUMMARY_KEYS = ["Type", "Strategy", "Authority", "Profile", "Signature", "Not-self"];

/**
 * WHAT GOES OVER THE WIRE. Chart values, and nothing else.
 *
 * Takes the ENGINE'S OUTPUT rather than a stored reading, and that is the
 * safeguard rather than a convenience: a stored reading holds the buyer's name,
 * email and phone, and a function that never receives them cannot leak them.
 */
/**
 * FORM MODE SAYS "ON TRACK / OFF TRACK" ON THE WIRE TOO (10/7). The facts were
 * the one place the model was still HANDED "Signature:" and "Not-Self Theme:",
 * and drafts copied them into the sentences the reader sees. In form mode the
 * model never writes a label (structured.mjs prints ours) and no check reads
 * these lines, so renaming them changes what primes the model and nothing else.
 *
 * LETTER MODE KEEPS THE OLD LINES. There the model writes the summary labels
 * itself and copies the label it was handed as often as the one it was asked
 * for; "When it's off track, the feeling is:" has a comma in it, which
 * `summaryRows` does not read as a label, so a copied one would be refused as a
 * missing row. Same values either way: what goes over the wire is unchanged.
 */
export function chartFactsOnly(output, { form = false } = {}) {
  const list = (v) => (Array.isArray(v) && v.length ? v.join(", ") : "none");
  const acts = (v) =>
    Array.isArray(v)
      ? v.map((a) => `${String(a.planet ?? "").toLowerCase()} ${a.gate}.${a.line}`).join(", ")
      : "";
  const lines = [
    `Type: ${output?.type ?? ""}`,
    `Strategy: ${output?.strategy ?? ""}`,
    `Inner Authority: ${output?.authority ?? ""}`,
    `Profile: ${output?.profile ?? ""}`,
    `Definition: ${output?.definition ?? ""}`,
    form
      ? `When it's on track, the feeling is: ${output?.signature ?? ""}`
      : `Signature: ${output?.signature ?? ""}`,
    form
      ? `When it's off track, the feeling is: ${output?.notSelfTheme ?? ""}`
      : `Not-Self Theme: ${output?.notSelfTheme ?? ""}`,
    `Incarnation Cross: ${output?.incarnationCross ?? ""}`,
    `Defined centers: ${list(output?.definedCenters)}`,
    `Undefined centers (white, but carrying gates): ${list(output?.undefinedCenters)}`,
    `Open centers (white, with no gates at all): ${list(output?.openCenters)}`,
    `Channels: ${list(output?.channels)}`,
    `Personality activations: ${acts(output?.personality)}`,
    `Design activations: ${acts(output?.design)}`,
  ];
  if (output?.timeKnown === false) {
    lines.push(
      "",
      "NOTE: birth time was not known and the chart was cast at noon. " +
        "Say plainly, near the start, that Profile, Type and Authority " +
        "cannot be confirmed without a birth time.",
    );
  }
  return lines.join("\n") + "\n";
}

/**
 * LINE ENDINGS ONLY (Jeremy, 9/9 "option 2 stricter" + 10/4: "Yes, clean up
 * line endings and guard against that").
 *
 * This used to rewrite what the model wrote: a corrupted glyph became a dash,
 * markdown bold and leading bullets were stripped, runs of blank lines were
 * collapsed, and a paraphrased heading was renamed to the real one. Every one
 * of those changed a paid document without anybody seeing it. Now the text is
 * only normalised (CRLF is a transport artefact, not writing), and
 * `formattingProblem` REFUSES a draft carrying any of those marks so the model
 * is asked again. "check only for accuracy and then request the model to try
 * again."
 */
export function sanitize(s) {
  return String(s).replace(/\r\n?/g, "\n").trim();
}

/**
 * THE MARKS THAT USED TO BE QUIETLY REWRITTEN, now a reason to ask again.
 * Same four the old sanitize removed; none of them is ever right in a reading.
 */
export function formattingProblem(raw) {
  const t = sanitize(raw);
  if (t.includes("\uFFFD")) return "The reading came back with a corrupted character in it.";
  if (t.includes("**")) return "The reading came back with markdown bold marks (**) in it.";
  if (/^[ \t]*[*\u2022\u2013-][ \t]+/m.test(t)) return "The reading came back with a bullet mark at the start of a line.";
  if (/\n{3,}/.test(t)) return "The reading came back with runs of blank lines in it.";
  return null;
}

/**
 * REFUSE TO HAND OVER A READING THAT BREAKS THE RULES THAT MATTER.
 *
 * Cheap, and it protects the three things that must never slip: the
 * disclaimer, not interrogating the reader, and the structure the document is
 * built on. The app MEASURED this -- over twelve real generations the model
 * dropped a required heading twice, and every other check passed it. Without
 * this the document silently loses a section and nobody notices until somebody
 * is holding it.
 *
 * Returns a sentence describing the FIRST problem, or null when it is sound.
 */
export function firstProblem(
  raw,
  type = null,
  profile = null,
  openCenters = null,
  undefinedCenters = null,
  definedCenters = null,
) {
  const reading = String(raw ?? "");
  const marks = formattingProblem(reading);
  if (marks) return marks;
  if (!reading.includes(DISCLAIMER)) {
    return "The reading came back without the required disclaimer.";
  }
  const body = reading.slice(0, reading.indexOf(DISCLAIMER)).trim();
  // A question mark in the last stretch is the "does this resonate?" tail.
  if (body.slice(-400).includes("?")) {
    return "The reading ended by asking the client a question.";
  }
  if (body.split(/\s+/).filter(Boolean).length < 380) {
    return "The reading came back too short to hand over.";
  }
  return (
    structureProblem(reading) ??
    typeProblem(reading, type, undefinedCenters, openCenters) ??
    profileLineProblem(reading, profile) ??
    openCentreProblem(reading, openCenters, undefinedCenters) ??
    centreStateProblem(reading, definedCenters, undefinedCenters, openCenters) ??
    oldWordProblem(reading)
  );
}

/**
 * "SIGNATURE" AND "NOT-SELF" ARE NOT WORDS THE READER SEES ANY MORE (Jeremy
 * 10/5, option C, and 10/7: "what we provided needs to be accurate... as long
 * as it is effective and doesn't cause false rejections").
 *
 * The page says "When it's on track" / "When it's off track". A phone reading
 * still slipped the old words into its on-track sentences, because the facts
 * the model is handed say "Signature: Success" and "Not-Self Theme: ...".
 * REFUSED, never rewritten: the draft is asked for again.
 *
 * ONLY WHAT THE MODEL WROTE AND THE READER SEES: the summary sentences (the
 * value only -- the label in front is ours, and old stored readings carry
 * "Signature:" there), the sections' prose, the takeaways. Never a heading,
 * the disclaimer, or text outside the sections that nothing displays.
 *
 * WHERE, MEASURED (10/7, 72 stored readings: shop, phone, benchmark). 105 uses
 * of the two words, every one the Human Design term, none ordinary English.
 * 99 were in section 6. The other six were all "not-self" -- three in sections
 * 1-3 ("your Not-Self theme of disappointment") and three in takeaway tags
 * ("(Not-self theme) Pay attention..."). So:
 *
 *   - "NOT-SELF" IS REFUSED ANYWHERE the model writes. It has no English
 *     meaning once the compounds below are set aside, and it leaked outside
 *     section 6 in 5 of 72 readings.
 *   - "SIGNATURE" IS REFUSED ONLY IN THE ON / OFF TRACK CONTENT: the two
 *     summary sentences, section 6, and a takeaway's "(chart feature)" tag.
 *     Elsewhere it is ordinary English -- a live 10/7 Reflector draft wrote
 *     "you do not broadcast a persistent energetic signature" in section 4 --
 *     and it never once appeared there as the term, so refusing it there would
 *     buy nothing measured and cost a retry. Named residual: "because your
 *     signature is satisfaction" in section 1 is not caught.
 *
 * HOW "NOT-SELF" IS TOLD FROM ENGLISH. Joined by any dash (hyphen, en, em,
 * with or without spaces) or written as one word, it is always the term:
 * "Not-Self Theme", "not–self", "notself", "not-selves". Written with a plain
 * space it is ENGLISH as often as not -- the audit's own "Not self aware
 * people..." (F43) must pass -- so the spaced form counts only where it can
 * only be the noun: after "the/your/a/its/their/this...", before "theme" or
 * punctuation, or with a capital S ("Not Self"). And "not self-conscious",
 * "not self-aware" -- self joined by a hyphen to the next word -- is an English
 * compound in every spelling, never the term.
 *
 * WHAT MUST STILL PASS: "you are not yourself", "not self-conscious", "not
 * self aware", "self-trust", "selfless", "design", "sign", "signal", and "a
 * signature move" outside the on / off track content.
 *
 * Old stored readings are not affected: this runs only on a new draft
 * (`firstProblem`, from gemini.mjs); display, PDF and `structureProblem` never
 * call it.
 */
const DASH = "[-\u00AD\u2010\u2011\u2012\u2013\u2014\u2015\u2212]";
const NOT_COMPOUND = String.raw`(?![-\u00AD\u2010\u2011]\p{L})`;
const SELF = String.raw`sel(?:f|ves)\b${NOT_COMPOUND}`;
const SIGNATURE_WORD = /\bsignatures?\b/iu;
const NOT_SELF_WORDS = [
  // joined: not-self, not - self, en or em dash, notself
  new RegExp(String.raw`\bnot(?:\s*${DASH}\s*)?${SELF}`, "iu"),
  // spaced, as a noun: "your not self", "the not self"
  new RegExp(String.raw`\b(?:the|your|a|an|its|their|this|that|his|her|our|my)\s+not\s+${SELF}`, "iu"),
  // spaced, before "theme" or punctuation: "not self theme", "into not self."
  new RegExp(String.raw`\bnot\s+sel(?:f|ves)(?=\s+themes?\b|\s*[.,;:!?)\]"\u201D]|\s*$)`, "iu"),
  // spaced, capital S: "Not Self", "NOT SELF"
  new RegExp(String.raw`\b[Nn][Oo][Tt]\s+S(?:ELF|elf|ELVES|elves)\b${NOT_COMPOUND}`, "u"),
];
/** The earliest old word in `text`, or null. "signature" only when `onTrack`. */
function firstOldWord(text, onTrack) {
  let best = null;
  for (const re of onTrack ? [SIGNATURE_WORD, ...NOT_SELF_WORDS] : NOT_SELF_WORDS) {
    const m = re.exec(text);
    if (m && (!best || m.index < best.index)) best = m;
  }
  return best;
}

/**
 * The model-written, reader-visible text, as [where, text, onTrack]. A
 * takeaway is judged twice: whole for "not-self", and its "(chart feature)"
 * tag alone as on / off track content.
 */
function writtenText(raw) {
  const text = sanitize(raw);
  const body = text.includes(DISCLAIMER) ? text.slice(0, text.indexOf(DISCLAIMER)) : text;
  const out = Object.entries(summaryRows(body)).map(([k, v]) => [
    `the "${SUMMARY_LABELS[k] ?? k}" line`,
    v,
    k in SUMMARY_LABELS,
  ]);
  let where = null;
  for (const line of body.split("\n")) {
    const t = line.trim();
    const heading = OLD_HEADINGS[t] ?? t;
    if (HEADINGS.includes(heading)) {
      where = heading;
      continue;
    }
    if (!where || !t) continue;
    out.push([`"${where}"`, t, where === INTERPRETATION[5]]);
    const tag = where === TAKEAWAYS ? /^\([^)]*\)/.exec(t) : null;
    if (tag) out.push([`a takeaway's tag`, tag[0], true]);
  }
  return out;
}

export function oldWordProblem(raw) {
  for (const [where, text, onTrack] of writtenText(raw)) {
    const m = firstOldWord(text, onTrack);
    if (!m) continue;
    const from = Math.max(0, m.index - 50);
    const quote = `${from > 0 ? "..." : ""}${text.slice(from, m.index + m[0].length + 40).trim()}...`;
    return `The reading says "${m[0]}" in ${where}, where readers see "when it's on track" / "when it's off track": "${quote}"`;
  }
  return null;
}

/**
 * THE SECTION THE SPLIT EXISTS FOR MUST SHOW BOTH HALVES. W1's "What you take
 * in from others" described both undefined centres and neither open one,
 * while the margin beside it printed "OPEN CENTRES Head, Heart" (audit F38).
 * If the chart has open centres, that section must NAME at least one of them,
 * and if it has undefined centres, at least one of those. A Reflector with
 * seven undefined and two open gets the same rule; a chart with none of one
 * kind is not asked to invent it.
 *
 * THE WORD TEST IS GONE (audit F38, round two). This rule used to accept the
 * bare word "open" anywhere in the section as a substitute for naming a
 * centre. That is satisfied by "You are open to feedback", by "Life keeps
 * pushing open doors", and -- worst, because good readings actually write it
 * -- by "Because it is undefined rather than open", none of which name a
 * single centre. The undefined branch had the same hole with the bare word
 * "undefined". A name-only rule was run against every known-good reading on
 * file and refused none of them, so the escape hatch was buying nothing.
 *
 * THE UNDEFINED BRANCH HAD NEVER RUN. `firstProblem` called this function with
 * two arguments, so `undefinedCenters` arrived undefined on every real
 * invocation and the second half of the three-state check was dead code from
 * the day it was written. That is why a delivered reading could call an
 * undefined centre defined four times and pass. Both lists are threaded
 * through now.
 */
export function openCentreProblem(raw, openCenters, undefinedCenters) {
  const open = Array.isArray(openCenters) ? openCenters : [];
  const und = Array.isArray(undefinedCenters) ? undefinedCenters : [];
  if (!open.length && !und.length) return null;
  const body = sanitize(raw);
  const from = body.indexOf("\nWhat you take in from others\n");
  if (from < 0) return null; // structureProblem reports a missing heading
  const to = section6At(body, from);
  const section = to > from ? body.slice(from, to) : body.slice(from);
  const names = (list) => list.some((c) => new RegExp(`\\b${c}\\b`).test(section));
  if (open.length && !names(open)) {
    return `The reading's "What you take in from others" never names one of this chart's ${open.length} open centers (${open.join(", ")}).`;
  }
  if (und.length && !names(und)) {
    return `The reading's "What you take in from others" never names one of this chart's ${und.length} undefined centers (${und.join(", ")}).`;
  }
  return null;
}

/**
 * DOES THIS PROMPT ASK FOR WHAT THE VALIDATOR DEMANDS?
 *
 * The prompt is CONFIGURATION now, not code -- it cannot be committed to a
 * public repo, so it arrives as an environment variable somebody pastes. That
 * buys privacy and costs the one thing a committed constant gave for free: the
 * two could not drift.
 *
 * They can now. A prompt one version behind, missing a heading this file
 * requires, produces a reading that fails validation EVERY TIME, for every
 * buyer, with a message about the model rather than about the configuration --
 * and it would look exactly like the model having a bad day.
 *
 * So the deployed prompt is checked against the deployed validator, at runtime,
 * before a single request is made. Cheaper than a unit test and it checks the
 * thing that is actually running rather than a copy of it.
 */
/**
 * WHICH SHAPE THE STORED PROMPT ASKS FOR. The form-mode prompt tells the model
 * to "fill the JSON form"; the letter-mode prompt asks for the document itself.
 * Production follows whichever prompt is uploaded, so switching modes is one
 * blob upload and switching back is another -- no deploy either way.
 */
export function promptShape(prompt) {
  return /fill the JSON form/i.test(String(prompt ?? "")) ? "json" : "text";
}

export function promptProblem(prompt) {
  const text = String(prompt ?? "");
  if (!text.trim()) return "No reading prompt is configured.";
  /**
   * FORM MODE: the code writes the headings, labels, summary rows and the
   * disclaimer (structured.mjs), so the prompt is not asked for them. What it
   * must still carry are the content rules a validator depends on.
   */
  if (promptShape(text) === "json") {
    const formRules = [
      ["the three center states", /DEFINED[\s\S]{0,400}UNDEFINED[\s\S]{0,400}OPEN/],
      ["the four takeaways", /takeaways/],
      ["the six section slots", /energy, decide, meet, consistent, takeIn, working/],
    ];
    const lost = formRules.filter(([, re]) => !re.test(text)).map(([name]) => name);
    return lost.length ? `The configured form prompt no longer asks for ${lost.join("; ")}.` : null;
  }
  const wants = [SUMMARY_MARKER, ...HEADINGS, DISCLAIMER];
  const missing = wants.filter((w) => !text.includes(w));
  if (missing.length) {
    return `The configured prompt never asks for ${missing.length === 1 ? `"${missing[0]}"` : `${missing.length} things, starting with "${missing[0]}"`}.`;
  }
  const rows = SUMMARY_KEYS.filter((k) => !text.includes(`${k}:`));
  if (rows.length) {
    return `The configured prompt never asks for the ${rows.join(", ")} line.`;
  }
  /**
   * AND THE CONTENT RULES. A prompt that stopped asking for "Line n" would
   * pass here and then fail every reading in profileLineProblem; one that
   * stopped naming the three centre states would fail them in the writer's
   * own words. Each phrase below is one the validator depends on.
   */
  const rules = [
    ["Line <n>", /Line <n>/],
    ["the three centre states", /DEFINED[\s\S]{0,400}UNDEFINED[\s\S]{0,400}OPEN/],
    ["the six headings copied exactly", /copied\s+EXACTLY/i],
    ["a sentence after every label", /<one sentence>/],
  ];
  const lost = rules.filter(([, re]) => !re.test(text)).map(([name]) => name);
  if (lost.length) {
    return `The configured prompt no longer asks for ${lost.join("; ")}.`;
  }
  return null;
}

/** Every marker present, alone on its line, in order. */
/**
 * IS THIS ADVICE FOR THE RIGHT TYPE?
 *
 * Found on Jeremy's own paid reading. He is a Manifesting Generator, and the
 * reading told him to "stop pushing against closed doors, and wait for a proper
 * invitation to engage." Waiting for the invitation is the PROJECTOR strategy.
 * A Manifesting Generator waits to respond.
 *
 * The structure checks could not see it: every heading was present, in order,
 * the right length, no trailing question. The document was perfectly shaped and
 * told him to live as somebody else. That is worse than a malformed reading,
 * because it is the one error that looks like expertise until a reader knows
 * the system -- and the people most likely to notice are the ones most likely
 * to talk about it.
 *
 * DELIBERATELY NARROW. Each phrase below defines a type's strategy and belongs
 * to that type alone; a false positive here costs a retry, and two of them cost
 * the buyer their reading, so nothing goes in this list that could plausibly
 * appear in ordinary prose about somebody else's chart.
 */
const STRATEGY_WORDS = [
  {
    // NOT a bare "invitation": the prompt itself asks every reading to open its
    // takeaways with "these are invitations to test against your own
    // experience", and a model that writes "an invitation to test" in the
    // singular tripped this rule on three charts in one afternoon (W1, W5).
    // The strategy is the phrase, not the word.
    // The verb may be wait, pause (live 10/7), rest or hold back; the object may be an
    // invitation, an invite, or "being invited" (audit F45).
    re: /\b(?:wait(?:ing|s|ed)?|paus(?:e|es|ed|ing)|rest(?:ing|s)?|hold(?:ing|s)?\s+(?:back|off))\s+(?:for|on|until|to\s+be)\s+(?:an?\s+|the\s+|you\s+are\s+|you're\s+|being\s+)?(?:proper\s+|right\s+|formal\s+|genuine\s+)?(?:invitation|invite|invited)\b/i,
    only: ["Projector"],
    says: "waiting for the invitation, which is the Projector strategy",
    negatable: true,
  },
  {
    // AUDIT F45, ROUND TWO. The rule above needs a waiting VERB followed by a
    // PREPOSITION, so it misses every shape where the invitation is the thing
    // acting, or where the waiting is an idiom. Six phrasings got through, and
    // two of them reached delivered readings on 3 September: "your Sacral will
    // signal whether an invitation belongs to you", and "requires an external
    // invitation or encounter to spark into motion". A Generator responds; it
    // does not need an invitation.
    //
    // WHAT MUST STILL PASS, and was re-checked against both:
    //   - the prompt's own "these are invitations to test against your own
    //     experience" -- plural, no waiting verb, nothing possessed;
    //   - the Line 2 sentence "until the right invitation draws you out" --
    //     there the invitation is the SUBJECT of an active verb, and every
    //     pattern below requires it to be waited on, needed, or required.
    re: new RegExp(
      [
        // "asks to be invited", "waits to be invited"
        String.raw`\b(?:ask|wait)(?:s|ing|ed)?\s+to\s+be\s+invited\b`,
        // "sit tight for", "bide your time until", "hold out for", "stand by for"
        String.raw`\b(?:sit(?:s|ting)?\s+tight|bid(?:e|es|ing)\s+(?:your|their|his|her)\s+time|hold(?:s|ing)?\s+out|stand(?:s|ing)?\s+by)\s+(?:for|until|till)\s+(?:an?\s+|the\s+|being\s+|you\s+are\s+)?(?:invitation|invite|invited)\b`,
        // "until invited", "until you are invited" -- NOT "until the invitation draws"
        String.raw`\buntil\s+(?:you\s+are\s+|you're\s+|being\s+)?invited\b`,
        // "let the invitation come to you", "let an invitation find you"
        String.raw`\blet\s+(?:an?|the)\s+(?:invitation|invite)\s+(?:come|find|arrive|reach)\b`,
        // "the invitation must come first", "an invitation has to arrive"
        String.raw`\b(?:an?|the)\s+(?:invitation|invite)\s+(?:must|has\s+to|have\s+to|needs?\s+to|should)\s+(?:come|arrive|be\b)`,
        // "need recognition and an invitation", "needs an invitation".
        // Filler is allowed on BOTH sides of the article: the live failure was
        // "requires an EXTERNAL invitation", where the adjective sits between
        // the article and the noun.
        String.raw`\bneed(?:s|ing|ed)?\s+(?:[a-z]+\s+){0,4}?(?:an?|the)\s+(?:[a-z]+\s+){0,2}?(?:invitation|invite)\b`,
        // "requires an external invitation or encounter to spark into motion"
        String.raw`\brequir(?:e|es|ing|ed)\s+(?:[a-z]+\s+){0,4}?(?:an?|the)\s+(?:[a-z]+\s+){0,2}?(?:invitation|invite)\b`,
        // "whether an invitation belongs to you", "if the invitation is yours"
        String.raw`\b(?:an?|the)\s+(?:invitation|invite)\s+(?:belongs|is\s+yours|is\s+meant)\b`,
      ].join("|"),
      "i",
    ),
    only: ["Projector"],
    says: "waiting for the invitation, which is the Projector strategy",
    negatable: true,
  },
  {
    re: /\blunar cycle\b|\b28[- ]day\b/i,
    only: ["Reflector"],
    says: "waiting a lunar cycle, which is the Reflector strategy",
  },
  {
    re: /\bwait(?:ing)? to respond\b/i,
    only: ["Generator", "Manifesting Generator"],
    says: "waiting to respond, which is the Generator strategy",
  },
];

/**
 * Returns a sentence when the reading gives another type's strategy, else null.
 *
 * `type` comes from the CHART, never from the reading -- the whole point is to
 * catch the reading disagreeing with the chart it was written from.
 */
/**
 * IS THIS MENTION OF AN INVITATION DENIED? (10/7, live refusals.)
 *
 * A Manifestor draft was refused for "an initiating force designed to move
 * things forward WITHOUT NEEDING to wait for an external invitation" -- which
 * is exactly right for a Manifestor. Telling a non-Projector it does NOT wait
 * for invitations is the opposite of the error these rules exist for.
 *
 * Denied means: a negating word in the SAME CLAUSE, before the mention -- no
 * comma, semicolon, colon, dash or full stop between them -- and no
 * "until / unless / before / once / only" between the negation and the end of
 * the mention, because "do not act UNTIL you are invited" denies the acting,
 * not the waiting, and is still the Projector strategy.
 *
 * This is the R-07/R-08 trade again (centreStateProblem), so it is kept
 * narrow: one clause, not the sentence. "There is no rush, so wait for the
 * invitation" is still refused (the comma ends the denial). Named residual:
 * "Instead of initiating wait for the invitation", with no comma, passes.
 *
 * "WITHOUT WAITING" AFTER A FORCING VERB IS A SCOLDING, NOT A DENIAL (same
 * live run). "Irritation shows up when you push forward without waiting for a
 * proper invitation" (a Generator) and "resistance when you try to force
 * things without waiting for an invitation" (a Manifesting Generator) both say
 * the reader SHOULD have waited -- the Projector strategy. But "initiate impact
 * directly without waiting for an outside invitation" is exactly right for a
 * Manifestor, and the model wrote it three times. So: "without", "instead of"
 * and "rather than" after push / force / initiate / rush / jump / charge in the
 * same clause do not deny, for anyone but a Manifestor.
 */
const NEGATOR = /\b(?:without|no|not|never|nor|neither|nothing|nobody|none|unlike|instead\s+of|rather\s+than|cannot)\b|n['\u2019]t\b/gi;
const CONDITION = /\b(?:until|till|unless|before|once|only)\b/i;
const SCOLD_NEGATOR = /^(?:without|instead\s+of|rather\s+than)$/i;
const FORCING = /\b(?:push|pushes|pushing|pushed|forc\w*|initiat\w*|rush\w*|jump\w*|charg\w*)\b/i;
export function negatedAt(text, start, end, type = null) {
  const before = String(text).slice(0, start);
  const cut = Math.max(...[",", ";", ":", ".", "!", "?", "\u2014", "\u2013", "(", ")", "\n"].map((c) => before.lastIndexOf(c)));
  const clause = before.slice(cut + 1);
  let neg = null;
  for (const m of clause.matchAll(NEGATOR)) neg = m;
  if (!neg) return false;
  if (type !== "Manifestor" && SCOLD_NEGATOR.test(neg[0]) && FORCING.test(clause.slice(0, neg.index))) return false;
  const last = neg.index + neg[0].length;
  return !CONDITION.test(clause.slice(last) + String(text).slice(start, end));
}

/**
 * THE 2 LINE IS CALLED OUT, WHATEVER THE TYPE (10/7, live). A Reflector 6/2
 * takeaway read "(Profile 6/2) Watch what happens when you ... let your
 * natural talents remain quiet until invited" -- the Hermit line, which is
 * taught as waiting to be called out, and which F45 already protects in "until
 * the right invitation draws you out". It was refused as the Projector
 * strategy. A sentence that names the 2 line (Line 2, the second line, Hermit,
 * a x/2 or 2/x profile) is about the line, not the type's strategy.
 */
const LINE_TWO = /\b(?:line\s*2|2(?:nd)?\s+line|second\s+line|hermit|profile\s+(?:2\/\d|\d\/2)|(?:2\/\d|\d\/2)\s+profile)\b/i;
export function aboutLineTwo(text, at) {
  const s = String(text);
  const from = Math.max(s.lastIndexOf(".", at), s.lastIndexOf("!", at), s.lastIndexOf("?", at), s.lastIndexOf("\n", at)) + 1;
  const ends = [".", "!", "?", "\n"].map((c) => s.indexOf(c, at)).filter((i) => i >= 0);
  return LINE_TWO.test(s.slice(from, ends.length ? Math.min(...ends) : s.length));
}

export function typeProblem(raw, type, undefinedCenters = null, openCenters = null) {
  const t = String(type ?? "").trim();
  if (!t) return null;
  const body = sanitize(raw);
  for (const rule of STRATEGY_WORDS) {
    if (rule.only.includes(t)) continue;
    const all = new RegExp(rule.re.source, rule.re.flags.replace("g", "") + "g");
    for (const m of body.matchAll(all)) {
      if (rule.negatable && negatedAt(body, m.index, m.index + m[0].length, t)) continue;
      if (rule.negatable && aboutLineTwo(body, m.index)) continue;
      return `The reading tells a ${t} about ${rule.says}.`;
    }
  }
  return typeWordProblem(body, t) ?? centreCountProblem(body, undefinedCenters, openCenters);
}

/**
 * THE TWO PROFILE LINES ARE THE CHART'S TWO DIGITS, IN ORDER. Found live on
 * 2026-09-02: a 6/2 reading wrote "Line 1 (Investigator), conscious" -- the
 * wrong line and the wrong name -- and every structural check passed it. The
 * lines under "Your profile lines" are read and compared with the profile the
 * chart supplied; nothing about the names is judged, only the numbers.
 */
export function profileLineProblem(raw, profile) {
  const m = /^(\d)\/(\d)/.exec(String(profile ?? "").trim());
  if (!m) return null;
  const want = [m[1], m[2]];
  const lines = sanitize(raw).split("\n").map((l) => l.trim());
  const at = lines.indexOf("Your profile lines");
  if (at < 0) return null; // structureProblem reports a missing heading
  const got = [];
  for (const l of lines.slice(at + 1)) {
    if (/^(Your energy, and how it starts)$/.test(l)) break;
    const lm = /^Line\s+(\d)\b/i.exec(l);
    if (lm) got.push(lm[1]);
  }
  if (got.length !== 2 || got[0] !== want[0] || got[1] !== want[1]) {
    return `The reading describes profile lines ${got.join("/") || "(none)"} for a ${want.join("/")} profile.`;
  }
  return null;
}

/**
 * THE SIGNATURE AND THE NOT-SELF THEME ARE FIXED BY TYPE. Five types, five
 * pairs of words, no overlap. Found live on 2026-09-02: a Manifestor's IN SHORT
 * line read "Not-self: Frustration flares up..." -- the Generator's word -- on
 * a document whose body said "anger" correctly three pages later. Only the two
 * labelled lines are checked, because the body may fairly mention frustration
 * or peace in passing; the labelled line is the one that is a claim.
 */
export const TYPE_WORDS = {
  Manifestor: { signature: "Peace", notSelf: "Anger" },
  Generator: { signature: "Satisfaction", notSelf: "Frustration" },
  "Manifesting Generator": { signature: "Satisfaction", notSelf: "Frustration" },
  Projector: { signature: "Success", notSelf: "Bitterness" },
  Reflector: { signature: "Surprise", notSelf: "Disappointment" },
};
const ALL_TYPE_WORDS = [...new Set(Object.values(TYPE_WORDS).flatMap((w) => [w.signature, w.notSelf]))];

/**
 * Does this line carry the given summary label, however the model spelled it?
 *
 * There are only two labels this matters for, so each is matched explicitly
 * rather than by a general "Label: value" pattern. A general one has to guess
 * where the label ends, and the guess is wrong in both directions: lazily, it
 * reads "Not self: Frustration" as the label "Not"; greedily, it reads
 * "Not-Self Theme Disappointment" as a label with no value.
 *
 * Accepted: a colon, a hyphen, an en or em dash, or NO separator at all, with
 * an optional "Theme" trailing the label. The model writes all of these, and
 * on 3 September it chose "Not-Self Theme:" on the very next generation after
 * that one spelling was added (audit F43).
 *
 * WITH NO SEPARATOR THE VALUE MUST BE A SINGLE WORD. That is what keeps "Not
 * self aware people tend to..." from reading as the not-self line: every value
 * this check compares is one word (Bitterness, Frustration, Peace), and prose
 * never is. With a separator present the value may be anything.
 */
const LABEL_LINE = {
  signature: /^(?:signature|when it[’']?s on track)(?:\s+theme)?\s*(?:(?::|[-‐-―]+)\s+(\S.*)|\s+(\S+))\s*$/i,
  notself: /^(?:not[\s‐-―-]*self|when it[’']?s off track)(?:\s+theme)?\s*(?:(?::|[-‐-―]+)\s+(\S.*)|\s+(\S+))\s*$/i,
};

/**
 * THE VALUE IS THE WORD THE LINE LEADS WITH, NOT EVERY WORD ON IT (audit R-09,
 * approved 9/9 as "#2").
 *
 * The page prints the engine's own word in front of the model's sentence
 * ("NOT-SELF Anger."), so the sentence after the label is commentary on a word
 * the buyer is already shown correctly. Judging the whole line refused four
 * delivered readings, and three of them used another type's word as ordinary
 * English in passing: "Finding deep satisfaction through recognition..." on a
 * Projector, "...a taste of resentment and frustration" on a Projector's
 * bitterness. Only 3258185c was wrong in the way this rule exists for -- its
 * not-self sentence OPENED with the wrong theme: "Frustration flares up..." on
 * a Manifestor.
 *
 * So the line is judged on what it leads with: the first word after the label,
 * past a "The" or "A". That is still the claim, and it is still caught.
 */
const LEAD_WORD = /^(?:(?:the|an?)\s+)?([a-z]+)/i;

export function typeWordProblem(body, type) {
  const own = TYPE_WORDS[type];
  if (!own) return null;
  const lines = String(body).split("\n");
  for (const [label, key] of [["Signature:", "signature"], ["Not-self:", "notSelf"]]) {
    // "Not-Self:" and "Not-self:" are the same line; the model writes both.
    // "Not-self:", "Not-Self:", "Not self:", "Not-Self Theme:" -- one line.
    //
    // AUDIT F43, ROUND TWO: the old matcher required a COLON, so "Not-self —
    // Bitterness", "Not-self - Bitterness" and a bare "Not-Self Theme
    // Bitterness" found no line at all -- and a check that finds no line
    // returns null, which reads exactly like a pass. This is the check that
    // catches a Projector's not-self word on a Generator, so failing it open
    // on a spelling is the expensive direction. Dashes of any width and a bare
    // space are accepted here; `summaryRows` is deliberately stricter, because
    // there a false match invents a row rather than skipping a check.
    const stem = label.slice(0, -1).toLowerCase().replace(/[^a-z]/g, "");
    const re = LABEL_LINE[stem];
    const line = lines.find((l) => re.test(l.trim()));
    if (!line) continue;
    const m = re.exec(line.trim());
    const lead = LEAD_WORD.exec((m[1] ?? m[2] ?? "").trim())?.[1] ?? "";
    for (const word of ALL_TYPE_WORDS) {
      if (word === own[key]) continue;
      if (lead.toLowerCase() === word.toLowerCase()) {
        return `The reading gives a ${type} the ${label.slice(0, -1).toLowerCase()} "${word}", which belongs to another type (theirs is ${own[key]}).`;
      }
    }
  }
  return null;
}

/**
 * NEVER MORE THAN THREE CENTRES IN ONE SENTENCE -- the prompt's rule, and the
 * model broke it on its first live outing ("Undefined centres like the Ajna, G,
 * Heart, Sacral, and Root ... while open Head and Spleen ..."). A sentence that
 * lists a whole state back to the reader is the enumeration the prompt forbids.
 */
const CENTRE_RE = /\b(Head|Ajna|Throat|G|Heart|Sacral|Spleen|Solar Plexus|Root)\b/g;
export function centreCountProblem(body, undefinedCenters = null, openCenters = null) {
  /**
   * "Your definition" is the one place a list is the answer: the prompt asks
   * how the DEFINED centres connect, and a Single definition with six defined
   * centres is six names in one sentence. The first live run of this rule
   * refused exactly that paragraph, so that section is exempt.
   */
  /**
   * Two sections are lists by design -- "Your definition" and "What is
   * consistently yours" both describe the DEFINED centres, and an all-nine
   * chart names nine. They are exempt. Everywhere else the line is drawn at
   * FOUR, not the prompt's three: a Reflector has seven undefined centres to
   * cover in two paragraphs and was refused on its first live draft for a
   * sentence naming four of them. Seven in one sentence (the fault this rule
   * was written for) is still refused.
   */
  const text = String(body);
  const cut = (s, fromH, toH) => {
    const from = s.indexOf(fromH);
    const to = s.indexOf(toH);
    return from >= 0 && to > from ? s.slice(0, from) + s.slice(to) : s;
  };
  let judged = cut(text, "\nYour definition\n", "\nYour channels\n");
  judged = cut(judged, "\nWhat is consistently yours\n", "\nWhat you take in from others\n");

  /**
   * THE LIMIT IS THE CHART'S, NOT A CONSTANT (audit F44, round two).
   *
   * Raising the ceiling from three to four fixed the sentence in the finding
   * and not the class it came from. The chart this rule keeps refusing is a
   * REFLECTOR, which has seven undefined centres, and "What you take in from
   * others" is the one section where naming all of them is the honest thing to
   * write. Four cannot reach seven, and measuring it cost 4 writer invocations,
   * ~8 drafts and 9 minutes on a live purchase -- 0 accepted in 13 offline
   * attempts.
   *
   * The answer is not a bigger number. Seven-in-a-sentence is exactly the
   * padding this rule was written to refuse, and a global seven would disarm it
   * for the eight type-charts that are not Reflectors. So section 5 alone gets
   * a chart-aware limit, and everywhere else the line stays at four.
   *
   * THE LIST WAS WRONG THE FIRST TIME (audit R-06). I keyed the limit to the
   * undefined centres alone, which fixes the Reflector it was written for and
   * breaks its mirror image: a chart with ZERO undefined and seven OPEN was
   * still held to four. Section 5 describes all the WHITE centres, undefined
   * and open together, so that is the number of them.
   *
   * Measured, not reasoned: swept against the fourteen readings already
   * delivered, the undefined-only limit refused five honest ones -- among them
   * "Because your Head, Ajna, G, Heart, Spleen, Solar Plexus, and Root centres
   * are all open", which shipped to a buyer. undefined + open clears all five,
   * clears the falsification case I set myself (a Reflector needing seven
   * undefined plus two open), and still holds a defined-heavy chart to four.
   */
  const S5 = "\nWhat you take in from others\n";
  const white =
    (Array.isArray(undefinedCenters) ? undefinedCenters.length : 0) +
    (Array.isArray(openCenters) ? openCenters.length : 0);
  const from = judged.indexOf(S5);
  const to = from >= 0 ? section6At(judged, from + 1) : -1;
  const section5 = from < 0 ? "" : to > from ? judged.slice(from, to) : judged.slice(from);
  const elsewhere = section5 ? judged.slice(0, from) + "\n" + judged.slice(from + section5.length) : judged;

  const over = (chunk, limit) => {
    for (const sentence of chunk.split(/(?<=[.!?])\s+|\n+/)) {
      const named = new Set(sentence.match(CENTRE_RE) ?? []);
      if (named.size > limit) {
        return `The reading names ${named.size} centers in one sentence (the limit is ${limit}): "${sentence.trim().slice(0, 90)}..."`;
      }
    }
    return null;
  };

  return over(elsewhere, 4) ?? over(section5, Math.max(4, white));
}

/**
 * DOES THE PROSE AGREE WITH THE CHART IT WAS WRITTEN FROM?
 *
 * Every other check here reads the reading's SHAPE. This one reads its CLAIMS,
 * and it exists because two paid readings shipped with facts that contradicted
 * the chart printed in the margin beside them (audit N-01, N-04):
 *
 *   - bac485bd said "Your defined Heart center contributes a consistent thread
 *     of willpower" and repeated "defined Heart" four times. Heart is
 *     UNDEFINED on that chart. The margin note two inches away listed the
 *     defined centres without it, and section 5 called it undefined correctly.
 *   - 076327ca opened section 5 with "Open and undefined spaces..." on a chart
 *     whose own values panel printed UNDEFINED CENTRES: None.
 *
 * Nothing looked. `openCentreProblem` only ever inspected section 5, so a
 * contradiction anywhere in the other ten sections was invisible, and the three
 * lists needed to catch it were already in memory. The check is a set lookup.
 *
 * DELIBERATELY TWO SHAPES ONLY -- "your defined Heart" and "your Heart is
 * defined". The model has a hundred ways to describe a centre and only these
 * two assert its state flatly enough to be judged. A rule that guessed at the
 * rest would refuse honest prose, and every refusal costs the buyer a minute.
 */
const CENTRE_ALT = "Solar Plexus|Head|Ajna|Throat|Heart|Sacral|Spleen|Root|G";
const STATE_BEFORE = new RegExp(`\\byour\\s+(?:own\\s+)?(undefined|defined|open)\\s+(${CENTRE_ALT})\\b`, "gi");
const STATE_AFTER = new RegExp(
  `\\byour\\s+(?:own\\s+)?(${CENTRE_ALT})\\s+(?:cent(?:er|re)\\s+)?is\\s+(undefined|defined|open)\\b`,
  "gi",
);

/**
 * A CLAIM IS "YOUR defined Heart", NOT "A defined Heart" (audit R-07 and R-08,
 * approved 9/9).
 *
 * Round three answered "is this sentence negated?" with a closed list of
 * negating words read across the whole sentence (NOT_A_CLAIM), and round four
 * broke it from both sides at once:
 *
 *   R-07  honest prose still refused, because a list cannot hold every way of
 *         saying "does not have": "your Projector type LACKS a defined Sacral
 *         centre" (delivered, 8e5ff09e), "MISSING", "THE ABSENCE OF", "FREE
 *         OF", "DEVOID OF", "SHORT OF".
 *   R-08  wrong facts let through, because a negation anywhere in the sentence
 *         disarmed it even when it negated something else: "There is NO doubt
 *         your defined Heart drives you", "You NEVER lose access to your
 *         defined Heart", "Someone with your defined Heart...". Nine of ten.
 *
 * Every word added to the list for R-07 is one more way for R-08 to slip, so
 * the list is gone. What separates the two sets is the word in front of the
 * state: "YOUR defined Heart" asserts something about this chart; "A defined
 * Heart", "NO defined Head", "NEITHER defined Head" describe a kind of centre,
 * a denial, or somebody else. Only the possessive is judged.
 *
 * Named residuals, accepted on the same trade as before (a missed wrong fact is
 * one bad sentence; a false refusal is minutes of a buyer's wait): "Not everyone
 * has a defined Heart like yours" and "The Heart centre is defined" are not
 * judged. The one real error the rule was written for -- "Your defined Heart
 * center contributes a consistent thread of willpower" -- still is.
 */
export function centreStateProblem(raw, definedCenters, undefinedCenters, openCenters) {
  const list = (v) => (Array.isArray(v) ? v : []);
  const actual = new Map();
  for (const c of list(definedCenters)) actual.set(c, "defined");
  for (const c of list(undefinedCenters)) actual.set(c, "undefined");
  for (const c of list(openCenters)) actual.set(c, "open");
  if (!actual.size) return null;

  const body = sanitize(raw);
  const judge = (claimed, centre) => {
    const truth = actual.get(centre);
    if (!truth || truth === claimed) return null;
    // "open" and "undefined" are both white on the drawing, and a reading that
    // calls an undefined centre open is loose rather than wrong -- it is the
    // DEFINED/not-defined confusion that misinforms. Only that is refused.
    // Measured across 144 state-claims in 14 delivered readings: that looser
    // confusion has never once occurred, so tolerating it costs nothing.
    if (claimed !== "defined" && truth !== "defined") return null;
    return `The reading calls the ${centre} center "${claimed}", but on this chart it is ${truth}.`;
  };

  for (const m of body.matchAll(STATE_BEFORE)) {
    const problem = judge(m[1].toLowerCase(), m[2]);
    if (problem) return problem;
  }
  for (const m of body.matchAll(STATE_AFTER)) {
    const problem = judge(m[2].toLowerCase(), m[1]);
    if (problem) return problem;
  }

  /**
   * N-04: a chart with nothing undefined must not be told about its undefined
   * centres. The same possessive rule as above, and the one it was first
   * written as: "YOUR undefined spaces" is a claim; "none of your centres is
   * undefined", "you have no undefined centres" and "a centre that is
   * undefined..." are not, because the word in front of "undefined" is not the
   * reader's possessive. It used to allow three words between "your" and
   * "undefined" and then lean on the negation list to clear what that let in.
   */
  if (!list(undefinedCenters).length) {
    const claim = /\b(?:your(?:\s+own)?|you\s+have|you've\s+got)\s+undefined\b/i.exec(body);
    if (claim) {
      return `The reading describes undefined centers ("${claim[0].trim()}"), but this chart has none.`;
    }
  }
  return null;
}

export function structureProblem(raw) {
  const lines = sanitize(raw)
    .split("\n")
    .map((l) => l.trim());
  const wanted = [SUMMARY_MARKER, ...HEADINGS];
  const missing = wanted.filter((w) => !lines.includes(w));
  if (missing.length) {
    return (
      "The reading came back missing " +
      (missing.length === 1
        ? `a section (${missing[0]}).`
        : `${missing.length} sections (${missing.slice(0, 2).join("; ")}...).`)
    );
  }
  const at = wanted.map((w) => lines.indexOf(w));
  if (at.some((v, i) => i > 0 && v < at[i - 1])) {
    return "The reading came back with its sections out of order.";
  }
  const absent = SUMMARY_KEYS.filter((k) => !(k in summaryRows(raw)));
  if (absent.length) {
    return `The summary panel came back missing ${absent.join(", ")}.`;
  }
  return null;
}

/**
 * The six "Label: sentence" lines under the summary marker.
 *
 * ONLY THE SENTENCE IS USED. The label and the chart value are drawn from the
 * chart itself, so a model that miscopies a value cannot put a wrong one on the
 * page -- which is the difference between a document that is WRONG and one that
 * is merely worded oddly.
 */
export function summaryRows(raw) {
  const lines = sanitize(raw)
    .split("\n")
    .map((l) => l.trim());
  const start = lines.indexOf(SUMMARY_MARKER);
  const out = {};
  if (start < 0) return out;
  for (const line of lines.slice(start + 1)) {
    if (HEADINGS.includes(line) || OLD_HEADINGS[line]) break;
    // "Not-Self Theme:", "Not self:", "Not-Self:" are all the Not-self line --
    // the model copies the label it was HANDED in the facts as often as the
    // one it was asked for, and refusing a filled line over its spelling cost
    // two paid readings a morning (2026-09-03).
    const m = /^([A-Za-z][A-Za-z '\u2019-]*?)(?:\s+theme)?:\s*(.+)$/i.exec(line);
    if (!m) continue;
    const norm = (s) => s.toLowerCase().replace(/[^a-z]/g, "");
    const key = SUMMARY_KEYS.find((k) => norm(k) === norm(m[1]) || norm(SUMMARY_LABELS[k] ?? "") === norm(m[1]));
    if (key && !(key in out)) out[key] = m[2].trim();
  }
  return out;
}

/**
 * The reading, split into the blocks the document is laid out from.
 *
 * Returns `{ summary, sections }`, sections in the order they appeared, each
 * `{ heading, lede, paragraphs }`. The lede is the first paragraph of an
 * interpretation section -- the app sets it large, and it is the sentence the
 * rest of the section rests on.
 */
/**
 * A LABELLED LIST IS NOT A WRAPPED PARAGRAPH.
 *
 * A block separated by blank lines is normally one paragraph that happens to be
 * wrapped, so single newlines inside it become spaces. That is right for prose
 * and WRONG for the mechanics sections that are lists, where the model puts one
 * entry per line separated by a single newline:
 *
 *   Line 2 (Hermit), conscious: Natural talents live inside you quietly...
 *   Line 4 (Opportunist), unconscious: Your foundations rest on the network...
 *
 * Joined into one paragraph, the renderer splits on the FIRST colon only -- so
 * "Line 2 (Hermit), conscious" became the label and EVERYTHING ELSE, Line 4
 * included, became its note. Jeremy found it on the profile lines of his own
 * paid reading: "info that is misplaced".
 *
 * THE MODEL WAS RIGHT AND THE PARSER WAS WRONG, which is worth saying because
 * the instinct on seeing mangled output is to go and change the prompt.
 *
 * A block is a LIST when two or more of its lines open with a short label and a
 * colon. Two, not one: a sentence that happens to contain a colon halfway
 * through is prose, and treating that as a list would break every section that
 * has one.
 */
const ENTRY = /^[^:\n]{1,70}:\s/;

function unwrap(block) {
  const lines = block.split("\n").map((l) => l.trim()).filter(Boolean);
  const labelled = lines.filter((l) => ENTRY.test(l)).length;
  return labelled >= 2 ? lines : [lines.join(" ").trim()];
}

export function parseReading(raw) {
  const text = sanitize(raw);
  const body = text.includes(DISCLAIMER) ? text.slice(0, text.indexOf(DISCLAIMER)) : text;
  const sections = [];
  let current = null;
  let buf = [];

  const flush = () => {
    if (!current) return;
    const paras = buf
      .join("\n")
      .split(/\n\s*\n/)
      .flatMap(unwrap)
      .filter(Boolean);
    const big = INTERPRETATION.includes(current);
    sections.push({
      heading: current,
      lede: big ? (paras[0] ?? null) : null,
      paragraphs: big ? paras.slice(1) : paras,
    });
    buf = [];
  };

  for (const line of body.split("\n")) {
    const t = OLD_HEADINGS[line.trim()] ?? line.trim();
    if (HEADINGS.includes(t)) {
      flush();
      current = t;
      continue;
    }
    if (current) buf.push(line);
  }
  flush();

  return { summary: summaryRows(raw), sections };
}

/**
 * The chart facts beside each section, ported from the app -- with one fix.
 *
 * The app prints "Decided over time, not in the moment." beside EVERY
 * authority. That is right for Emotional and wrong for Sacral and Splenic:
 * both answer in the instant, and telling somebody with Sacral authority to
 * decide over time is the opposite of their own design. Visible on page 4 of
 * `Jeremy-pdf-view.pdf`, in the margin next to "SACRAL AUTHORITY".
 *
 * Flagged for the app rather than fixed quietly in one place -- two documents
 * disagreeing about somebody's authority is worse than one being wrong.
 */
export function marginNotes(c) {
  const defined = (c && c.definedCenters) || [];
  const decidingCentre = defined.includes("Solar Plexus")
    ? "Solar Plexus"
    : defined.includes("Sacral")
      ? "Sacral"
      : defined.includes("Spleen")
        ? "Spleen"
        : (c && c.definition) || "";

  const HOW = {
    Emotional: "Decided over time, not in the moment.",
    Sacral: "Answered in the moment, in the body.",
    Splenic: "Answered once, quietly, in the present.",
    Ego: "Decided by what there is will for.",
    // The engine names the two Ego authorities in full; "Ego" alone matched
    // neither, and their margin printed nothing (found 10/5).
    "Ego Manifested": "Decided by what there is will for.",
    "Ego Projected": "Decided by what there is will for.",
    "Self-Projected": "Heard by saying it out loud.",
    Mental: "Talked through with people you trust.",
    Lunar: "Decided over a full lunar cycle.",
  };
  const authority = (c && c.authority) || "";
  const profileNames = profileWithNames(c && c.profile).replace(/^[^—]*—\s*/, "");

  return {
    [INTERPRETATION[0]]: [
      [String((c && c.type) || "").toUpperCase(), (c && c.strategy) || ""],
      ["DEFINITION", (c && c.definition) || ""],
    ],
    [INTERPRETATION[1]]: [
      [`${authority.toUpperCase()} AUTHORITY`.trim(), HOW[authority] || ""],
      ["CENTER", decidingCentre],
    ],
    [INTERPRETATION[2]]: [
      [`PROFILE ${(c && c.profile) || ""}`.trim(), profileNames],
      ["INCARNATION CROSS", (c && c.incarnationCross) || ""],
    ],
    [INTERPRETATION[3]]: [["DEFINED CENTERS", defined.join(", ") || "None"]],
    [INTERPRETATION[4]]: [
      // Absent on readings stored before the third state existed; absent is
      // not empty, so no "None" is printed for a value that was never computed.
      ...(Array.isArray(c && c.undefinedCenters)
        ? [["UNDEFINED CENTERS", c.undefinedCenters.join(", ") || "None"]]
        : []),
      ["OPEN CENTERS", ((c && c.openCenters) || []).join(", ") || "None"],
    ],
    [INTERPRETATION[5]]: [
      // The break keeps "IS" off a line of its own in the narrow PDF margin.
      ["ON TRACK,\nTHE FEELING IS", (c && c.signature) || ""],
      ["OFF TRACK,\nTHE FEELING IS", (c && c.notSelfTheme) || ""],
    ],
  };
}
