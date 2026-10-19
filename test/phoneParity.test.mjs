import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { readingPdf } from "../netlify/lib/readingPdf.mjs";
import { buildReadingView } from "../netlify/lib/readingView.mjs";
import { summaryRows } from "../netlify/lib/interpretation.mjs";
import { hasLonelyLastWord, hooks } from "../netlify/lib/pdfText.mjs";

/**
 * THE SHOP'S PDF IS THE PHONE'S PDF (Jeremy 10/16: "All PDFs should look the
 * same").
 *
 * The reference is the phone app's own output for its four made-up "Claude
 * Test" clients: hd-reading-app's PdfOrderTest runs the REAL PdfExport layout
 * under Robolectric and writes every string it draws, with where it landed,
 * to app/build/pdf-render/<client>/text.tsv; PdfBrandingTest prints every
 * link box. tools/phone-parity-sync.mjs copies them (main @ 0e8fcd4, 16 Oct
 * 2026) into test/fixtures/phone-parity.local -- GITIGNORED, because they
 * carry four model-written readings from the private phone repo and this repo
 * is public. The engine's payload for the same four births (engine 0.4.0,
 * the engine the shop calls) is committed in test/fixtures/phone-parity.
 *
 * WITHOUT THE .local FOLDER THESE TESTS SKIP, and say so in the output.
 *
 * Compared: the page sequence, every word on every page (as a multiset, so a
 * line that breaks a word earlier on one side still matches), the order of
 * the reading's sections, the Start here content, and every link -- page by
 * page, URI by URI. NOT compared: the drawing's own labels on page 1 (the
 * phone draws its own bodygraph; the shop prints the engine's), and exact
 * line breaks (Robolectric rounds every glyph advance to a whole pixel; a
 * phone and pdfkit do not).
 */

const DIR = new URL("./fixtures/phone-parity/", import.meta.url);
const LOCAL = new URL("./fixtures/phone-parity.local/", import.meta.url);
const HAVE = existsSync(new URL("claude-test-four.phone.tsv", LOCAL));
const SKIP = HAVE ? false : "phone fixtures absent -- run tools/phone-parity-sync.mjs";
if (!HAVE) console.log(`SKIPPED phone parity: ${SKIP}`);
const FIXTURES = [
  ["claude-test-four", "Claude Test Four", { date: "1976-12-14", time: "18:18" }],
  ["claude-test-three", "Claude Test Three", { date: "1964-03-20", time: "14:44" }],
  ["claude-test-two", "Claude Test Two", { date: "1976-09-17", time: "13:39" }],
  ["claude-test", "Claude Test", { date: "1987-03-14", time: "08:45" }],
];

const read = (f) => readFileSync(new URL(f, /\.output\.json$/.test(f) ? DIR : LOCAL), "utf8");

function phoneRuns(slug) {
  return read(`${slug}.phone.tsv`)
    .split(/\r?\n/)
    .filter(Boolean)
    .map((l) => {
      const p = l.split("\t");
      return { page: +p[0], x: +p[1], y: +p[2], size: +p[3], color: p[4], bold: p[5] === "1", w: +p[6], text: p[7] };
    })
    // The phone's own bodygraph labels (gate numbers and center names, 5.5-6pt).
    // Strictly under 6.5: the QR caption (fix 17A, 10/19) is 6.5pt on both sides.
    .filter((r) => !(r.page === 1 && r.size < 6.5));
}

function phoneLinks(slug) {
  return read(`${slug}.phone.links.tsv`)
    .split(/\r?\n/)
    .filter(Boolean)
    .map((l) => {
      const [page, uri, left, top, right, bottom] = l.split("\t");
      return { page: +page, uri, left: +left, top: +top, right: +right, bottom: +bottom };
    });
}

const cache = new Map();
async function shop(slug, name, b) {
  if (cache.has(slug)) return cache.get(slug);
  const output = JSON.parse(read(`${slug}.output.json`));
  const reading = read(`${slug}.reading.txt`);
  const birth = { ...b, timeKnown: true, place: "Chicago, Illinois", zone: "America/Chicago" };
  const r = await readingPdf({ tier: 2, name, output, reading, birth, inspect: true });
  const out = { ...r, output, reading };
  cache.set(slug, out);
  return out;
}

/** Words, with quotes and dashes made plain so "→" vs a fallback glyph cannot matter. */
const words = (s) =>
  s
    .replace(/[ ]/g, " ")
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .split(/\s+/)
    .filter(Boolean);

function pageWords(runs, page) {
  return runs
    .filter((r) => r.page === page)
    .flatMap((r) => words(r.text))
    .sort();
}

const heads = (runs, pages) =>
  Array.from({ length: pages }, (_, i) => {
    const r = runs.find((x) => x.page === i + 1 && x.size === 9.5 && x.bold && Math.abs(x.x - 54) < 0.1 && x.y > 61 && x.y < 64);
    return r ? r.text : null;
  });

const pagesOf = (runs) => Math.max(...runs.map((r) => r.page));

for (const [slug, name, b] of FIXTURES) {
  test(`${slug}: the same pages, in the same order, as the phone`, { skip: SKIP }, async () => {
    const s = await shop(slug, name, b);
    const p = phoneRuns(slug);
    assert.deepEqual(heads(s.runs, pagesOf(s.runs)), heads(p, pagesOf(p)));
  });

  test(`${slug}: pages 1-4 carry the same words as the phone's, page by page`, { skip: SKIP }, async () => {
    const s = await shop(slug, name, b);
    const p = phoneRuns(slug);
    for (let page = 1; page <= 4; page++) {
      assert.deepEqual(pageWords(s.runs, page), pageWords(p, page), `${slug} page ${page}`);
    }
  });

  test(`${slug}: the reading pages carry the same words as the phone's, in total`, { skip: SKIP }, async () => {
    // Where a reading page breaks depends on how many lines each paragraph
    // takes, and Robolectric's whole-pixel advances set Roboto a few percent
    // narrower than a real device (or pdfkit) does -- so a paragraph can carry
    // over a page earlier here. The words, and their order, are the same.
    const s = await shop(slug, name, b);
    const p = phoneRuns(slug);
    const reading = (runs) => runs.filter((r) => r.page >= 5 && !(r.y > 740));
    // A word broken after its hyphen ("self-" / "worth") is still one word.
    const all = (runs) => words(reading(runs).map((r) => r.text).join(" ").replace(/(\p{L})- +(?=\p{L})/gu, "$1-")).sort();
    assert.deepEqual(all(s.runs), all(p));
    const perPage = (runs) =>
      Array.from({ length: pagesOf(runs) - 4 }, (_, i) => reading(runs).filter((r) => r.page === i + 5).length);
    const same = Array.from({ length: pagesOf(p) - 4 }, (_, i) => i + 5).filter(
      (pg) => pageWords(s.runs, pg).join(" ") === pageWords(p, pg).join(" "),
    );
    console.log(`PARITY ${slug}: reading pages ${pagesOf(s.runs) - 4} (phone ${pagesOf(p) - 4}); word-identical pages: ${same.join(",") || "none"}; runs/page shop ${perPage(s.runs)} phone ${perPage(p)}`);
  });

  test(`${slug}: the reading runs in the phone's order`, { skip: SKIP }, async () => {
    const s = await shop(slug, name, b);
    const p = phoneRuns(slug);
    const order = (runs) =>
      runs.filter((r) => r.size === 9 && r.bold && Math.abs(r.x - 54) < 0.1 && r.color.toUpperCase().endsWith("8A6D0F")).map((r) => r.text);
    assert.deepEqual(order(s.runs), order(p));
    assert.deepEqual(order(s.runs), [
      "HOW YOU DECIDE",
      "YOUR ENERGY, AND HOW IT STARTS",
      "HOW YOU MEET THE WORLD",
      "WHEN IT'S ON TRACK, AND WHEN IT'S OFF TRACK",
      "YOUR INCARNATION CROSS",
      "YOUR DEFINITION",
      "WHAT IS CONSISTENTLY YOURS",
      "WHAT YOU TAKE IN FROM OTHERS",
      "THINGS TO EXPERIMENT WITH",
    ]);
  });

  test(`${slug}: Start here says what the phone's Start here says`, { skip: SKIP }, async () => {
    const s = await shop(slug, name, b);
    const v = buildReadingView(s.output, s.reading);
    assert.ok(v, "the reading should lay out in the new order");
    const start = s.runs.filter((r) => r.page === 3 || r.page === 4).map((r) => r.text).join(" ");
    const flat = (t) => words(t).join(" ");
    const startFlat = flat(start);
    for (const item of [...v.definedCenters, ...v.otherCenters, ...v.channels, ...v.profileLines]) {
      assert.ok(startFlat.includes(flat(item.line)), `library line for ${item.title}`);
    }
    for (const t of [...v.centersTakeaway, ...v.channelsTakeaway, ...v.profileLinesTakeaway]) {
      assert.ok(startFlat.includes(flat(t)), `takeaway: ${t}`);
    }
    // Call 4: the glance box keeps its Profile sentence; Start here does not repeat it.
    const profile = summaryRows(s.reading).Profile;
    assert.ok(flat(s.runs.filter((r) => r.page === 2).map((r) => r.text).join(" ")).includes(flat(profile)));
    assert.ok(!startFlat.includes(flat(profile)), "the glance Profile sentence is repeated on Start here");
  });

  test(`${slug}: every link goes where the phone's goes`, { skip: SKIP }, async () => {
    // Pages 1-4 page by page; the reading pages as one set (see above).
    const s = await shop(slug, name, b);
    const key = (l) => `p${l.page <= 4 ? l.page : "5+"} ${l.uri}`;
    // As SETS since fix 7 (10/19): a term link gets one box per line it covers,
    // and a term can wrap on one side only, so the box COUNT may differ while
    // every (page, destination) pair is the same.
    assert.deepEqual([...new Set(s.links.map(key))].sort(), [...new Set(phoneLinks(slug).map(key))].sort());
  });

  test(`${slug}: link boxes on pages 1-4 sit where the phone's do`, { skip: SKIP }, async () => {
    // Same page, same URI, and the box lands on the same spot of the page:
    // the shop's box overlaps one of the phone's. Words wrap a few points
    // differently, so this asks for overlap, not equality.
    const s = await shop(slug, name, b);
    const phone = phoneLinks(slug).filter((l) => l.page <= 4);
    // Term links in the reading text (fix 7) move with each side's own line wraps; left out here.
    for (const a of s.links.filter((l) => l.page <= 4 && l.kind !== "term")) {
      const hit = phone.some(
        (bx) => bx.page === a.page && bx.uri === a.uri && a.left < bx.right && bx.left < a.right && a.top < bx.bottom + 6 && bx.top < a.bottom + 6,
      );
      assert.ok(hit, `${slug} p${a.page} ${a.uri}: [${a.left.toFixed(1)} ${a.top.toFixed(1)} ${a.right.toFixed(1)} ${a.bottom.toFixed(1)}] matches no phone box`);
    }
  });
}

test("no paragraph in the shop PDF ends on one word alone (call 8)", { skip: SKIP }, async () => {
  const seen = [];
  hooks.onLayout = (l) => seen.push(l);
  try {
    for (const [slug, name, b] of FIXTURES) {
      const output = JSON.parse(read(`${slug}.output.json`));
      await readingPdf({ tier: 2, name, output, reading: read(`${slug}.reading.txt`), birth: { ...b, zone: "America/Chicago" } });
    }
  } finally {
    hooks.onLayout = null;
  }
  const lonely = seen.filter(hasLonelyLastWord).map((l) => `[${l.paint.size}pt w=${l.width}] ${l.text}`);
  assert.deepEqual(lonely, []);
  assert.ok(seen.length > 100);
});
