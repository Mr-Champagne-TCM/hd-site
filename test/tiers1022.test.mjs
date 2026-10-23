import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { gateList } from "../shared/gateList.mjs";
import { SUMMARY, CHART, READING } from "../shared/pricing.mjs";
import { crossLink } from "../shared/libraryLinks.mjs";
import { chartFactsOnly, marginNotes } from "../netlify/lib/interpretation.mjs";
import { printSwap } from "../netlify/lib/readingPdf.mjs";

/**
 * Jeremy's 10/22 calls, as plain code: the tier split (B), and the drawing's
 * HEART (EGO) label and the "Cross of the" names, which since engine 0.6.0 are
 * the ENGINE's words (D) -- the shop passes them through untouched.
 */

test("gates are numbers only, lowest first", () => {
  assert.equal(gateList([20, 4, 34]), "4, 20, 34");
  assert.equal(gateList([]), "None");
});

test("the tier words: channels and gates on the summary, the drawing as the chart's reason", () => {
  assert.match(SUMMARY.blurb, /your channels and activated gates/);
  assert.match(SUMMARY.checkoutDescription, /channels and activated gates/);
  assert.doesNotMatch(CHART.blurb, /channels|gates/);
  assert.match(READING.blurb, /twenty-six activations/);
  // "The same chart, a step further": each price says only what that step adds.
  assert.match(CHART.adds, /bodygraph/);
  assert.doesNotMatch(CHART.adds, /channels|gates/);
  assert.match(READING.addsToSummary, /bodygraph.*twenty-six activations.*written reading/);
  assert.equal(SUMMARY.adds, null);
});

test("the chart card is option B, word for word, with the site's curly apostrophe", () => {
  assert.equal(CHART.blurb, "Your bodygraph, drawn — the summary’s values as a picture, on a page you can share and a PDF you keep.");
  assert.equal(CHART.theirBlurb, "Their bodygraph, drawn — the summary’s values as a picture, on a page you can share and a PDF you keep.");
});

/* ------------------------------------------------- the engine's words (0.6.0) */

// Stand-in nodes in the shape engine 0.6.0 draws the label: "HEART" over a smaller
// "(EGO)", a halo then the ink. Not a drawing (a real one never goes in this public repo).
const LABEL =
  `<text x="599.52" y="866" font-size="16" fill="none" stroke="#0E1A2B" stroke-width="6">HEART</text>` +
  `<text x="599.52" y="883" font-size="12" fill="none" stroke="#0E1A2B" stroke-width="4.5">(EGO)</text>` +
  `<text x="599.52" y="866" font-size="16" fill="#8DA3CC">HEART</text>` +
  `<text x="599.52" y="883" font-size="12" fill="#8DA3CC">(EGO)</text>`;

test("ENGINE 0.6.0: the drawing's HEART (EGO) label reaches the PDF as the engine drew it", () => {
  const { svg } = printSwap(`<svg>${LABEL}</svg>`);
  // Only the print colors move (the halo with the ground); every word and place stays.
  assert.equal(svg.replace(/#5B6576/g, "#0E1A2B"), `<svg>${LABEL}</svg>`);
  assert.equal((svg.match(/>HEART</g) ?? []).length, 2);
  assert.equal((svg.match(/>\(EGO\)</g) ?? []).length, 2);
});

test("NO SHOP CODE REWRITES THE DRAWING'S WORDS or the cross's name any more (the shims are gone)", () => {
  const files = [];
  const walk = (dir) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      if (e.isDirectory()) walk(join(dir, e.name));
      else if (/\.(mjs|ts|tsx)$/.test(e.name)) files.push(join(dir, e.name));
    }
  };
  for (const d of ["src", "netlify", "shared"]) walk(d);
  for (const f of files) {
    const s = readFileSync(f, "utf8");
    assert.doesNotMatch(s, /heartLabel|crossName\(|>EGO<|Cross of The\\b/, f);
  }
});

test("ENGINE 0.6.0: 'Cross of the' is printed as the engine names it, and opens the same library entry", () => {
  const now = "Right Angle Cross of the Sphinx (1/2 | 7/13)";
  const before = "Right Angle Cross of The Sphinx (1/2 | 7/13)";
  assert.equal(crossLink(now), crossLink(before));
  const notes = Object.values(marginNotes({ incarnationCross: now, profile: "1/3", type: "Generator", authority: "Sacral" })).flat();
  const cross = notes.find((n) => n[0] === "INCARNATION CROSS");
  assert.equal(cross[1], "Right Angle Cross of the Sphinx (1/2 | 7/13)");
  // The model is given the same name, so its words match the tables.
  assert.match(chartFactsOnly({ incarnationCross: now }), /Incarnation Cross: Right Angle Cross of the Sphinx \(1\/2 \| 7\/13\)/);
});
