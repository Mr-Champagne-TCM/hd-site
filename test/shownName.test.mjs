import { test } from "node:test";
import assert from "node:assert/strict";
import { chartTitle, cleanChartName, shownName } from "../shared/chartName.mjs";
import { deliveryEmail } from "../netlify/lib/deliveryEmail.mjs";
import { chartCard } from "../netlify/lib/myChartsEmail.mjs";
import { SITE } from "../netlify/lib/siteLinks.mjs";

/**
 * SHOWN CURLY, KEPT AS TYPED (10/25 live test: "Sam O'Brien’s Human Design" mixed a straight
 * apostrophe with the title's curly one, on the page, the PDF and in the emails).
 */
test("a name is shown with curly apostrophes, and kept as typed", () => {
  assert.equal(chartTitle("Sam O'Brien"), "Sam O’Brien’s Human Design");
  assert.equal(shownName("Sam O'Brien"), "Sam O’Brien");
  assert.equal(cleanChartName("Sam O'Brien"), "Sam O'Brien", "what is stored stays as typed");
  assert.equal(chartTitle("Alex"), "Alex’s Human Design");
  assert.equal(chartTitle(""), "Your Human Design");
  assert.equal(shownName("  "), null);
});

test("the ready email and the my-charts email say O’Brien too", () => {
  const ready = deliveryEmail({ tier: 2, name: "Sam O'Brien", chartName: "Sam O'Brien", url: "https://x.test/r/a.b", links: SITE });
  assert.match(ready.subject, /Sam O’Brien’s Human Design/);
  assert.doesNotMatch(ready.subject + ready.text, /O'Brien/);
  const card = chartCard({ tier: 2, birth: { name: "Sam O'Brien" }, buyer: { name: "Sam O'Brien" }, purchasedAt: Date.UTC(2026, 9, 25) });
  assert.doesNotMatch(JSON.stringify(card), /O'Brien/);
  assert.match(JSON.stringify(card), /O’Brien/);
});
