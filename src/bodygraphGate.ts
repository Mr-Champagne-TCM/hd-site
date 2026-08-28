/**
 * The drawing, on its way into the page.
 *
 * NAMED bodygraphGate, not bodygraph, and that is not decoration. This file
 * and the component next to it differed only by a capital B, and Windows
 * resolved `../Bodygraph` to THIS module while Linux would have resolved it to
 * the component -- a build that works on the laptop and ships something else,
 * or nothing, from CI. Two modules a case-fold apart is a trap whatever the
 * filesystem does today.
 *
 * The engine returns the bodygraph as SVG MARKUP, and markup that reaches the
 * page has to be put into the DOM as markup -- not as text and not as an
 * <img>. Which means this is the one place on the site where a response body
 * becomes live document, and it deserves a gate.
 *
 * WHY NOT AN <img src="data:image/svg+xml,...">, which would need no gate at
 * all: an SVG loaded that way is its own document and cannot reach the page's
 * webfont. Outfit would silently fall back to whatever the device has, every
 * label would take different metrics, and the positions were SOLVED against
 * Outfit at 16 with 0.19em of tracking -- SPLEEN and SOLAR PLEXUS sit six units
 * from a gate disc. A font substitution puts type back on top of the graphics,
 * which is the exact fault this drawing has been through four rounds of fixing.
 * So it goes in inline, and the price of inline is this file.
 *
 * WHY A GATE AT ALL, given the engine is ours, private, and behind a key. All
 * three of those are facts about today. The drawing contains no user input --
 * gate numerals and nine fixed centre names, nothing a visitor typed -- so
 * there is nothing to escape and no injection to defend against right now. The
 * gate is not defending against a known hole; it is refusing to let one open
 * later without anyone noticing.
 *
 * ALLOWLIST, NOT BLOCKLIST. A list of forbidden tags is a list of the attacks
 * somebody thought of. This names the thirteen elements the renderer actually
 * emits, counted off a real render, and refuses everything else -- so a
 * <script>, a <foreignObject>, a <use> pointing somewhere, or an <image>
 * fetching a tracking pixel all fail the same way: by not being on the list.
 */

/**
 * Every element BodygraphSvg emits, counted off a real 187 KB render:
 * circle 833, line 690, stop 453, linearGradient 81, text 80, polygon 72,
 * radialGradient 64, path 5, title 1, svg 1, rect 1, defs 1.
 *
 * If the renderer gains an element this list has to gain it too, and the test
 * that walks a real render is what will say so.
 */
export const ALLOWED_ELEMENTS = [
  "svg", "defs", "title", "g",
  "linearGradient", "radialGradient", "stop",
  "circle", "line", "polygon", "polyline", "path", "rect", "text", "tspan",
] as const;

/** Roughly a tenth of a real render at the low end, and ten times it at the high. */
const MIN_BYTES = 20_000;
const MAX_BYTES = 2_000_000;

const ELEMENT = /<\s*\/?\s*([a-zA-Z][a-zA-Z0-9:-]*)/g;
/** Any on* handler, however it is spaced or cased. */
const EVENT_ATTR = /\son[a-zA-Z]+\s*=/i;
/** Anything that could reach off the page, or execute. */
const OUTBOUND = /(xlink:href|(?<![a-zA-Z-])href\s*=)|javascript:|data:text\/html|<!ENTITY|<!DOCTYPE/i;

export type Verdict = { ok: true; svg: string } | { ok: false; reason: string };

/**
 * Decide whether this markup may be put into the page.
 *
 * Returns a REASON rather than a boolean, because the one thing worse than
 * refusing a good drawing is refusing it silently -- the page has to be able to
 * say something happened, and a developer has to be able to find out what.
 */
export function checkBodygraph(svg: unknown): Verdict {
  if (typeof svg !== "string") return { ok: false, reason: "not a string" };

  const trimmed = svg.trim();
  if (!trimmed.startsWith("<svg")) return { ok: false, reason: "does not start with <svg" };
  if (!trimmed.endsWith("</svg>")) return { ok: false, reason: "truncated: does not end with </svg>" };

  // A truncated response is the realistic failure here, not an attack. Size is
  // the cheapest way to notice one that still happens to end in </svg>.
  const bytes = new TextEncoder().encode(trimmed).length;
  if (bytes < MIN_BYTES) return { ok: false, reason: `too small to be a chart: ${bytes} bytes` };
  if (bytes > MAX_BYTES) return { ok: false, reason: `too large: ${bytes} bytes` };

  if (EVENT_ATTR.test(trimmed)) return { ok: false, reason: "carries an event handler" };
  if (OUTBOUND.test(trimmed)) return { ok: false, reason: "reaches outside the drawing" };

  // Compared in lower case on BOTH sides. SVG element names are case
  // sensitive in XML, but an HTML parser folds them, so <SCRIPT> and <script>
  // are the same thing to a browser and must be the same thing here. Matching
  // the allowlist's own spelling would let <SCRIPT> through on a technicality.
  const allowed = new Set<string>(ALLOWED_ELEMENTS.map((e) => e.toLowerCase()));
  const seen = new Set<string>();
  for (const m of trimmed.matchAll(ELEMENT)) {
    const tag = m[1].toLowerCase();
    seen.add(tag);
    if (!allowed.has(tag)) return { ok: false, reason: `unexpected element <${tag}>` };
  }

  // A drawing with no <text> has no gate numbers; one with no <circle> has no
  // discs. Both would pass every check above and be a picture of nothing.
  for (const required of ["svg", "text", "circle", "line", "polygon"]) {
    if (!seen.has(required)) return { ok: false, reason: `no <${required}> in the drawing` };
  }

  return { ok: true, svg: trimmed };
}
