import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { deliveryEmail } from "../netlify/lib/deliveryEmail.mjs";
import { myChartsEmail } from "../netlify/lib/myChartsEmail.mjs";
import { NOTES, fillNote } from "../netlify/lib/alertNotes.mjs";
import { MESSAGES } from "../shared/customerMessages.mjs";
import { SITE } from "../netlify/lib/siteLinks.mjs";

/**
 * WHAT HIS PAGE IS CALLED (Jeremy 10/20: "don't refer to my page as the shop.
 * that is internal only. Lets figure out what to call it and check everywhere
 * for this reference." -> 1A, "Human Design readings").
 *
 * Internal text -- an alert or a brief to Jeremy, a code comment, a variable
 * named SHOP -- may say "shop". Nothing a CUSTOMER reads may: the pages, the
 * emails, the notes he sends a buyer, the PDF.
 *
 * And the wider library (Jeremy 10/20): on a Human Design page, a link to the
 * whole /library/ says "Open the full Coaching Library" ("the full Coaching
 * Library" in running text).
 */

const root = new URL("../", import.meta.url);
const read = (rel) => readFileSync(new URL(rel, root), "utf8");

/** Comments out; string literals and JSX text in. `${...}` holes emptied. */
function customerStrings(src, { jsx = false } = {}) {
  const noBlock = src.replace(/\/\*[\s\S]*?\*\//g, " ");
  const noLine = noBlock.replace(/(^|[^:"'`\\])\/\/[^\n]*/g, "$1");
  const out = [];
  for (const m of noLine.matchAll(/"((?:[^"\\\n]|\\.)*)"|'((?:[^'\\\n]|\\.)*)'|`((?:[^`\\]|\\.)*)`/g)) {
    out.push((m[1] ?? m[2] ?? m[3] ?? "").replace(/\$\{[^}]*\}/g, ""));
  }
  if (jsx) for (const m of noLine.matchAll(/>([^<>{}]+)</g)) out.push(m[1]);
  return out;
}

const SHOP_WORD = /\bshop(?:'s|’s|s)?\b/i;

/** Literal strings that are not words a reader sees (keys, field names). */
const NOT_WORDS = new Set(["shop"]);

test("NO PAGE A CUSTOMER READS SAYS 'SHOP' (src/, the pages)", () => {
  const files = readdirSync(new URL("src/", root), { recursive: true })
    .map(String)
    .filter((f) => /\.(tsx?|mjs)$/.test(f));
  assert.ok(files.length > 20);
  const hits = [];
  for (const f of files) {
    for (const s of customerStrings(read(`src/${f.replace(/\\/g, "/")}`), { jsx: f.endsWith(".tsx") })) {
      if (NOT_WORDS.has(s.trim())) continue;
      if (SHOP_WORD.test(s)) hits.push(`${f}: ${s.trim().slice(0, 80)}`);
    }
  }
  assert.deepEqual(hits, []);
});

test("no customer message, PDF word or email builder says 'shop'", () => {
  for (const rel of [
    "shared/customerMessages.mjs",
    "shared/readingCopy.mjs",
    "shared/footerTheme.mjs",
    "netlify/lib/readingPdf.mjs",
    "netlify/lib/deliveryEmail.mjs",
    "netlify/lib/myChartsEmail.mjs",
    "netlify/lib/emailFooter.mjs",
    "netlify/lib/messagePage.mjs",
    "netlify/lib/notFoundPage.mjs",
  ]) {
    const hits = customerStrings(read(rel)).filter((s) => !NOT_WORDS.has(s.trim()) && SHOP_WORD.test(s));
    assert.deepEqual(hits, [], rel);
  }
  for (const [key, m] of Object.entries(MESSAGES)) if (m.text) assert.doesNotMatch(m.text, SHOP_WORD, key);
});

test("THE NOTES JEREMY SENDS A BUYER never say 'shop' -- filled or not", () => {
  for (const [key, words] of Object.entries(NOTES)) {
    assert.doesNotMatch(words, SHOP_WORD, key);
    assert.doesNotMatch(fillNote(key, { link: "https://x/r/1", shop: "https://x" }), SHOP_WORD, key);
  }
  // The checkout-down note names his page the way he does.
  assert.match(NOTES["checkout-down"], /Human Design readings: \{readings\}/);
});

test("every email a buyer gets, rendered, never says 'shop'", () => {
  const links = SITE;
  const reading = { tier: 2, pending: false, birth: { date: "1991-07-22", place: "Denver, Colorado", name: "Alex" }, buyer: { name: "Alex Rivera" } };
  const emails = [
    ...[0, 1, 2].flatMap((tier) => [
      deliveryEmail({ tier, name: "Alex", url: "https://x/r/1", links, pending: true, amountCents: 111, paidAt: Date.now() }),
      deliveryEmail({ tier, name: "Alex", url: "https://x/r/1", links, pending: true, kept: true }),
      deliveryEmail({ tier, name: "Alex", chartName: "Sam", url: "https://x/r/1", links, pending: false }),
    ]),
    myChartsEmail({ charts: [], links, origin: "https://x" }),
    myChartsEmail({ charts: [{ reading, url: "https://x/r/1" }], links, origin: "https://x" }),
  ];
  for (const e of emails) {
    for (const part of [e.subject, e.text, e.html.replace(/<!--[\s\S]*?-->/g, "")]) assert.doesNotMatch(part, SHOP_WORD);
  }
});

test("A LINK TO THE WIDER /library/ on these pages says 'Open the full Coaching Library'", () => {
  // Today no page, email or PDF here links the whole library -- each links the
  // Human Design library or the bodygraph guide. If one ever does, it carries
  // the name Jeremy gave it.
  const wide = /https:\/\/thechampagnemethod\.co\/library\/?["'`]/;
  const files = [
    ...readdirSync(new URL("src/", root), { recursive: true }).map((f) => `src/${String(f).replace(/\\/g, "/")}`),
    ...readdirSync(new URL("netlify/lib/", root)).map((f) => `netlify/lib/${f}`),
  ].filter((f) => /\.(tsx?|mjs)$/.test(f));
  for (const f of files) {
    const src = read(f);
    for (const line of src.split("\n")) {
      if (/^\s*(library|LIBRARY_ALL)\s*:/.test(line)) continue; // the constant itself (copy.ts, siteLinks.mjs)
      if (wide.test(line)) assert.match(line, /full Coaching Library/, `${f}: ${line.trim()}`);
    }
    for (const m of src.matchAll(/SITE\.library\b/g)) {
      const near = src.slice(m.index, m.index + 300);
      assert.match(near, /full Coaching Library/, `${f}: a link to the whole library without its name`);
    }
  }
});
