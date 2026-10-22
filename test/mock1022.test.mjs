import { test } from "node:test";
import assert from "node:assert/strict";
import { heartLabel, HEART_LABEL } from "../shared/heartLabel.mjs";
import { crossName } from "../shared/crossName.mjs";
import { gateList } from "../shared/gateList.mjs";
import { SUMMARY, CHART, READING } from "../shared/pricing.mjs";

/** The two EGO nodes exactly as engine 0.5.0 writes them: the halo, then the ink. */
const HALO = `<text x="599.52" y="874" text-anchor="middle" dominant-baseline="central" font-family="Outfit, system-ui, sans-serif" font-size="16" font-weight="600" letter-spacing="3.04" fill="none" stroke="#0E1A2B" stroke-width="6" stroke-linejoin="round" opacity="0.9">EGO</text>`;
const INK = `<text x="599.52" y="874" text-anchor="middle" dominant-baseline="central" font-family="Outfit, system-ui, sans-serif" font-size="16" font-weight="600" letter-spacing="3.04" fill="#8DA3CC" opacity="0.9">EGO</text>`;
// A stand-in wrapper, not a drawing (a real one never goes in this public repo).
const SVG = `<svg><text x="1" y="2">THROAT</text>${HALO}${INK}</svg>`;

test("W13: both EGO nodes say HEART (EGO), everything else about them unchanged", () => {
  const out = heartLabel(SVG);
  assert.equal(out, SVG.replaceAll(">EGO<", `>${HEART_LABEL}<`));
  assert.ok(!out.includes(">EGO<"));
});

test("W13 options: two lines at the same spot; one line moved left", () => {
  const two = heartLabel(SVG, { two: true });
  assert.equal((two.match(/>HEART</g) ?? []).length, 2);
  assert.equal((two.match(/>\(EGO\)</g) ?? []).length, 2);
  assert.match(two, /y="866\.00"[^>]*font-size="16"[^>]*>HEART</);
  assert.match(two, /y="883\.00"[^>]*font-size="12"[^>]*>\(EGO\)</);
  assert.match(heartLabel(SVG, { dx: -10 }), /x="589\.52"[^>]*>HEART \(EGO\)</);
  assert.equal(heartLabel("<svg/>"), "<svg/>");
  assert.equal(heartLabel(null), null);
});

test("W14: 'Cross of the' in lower case, nothing else touched", () => {
  assert.equal(crossName("Right Angle Cross of The Vessel of Love (15/10 | 25/46)"), "Right Angle Cross of the Vessel of Love (15/10 | 25/46)");
  assert.equal(crossName("Right Angle Cross of Eden (6/36 | 12/11)"), "Right Angle Cross of Eden (6/36 | 12/11)");
  assert.equal(crossName(undefined), "");
});

test("gates are numbers only, lowest first", () => {
  assert.equal(gateList([20, 4, 34]), "4, 20, 34");
  assert.equal(gateList([]), "None");
});

test("the tier words: channels and gates on the summary, the drawing as the chart's reason", () => {
  assert.match(SUMMARY.blurb, /your channels and activated gates/);
  assert.match(SUMMARY.checkoutDescription, /channels and activated gates/);
  assert.match(CHART.blurb, /bodygraph/);
  assert.doesNotMatch(CHART.blurb, /channels|gates/);
  assert.match(READING.blurb, /twenty-six activations/);
});
