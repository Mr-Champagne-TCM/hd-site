import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, statSync } from "node:fs";
import {
  NEXT_STEPS_HEAD,
  ONWARD_NOTE,
  ONWARD_NOTE_PAGE,
  WORDMARK,
  readingPdf,
} from "../netlify/lib/readingPdf.mjs";
import { LIBRARY, BODYGRAPH_GUIDE } from "../shared/libraryLinks.mjs";

/**
 * Jeremy's brand calls of 16 Oct, as built: the shop's tab title and link
 * preview (B1), the header (B2 = option B), and the chart tier's calm page 3
 * (item 12 = option B). B3-B6 are held by deliveryEmail.test.mjs and the
 * page's own source below.
 */

const root = new URL("../", import.meta.url);
const read = (p) => readFileSync(new URL(p, root), "utf8");
const OUTPUT = JSON.parse(read("test/fixtures/phone-parity/claude-test-four.output.json"));
const BIRTH = { date: "1976-12-14", time: "18:18", timeKnown: true, place: "Chicago, Illinois", zone: "America/Chicago" };

const meta = (html, attr, key) => {
  const re = new RegExp(`<meta\\s+${attr}="${key}"\\s+content="([^"]*)"`);
  return html.match(re)?.[1] ?? null;
};

test("B1: tab title and preview title say whose readings these are", () => {
  const html = read("index.html");
  const title = "Human Design readings by The Champagne Method Coaching and Consulting";
  assert.equal(html.match(/<title>([^<]*)<\/title>/)?.[1], title);
  assert.equal(meta(html, "property", "og:title"), title);
  assert.equal(meta(html, "property", "og:site_name"), "The Champagne Method Coaching and Consulting");
});

test("the link preview carries a large picture, at the path the final picture will replace", () => {
  const html = read("index.html");
  assert.equal(meta(html, "name", "twitter:card"), "summary_large_image");
  assert.equal(meta(html, "property", "og:image"), "https://humandesign.thechampagnemethod.co/og-preview.png");
  assert.equal(meta(html, "property", "og:image:width"), "1200");
  assert.equal(meta(html, "property", "og:image:height"), "630");
  // The file the tags point at is served from public/ at the site root.
  const png = readFileSync(new URL("public/og-preview.png", root));
  assert.deepEqual([...png.subarray(1, 4)].map((c) => String.fromCharCode(c)).join(""), "PNG");
  assert.equal(png.readUInt32BE(16), 1200, "width");
  assert.equal(png.readUInt32BE(20), 630, "height");
  assert.ok(statSync(new URL("public/og-preview.png", root)).size < 1_000_000, "a preview picture over 1 MB is skipped by some apps");
});

test("B2: the header is option B, a 'Human Design by' eyebrow over the wordmark, 'by' lowercase", () => {
  const app = read("src/App.tsx");
  assert.match(app, /Human Design <span className="normal-case">by<\/span>/);
  assert.doesNotMatch(app, /HEADER_OPTION/, "the A/B switch is gone now that B is decided");
  assert.doesNotMatch(app, />Coaching and Consulting</, "option A's under-line came back");
});

test("B3/B4: the footer and the reading page name the business in full", () => {
  assert.match(read("src/App.tsx"), /\[SITE\.home, "The Champagne Method Coaching and Consulting"\]/);
  assert.match(read("src/ReadingActions.tsx"), /The Champagne Method Coaching and Consulting\s*<\/a>/);
});

const render = (tier) =>
  readingPdf({ tier, name: "Claude Test Four", output: OUTPUT, birth: tier >= 1 ? BIRTH : null, inspect: true });
const headOf = (r, p) => r.runs.find((x) => x.page === p && x.size === 9.5 && x.bold && x.y > 61 && x.y < 64)?.text ?? null;
const pagesOf = (r) => Math.max(...r.runs.map((x) => x.page));

test("item 12, option B: the chart tier ends on a calm page 3 of its own", async () => {
  assert.equal(NEXT_STEPS_HEAD, "Where to go from here");
  assert.equal(ONWARD_NOTE_PAGE, ONWARD_NOTE.replace("Every word above", "Every word on page 2"));
  assert.ok(ONWARD_NOTE_PAGE.startsWith("Every word on page 2 is explained in The Human Design library"));
  const r = await render(1);
  assert.equal(pagesOf(r), 3);
  assert.equal(headOf(r, 2), "Your chart at a glance");
  assert.equal(headOf(r, 3), NEXT_STEPS_HEAD);
  assert.ok(r.runs.some((x) => x.page === 3 && x.text === WORDMARK), "page 3 has no running brand line");
  const p2 = r.runs.filter((x) => x.page === 2).map((x) => x.text).join(" ");
  const p3 = r.runs.filter((x) => x.page === 3).map((x) => x.text);
  assert.doesNotMatch(p2, /comes off the price|Every word above|FREE TO READ/, "page 2 still carries the end block");
  const at = (t) => p3.findIndex((x) => x === t);
  assert.ok(at("FREE TO READ, EITHER WAY") > 0);
  assert.ok(at("IF YOU WOULD LIKE MORE THAN THIS CHART") > at("FREE TO READ, EITHER WAY"), p3.join(" | "));
  const text3 = p3.join(" ");
  assert.match(text3, /Every word on page 2 is explained/);
  assert.match(text3, /Nobody pays twice for the same thing\./);
  // The note's three names are still links, now on page 3.
  const note = r.links.filter((l) => l.page === 3 && (l.uri === LIBRARY || l.uri === BODYGRAPH_GUIDE));
  assert.ok(note.length >= 3, `${note.length} note links on page 3`);
});

test("the reading tier keeps 'Every word above' under its values, and no offer", async () => {
  const r = await render(2);
  const all = r.runs.map((x) => x.text).join(" ");
  assert.match(all, /Every word above is explained/);
  assert.doesNotMatch(all, /Every word on page 2|Where to go from here|comes off the price/);
});

test("item 11: the key has no extra line under it, as on the phone", async () => {
  for (const tier of [1, 2]) {
    const r = await render(tier);
    const p1 = r.runs.filter((x) => x.page === 1).map((x) => x.text).join(" ");
    assert.doesNotMatch(p1, /left unfilled|white or violet|all of them dark means open/, `tier ${tier}`);
  }
});
