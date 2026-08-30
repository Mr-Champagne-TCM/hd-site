/**
 * The thirteen bodies, as words rather than as the engine spells them.
 *
 * SHARED, because the activations are drawn twice -- once into the PDF on the
 * server and once onto the reading page in the browser -- and two copies of a
 * naming table is two places for "NORTH_NODE" to escape from. The same
 * reasoning as shared/pricing.mjs: a value shown in two surfaces lives in one
 * file, or the surfaces eventually disagree.
 *
 * The engine returns SCREAMING_SNAKE because that is what its Kotlin enum is
 * called. That is machinery, and machinery on a document somebody paid the
 * reading tier's price for reads as something half-finished.
 */

const NAMES = Object.freeze({
  SUN: "Sun",
  EARTH: "Earth",
  MOON: "Moon",
  NORTH_NODE: "North Node",
  SOUTH_NODE: "South Node",
  MERCURY: "Mercury",
  VENUS: "Venus",
  MARS: "Mars",
  JUPITER: "Jupiter",
  SATURN: "Saturn",
  URANUS: "Uranus",
  NEPTUNE: "Neptune",
  PLUTO: "Pluto",
});

/**
 * "NORTH_NODE" -> "North Node".
 *
 * AN UNKNOWN KEY IS TITLE-CASED RATHER THAN PRINTED RAW. If the engine ever
 * adds a body this table has not heard of, the failure should be a slightly
 * unusual heading, not `CHIRON_RETROGRADE` in the middle of a paid reading.
 */
export function planetName(raw) {
  const key = String(raw ?? "").trim().toUpperCase();
  if (!key) return "";
  if (NAMES[key]) return NAMES[key];
  return key
    .split(/[_\s]+/)
    .filter(Boolean)
    .map((w) => w[0] + w.slice(1).toLowerCase())
    .join(" ");
}

/**
 * "6.2" -- the gate and the line within it, which is how it is written
 * everywhere in Human Design and how the app writes it too.
 */
export function activationLabel(a) {
  if (!a || a.gate === null || a.gate === undefined) return "";
  return a.line === null || a.line === undefined ? String(a.gate) : `${a.gate}.${a.line}`;
}

/** The two sides, in the order they are always shown. */
export const SIDES = Object.freeze([
  {
    key: "personality",
    label: "Personality",
    sub: "conscious — what you know",
  },
  {
    key: "design",
    label: "Design",
    sub: "unconscious — what the body knows",
  },
]);
