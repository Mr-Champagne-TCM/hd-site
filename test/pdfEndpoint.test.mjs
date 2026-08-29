import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * WHAT THE ENDPOINT HANDS TO THE BUILDER.
 *
 * A structural test, and it exists because the gap it guards was invisible to
 * every behavioural one. `readingPdf` has a test proving a tier-2 call with
 * text produces seven pages, and it passed throughout -- while the endpoint
 * never passed the text. A reading-tier buyer downloaded a chart-tier PDF that
 * opened perfectly and was simply not what they paid for.
 *
 * The builder treats a missing reading as "there is not one yet" and quietly
 * draws two pages, which is correct for a purchase whose words have not been
 * written and catastrophic for one whose have. Nothing can tell those apart
 * from inside the builder, so the check belongs here.
 */

const source = (p) => readFileSync(fileURLToPath(new URL(`../${p}`, import.meta.url)), "utf8");

test("THE PDF ENDPOINT HANDS OVER THE WRITTEN READING", () => {
  const pdf = source("netlify/functions/pdf.mjs");
  assert.match(
    pdf,
    /reading:\s*reading\.reading/,
    "the endpoint builds a PDF without the reading, so tier 2 downloads a chart",
  );
});

test("the download declares its length, so a short read cannot pass for a file", () => {
  // Reported from a phone as a PDF that would not open. Without a length,
  // nothing between the function and the device can tell a truncated download
  // from a complete one.
  const pdf = source("netlify/functions/pdf.mjs");
  assert.match(pdf, /"Content-Length": String\(/);
  assert.match(pdf, /new Uint8Array\(/, "a Node Buffer is being handed to a Web Response");
});

test("the summary tier is refused rather than sent an empty document", async () => {
  // `readingPdf` will happily build two pages for tier 0 -- it is the ENDPOINT
  // that decides the summary was never sold a download. If that check were
  // dropped, the page has no button but the URL is guessable.
  const pdf = source("netlify/functions/pdf.mjs");
  assert.match(pdf, /link\.tier < 1/, "the tier gate on the download is gone");
});

test("nothing else in the app links a PDF the summary tier cannot have", () => {
  // The other way somebody meets a 404 body saved as a .pdf: a button that
  // should not be there.
  const actions = source("src/ReadingActions.tsx");
  const at = actions.indexOf("/api/pdf");
  assert.ok(at > 0, "the download link vanished");
  assert.ok(
    actions.lastIndexOf("tier >= 1", at) > 0,
    "the download link is no longer behind a tier check",
  );
});
