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
import { usableSpread } from "../../shared/timeSpread.mjs";

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
/**
 * NO BARE "none" TO QUOTE (10/23). A Reflector's facts said "Definition: None" and "Defined centers: none", and
 * the readings read the label out: "Your chart shows none", "None definition means zero defined centers", "Because
 * your defined centers are none", a tag "(Defined centers: none)" -- 31 stored drafts, 12 that passed every check.
 * An empty value is a plain sentence instead, which reads as English wherever it is repeated.
 */
const EMPTY_FACT = {
  definition: "No center is defined in this chart, so it has no definition.",
  defined: "No center is defined in this chart.",
  undefined: "No center in this chart is undefined.",
  open: "No center in this chart is open.",
  channels: "No channel is defined in this chart.",
};
export function chartFactsOnly(output, { form = false } = {}) {
  const list = (v, empty) => (Array.isArray(v) && v.length ? v.join(", ") : empty);
  const acts = (v) =>
    Array.isArray(v)
      ? v.map((a) => `${String(a.planet ?? "").toLowerCase()} ${a.gate}.${a.line}`).join(", ")
      : "";
  const definition = String(output?.definition ?? "");
  const lines = [
    `Type: ${output?.type ?? ""}`,
    `Strategy: ${output?.strategy ?? ""}`,
    `Inner Authority: ${output?.authority ?? ""}`,
    `Profile: ${output?.profile ?? ""}`,
    `Definition: ${/^none$/i.test(definition.trim()) ? EMPTY_FACT.definition : definition}`,
    form
      ? `When it's on track, the feeling is: ${output?.signature ?? ""}`
      : `Signature: ${output?.signature ?? ""}`,
    form
      ? `When it's off track, the feeling is: ${output?.notSelfTheme ?? ""}`
      : `Not-Self Theme: ${output?.notSelfTheme ?? ""}`,
    // The engine's own name ("Cross of the ..." since engine 0.6.0, W14), so the model's words match the tables.
    `Incarnation Cross: ${output?.incarnationCross ?? ""}`,
    `Defined centers: ${list(output?.definedCenters, EMPTY_FACT.defined)}`,
    `Undefined centers (not colored in, but carrying gates): ${list(output?.undefinedCenters, EMPTY_FACT.undefined)}`,
    `Open centers (not colored in, with no gates at all): ${list(output?.openCenters, EMPTY_FACT.open)}`,
    `Channels: ${list(output?.channels, EMPTY_FACT.channels)}`,
    `Personality activations: ${acts(output?.personality)}`,
    `Design activations: ${acts(output?.design)}`,
  ];
  // An unknown birth time: what the birth day measured, nothing more (birthTimeNote, 10/22).
  const note = birthTimeNote(output, { form });
  if (note) lines.push("", note);
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
    profileOrdinalProblem(reading) ??
    openCentreProblem(reading, openCenters, undefinedCenters) ??
    centreStateProblem(reading, definedCenters, undefinedCenters, openCenters) ??
    oldWordProblem(reading) ??
    trackRowProblem(reading) ??
    nearMissProblem(reading, type) ??
    spellingProblem(reading) ??
    glanceProblem(reading) ??
    slipProblem(reading) ??
    takeawayProblem(reading)
  );
}

/**
 * A GLANCE ROW IS A WHOLE SENTENCE (10/21 live test, AI3). Rows like "Carrying
 * a design that guides others" and "Waiting for the proper invitation before
 * committing" printed as if they were sentences. A row that opens on an -ing
 * word and never reaches a main verb is refused. "Waiting for the invitation
 * ensures..." (an -ing subject with its verb) passes, as does "Waiting, you
 * notice..." The same test the local rig judges with (tools/e2e/checks).
 *
 * 10/22 (AI test round: 5 of 57 drafts refused for nothing else). The first
 * version stopped at the first until / who / that and took only an -s verb
 * right before an article or pronoun, so whole sentences were refused:
 * "Pausing until something physically meets your energy gives your power
 * somewhere true to land.", "Telling those who will be affected before you
 * move clears the path ahead.", "...brings clarity to...". Now a linking word
 * opens a clause that uses up ITS OWN verb, and the row is whole once a verb is
 * left over for the -ing subject. "before" / "after" open a clause only with a
 * pronoun after them ("before you move"); "before action" is a preposition.
 * All 21 -ing rows that round refused were read by hand: 15 whole sentences
 * (pass now), 6 fragments (one draft's six rows, still refused).
 */
const G_CLAUSE = /^(?:that|which|who|whom|whose|when|whenever|where|because|while|if|until|unless|once|though|although|whereas|so)$/;
const G_CLAUSE_IF_SUBJECT = /^(?:before|after|since|as|till)$/;
const G_RELATIVE = /^(?:that|which|who)$/;
const G_SUBJECT = /^(?:you|they|we|i|he|she|it|someone|something|anyone|anything|everyone|everything|nothing|nobody|people)$/;
const G_DET = /^(?:a|an|the|your|my|his|her|its|their|our|these|those|this|that|many|few|some|all|any|each|every|other|another|no|what|who|which)$/;
const G_PREP = /^(?:of|in|on|at|for|with|from|into|onto|through|by|about|between|among|toward|towards|without|within|over|under|around|across|after|before|during|like|to)$/;
const G_ADVERB = /^(?:[a-z]+ly|never|always|often|still|just|even|not|only|already|also|soon)$/;
const G_AUX = /^(?:is|are|was|were|am|has|had|will|would|can|could|may|might|must|should|shall|does|did|becomes)$/;
const G_NOT_S = /^(?:always|perhaps|sometimes|towards|afterwards|besides|unless|thus|less|across|whereas|its|this|his|hers|ours|yours|theirs|others|yes|news|series|species|plus|various|numerous|previous|serious|was|has|does|is)$/;
const G_AFTER_NOUN = /^(?:of|and|or|nor|but|that|who|which)$/;
const G_OBJECT = /^(?:a|an|the|your|you|yourself|it|its|them|their|his|her|our|us|me|my|this|these|those|what|how|more|less|most)$/;
const G_LETS = /^(?:allowing|letting|helping|making|having|getting|asking|inviting|encouraging|leaving|watching|seeing|hearing)$/;
const G_NOT_ING = /^(?:thing|things|something|anything|nothing|everything|morning|evening|spring|string|during|ceiling|king|ring|wing|sing|bring)$/;
const gIng = (x) => /^[a-z]{2,}ing$/.test(x ?? "") && !G_NOT_ING.test(x);
const gS = (x) => /^[a-z]{3,}s$/.test(x ?? "") && !/(?:ss|us|is)$/.test(x) && !G_NOT_S.test(x);

export function glanceFragment(v) {
  const s = String(v ?? "").trim();
  if (!/^[A-Z][a-z]+ing\b/.test(s)) return false;
  if (/^[^.;]*?,\s+(?:you|it|they|we|he|she)\s+(?!and\b|or\b)[a-z]+/.test(s)) return false;
  const w = s.replace(/[“”"(),.;:!?—–]/g, " ").split(/\s+/).filter(Boolean).map((x) => x.toLowerCase());
  let used = -1; // the last verb a clause took for itself, when it can take an object ("guides", "will")
  let lets = G_LETS.test(w[0]);
  for (let i = 1; i < w.length; i++) {
    const x = w[i];
    // "Holding that line ...": "that" after the opener or a preposition points, it opens nothing.
    const pointing = x === "that" && (i === 1 || G_PREP.test(w[i - 1]));
    if (!pointing && (G_CLAUSE.test(x) || (G_CLAUSE_IF_SUBJECT.test(x) && G_SUBJECT.test(w[i + 1] ?? "")))) {
      let j = i + 1;
      while (j < w.length && G_ADVERB.test(w[j])) j++;
      if (j >= w.length) break;
      // "before acting", "until invited": no clause, so no verb of its own.
      if (gIng(w[j]) || (!G_RELATIVE.test(x) && /ed$/.test(w[j]))) {
        i = j;
        continue;
      }
      let k;
      if (G_SUBJECT.test(w[j])) {
        // "until something arrives", "before you move": the word after the pronoun.
        k = j + 1;
        while (k < w.length && G_ADVERB.test(w[k])) k++;
      } else if (G_RELATIVE.test(x) && !G_DET.test(w[j])) {
        // "that guides", "who will": the relative word is the subject.
        k = j;
      } else {
        // "when your energy spends", "that your guidance landed": the first verb after its subject.
        k = j + 1;
        while (k < w.length && !(G_AUX.test(w[k]) || gS(w[k]) || /^[a-z]{3,}ed$/.test(w[k]))) k++;
      }
      used = G_AUX.test(w[k] ?? "") || gS(w[k]) ? k : -1;
      i = k;
      continue;
    }
    if (G_DET.test(w[i - 1])) continue;
    if (G_AUX.test(x)) return false;
    if (gS(x) && !G_PREP.test(w[i - 1])) {
      // 10/22 full rig: "Carrying a design that guides and directs energy rather than
      // generating it...": a clause's verb joined by "and" / "or" to another is the
      // clause's too ("that guides and directs"), not the row's main verb.
      if (used >= 0 && i - 2 === used && (w[i - 1] === "and" || w[i - 1] === "or")) {
        used = i;
        continue;
      }
      let j = i + 1;
      while (j < w.length && G_ADVERB.test(w[j])) j++;
      // Right after a clause's own "guides" / "will", an -s word is its object
      // ("that guides travelers through") unless an object follows it in turn.
      if (i - 1 === used && !G_OBJECT.test(w[j] ?? "")) continue;
      // "Allowing opportunities to approach...", "Letting the right questions find
      // you...": after these openers the first -s word is what is let or allowed.
      if (lets && !G_OBJECT.test(w[j] ?? "")) {
        lets = false;
        continue;
      }
      // The -s word is a verb when something follows it that a verb takes: not a
      // plural noun at the end, before "of" / "and" / "that", or before an -ing word.
      if (j < w.length && !gIng(w[j]) && !G_AFTER_NOUN.test(w[j])) return false;
    }
  }
  return true;
}

export function glanceProblem(raw) {
  const text = sanitize(raw);
  const body = text.includes(DISCLAIMER) ? text.slice(0, text.indexOf(DISCLAIMER)) : text;
  for (const [k, v] of Object.entries(summaryRows(body))) {
    if (glanceFragment(v)) return `The "${SUMMARY_LABELS[k] ?? k}" line is a fragment, not a sentence: "${String(v).slice(0, 90)}"`;
    // 10/22 round: "Type: classifies you as a Manifestor who..." -- the label taken
    // for the subject. The page prints the value, a period, then the row.
    if (/^[a-z]/.test(String(v).trim())) return `The "${SUMMARY_LABELS[k] ?? k}" line does not begin a sentence (no capital letter): "${String(v).trim().slice(0, 90)}"`;
    if (glanceEcho(k, v)) return `The "${SUMMARY_LABELS[k] ?? k}" line only repeats its value ("${String(v).trim().slice(0, 90)}"); it says what that is like in an ordinary day.`;
  }
  return null;
}

/**
 * A GLANCE ROW THAT ONLY REPEATS ITS VALUE (10/23 live test 6, the PDF's page 2: "TYPE Projector. You move
 * through daily life as a Projector."). The page prints the chart's value, then the row; a row made only of
 * value words (any type, strategy, authority or profile line name) and filler says nothing the value did not.
 * The two track rows have their own check (trackEcho). Measured on every stored draft (1,479, 5,799 rows): 72
 * rows refused ("You operate as a Projector.", "Your inner authority is emotional.", "Your profile is the
 * 6/2.", a bare "Generator"), every one an echo; a row with one word of its own passes ("You decide through
 * your Ego Projected authority").
 */
const GLANCE_ECHO_WORDS = new Set(
  ("a an the and or but so of to in on at for with from into by as is are was were be been being it its this that " +
    "you your yours yourself who which when what how through daily life day days everyday move moves moving operate " +
    "operates operating live lives living exist exists function functions work works working navigate navigates world " +
    "type strategy authority profile inner human design designed chart energy energetic person someone one being role " +
    "mean means meaning line lines " +
    "generator generators manifesting manifestor manifestors projector projectors reflector reflectors " +
    "wait waiting waits respond responding response invitation invitations invited inform informing informs before " +
    "acting act lunar cycle month " +
    "emotional emotions solar plexus sacral splenic spleen ego manifested projected self-projected self mental heart " +
    "investigator hermit martyr opportunist heretic model").split(" "),
);
export function glanceEcho(key, row) {
  if (key === "Signature" || key === "Not-self") return false;
  const words = String(row ?? "").toLowerCase().replace(/[‘’]/g, "'").match(/[a-z][a-z'-]*/g) ?? [];
  return words.every((w) => GLANCE_ECHO_WORDS.has(w));
}

/**
 * KNOWN WORD SLIPS (10/21 live test, AI4), each found in a delivered reading:
 * "body graph" for bodygraph, gate numbers spelled out, "This mechanics",
 * "must ride out" (a command), and four odd phrasings. A named list: a new
 * slip is still a human read, and joins this list when found.
 */
const SLIPS = [
  /\bbody graph\b/i,
  /\bThis mechanics\b/,
  /\bpeople you happen to inhabit\b/i,
  /\bEntering your open\b/i,
  /\bmaterial manipulation\b/i,
  /\bdeeply vulnerable\b/i,
  /\bmust ride out\b/i,
  // An authority is not "defined" (centers are); 10/22 round, 2 drafts, both slips.
  /\bauthority\s+(?:is|are)\s+defined\b/i,
  // 10/22 verbatim read of the rig's stored readings (section D), each measured on
  // every stored draft with no false hit: a definition explained by its own name
  // ("Your Split definition means your defined centers are split", 7 drafts); one
  // stem said twice across a clause ("without needing bridges ... to bridge gaps",
  // 5; "bypassing the mind entirely. ... allows you to bypass", within three
  // sentences, 8).
  /\b(single|split|triple split|quadruple split)\s+definition\b[^.]*?\b(?:means|shows|tells you)\b[^.]*?\b(?:is|are|stay|stays|remain|remains)\s+(?:\w+\s+)?\1\b/i,
  /\bbridges?\b[^.!?]{0,160}\bto bridge\b/i,
  // The facts' strategy label pasted into a sentence (10/23): "your strategy of wait to respond",
  // "Because your strategy is wait to respond" -- 28 stored drafts, every one ungrammatical.
  /\bstrateg(?:y|ies)\s+(?:of|is)\s+(?:wait|inform)\b/i,
  // A try-this time phrase run into its moment (10/23): "The next time when greeting neighbors" -- 6 stored drafts,
  // every one a slip (2 delivered in v3s).
  /\bthe next time when\b/i,
  // A Reflector's empty facts read out as a label (10/23; the facts now say it in a sentence, chartFactsOnly):
  // "Your chart shows none", "None definition", "your defined centers are none", "(Defined centers: none)",
  // "your defined centers count is zero" -- 53 hits in 31 stored drafts, every one a Reflector's label.
  /\bnone\s+(?:definition|defined|cent(?:er|re)s?\s+defined)\b/i,
  /\b(?:definition|defined\s+cent(?:er|re)s?|chart|bodygraph)(?:\s+(?:list|section|state|value|field))?\s+(?:shows|has|have|contains|lists|reads|is|are|of)\s+none\b(?!\s+of)/i,
  /\bdefined\s+cent(?:er|re)s?:\s*none\b/i,
  /\bdefined\s+cent(?:er|re)s?\s+(?:list|section|count|field|value)\b/i,
  /\bbypass\w*\b[^.!?]*[.!?](?:\s+[^.!?]*[.!?])?\s+[^.!?]*\bbypass\w*\b/i,
  /\bgates? (?:one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty)\b/i,
];

export function slipProblem(raw) {
  let last = null;
  for (const [where, line] of writtenText(raw)) {
    // A slip across two sentences may run from a section's lede into its first paragraph.
    const text = last?.[0] === where ? `${last[1]} ${line}` : line;
    last = [where, line];
    for (const re of SLIPS) {
      const m = re.exec(text);
      if (m) return `The reading says "${m[0]}" in ${where}, a known slip: "${quoteAt(text, m.index, m[0].length)}"`;
    }
  }
  return null;
}

/**
 * US SPELLING (10/21 rig: a stored reading said "Defined Sacral centre"). The
 * house rule is US spelling everywhere, and nothing checked the model's words
 * for it. A named list, not an "-ise" pattern: advise, exercise, surprise and
 * promise are US words too. "analyses" (the plural noun) is US; "analyse" is not.
 */
const UK_WORDS = new RegExp(
  String.raw`\b(` +
    [
      String.raw`centre[sd]?`,
      String.raw`colour(?:s|ed|ful|ing)?`,
      String.raw`behaviour(?:s|al)?`,
      String.raw`favour(?:s|ed|ing|ite|ites|able)?`,
      String.raw`honour(?:s|ed|ing|able)?`,
      String.raw`neighbour(?:s|hood|ing)?`,
      String.raw`labour(?:s|ed|ing)?`,
      String.raw`endeavour(?:s|ed|ing)?`,
      String.raw`rumour(?:s|ed)?`,
      String.raw`savour(?:s|ed|ing)?`,
      String.raw`harbour(?:s|ed|ing)?`,
      String.raw`recognis(?:e|ed|es|ing|able)`,
      String.raw`realis(?:e|ed|es|ing|ation)`,
      String.raw`organis(?:e|ed|es|ing|ation)`,
      String.raw`emphasis(?:e|ed|es|ing)`,
      String.raw`prioritis(?:e|ed|es|ing)`,
      String.raw`minimis(?:e|ed|es|ing)`,
      String.raw`maximis(?:e|ed|es|ing)`,
      String.raw`energis(?:e|ed|es|ing)`,
      String.raw`harmonis(?:e|ed|es|ing)`,
      String.raw`criticis(?:e|ed|es|ing)`,
      String.raw`apologis(?:e|ed|es|ing)`,
      String.raw`sympathis(?:e|ed|es|ing)`,
      String.raw`analys(?:e|ed|ing)`,
      String.raw`practis(?:e|ed|es|ing)`,
      String.raw`programmes?`,
      String.raw`travell(?:ed|ing|er|ers)`,
      String.raw`cancell(?:ed|ing)`,
      String.raw`labell(?:ed|ing)`,
      String.raw`modell(?:ed|ing)`,
      String.raw`fulfil(?:s|ment)?`,
      "grey",
      "learnt",
      "spelt",
      "whilst",
      "amongst",
      "defence",
      "licence",
      // 10/23 v3s R25, delivered: "without proper acknowledgement" (1 stored draft, a slip).
      String.raw`acknowledgements?`,
      String.raw`judgements?`,
    ].join("|") +
    String.raw`)\b`,
  "i",
);

export function spellingProblem(raw) {
  for (const [where, text] of writtenText(raw)) {
    const m = UK_WORDS.exec(text);
    if (m) return `The reading spells "${m[1]}" the UK way in ${where}; the house spelling is US: "${quoteAt(text, m.index, m[0].length)}"`;
  }
  return null;
}

/**
 * THE TRY-THIS SHAPE (Jeremy 10/21, shape A: "The line specificity is way more
 * clear and a direct call to action with a future goal tied on... SO GOOD.").
 * All 56 stored try-this lines opened "Notice / Watch / Observe / Pay
 * attention" and none said when; the prompt's two sample openers were being
 * copied. Each takeaway now carries, in its one sentence: WHEN (a small,
 * ordinary moment), ONE thing to try ("you might ..."), what to NOTICE, and the
 * calm-practice tail (", so ... is familiar when ..."). The model writes it and
 * this checks it, as for every other rule. No two may begin the same way.
 *
 * TWO SENTENCES (Jeremy 10/22, editing the home-page line: "This sentence
 * division adds clarity and avoids a needlessly lengthy sentence. Should
 * express everywhere in try this sentencing."): "... you might <one action>.
 * Notice whether <what>, so <calm tail>." The first sentence ends after the
 * thing to try; the second opens "Notice" and carries the tail. A line in the
 * one-sentence form is refused. Like every rule here, only a NEW draft is
 * judged (gemini.mjs); readings already stored are never re-checked.
 */
const SOFT_OPENER = /^(notice|watch|observe|pay attention)\b/i;
// ", so the pause is familiar when ...", or as one approved line has it, ", which is practice for when ...".
const CALM_TAIL = /,\s*(?:so\b|which is practice\b|as practice\b)/i;
/**
 * THE FOUR ENDINGS VARY, AND EACH NAMES A REAL SITUATION (10/23). A size word is
 * Jeremy's own shape -- his locked tail is "so it is within reach when a
 * decision is heavier", his home-page line ends "when a heavier choice appears",
 * his approved lines "a bigger ask", "a bigger opening" -- so it is not refused.
 * What went wrong was monotony: 104 of 536 stored v2 endings were "when a
 * heavier moment arrives". So these are refused:
 *   - the same size word in two of a reading's four endings;
 *   - an ending whose size word sizes nothing real: "a heavier moment", "bigger
 *     moments", "when things get bigger", "the bigger version of this";
 *   - the v2 round's worn tails, each used 4+ times there, word for word.
 * And a line set in financial matters (10/22, "when financial commitments
 * arise", right above the disclaimer that this is not financial advice).
 * NARROWED 10/23, Jeremy on the GO PDF: "work and purchases are OK. PPL work and
 * buy stuff." Only the topics of financial advice are refused now: finances,
 * a budget (not "budget your energy"), debt, loans (not "loan a friend"),
 * taxes, a mortgage, investments, savings, bank accounts, credit cards,
 * interest rates, the stock market. Money itself, bills, expenses, salary,
 * prices, shopping, purchases, a desk, a meeting, a project at work: everyday
 * moments, and they pass. Measured on all 2,752 stored try-this lines: 41 of
 * the old rule's 43 lines stay refused (37 say "financial", 7 a budget, 3 both); the 2
 * that pass are household expenses ("when bigger expenses approach", "a
 * household expense"); 1 new hit, a real one ("when evaluating a major
 * investment", v3p R15, not delivered). Jeremy's approved lines: 0 hits. Work
 * words are in 653 stored lines, purchases in 161; no rule ever judged them.
 */
const TAIL_SIZE = /\b(?:bigger|biggest|larger|largest|heavier|heaviest|major|important|high[- ]stakes|higher[- ]stakes|weightier|significant|crucial|critical|big|large|heavy|greater)\b/gi;
const SIZE_WORD = "(?:bigger|biggest|larger|largest|heavier|heaviest|higher|major|important|high[- ]stakes|higher[- ]stakes|weightier|significant|crucial|critical|big|large|heavy|greater)";
const TAIL_BARE = new RegExp(
  `\\b${SIZE_WORD}\\s+(?:moments?|times?|situations?|occasions?|days?|ones?|things?|stuff|versions?|stakes)\\b` +
    `|\\b(?:things|it|life)\\s+(?:gets?|feels?|becomes?|grows?|turns?|is|are)\\s+(?:\\w+\\s+)?${SIZE_WORD}\\b` +
    `|\\bthe\\s+(?:stakes|pressure)\\s+(?:is|are|gets?|grows?|feels?)\\s+(?:\\w+\\s+)?${SIZE_WORD}\\b`,
  "i",
);
const TAIL_WORN = /\b(?:when|before|by the time)\s+(?:a heavier moment (?:arrives|arises)|the pressure is heavier|the stakes are heavier|the wave is high|larger commitments are on the table|decisions arise)\s*[.!?]?$/i;
const sizeKey = (w) => w.toLowerCase().replace(/\s+/g, "-");
/**
 * WHAT BECOMES FAMILIAR IS THE PRACTICE, NOT A CHART LABEL (10/25 batch: "clunky 'so the 6/2 profile is
 * familiar' wording", seen in the 10/24 live tests). The tail is Jeremy's own shape -- "so that instant
 * bodily trust is familiar when a heavier choice appears" -- and a practice in it is fine ("so consulting
 * your Lunar authority is familiar"). Refused: the thing made familiar is a bare label with no practice in
 * it -- "so Channel 10-20 is familiar", "so your 1/3 profile is familiar", "so your open Spleen center is
 * familiar". Measured on all 4,258 distinct stored try-this lines: 37 hits, every one this clunk; Jeremy's
 * approved lines: 0 (test/familiarLabel.test.mjs).
 */
const FAMILIAR_THING = /,\s*so (?:that )?(.+?) (?:is|are|feels|becomes) (?:more )?familiar\b/i;
const CHART_LABEL = /\b(?:profile|channel|cent(?:er|re)s?|gates?|authority|cross|definition|strategy|\d\/\d|\d line|line \d|\d-\d{1,2})\b/i;
export function familiarLabel(ending) {
  const m = FAMILIAR_THING.exec(String(ending ?? ""));
  if (!m) return null;
  const thing = m[1];
  // A practice ("consulting your authority", "trusting your gut") is what the tail is for.
  if (/\b\w+ing\b/i.test(thing)) return null;
  return CHART_LABEL.test(thing) ? thing : null;
}
export const FINANCE = new RegExp(
  String.raw`\b(?:financ(?:e|es|ial|ially)` +
    String.raw`|(?<!\b(?:energy|time|attention)\s)budget(?:s|ing|ed)?\b(?!\s+(?:of\s+|for\s+|your\s+|their\s+)?(?:energy|time|attention|effort)\b)` +
    String.raw`|debts?|loans?\b(?!\s+(?:a|an|the|your|them|him|her|me|us|it)\b)` +
    String.raw`|taxes|tax\s+(?:returns?|forms?|bills?|refunds?)` +
    String.raw`|mortgages?|investments?|invest(?:s|ed|ing)?\s+(?:money|savings|funds)` +
    String.raw`|savings|bank\s+(?:accounts?|balances?|statements?)|credit\s+(?:cards?|scores?)|interest\s+rates?|stock\s+market)\b`,
  "i",
);
const WHEN = /\b(the next time|next time|when|whenever|this week|this weekend|over the next|in the next|once or twice|as you|before you|after you|while|each time|every time|today|tomorrow|tonight)\b/i;
// A sentence ends at . ! or ? (and any closing quote or bracket) before a capital, or at the end.
const SENTENCE_END = /[.!?]["'”’)]*(?=\s+["'“‘(]?[A-Z]|\s*$)/g;
const NOTICE_OPENS = /[.!]["'”’)]*\s+Notice\b/;

export function takeawayProblem(raw) {
  const section = parseReading(raw).sections.find((s) => s.heading === TAKEAWAYS);
  // Every paragraph after the one that introduces them is a try-this line.
  const lines = (section?.paragraphs ?? []).slice(1);
  const starts = new Set();
  const sized = new Set();
  for (const line of lines) {
    const body = line.replace(/^\([^)]+\)\s*/, "");
    const say = (why) => `A takeaway ${why}: "${body.slice(0, 90)}${body.length > 90 ? "..." : ""}"`;
    if (body === line) return say(`does not begin with the chart feature it comes from, in parentheses`);
    // "([Strategy]) This week, ..." (10/22 round, 64 of 144 lines): a slot of the instructions, left in.
    if (/[[\]]/.test(line)) return say(`has square brackets in it, a slot left from the instructions ("${/^\([^)]*\)/.exec(line)?.[0] ?? line.slice(0, 30)}")`);
    if (/_/.test(line)) return say(`has a blank (_) in it, a slot left from the instructions ("${/^\([^)]*\)/.exec(line)?.[0] ?? line.slice(0, 30)}")`);
    if (SOFT_OPENER.test(body)) return say(`opens with "${SOFT_OPENER.exec(body)[1]}"; it begins with when, not with what to watch`);
    // "(Sacral), This week, ..." (10/22 round): the time phrase follows the tag directly.
    if (!/^["“]?[A-Z]/.test(body)) return say(`does not begin with its time phrase right after the (chart feature)`);
    const might = body.search(/\byou might\b/i);
    if (might < 0) return say(`has no "you might ..." (the one thing to try)`);
    if (!WHEN.test(body.slice(0, might))) return say(`does not say when, before the thing to try`);
    const notice = body.slice(might).search(/\bnotice\b/i);
    if (notice < 0) return say(`names nothing to notice`);
    const second = body.slice(might).search(NOTICE_OPENS);
    const ends = body.match(SENTENCE_END)?.length ?? 0;
    if (second < 0) {
      return say(
        ends < 2
          ? `is one sentence; the thing to try ends with a period and "Notice ..." opens a second sentence`
          : `does not open its second sentence with "Notice", after the thing to try`,
      );
    }
    if (ends < 2) return say(`does not end its second sentence with a period`);
    if (ends > 2) return say(`has ${ends} sentences, not two (the thing to try, then "Notice ...")`);
    if (!CALM_TAIL.test(body.slice(might + second))) return say(`has no ", so ... is familiar when ..." (why it starts small)`);
    // The four endings vary, and each names a real situation (10/23, above).
    const after = body.slice(might + second);
    const ending = after.slice(CALM_TAIL.exec(after).index);
    const bare = TAIL_BARE.exec(ending);
    if (bare) return say(`ends on "${bare[0]}", which names no real situation`);
    const worn = TAIL_WORN.exec(ending);
    if (worn) return say(`ends on a worn tail ("${worn[0].replace(/[.!?]$/, "").trim()}"); each ending names its own situation`);
    const label = familiarLabel(ending);
    if (label) return say(`makes a chart label familiar ("so ${label} is familiar"); what becomes familiar is the practice, as in "so pausing first is familiar"`);
    // Everyday moments, work and purchases included, never financial matters (10/22: "when
    // financial commitments arise", right above the disclaimer; narrowed 10/23, above).
    const money = FINANCE.exec(body);
    if (money) return say(`is set in financial matters ("${money[0]}"), the advice the page disclaims; everyday moments, work and purchases included, are fine`);
    const start = body.split(/\s+/).slice(0, 3).join(" ").toLowerCase();
    if (starts.has(start)) return say(`begins the same way as another ("${start}")`);
    starts.add(start);
    // Not the same size word in two of the four endings (10/23, above).
    const words = [...ending.matchAll(TAIL_SIZE)].map((m) => m[0]);
    const again = words.find((w) => sized.has(sizeKey(w)));
    if (again) return say(`ends on "${again}" again, as another ending does; the four end on four different situations`);
    for (const w of words) sized.add(sizeKey(w));
  }
  return null;
}

/**
 * A TRY-THIS TAG IS TRUE FOR THIS CHART (10/22 AI test round). Given sample
 * tags in its instructions, the model wrote them on charts that do not have
 * them: "(Defined Sacral center)" on a Manifestor, a Projector and a Reflector,
 * "(Profile 4/1)" on a 1/3, "(Channel 20-34)" on a chart with no channels,
 * "(Emotional authority)" on a Mental Projector -- 19 of 40 delivered lines in
 * one batch, every other check passing them. A tag that names a center's
 * state, the profile or a line, a channel, the authority or the type must
 * match the chart; a tag naming none of those ("Strategy") is not judged.
 */
const TAG_CENTER = { head: "Head", ajna: "Ajna", throat: "Throat", g: "G", heart: "Heart", ego: "Heart", sacral: "Sacral", spleen: "Spleen", splenic: "Spleen", "solar plexus": "Solar Plexus", emotional: "Solar Plexus", root: "Root" };
const TAG_STATE = /\b(defined|undefined|open)\s+(solar plexus|head|ajna|throat|g|heart|ego|sacral|spleen|splenic|emotional|root)\b/i;
const TAG_AUTHORITY = [
  ["Emotional", /\b(?:emotional|solar plexus)\b/i],
  ["Sacral", /\bsacral\b/i],
  ["Splenic", /\b(?:splenic|spleen)\b/i],
  ["Ego", /\b(?:ego|heart)\b/i],
  ["Self-Projected", /\bself[-\s]projected\b/i],
  ["Mental", /\b(?:mental|environmental|outer|sounding[-\s]board)\b/i],
  ["Lunar", /\b(?:lunar|moon)\b/i],
];
const TAG_TYPE = /\b(manifesting generator|generator|manifestor|projector|reflector)\b/i;
const TAG_AUTHORITY_ONLY = /^(?:your\s+)?(?:inner\s+)?authority$/i;

export function tagProblem(raw, output) {
  const section = parseReading(raw).sections.find((s) => s.heading === TAKEAWAYS);
  for (const line of (section?.paragraphs ?? []).slice(1)) {
    const tag = /^\(([^)]+)\)/.exec(line)?.[1];
    if (!tag) continue;
    const wrong = (why) => `A takeaway's (chart feature) is not this chart's: "(${tag})", ${why}`;
    const authority = /\bauthority\b/i.test(tag);
    const s = TAG_STATE.exec(tag);
    if (s && !authority) {
      const name = TAG_CENTER[s[2].toLowerCase()];
      const has = (list) => Array.isArray(list) && list.includes(name);
      const actual = has(output?.definedCenters) ? "defined" : has(output?.undefinedCenters) ? "undefined" : has(output?.openCenters) ? "open" : null;
      if (actual && actual !== s[1].toLowerCase()) return wrong(`but the ${name} center is ${actual} here`);
    }
    const profile = /^(\d)\/(\d)/.exec(String(output?.profile ?? ""));
    const p = /\b([1-6])\/([1-6])\b/.exec(tag);
    if (p && profile && `${p[1]}/${p[2]}` !== `${profile[1]}/${profile[2]}`) return wrong(`but the profile is ${profile[1]}/${profile[2]}`);
    const ln = /\bline\s+([1-6])\b/i.exec(tag);
    if (ln && !p && profile && ln[1] !== profile[1] && ln[1] !== profile[2]) return wrong(`but the profile is ${profile[1]}/${profile[2]}`);
    const ch = /\b(\d{1,2})\s*[-–]\s*(\d{1,2})\b/.exec(tag);
    if (ch && Array.isArray(output?.channels)) {
      const numbers = output.channels.map((c) => /^(\d+)-(\d+)/.exec(String(c))).filter(Boolean);
      if (!numbers.some((m) => (m[1] === ch[1] && m[2] === ch[2]) || (m[1] === ch[2] && m[2] === ch[1]))) {
        return wrong(numbers.length ? `but its channels are ${numbers.map((m) => m[0]).join(", ")}` : "but it has no channels");
      }
    }
    // 10/23 live test 6: a try-this line tagged "(Inner Authority)" while the reading says "Emotional authority"
    // (the facts' label, "Inner Authority: Emotional", copied). A tag that is only the word: 136 of 1,253 authority
    // tags in the stored drafts (100 "Inner Authority", 33 "Authority", 3 "Your Inner Authority"), every one unnamed.
    if (authority && output?.authority && TAG_AUTHORITY_ONLY.test(tag.split(",")[0].trim())) {
      return `A takeaway's (chart feature) says "(${tag})" without naming the authority; it names it as the reading does: "(${output.authority} authority)"`;
    }
    if (authority && output?.authority) {
      const named = TAG_AUTHORITY.find(([, re]) => re.test(tag));
      const own = TAG_AUTHORITY.find(([key]) => String(output.authority).startsWith(key));
      if (named && own && named[0] !== own[0]) return wrong(`but the authority is ${output.authority}`);
    }
    const t = TAG_TYPE.exec(tag);
    if (t && output?.type && !String(output.type).toLowerCase().includes(t[1].toLowerCase())) return wrong(`but the type is ${output.type}`);
  }
  return null;
}

/**
 * NO UNKNOWN BIRTH TIME ON A CHART WHOSE TIME IS KNOWN (10/22 AI test round).
 * Asked to mention an unknown birth time only when the facts say so, the model
 * wrote "Your birth time was not known, so your rising sign is omitted..." on 7
 * of 27 charts whose time WAS known -- often with an astrology word beside it
 * ("rising sign", "ascendant", "house placements"), none of which a Human
 * Design reading uses. Both are refused: the claim when `timeKnown` is not
 * false, the astrology words always.
 */
const TIME_CLAIM = /\b(?:birth time (?:was |is )?(?:not known|unknown|not recorded|missing|not given)|no birth time|without (?:a|an exact|the) birth time|lack of a (?:specific )?birth time)\b/i;
const ASTROLOGY = /\b(?:rising signs?|ascendants?|house placements?|astrological houses?|(?:first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|eleventh|twelfth) house)\b/i;

export function timeClaimProblem(raw, output) {
  for (const [where, text] of writtenText(raw)) {
    const a = ASTROLOGY.exec(text);
    if (a) return `The reading uses an astrology term, "${a[0]}", in ${where}: "${quoteAt(text, a.index, a[0].length)}"`;
    if (output?.timeKnown === false) continue;
    const m = TIME_CLAIM.exec(text);
    if (m) return `The reading says the birth time was not known, in ${where}, but this chart's birth time is known: "${quoteAt(text, m.index, m[0].length)}"`;
  }
  return null;
}

/**
 * WHAT AN UNKNOWN BIRTH TIME REALLY CHANGES (Jeremy 10/22: "I want to guard
 * against having so much info tied to the uncertainty that their
 * understanding gets muddied"). Since 10/22 the chart MEASURES its birth day
 * (engine /v1/spread, kept as the record's `timeSpread`): the page and the PDF
 * carry one line and tag only the values that change that day. The reading
 * says no more than that: the facts' NOTE lists those values, and
 * birthTimeProblem refuses a reading that calls any other value uncertain.
 * With no usable spread (an older record) the list is the engine's own
 * `provisional`, as the page shows it; with neither, Type, Authority and
 * Profile, the old note's three. The keys are the spread's own field names.
 */
const PROVISIONAL_FIELDS = ["type", "strategy", "authority", "profile", "definition", "signature", "notSelfTheme", "incarnationCross", "definedCenters", "undefinedCenters", "openCenters", "channels"];
export function provisionalValues(output) {
  if (output?.timeKnown !== false) return null;
  // The same spread the page and the PDF tag from (shared/timeSpread.mjs), so the NOTE and the tags never disagree.
  const s = usableSpread(output);
  const known = (list) => list.filter((f) => PROVISIONAL_FIELDS.includes(f));
  if (s && Array.isArray(s.changes)) return { measured: true, fields: known(s.changes) };
  if (Array.isArray(output.provisional)) return { measured: false, fields: known(output.provisional) };
  return { measured: false, fields: ["type", "authority", "profile"] };
}

/**
 * THE READING NEVER MENTIONS THE BIRTH TIME (10/23 word-for-word read, M2; a pick
 * made for measuring, not yet Jeremy's call). Asked to name every value the
 * birth day changes, every unknown-time reading of round rk-a3 carried a forced
 * sentence: "Your energy reflects the room because your Type, Strategy, Inner
 * Authority, Profile, Definition, on-track feeling, off-track feeling, center
 * states, and Channels are provisional since the birth time was not known."
 * The page already says it three ways: the time line, the bar and the
 * PROVISIONAL tags. So the NOTE now asks for silence, the same for every
 * unknown-time chart, and birthTimeProblem refuses any mention.
 */
export const BIRTH_TIME_NOTE =
  "NOTE: the birth time was not known. The page already shows, beside the chart, which values can change with it. " +
  "Do not mention the birth time anywhere in the reading, and never call any value provisional, uncertain or unconfirmed.";

export function birthTimeNote(output) {
  return provisionalValues(output) ? BIRTH_TIME_NOTE : null;
}

/**
 * The reading calling a value uncertain that the birth day does not change
 * ("Your Type and Authority cannot be confirmed without a birth time" on a
 * Projector whose Type and Authority hold all day). A claim is a strong word
 * (provisional, unconfirmed, tentative, cannot be confirmed) anywhere, or a
 * weaker one (uncertain, may change, might differ) in a sentence about the
 * birth time; the values it is about are the ones named in its clause and the
 * list leading into it ("Profile, Type and Authority cannot be confirmed").
 * A claim about the whole chart ("your exact chart configuration cannot be
 * confirmed") is the caveat the NOTE asks the reading not to add, and so is
 * any claim when nothing changes. Denied ("your Type is not provisional") is
 * not a claim. Then (10/23, M2, replacing "at most once, naming every measured
 * value"): the birth time is never mentioned at all, and nothing is called
 * "provisional" or "unconfirmed", the page's own tag -- the page shows the
 * time line, the bar and the tags. Only on an unknown-time chart; a known one
 * has timeClaimProblem.
 */
const UNSURE_STRONG = /\b(?:provisional(?:ly)?|unconfirmed|tentative(?:ly)?|(?:cannot|can['\u2019]t|could not|couldn['\u2019]t|can ?not)\s+(?:yet\s+)?be\s+(?:(?:fully|strictly|definitively|absolutely|completely|entirely|truly|reliably|precisely|exactly|accurately|firmly)\s+)?(?:confirmed|verified|certain|known|fixed|pinned down)|not\s+(?:yet\s+)?(?:be\s+)?(?:confirmed|verified))\b/gi;
const UNSURE_WEAK = /\b(?:uncertain(?:ty)?|not\s+(?:fully\s+|entirely\s+|completely\s+)?certain|(?:may|might|could|can|would)\s+(?:all\s+)?(?:change|shift|differ|vary|be different)|subject to change)\b/gi;
const BIRTH_TIME = /\bbirth[\s-]?(?:time|hour)\b|\btime of (?:your |their )?birth\b|\bnoon\b|\b(?:exact|precise) (?:time|hour|minute)\b/i;
const BIRTH_SAID = /\bbirth[\s-]?(?:time|hour)s?\b|\btime of (?:your |their )?birth\b|\b(?:cast|calculated|drawn|set|charted)\s+(?:at|for|from)\s+(?:a\s+)?(?:noon|midday)\b|\b(?:noon|midday)[- ](?:cast|calculated|based|chart|placeholder|placements?)\b|\bmoment of (?:your )?birth\b|\btime\s?stamp\b/i;
const VALUE_NAMED = [
  ["Type", ["type"], /\btypes?\b|\b(?:Manifesting Generator|Generator|Projector|Manifestor|Reflector)\b/i],
  ["Strategy", ["strategy"], /\bstrateg(?:y|ies)\b/i],
  ["Authority", ["authority"], /\bauthorit(?:y|ies)\b/i],
  ["Profile", ["profile"], /\bprofiles?\b/i],
  ["Definition", ["definition"], /\bdefinition\b/i],
  ["Incarnation Cross", ["incarnationCross"], /\b(?:incarnation\s+)?cross\b/i],
  ["center states", ["definedCenters", "undefinedCenters", "openCenters"], /\bcent(?:er|re)s?\b/i],
  ["Channels", ["channels"], /\bchannels?\b/i],
];
const WHOLE_CHART = /\b(?:chart|bodygraph|design|configuration|blueprint|map)\b/i;
const CLAUSE_CUT = /[,;:\u2014\u2013()]|\b(?:while|but|whereas|although|though)\b/gi;

export function birthTimeProblem(raw, output) {
  const p = provisionalValues(output);
  if (!p) return null;
  const why = p.measured ? "measured across the birth day it holds at any birth time" : "it is not one of the values that can change with the birth time";
  const prose = writtenText(raw).filter(([w]) => w !== "a takeaway's tag");
  for (const [where, text] of prose) {
    const weak = [...text.matchAll(UNSURE_WEAK)].filter((m) => BIRTH_TIME.test(sentenceAt(text, m.index)));
    for (const m of [...text.matchAll(UNSURE_STRONG), ...weak].sort((a, b) => a.index - b.index)) {
      if (negatedAt(text, m.index, m.index + m[0].length)) continue;
      const [from, to] = sentenceSpan(text, m.index);
      const sentence = text.slice(from, to);
      const at = m.index - from;
      // The claim's clause, and the list leading into it.
      const cuts = [0, ...[...sentence.matchAll(CLAUSE_CUT)].map((c) => c.index + c[0].length), sentence.length];
      let k = cuts.findIndex((c, i) => c <= at && at < (cuts[i + 1] ?? Infinity));
      let start = cuts[k];
      while (k > 0) {
        const prev = sentence.slice(cuts[k - 1], cuts[k]);
        if (prev.trim().split(/\s+/).length > 4 || !VALUE_NAMED.some(([, , re]) => re.test(prev))) break;
        start = cuts[--k];
      }
      const end = cuts.find((c) => c > at + m[0].length - 1) ?? sentence.length;
      const clause = sentence.slice(start, end);
      const named = VALUE_NAMED.filter(([, , re]) => re.test(clause));
      for (const [name, fields] of named) {
        if (fields.some((f) => p.fields.includes(f))) continue;
        return `The reading calls the ${name} uncertain in ${where}, but ${why}: "${quoteAt(text, m.index, m[0].length)}"`;
      }
      if (named.length || !BIRTH_TIME.test(sentence)) continue;
      if (!p.fields.length) {
        return `The reading calls the chart uncertain in ${where}, but measured across the birth day every value holds at any birth time: "${quoteAt(text, m.index, m[0].length)}"`;
      }
      if (WHOLE_CHART.test(clause)) {
        return `The reading calls the whole chart uncertain in ${where}; only the values the facts list can change with the birth time: "${quoteAt(text, m.index, m[0].length)}"`;
      }
    }
  }
  // 10/23 (M2): the page says it, so the reading never does -- no birth time, no "provisional", anywhere. A try-this
  // line's tag is the page's own label, as Jeremy approved it: "(Emotional authority, provisional) This week, ...".
  for (const [where, line] of prose) {
    const text = where === `"${TAKEAWAYS}"` ? line.replace(/^\([^)]*\)\s*/, "") : line;
    const first = [BIRTH_SAID.exec(text), PROVISIONAL_SAID.exec(text)].filter(Boolean).sort((a, b) => a.index - b.index)[0];
    if (!first) continue;
    const what = BIRTH_SAID.test(first[0]) ? "mentions the birth time" : `calls something "${first[0].toLowerCase()}"`;
    return `The reading ${what} in ${where}; the page already shows beside the chart which values can change with the birth time, so the reading never mentions it: "${quoteAt(text, first.index, first[0].length)}"`;
  }
  return null;
}
/** "provisional", "unconfirmed": the page's own tag, never the reading's word (10/23, M2). */
const PROVISIONAL_SAID = /\b(?:provisional(?:ly)?|unconfirmed)\b/i;

/**
 * The model's written text as writtenText gives it, minus the takeaways' tags
 * and the paragraph that introduces the try-this lines ("these are invitations
 * to test...", which the prompt asks every reading to say).
 */
function proseOf(raw) {
  let introSeen = false;
  return writtenText(raw).filter(([where]) => {
    if (where === "a takeaway's tag") return false;
    if (where === `"${TAKEAWAYS}"` && !introSeen) return !(introSeen = true);
    return true;
  });
}

/**
 * ANOTHER TYPE'S WORD, WHEREVER IT IS ABOUT THE READER (10/22 round; Jeremy's
 * strict invitation rule, decision K). The type checks look at the Strategy
 * line, How you decide and the on / off track content; the round delivered
 * the same words everywhere else: "your whole system relaxes into deep
 * satisfaction" (a Projector), "waiting for an external invitation to spark
 * into motion" (a Manifesting Generator), "meets the right outer invitations"
 * (a Generator), "an external cue invites your voice". Each type's own words
 * pass. Measured on every stored draft (345): kept only the forms with no
 * false hit --
 *   - an invitation waited for or received, for anyone but a Projector. Not a
 *     literal one (a casual invitation, one that arrives from a friend, the
 *     feelings about it), not the 2 line being called out (10/7), not a denial
 *     ("without needing to wait for an invitation", negatedAt);
 *   - waiting to respond (not a Generator's or Manifesting Generator's); informing
 *     before acting (not a Manifestor's or MG's); a lunar cycle (not a Reflector's);
 *   - satisfaction / frustration and their forms, about the reader, for anyone
 *     but a Generator or MG. Success, peace, surprise, anger and the rest stay
 *     with the on / off track checks: elsewhere they were plain English in every
 *     stored draft ("the element of surprise", "an instinct for success").
 */
const GEN_MG = ["Generator", "Manifesting Generator"];
const BORROWED = [
  {
    owners: ["Projector"],
    invitation: true,
    re: /\binvitations?\b|\b(?:an?|the|any|for)\s+invites?\b(?!\s+(?:you|your|yourself|them|people|others|us|him|her|it|a|an|the)\b)|\b(?:be|being|been|is|are|am|was|were|get|gets|getting|got|until|till|unless|once|when|you're|you’re)\s+invited\b|\binvit(?:es|ed|ing)\s+(?:your|you)\s+(?:voice|input|participation|physical participation|view|views|opinion|perspective|guidance|wisdom|energy|life force)\b/gi,
  },
  { owners: GEN_MG, re: /\bwait(?:s|ed|ing)?\s+(?:for\s+(?:something|life|the world)\s+)?to\s+respond\b/gi },
  { owners: ["Manifestor", "Manifesting Generator"], re: /\binform(?:s|ed|ing)?\s+(?:others|people|those\s+(?:around|affected|nearby|involved)|everyone|anyone|the people)\b[^.;]{0,40}?\b(?:before|first|ahead)\b/gi },
  { owners: ["Reflector"], re: /\b(?:lunar cycle|moon cycle|twenty-eight days|28 days)\b/gi },
  { owners: GEN_MG, feeling: true, re: /\bsatisf(?:action|ied|ying)\b/gi },
  { owners: GEN_MG, feeling: true, re: /\bfrustrat(?:ion|ions|ed|ing)\b/gi },
];
const INVITE_LITERAL_BEFORE = /\b(?:social|casual|dinner|party|weekend|coffee|lunch|minor|friendly|group|event|wedding|birthday|holiday|spontaneous|last-minute|new|friend's|neighbor's|accept(?:s|ing|ed)?|declin(?:e|es|ing|ed)|answer(?:s|ing)?|reply(?:ing)? to|respond(?:ing)? to|turn(?:ing)? down)\b[^.;,]{0,25}$/i;
const INVITE_LITERAL_AFTER = /^\s*(?:to\s+(?:a|an|the|join|dinner|lunch|coffee|go|meet|hang|gather|test|experiment|explore|try|notice|consider|reflect|observe|play|practice|check)\b|for\s+(?:you\s+to|coffee|lunch|dinner|drinks|a\s+walk|a\s+meal|testing|exploration|reflection)\b|(?:arrives?|lands?|comes?)\s+(?:for|from|via|in|by|through)\b)/i;
const INVITE_WAITED = /\b(?:wait(?:s|ed|ing)?\s+(?:for|until)|until|without|before)\b[^.;,]{0,40}$/i;
const INVITE_OFFERED = /\b(?:are|as|serve as|offered as|simply|merely|purely|gentle|open)\s+(?:\w+\s+)?$/i;
/** The 2 line's own idiom, on a chart with a 2 in its profile: "until an invitation calls you forth". */
const CALLED_OUT = /\b(?:calls?|called|calling|draws?|drew|drawing)\s+you\s+(?:out|forth)\b/i;
const ABOUT_OTHERS = /\b(?:people|others|other people's|they|their|them|someone|everyone|anyone|colleagues|friends|those|crowd|room)\b[^.;,]{0,30}$/i;

function sentenceSpan(text, at) {
  const from = Math.max(text.lastIndexOf(".", at - 1), text.lastIndexOf("!", at - 1), text.lastIndexOf("?", at - 1)) + 1;
  const ends = [".", "!", "?"].map((c) => text.indexOf(c, at)).filter((i) => i >= 0);
  return [from, ends.length ? Math.min(...ends) + 1 : text.length];
}
const sentenceAt = (text, at) => text.slice(...sentenceSpan(text, at)).trim();

export function borrowedWordProblem(raw, output) {
  const type = output?.type;
  if (!type) return null;
  const lineTwo = /^(?:2\/\d|\d\/2)\b/.test(String(output?.profile ?? ""));
  for (const [where, text] of proseOf(raw)) {
    for (const rule of BORROWED) {
      if (rule.owners.includes(type)) continue;
      for (const m of text.matchAll(rule.re)) {
        const before = text.slice(0, m.index);
        const after = text.slice(m.index + m[0].length);
        if (negatedAt(text, m.index, m.index + m[0].length, type)) continue;
        if (rule.invitation) {
          const sentence = sentenceAt(text, m.index);
          // The 2 line called out by the right invitation is the line, not the strategy (10/7).
          if (aboutLineTwo(text, m.index) || (lineTwo && CALLED_OUT.test(sentence))) continue;
          if (LINE_TWO.test(text) && !/\b(?:wait|until|without)\b/i.test(sentence)) continue;
          if (INVITE_OFFERED.test(before)) continue;
          const literal = INVITE_LITERAL_BEFORE.test(before) || INVITE_LITERAL_AFTER.test(after) || /\babout the\s+$/i.test(before);
          if (literal && !INVITE_WAITED.test(before)) continue;
        }
        if (rule.feeling && ABOUT_OTHERS.test(before)) continue;
        return `The reading gives a ${type} another type's word, "${m[0]}", in ${where}: "${quoteAt(text, m.index, m[0].length)}"`;
      }
    }
  }
  return null;
}

/**
 * IT ASKS, IT NEVER TELLS (10/22 round; Jeremy's voice rule): "you must" said
 * to the reader is refused anywhere in the prose ("offering quiet wisdom that
 * you must catch"), and "you have to / need to / should / ought to" at the head
 * of a clause ("You need to talk things over..."). Not when it is denied ("you
 * never need to rush"), not when it describes a pull ("making you feel as
 * though you must rush"), not "how / what you must", not a situation ("when you
 * need to reset"). On every stored draft: 26 hits, all telling the reader.
 */
const VOICE = /(?:^|[.!?:;,—–]\s*|\b(?:and|so|then|because|but|meaning|means)\s+)you\s+(must|have to|need to|should|ought to)\b|\byou\s+(must)\b/gi;
const VOICE_DENIED = /\b(?:not|never|no|nor|don't|do not|doesn't|does not|without|rather than|instead of|nothing)\b[^,.;:]*$/i;
const VOICE_DESCRIBED = /\b(?:feel|feels|felt|feeling|think|thinks|believe|believes)\s+(?:like|as if|as though|that)?\s*$|\b(?:how|what)\s+$/i;

export function voiceProblem(raw) {
  for (const [where, text] of proseOf(raw)) {
    for (const m of text.matchAll(VOICE)) {
      const at = m.index + m[0].toLowerCase().lastIndexOf("you");
      const before = text.slice(0, at);
      if (VOICE_DENIED.test(before) || VOICE_DESCRIBED.test(before)) continue;
      return `The reading tells the reader "you ${(m[1] ?? m[2]).toLowerCase()}" in ${where}; it asks, it never tells: "${quoteAt(text, at, 4 + (m[1] ?? m[2]).length)}"`;
    }
    // A rule set for the reader (10/22 verbatim read): "you can never rush into
    // commitments", "you are never designed to make spontaneous decisions". A
    // description passes ("you can never be pinned down", "you could never have
    // made it"). 4 drafts of all stored, every one a rule.
    const r = RULE_AT_READER.exec(text);
    if (r) return `The reading sets the reader a rule, "${r[0].trim().toLowerCase()}", in ${where}; it describes the design, it never rules: "${quoteAt(text, r.index, r[0].length)}"`;
  }
  return null;
}
const RULE_AT_READER = /\byou\s+(?:can|will|should|must)\s+never\s+(?!be\b|have\b)|\byou\s+(?:are|were)\s+(?:never|not)\s+(?:designed|meant|built|made|supposed|wired)\s+to\b/i;

/**
 * BROCHURE WORDS (10/23 word-for-word read, S9: "cosmic mirror for humanity", "fascinating tapestry",
 * "breathtaking objectivity and grace", "inexhaustible engine"). Only the words that are never right in
 * Jeremy's voice -- not in his library or website copy, not in his approved lines, and in every stored
 * draft only as decoration ("cosmic weather", "the cosmos"), or a claim no centre makes good
 * ("inexhaustible"). "unique", "ultimate", "profound", "magic(al)", "superpower" (his library says "a quiet
 * superpower") stay: the prompt asks for the plain word instead, and the checker does not refuse them.
 */
const BROCHURE = /\b(?:tapestr(?:y|ies)|cosmic|cosmos|breathtaking(?:ly)?|inexhaustibl[ey])\b/i;
export function brochureProblem(raw) {
  for (const [where, text] of writtenText(raw)) {
    if (where === "a takeaway's tag") continue;
    const m = BROCHURE.exec(text);
    if (m) return `The reading uses "${m[0]}" in ${where}, a brochure word; it says the plain thing instead: "${quoteAt(text, m.index, m[0].length)}"`;
  }
  return null;
}

/**
 * ONE WORD, OVER AND OVER (10/23 live test 6: "profound" three times in one reading). "profound" is not a
 * brochure word (it stays allowed once or twice); a third use in one reading is refused, quoting the third, so
 * the part it sits in is asked for again. Measured on every stored draft (1,479: the ai-facts corpus + the
 * Claude rounds): 26 drafts use it 3 or 4 times, every use read: decoration ("a profound sense of success",
 * "profound mysteries", "a profound sponge"); 119 use it twice (allowed). Never in the library's own copy.
 */
const REPEATED = [/\bprofound(?:ly|ity)?\b/gi];
export const REPEAT_MAX = 2;
export function repeatWordProblem(raw) {
  for (const re of REPEATED) {
    let n = 0;
    for (const [where, text] of writtenText(raw)) {
      if (where === "a takeaway's tag") continue;
      for (const m of text.matchAll(re)) {
        if (++n <= REPEAT_MAX) continue;
        return `The reading uses "${m[0]}" a third time in ${where}; twice in one reading is enough, so this one says the plain thing instead: "${quoteAt(text, m.index, m[0].length)}"`;
      }
    }
  }
  return null;
}

/**
 * A FEELING WORD OR "STRATEGY" CAPITALIZED MID-SENTENCE (10/22 verbatim read:
 * "deep Satisfaction ... heavy Frustration", "your Strategy of waiting"). The
 * page writes them lower case in a sentence. A list of the chart's names
 * ("your Type, Strategy, and Authority") passes. 31 drafts of all stored, no
 * false hit.
 */
const THEME_CAP = /\b([A-Za-z][A-Za-z'-]*)(,?)\s+(Satisfaction|Satisfied|Frustration|Frustrated|Success|Successful|Bitterness|Bitter|Peace|Peaceful|Anger|Angry|Surprise|Surprised|Disappointment|Disappointed|Strategy|Strategies)\b/g;
export function themeCapProblem(raw) {
  for (const [where, text] of proseOf(raw)) {
    // A try-this line's "(Your Strategy)" is its tag, a label: title case is right there.
    const tag = where === `"${TAKEAWAYS}"` ? (/^\([^)]*\)/.exec(text)?.[0].length ?? 0) : 0;
    for (const m of text.matchAll(THEME_CAP)) {
      if (m.index < tag) continue;
      if (m[2] === "," && /^[A-Z]/.test(m[1])) continue;
      const at = m.index + m[0].length - m[3].length;
      return `The reading capitalizes "${m[3]}" mid-sentence in ${where}; in a sentence it is lower case: "${quoteAt(text, at, m[3].length)}"`;
    }
  }
  return null;
}

/**
 * THE ADVICE LIST IN THE DISCLAIMER'S ORDER (10/22 verbatim read: "medical,
 * legal, financial, or psychological" written by the model beside the page's
 * "medical, psychological, legal or financial"). Where the model names three
 * or more of the kinds, in any paragraph, they come in the disclaimer's order.
 * 34 drafts of all stored, every one the prompt's old order.
 */
const ADVICE_KINDS = ["medical", "psychological", "legal", "financial"];
const ADVICE_LIST = /\b(?:medical|psychological|legal|financial)\b(?:[\s,]+(?:or\s+|and\s+)?\b(?:medical|psychological|legal|financial)\b){2,}/gi;
export function adviceOrderProblem(raw) {
  for (const [where, text] of writtenText(raw)) {
    if (where === "a takeaway's tag") continue;
    for (const m of text.matchAll(ADVICE_LIST)) {
      const said = m[0].toLowerCase().match(/medical|psychological|legal|financial/g);
      if (said.join() === ADVICE_KINDS.filter((k) => said.includes(k)).join()) continue;
      return `The reading lists the kinds of advice in its own order in ${where}; the disclaimer says "medical, psychological, legal or financial": "${quoteAt(text, m.index, m[0].length)}"`;
    }
  }
  return null;
}

/**
 * A WORD SAID TWICE (10/22 round): "a resilient resilience", "your survival
 * and behavioral survival", "a competitive spirit and resilient spirit". Two
 * shapes, both measured on every stored draft with no false hit (14 hits,
 * every one a slip): two forms of one stem side by side or one word apart with
 * no punctuation between; a noun, "and" / "or", one word, the same noun.
 * Parallel lists ("mental questions, mental pressure") and the chart's own
 * words (center, defined, channel...) are not judged.
 */
const DOUBLE_STOP = /^(?:the|a|an|and|or|of|to|in|on|at|for|with|your|you|yours|this|that|these|those|is|are|was|were|be|been|being|as|it|its|by|from|into|onto|over|under|than|then|so|not|no|nor|but|if|when|while|which|who|whom|whose|what|where|how|all|any|each|every|both|more|most|less|least|very|just|only|also|even|still)$/;
const DOUBLE_HD = /^(?:center|centers|defined|undefined|open|gate|gates|channel|channels|line|lines|profile|authority|strategy|sacral|spleen|splenic|throat|heart|ajna|head|root|solar|plexus|emotional|energy|design|type|cross|angle|right|left|wave|waves|body|bodygraph|inner|outer|projector|projectors|generator|generators|manifestor|manifestors|reflector|reflectors)$/;
const DOUBLE_NUMBER = /^(?:twenty|thirty|forty|fifty|sixty)/;
const DOUBLED_PAIR = /\b([a-z]{5,})\s+(?:and|or)\s+([a-z]{3,})\s+\1\b/gi;
const DOUBLE_PARTICLE = /^(?:off|on|out|up|down|in|not|no|non|over|under|back|away)$/i;
/** Contrasting modifiers are a pair, not a slip: "high points and low points" (10/23 round). */
const DOUBLE_OPPOSITE = new Set(["high low", "low high", "good bad", "bad good", "inner outer", "outer inner", "conscious unconscious", "unconscious conscious", "big small", "small big", "early late", "late early", "light dark", "dark light", "old new", "new old", "best worst", "worst best"]);
/**
 * THE SAME WORD TWICE IN A ROW (10/23, read in a delivered v3s reading: "talking things out with trusted trusted
 * environments"; tags "(Profile Profile 6/2)", "(Channel Channel 16-48)", "(Sacral center center)"). Measured on
 * every stored draft (537): 15 hits, 14 slips, every slip a word of five letters or more; the one that is
 * English ("tell you you have done enough") is shorter, as "that that" and "had had" are, so short words pass.
 */
const DOUBLE_SAME = /\b([A-Za-z]{5,})\s+\1\b/gi;

export function doubledWordProblem(raw) {
  const say = (where, text, at, len) => `The reading says a word twice in ${where}, a slip: "${quoteAt(text, at, len)}"`;
  for (const [where, text] of proseOf(raw)) {
    for (const m of text.matchAll(DOUBLE_SAME)) return say(where, text, m.index, m[0].length);
    for (const m of text.matchAll(DOUBLED_PAIR)) {
      const w = m[1].toLowerCase();
      // "whether you are on track or off track" (10/23 round): the middle word is a particle, not a second modifier.
      if (m[2].toLowerCase() === w || DOUBLE_STOP.test(w) || DOUBLE_HD.test(w) || DOUBLE_PARTICLE.test(m[2])) continue;
      const before = /([A-Za-z]+)\s+$/.exec(text.slice(0, m.index))?.[1]?.toLowerCase();
      if (before && DOUBLE_OPPOSITE.has(`${before} ${m[2].toLowerCase()}`)) continue;
      return say(where, text, m.index, m[0].length);
    }
    const words = [...text.matchAll(/[A-Za-z][A-Za-z'-]*/g)];
    for (let i = 0; i < words.length; i++) {
      const a = words[i][0].toLowerCase();
      if (a.length < 7 || DOUBLE_STOP.test(a) || DOUBLE_HD.test(a) || DOUBLE_NUMBER.test(a)) continue;
      for (let j = i + 1; j <= i + 2 && j < words.length; j++) {
        const b = words[j][0].toLowerCase();
        if (b.length < 7 || a === b || DOUBLE_HD.test(b) || a.slice(0, 7) !== b.slice(0, 7)) continue;
        const span = text.slice(words[i].index, words[j].index + b.length);
        if (/[^A-Za-z'\s-]/.test(span)) continue;
        // Two forms joined by and / or are a pairing, not a slip: "mental concepts and conceptual frameworks" (10/23).
        if (j === i + 2 && /^(?:and|or)$/i.test(words[i + 1][0])) continue;
        return say(where, text, words[i].index, span.length);
      }
    }
  }
  return null;
}

/**
 * A NEAR MISS OF A FEELING WORD (10/22 round: "Biterness"), through the
 * near-miss machinery (lettersApart): a word within two letters of
 * satisfaction, frustration, bitterness or disappointment (and their forms)
 * that is not one of them. Measured on every stored draft: 1 hit, that one.
 */
const THEME_WORDS = ["satisfaction", "frustration", "bitterness", "disappointment", "frustrated", "disappointed", "satisfying", "frustrating", "disappointing"];
const THEME_KNOWN = new Set([...THEME_WORDS, "satisfactions", "frustrations", "disappointments", "satisfied", "bitterly", "frustrates", "frustrate", "satisfies", "satisfy", "disappoints", "disappoint", "embittered"]);

export function themeSpellingProblem(raw) {
  for (const [where, text] of proseOf(raw)) {
    for (const m of text.matchAll(/[A-Za-z]{8,}/g)) {
      const w = m[0].toLowerCase();
      if (THEME_KNOWN.has(w)) continue;
      const near = THEME_WORDS.find((t) => w[0] === t[0] && Math.abs(t.length - w.length) <= 2 && lettersApart(w, t) <= 2);
      if (near) return `The reading spells "${m[0]}" in ${where}, a near miss of "${near}": "${quoteAt(text, m.index, m[0].length)}"`;
    }
  }
  return null;
}

/**
 * EVERY CHECK THAT RUNS AFTER firstProblem ON A NEW DRAFT (gemini.mjs; the
 * phone's Reading.draftProblem is the same chain), in order. The copy check
 * follows it there, because only gemini.mjs knows the prompt.
 */
export function draftProblem(raw, output) {
  return (
    tagProblem(raw, output) ??
    timeClaimProblem(raw, output) ??
    birthTimeProblem(raw, output) ??
    borrowedWordProblem(raw, output) ??
    connectionProblem(raw, output) ??
    motorProblem(raw, output) ??
    splitBridgeProblem(raw, output) ??
    voiceProblem(raw) ??
    brochureProblem(raw) ??
    repeatWordProblem(raw) ??
    doubledWordProblem(raw) ??
    themeSpellingProblem(raw) ??
    themeCapProblem(raw) ??
    adviceOrderProblem(raw)
  );
}

/**
 * EVERY CHECK BY NAME, in the order production runs them (10/23, re-asking
 * only the failing part): firstProblem's chain after its four opening checks,
 * then draftProblem's, then the copy check. `allProblems` runs them all, so a
 * refused draft shows EVERY problem it has, not only the first; its first entry
 * is always the verdict production gives (firstProblem ?? draftProblem ??
 * copyProblem). Each entry can be run again on its own (reask.mjs does, to see
 * which slot a refusal rests on).
 */
export const CHECKS = [
  ["structure", (t) => structureProblem(t)],
  ["type", (t, o) => typeProblem(t, o?.type ?? null, o?.undefinedCenters ?? null, o?.openCenters ?? null)],
  ["profileLine", (t, o) => profileLineProblem(t, o?.profile ?? null)],
  ["profileOrdinal", (t) => profileOrdinalProblem(t)],
  ["openCentre", (t, o) => openCentreProblem(t, o?.openCenters ?? null, o?.undefinedCenters ?? null)],
  ["centreState", (t, o) => centreStateProblem(t, o?.definedCenters ?? null, o?.undefinedCenters ?? null, o?.openCenters ?? null)],
  ["oldWord", (t) => oldWordProblem(t)],
  ["trackRow", (t) => trackRowProblem(t)],
  ["nearMiss", (t, o) => nearMissProblem(t, o?.type ?? null)],
  ["spelling", (t) => spellingProblem(t)],
  ["glance", (t) => glanceProblem(t)],
  ["slip", (t) => slipProblem(t)],
  ["takeaway", (t) => takeawayProblem(t)],
  ["tag", (t, o) => tagProblem(t, o)],
  ["timeClaim", (t, o) => timeClaimProblem(t, o)],
  ["birthTime", (t, o) => birthTimeProblem(t, o)],
  ["borrowedWord", (t, o) => borrowedWordProblem(t, o)],
  ["connection", (t, o) => connectionProblem(t, o)],
  ["motor", (t, o) => motorProblem(t, o)],
  ["splitBridge", (t, o) => splitBridgeProblem(t, o)],
  ["voice", (t) => voiceProblem(t)],
  ["brochure", (t) => brochureProblem(t)],
  ["repeatWord", (t) => repeatWordProblem(t)],
  ["doubledWord", (t) => doubledWordProblem(t)],
  ["themeSpelling", (t) => themeSpellingProblem(t)],
  ["themeCap", (t) => themeCapProblem(t)],
  ["adviceOrder", (t) => adviceOrderProblem(t)],
  ["copy", (t, o, c) => copyProblem(t, c?.sources ?? [], c?.allowed ?? [])],
];

/**
 * Every problem of a draft, as [{ rule, message }], the production verdict
 * first. `copy` = { sources, allowed }, as gemini.mjs hands copyProblem. The
 * four opening checks are firstProblem's: marks, the disclaimer (without it
 * nothing else is judged), a closing question, too short.
 */
export function allProblems(raw, output, copy = {}) {
  const t = String(raw ?? "");
  const out = [];
  const marks = formattingProblem(t);
  if (marks) out.push({ rule: "formatting", message: marks });
  if (!t.includes(DISCLAIMER)) {
    out.push({ rule: "disclaimer", message: "The reading came back without the required disclaimer." });
    return out;
  }
  const body = t.slice(0, t.indexOf(DISCLAIMER)).trim();
  if (body.slice(-400).includes("?")) out.push({ rule: "question", message: "The reading ended by asking the client a question." });
  if (body.split(/\s+/).filter(Boolean).length < 380) out.push({ rule: "tooShort", message: "The reading came back too short to hand over." });
  for (const [rule, check] of CHECKS) {
    const message = check(t, output, copy);
    if (message) out.push({ rule, message });
  }
  return out;
}

/** One named check again, on another text (reask.mjs). Null for the four opening checks. */
export function checkByName(rule) {
  return CHECKS.find(([name]) => name === rule)?.[1] ?? null;
}

/**
 * NOTHING COPIED FROM THE INSTRUCTIONS (10/22 AI test round). 12 of 34
 * delivered readings carried words lifted whole from what the model was
 * handed: the form note's old example try-this line (11 lines), the prompt's
 * try-this placeholders written out as they stood, its Type-row example (7 of
 * 14 Generator readings) and its 6-line example. A run of COPY_RUN words or
 * more found word for word in the prompt or in a form note is refused.
 *
 * Fixed vocabulary is not a copy: a run also found in `allowed` (gemini.mjs
 * passes the chart facts it sent: the cross's name, the centers, the channel
 * lines) or in what the page prints itself (headings, labels, the disclaimer)
 * passes. Words are compared in lower case; punctuation and line breaks do not
 * count. Only what the model wrote is judged, and only on a new draft.
 */
export const COPY_RUN = 8;
const copyWords = (s) =>
  String(s ?? "").toLowerCase().replace(/[‘’]/g, "'").replace(/[^a-z0-9']+/g, " ").split(" ").filter(Boolean);
function copyRuns(texts) {
  const runs = new Set();
  for (const t of texts) {
    const w = copyWords(t);
    for (let i = 0; i + COPY_RUN <= w.length; i++) runs.add(w.slice(i, i + COPY_RUN).join(" "));
  }
  return runs;
}

export function copyProblem(raw, sources = [], allowed = []) {
  const from = copyRuns(sources);
  if (!from.size) return null;
  const ours = copyRuns([...allowed, ...HEADINGS, ...Object.values(SUMMARY_LABELS), SUMMARY_MARKER, DISCLAIMER]);
  for (const [where, text] of writtenText(raw)) {
    if (where === "a takeaway's tag") continue;
    // A try-this line is judged without its "(chart feature)": the tag is the
    // chart's own vocabulary, and with the opener the prompt asks for it made
    // "(Undefined Root center) The next time you feel" look copied (10/22).
    const w = copyWords(where === `"${TAKEAWAYS}"` ? text.replace(/^\([^)]*\)\s*/, "") : text);
    for (let i = 0; i + COPY_RUN <= w.length; i++) {
      const run = w.slice(i, i + COPY_RUN).join(" ");
      if (!from.has(run) || ours.has(run)) continue;
      let j = i + COPY_RUN;
      while (j < w.length && from.has(w.slice(j - COPY_RUN + 1, j + 1).join(" "))) j++;
      const words = w.slice(i, j).join(" ");
      return `The reading copies ${j - i} words in a row from its instructions, in ${where}: "${words.length > 120 ? words.slice(0, 117) + "..." : words}"`;
    }
  }
  return null;
}

/**
 * AN ON / OFF TRACK ROW IS A SENTENCE, NOT A WORD (Jeremy 10/17, option A: "A
 * is best. This feels best to reader. They understand why they might feel
 * satisfaction.").
 *
 * Shop reading ed6b8caf (10/17) came back with "When it's on track:
 * Satisfaction" and "When it's off track: Frustration" -- the chart's word and
 * nothing else -- and the page and PDF printed "The feeling is satisfaction.
 * Satisfaction". Every other check passed it. A row under 5 words is now
 * REFUSED, never trimmed or rewritten, and the draft is asked for again.
 *
 * WHY 5. Measured 10/17 on every stored shop reading (28 written, 56 rows):
 * the two bare words above, nothing of 2-4 words, and the shortest healthy row
 * is 11 words. A word is any run with a letter or digit in it, so a lone "."
 * or dash does not count.
 *
 * Both paths reach this: the form's rows are printed by structured.mjs as
 * "When it's on track: <slot>", and the letter writes the line itself. Old
 * stored readings are not affected -- like the other checks, this runs only
 * on a new draft.
 */
export const TRACK_ROW_MIN_WORDS = 5;

export function trackRowProblem(raw) {
  const rows = summaryRows(raw);
  for (const key of Object.keys(SUMMARY_LABELS)) {
    const text = rows[key];
    if (text === undefined) continue;
    const n = text.split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w)).length;
    if (n < TRACK_ROW_MIN_WORDS) {
      return `The reading's "${SUMMARY_LABELS[key]}" line came back as ${n} word${n === 1 ? "" : "s"} ("${text}"), not a sentence.`;
    }
    if (trackEcho(text)) {
      return `The reading's "${SUMMARY_LABELS[key]}" line only repeats its label and its feeling ("${text}"); it says what the feeling is like in an ordinary day.`;
    }
  }
  return null;
}

/**
 * A TRACK ROW THAT ONLY REPEATS ITS LABEL (10/23 word-for-word read, S9): "Surprise meets you when things are
 * on track.", "Bitterness arises when you are off track.", "You experience success when your design is on
 * track." -- five words or more, and nothing in them but the label, the feeling and a linking verb. A row that
 * names the track and nothing else of the reader's day is refused; one with anything of its own passes
 * ("You feel success when recognition arrives", "...when your work matches what your gut said yes to").
 * Measured on every stored draft (1,217, 2,376 rows): 29 rows refused (in 23 drafts), every one an echo.
 */
const TRACK_PHRASE = /\b(?:on|off)[-\s]track\b/i;
const TRACK_FEELING = /^(?:satisf|frustrat|peace|ang(?:er|ry|rier|riest|rily)$|success|bitter|surpris|disappoint)/;
const TRACK_ECHO_WORDS = new Set(
  ("a an the and or but so of to in on at for with from into by as is are was were be been being it its it's this that these " +
    "those you your yours yourself when whenever while once if things thing everything something life track tracks off feel " +
    "feels felt feeling feelings sense senses experience experiences notice notices meet meets greet greets arrive arrives " +
    "come comes appear appears arise arises show shows emerge emerges surface surfaces reveal reveals signal signals mark " +
    "marks tell tells set sets settle settles fill fills there here state design path energy system").split(" "),
);
export function trackEcho(row) {
  const t = String(row ?? "");
  if (!TRACK_PHRASE.test(t)) return false;
  const words = t.toLowerCase().replace(/[‘’]/g, "'").match(/[a-z']+/g) ?? [];
  return words.every((w) => TRACK_ECHO_WORDS.has(w) || TRACK_FEELING.test(w));
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
 * NEAR MISSES (10/21 live test, bugs 9 and 15; Jeremy's pick 9A). Two slips got
 * past the exact-word checks: a phone reading printed "Because your not-sf
 * feeling is frustration" (a garbled "not-self"), and a Projector reading said
 * "your energy becomes depleted and frustrated" (a Generator's word, in a form
 * those checks do not know). So the words already banned are matched loosely:
 * a "not-" word within two letters of "self", and any form of another type's
 * word ("frustrated", "bitterly") where the reader is said to feel it, in the
 * on / off track content -- the same places the checks look. Run on the 16
 * readings on file it refused the three real slips and no good reading. The
 * same goes for "signature", already banned there: "signiture", "signture"
 * (the 10/21 rig's probe of this checker) are refused with it.
 */
const FEELING_FORMS = {
  Peace: String.raw`peace\w*`,
  Anger: String.raw`ang(?:er\w*|ry|rier|riest|rily)`,
  Satisfaction: String.raw`satisf\w*`,
  Frustration: String.raw`frustrat\w*`,
  // "successfully" is a manner, never the feeling (10/23 round: "your clear communications successfully remove friction").
  Success: String.raw`success(?!fully)\w*`,
  Bitterness: String.raw`bitter\w*`,
  Surprise: String.raw`surpris\w*`,
  Disappointment: String.raw`disappoint\w*`,
};
/** "not-" words that are plain English. */
const NOT_WORDS_OK = new Set(["so", "yet", "too", "for", "quite", "very", "just", "only", "now", "all", "always", "knowing", "doing"]);
const NOT_HYPHEN = /\bnot[-‐‑]([a-z]{1,12})\b/gi;
/** Letters added, dropped, changed or swapped (optimal string alignment). */
function lettersApart(a, b) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
    }
  return d[a.length][b.length];
}
const quoteAt = (text, i, len) =>
  `${i > 50 ? "..." : ""}${text.slice(Math.max(0, i - 50), i + len + 40).trim()}...`;
/** "your energy becomes depleted and frustrated", "you feel bitter": the reader is said to have it. */
const FELT_BEFORE = String.raw`\b(?:(?:your|this|that)\s+(?:[a-z'’-]+\s+){0,2}?|(?:feel|feels|felt|feeling|become|becomes|became|becoming|get|gets|got|getting|grow|grows|grew|growing|turn|turns|turned|turning|leave|leaves|leaving|burn|burns|burned|burning|experience|experiences|experienced|experiencing|sense|senses|sensing|fill|fills|filled)\s+(?:you\s+)?(?:[a-z'’-]+\s+){0,3}?)`;

export function nearMissProblem(raw, type) {
  const own = TYPE_WORDS[type] ?? null;
  for (const [where, text, onTrack] of writtenText(raw)) {
    for (const m of text.matchAll(NOT_HYPHEN)) {
      const w = m[1].toLowerCase();
      // The exact word is oldWordProblem's already; this is for the misspellings.
      if (NOT_WORDS_OK.has(w) || w === "self" || w === "selves") continue;
      if (lettersApart(w, "self") <= 2)
        return `The reading says "${m[0]}" in ${where} -- a misspelled "not-self": "${quoteAt(text, m.index, m[0].length)}"`;
    }
    if (!onTrack) continue;
    for (const m of text.matchAll(/\bsig\p{L}{4,9}\b/giu)) {
      const w = m[0].toLowerCase();
      // The exact word (and its plural) is oldWordProblem's already.
      if (w !== "signature" && w !== "signatures" && lettersApart(w, "signature") <= 2)
        return `The reading says "${m[0]}" in ${where} -- a misspelled "signature", where readers see "when it's on track": "${quoteAt(text, m.index, m[0].length)}"`;
    }
    if (!own) continue;
    for (const [word, form] of Object.entries(FEELING_FORMS)) {
      if (word === own.signature || word === own.notSelf) continue;
      const m = new RegExp(`${FELT_BEFORE}(${form})\\b`, "i").exec(text);
      if (m)
        return `The reading gives a ${type} "${m[1]}" in ${where}, a form of another type's word ${word} (theirs are ${own.signature} and ${own.notSelf}): "${quoteAt(text, m.index, m[0].length)}"`;
    }
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
/**
 * "YOUR FIRST PROFILE LINE" UNDER "LINE 3" (live phone reading, Projector 3/5,
 * 10/7; 1 of 19 that night). The model meant the first of the two digits;
 * a reader takes "first line" as Line 1. In the profile-line rows only, an
 * ordinal that names a line ("first line", "second profile line", "third
 * line profile") must equal the row's own number. Ordinals that do not name a
 * line ("the first time") are not judged, nor is "the first line of defence".
 * Refused, never rewritten.
 */
const ORDINALS = { first: 1, second: 2, third: 3, fourth: 4, fifth: 5, sixth: 6, "1st": 1, "2nd": 2, "3rd": 3, "4th": 4, "5th": 5, "6th": 6, 1: 1, 2: 2, 3: 3, 4: 4, 5: 5, 6: 6 };
// "line of defence" is an idiom; "line of your profile" is the claim (a 10/7 draft).
const ORDINAL_LINE =
  /\b(first|second|third|fourth|fifth|sixth|1st|2nd|3rd|4th|5th|6th|(?<![\/\d])[1-6](?![\/\d]))(?:\s+|-)(?:[a-z-]+\s+){0,2}?line\b(?!\s+of\s+(?!(?:your|the|this)\s+profile\b))/gi;
const ORDINAL_NAME = ["", "first", "second", "third", "fourth", "fifth", "sixth"];
// "the 6 line" under Line 4 (a 10/7 Manifestor 2/4 draft, after the slot note
// asked for numbers): a digit naming another line is the same error.
const LINE_DIGIT = /\bline\s+([1-6])\b(?![\/\d])/gi;
/**
 * A SENTENCE THAT ALSO NAMES THE RIGHT LINE IS NOT MISLEADING. Swept against
 * the stored readings and 42 live drafts before it went in: "Your first
 * profile line is the third line, which..." and "Your second profile line is
 * the martyr, learning through trial..." say which line they mean (the first
 * of the two digits), so they pass. "Your first profile line brings a
 * trial-and-error nature" under Line 3 names nothing else, and is refused.
 */
function namesItsOwnLine(sentence, n, name) {
  const alts = [String.raw`line\s+${n}`, String.raw`${ORDINAL_NAME[n]}(?:\s+|-)(?:[a-z-]+\s+){0,2}?line`];
  if (name) alts.push(name);
  return new RegExp(String.raw`\b(?:${alts.join("|")})\b`, "i").test(sentence);
}
export function profileOrdinalProblem(raw) {
  const lines = sanitize(raw).split("\n").map((l) => l.trim());
  const at = lines.indexOf("Your profile lines");
  if (at < 0) return null;
  for (const l of lines.slice(at + 1)) {
    if (HEADINGS.includes(OLD_HEADINGS[l] ?? l)) break;
    const row = /^Line\s+(\d)\b\s*(?:\(([^)]*)\))?[^:]*:\s*(.*)$/i.exec(l);
    if (!row) continue;
    const n = Number(row[1]);
    const name = (row[2] ?? "").replace(/[^A-Za-z ]/g, "").trim();
    for (const m of [...row[3].matchAll(ORDINAL_LINE), ...row[3].matchAll(LINE_DIGIT)]) {
      const said = ORDINALS[m[1].toLowerCase()];
      if (said === n || namesItsOwnLine(row[3], n, name)) continue;
      return `The reading calls Line ${row[1]} "${m[0]}", which a reader takes as Line ${said}.`;
    }
  }
  return null;
}

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
 *
 * PAST "YOUR", "THIS", "THAT" TOO (live shop test #2, 10/7). A Manifestor's line
 * read "When it's off track: Your frustration flares into sharp friction..." --
 * the lead word was "Your", so the Generator's word, the claim itself, passed.
 * And within the two lines only, another type's word the reader is said to
 * HAVE is a claim wherever it sits: "your frustration", "your sense of
 * frustration". Swept against 72 stored readings and 42 live drafts before it
 * went in: it refused only true errors (this one, and a 10/7 Manifestor draft
 * "Your frustration flares hot and sharp..."); the 9/9 in-passing sentences
 * above still pass.
 */
const LEAD_WORD = /^(?:(?:the|an?|your|this|that)\s+)?([a-z]+)/i;

/** "your frustration", "your sense of frustration": the reader is said to have it. */
const possessed = (value, word) =>
  new RegExp(String.raw`\byour\s+(?:(?:sense|feeling|state|experience)\s+of\s+)?${word}\b`, "i").test(value);

/**
 * "YOU BURN WITH HOT FRUSTRATION" (live shop test #6, a Manifestor 5/1, 10/7):
 * the lead word is "You" and nothing is possessed, but another type's word is
 * the feeling the reader is told they have. On the two on/off-track lines
 * only, a FEELING VERB followed within four words (no punctuation between) by
 * another type's word is the claim. The 9/9 in-passing sentences have no such
 * verb ("Finding deep satisfaction through recognition", "leaves a taste of
 * resentment and frustration") and still pass.
 */
const FEELING_VERB = String.raw`\b(?:feel|feels|felt|feeling|burn|burns|burned|burning|experience|experiences|experienced|experiencing|sense|senses|sensing|rest\s+in|rests\s+in|sink\s+into|sinks\s+into|slip\s+into|slips\s+into|fill\s+with|fills\s+with|filled\s+with|(?:are|is)\s+met\s+with)`;
const feltAs = (value, word) =>
  new RegExp(String.raw`${FEELING_VERB}\s+(?:[a-z'\u2019-]+\s+){0,4}?${word}\b`, "i").test(value);

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
    const value = (m[1] ?? m[2] ?? "").trim();
    const lead = LEAD_WORD.exec(value)?.[1] ?? "";
    for (const word of ALL_TYPE_WORDS) {
      if (word === own[key]) continue;
      // feltAs skips the reader's own OTHER word too: "you feel satisfaction
      // drain away" on a Generator's off-track line is theirs, not a wrong type.
      const ownWord = word === own.signature || word === own.notSelf;
      if (lead.toLowerCase() === word.toLowerCase() || possessed(value, word) || (!ownWord && feltAs(value, word))) {
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
    // "open" and "undefined" are both white on the drawing, and this used to let
    // one stand for the other: measured across 144 state-claims in 14 delivered
    // readings, the confusion had never occurred. It has now (10/23, v3s R27,
    // delivered): "Your Head center is undefined" and, in the same paragraph,
    // "your open Head takes in inspiration". The engine draws the line on
    // purpose (an undefined centre carries gates, an open one none), so the
    // state said must be the chart's.
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

/**
 * WHAT THE PROSE SAYS CONNECTS, AND WHAT IT CALLS A MOTOR (10/23, read in the
 * v3s deliveries). The checks above read which state a reading gives a centre;
 * nothing read the wiring, and the round delivered it wrong: "Because your Heart
 * center connects to your Throat center through the 25-51 channel" (25-51 joins
 * the G and the Heart), "Because your Throat center connects directly to the
 * Heart center" on an Ego Projected chart (a Heart wired to the Throat would make
 * a Manifestor), "Your defined Throat center acts as a powerful motor", and "a
 * Projector without a defined motor" with the Solar Plexus and Root defined.
 *
 * The gate table is the engine's own (hd-engine BodyGraph.kt), so a channel's
 * two centres here are the two the bodygraph draws. A claim is judged only in
 * the shapes measured on every stored draft (537): a centre, a joining verb
 * ("connects", "links", "joins", "bridges", "ties", "spans", "unites") and a
 * second centre, in either order; with a channel number in the sentence the
 * number must join those two, without one they must be wired on this chart
 * (directly, when the sentence says "directly"; through the chart's channels
 * otherwise). A denial in the clause ("do not connect", "no outside bridges to
 * connect") is not a claim. Measured: 1,290 claims pass, 5 refused, every one
 * wrong.
 */
export const GATE_CENTER = Object.fromEntries(
  Object.entries({
    Head: [64, 61, 63],
    Ajna: [47, 24, 4, 17, 43, 11],
    Throat: [62, 23, 56, 35, 12, 45, 33, 8, 31, 16, 20],
    G: [1, 13, 25, 46, 2, 15, 10, 7],
    Heart: [21, 40, 26, 51],
    Sacral: [34, 5, 14, 29, 59, 9, 3, 42, 27],
    Spleen: [48, 57, 44, 50, 32, 28, 18],
    "Solar Plexus": [36, 22, 37, 6, 49, 55, 30],
    Root: [53, 60, 52, 19, 39, 41, 58, 38, 54],
  }).flatMap(([centre, gates]) => gates.map((g) => [g, centre])),
);
export const channelKey = (a, b) => `${Math.min(a, b)}-${Math.max(a, b)}`;
export const CHANNEL_CENTRES = new Map(
  [[64, 47], [61, 24], [63, 4], [17, 62], [43, 23], [11, 56], [1, 8], [13, 33], [7, 31], [10, 20], [21, 45], [16, 48],
    [20, 57], [20, 34], [35, 36], [12, 22], [25, 51], [2, 14], [5, 15], [29, 46], [10, 34], [10, 57], [37, 40], [26, 44],
    [34, 57], [27, 50], [6, 59], [3, 60], [42, 53], [9, 52], [32, 54], [28, 38], [18, 58], [19, 49], [39, 55], [30, 41]]
    .map(([a, b]) => [channelKey(a, b), [GATE_CENTER[Math.min(a, b)], GATE_CENTER[Math.max(a, b)]]]),
);
export const MOTOR_CENTRES = ["Sacral", "Root", "Solar Plexus", "Heart"];

/** The chart's wiring: which centres a channel joins directly, and which are joined at all. */
function chartWiring(output) {
  const direct = new Set();
  const parent = {};
  const find = (x) => (parent[x] === undefined || parent[x] === x ? (parent[x] = x) : (parent[x] = find(parent[x])));
  const own = new Set();
  for (const ch of Array.isArray(output?.channels) ? output.channels : []) {
    const m = /^(\d{1,2})\s*-\s*(\d{1,2})/.exec(String(ch));
    const pair = m && CHANNEL_CENTRES.get(channelKey(+m[1], +m[2]));
    if (!pair) continue;
    own.add(channelKey(+m[1], +m[2]));
    direct.add([...pair].sort().join("|"));
    parent[find(pair[0])] = find(pair[1]);
  }
  const joined = (a, b) => parent[a] !== undefined && parent[b] !== undefined && find(a) === find(b);
  return {
    own,
    direct: (a, b) => direct.has([a, b].sort().join("|")),
    joined,
    // A centre with a channel is defined; the centres its channels reach, itself included (10/23, M1).
    defined: (c) => parent[c] !== undefined,
    island: (c) => Object.keys(GATE_CENTRE_ORDER).filter((x) => joined(x, c)),
  };
}
/** The nine centres in the order the facts list them, for messages. */
const GATE_CENTRE_ORDER = { Head: 1, Ajna: 2, Throat: 3, G: 4, Heart: 5, Sacral: 6, Spleen: 7, "Solar Plexus": 8, Root: 9 };

const WIRE_NAME = String.raw`(?:(Solar Plexus|Head|Ajna|Throat|Heart|Sacral|Spleen|Root|G)\b(?:\s+cent(?:er|re)s?\b)?|(solar plexus|head|ajna|throat|heart|sacral|spleen|root)\s+cent(?:er|re)s?\b)`;
const WIRE_POSS = String.raw`(?:(?:the|your|its)\s+)?(?:(?:own|defined|undefined|open)\s+)?`;
const WIRE_VERB = String.raw`(?:connect(?:s|ed|ing)?|link(?:s|ed|ing)?|join(?:s|ed|ing)?|bridg(?:e|es|ed|ing)|ti(?:e|es|ed)|wir(?:e|es|ed)|span(?:s|ned|ning)?|unit(?:e|es|ed|ing)|fus(?:e|es|ed))`;
const WIRE_SHAPES = [
  // "your Heart center connects (directly) to your Throat", "the Heart center connected to your Throat"
  String.raw`${WIRE_NAME}[^.,;:!?]{0,40}?\b${WIRE_VERB}\b(?:\s+(?:directly|straight|up|together))?\s+(?:to|with|into)\s+${WIRE_POSS}${WIRE_NAME}`,
  // "links your Heart to your Throat", "bridges your G center and your Throat"
  String.raw`\b${WIRE_VERB}\b\s+(?:directly\s+)?${WIRE_POSS}${WIRE_NAME}\s+(?:and|to|with|into)\s+${WIRE_POSS}${WIRE_NAME}`,
  // "your Throat and Sacral centers are connected", "your Ajna and Throat link together directly"
  String.raw`${WIRE_NAME}\s+and\s+${WIRE_POSS}${WIRE_NAME}(?:\s+cent(?:er|re)s)?\s+(?:are\s+|is\s+)?(?:directly\s+)?\b${WIRE_VERB}\b`,
  // "spans from your Root center to your Solar Plexus"
  String.raw`\b${WIRE_VERB}\b[^.,;:!?]{0,20}?\bfrom\s+${WIRE_POSS}${WIRE_NAME}\s+to\s+${WIRE_POSS}${WIRE_NAME}`,
].map((s) => new RegExp(s, "g"));
const WIRE_DENIED = /\b(?:not|never|no|without|rather\s+than|instead\s+of|neither|nor|cannot)\b|n['’]t\b/i;
const titleCentre = (s) => s.replace(/\b\w/g, (c) => c.toUpperCase());
const wireCentres = (m) => {
  const out = [];
  for (let i = 1; i < m.length; i += 2) {
    const c = m[i] ?? (m[i + 1] ? titleCentre(m[i + 1]) : null);
    if (c) out.push(c);
  }
  return out;
};

/**
 * GROUPED SENTENCES (10/24, the Claude rounds of 10/23: "Channels 1-8 and 21-45 join your G and Heart to your
 * Throat", "The G, Throat and Spleen link through channels 1-8 and 10-57" were refused as "1-8 joins the G and the
 * Heart"). The shapes above find two centres; the sentence often names a list on either side, several channels,
 * and more than one claim. So a claim is read with its lists and its own channel numbers:
 *   - a sentence is cut into clauses at ";" and at ", while" / ", whereas" / ", with" / " while ", and a clause's
 *     channel numbers belong to the claim they follow (the first claim of a clause also takes the ones before it);
 *   - centre names chained by "and" / "or" (and commas, when an "and" / "or" ends the chain) are one list; a name
 *     the shapes found stands for its list ("the G, Sacral and Spleen connect with the Root": the three, each to
 *     the Root; the subject is the name nearest the verb, so "Sacral energy plus a Heart wired to your Throat" is
 *     the Heart's);
 *   - "<list> to <list>" claims every pair across; "<list> link / are joined" (no object) claims the list is linked;
 *     "<list> link into this line" (an object that is not a centre) is judged as before when the clause has no
 *     channel number and not at all when it has one;
 *   - a pair passes when a number joins the two (and the chart has it), or when the clause's numbers link them
 *     through other centres ("your Heart connects to your Throat by way of your Solar Plexus, through 37-40 and
 *     12-22"), or, when the clause gives its numbers as examples ("channels such as", "several channels"), when the
 *     chart links them. Otherwise it is refused as before.
 */
const WIRE_CLAUSE_CUT = /;|,\s+(?=(?:while|whereas|with)\b)|\s+(?=while\b)/g;
const NAME_AT = new RegExp(WIRE_NAME, "g");
const LIST_GAP = new RegExp(String.raw`^(?:\s*,\s*(?:(?:and|or)\s+)?|\s+(?:and|or)\s+)${WIRE_POSS}$`);
const POSS_AT = new RegExp(`^${WIRE_POSS}`);
const OBJECT_AFTER = /^\s+(?:(?:directly|straight|up|together)\s+)?(?:to|with|into)\s+/;
const NUMBERS_ARE_EXAMPLES = /\b(?:such\s+as|like|including|among\s+them|for\s+example)\s+(?:the\s+)?(?:channels?\s+)?\d|\b(?:several|various|multiple|many|other|more|two|three|four|five|six|seven|eight|nine)\s+(?:other\s+|more\s+)?channels\b/i;
const WIRE_VERB_AT = new RegExp(String.raw`\b${WIRE_VERB}\b`);
/** The clauses of a sentence, each with where it starts. */
function clausesOf(sentence) {
  const out = [];
  let from = 0;
  for (const m of sentence.matchAll(WIRE_CLAUSE_CUT)) {
    out.push([from, sentence.slice(from, m.index)]);
    from = m.index + m[0].length;
  }
  out.push([from, sentence.slice(from)]);
  return out;
}
/** The centre names of a clause, chained into lists: [[{at, end, c}, ...], ...]. */
function centreLists(clause) {
  const names = [...clause.matchAll(NAME_AT)].map((m) => ({ at: m.index, end: m.index + m[0].length, c: m[1] ?? titleCentre(m[2]) }));
  const chains = [];
  names.forEach((n, i) => {
    const gap = i ? clause.slice(names[i - 1].end, n.at) : null;
    if (gap !== null && LIST_GAP.test(gap)) {
      chains.at(-1).names.push(n);
      if (/\b(?:and|or)\b/.test(gap)) chains.at(-1).and = true;
    } else chains.push({ names: [n], and: false });
  });
  // Names joined by commas alone are not a list ("Beyond your Throat, your G links ..."): each stands alone.
  return chains.flatMap((ch) => (ch.and ? [ch.names] : ch.names.map((n) => [n])));
}
const listOf = (lists, name) => lists.find((l) => l.includes(name)) ?? [name];
const nameAt = (names, at) => names.find((n) => n.at <= at && at < n.end);
/** What one shape's match claims: pairs across ("to"), or a list linked together; null when it claims nothing to judge. */
function wireClaim(k, m, clause, lists) {
  const names = lists.flat().filter((n) => n.at >= m.index && n.end <= m.index + m[0].length).sort((x, y) => x.at - y.at);
  if (names.length < 2) return null;
  const first = names[0], last = names.at(-1);
  const after = clause.slice(m.index + m[0].length);
  const objectName = () => {
    const o = OBJECT_AFTER.exec(after);
    if (!o) return undefined;
    const at = m.index + m[0].length + o[0].length;
    return nameAt(lists.flat(), at + POSS_AT.exec(clause.slice(at))[0].length) ?? null;
  };
  const from = (n) => { const l = listOf(lists, n); return l.slice(l.indexOf(n)); };
  const upTo = (n) => { const l = listOf(lists, n); return l.slice(0, l.indexOf(n) + 1); };
  if (k === 0) {
    // "<subject> ... connects to <object>": the subject is the name nearest the verb.
    const verb = WIRE_VERB_AT.exec(m[0].slice(first.end - m.index));
    const verbAt = first.end + (verb ? verb.index : 0);
    const subject = names.filter((n) => n.end <= verbAt).at(-1) ?? first;
    return { pairsOf: [upTo(subject), from(last)], start: upTo(subject)[0].at };
  }
  if (k === 1) {
    const joint = clause.slice(first.end, last.at);
    if (/\band\b/.test(joint)) {
      const obj = objectName();
      if (obj) return { pairsOf: [from(first), from(obj)], start: m.index };
      if (obj === null) return { tied: [first, last], start: m.index };
      return { group: from(first), start: m.index };
    }
    return { pairsOf: [[first], from(last)], start: m.index };
  }
  if (k === 2) {
    const obj = objectName();
    if (obj) return null; // "<list> connect with the Root": the first shape reads it, the pairs across.
    if (obj === null) return { tied: [first, last], start: m.index };
    return { group: upTo(last), start: upTo(last)[0].at };
  }
  return { pairsOf: [[first], from(last)], start: m.index };
}
/** The channel numbers a stretch of text names. */
const numbersIn = (s) => [...s.matchAll(/\b(\d{1,2})\s*-\s*(\d{1,2})\b/g)].map((n) => channelKey(+n[1], +n[2])).filter((k) => CHANNEL_CENTRES.has(k));
/** Whether the centres x and y are linked by these channels alone (through any centres). */
function linkedBy(keys, x, y) {
  const reach = new Set([x]);
  for (let grew = true; grew; ) {
    grew = false;
    for (const k of keys) {
      const [p, q] = CHANNEL_CENTRES.get(k);
      if (reach.has(p) !== reach.has(q)) { reach.add(reach.has(p) ? q : p); grew = true; }
    }
  }
  return reach.has(y);
}

export function connectionProblem(raw, output) {
  if (!Array.isArray(output?.channels)) return null;
  const wiring = chartWiring(output);
  for (const [where, text] of proseOf(raw)) {
    const sentences = text.split(/(?<=[.!?])\s+/);
    for (let si = 0; si < sentences.length; si++) {
      const sentence = sentences[si];
      for (const [off, clause] of clausesOf(sentence)) {
        const lists = centreLists(clause);
        const claims = [];
        WIRE_SHAPES.forEach((re, k) => {
          for (const m of clause.matchAll(re)) {
            const [a, b] = wireCentres(m);
            if (!a || !b || a === b) continue;
            if (WIRE_DENIED.test(clause.slice(0, m.index).split(/[,;:]/).at(-1) + m[0])) continue;
            const claim = wireClaim(k, m, clause, lists);
            if (claim) claims.push({ ...claim, m });
          }
        });
        const starts = [...new Set(claims.map((c) => c.start))].sort((x, y) => x - y);
        const clauseNumbers = numbersIn(clause);
        for (const c of claims) {
          const { m } = c;
          const quote = `"${quoteAt(sentence, off + m.index, m[0].length)}"`;
          const next = starts.find((s) => s > c.start) ?? clause.length;
          const region = clause.slice(c.start === starts[0] ? 0 : c.start, next);
          const numbers = numbersIn(region);
          const directly = /\bdirect(?:ly)?\b/i.test(m[0]);
          if (c.tied && numbers.length) continue; // "<list> link into this line through 10-34": not judged.
          const pairs = [];
          if (c.pairsOf) for (const x of c.pairsOf[0]) for (const y of c.pairsOf[1]) pairs.push([x.c, y.c]);
          const group = c.group ?? c.tied;
          if (group) group.forEach((x, i) => group.slice(i + 1).forEach((y) => pairs.push([x.c, y.c])));
          for (const [x, y] of pairs) {
            if (x === y) continue;
            // A number of the clause that joins the two answers for them wherever it stands ("channel 10-34 ties the G
            // to the Sacral, and channel 6-59 joins the Sacral to the Solar Plexus").
            const joins = clauseNumbers.filter((k) => CHANNEL_CENTRES.get(k).includes(x) && CHANNEL_CENTRES.get(k).includes(y));
            if (joins.length) {
              if (!joins.some((k) => wiring.own.has(k))) return `The reading wires the ${x} and the ${y} through Channel ${joins[0]} in ${where}, a channel this chart does not have: ${quote}`;
              continue;
            }
            if (numbers.length) {
              const own = numbers.filter((k) => wiring.own.has(k));
              if (linkedBy(own, x, y)) continue;
              if (linkedBy(numbers, x, y)) return `The reading wires the ${x} and the ${y} through Channel ${numbers.find((k) => !wiring.own.has(k))} in ${where}, a channel this chart does not have: ${quote}`;
              if (NUMBERS_ARE_EXAMPLES.test(region) && wiring.joined(x, y)) continue;
              const [p, q] = CHANNEL_CENTRES.get(numbers[0]);
              return `The reading says Channel ${numbers[0]} joins the ${x} and the ${y} in ${where}; it joins the ${p} and the ${q}: ${quote}`;
            }
            if (directly ? !wiring.direct(x, y) : !wiring.joined(x, y)) {
              return `The reading says the ${x} and the ${y} connect${directly ? " directly" : ""} in ${where}, but ${directly ? "no channel of this chart joins them" : "no channel of this chart links them"}: ${quote}`;
            }
          }
        }
      }
      // 10/23 word-for-word read (M1): motor power at the Throat, thoughts reaching words, a gap, power from several centres.
      const claim = wiringClaim(sentence, sentences[si - 1] ?? "", where, wiring);
      if (claim) return claim;
    }
  }
  return null;
}

/**
 * WHAT FEEDS THE THROAT, WHAT REACHES WORDS, WHAT IS APART (10/23 word-for-word read of round rk-a3, M1 and N21).
 * The shapes above read "<centre> connects to <centre>"; the round delivered the same wrong wiring in other words:
 *   - "Because this defined region [the Throat] connects directly to your motors" and "translating the power of
 *     your Sacral and Root motors into tangible results" on Generators whose Throat joins only the G. A motor
 *     wired to the Throat is what makes a Manifesting Generator or a Manifestor; no other type has one;
 *   - "this mental processing finds a direct outlet into spoken words" with no channel from the Ajna to the Throat;
 *   - "bridge the gap between your conceptual mind and your expressive voice" with 11-56 joining the two;
 *   - "Because your Throat, G, and Heart are defined, you generate steady power from multiple centers" (one motor).
 * Judged, sentence by sentence, in these shapes only:
 *   1. the Throat (named in the sentence, or the centre the sentence before opens on when this one says "this
 *      defined center", "this area"...) taking, translating or channelling the power of motors, wired to motors,
 *      working alongside them, or speaking whenever they engage; and "a motor connected to the Throat". A motor
 *      named must be joined to the Throat by this chart's channels; "your motors" needs one that is;
 *      Also (arms af-a, af-b) the Throat turning "your vitality" into words or results (not judged on a Throat
 *      joined to the Spleen, whose word vitality also is), and another centre taking or channelling a motor's power
 *      ("Your defined G center channels that sacral power", a part re-ask that swapped the Throat for the G);
 *   2. any centre said to connect to "your motors": a motor must be in its part of the chart;
 *   3. the motor the sentence before names, working "alongside your Throat": the two must be joined;
 *   4. thoughts, ideas or mental processing finding an outlet, bridge or path into words, speech or expression:
 *      the Ajna must be joined to the Throat (by a channel of its own when it says "direct");
 *   5. a gap to bridge between two sides that name centres (the mind, the voice, identity, willpower, the
 *      emotions, intuition, the motors, or a centre by name): wrong only when every centre of one side is
 *      already joined to every centre of the other;
 *   6. power from several centres, with the centres named: two of them must be motors.
 * A denial in the clause ("lacks a motor connected to the Throat", "without needing bridges") is not a claim.
 * Measured on every stored draft and on Jeremy's approved lines: every hit read (hd-e2e/ai-facts-1023).
 */
const MOTOR_WORD = String.raw`(?:(?:inner|internal|lower|defined|underlying|multiple|several|other|physical|own|various|core)\s+)*(?:motor\s+cent(?:er|re)s?|motors?|engines?)\b`;
const FEED_VERB = String.raw`(?:tak(?:e|es|ing)|draw(?:s|ing)?|channel(?:s|ed|ing|led|ling)?|translat(?:e|es|ed|ing)|turn(?:s|ed|ing)?|convert(?:s|ed|ing)?|transform(?:s|ed|ing)?|receiv(?:e|es|ed|ing)|harness(?:es|ed|ing)?|carr(?:y|ies|ied|ying)|express(?:es|ed|ing)?|voic(?:e|es|ed|ing)|amplif(?:y|ies|ied|ying)|gives?\s+(?:a\s+)?voice\s+to|giving\s+(?:a\s+)?voice\s+to)`;
const POWER_WORD = String.raw`(?:(?:raw|vital|creative|motor|engine|physical|generative|steady|sustained)\s+)*(?:power|energy|force|fuel|output|drive|momentum|vitality|life[- ]force|stamina)`;
/**
 * kind "feed": the Throat (or the voice) is the subject, and what feeds it is read from the words after the
 * shape's group 1 (a motor named, or "your motors"); "wire": any centre connected to "your motors";
 * "motorish": the Throat carrying what can only be a motor's power ("this raw power", "life force").
 */
const THROAT_FEEDS = [
  // "taking the raw power from your motor centers", "translating the power of your Sacral and Root motors"
  ["feed", String.raw`\b${FEED_VERB}\s+(?:(?:the|all|this|that|your|its)\s+)?${POWER_WORD}\s+(?:from|of)\s+(?:your|the)\s+([^.,;:!?]{1,60})`],
  // "transforms internal motor output into", "translates raw motor output into"
  ["feed", String.raw`\b${FEED_VERB}\s+(?:(?:the|your|its)\s+)?(?:(?:raw|internal|inner)\s+)*(motor|engine)\s+(?:power|energy|output|force|drive)\b`],
  // "connects directly to your motors", "is connected to multiple motors", "connects your internal motors to"
  ["wire", String.raw`\b(?:connect|link|wir|tie|tied|join|fus|attach)\w*\s+(?:(?:directly|straight|up)\s+)*(?:to|with|into)\s+(?:your\s+|the\s+|its\s+)?(${MOTOR_WORD})`],
  ["wire", String.raw`\b(?:connect|link|tie|join)\w*\s+your\s+(${MOTOR_WORD})(?:\s+(?:power|energy|output))?\s+(?:directly\s+)?(?:to|with)\b`],
  // "whenever your motors engage", "whenever your motor is switched on", "whenever your internal motor gets activated"
  ["feed", String.raw`\b(?:whenever|when|once|as soon as)\s+your\s+(${MOTOR_WORD})\s+(?:engages?|fires?|kicks?\s+in|switch(?:es)?\s+on|activates?)\b`],
  ["feed", String.raw`\b(?:whenever|when|once|as soon as)\s+your\s+(${MOTOR_WORD})\s+(?:is|gets?)\s+(?:switched\s+on|activated|engaged|triggered|turned\s+on)\b`],
  // "works alongside your motor centers", "the meeting point for your inner motors", "an outlet for the motor energy"
  ["feed", String.raw`\b(?:alongside|in tandem with|together with)\s+your\s+(${MOTOR_WORD})`],
  ["feed", String.raw`\b(?:meeting point|outlet|mouthpiece|megaphone)\s+for\s+(?:your|the)\s+(${MOTOR_WORD}|motor\s+(?:energy|power|output))`],
  // "Through the Throat, your inner motor finds a voice"
  ["feed", String.raw`\b(${MOTOR_WORD})(?:\s+(?:power|energy|output))?\s+(?:finds?|gets?)\s+(?:a\s+|its\s+)?(?:voice|outlet|way\s+out)\b`],
  // "your voice and actions ... emerge naturally from your Sacral engine", "flows effortlessly from your sacral engine"
  ["feed", String.raw`\b(?:emerg(?:e|es|ed|ing)|flow(?:s|ed|ing)?|com(?:e|es|ing)|mov(?:e|es|ed|ing)|ris(?:e|es|ing)|spring(?:s|ing)?)\s+(?:[a-z]+\s+){0,2}?from\s+your\s+((?:(?:sacral|root|solar plexus|heart)\s+(?:engine|motor|cent(?:er|re)))|${MOTOR_WORD})`],
  // "channels this physical power into outward expression"
  ["motorish", String.raw`\b(?:channel|translat|turn|convert|carr|push|transform)\w*\s+(?:this|that|your|the)\s+(?:(?:raw|steady|physical|vital)\s+)*(?:life[- ]force|physical\s+power|raw\s+power|motor\s+power|sacral\s+power|physical\s+drive)\s+(?:outward\s+)?into\s+(?:[a-z]+\s+){0,2}?(?:expression|speech|words|action|voice|communication)\b`],
  // 10/23 (arm af-a R04, R05): "This defined outlet [the Throat] ensures your vitality translates directly into
  // tangible results", "a direct channel to manifest your internal vitality into spoken words". Vitality is the
  // Sacral's word, and the Spleen's too: on a Throat joined to the Spleen it is not judged (wiringClaim).
  ["vital", String.raw`\b(?:your|this|that|the)\s+(?:(?:inner|internal|raw|physical|generative|sacral)\s+)?(vitality|life[- ]force|vital\s+force|sacral\s+(?:power|energy))\s+(?:translates?|flows?|moves?|pours?|turns?|is\s+channell?ed|finds?\s+(?:its\s+way|an?\s+outlet))\s+(?:(?:directly|effortlessly|naturally|smoothly|outward|straight)\s+)*(?:into|through)\s+(?:your\s+)?(?:spoken\s+words|speech|expression|words|voice|tangible\s+results|outward\s+expression)\b`],
  ["vital", String.raw`\b(?:manifest|channel|translat|turn|carr|express)\w*\s+(?:your\s+|this\s+|that\s+|the\s+)?(?:(?:inner|internal|raw|physical)\s+)?(vitality|life[- ]force|vital\s+force)\s+(?:outward\s+)?into\s+(?:spoken\s+words|speech|expression|words|voice)\b`],
].map(([kind, src]) => [kind, new RegExp(src, "gi")]);
/** "a motor connected to the Throat", in the round's denials and its Manifestors' claims. */
const MOTOR_AT_THROAT = new RegExp(String.raw`\b(${MOTOR_WORD})\s+(?:[a-z]+\s+){0,2}?(?:connected|linked|wired|attached|joined|tied)\s+(?:directly\s+)?(?:to|with)\s+(?:your\s+|the\s+)(?:defined\s+)?throat\b`, "gi");
/** "Working alongside your defined Throat center, this engine pushes you to ...", "Your defined Throat center joins this vital engine" (the engine: the sentence before's motor). */
const THROAT_WITH_ENGINE = [
  /\b(?:alongside|in tandem with|together with)\s+your\s+(?:defined\s+)?Throat(?:\s+cent(?:er|re))?\s*,\s*(?:this|that|the|your)\s+(?:engine|motor)\b/gi,
  /\bThroat(?:\s+cent(?:er|re))?\s+(?:joins|pairs\s+with|works\s+(?:with|alongside)|teams\s+up\s+with|combines\s+with)\s+(?:this|that)\s+(?:[a-z]+\s+)?(?:engine|motor)\b/gi,
];
/** A motor named in lower case before "engine" / "motor" ("your sacral engine"). */
const MOTOR_NAMED_LOWER = /\b(sacral|root|solar plexus|heart)\s+(?:engine|motor)\b/gi;
/** The voice standing for the Throat as a sentence's subject ("your communication flows ... from your sacral engine"). */
const VOICE_SUBJECT = /\byour\s+(?:[a-z]+\s+)?(?:voice|words|speech|communication|expressions?)\b/i;
const MIND_TO_WORDS = /\b(mental\s+(?:processing|concepts|activity|energy|insights?)|thoughts?|thinking|ideas|insights|concepts|mind)\b[^.;:!?]{0,40}?\b(?:finds?|found|has|have|gets?|takes?|follows?|with)\s+(?:a\s+|an\s+|its\s+)?((?:direct|reliable|straight|clear|consistent|steady|dependable|natural|immediate)\s+)?(?:outlet|bridge|path|pathway|channel|line|route|conduit|road|doorway)\s+(?:into|to)\s+(?:(?:spoken|verbal|clear|outward)\s+)?(?:words?|speech|voice|expression|language|communication)\b/gi;
const GAP_BETWEEN = /\b(?:bridg(?:e|es|ed|ing)|span(?:s|ned|ning)?|clos(?:e|es|ed|ing)|cross(?:es|ed|ing)?|navigat(?:e|es|ed|ing))\s+(?:the\s+|a\s+|this\s+|that\s+)?(?:(?:internal|inner|natural|mechanical)\s+)?(?:gap|divide|distance)\s+between\s+([^.;:!?]{3,90})/gi;
const POWER_FROM_MANY = /\b(?:generate|produce|draw|carry|hold|have|get)s?\s+(?:(?:steady|consistent|reliable|sustained|constant|real|abundant)\s+)?(?:power|energy|fuel|momentum|drive|force|stamina)\s+from\s+(?:multiple|several|many|these|those|all|both|two|three|four|five|six|seven|eight|nine)\s+(?:(?:defined|different|separate)\s+)?(?:cent(?:er|re)s|areas|sources|places|parts)\b/gi;
const CLAIM_DENIED = /\b(?:not|never|no|without|rather\s+than|instead\s+of|neither|nor|cannot|lacks?|lacking|lack\s+of|absence\s+of|free\s+of|devoid\s+of|missing)\b|n['’]t\b/i;
const ANAPHOR = /\b(?:this|that|it|these|here)\b/i;
const CENTRE_IN = new RegExp(WIRE_NAME, "g");
/** The centres a stretch of text names, in order (the gate-table names). */
const centresIn = (s) => [...String(s).matchAll(CENTRE_IN)].map((m) => m[1] ?? titleCentre(m[2]));
/**
 * Plain words for a centre, in the two sides of "a gap between X and Y". The noun at the end of a side wins
 * ("your conceptual voice" is the voice); a side with none of these is not judged.
 */
const SIDE_WORDS = [
  [/\b(?:mind|minds|thoughts?|thinking|intellect|ideas|concepts|mental\s+(?:processing|concepts|awareness|activity|framework))\b/i, ["Head", "Ajna"]],
  [/\b(?:voice|expression|speech|words|communication)\b/i, ["Throat"]],
  [/\b(?:identity|sense of self|direction)\b/i, ["G"]],
  [/\b(?:willpower|will)\b/i, ["Heart"]],
  [/\b(?:emotions|emotional\s+(?:waves?|depth|awareness)|feelings)\b/i, ["Solar Plexus"]],
  [/\b(?:intuition|instincts?|intuitive\s+awareness)\b/i, ["Spleen"]],
  [/\bmotors?(?:\s+cent(?:er|re)s?)?\b/i, MOTOR_CENTRES],
];
function sideCentres(side, wiring) {
  const named = centresIn(side);
  if (named.length) return named;
  let best = null;
  for (const [re, centres] of SIDE_WORDS) {
    const m = re.exec(side);
    if (m && (!best || m.index > best.at)) best = { at: m.index, centres };
  }
  return best ? best.centres.filter((c) => wiring.defined(c)) : [];
}
const andList = (xs) => (xs.length < 2 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs.at(-1)}`);
const theList = (xs) => andList(xs.map((x) => `the ${x}`));

function wiringClaim(sentence, prev, where, wiring) {
  const quote = (m) => `"${quoteAt(sentence, m.index, m[0].length)}"`;
  const denied = (m) => CLAIM_DENIED.test(sentence.slice(0, m.index).split(/[,;:]/).at(-1) + m[0]);
  // The centre a sentence is about: the first it names before `at`, else the first the sentence before names
  // when this one points back ("This defined center takes ...").
  // "Through this defined throat, ..." names it in lower case; "your communication flows ..." speaks for it.
  const subject = (at, voice = false) => {
    const before = sentence.slice(0, at);
    const own = centresIn(before);
    if (own.length) return own[0];
    if (/\bthroat\b/i.test(before)) return "Throat";
    if (ANAPHOR.test(before)) {
      const back = centresIn(prev)[0];
      if (back) return back;
    }
    return voice && VOICE_SUBJECT.test(before) ? "Throat" : null;
  };
  const motorsNamed = (s) => [...new Set([...centresIn(s), ...[...String(s).matchAll(MOTOR_NAMED_LOWER)].map((x) => titleCentre(x[1]))])].filter((c) => MOTOR_CENTRES.includes(c));
  const throatMotors = MOTOR_CENTRES.filter((c) => wiring.joined(c, "Throat"));
  const throatSays = () => {
    if (!wiring.defined("Throat")) return "the Throat is not defined on this chart";
    return `the Throat is joined only to ${theList(wiring.island("Throat").filter((c) => c !== "Throat"))}, and no motor reaches it`;
  };
  // 1. Motor power at the Throat.
  for (const [kind, re] of THROAT_FEEDS) {
    for (const m of sentence.matchAll(re)) {
      if (denied(m)) continue;
      const about = subject(m.index, kind !== "wire");
      const tail = m[1] ?? "";
      const named = kind === "motorish" || kind === "vital" ? [] : motorsNamed(tail.split(/\b(?:into|and\s+(?:translat|turn|convert|giv|transform)\w*|to\s+(?:fuel|power|drive)|through)\b/i)[0]);
      const generic = kind === "motorish" || kind === "vital" || /\b(?:motors?|motor\s+cent|engines?|motor|engine)\b/i.test(tail);
      if (!named.length && !generic) continue;
      if (kind === "wire") {
        // 2. Any centre connected to "your motors".
        if (!about || named.length) continue;
        const own = MOTOR_CENTRES.filter((c) => c !== about && wiring.joined(c, about));
        if (own.length) continue;
        if (about === "Throat") return `The reading says the Throat is wired to motors in ${where}, but ${throatSays()}: ${quote(m)}`;
        return `The reading says the ${about} connects to motors in ${where}, but no motor of this chart is joined to the ${about}: ${quote(m)}`;
      }
      if (!about || MOTOR_CENTRES.includes(about)) continue;
      if (about !== "Throat") {
        // 10/23 (arm af-b R01, a part re-ask that swapped the Throat for the G): the same take-the-power claim made of
        // another centre, "Your defined G center channels that sacral power into outward expression".
        if (!(kind === "motorish" || re === THROAT_FEEDS[0][1] || re === THROAT_FEEDS[1][1])) continue;
        const reach = MOTOR_CENTRES.filter((c) => wiring.joined(c, about));
        const off = named.filter((c) => !reach.includes(c));
        if (named.length ? !off.length : reach.length) continue;
        if (named.length) return `The reading says the power of ${theList(off)} reaches the ${about} in ${where}, but no channel of this chart joins ${off.length > 1 ? "them" : "it"} to the ${about}: ${quote(m)}`;
        return `The reading says motor power reaches the ${about} in ${where}, but no motor of this chart is joined to the ${about}: ${quote(m)}`;
      }
      // Vitality on a Throat joined to the Spleen may be the Spleen's own.
      if (kind === "vital" && /vital/i.test(tail) && wiring.joined("Spleen", "Throat")) continue;
      if (named.length) {
        const off = named.filter((c) => !throatMotors.includes(c));
        if (off.length) return `The reading says the power of ${theList(off)} reaches the Throat in ${where}, but no channel of this chart joins ${off.length > 1 ? "them" : "it"} to the Throat: ${quote(m)}`;
        continue;
      }
      if (!throatMotors.length) return `The reading says motor power reaches the Throat in ${where}, but ${throatSays()}: ${quote(m)}`;
    }
  }
  for (const m of sentence.matchAll(MOTOR_AT_THROAT)) {
    if (denied(m) || throatMotors.length) continue;
    return `The reading says a motor is connected to the Throat in ${where}, but ${throatSays()}: ${quote(m)}`;
  }
  // 3. The motor of the sentence before, "alongside your Throat" / joined by "your Throat".
  for (const [k, re] of THROAT_WITH_ENGINE.entries()) {
    for (const m of sentence.matchAll(re)) {
      if (denied(m)) continue;
      const motor = centresIn(prev).find((c) => MOTOR_CENTRES.includes(c));
      if (!motor || wiring.joined(motor, "Throat")) continue;
      if (k === 0 && centresIn(sentence.slice(0, m.index)).length) continue;
      return `The reading says the ${motor} works with the Throat in ${where}, but no channel of this chart joins the ${motor} to the Throat: ${quote(m)}`;
    }
  }
  // 4. Thoughts reaching words.
  for (const m of sentence.matchAll(MIND_TO_WORDS)) {
    if (denied(m) || !wiring.defined("Throat")) continue;
    const direct = Boolean(m[2] && /direct|straight|immediate/i.test(m[2]));
    if (direct ? wiring.direct("Ajna", "Throat") : wiring.joined("Ajna", "Throat")) continue;
    return `The reading says your thoughts reach your words${direct ? " directly" : ""} in ${where}, but no channel of this chart ${direct ? "joins" : "links"} the Ajna to the Throat: ${quote(m)}`;
  }
  // 5. A gap between two sides that are joined.
  for (const m of sentence.matchAll(GAP_BETWEEN)) {
    if (denied(m)) continue;
    const sides = m[1].split(/\s+and\s+(?=(?:your|the|their|its)\b)/i);
    if (sides.length !== 2) continue;
    const [xs, ys] = sides.map((s) => sideCentres(s.replace(/,.*$/, ""), wiring));
    if (!xs.length || !ys.length || xs.some((x) => ys.includes(x))) continue;
    if (!xs.every((x) => ys.every((y) => wiring.joined(x, y)))) continue;
    return `The reading says a gap lies between ${theList(xs)} and ${theList(ys)} in ${where}, but this chart's channels already join them: ${quote(m)}`;
  }
  // 6. Power from several centres.
  for (const m of sentence.matchAll(POWER_FROM_MANY)) {
    if (denied(m)) continue;
    const named = [...new Set(centresIn(sentence))];
    if (named.length < 2) continue;
    const motors = named.filter((c) => MOTOR_CENTRES.includes(c));
    if (motors.length >= 2) continue;
    return `The reading says power comes from several centers in ${where}, but of ${theList(named)} ${motors.length ? `only the ${motors[0]} is a motor` : "none is a motor"} (the motors are the Sacral, Root, Solar Plexus and Heart): ${quote(m)}`;
  }
  return null;
}

/**
 * THE MOTORS ARE THE SACRAL, ROOT, SOLAR PLEXUS AND HEART (engine Center.isMotor).
 * Refused: another centre called a motor ("Your Throat center remains consistently
 * active as a reliable motor"), and "no defined motor" on a chart with one
 * defined -- unless it is the Projector's "no defined motor connected to the
 * Throat", which is true. Measured on every stored draft: 6 refused, every one
 * wrong (two say "without a defined motor for sustainable labor" on a chart whose
 * Heart is defined: the Sacral is meant, and the Heart is still a defined motor).
 * 10/23 (M1): "the" / "its" motor too ("Your Throat center acts as the primary motor for your
 * expression", 10 drafts, every one wrong); a motor OUTPUT or OUTLET is what the Throat is, not a
 * motor ("acts as a powerful motor outlet" on a Manifestor was the one false hit).
 */
const NOT_MOTOR = new RegExp(
  String.raw`\b(Head|Ajna|Throat|G|Spleen)(?:\s+cent(?:er|re))?\b[^.;:!?]{0,40}?\b(?:is|acts\s+as|serves\s+as|works\s+as|operates\s+as|functions\s+as|becomes|as)\s+(?:a|an|your|the|its)\s+(?:[a-z-]+\s+){0,2}motor\b(?!\s+(?:output|outlets?)\b)`,
  "gi",
);
const NO_MOTOR = /\b(?:without|no|lacks?|lacking|lack\s+of|absence\s+of|(?:does|do)\s+not\s+(?:have|carry|hold)|(?:doesn|don)['’]t\s+(?:have|carry|hold))\s+(?:a\s+|any\s+)?(?:single\s+)?defined\s+motors?\b(?:\s+cent(?:er|re)s?)?/gi;
const TO_THE_THROAT = /^[^.;:!?]{0,40}?\b(?:to|into|with)\s+(?:the\s+|your\s+)?throat\b/i;

export function motorProblem(raw, output) {
  const motors = (Array.isArray(output?.definedCenters) ? output.definedCenters : []).filter((c) => MOTOR_CENTRES.includes(c));
  for (const [where, text] of proseOf(raw)) {
    for (const m of text.matchAll(NOT_MOTOR)) {
      if (/\bnot\b|n['’]t\b|\bnever\b/i.test(m[0])) continue;
      return `The reading calls the ${m[1]} a motor in ${where}; the motors are the Sacral, Root, Solar Plexus and Heart: "${quoteAt(text, m.index, m[0].length)}"`;
    }
    if (!motors.length) continue;
    for (const m of text.matchAll(NO_MOTOR)) {
      if (TO_THE_THROAT.test(text.slice(m.index + m[0].length))) continue;
      const list = motors.length < 2 ? motors[0] : `${motors.slice(0, -1).join(", ")} and ${motors.at(-1)}`;
      return `The reading says this chart has no defined motor in ${where}, but its ${list} ${motors.length < 2 ? "is a defined motor" : "are defined motors"}: "${quoteAt(text, m.index, m[0].length)}"`;
    }
  }
  return null;
}

/**
 * A SPLIT NEEDS A BRIDGE; IT DOES NOT MAKE ONE (10/23). "This separation creates an
 * inner bridge where you naturally seek out connections" says the opposite of the
 * mechanics: the parts of a split are joined from outside (another person's gate,
 * a transit). In "Your definition", on a split chart; "a bridge-seeking tendency"
 * (the split creates the SEEKING) passes. Measured on every stored draft: 74 hits,
 * every one this slip; a channel that "creates a bridge" between two centres, and
 * a strategy that creates one between people, are elsewhere and pass.
 */
const SPLIT_BRIDGE = /\bcreates?\s+(?:a|an)\s+(?:[a-z-]+\s+){0,2}bridges?\b(?![-‐‑](?:seeking|building))/i;
export function splitBridgeProblem(raw, output) {
  if (!/split/i.test(String(output?.definition ?? ""))) return null;
  for (const [where, text] of proseOf(raw)) {
    if (where !== `"${MECHANICS[1]}"`) continue;
    const m = SPLIT_BRIDGE.exec(text);
    if (m) return `The reading says the split creates a bridge in ${where}; a split definition looks for a bridge, it does not make one: "${quoteAt(text, m.index, m[0].length)}"`;
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
 * THE CENTER EACH AUTHORITY SPEAKS FROM, for the side note beside "How you
 * decide" (10/21 live test, bug 14; Jeremy's pick 14B). The note printed the
 * Definition ("CENTER: Single") for Self-Projected, Ego, Mental and Lunar.
 * Mental and Lunar have no center of their own, so they get no note: the line
 * above it already says how they decide.
 */
export const AUTHORITY_CENTER = Object.freeze({
  Emotional: "Solar Plexus",
  Sacral: "Sacral",
  Splenic: "Spleen",
  Ego: "Heart",
  "Ego Manifested": "Heart",
  "Ego Projected": "Heart",
  "Self-Projected": "G",
});

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
  const ownCentre = AUTHORITY_CENTER[authority] ?? null;

  return {
    [INTERPRETATION[0]]: [
      [String((c && c.type) || "").toUpperCase(), (c && c.strategy) || ""],
      ["DEFINITION", (c && c.definition) || ""],
    ],
    [INTERPRETATION[1]]: [
      [`${authority.toUpperCase()} AUTHORITY`.trim(), HOW[authority] || ""],
      ...(ownCentre ? [["CENTER", ownCentre]] : []),
    ],
    [INTERPRETATION[2]]: [
      [`PROFILE ${(c && c.profile) || ""}`.trim(), profileNames],
      // "(11/12 | 6/36)" kept on one line in the narrow margin, as the phone
      // has it: no-break spaces around the bar.
      ["INCARNATION CROSS", ((c && c.incarnationCross) || "").replace(" | ", " | ")],
    ],
    // No center lists beside "What is consistently yours" / "What you take in
    // from others" (Jeremy 10/16, call 5 -- trim repeats in the MARGINS
    // only): Start here already lists every center with its meaning, and the
    // glance page has them as values. Nor a margin on the cross or the
    // definition sections: both values are already in the margins earlier.
    [INTERPRETATION[5]]: [
      // The break keeps "IS" off a line of its own in the narrow PDF margin.
      ["ON TRACK,\nTHE FEELING IS", (c && c.signature) || ""],
      ["OFF TRACK,\nTHE FEELING IS", (c && c.notSelfTheme) || ""],
    ],
  };
}
