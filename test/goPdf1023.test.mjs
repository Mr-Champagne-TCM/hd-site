import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { sep } from "node:path";
import { importTs } from "./support/ts.mjs";
import { curly } from "../shared/curlyQuotes.mjs";
import { MESSAGES } from "../shared/customerMessages.mjs";
import { NOTES } from "../netlify/lib/alertNotes.mjs";
import * as PRICING from "../shared/pricing.mjs";
import * as GLANCE from "../shared/libraryGlance.mjs";
import * as SERVER_MECHANICS from "../netlify/lib/mechanics.mjs";
import { notFoundPage } from "../netlify/lib/notFoundPage.mjs";
import { HINT, hint, actionHint, libraryHint } from "../shared/linkHints.mjs";
import { messagePage } from "../netlify/lib/messagePage.mjs";
import { deliveryEmail } from "../netlify/lib/deliveryEmail.mjs";
import { myChartsEmail } from "../netlify/lib/myChartsEmail.mjs";
import { SITE } from "../netlify/lib/siteLinks.mjs";

/**
 * Jeremy's calls on the GO PDF (10/23), round 2 of release-1022:
 *   - "credit idea? - Good, be consistent": the price page says the credit
 *     idea once, not twice;
 *   - "sure, don't mix curly/straight apostrophes": curly, everywhere a buyer
 *     reads the shop's own words;
 *   - "Good, lets add link labels (hover hints?)": every link that leaves the
 *     page says where it goes;
 *   - and in chat the same day, the receipt's subject, option 1: the chart's
 *     own title.
 */

const copy = await importTs("src", "copy.ts");
const pageMechanics = await importTs("src", "mechanics.ts");

/* ------------------------------------------------------------ credit once */

test("CREDIT ONCE: the price page says the credit idea in one place, under the cards", () => {
  const { TIERS_INTRO, LADDER_NOTE } = copy;
  // The line above the cards is the price, said plainly; the credit lives in the note under them.
  assert.equal(TIERS_INTRO.body, "The price is here before anything is asked of you.");
  assert.equal(
    LADDER_NOTE,
    "Straight to the reading, or a step at a time — the total is identical either way. " +
      "What you have already paid comes off what you pay next — nobody pays twice for the same thing.",
  );
  const page = `${TIERS_INTRO.lead}\n${TIERS_INTRO.title}\n${TIERS_INTRO.body}\n${LADDER_NOTE}`;
  const count = (re) => (page.match(re) ?? []).length;
  assert.equal(count(/the total is identical/g), 1);
  assert.equal(count(/costs the same/g), 0, "the same total, said a second way");
  assert.equal(count(/comes off|goes toward/g), 1, "what you paid counts toward the next step, said more than once");
  assert.equal(count(/pays twice/g), 1);
});

/* ------------------------------------------------------ curly apostrophes */

test("curly(): apostrophes and quotes, the way the titles already are", () => {
  assert.equal(curly("WHEN IT'S ON TRACK, AND WHEN IT'S OFF TRACK"), "WHEN IT’S ON TRACK, AND WHEN IT’S OFF TRACK");
  assert.equal(curly(`You may often ask "Who am I?" now.`), "You may often ask “Who am I?” now.");
  assert.equal(curly("the 'open' centers, others' charts"), "the ‘open’ centers, others’ charts");
  assert.equal(curly("Already curly’s fine"), "Already curly’s fine");
  assert.equal(curly(null), "");
});

/** Every string inside a value (objects, arrays, frozen maps), with where it sits. */
function* strings(v, where) {
  if (typeof v === "string") yield [where, v];
  else if (Array.isArray(v)) for (const [i, x] of v.entries()) yield* strings(x, `${where}[${i}]`);
  else if (v && typeof v === "object") for (const [k, x] of Object.entries(v)) yield* strings(x, `${where}.${k}`);
}

/** A straight apostrophe or double quote in words a buyer reads. */
const straight = (s) => /\p{L}'|'\p{L}|"/u.test(s);

test("NO STRAIGHT QUOTES in the shop's own words: page copy, notes, messages, prices, one-liners, mechanics", () => {
  const sources = {
    "src/copy.ts": copy,
    "src/mechanics.ts": pageMechanics,
    "netlify/lib/mechanics.mjs": SERVER_MECHANICS,
    "shared/customerMessages.mjs MESSAGES": MESSAGES,
    "netlify/lib/alertNotes.mjs NOTES": NOTES,
    "shared/pricing.mjs": PRICING,
    "shared/libraryGlance.mjs": GLANCE,
  };
  const found = [];
  for (const [name, mod] of Object.entries(sources)) {
    for (const [k, v] of Object.entries(mod)) {
      if (typeof v === "function") continue;
      for (const [where, s] of strings(v, `${name} ${k}`)) {
        // Markup and addresses are not words: only what is left once they are taken out.
        const words = s.replace(/<[^>]+>/g, "").replace(/https?:\/\/\S+/g, "");
        if (straight(words)) found.push(`${where}: ${s.slice(0, 90)}`);
      }
    }
  }
  assert.deepEqual(found, []);
});

test("the 404 page, as written and as served, is curly", () => {
  const html = notFoundPage();
  const text = html.replace(/<style>[\s\S]*?<\/style>/, "").replace(/<[^>]+>/g, " ");
  assert.doesNotMatch(text, /\p{L}'\p{L}/u);
  assert.match(text, /This page isn’t here/);
  const served = readFileSync(new URL("../public/404.html", import.meta.url), "utf8");
  assert.equal(served, html + "\n", "stale: run node tools/write-404.mjs");
});

test("the reading's headings stay straight where the checker reads them, curly where a buyer reads them", async () => {
  // The checker's fixed text (and what the model is asked to write) keeps the straight form...
  const src = readFileSync(new URL("../netlify/lib/interpretation.mjs", import.meta.url), "utf8");
  assert.match(src, /WHEN IT'S ON TRACK|When it's on track/i);
  // ...and the page and the PDF curl it for display.
  for (const f of ["../src/WrittenReading.tsx", "../netlify/lib/readingPdf.mjs"]) {
    const s = readFileSync(new URL(f, import.meta.url), "utf8");
    assert.match(s, /curly\((s|h)(\.heading)?\)/, `${f} prints a heading without curly()`);
  }
});

/* ---------------------------------------------------------- link labels */
// Jeremy's GO PDF (10/23): "Good, lets add link labels (hover hints?)". Every link that
// leaves the page carries a title and an aria-label in the website's "Opens …" style.

test("LINK LABELS: the words, the website's for the destinations both sites name", () => {
  // Word for word as the website's src/site/linkHints.ts names them (release-1022, 10/23).
  assert.equal(HINT.readings, "Opens Human Design readings");
  assert.equal(HINT.home, "Opens The Champagne Method home page");
  assert.equal(HINT.connect, "Opens the contact section on the home page");
  assert.deepEqual(hint("here", HINT.readings), { title: "Opens Human Design readings", "aria-label": "here (Opens Human Design readings)" });
  assert.equal(actionHint("Open your reading"), "Opens your reading");
  assert.equal(actionHint("Enter their birth details"), "Opens the page to enter their birth details");
  assert.equal(libraryHint("Sacral"), "Opens Sacral in the Human Design library");
  for (const [k, v] of Object.entries(HINT)) {
    assert.match(v, /^(Opens|Downloads) /, `${k} is not in the "Opens …" style`);
    assert.doesNotMatch(v, /\.$/, `${k} ends with a full stop (the website's do not)`);
    assert.ok(!straight(v), `${k} has a straight quote`);
  }
});

test("LINK LABELS on every link in the page's source that leaves the page", () => {
  const dir = new URL("../src/", import.meta.url);
  const files = readdirSync(dir, { recursive: true }).filter((f) => /\.tsx$/.test(f));
  const bare = [];
  let seen = 0;
  for (const f of files) {
    const src = readFileSync(new URL(f.split(sep).join("/"), dir), "utf8");
    for (const m of src.matchAll(/<a\b[\s\S]*?<\/a>/g)) {
      seen += 1;
      const tag = m[0];
      // Links that stay on the page (#start-here, #add-time) do not leave it.
      if (/href="#|href=\{ADD_TIME_HASH\}/.test(tag)) continue;
      if (!/\{\.\.\.hint\(/.test(tag)) bare.push(`${f}: ${tag.slice(0, 120).replace(/\s+/g, " ")}`);
    }
  }
  assert.ok(seen >= 40, `only ${seen} links found: the scan stopped finding them`);
  assert.deepEqual(bare, []);
});

test("LINK LABELS the GO PDF named: the cut-short page's 'here', the way back from someone new, the header brand", () => {
  const read = (p) => readFileSync(new URL(`../src/${p}`, import.meta.url), "utf8");
  // "The readings, and what each one includes, are here." -- "here" opens the readings' front page.
  assert.match(read("ReadingPage.tsx"), /href="\/"\s*\{\.\.\.hint\("here", HINT\.readings\)\}/);
  // The way back from someone new goes to the CHOICE page, and since decision 14 (picks-1023) says so,
  // "← Back to your choices"; before the buyer's own details it goes to their chart's page.
  const app = read("App.tsx");
  assert.match(app, /href=\{back\}\s*\{\.\.\.hint\(\s*backLabel,\s*data!\.pending \? ownPageHint\(whoseOf\(whose\), "chart"\) : `Opens your choices for \$\{whoseOf\(whose\)\} chart`,/);
  // The header brand goes to the coaching home, and says so.
  assert.match(app, /<a href=\{SITE\.home\} \{\.\.\.hint\("Human Design by The Champagne Method", HINT\.home\)\}/);
});

/** Every <a> in an HTML string: its attributes and its words. */
const anchors = (html) =>
  [...html.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/g)].map((m) => ({ attrs: m[1], words: m[2].replace(/<[^>]+>/g, "").trim() }));

test("LINK LABELS on the server's pages and in the emails: every link, title + aria-label starting with its words", () => {
  const docs = {
    "404": notFoundPage(),
    "message page": messagePage({ heading: "x", message: `y ${SITE.contact} z`, back: "/r/abc" }),
    "ready email": deliveryEmail({ tier: 2, name: "J", url: "https://x.test/r/a.b", links: SITE }).html,
    "receipt email": deliveryEmail({ tier: 1, name: "J", url: "https://x.test/r/a.b", links: SITE, pending: true, amountCents: 1111, paidAt: Date.UTC(2026, 9, 17) }).html,
    "someone-else email": deliveryEmail({ tier: 0, name: "J", chartName: "Quinn", url: "https://x.test/r/a.b", links: SITE, someoneNew: true, pending: true }).html,
    "my charts email (none)": myChartsEmail({ charts: [], links: SITE, origin: "https://x.test" }).html,
  };
  for (const [name, html] of Object.entries(docs)) {
    const list = anchors(html);
    assert.ok(list.length >= 3, `${name}: only ${list.length} links`);
    for (const a of list) {
      const title = /\btitle="([^"]*)"/.exec(a.attrs)?.[1];
      const aria = /\baria-label="([^"]*)"/.exec(a.attrs)?.[1];
      assert.ok(title && /^(Opens|Downloads) /.test(title), `${name}: "${a.words}" has no "Opens …" title`);
      assert.ok(aria && aria.startsWith(a.words), `${name}: "${a.words}" aria-label does not start with its words: ${aria}`);
      assert.ok(aria.endsWith(`(${title})`), `${name}: "${a.words}" aria-label does not name where it goes`);
    }
  }
});

/* ------------------------------------------------- receipt subject = the chart's own title */
// Jeremy 10/23, option 1: "Receipt: Robin’s Human Design reading, <price>" when the chart is
// titled "Robin’s Human Design". Gifts keep "…for someone else". (Prices from pricing.mjs only: P-1.)

test("RECEIPT SUBJECT: the chart's own title; a new chart's is the first name the form starts with; gifts unchanged", () => {
  const receipt = (o) => deliveryEmail({ url: "https://x.test/r/a.b", links: SITE, pending: true, ...o }).subject;
  const [s, c, r] = PRICING.TIERS.map((t) => t.cents);
  const $ = PRICING.money;
  // An upgrade of a chart titled "Robin’s Human Design", paid by Alex Rivera.
  assert.equal(receipt({ tier: 2, name: "Alex Rivera", chartName: "Robin", amountCents: r }), `Receipt: Robin’s Human Design reading, ${$(r)}`);
  // A brand-new chart: nothing typed for it yet; the form starts its name with the first name on the payment (decision 15).
  assert.equal(receipt({ tier: 1, name: "Alex Rivera", amountCents: c }), `Receipt: Alex’s Human Design chart, ${$(c)}`);
  // No name anywhere: the chart is "Your Human Design".
  assert.equal(receipt({ tier: 0, name: null, amountCents: s }), `Receipt: Your Human Design summary, ${$(s)}`);
  // A chart for someone else keeps its own receipt, the buyer's name and "for someone else".
  assert.equal(
    receipt({ tier: 1, name: "Emery Testwell", chartName: "Quinn", someoneNew: true, amountCents: c }),
    `Receipt: Emery Testwell, a Human Design chart for someone else, ${$(c)}`,
  );
  // The ready email already said the chart's title; the receipt and it now agree on whose chart it is.
  assert.equal(deliveryEmail({ tier: 2, name: "Alex Rivera", chartName: "Robin", url: "https://x.test/r/a.b", links: SITE }).subject, "Robin’s Human Design reading is ready");
});

test("RECEIPT SUBJECT: both paths that send a receipt pass the chart's name from the purchase record", () => {
  const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
  assert.match(read("netlify/lib/charts.mjs"), /chartName: source\?\.birth\?\.name \?\? null/);
  const claim = read("netlify/lib/claimHandler.mjs");
  assert.match(claim, /chartName = recorded\?\.chartName \?\? null;/);
  assert.match(claim, /pending: true,\s*kept,\s*\/\/[^\n]*\n\s*chartName,/);
  assert.match(read("netlify/lib/reconcile.mjs"), /chartName: recorded\?\.chartName \?\? null,/);
  assert.match(read("netlify/functions/reconcile.mjs"), /deliveryEmail\(\{ tier, name, chartName, url,/);
  // The re-sent receipt already passed it (resendHandler: reading.birth?.name).
  assert.match(read("netlify/lib/resendHandler.mjs"), /chartName: reading\.birth\?\.name \?\? null,/);
  // The Gmail-threading reason still holds and still says so: every subject carries a name.
  assert.match(read("netlify/lib/deliveryEmail.mjs"), /Every subject still carries a name, so that still holds\./);
});
