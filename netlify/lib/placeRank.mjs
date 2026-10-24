/**
 * THE TOWN FIRST, THE COUNTRY LAST (batch-1024 item 6, live retest 10/23).
 *
 * Typing "Denver" listed Denver, then Henderson, Copenhagen, Århus, Odense and
 * Aalborg. The engine's index (hd-engine CityIndex.search) matches every word
 * of a row -- town, state, country -- and, when the exact matches run short,
 * fills the list with near-misses: "denver" is two letters from "denmar(k)",
 * so every Danish town came along on its country's name, beside Henderson,
 * which is at least a near-miss on a TOWN.
 *
 * The engine is its own service; the shop orders what it answers, here, before
 * the answer is cached or sent. Same rows, same count, a different order:
 *
 *   0  the town's name starts with the first word typed     Denver, Colorado
 *   1  a later word of the town's name starts with it       South Portland, Maine
 *   2  the town's name holds it                              (rare: a joined name)
 *   3  the town's name is a near-miss for it                 Henderson, Nevada
 *   4  only the state or country matched                     Copenhagen, Denmark
 *
 * So a whole-word town prefix ("Den" -> Denton) always beats a country prefix
 * (Denmark), and a town-name match beats a country-name match. Inside a class
 * the engine's own order stands (a stable sort), so everything the engine's
 * ranking already got right -- Portland, Coeur d'Alene, Boise, Hartford, a
 * whole state as a fallback -- reads as before.
 *
 * Words are compared as the engine compares them: accents dropped, lower case,
 * anything but a letter or digit a space ("Coeur d'Alene" -> "coeur d alene").
 */

export function normalise(s) {
  return String(s ?? "")
    .normalize("NFD")
    .replace(/\p{Mn}+/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N} ]/gu, " ")
    .split(" ")
    .filter(Boolean)
    .join(" ");
}

/** Bounded edit distance, as the engine allows a slip: one for short words, two for longer. */
function within(a, b) {
  const allowed = a.length <= 5 ? 1 : 2;
  if (Math.abs(a.length - b.length) > allowed) return false;
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let best = i;
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(cur[j - 1] + 1, prev[j] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      if (cur[j] < best) best = cur[j];
    }
    if (best > allowed) return false;
    prev = cur;
  }
  return prev[b.length] <= allowed;
}

/** A near-miss for a word of `words`, or for the start of one (still typing). */
function looksLike(words, token) {
  if (token.length < 3) return false;
  return words.some((w) => w.length >= 3 && (within(token, w) || (w.length > token.length && within(token, w.slice(0, token.length)))));
}

/** Which class a row is in for what was typed (0 best, 4 a state or country only). */
export function placeClass(query, label) {
  const first = normalise(query).split(" ")[0] ?? "";
  if (!first) return 0;
  const town = normalise(String(label ?? "").split(",")[0]);
  const words = town.split(" ").filter(Boolean);
  if (town.startsWith(first)) return 0;
  if (words.slice(1).some((w) => w.startsWith(first))) return 1;
  if (town.replace(/ /g, "").includes(first)) return 2;
  if (looksLike(words, first)) return 3;
  return 4;
}

/** The engine's rows, town matches first; stable, so the engine's order stands inside a class. Never throws. */
export function rankPlaces(query, places) {
  if (!Array.isArray(places) || places.length < 2) return places;
  try {
    return places
      .map((p, i) => ({ p, i, c: placeClass(query, p?.label) }))
      .sort((a, b) => a.c - b.c || a.i - b.i)
      .map((x) => x.p);
  } catch {
    return places;
  }
}
