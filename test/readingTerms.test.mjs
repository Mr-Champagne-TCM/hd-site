import { test } from "node:test";
import assert from "node:assert/strict";
import { linkedRuns, termSpans } from "../shared/readingTerms.mjs";
import { chartTitle, cleanChartName, firstName } from "../shared/chartName.mjs";
import { LIBRARY } from "../shared/libraryLinks.mjs";

/**
 * Fix 7 (Jeremy 10/19): the Human Design words in the reading open the right
 * library entry -- "Decode here, don't dilute" -- and only where an anchor
 * exists, once per destination per paragraph.
 */

const CHART = {
  type: "Generator",
  profile: "5/2",
  incarnationCross: "Left Angle Cross of Endeavor (21/48 | 54/53)",
  channels: ["27-50 (Preservation)"],
};
const links = (text, chart = CHART) =>
  linkedRuns(text, chart)
    .filter((r) => r.href)
    .map((r) => [r.text, r.href.replace(LIBRARY, "")]);

test("each kind of term lands on its own anchor", () => {
  assert.deepEqual(links("Your Sacral center acts as your inner authority."), [
    ["Sacral center", "#centers"],
    ["inner authority", "#authority"],
  ]);
  assert.deepEqual(links("As a Generator with a 5/2 profile, line five and the Hermit both matter."), [
    ["Generator", "#type-generator"],
    ["5/2", "#profile-5-2"],
    ["line five", "#line-5"],
    ["Hermit", "#line-2"],
  ]);
  assert.deepEqual(links("Your Left Angle Cross of Endeavor links gate 21 to your channel 27-50."), [
    ["Left Angle Cross of Endeavor", "#cross-l-endeavor"],
    ["gate 21", "#gate-21"],
    ["channel 27-50", "#channel-27-50"],
  ]);
  assert.deepEqual(links("Your Single definition joins your defined centers."), [
    ["Single definition", "#definition"],
    ["defined centers", "#centers"],
  ]);
  assert.deepEqual(links("A Manifesting Generator is not a Generator."), [
    ["Manifesting Generator", "#type-manifesting-generator"],
    ["Generator", "#type-generator"],
  ]);
});

test("one link per destination per paragraph: the first mention", () => {
  const t = "Your undefined Head center, undefined Ajna center and undefined Throat center take in a lot.";
  assert.deepEqual(links(t), [["undefined Head center", "#centers"]]);
});

test("ordinary English is not linked", () => {
  for (const plain of [
    "You are the ultimate authority on what fits your life.",
    "Keep an open mind and an open heart.",
    "The heart of the matter is rest.",
    "At 9-17 the train left; 1-2 people waited.",
  ]) {
    assert.deepEqual(links(plain), [], plain);
  }
});

test("only anchors the library has: no invented profile, channel or gate", () => {
  assert.deepEqual(links("A 5/5 split, channel 1-2 and gate 99."), []);
  // The channel's own name links only for the chart's own channels.
  assert.deepEqual(links("The channel of Preservation."), [["channel of Preservation", "#channel-27-50"]]);
});

test("the runs put the paragraph back together, word for word", () => {
  const t = "Your Sacral center acts as your inner authority, and your Spleen center speaks once.";
  assert.equal(linkedRuns(t, CHART).map((r) => r.text).join(""), t);
  const spans = termSpans(t, CHART);
  for (let i = 1; i < spans.length; i++) assert.ok(spans[i].start >= spans[i - 1].end, "overlap");
});

test("a term broken across PDF lines still links", () => {
  assert.deepEqual(links("your Solar\nPlexus center"), [["Solar\nPlexus center", "#centers"]]);
});

test("17A: the title, the cleaned name and the first name", () => {
  assert.equal(chartTitle("Alex"), "Alex’s Human Design");
  assert.equal(chartTitle(""), "Your Human Design");
  assert.equal(chartTitle(null), "Your Human Design");
  assert.equal(cleanChartName("  Mary   Jane  "), "Mary Jane");
  assert.equal(cleanChartName("<script>x</script>"), "scriptx/script");
  assert.equal(cleanChartName("x".repeat(80)).length, 40);
  assert.equal(firstName("Alex Rivera"), "Alex");
  assert.equal(firstName(null), "");
});
