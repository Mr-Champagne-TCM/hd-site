import {
  DISCLAIMER,
  HEADINGS,
  INTERPRETATION,
  MECHANICS,
  OLD_HEADINGS,
  SUMMARY_MARKER,
  TAKEAWAYS,
  summaryRows,
} from "./interpretation.mjs";
import {
  CENTER_DEFINED,
  CENTER_OPEN,
  CENTER_UNDEFINED,
  CENTER_WHAT,
  CHANNEL,
  PROFILE_LINE,
} from "../../shared/libraryGlance.mjs";

/**
 * "START HERE" AND THE READING'S NEW ORDER, as data -- PORTED from the phone
 * app's ReadingView.build (hd-reading-app ReadingView.kt, Jeremy 10/9 mock v2
 * and the 10/15-10/16 PDF calls).
 *
 * One builder for the shop's PDF AND the shop's reading page, exactly as the
 * phone has one for its Reading tab AND its PDF: Centers, then Channels, then
 * Profile, each a short list with the library's one-liner and a Takeaway made
 * of sentences the reading ALREADY holds (moved up, never rewritten). Names and
 * numbers come from the chart; one-liners from shared/libraryGlance.mjs.
 *
 * A reading without the form-mode markers (letter mode) gets null here and is
 * shown the old way.
 */

export const NO_CHANNELS = "No defined channels.";

/** The phone's Structured.PROFILE_LINE_NAMES. */
export const PROFILE_LINE_NAMES = Object.freeze({
  1: "Investigator",
  2: "Hermit",
  3: "Martyr",
  4: "Opportunist",
  5: "Heretic",
  6: "Role Model",
});

const normalise = (s) => String(s ?? "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");

/** Cut at the markers, exactly as the phone does (old section-6 heading mapped). */
export function sections(reading) {
  const out = new Map();
  let current = null;
  for (const raw of normalise(reading).split("\n")) {
    const line = OLD_HEADINGS[raw.trim()] ?? raw.trim();
    if (HEADINGS.includes(line) || line === SUMMARY_MARKER) {
      current = [];
      out.set(line, current);
      continue;
    }
    if (line === DISCLAIMER) break;
    if (current && (line !== "" || current.length)) current.push(line);
  }
  return new Map([...out].map(([k, v]) => [k, v.join("\n").trim()]));
}

/** Blank-line paragraphs, each unwrapped to one line. */
function paras(s) {
  return String(s ?? "")
    .split(/\n\s*\n/)
    .map((p) => p.replace(/\n/g, " ").trim())
    .filter(Boolean);
}

/** "25-51 (Initiation), G to Heart: sentence" -> "sentence". */
const afterLabel = (line) => (line.includes(": ") ? line.slice(line.indexOf(": ") + 2).trim() : line.trim());

const channelKey = (numbers) =>
  numbers
    .split("-")
    .map((n) => parseInt(n.trim(), 10))
    .filter((n) => !Number.isNaN(n))
    .sort((a, b) => a - b)
    .join("-");

const lines = (s) =>
  String(s ?? "")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

/**
 * The view, or null when the reading cannot be laid out in the new order.
 * `chart` is the engine's output as the shop stores it.
 */
export function buildReadingView(chart, reading) {
  const MOCK_AI2 = String(globalThis.process?.env?.HD_MOCK_AI2 ?? "").toUpperCase();
  if (typeof reading !== "string" || !reading.trim()) return null;
  const s = sections(reading);
  if ([SUMMARY_MARKER, ...HEADINGS].some((h) => !s.has(h))) return null;
  const sum = summaryRows(reading);
  const interp = Object.fromEntries(INTERPRETATION.map((h) => [h, paras(s.get(h))]));
  const lede = (h) => interp[h]?.[0] ?? null;
  const body = (h) => (interp[h] ?? []).slice(1);

  const defined = chart?.definedCenters ?? [];
  const undefinedC = chart?.undefinedCenters ?? [];
  const open = chart?.openCenters ?? [];

  // 1. Centers
  const definedCenters = defined.map((c) => ({
    title: c,
    name: c,
    tag: (CENTER_WHAT[c] ?? "").replace(/\.$/, "").toLowerCase(),
    line: CENTER_DEFINED[c] ?? "",
  }));
  const otherCenters = [
    ...undefinedC.map((c) => ({ title: c, name: c, tag: "", line: CENTER_UNDEFINED[c] ?? "" })),
    ...open.map((c) => ({ title: c, name: c, tag: "", line: CENTER_OPEN[c] ?? "" })),
  ];
  // MOCK AI2 (throwaway, 10/22): HD_MOCK_AI2=B drops the centers Takeaway box.
  const centersTakeaway =
    MOCK_AI2 === "B" ? [] : [lede(INTERPRETATION[3]), lede(INTERPRETATION[4])].filter(Boolean);

  // 2. Channels: numbers and name from the chart, direction from channelLines.
  const chans = chart?.channels ?? [];
  const channels = chans.map((ch, i) => {
    const numbers = ch.split(" ")[0];
    const name = ch.includes("(") ? ch.slice(ch.indexOf("(") + 1).split(")")[0] : "";
    const cl = chart?.channelLines?.[i] ?? "";
    const dir = cl.includes("), ") ? cl.slice(cl.indexOf("), ") + 3) : "";
    return { title: numbers, name, tag: dir, line: CHANNEL[channelKey(numbers)] ?? "" };
  });
  const chanLines = lines(s.get(MECHANICS[2]));
  // No channels: the list already says "No defined channels.", so only keep
  // what the reading says when it says more than that (10/16).
  const channelsTakeaway = chans.length
    ? chanLines.map(afterLabel)
    : chanLines.filter((l) => l.replace(/\.+$/, "") !== NO_CHANNELS.replace(/\.+$/, ""));

  // 3. Profile
  const m = /^(\d)\/(\d)/.exec(String(chart?.profile ?? ""));
  const digits = m ? [m[1], m[2]] : [];
  const profileLines = digits.map((d, i) => ({
    title: `Line ${d}`,
    name: PROFILE_LINE_NAMES[d] ?? "",
    tag: i === 0 ? "conscious" : "unconscious",
    line: PROFILE_LINE[d] ?? "",
  }));
  const profileLinesTakeaway = lines(s.get(MECHANICS[3])).map(afterLabel);
  const profileTakeaway = [...(sum.Profile ? [sum.Profile] : []), ...profileLinesTakeaway];

  return {
    summary: sum,
    definedCenters,
    otherCenters,
    centersTakeaway,
    channels,
    channelsTakeaway,
    profile: chart?.profile ?? "",
    profileLines,
    profileTakeaway,
    /**
     * Without the glance-box Profile sentence: the PDF and the page keep that
     * sentence in the glance box (Jeremy 10/16, call 4), so Start here carries
     * only the two profile-line sentences.
     */
    profileLinesTakeaway,
    /** The reading in the approved order -- see READING_ORDER. */
    reading: READING_ORDER.map(([heading, hasLede]) => {
      const p = lines(s.get(heading));
      // MOCK AI2 (throwaway, 10/22): HD_MOCK_AI2=A drops the two center
      // sections' bold opening line (it stays only in Start here's box).
      const dropLede = MOCK_AI2 === "A" && (heading === INTERPRETATION[3] || heading === INTERPRETATION[4]);
      if (dropLede) return { heading, lede: null, paragraphs: p.slice(1) };
      return { heading, lede: hasLede ? (p[0] ?? null) : null, paragraphs: hasLede ? p.slice(1) : p };
    }).filter((x) => x.lede || x.paragraphs.length),
    takeaways: lines(s.get(TAKEAWAYS)),
    disclaimer: DISCLAIMER,
  };
}

/**
 * The reading, in the Reading tab's order (phone PdfExport.READING_ORDER):
 * decision first, then energy, how you meet the world, on/off track, then the
 * cross and the definition (the old mechanics page, now ordinary sections),
 * then the two center sections. Every section keeps its bold lead line --
 * including the two center sections whose first sentence is ALSO the centers
 * Takeaway (call 6) -- except the cross and definition, which never had one.
 *
 * Paragraphs are the reading's LINES, as the phone's PDF cuts them.
 */
export const READING_ORDER = Object.freeze([
  [INTERPRETATION[1], true], // How you decide
  [INTERPRETATION[0], true], // Your energy, and how it starts
  [INTERPRETATION[2], true], // How you meet the world
  [INTERPRETATION[5], true], // When it's on track, and when it's off track
  [MECHANICS[0], false], // Your incarnation cross
  [MECHANICS[1], false], // Your definition
  [INTERPRETATION[3], true], // What is consistently yours
  [INTERPRETATION[4], true], // What you take in from others
]);
