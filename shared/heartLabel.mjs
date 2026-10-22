/**
 * "HEART (EGO)" ON THE DRAWING (W13; Jeremy's call 10/22: the drawing's
 * "EGO" against the tables' "Heart" read as two different centers).
 *
 * The engine draws the Heart's name as "EGO", outside the triangle, at
 * (598, 874), Outfit 16 with 3.04 tracking, twice: a dark halo, then the ink
 * (BodygraphGeometry.kt, LABELS_OUTSIDE). This swaps the WORD in both text
 * nodes and nothing else -- same position, font, size, tracking and colors --
 * so the page, the PDF and the website's samples all say the tables' name
 * with the old one kept beside it.
 *
 * MOCK, 10/22: done here on the engine's SVG so it can be seen before the
 * engine (and the phone's own copy of the geometry, hd-reading-app
 * Bodygraph.kt) is changed and released.
 *
 * FIT (measured 10/22, Outfit 600 in Chrome, drawing units): at the engine's
 * own spot, one line clears every disc and label but sits 0.9 units from the
 * 40-37 channel's tube (its halo touches the tube's dark edge). Options:
 *   dx: -10   the same line 10 units left: 8.7 clear of 40-37, 22.9 of 26-44
 *   two       "HEART" over a smaller "(EGO)" at the same spot: 19+ clear
 */
export const HEART_LABEL = "HEART (EGO)";

const EGO_NODE = /<text\b([^>]*)>EGO<\/text>/g;

const num = (attrs, name) => Number((new RegExp(`\\b${name}="([-\\d.]+)"`).exec(attrs) ?? [])[1]);
const setAttr = (attrs, name, value) => attrs.replace(new RegExp(`\\b${name}="[-\\d.]+"`), `${name}="${value}"`);

export function heartLabel(svg, { two = false, dx = 0 } = {}) {
  if (typeof svg !== "string" || !svg.includes(">EGO<")) return svg;
  const moved = (attrs) => (dx ? setAttr(attrs, "x", (num(attrs, "x") + dx).toFixed(2)) : attrs);
  if (!two) return svg.replace(EGO_NODE, (_, attrs) => `<text${moved(attrs)}>${HEART_LABEL}</text>`);
  return svg.replace(EGO_NODE, (_, attrs) => {
    const y = num(attrs, "y");
    const sw = num(attrs, "stroke-width");
    const at = (dy, size) => {
      const a = setAttr(setAttr(moved(attrs), "y", (y + dy).toFixed(2)), "font-size", size);
      // the halo keeps its weight relative to the letters, or the small line goes muddy
      return Number.isFinite(sw) ? setAttr(a, "stroke-width", +((sw * size) / 16).toFixed(2)) : a;
    };
    return `<text${at(-8, 16)}>HEART</text><text${at(9, 12)}>(EGO)</text>`;
  });
}

/** Which way this run draws it: one line (default), ?fix=W13B two lines, ?fix=W13C one line 10 units left. */
export function heartMode(fix) {
  return fix("W13B") ? { two: true } : fix("W13C") ? { dx: -10 } : {};
}
