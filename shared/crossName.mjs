/**
 * THE CROSS'S NAME AS PRINTED (W14, 10/21 live test; Jeremy's call 10/22).
 *
 * The engine names some crosses "Right Angle Cross of The Vessel of Love",
 * "Cross of The Sphinx": a capital "The" in the middle of a name, where every
 * other name is "Cross of Eden", "Cross of Planning". Printed with "the" in
 * lower case everywhere a buyer reads it: the page, the PDF, the margins.
 *
 * The library link is worked out from the engine's own name (crossLink lower-
 * cases it anyway), so this changes the words only, never where they go.
 * The real fix belongs in the engine's cross table; until it moves there, this
 * is the one place the shop says it.
 */
export function crossName(cross) {
  return String(cross ?? "").replace(/\bCross of The\b/g, "Cross of the");
}
