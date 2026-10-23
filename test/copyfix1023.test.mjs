import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { importTs } from "./support/ts.mjs";
import { myChartsEmail, openHint } from "../netlify/lib/myChartsEmail.mjs";
import { deliveryEmail } from "../netlify/lib/deliveryEmail.mjs";
import { ONWARD_NOTE, ONWARD_LINKS } from "../netlify/lib/readingPdf.mjs";
import { ADD_TIME } from "../shared/timeSpread.mjs";
import { MESSAGES } from "../shared/customerMessages.mjs";
import { CHART, READING } from "../shared/pricing.mjs";
import { CENTER_UNDEFINED } from "../shared/libraryGlance.mjs";
import { SITE } from "../netlify/lib/siteLinks.mjs";

/**
 * THE 10/23 WORD-FOR-WORD READ (hd-e2e\verbatim-1023\findings.md), the copy
 * and label items fixed in this round, pinned so a tidy-up cannot quietly
 * undo one. Ids are the read's: S = should, N = nit.
 */

const copy = await importTs("src", "copy.ts");
const src = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
const flat = (s) => s.replace(/\s+/g, " ");

/** Jeremy (10/23, the credit idea): "Good, be consistent." One sentence, everywhere. */
const CREDIT = "What you have already paid comes off what you pay next — nobody pays twice for the same thing.";

/* ------------------------------------------------------------------ S1 */

test("S1: every 'Open' button in the my-charts email says whose page it opens", () => {
  const charts = [
    { reading: { tier: 2, pending: false, birth: { name: "Uma", date: "1990-01-02", place: "Austin, Texas" } }, url: "https://x.test/r/a.1" },
    { reading: { tier: 1, pending: false, fresh: true, birth: { date: "1966-04-02", place: "Reno, Nevada" }, buyer: { name: null } }, url: "https://x.test/r/b.2" },
    { reading: { tier: 0, pending: false, birth: { date: "1971-05-06", place: "Waco, Texas" }, buyer: { name: null } }, url: "https://x.test/r/c.3" },
    { reading: { tier: 1, pending: true, birth: null, buyer: { name: "Robin Lake" } }, url: "https://x.test/r/d.4" },
  ];
  const { html } = myChartsEmail({ charts, links: SITE, origin: "https://x.test" });
  const buttons = [...html.matchAll(/<a href="https:\/\/x\.test\/r\/[^"]+"[^>]*\btitle="([^"]*)" aria-label="([^"]*)">([^<]*)<\/a>/g)].map((m) => ({
    title: m[1],
    aria: m[2],
    words: m[3],
  }));
  assert.deepEqual(buttons, [
    { title: "Opens Uma’s reading", aria: "Open (Opens Uma’s reading)", words: "Open" },
    { title: "Opens their chart", aria: "Open (Opens their chart)", words: "Open" },
    { title: "Opens your summary", aria: "Open (Opens your summary)", words: "Open" },
    { title: "Opens the page to enter the birth details", aria: "Enter the birth details (Opens the page to enter the birth details)", words: "Enter the birth details" },
  ]);
  assert.doesNotMatch(html, /Opens the page to open/);
  assert.equal(openHint(charts[0].reading), "Opens Uma’s reading");
});

/* ------------------------------------------------------------------ S2 */

test("S2: the add-time form says what is kept, as retimeReading keeps it", () => {
  assert.equal(
    ADD_TIME.privacy(0),
    "Your earlier details, and the summary made from them, stay with this summary, seen only by Jeremy, in case you ever write in about them.",
  );
  assert.equal(
    ADD_TIME.privacy(1),
    "Your earlier details, and the chart made from them, stay with this chart, seen only by Jeremy, in case you ever write in about them.",
  );
  assert.equal(
    ADD_TIME.privacy(2),
    "Your earlier details, and the chart and reading made from them, stay with this chart, seen only by Jeremy, in case you ever write in about them.",
  );
  // What retimeReading files in history: the details as they were, the chart, and the written reading.
  assert.match(src("netlify/lib/reading.mjs"), /kind: "time-added", chart: existing\.output, reading: existing\.reading/);
});

/* ------------------------------------------------------------------ S4 */

test("S4: one credit sentence on the offer page, the chart and summary pages, the emails and the PDF", async () => {
  assert.ok(copy.LADDER_NOTE.endsWith(` ${CREDIT}`), copy.LADDER_NOTE);
  assert.ok(flat(src("src/ReadingActions.tsx")).includes(CREDIT), "the chart and summary pages");
  const ready = deliveryEmail({ tier: 1, name: "J", url: "https://x.test/r/a.b", links: SITE });
  assert.ok(ready.text.includes(`It is offered on your page, and ${CREDIT.charAt(0).toLowerCase()}${CREDIT.slice(1)}`), ready.text);
  // The PDF's page 3 (rendered and read in brandDecisions.test.mjs); here its source, joined.
  const pdf = flat(src("netlify/lib/readingPdf.mjs")).replace(/[`"] \+ [`"]/g, "");
  assert.ok(pdf.includes(`${CREDIT} The link in your email is what proves it,`), "the PDF's page 3");
  for (const old of [/goes toward whatever you choose next/, /comes off the price there/, /comes off the price, and the link/]) {
    for (const f of ["src/copy.ts", "src/ReadingActions.tsx", "netlify/lib/deliveryEmail.mjs", "netlify/lib/readingPdf.mjs"]) {
      assert.doesNotMatch(flat(src(f)).replace(/\/\/.*$/gm, ""), old, `${f}: ${old}`);
    }
  }
});

/* ------------------------------------------------------------------ S5 */

test("S5: 'comes close to a full reading' once per page, on the summary's card", () => {
  assert.match(copy.CARDS.summaryNote.join(""), /comes close to a full reading\.$/);
  assert.equal(copy.CARDS.chartNote.join(""), "Every word on it is explained in the free Human Design library.");
});

/* ------------------------------------------------------------------ N1 N3 N4 N5 N6 */

test("N3: the error lines say 'front page', as the 404 page does", () => {
  const all = Object.values(MESSAGES).map((m) => m.text ?? "").join("\n");
  assert.doesNotMatch(all, /home page/);
  assert.equal((all.match(/are on the front page whenever you’d like them\./g) ?? []).length, 3);
});

test("N4: the privacy sentence never says 'entered here' (the upgrade's check page shows it too)", () => {
  assert.ok(copy.PRIVACY_NOTE.startsWith("The name and birth details are kept with this chart for a year,"));
});

test("N5: the choice page's two lines punctuate 'Your bodygraph drawn' the same way", () => {
  assert.equal(CHART.adds, "Your bodygraph drawn, and its PDF to keep.");
  assert.ok(READING.addsToSummary.startsWith("Your bodygraph drawn, "));
});

test("N6: 'Three things' twice on the form, not three times; one comma style", () => {
  assert.equal(copy.ENTRY.body.split(". ")[0], "All that’s needed is the date, the place and the time if it is known");
  assert.doesNotMatch(copy.ENTRY.body, /Three things/);
  assert.equal(copy.ENTRY.startRule, "Three things, then you’re done");
});

/* ------------------------------------------------------------------ N9 N11 N19 N29 */

test("N9: 'the Human Design library' mid-sentence, on the pages and in the PDF", () => {
  assert.ok(ONWARD_NOTE.startsWith("Every word above is explained in the Human Design library, and"));
  assert.ok(ONWARD_LINKS.some(([p]) => p === "the Human Design library"), "the PDF's link covers the words as printed");
  for (const f of ["src/App.tsx", "src/WrittenReading.tsx"]) {
    const s = flat(src(f));
    assert.doesNotMatch(s, /explained in\{" "\} <a[^>]*> The Human Design library/, f);
    assert.match(s, /explained in\{" "\} <a[^>]*> the Human Design library <\/a>/, f);
  }
});

test("N11: an undefined Spleen's one-liner keeps 'emotionally' for the Solar Plexus", () => {
  assert.equal(CENTER_UNDEFINED.Spleen, "You’re sensitive to how others feel, in body and health.");
});

test("N19: the three-lines box keeps the dot behind the label, never opening a line", () => {
  const s = src("src/ThreeLines.tsx");
  assert.ok(s.includes('{"\\u00a0· "}\n                  <span className="whitespace-nowrap">{value}</span>'));
  assert.ok(!s.includes('<span className="whitespace-nowrap">· {value}</span>'));
});

test("N29: a gift's ready email offers the next step on the chart's page, not 'your page'", () => {
  const gift = deliveryEmail({ tier: 1, name: "Sage Testwell", chartName: null, url: "https://x.test/r/a.b", links: SITE, someoneNew: true });
  assert.match(gift.text, /Open their chart:/);
  assert.match(gift.text, /It is offered on the chart’s page, and what you have already paid comes off what you pay next/);
  assert.doesNotMatch(gift.text + gift.html, /offered on your page/);
  const own = deliveryEmail({ tier: 1, name: "J", url: "https://x.test/r/a.b", links: SITE });
  assert.match(own.text, /It is offered on your page,/);
});
