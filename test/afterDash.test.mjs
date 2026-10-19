import { test } from "node:test";
import assert from "node:assert/strict";
import { deliveryEmail } from "../netlify/lib/deliveryEmail.mjs";
import { SITE } from "../netlify/lib/siteLinks.mjs";

/**
 * Open item (c), 10/17, was the "what you bought" line ("The chart — Your
 * bodygraph..."), capital in mid-sentence. Fix 4A (10/19) replaced that line:
 * the receipt names what was bought in its own row, so the dash is gone. What
 * stays true: the tier is named plainly, in lowercase after "Human Design:".
 */
const receipt = (tier) =>
  deliveryEmail({ tier, name: "Claude Test Five", url: "https://example.test/r/x", links: SITE, pending: true });

test("the receipt says what was bought, plainly", () => {
  assert.match(receipt(0).text, /What: Human Design: the summary/);
  assert.match(receipt(1).text, /What: Human Design: the chart/);
  assert.match(receipt(2).text, /What: Human Design: the reading/);
});

test("no dash-joined blurb is left in either email", () => {
  for (const tier of [0, 1, 2]) {
    for (const pending of [true, false]) {
      const { text } = deliveryEmail({ tier, name: "J", url: "https://example.test/r/x", links: SITE, pending });
      assert.doesNotMatch(text, /^The (summary|chart|reading) — /m);
    }
  }
});

test("the HTML says the same as the text", () => {
  const { html } = receipt(1);
  assert.ok(html.includes("Human Design: the chart"));
});
