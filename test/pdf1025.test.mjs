import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { inflateSync } from "node:zlib";
import { readingPdf, FIT_FLOOR, fitShare, fitTries } from "../netlify/lib/readingPdf.mjs";
import { MECHANICS } from "../netlify/lib/interpretation.mjs";
import { syntheticReading } from "./support/syntheticReading.mjs";

/**
 * THE 10/25 LIVE-TEST PDF FIXES (both PDFs, the phone's PdfExport.kt the same).
 *
 *   1. A Start here section keeps together: "Your profile" and its lines
 *      ended page 5, its Takeaway stood alone at the top of page 6.
 *   2. (The phone's text layer read the birth time's colon as U+FFFE: a
 *      contextual raised colon in the phone's own face. The shop's Roboto has
 *      no such swap; the last test here holds the shop's text layer to that.)
 *   3. Page 2 holds what it holds, measured: the fit had a few points to
 *      spare, and one more two-line glance row sent the planet numbers and the
 *      note over to a page 3 of their own again (the 10/25 live reading: 30%).
 */

const DIR = new URL("./fixtures/phone-parity/", import.meta.url);
const FOUR = JSON.parse(readFileSync(new URL("claude-test-four.output.json", DIR), "utf8"));
const FOUR_BIRTH = { date: "1976-12-14", time: "18:18", timeKnown: true, place: "Chicago, Illinois", zone: "America/Chicago" };

const BOTTOM = 792 - 54 - 26;
const TOP = 54 + 31;
const FOOTER_Y = 792 - 54 + 14;

// ---------------------------------------------------------------- 1. Start here

/** Each channel's sentence in the placeholder reading, run on by `k` words: the channels section grows a little at a time. */
function longerChannels(reading, k) {
  const words = Array.from({ length: k }, (_, i) => ["and", "the", "room", "settles"][i % 4]).join(" ");
  let inChannels = false;
  return reading
    .split("\n")
    .map((l) => {
      if (l.trim() === MECHANICS[2]) inChannels = true;
      else if (l.trim() === MECHANICS[3]) inChannels = false;
      return inChannels && /: The placeholder sentence about this channel\.$/.test(l) && k ? l.replace(/\.$/, ` ${words}.`) : l;
    })
    .join("\n");
}

/** Start here's section titles (13pt gold) and Takeaway labels, in order, with their page. */
function startHere(r) {
  return r.runs.filter((x) => (x.size === 13 && x.bold && x.x === 54 + 24) || (x.text === "TAKEAWAY" && x.x === 54 + 14));
}

test("1025-1 A START HERE SECTION KEEPS TOGETHER: its Takeaway is on its heading's page, wherever the page breaks", async () => {
  const base = syntheticReading(FOUR);
  let moved = 0;
  for (let k = 0; k <= 160; k += 8) {
    const r = await readingPdf({ tier: 2, name: "Claude Test Four", output: FOUR, birth: FOUR_BIRTH, reading: longerChannels(base, k), inspect: true });
    const marks = startHere(r);
    const titles = marks.filter((x) => x.text !== "TAKEAWAY");
    assert.deepEqual(titles.map((x) => x.text), ["Your centers", "Your channels", "Your profile"], `k=${k}`);
    for (const t of titles) {
      // The Takeaway that follows this title (before the next title).
      const after = marks.slice(marks.indexOf(t) + 1);
      const take = after.find((x) => x.text === "TAKEAWAY");
      const nextTitle = after.find((x) => x.text !== "TAKEAWAY");
      assert.ok(take && (!nextTitle || marks.indexOf(take) < marks.indexOf(nextTitle)), `k=${k}: ${t.text} has no Takeaway`);
      // A section that starts its page and still runs over is taller than a page: it flows, as before.
      if (t.y < TOP + 30 && take.page > t.page) continue;
      assert.equal(take.page, t.page, `k=${k}: "${t.text}" is on page ${t.page}, its Takeaway on page ${take.page}`);
    }
    const profile = titles.find((x) => x.text === "Your profile");
    const channels = titles.find((x) => x.text === "Your channels");
    if (profile.page !== channels.page) {
      moved++;
      // Moved whole, to the top of the next page; the page it left keeps the channels' Takeaway at its foot.
      assert.ok(profile.y < TOP + 30, `k=${k}: the profile section did not start its page`);
    }
  }
  assert.ok(moved > 0, "the sweep never pushed the profile section over a page break, so the rule was not tested");
});

test("1025-1 a page break never leaves a Start here heading without its first row", async () => {
  const base = syntheticReading(FOUR);
  for (let k = 0; k <= 160; k += 8) {
    const r = await readingPdf({ tier: 2, name: "Claude Test Four", output: FOUR, birth: FOUR_BIRTH, reading: longerChannels(base, k), inspect: true });
    for (const t of startHere(r).filter((x) => x.text !== "TAKEAWAY")) {
      const below = r.runs.filter((x) => x.page === t.page && x.y > t.y + 5 && x.y < FOOTER_Y - 1);
      assert.ok(below.length > 0, `k=${k}: "${t.text}" ends page ${t.page}`);
    }
  }
});

// ---------------------------------------------------------------- 3. page 2

const UMA = JSON.parse(readFileSync(new URL("./fixtures/uma-unknown-time.output.json", import.meta.url), "utf8"));
const UMA_BIRTH = { date: "1975-07-08", time: null, timeKnown: false, place: "Duluth, Minnesota", zone: "America/Chicago" };
const RIG = syntheticReading(UMA);
/** The realistic worst (Jeremy's 10/24 rig, one row worse): unknown time, its tags and Moon note, six channels, all six glance rows on two lines. */
const WORST = RIG.replace(/^Authority: .*$/m, "Authority: The authority sentence of this placeholder reading, long enough that it runs on to a second line.");
const more = (n) => ({ ...UMA, channels: [...UMA.channels, ...["1-8 (Inspiration)", "2-14 (The Beat)", "3-60 (Mutation)"].slice(0, n)] });
const uma = (over = {}) => readingPdf({ tier: 2, name: "Page Fill Test", output: UMA, birth: UMA_BIRTH, reading: RIG, inspect: true, ...over });

const find = (r, re) => r.runs.find((x) => re.test(x.text));
const step = (r) => {
  const y = (t) => r.runs.find((x) => x.page === 2 && x.text === t).y;
  return y("INCARNATION CROSS") - y("DEFINITION");
};
const fill = (r, n) => {
  const ys = r.runs.filter((x) => x.page === n && x.y > 70 && x.y < FOOTER_Y - 1).map((x) => x.y);
  return (Math.max(...ys) - TOP) / (BOTTOM - TOP);
};

function holdsPage2(r, label) {
  const head = find(r, /^TECHNICAL VALUES/);
  const note = find(r, /^Every word (above|on page 2)/);
  assert.equal(head.page, 2, `${label}: the planet numbers went over to page ${head.page}`);
  assert.equal(note.page, 2, `${label}: the onward note went over to page ${note.page}`);
  assert.match(note.text, /^Every word above/);
  assert.ok(r.runs.some((x) => x.page === 2 && x.text === "DESIGN"), `${label}: the Design row left page 2`);
  // Nothing past the foot; the note's link boxes clear the footer line.
  const lowest = Math.max(...r.runs.filter((x) => x.page === 2 && x.y < FOOTER_Y - 1).map((x) => x.y));
  assert.ok(lowest <= BOTTOM, `${label}: page 2 runs to ${lowest}, past its foot`);
  for (const l of r.links.filter((l) => l.page === 2 && l.top > 600 && l.top < FOOTER_Y - 12)) assert.ok(l.bottom < FOOTER_Y - 8, `${label}: a link box reaches the footer`);
  // White space only, and never under the floor: a value row is 12pt of text and 9pt of white space.
  assert.ok(step(r) >= 12 + 9 * FIT_FLOOR - 0.01, `${label}: page 2 gave more than ${1 - FIT_FLOOR} of its white space (${step(r)})`);
  // Page 3 is the next part's first page, well filled -- not a block on its own.
  assert.ok(fill(r, 3) > 0.5, `${label}: page 3 runs only ${Math.round(fill(r, 3) * 100)}% down`);
}

test("1025-3 THE REALISTIC WORST HOLDS PAGE 2: unknown time, tags, the Moon note, six channels, all six glance rows on two lines", async () => {
  const r = await uma({ reading: WORST });
  assert.equal(UMA.channels.length, 6);
  holdsPage2(r, "worst");
  // Measured, not a fixed share: under the old half, which could not hold it.
  assert.ok(r.squeeze.f < 0.5 && r.squeeze.f >= FIT_FLOOR, `squeeze ${r.squeeze.f}`);
});

test("1025-3 ONE ROW WORSE STILL HOLDS: a seventh channel on top of the realistic worst", async () => {
  holdsPage2(await uma({ reading: WORST, output: more(1) }), "worst + 1 channel");
});

test("1025-3 the gentlest share that holds: the rig keeps what the earlier rule gave it (half), a roomier page none", async () => {
  const rig = await uma();
  holdsPage2(rig, "rig");
  assert.equal(rig.squeeze.f, 0.5);
  assert.equal(step(rig), 12 + 9 * 0.5);
  // Time known, one-line rows: page 2 has the room, nothing gives.
  const known = { ...UMA, timeKnown: true };
  for (const k of ["timeSpread", "provisional", "note", "chartedAt"]) delete known[k];
  const roomy = await uma({ output: known, birth: { ...UMA_BIRTH, time: "11:45", timeKnown: true }, reading: RIG.replace(/^(Type|Strategy|Authority|Profile|Signature|Not-self): .*$/gm, "$1: A short sentence.") });
  assert.equal(roomy.squeeze, null);
  assert.equal(step(roomy), 21);
});

test("1025-3 beyond the floor, the planet numbers and the note go over TOGETHER, and the note names page 2", async () => {
  const r = await uma({ reading: WORST, output: more(3) });
  const head = find(r, /^TECHNICAL VALUES/);
  const note = find(r, /^Every word (above|on page 2)/);
  assert.equal(note.page, head.page, "the note left its block");
  assert.notEqual(head.page, 2, "this case was meant to be past the floor");
  assert.match(note.text, /^Every word on page 2/);
  assert.equal(r.alone, null);
});

test("1025-3 fitShare: the share that brings a block to the foot, rounded down; fitTries: gentlest first, never under the floor", () => {
  assert.equal(fitShare({ page: 2, y: 700, spaced: 200 }), 1);
  assert.equal(fitShare({ page: 2, y: BOTTOM + 100, spaced: 200 }), 0.5);
  assert.equal(fitShare({ page: 2, y: BOTTOM + 101, spaced: 200 }), 0.49);
  assert.equal(fitShare({ page: 2, y: BOTTOM + 1, spaced: 0 }), -Infinity);
  assert.deepEqual(fitTries(1), [0.9, 0.8]);
  assert.deepEqual(fitTries(0.93), [0.9, 0.8]);
  assert.deepEqual(fitTries(0.57), [0.55, 0.5]);
  assert.deepEqual(fitTries(0.52), [0.5, 0.47]);
  assert.deepEqual(fitTries(0.45), [0.45, 0.42]);
  assert.deepEqual(fitTries(0.37), [0.37]);
  assert.deepEqual(fitTries(0.3), []);
});

// ------------------------------------------------- 2. the shop's text layer

/** Every ToUnicode map in a pdfkit PDF, inflated. */
function toUnicodeMaps(bytes) {
  const s = bytes.toString("latin1");
  const out = [];
  for (const m of s.matchAll(/stream\r?\n/g)) {
    const start = m.index + m[0].length;
    const end = s.indexOf("endstream", start);
    let body;
    try {
      body = inflateSync(bytes.subarray(start, end)).toString("latin1");
    } catch {
      continue;
    }
    if (body.includes("begincmap")) out.push(body);
  }
  return out;
}

test("1025-2 the shop's text layer reads a clock time's colon as ':' (no glyph maps to nothing, as the phone's raised colon did)", async () => {
  const r = await readingPdf({ tier: 2, name: "Claude Test Four", output: FOUR, birth: FOUR_BIRTH, reading: syntheticReading(FOUR), inspect: true });
  assert.ok(r.runs.some((x) => x.page === 1 && x.text.includes("6:18 PM")), "the birth line is not on page 1");
  const maps = toUnicodeMaps(r.bytes);
  assert.ok(maps.length >= 2, "no ToUnicode maps found");
  // pdfkit writes each font's glyphs in order as one range: [<.notdef> <first glyph's text> ...].
  const reads = maps.flatMap((m) => [...m.matchAll(/\[([^\]]*)\]/g)].flatMap((a) => [...a[1].matchAll(/<([0-9a-fA-F ]*)>/g)].map((e) => e[1].toLowerCase()).slice(1)));
  assert.ok(reads.length > 50, `only ${reads.length} glyphs mapped`);
  assert.ok(reads.includes("003a"), "no glyph reads back as ':'");
  for (const bad of ["", "0000", "fffe"]) assert.ok(!reads.includes(bad), `a glyph drawn in the PDF reads back as <${bad}>`);
});
