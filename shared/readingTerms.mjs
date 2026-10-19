import {
  AUTHORITY,
  CENTERS,
  DEFINITION,
  channelLink,
  crossLink,
  lineLink,
  profileLink,
  topic,
  typeLink,
} from "./libraryLinks.mjs";
import { CHANNEL } from "./libraryGlance.mjs";

/**
 * THE HUMAN DESIGN WORDS IN THE WRITTEN READING, MADE CLICKABLE (Jeremy 10/19,
 * fix 7): "make the words clickable and they land in the right place in the
 * human design library. Decode here, don't dilute."
 *
 * The reading's own words stay exactly as written (no prompt change). This only
 * finds the Human Design terms in them and says where each one opens in the
 * library. ONE function for the shop's page, the shop's PDF and -- ported word
 * for word to ReadingTerms.kt -- the phone's PDF and screens, so the same word
 * opens the same entry everywhere.
 *
 * ONLY WHERE AN ANCHOR EXISTS. Every destination is one the live library
 * answers today (tools/check-pdf-links.mjs checks them): a type's fold
 * (#type-generator), a profile (#profile-5-2), a profile line (#line-5), a
 * channel (#channel-27-50), a gate (#gate-34), the chart's own cross
 * (#cross-l-endeavour), and the topic sections #authority, #centers,
 * #definition, #channels. A center named in the text (Sacral, Spleen...) opens
 * the Centers section: the library has no anchor for a single center yet.
 *
 * NOT OVER-LINKED: one link per destination per paragraph -- the first mention.
 * "Your undefined Head center, undefined Ajna center, undefined Throat
 * center..." links "undefined Head center" once, not seven times.
 */

/** The library's twelve profiles (its openHash refuses any other pair). */
const PROFILES = new Set(["1/3", "1/4", "2/4", "2/5", "3/5", "3/6", "4/6", "4/1", "5/1", "5/2", "6/2", "6/3"]);

const LINE_NAMES = { Investigator: 1, Hermit: 2, Martyr: 3, Opportunist: 4, Heretic: 5, "Role Model": 6 };
const NUMBER_WORDS = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6 };
const TYPES = ["Manifesting Generator", "Generator", "Projector", "Manifestor", "Reflector"];

/** Words may be broken across lines by the PDF's layout ("\n" for a space). */
const S = String.raw`[ \n]+`;

const esc = (w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** The chart's own channels as [name, "lo-hi"]: "27-50 (Preservation)" -> ["Preservation", "27-50"]. */
function channelNames(c) {
  const out = [];
  for (const ch of Array.isArray(c?.channels) ? c.channels : []) {
    const m = /^(\d{1,2})-(\d{1,2})\s*\(([^)]+)\)/.exec(String(ch));
    if (!m) continue;
    const [a, b] = [Number(m[1]), Number(m[2])].sort((x, y) => x - y);
    if (CHANNEL[`${a}-${b}`] !== undefined && /^[A-Za-z][A-Za-z ']*$/.test(m[3].trim())) out.push([m[3].trim(), `${a}-${b}`]);
  }
  return out;
}

/**
 * The rules, most specific first. Each: a regex (global), and the link for a
 * match -- or null when that particular match has no anchor.
 */
function rules(chart) {
  const c = chart ?? {};
  const ownCross = crossLink(c.incarnationCross);
  return [
    // The chart's own cross, by its kind and name, however the reading spells the name.
    [new RegExp(String.raw`\b(?:Right${S}Angle|Left${S}Angle|Juxtaposition)${S}Cross${S}of${S}[A-Z][a-z]+(?:${S}[A-Z][a-z]+)?`, "g"), () => ownCross],
    [new RegExp(String.raw`\b[Ii]ncarnation${S}[Cc]ross\b`, "g"), () => ownCross],
    // Types (Manifesting Generator before Generator).
    [new RegExp(String.raw`\b(Manifesting${S}Generator|Generator|Projector|Manifestor|Reflector)s?\b`, "g"), (m) => typeLink(TYPES.find((t) => t === m[1].replace(/\s+/g, " ")))],
    [/\b(?:Strategy|strategy|Signature|Not-[Ss]elf|not-self)\b/g, () => typeLink(c.type)],
    // Authority: named, "inner", "your"/"bodily", or capitalised. Never the
    // plain English word ("the ultimate authority on what fits your life").
    [new RegExp(String.raw`\b(?:(?:Emotional|Sacral|Splenic|Ego|Self-Projected|Mental|Lunar|[Ii]nner|[Bb]odily)${S}[Aa]uthority|Authority)\b`, "g"), () => AUTHORITY],
    [/(?<=\b[Yy]our[ \n])authority\b/g, () => AUTHORITY],
    // Definition.
    [new RegExp(String.raw`\b(?:(?:Single|Split|Triple${S}Split|Quadruple${S}Split|single|split|triple${S}split|quadruple${S}split|[Nn]o)${S})?[Dd]efinition\b`, "g"), () => DEFINITION],
    // Profiles: "5/2" (only the twelve real ones), then the word.
    [/\b([1-6])\/([1-6])\b/g, (m) => (PROFILES.has(`${m[1]}/${m[2]}`) ? profileLink(`${m[1]}/${m[2]}`) : null)],
    // Profile lines: "Line 5", "line five", "Heretic".
    [/\b[Ll]ine (one|two|three|four|five|six|[1-6])\b/g, (m) => lineLink(String(NUMBER_WORDS[m[1]] ?? m[1]))],
    [new RegExp(String.raw`\b(Investigator|Hermit|Martyr|Opportunist|Heretic|Role${S}Model)s?\b`, "g"), (m) => lineLink(String(LINE_NAMES[m[1].replace(/\s+/g, " ")]))],
    [/\b[Pp]rofile\b/g, () => profileLink(c.profile)],
    // Channels by number ("27-50" or "channel 27-50", either order), only the library's 36.
    [/\b(?:[Cc]hannel )?(\d{1,2})-(\d{1,2})\b/g, (m) => {
      const [a, b] = [Number(m[1]), Number(m[2])].sort((x, y) => x - y);
      return CHANNEL[`${a}-${b}`] !== undefined ? channelLink(`${a}-${b}`) : null;
    }],
    // ...and by the chart's own channel names ("channel of Preservation").
    ...channelNames(c).map(([name, key]) => [
      new RegExp(String.raw`\b(?:[Cc]hannel${S}of${S}(?:the${S})?)?${name.split(" ").map(esc).join(S)}\b`, "g"),
      () => channelLink(key),
    ]),
    // Gates by number.
    [/\b[Gg]ates? (\d{1,2})\b/g, (m) => (Number(m[1]) >= 1 && Number(m[1]) <= 64 ? topic(`gate-${Number(m[1])}`) : null)],
    // Centers: a state and/or a name, with or without "center" after it.
    [new RegExp(
      String.raw`\b(?:(?:undefined|defined|open|Undefined|Defined|Open)${S})?(?:Head|Ajna|Throat|G(?=${S}[Cc]enter)|Heart|Ego(?=${S}[Cc]enter)|Spleen|Sacral|Solar${S}Plexus|Root)(?:${S}[Cc]enters?)?\b`,
      "g",
    ), () => CENTERS],
    [new RegExp(String.raw`\b(?:(?:undefined|defined|open|Undefined|Defined|Open)${S})?[Cc]enters?\b`, "g"), () => CENTERS],
    [new RegExp(String.raw`\b(?:not${S})?colou?red${S}in\b`, "g"), () => CENTERS],
    [/\b(?:undefined|Undefined|defined|Defined)\b/g, () => CENTERS],
  ];
}

/**
 * Where the Human Design terms in one paragraph link to.
 * Returns [{ start, end, href }], sorted, never overlapping, one per destination.
 */
export function termSpans(text, chart) {
  const s = String(text ?? "");
  const found = [];
  rules(chart).forEach(([re, hrefOf], rank) => {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(s))) {
      const href = hrefOf(m);
      if (href) found.push({ start: m.index, end: m.index + m[0].length, href, rank });
      if (m[0].length === 0) re.lastIndex += 1;
    }
  });
  // Earliest first; at the same start the more specific rule, then the longer match.
  found.sort((a, b) => a.start - b.start || a.rank - b.rank || b.end - a.end);
  const out = [];
  const used = new Set();
  let reach = 0;
  for (const f of found) {
    if (f.start < reach) continue; // overlaps a term already taken
    // A shorter, more general match inside a longer one already taken is skipped above;
    // a longer match starting at the same place as a more specific one loses to it.
    if (used.has(f.href)) {
      reach = Math.max(reach, f.end); // the word is still "taken", just not linked
      continue;
    }
    used.add(f.href);
    out.push({ start: f.start, end: f.end, href: f.href });
    reach = f.end;
  }
  return out;
}

/** The paragraph cut into runs: [{ text, href }] with href null between terms. */
export function linkedRuns(text, chart) {
  const s = String(text ?? "");
  const runs = [];
  let at = 0;
  for (const t of termSpans(s, chart)) {
    if (t.start > at) runs.push({ text: s.slice(at, t.start), href: null });
    runs.push({ text: s.slice(t.start, t.end), href: t.href });
    at = t.end;
  }
  if (at < s.length) runs.push({ text: s.slice(at), href: null });
  return runs;
}
