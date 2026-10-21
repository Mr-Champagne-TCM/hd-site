import { test } from "node:test";
import assert from "node:assert/strict";
import {
  chartDifferences,
  describeDifferences,
} from "../netlify/lib/chartDiff.mjs";

/**
 * "IF WE DO THAT WE HAVE TO BE IMPECCABLE, bc doing this in error will lose
 * client confidence greatly."
 *
 * So the tests that matter here are the ones about NOT crying wolf. A warning
 * that fires when nothing changed does more damage than the silence it
 * replaces, because it teaches somebody that their chart is unreliable.
 */

const CHART = {
  type: "Manifesting Generator",
  strategy: "Wait to respond, then inform",
  authority: "Sacral",
  profile: "2/4",
  definition: "Single",
  signature: "Satisfaction",
  notSelfTheme: "Frustration",
  incarnationCross: "Right Angle Cross of Eden (6/36 | 12/11)",
  definedCenters: ["Throat", "Sacral"],
  openCenters: ["Head", "Ajna"],
  channels: ["20-34 (Charisma)"],
};

test("the same chart is silent", () => {
  assert.deepEqual(chartDifferences(CHART, { ...CHART }), []);
});

test("A DIFFERENT TIER IS NOT A DIFFERENT CHART", () => {
  // The summary carries fewer fields than the reading. Comparing one against
  // the other must not manufacture a difference out of what a tier withholds.
  const summary = { ...CHART };
  delete summary.channels;
  delete summary.openCenters;
  assert.deepEqual(chartDifferences(summary, CHART), []);
  assert.deepEqual(chartDifferences(CHART, summary), []);
});

test("neither is the drawing, the note, or anything else that is not the moment", () => {
  const withExtras = {
    ...CHART,
    bodygraphSvg: "<svg/>",
    note: "Birth time unknown - charted at noon.",
    provisional: ["type"],
    timeKnown: false,
  };
  assert.deepEqual(chartDifferences(CHART, withExtras), []);
});

test("order and whitespace are not changes", () => {
  assert.deepEqual(
    chartDifferences(CHART, {
      ...CHART,
      definedCenters: ["Sacral", "Throat"],
      profile: " 2/4 ",
    }),
    [],
  );
});

test("a real change is caught and named", () => {
  const moved = { ...CHART, profile: "1/3", authority: "Emotional" };
  const diff = chartDifferences(CHART, moved);
  assert.deepEqual(diff.sort(), ["authority", "profile"]);
  assert.equal(describeDifferences(diff.sort()), "Authority and Profile");
});

test("a changed channel list is caught", () => {
  const diff = chartDifferences(CHART, { ...CHART, channels: ["20-34 (Charisma)", "1-8 (Inspiration)"] });
  assert.deepEqual(diff, ["channels"]);
  assert.equal(describeDifferences(diff), "your channels");
});

/**
 * THE MEANING OF `openCenters` MOVED UNDER STORED READINGS.
 *
 * Before the engine told undefined from open, `openCenters` was every centre
 * not defined. A reading stored then, upgraded now, has the SAME birth moment
 * and a different `openCenters` array -- which is exactly the false alarm this
 * module promises never to raise. The record's shape says which vocabulary it
 * speaks; across the boundary the field is not compared at all.
 */
test("A READING STORED BEFORE THE THIRD STATE IS NOT A DIFFERENT CHART", () => {
  const stored = { ...CHART, openCenters: ["Head", "Ajna", "G", "Heart", "Spleen", "Solar Plexus", "Root"] };
  const fresh = {
    ...CHART,
    undefinedCenters: ["Ajna", "G", "Heart", "Spleen", "Solar Plexus", "Root"],
    openCenters: ["Head"],
  };
  assert.deepEqual(chartDifferences(stored, fresh), []);
  assert.deepEqual(chartDifferences(fresh, stored), []);
});

test("two three-state charts still catch a moved white centre", () => {
  const a = { ...CHART, undefinedCenters: ["Ajna"], openCenters: ["Head"] };
  const b = { ...CHART, undefinedCenters: ["Head"], openCenters: ["Ajna"] };
  assert.deepEqual(chartDifferences(a, b).sort(), ["openCenters", "undefinedCenters"]);
  assert.equal(describeDifferences(["undefinedCenters"]), "your undefined centers");
});

test("nothing to compare against is silence, not a warning", () => {
  assert.deepEqual(chartDifferences(null, CHART), []);
  assert.deepEqual(chartDifferences(CHART, null), []);
});

// --- the alarm is retired (release 2) ----------------------------------------
//
// previousChart scanned the whole store by email to find "the chart you had
// before". An upgrade now names the record it grew from, so the scan is gone.

test("previousChart is gone with the alarm it fed", async () => {
  const mod = await import("../netlify/lib/chartDiff.mjs");
  assert.equal(mod.previousChart, undefined);
});
