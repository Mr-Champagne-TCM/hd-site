import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { readingPdf } from "../netlify/lib/readingPdf.mjs";
import { syntheticReading } from "./support/syntheticReading.mjs";

/**
 * BATCH1024-8, "LET PAGE 2 HOLD THE TABLE" (Jeremy, option 1, 10/24).
 *
 * The 10/24 rig (addUp-2-upgrade-t2): a reading with an unknown birth time
 * (PROVISIONAL tags and the Moon note), six channels and two-line glance rows
 * filled page 2 to about two lines from its foot. The technical values'
 * heading did not fit, so the planet numbers and the onward note went over to
 * a page 3 of their own -- 12% filled -- and the reading began on page 4.
 *
 * The chart is that run's (a made-up rig client, Duluth, 8 Jul 1975, time
 * unknown; drawing left out). The placeholder reading's glance rows have the
 * rig's shape: five of the six take two lines in the box, Authority one.
 */
const OUTPUT = JSON.parse(readFileSync(new URL("./fixtures/uma-unknown-time.output.json", import.meta.url), "utf8"));
const BIRTH = { date: "1975-07-08", time: null, timeKnown: false, place: "Duluth, Minnesota", zone: "America/Chicago" };
const READING = syntheticReading(OUTPUT);
const pdf = (over = {}) => readingPdf({ tier: 2, name: "Page Fill Test", output: OUTPUT, birth: BIRTH, reading: READING, inspect: true, ...over });

const FOOTER_Y = 792 - 54 + 14;
const BOTTOM = 792 - 54 - 26;
const TOP = 54 + 31;
const VALUE_X = 54 + 122;
/** The rig's case keeps half its white space (10/25: still exactly what NOTE_MOST gave it; the floor is FIT_FLOOR now). */
const HALF = 0.5;
const page = (r, n) => r.runs.filter((x) => x.page === n);
const body = (r, n) => page(r, n).filter((x) => x.y > 70 && x.y < FOOTER_Y - 1);
const find = (r, re) => r.runs.find((x) => re.test(x.text));
const step = (r) => {
  const y = (t) => page(r, 2).find((x) => x.text === t).y;
  return y("INCARNATION CROSS") - y("DEFINITION");
};

test("BATCH1024-8 the case is the rig's: unknown time, six channels, two-line glance rows", async () => {
  const r = await pdf();
  assert.equal(OUTPUT.timeKnown, false);
  assert.equal(OUTPUT.channels.length, 6);
  const p2 = page(r, 2);
  assert.ok(p2.filter((x) => x.text === "PROVISIONAL").length >= 6, "the tags are on page 2");
  assert.ok(p2.some((x) => /^The Moon moves to a new gate/.test(x.text)), "the Moon note is on page 2");
  // The value column of the box: eleven lines -- five rows of two, Authority one.
  const top = p2.find((x) => x.text === "TYPE").y;
  const end = p2.find((x) => x.text === "YOUR CHART VALUES").y;
  const valueLines = p2.filter((x) => x.x === VALUE_X && x.y >= top - 1 && x.y < end);
  assert.equal(valueLines.length, 11, valueLines.map((x) => x.text).join(" | "));
});

test("BATCH1024-8 PAGE 2 HOLDS THE TABLE: the technical values and the onward note stay on page 2, never a near-empty page 3", async () => {
  const r = await pdf();
  const head = find(r, /^TECHNICAL VALUES/);
  const note = find(r, /^Every word (above|on page 2)/);
  assert.equal(head.page, 2, "the technical values went over to a page of their own");
  assert.equal(note.page, 2, "the onward note left page 2");
  assert.match(note.text, /^Every word above/, "on page 2 the note says 'above'");
  assert.ok(page(r, 2).some((x) => x.text === "PERSONALITY") && page(r, 2).some((x) => x.text === "DESIGN"), "both rows of planet numbers on page 2");
  // Page 3 is the reading's first page, and well filled -- not the table on its own.
  assert.ok(!page(r, 3).some((x) => /^TECHNICAL VALUES|^Every word/.test(x.text)));
  const p3 = body(r, 3);
  const fill = (Math.max(...p3.map((x) => x.y)) - TOP) / (BOTTOM - TOP);
  assert.ok(fill > 0.5, `page 3 runs only ${Math.round(fill * 100)}% down its page`);
  assert.equal(r.pages, 7, "one page fewer than before (8)");
});

test("BATCH1024-8 nothing on page 2 is clipped or reaches the footer; only white space gave way, at most half", async () => {
  const r = await pdf();
  const p2 = body(r, 2);
  const lowest = Math.max(...p2.map((x) => x.y));
  assert.ok(lowest <= BOTTOM, `page 2 runs to ${lowest}, past its foot ${BOTTOM}`);
  // The onward note's link boxes sit above the footer line.
  const noteLinks = r.links.filter((l) => l.page === 2 && l.top > 600 && l.top < FOOTER_Y - 12);
  assert.ok(noteLinks.length >= 2);
  for (const l of noteLinks) assert.ok(l.bottom < FOOTER_Y - 8, `a link box reaches the footer: ${JSON.stringify(l)}`);
  // Text leading untouched: a two-line glance value's lines step as ever (17pt).
  const typeVal = p2.filter((x) => x.x === VALUE_X).slice(0, 2);
  assert.equal(Math.round(typeVal[1].y - typeVal[0].y), 17);
  // A value row is 12pt of text and 9pt of white space; the white space gave way, never below half.
  assert.ok(step(r) < 21, "page 2 was not tightened");
  assert.ok(step(r) >= 12 + 9 * HALF - 0.01, `white space gave more than half (${step(r)})`);
});

test("BATCH1024-8 where page 2 has the room, nothing is squeezed (the same chart, time known, one-line rows)", async () => {
  const known = { ...OUTPUT, timeKnown: true };
  for (const k of ["timeSpread", "provisional", "note", "chartedAt"]) delete known[k];
  const short = READING.replace(/^(Type|Strategy|Authority|Profile|Signature|Not-self): .*$/gm, "$1: A short sentence.");
  const r = await pdf({ output: known, birth: { ...BIRTH, time: "11:45", timeKnown: true }, reading: short });
  const top = page(r, 2).find((x) => x.text === "TYPE").y;
  const end = page(r, 2).find((x) => x.text === "YOUR CHART VALUES").y;
  assert.equal(page(r, 2).filter((x) => x.x === VALUE_X && x.y >= top - 1 && x.y < end).length, 6, "one line a row");
  assert.equal(find(r, /^TECHNICAL VALUES/).page, 2);
  assert.equal(step(r), 21);
});

test("BATCH1024-8 all six rows on two lines (17pt more than the rig): page 2 holds it now, the note with its block (10/25)", async () => {
  // Before 10/25 this went over whole -- more than half page 2's white space could give. Page 2 now gives
  // the measured share, down to FIT_FLOOR (test/pdf1025.test.mjs), so the block and its note stay on page 2.
  const long = READING.replace(/^Authority: .*$/m, "Authority: The authority sentence of this placeholder reading, long enough that it runs on to a second line.");
  const r = await pdf({ reading: long });
  const head = find(r, /^TECHNICAL VALUES/);
  const note = find(r, /^Every word (above|on page 2)/);
  assert.equal(note.page, head.page, "the note left its block");
  assert.equal(head.page, 2, "the planet numbers went over to a page of their own");
  assert.match(note.text, /^Every word above/);
});
