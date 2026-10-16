import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  FOOTER,
  GUIDE_PROMPT,
  GUIDE_URL,
  ONWARD_NOTE,
  TITLE_MARK,
  WORDMARK,
  readingPdf,
} from "../netlify/lib/readingPdf.mjs";
import { LIBRARY, SHOP, SITE_URL, BODYGRAPH_GUIDE, topic } from "../shared/libraryLinks.mjs";
import { birthLine } from "../shared/birthLine.mjs";
import { syntheticReading } from "./support/syntheticReading.mjs";
import { structureProblem } from "../netlify/lib/interpretation.mjs";

/**
 * The 10/16 branding, the birth line and the links, on the shop's PDF -- the
 * phone's PdfBrandingTest, held to the same strings.
 */

const DIR = new URL("./fixtures/phone-parity/", import.meta.url);
const read = (f) => readFileSync(new URL(f, DIR), "utf8");
const OUTPUT = JSON.parse(read("claude-test-four.output.json")); // Manifestor 1/3, Splenic, Eden
// The structure of a real reading with placeholder words (this repo is public).
const READING = syntheticReading(OUTPUT);

test("the placeholder reading is structurally a real one", () => {
  assert.equal(structureProblem(READING), null);
});
const BIRTH = { date: "1976-12-14", time: "18:18", timeKnown: true, place: "Chicago, Illinois", zone: "America/Chicago" };

const render = (over = {}) =>
  readingPdf({ tier: 2, name: "Claude Test Four", output: OUTPUT, reading: READING, birth: BIRTH, inspect: true, ...over });

const pagesOf = (r) => Math.max(...r.runs.map((x) => x.page));

test("the brand lines are Jeremy's wording, 'by' lowercase", () => {
  assert.equal(TITLE_MARK, "HUMAN DESIGN INTERPRETATION by THE CHAMPAGNE METHOD");
  assert.equal(WORDMARK, "HUMAN DESIGN by THE CHAMPAGNE METHOD COACHING AND CONSULTING");
  assert.equal(FOOTER, "The Champagne Method Coaching and Consulting · thechampagnemethod.co");
  assert.equal(GUIDE_PROMPT, "How to read your bodygraph →");
  assert.equal(GUIDE_URL, "thechampagnemethod.co/library/bodygraph");
  assert.equal(
    ONWARD_NOTE,
    "Every word above is explained in The Human Design library, and the drawing on page 1 in " +
      "“Reading your bodygraph.” Both are free, at thechampagnemethod.co/library/human-design.",
  );
});

test("page 1: eyebrow, name, birth line; every later page: the running brand line", async () => {
  const r = await render();
  const p1 = r.runs.filter((x) => x.page === 1).map((x) => x.text);
  assert.deepEqual(p1.slice(0, 3), [TITLE_MARK, "Claude Test Four", "December 14, 1976 · 6:18 PM · Chicago, Illinois · Timezone: UTC-06:00"]);
  for (let p = 2; p <= pagesOf(r); p++) {
    assert.ok(r.runs.some((x) => x.page === p && x.text === WORDMARK), `page ${p} has no brand line`);
  }
});

test("no birth details kept (a reading from before 16 Oct): no birth line, nothing invented", async () => {
  const r = await render({ birth: null });
  const p1 = r.runs.filter((x) => x.page === 1).map((x) => x.text);
  assert.deepEqual(p1.slice(0, 2), [TITLE_MARK, "Claude Test Four"]);
  assert.ok(!p1.some((t) => /Timezone|1976/.test(t)), p1.slice(0, 4).join(" | "));
});

test("an unknown birth time says so, and the noon note follows", async () => {
  const r = await render({ birth: { ...BIRTH, timeKnown: false, time: null }, output: { ...OUTPUT, timeKnown: false } });
  const p1 = r.runs.filter((x) => x.page === 1).map((x) => x.text);
  assert.equal(p1[2], "December 14, 1976 · Time unknown (charted at noon) · Chicago, Illinois · Timezone: UTC-06:00");
  assert.ok(p1.join(" ").includes("Birth time was not known, so this chart is cast at noon."));
});

test("a nameless purchase is 'Your Human Design', as the shop has always said", async () => {
  const r = await render({ name: null });
  assert.equal(r.runs.filter((x) => x.page === 1)[1].text, "Your Human Design");
});

test("every page: the whole footer goes home, the page number does not", async () => {
  const r = await render();
  for (let p = 1; p <= pagesOf(r); p++) {
    const foot = r.runs.find((x) => x.page === p && x.text === FOOTER);
    const num = r.runs.find((x) => x.page === p && x.text === String(p) && x.y > 750);
    const l = r.links.filter((x) => x.page === p && x.uri === SITE_URL);
    assert.equal(l.length, 1, `page ${p}`);
    assert.ok(Math.abs(l[0].left - (foot.x - 1.5)) < 0.5 && Math.abs(l[0].right - (foot.x + foot.w + 1.5)) < 0.5);
    assert.ok(l[0].right < num.x, `page ${p}: the footer link covers the page number`);
    // The brand line opens the shop.
    const brand = r.runs.find((x) => x.page === p && (x.text === WORDMARK || x.text === TITLE_MARK));
    const shop = r.links.filter((x) => x.page === p && x.uri === SHOP);
    assert.equal(shop.length, 1, `page ${p} shop links`);
    assert.ok(Math.abs(shop[0].left - (brand.x - 1.5)) < 0.5, `page ${p}: shop link off the brand line`);
  }
});

test("page 1: the guide line and the QR open the bodygraph guide", async () => {
  const r = await render();
  const guide = r.links.filter((x) => x.page === 1 && x.uri === BODYGRAPH_GUIDE);
  assert.equal(guide.length, 2);
  const qr = guide.find((g) => Math.abs(g.right - g.left - (g.bottom - g.top)) < 0.5 && g.right - g.left > 34);
  assert.ok(qr, "no square QR link");
  const line = guide.find((g) => g !== qr);
  assert.ok(qr.left > line.right, "the QR link overlaps the line");
});

test("chart words open their own library entry (Claude Test Four, as the phone counts them)", async () => {
  const r = await render();
  const lib = r.links.filter((l) => l.uri.startsWith(LIBRARY + "#"));
  const on = (page, anchor) => lib.filter((l) => l.page === page && l.uri === topic(anchor)).length;
  assert.equal(on(2, "type-manifestor"), 4); // type, strategy, on track, off track
  assert.equal(on(2, "authority"), 1);
  assert.equal(on(2, "profile-1-3"), 1);
  assert.equal(on(2, "definition"), 1);
  assert.equal(on(2, "cross-r-eden"), 1);
  assert.equal(on(2, "centers"), 3);
  assert.equal(on(2, "channels"), 1);
  assert.equal(lib.filter((l) => l.page >= 3 && l.page <= 4 && l.uri === topic("centers")).length, 9);
  for (const ch of ["20-57", "26-44", "28-38"]) {
    assert.equal(lib.filter((l) => l.page >= 3 && l.page <= 4 && l.uri === topic(`channel-${ch}`)).length, 1, ch);
  }
  assert.equal(lib.filter((l) => l.page >= 3 && l.page <= 4 && l.uri === topic("line-1")).length, 1);
  assert.equal(lib.filter((l) => l.page >= 3 && l.page <= 4 && l.uri === topic("line-3")).length, 1);
  const margin = lib.filter((l) => l.page >= 5).map((l) => l.uri.split("#")[1]);
  for (const a of ["authority", "centers", "type-manifestor", "definition", "profile-1-3", "cross-r-eden"]) {
    assert.ok(margin.includes(a), `margin link ${a} missing`);
  }
  // Every box sits on words drawn on its page, and no two boxes overlap.
  for (const l of r.links) {
    if (l.uri === BODYGRAPH_GUIDE && l.page === 1) continue; // the QR is a picture, not words
    assert.ok(
      r.runs.some((x) => x.page === l.page && x.y > l.top && x.y < l.bottom && x.x < l.right && x.x + x.w > l.left),
      `box over nothing: p${l.page} ${l.uri}`,
    );
  }
  for (const a of r.links)
    for (const b of r.links) {
      if (a === b || a.page !== b.page) continue;
      const overlap = a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1;
      assert.ok(!overlap, `overlap p${a.page}: ${a.uri} / ${b.uri}`);
    }
  // Nothing else is a link.
  assert.ok(
    r.links.every((l) => [SITE_URL, SHOP, LIBRARY, BODYGRAPH_GUIDE].includes(l.uri) || l.uri.startsWith(LIBRARY + "#")),
  );
});

test("the onward note's three names are links, each on its own words", async () => {
  const r = await render();
  const note = r.links.filter((l) => l.page === 2 && (l.uri === LIBRARY || l.uri === BODYGRAPH_GUIDE));
  assert.ok(note.length >= 3, `${note.length} note links`);
  assert.deepEqual(new Set(note.map((l) => l.uri)), new Set([LIBRARY, BODYGRAPH_GUIDE]));
});

test("nothing is drawn past the foot of any page, footer aside", async () => {
  for (const birth of [BIRTH, null]) {
    const r = await render({ birth });
    for (const x of r.runs) {
      assert.ok(x.y <= 712.5 || (x.y > 751 && x.y < 753), `p${x.page} '${x.text}' at ${x.y}`);
    }
  }
});

test("a letter-mode reading keeps the old plain shape", async () => {
  const markers = new Set(["IN SHORT", "Your incarnation cross", "Your definition", "Your channels", "Your profile lines",
    "Your energy, and how it starts", "How you decide", "How you meet the world", "What is consistently yours",
    "What you take in from others", "When it's on track, and when it's off track", "Things to experiment with"]);
  const letter = READING.split(/\r?\n/).filter((l) => !markers.has(l.trim())).join("\n");
  const r = await render({ reading: letter });
  const heads = Array.from({ length: pagesOf(r) }, (_, i) =>
    r.runs.find((x) => x.page === i + 1 && x.size === 9.5 && x.bold && x.y > 61 && x.y < 64)?.text ?? null,
  );
  assert.deepEqual(heads.slice(0, 2), [null, "Your chart at a glance"]);
  assert.ok(heads.slice(2).every((h) => h === "Your reading"), String(heads));
});

test("the birth line, as the phone writes it", () => {
  assert.equal(birthLine(BIRTH), "December 14, 1976 · 6:18 PM · Chicago, Illinois · Timezone: UTC-06:00");
  // The zone's offset AT the birth moment: a Chicago summer is UTC-05:00.
  assert.equal(
    birthLine({ ...BIRTH, date: "1976-09-17", time: "13:39" }),
    "September 17, 1976 · 1:39 PM · Chicago, Illinois · Timezone: UTC-05:00",
  );
  assert.equal(
    birthLine({ date: "1985-06-25", timeKnown: false, place: "Kolkata, India", zone: "Asia/Kolkata" }),
    "June 25, 1985 · Time unknown (charted at noon) · Kolkata, India · Timezone: UTC+05:30",
  );
  assert.equal(birthLine({ ...BIRTH, time: "00:05" }), "December 14, 1976 · 12:05 AM · Chicago, Illinois · Timezone: UTC-06:00");
  assert.equal(birthLine({ ...BIRTH, time: "12:00" }), "December 14, 1976 · 12:00 PM · Chicago, Illinois · Timezone: UTC-06:00");
  for (const bad of [null, undefined, {}, { date: "1976-12-14" }, { ...BIRTH, zone: "Not/AZone" }, { ...BIRTH, time: "25:00" }]) {
    assert.equal(birthLine(bad), null, JSON.stringify(bad));
  }
});
