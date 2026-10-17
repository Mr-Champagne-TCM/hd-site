import { test } from "node:test";
import assert from "node:assert/strict";
import { deliveryEmail } from "../netlify/lib/deliveryEmail.mjs";
import { SITE } from "../netlify/lib/siteLinks.mjs";

/**
 * Open item (c), 10/17: the delivery email's "what you bought" line read
 * "The chart — Your bodygraph, drawn — ...", a capital in the middle of a
 * sentence. Lowercase after the dash, except the chart's own terms.
 */
const line = (tier) => deliveryEmail({ tier, name: "Claude Test Five", url: "https://example.test/r/x", links: SITE }).text;

test("the chart and the reading carry on in lowercase after the dash", () => {
  assert.ok(line(1).includes("The chart — your bodygraph, drawn — a page you can share"), line(1));
  assert.ok(line(2).includes("The reading — all twenty-six activations"), line(2));
  assert.doesNotMatch(line(1) + line(2), /— (Your|All) /);
});

test("the summary keeps its chart terms capitalised", () => {
  assert.ok(line(0).includes("The summary — Type, Strategy, Authority, Profile"), line(0));
});

test("the HTML says the same as the text", () => {
  const { html } = deliveryEmail({ tier: 1, name: null, url: "https://example.test/r/x", links: SITE });
  assert.ok(html.includes("The chart — your bodygraph, drawn"));
});
