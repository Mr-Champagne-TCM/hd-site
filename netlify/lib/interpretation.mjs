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
  "When it is working, and when it is not",
];

export const HEADINGS = [...MECHANICS, ...INTERPRETATION, TAKEAWAYS];

/** Rows of the at-a-glance panel, in panel order. */
export const SUMMARY_KEYS = ["Type", "Strategy", "Authority", "Profile", "Signature", "Not-self"];

/**
 * WHAT GOES OVER THE WIRE. Chart values, and nothing else.
 *
 * Takes the ENGINE'S OUTPUT rather than a stored reading, and that is the
 * safeguard rather than a convenience: a stored reading holds the buyer's name,
 * email and phone, and a function that never receives them cannot leak them.
 */
export function chartFactsOnly(output) {
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
    `Signature: ${output?.signature ?? ""}`,
    `Not-Self Theme: ${output?.notSelfTheme ?? ""}`,
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
 * Clean up what the model returned before a human ever sees it. A corrupted
 * character or a stray markdown asterisk in a paid deliverable reads as
 * carelessness, and one replacement glyph did come back in the app's testing.
 */
export function sanitize(s) {
  return String(s)
    .replace(/\r\n?/g, "\n")
    .replace(/�/g, "-")
    .replace(/\*\*/g, "")
    .replace(/^[ \t]*[*•–-][ \t]+/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .split("\n")
    .map(canonicalHeading)
    .join("\n")
    .trim();
}

/**
 * THE HEADING THE MODEL KEEPS REWRITING. Across a day of live drafts the one
 * heading it would not copy was "What you take in from others" -- it came back
 * as "What is taken in from others", "What is through others", "What is
 * undefined centres", and IN SHORT once arrived as IN_SHORT. Every one of
 * those is unmistakably the section it stands for, and every one cost a paid
 * reading a refusal and a retry. A line that is nothing but a paraphrase of a
 * required heading becomes the heading; body text is untouched because it
 * never sits alone on a short line ending without punctuation.
 */
function canonicalHeading(line) {
  const l = line.trim();
  if (!l || l.length > 60 || /[.!?:]$/.test(l)) return line;
  if (/^IN[_ ]SHORT$/i.test(l)) return "IN SHORT";
  if (/^what\b.*\bothers$/i.test(l)) return "What you take in from others";
  if (/^what\b.*\b(undefined|open)\b.*centres?$/i.test(l)) return "What you take in from others";
  return line;
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
    typeProblem(reading, type, undefinedCenters) ??
    profileLineProblem(reading, profile) ??
    openCentreProblem(reading, openCenters, undefinedCenters) ??
    centreStateProblem(reading, definedCenters, undefinedCenters, openCenters)
  );
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
  const to = body.indexOf("\nWhen it is working, and when it is not\n", from);
  const section = to > from ? body.slice(from, to) : body.slice(from);
  const names = (list) => list.some((c) => new RegExp(`\\b${c}\\b`).test(section));
  if (open.length && !names(open)) {
    return `The reading's "What you take in from others" never names one of this chart's ${open.length} open centres (${open.join(", ")}).`;
  }
  if (und.length && !names(und)) {
    return `The reading's "What you take in from others" never names one of this chart's ${und.length} undefined centres (${und.join(", ")}).`;
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
export function promptProblem(prompt) {
  const text = String(prompt ?? "");
  if (!text.trim()) return "No reading prompt is configured.";
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
    // The verb may be wait, rest or hold back; the object may be an
    // invitation, an invite, or "being invited" (audit F45).
    re: /\b(?:wait(?:ing|s|ed)?|rest(?:ing|s)?|hold(?:ing|s)?\s+(?:back|off))\s+(?:for|on|until|to\s+be)\s+(?:an?\s+|the\s+|you\s+are\s+|you're\s+|being\s+)?(?:proper\s+|right\s+|formal\s+|genuine\s+)?(?:invitation|invite|invited)\b/i,
    only: ["Projector"],
    says: "waiting for the invitation, which is the Projector strategy",
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
export function typeProblem(raw, type, undefinedCenters = null) {
  const t = String(type ?? "").trim();
  if (!t) return null;
  const body = sanitize(raw);
  for (const rule of STRATEGY_WORDS) {
    if (rule.only.includes(t)) continue;
    if (rule.re.test(body)) {
      return `The reading tells a ${t} about ${rule.says}.`;
    }
  }
  return typeWordProblem(body, t) ?? centreCountProblem(body, undefinedCenters);
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
const TYPE_WORDS = {
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
  signature: /^signature(?:\s+theme)?\s*(?:(?::|[-‐-―]+)\s+\S.*|\s+\S+)\s*$/i,
  notself: /^not[\s‐-―-]*self(?:\s+theme)?\s*(?:(?::|[-‐-―]+)\s+\S.*|\s+\S+)\s*$/i,
};

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
    for (const word of ALL_TYPE_WORDS) {
      if (word === own[key]) continue;
      if (new RegExp(`\\b${word}\\b`, "i").test(line)) {
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
export function centreCountProblem(body, undefinedCenters = null) {
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
   * for the eight type-charts that are not Reflectors. So section 5 alone is
   * allowed as many centres as the chart actually has undefined, and everywhere
   * else the line stays at four.
   */
  const S5 = "\nWhat you take in from others\n";
  const S5_END = "\nWhen it is working, and when it is not\n";
  const und = Array.isArray(undefinedCenters) ? undefinedCenters.length : 0;
  const from = judged.indexOf(S5);
  const to = from >= 0 ? judged.indexOf(S5_END, from + 1) : -1;
  const section5 = from < 0 ? "" : to > from ? judged.slice(from, to) : judged.slice(from);
  const elsewhere = section5 ? judged.slice(0, from) + "\n" + judged.slice(from + section5.length) : judged;

  const over = (chunk, limit) => {
    for (const sentence of chunk.split(/(?<=[.!?])\s+|\n+/)) {
      const named = new Set(sentence.match(CENTRE_RE) ?? []);
      if (named.size > limit) {
        return `The reading names ${named.size} centres in one sentence (the limit is ${limit}): "${sentence.trim().slice(0, 90)}..."`;
      }
    }
    return null;
  };

  return over(elsewhere, 4) ?? over(section5, Math.max(4, und));
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
 * DELIBERATELY TWO SHAPES ONLY -- "defined Heart" and "Heart is defined". The
 * model has a hundred ways to describe a centre and only these two assert its
 * state flatly enough to be judged. A rule that guessed at the rest would
 * refuse honest prose, and every refusal costs the buyer a minute.
 */
const CENTRE_ALT = "Solar Plexus|Head|Ajna|Throat|Heart|Sacral|Spleen|Root|G";
const STATE_BEFORE = new RegExp(`\\b(undefined|defined|open)\\s+(${CENTRE_ALT})\\b`, "gi");
const STATE_AFTER = new RegExp(
  `\\b(${CENTRE_ALT})\\s+(?:cent(?:er|re)\\s+)?is\\s+(undefined|defined|open)\\b`,
  "gi",
);

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
    if (claimed !== "defined" && truth !== "defined") return null;
    return `The reading calls the ${centre} centre "${claimed}", but on this chart it is ${truth}.`;
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
   * centres. Narrow on purpose -- only a possessive claim counts, so a reading
   * may still explain what the word means, and a negation ("none of your
   * centres is undefined") is left alone.
   */
  if (!list(undefinedCenters).length) {
    const claim = /\b(?:your|you have|you've got)\s+(?:[a-z]+\s+){0,3}?undefined\b/i.exec(body);
    if (claim && !/\b(?:no|none|not|without|zero)\b[^.]{0,40}$/i.test(claim[0])) {
      return `The reading describes undefined centres ("${claim[0].trim()}"), but this chart has none.`;
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
    if (HEADINGS.includes(line)) break;
    // "Not-Self Theme:", "Not self:", "Not-Self:" are all the Not-self line --
    // the model copies the label it was HANDED in the facts as often as the
    // one it was asked for, and refusing a filled line over its spelling cost
    // two paid readings a morning (2026-09-03).
    const m = /^([A-Za-z][A-Za-z -]*?)(?:\s+theme)?:\s*(.+)$/i.exec(line);
    if (!m) continue;
    const norm = (s) => s.toLowerCase().replace(/[^a-z]/g, "");
    const key = SUMMARY_KEYS.find((k) => norm(k) === norm(m[1]));
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
    const t = line.trim();
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
      ["CENTRE", decidingCentre],
    ],
    [INTERPRETATION[2]]: [
      [`PROFILE ${(c && c.profile) || ""}`.trim(), profileNames],
      ["INCARNATION CROSS", (c && c.incarnationCross) || ""],
    ],
    [INTERPRETATION[3]]: [["DEFINED CENTRES", defined.join(", ") || "None"]],
    [INTERPRETATION[4]]: [
      // Absent on readings stored before the third state existed; absent is
      // not empty, so no "None" is printed for a value that was never computed.
      ...(Array.isArray(c && c.undefinedCenters)
        ? [["UNDEFINED CENTRES", c.undefinedCenters.join(", ") || "None"]]
        : []),
      ["OPEN CENTRES", ((c && c.openCenters) || []).join(", ") || "None"],
    ],
    [INTERPRETATION[5]]: [
      ["SIGNATURE", (c && c.signature) || ""],
      ["NOT-SELF", (c && c.notSelfTheme) || ""],
    ],
  };
}
