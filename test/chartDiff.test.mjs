import { test } from "node:test";
import assert from "node:assert/strict";
import {
  chartDifferences,
  describeDifferences,
  previousChart,
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

test("nothing to compare against is silence, not a warning", () => {
  assert.deepEqual(chartDifferences(null, CHART), []);
  assert.deepEqual(chartDifferences(CHART, null), []);
});

// --- finding the previous one ----------------------------------------------

function storeWith(records) {
  const data = new Map(Object.entries(records));
  return {
    async list() {
      return { blobs: [...data.keys()].map((key) => ({ key })) };
    },
    get: async (k) => data.get(k) ?? null,
    _raw: data,
  };
}

const loader = async (store, id) => store._raw.get(id) ?? null;

test("the most recently filled chart for that address is the one compared", async () => {
  const store = storeWith({
    old: { tier: 0, output: CHART, pending: false, buyer: { email: "b@example.com" }, filledAt: 100 },
    newer: { tier: 1, output: CHART, pending: false, buyer: { email: "b@example.com" }, filledAt: 900 },
    other: { tier: 1, output: CHART, pending: false, buyer: { email: "someone@example.com" }, filledAt: 999 },
    self: { tier: 2, output: null, pending: true, buyer: { email: "b@example.com" }, filledAt: 0 },
  });
  const found = await previousChart(store, {
    // Deliberately odd casing: the address is the identity, and a buyer who
    // typed it differently at Stripe must still match.
    email: "B@example.com",
    excludeId: "self",
    loadReading: loader,
  });
  assert.equal(found.filledAt, 900, "the wrong previous chart was chosen");
});

test("THE PURCHASE BEING FILLED IS NEVER COMPARED WITH ITSELF", async () => {
  const store = storeWith({
    self: { tier: 2, output: CHART, pending: false, buyer: { email: "b@example.com" }, filledAt: 500 },
  });
  assert.equal(
    await previousChart(store, { email: "b@example.com", excludeId: "self", loadReading: loader }),
    null,
  );
});

test("an unreadable store is a comparison NOT MADE, never a failure", async () => {
  // This runs while somebody is waiting for a chart they have paid for.
  const angry = {
    async list() {
      throw new Error("blobs are down");
    },
  };
  assert.equal(await previousChart(angry, { email: "b@example.com", loadReading: loader }), null);
  assert.equal(await previousChart(null, { email: "b@example.com", loadReading: loader }), null);
  assert.equal(await previousChart(storeWith({}), { email: null, loadReading: loader }), null);
});

test("a first purchase has nothing to differ from", async () => {
  const store = storeWith({
    theirs: { tier: 0, output: null, pending: true, buyer: { email: "b@example.com" } },
  });
  assert.equal(
    await previousChart(store, { email: "b@example.com", excludeId: "theirs", loadReading: loader }),
    null,
  );
});
