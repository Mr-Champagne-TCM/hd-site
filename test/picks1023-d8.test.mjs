import { test } from "node:test";
import assert from "node:assert/strict";
import { birthLine } from "../shared/birthLine.mjs";
import { datePlaceLine } from "../netlify/lib/addTime.mjs";

/**
 * DECISION 8 (GO v3, my pick, pending Jeremy): a place name with an
 * apostrophe ("Coeur d'Alene, Idaho", as the town search gives it) is curled
 * where the birth line is shown -- the PDF, the pages, the add-time kept
 * line -- like every other word a reader sees. The kept place is not touched.
 */
const birth = { date: "1988-05-03", time: "07:15", timeKnown: true, place: "Coeur d'Alene, Idaho", zone: "America/Los_Angeles" };

test("decision 8: the birth line curls the place's apostrophe", () => {
  assert.equal(birthLine(birth), "May 3, 1988 · 7:15 AM · Coeur d’Alene, Idaho");
  assert.equal(datePlaceLine(birth), "May 3, 1988 · Coeur d’Alene, Idaho");
  assert.equal(birth.place, "Coeur d'Alene, Idaho", "the kept place stays as the town search gave it");
});

test("decision 8: a place with no apostrophe is untouched", () => {
  assert.equal(birthLine({ ...birth, place: "Chicago, Illinois", zone: "America/Chicago" }), "May 3, 1988 · 7:15 AM · Chicago, Illinois");
});
