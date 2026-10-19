import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { importTs } from "./support/ts.mjs";
import { birthLine } from "../shared/birthLine.mjs";

/**
 * Jeremy 10/16: "no unreadable birth data... That is machine only. these are
 * ppl". Every date a buyer reads is in the PDF's words and order:
 * "July 22, 1991 · 5:40 PM · Denver, Colorado · Timezone: UTC-06:00".
 */

const { EXAMPLE } = await importTs("src", "copy.ts");
const { humanDate } = await importTs("src", "entry", "birthDate.ts");

const DAY_FIRST = /\b\d{1,2} (January|February|March|April|May|June|July|August|September|October|November|December) \d{4}\b/;

test("the line under the name after the chart is the PDF's birth line", () => {
  // What EntryForm hands birthLine on the "done" screen, for Claude Test Five.
  const line = birthLine({ date: "1991-07-22", time: "17:40", timeKnown: true, place: "Denver, Colorado", zone: "America/Denver" });
  // No "Timezone: UTC-06:00" since fix 20A (10/19): jargon on the first line.
  assert.equal(line, "July 22, 1991 · 5:40 PM · Denver, Colorado");
  const unknown = birthLine({ date: "1991-07-22", time: null, timeKnown: false, place: "Denver, Colorado", zone: "America/Denver" });
  assert.equal(unknown, "July 22, 1991 · Time unknown (charted at noon) · Denver, Colorado");
});

test("the done screen prints the shared birth line, not its own sentence", () => {
  const src = readFileSync(new URL("../src/entry/EntryForm.tsx", import.meta.url), "utf8");
  assert.match(src, /import \{ birthLine \} from "..\/..\/shared\/birthLine.mjs"/);
  assert.match(src, /const born =\s+birthLine\(\{/);
});

test("dates read month first, as on the PDF", () => {
  assert.equal(humanDate("1991-07-22"), "July 22, 1991");
  assert.doesNotMatch(EXAMPLE.caption, DAY_FIRST);
  assert.match(EXAMPLE.caption, /September 17, 1983/);
});
