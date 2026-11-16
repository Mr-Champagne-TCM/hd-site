import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { importTs } from "./support/ts.mjs";
import { CHART_KEY, CENTERS_LINE, DETAILS_TITLE, DETAILS_NOTE, MEANINGS, TECH_TITLE_NOTE, techTitle } from "../shared/readingCopy.mjs";
import { actionHint } from "../shared/linkHints.mjs";
import { deliveryEmail } from "../netlify/lib/deliveryEmail.mjs";
import { myChartsEmail } from "../netlify/lib/myChartsEmail.mjs";

/**
 * THE 10/31 AUDIT'S QUEUED ITEMS, Q1-Q9 + Q11 (3)(4)(5) (Jeremy 11/16: "All accepted Q1-12 ...
 * do them now"). The green words of the Q review page, pinned.
 */
const copy = await importTs("src", "copy.ts");
const src = (f) => readFileSync(new URL(`../${f}`, import.meta.url), "utf8");
const LINKS = { contact: "hd-readings@thechampagnemethod.co" };

test("Q1: the my-charts email with nothing under the address reads as a sentence", () => {
  const m = myChartsEmail({ charts: [], links: LINKS, origin: "https://x.test" });
  assert.match(m.text, /^Someone asked for the charts bought with this email\. There are none under it\.$/m);
  assert.doesNotMatch(m.text, /asked Human Design readings/);
});

test("Q2: the terms, three short lines", () => {
  assert.equal(
    copy.FOOTER.terms(),
    "All sales are final.\nSomething didn’t arrive or didn’t work? That’s mine to put right.\n" +
      "Birth details went in wrong? Write to hd-readings@thechampagnemethod.co",
  );
  assert.match(copy.FOOTER.terms("their"), /\nTheir birth details went in wrong\?/);
  assert.match(src("src/App.tsx"), /whitespace-pre-line[^"]*"[^>]*>\s*<MailtoText/);
});

test("Q3 + Q4: the form's words, plain, and theirs on someone else's chart", () => {
  assert.equal(copy.ENTRY.body, "Your birth date and place, and your time if you know it. No time? That’s fine: your chart marks the parts a time could change.");
  assert.equal(copy.ENTRY.timeUnknownHelp, "Most of your chart works without it. The parts a time could change are marked.");
  assert.equal(copy.ENTRY.whyTimeBody, "A different hour can change some parts of your chart. The time on a birth certificate is best; no time is fine too.");
  assert.equal(copy.PRIVACY_NOTE, "These details stay with your chart for a year, so you never type them again. Your email link always brings you back.");
  for (const k of ["bodyTheirs", "timeUnknownHelpTheirs", "whyTimeBodyTheirs"]) assert.doesNotMatch(copy.ENTRY[k], /\byour\b/i, k);
  assert.match(copy.PRIVACY_NOTE_THEIRS, /their chart/);
  for (const w of ["cast", "provisional", "gates", "Profile", "Authority"]) {
    for (const t of [copy.ENTRY.body, copy.ENTRY.timeUnknownHelp, copy.ENTRY.whyTimeBody]) assert.doesNotMatch(t, new RegExp(`\\b${w}\\b`), w);
  }
});

test("Q5: offers, not orders", () => {
  assert.equal(copy.ENTRY.timeButton, "The time, if you know it");
  assert.match(src("src/entry/TimeField.tsx"), /ENTRY\.timeButton/);
  assert.equal(copy.RETURNING.changeDetail, "A detail to fix?");
  assert.equal(copy.RETURNING.correctButton, "These are right now");
  const r = deliveryEmail({ tier: 1, name: "J", url: "https://x.test/r/a", links: LINKS, pending: true });
  assert.match(r.html, />Your birth details \(about two minutes\) →</);
  assert.equal(actionHint("Your birth details (about two minutes) →"), "Opens the page to enter your birth details");
  const m = myChartsEmail({ charts: [], links: LINKS, origin: "https://x.test" });
  assert.match(m.text, /\nA NEW CHART\n/);
  assert.match(m.html, />A chart for someone new →</);
  assert.doesNotMatch(m.text + m.html, /START A NEW CHART|>Start a new chart</);
});

test("Q6 + Q7b: a plain meaning for every label, the same on the example, the chart page and the PDF", () => {
  assert.equal(MEANINGS.definition, "how your parts connect");
  assert.equal(MEANINGS.incarnationCross, "your life’s theme");
  assert.equal(MEANINGS.definedCenters, "what’s steady in you");
  assert.equal(MEANINGS.undefinedCenters, "where you take in others");
  for (const [k, v] of Object.entries(MEANINGS)) {
    const n = v.split(/\s+/).length;
    assert.ok(n >= 3 && n <= 6, `${k}: "${v}" is ${n} words`);
  }
  assert.equal(DETAILS_TITLE, "The details");
  assert.equal(DETAILS_NOTE, "(each explained in the free library)");
  for (const f of ["src/Summary.tsx", "src/Glance.tsx", "netlify/lib/readingPdf.mjs"]) assert.match(src(f), /MEANINGS/, f);
  assert.doesNotMatch(src("src/Glance.tsx") + src("netlify/lib/readingPdf.mjs"), /YOUR CHART VALUES|>\s*Your chart values/);
});

test("Q7a + Q7c: the key names the colors; the raw numbers are optional; what a center is", () => {
  assert.deepEqual(CHART_KEY.slice(0, 2).map((r) => r.slice(0, 3)), [
    ["White", "from your birth moment (what you know)", "#F0F3F9"],
    ["Purple", "from about 3 months before birth (what your body knows)", "#7C5BFF"],
  ]);
  assert.equal(`${techTitle(26)} ${TECH_TITLE_NOTE}`, "The raw numbers behind your chart (optional)");
  assert.equal(CENTERS_LINE, "Your 9 centers are the shapes on the drawing.");
  for (const f of ["src/StartHere.tsx", "netlify/lib/readingPdf.mjs"]) assert.match(src(f), /CENTERS_LINE/, f);
  for (const f of ["src/ChartKey.tsx", "netlify/lib/readingPdf.mjs"]) assert.doesNotMatch(src(f), /"conscious — what you know"/, f);
});

test("Q8: a plain title, the plain line first, the checks under 'The details'; the AI line shorter", () => {
  assert.equal(copy.CREDIBILITY.title, "How accurate it is");
  assert.match(copy.PLAIN_ACCURACY, /^Across 1,000 test charts it was typically right to within 14 seconds of birth time/);
  assert.equal(copy.CREDIBILITY.checks[0][0], "14 seconds", "the plain line's figure is the first check's");
  const app = src("src/App.tsx");
  assert.ok(app.indexOf("{PLAIN_ACCURACY}") < app.indexOf("{CREDIBILITY.body.map("), "the plain line leads");
  assert.match(app, /AI \(Anthropic’s Claude\) drafts the written reading from your " \+\s*"chart only — no name, no birth details\. I check every sentence before you see it\./);
  assert.doesNotMatch(app, /The written part of the \$\{money\(READING\.cents\)\} reading/);
});

test("Q9: no riddles", () => {
  assert.equal(copy.CARDS.stripCaption, "One of the four things to try, written for someone who trusts their gut.");
  assert.equal(copy.RESOURCES.title, "Free guides, bought or not");
  assert.match(copy.RESOURCES.items[0].blurb, /short to start, deeper if you want/);
  assert.match(src("src/ReadingActions.tsx"), /Free guides to your chart[\s\S]*Two free guides that explain every word\./);
});

test("Q11 (3)(4)(5): the ad's question on the first screen with a Buy button; the example under the cards; a shorter Who makes this on phones", () => {
  assert.equal(copy.HERO.title, "How are you built to make decisions?");
  assert.equal(copy.HERO.line, "Your chart names it.");
  const app = src("src/App.tsx");
  const hero = app.slice(app.indexOf("function Hero()"), app.indexOf("/** Q11 (4)"));
  assert.match(hero, /startCheckout\(level, \{\}\)/);
  assert.match(hero, /href="#ways-in"/);
  assert.match(copy.EXAMPLE.title, /^What the \$1\.11 chart holds$/);
  assert.match(app, /\{!fresh && <Example \/>\}/);
  assert.match(app, /href="#example"/);
  assert.doesNotMatch(app.slice(app.indexOf("export default function App")), /<Example \/>/, "the example is no longer a section of its own below the cards");
  assert.match(app, /<details className="mt-3 sm:hidden">[\s\S]*WHO_MAKES\.more/);
});
