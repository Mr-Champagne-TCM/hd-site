import { test } from "node:test";
import assert from "node:assert/strict";
import { correctionNote, detailSentences } from "../shared/correctionNote.mjs";
import { birthLine } from "../shared/birthLine.mjs";

/**
 * BATCH-1024 (10/24): the correction note's "Birth place changed from X to Y"
 * printed the places as kept, so "Coeur d'Alene" showed a straight
 * apostrophe beside the curled birth line (decision 8, shared/birthLine.mjs).
 * The places are curled where the sentence is built, for display only; the
 * kept places are untouched. The phone has no correction note (it never
 * corrects a kept chart), so there is no phone side.
 */

const correction = () => ({
  type: "correction",
  changed: ["place"],
  was: { place: "Coeur d'Alene, Idaho" },
  now: { place: "Land O'Lakes, Florida" },
  chart: [],
});

test("the correction note curls both places, as the birth line does", () => {
  const c = correction();
  const n = correctionNote(c);
  assert.match(n.lead, /^Birth place changed from Coeur d’Alene, Idaho to Land O’Lakes, Florida — /);
  assert.ok(!n.lead.includes("'"), n.lead);
  // The same curl as the birth line gives the place.
  const line = birthLine({ date: "1990-01-02", time: "08:15", timeKnown: true, place: c.was.place, zone: "America/Los_Angeles" });
  assert.ok(line.endsWith(" · Coeur d’Alene, Idaho"), line);
  assert.ok(n.lead.includes(line.split(" · ").pop()));
  // Display only: the record's correction keeps the places as typed.
  assert.equal(c.was.place, "Coeur d'Alene, Idaho");
  assert.equal(c.now.place, "Land O'Lakes, Florida");
});

test("a place with no apostrophe, or none at all, reads as before", () => {
  assert.deepEqual(detailSentences({ changed: ["place"], was: { place: "Denver, Colorado" }, now: { place: "Boulder, Colorado" } }), [
    "Birth place changed from Denver, Colorado to Boulder, Colorado",
  ]);
  assert.deepEqual(detailSentences({ changed: ["place"], was: {}, now: {} }), ["Birth place changed from the one before to the new one"]);
});

test("the fix-list entry claims the curled lead and only that", async () => {
  const { readFileSync } = await import("node:fs");
  const list = JSON.parse(readFileSync(new URL("../tools/e2e/fixlist.json", import.meta.url), "utf8"));
  const e = list.fixes.find((x) => x.id === "BATCH1024-7-correction-place");
  assert.ok(e, "no fix-list entry");
  const now = correctionNote(correction()).lead;
  const was = now.replaceAll("’", "'");
  assert.ok(e.plus.some((p) => new RegExp(p).test(now)), now);
  assert.ok(e.minus.some((p) => new RegExp(p).test(was)), was);
  assert.ok(!e.plus.some((p) => new RegExp(p).test(was)));
  // Behind another change's sentence too ("Birth date changed ... . Birth place changed ...").
  const both = correctionNote({ ...correction(), changed: ["date", "place"], was: { ...correction().was, date: "1990-01-02" }, now: { ...correction().now, date: "1990-01-03" } }).lead;
  assert.ok(e.plus.some((p) => new RegExp(p).test(both)), both);
});
