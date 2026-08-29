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
    `Open centers: ${list(output?.openCenters)}`,
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
    .trim();
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
export function firstProblem(raw) {
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
  return structureProblem(reading);
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
  return null;
}

/** Every marker present, alone on its line, in order. */
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
    const m = /^([A-Za-z-]+):\s*(.+)$/.exec(line);
    if (!m) continue;
    const key = SUMMARY_KEYS.find((k) => k.toLowerCase() === m[1].toLowerCase());
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
      .map((p) => p.replace(/\s*\n\s*/g, " ").trim())
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
    [INTERPRETATION[4]]: [["OPEN CENTRES", ((c && c.openCenters) || []).join(", ") || "None"]],
    [INTERPRETATION[5]]: [
      ["SIGNATURE", (c && c.signature) || ""],
      ["NOT-SELF", (c && c.notSelfTheme) || ""],
    ],
  };
}
