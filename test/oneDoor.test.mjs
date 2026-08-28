import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * ONE DOOR PER PURCHASE.
 *
 * A real test buy produced four separate-looking faults -- no PDF or re-send on
 * the result page, no second email, an emailed link that kept offering the
 * form, and one purchase able to make any number of charts. All four were the
 * same thing: Stripe returned the buyer to the OFFER page, where a form ran on
 * a grant held in the tab and filed its chart against nothing, while their real
 * reading sat pending.
 *
 * These are structural assertions on the source rather than behavioural ones,
 * and that is a deliberate trade. What went wrong was a ROUTE, not a function,
 * and the honest guard against a route coming back is that the offer page
 * cannot mount the form and the claim hands back somewhere to go.
 */

const read = (p) => readFileSync(fileURLToPath(new URL(`../${p}`, import.meta.url)), "utf8");

test("THE OFFER PAGE CANNOT ASK FOR BIRTH DETAILS", () => {
  const app = read("src/App.tsx");
  assert.ok(
    !/EntryForm/.test(app),
    "the offer page mounts the entry form again -- one purchase can make unlimited charts",
  );
});

test("a paid return hands the browser to the reading link", () => {
  const app = read("src/App.tsx");
  assert.match(app, /claimIfReturning/, "the paid return no longer claims");
  assert.match(app, /window\.location\.replace\(r\.url\)/, "the paid return does not go to the reading");
});

test("claim gives the page the reading URL, not just a grant", () => {
  const purchase = read("src/purchase.ts");
  assert.match(purchase, /url: typeof body\.url === "string"/, "claim's url is being dropped");
});

test("THE CHART IS ONLY EVER FILED AGAINST A READING", () => {
  // The second email fires on a first fill, and a fill needs a reading link.
  const handler = read("netlify/lib/handler.mjs");
  assert.match(handler, /fillReading/, "the chart handler stopped filing charts");
  assert.match(handler, /write-once/i, "the write-once guarantee lost its note");
});

test("the entry form's free ending is gone with the free chart", () => {
  const form = read("src/entry/EntryForm.tsx");
  assert.ok(!/ENTRY\.restart/.test(form), "'Start a new chart' is back on a paid reading");
});

test("the paid form asks rather than announces", () => {
  const form = read("src/entry/EntryForm.tsx");
  assert.match(form, /enter your birth details/, "the paid heading was not updated");
});
