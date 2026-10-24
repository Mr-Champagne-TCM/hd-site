import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { chartCard, myChartsEmail } from "../netlify/lib/myChartsEmail.mjs";
import { birthLine } from "../shared/birthLine.mjs";
import { SITE } from "../netlify/lib/siteLinks.mjs";

/**
 * BATCH-1024 ITEM 5 (live retest 10/23): the "Email me my charts" email
 * showed "Coeur d'Alene" with a straight apostrophe. Decision 8 curled place
 * names where they are shown (shared/birthLine.mjs: the PDF and the pages);
 * the email's chart rows now do the same. The kept place is not changed.
 */

const ORIGIN = "https://shop.example";
const coeur = (over = {}) => ({
  tier: 1,
  pending: false,
  birth: { name: "Uma", date: "1990-01-02", time: "08:15", timeKnown: true, place: "Coeur d'Alene, Idaho", zone: "America/Los_Angeles" },
  ...over,
});

test("item 5: the my-charts email prints the place curled, in the HTML and the text", () => {
  const reading = coeur();
  const e = myChartsEmail({ charts: [{ reading, url: `${ORIGIN}/r/made-up-1` }], links: SITE, origin: ORIGIN });
  for (const [part, body] of [
    ["html", e.html],
    ["text", e.text],
  ]) {
    assert.ok(body.includes("Coeur d’Alene, Idaho"), `${part}: no curled place`);
    assert.ok(!body.includes("Coeur d'Alene"), `${part}: a straight apostrophe`);
    assert.ok(!body.includes("Coeur d&#39;Alene") && !body.includes("Coeur d&#x27;Alene"), `${part}: an escaped straight apostrophe`);
  }
  // The kept place is untouched: curled for display only.
  assert.equal(reading.birth.place, "Coeur d'Alene, Idaho");
});

test("item 5: the row reads as the PDF's birth line does", () => {
  const { line } = chartCard(coeur());
  assert.equal(line, "The chart · January 2, 1990 · Coeur d’Alene, Idaho");
  assert.ok(birthLine(coeur().birth).endsWith("· Coeur d’Alene, Idaho"));
  // A pending chart and an old record print no place, as before.
  assert.doesNotMatch(chartCard(coeur({ pending: true })).line, /Alene/);
  assert.equal(chartCard({ tier: 0, pending: false, birth: { date: "1971-05-06", place: "Waco, Texas" } }).line, "The summary · May 6, 1971 · Waco, Texas");
});

test("item 5: no other email prints a kept birth place uncurled", () => {
  // Every email builder in netlify/lib: a kept place may reach an email only through birthLine()/datePlaceLine() or curly().
  const dir = fileURLToPath(new URL("../netlify/lib/", import.meta.url));
  for (const name of readdirSync(dir).filter((n) => n.endsWith(".mjs"))) {
    const src = readFileSync(dir + name, "utf8");
    if (!/subject/.test(src) || !/\bhtml\b/.test(src)) continue; // not an email builder
    for (const m of src.matchAll(/birth\??\.place\b[^\n]*/g)) {
      assert.match(m[0], /curly\(/, `${name}: ${m[0].trim()}`);
    }
  }
});
