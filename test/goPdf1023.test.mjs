import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { importTs } from "./support/ts.mjs";
import { curly } from "../shared/curlyQuotes.mjs";
import { MESSAGES } from "../shared/customerMessages.mjs";
import { NOTES } from "../netlify/lib/alertNotes.mjs";
import * as PRICING from "../shared/pricing.mjs";
import * as GLANCE from "../shared/libraryGlance.mjs";
import * as SERVER_MECHANICS from "../netlify/lib/mechanics.mjs";
import { notFoundPage } from "../netlify/lib/notFoundPage.mjs";

/**
 * Jeremy's calls on the GO PDF (10/23), round 2 of release-1022:
 *   - "credit idea? - Good, be consistent": the price page says the credit
 *     idea once, not twice;
 *   - "sure, don't mix curly/straight apostrophes": curly, everywhere a buyer
 *     reads the shop's own words.
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
      "What you have already paid goes toward whatever you choose next, so nobody pays twice for the same thing.",
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
