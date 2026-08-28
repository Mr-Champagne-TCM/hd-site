import { test } from "node:test";
import assert from "node:assert/strict";
import { importTs } from "./support/ts.mjs";

/**
 * The birth-date rules, tested against the same cases the app's own
 * BirthDateTest covers, so the two cannot quietly disagree.
 *
 * The TypeScript is transpiled on the fly with esbuild rather than tested
 * through the browser bundle: these are pure functions and the point is the
 * arithmetic, not the rendering. The RENDERING is checked by looking at it, in
 * a real browser at a real size, with the keyboard up — because every fault
 * that has ever mattered in these two controls lived in the gap between the
 * logic and the screen, and no unit test caught a single one of them.
 */

const { clampDay, splitDate, typedDate, daysInMonth, toIso, humanDate, MONTHS } = await importTs("src", "entry", "birthDate.ts");

// --- the clamp -------------------------------------------------------------

test("31 January becomes 28 February, not 3 March", () => {
  assert.equal(clampDay(1983, 2, 31), 28);
});

test("leap years are not optional — 29 February 1992 is somebody's birthday", () => {
  assert.equal(clampDay(1992, 2, 29), 29);
  assert.equal(daysInMonth(1992, 2), 29);
  assert.equal(daysInMonth(1993, 2), 28);
});

test("the century rule is right too", () => {
  assert.equal(daysInMonth(1900, 2), 28, "1900 was not a leap year");
  assert.equal(daysInMonth(2000, 2), 29, "2000 was");
});

test("months with thirty days clamp to thirty", () => {
  [4, 6, 9, 11].forEach((m) => assert.equal(clampDay(1983, m, 31), 30, `month ${m}`));
});

test("a day below one is lifted to one", () => {
  assert.equal(clampDay(1983, 5, 0), 1);
});

// --- parsing back ----------------------------------------------------------

test("an ISO date splits, with the day clamped on the way", () => {
  assert.deepEqual(splitDate("1983-09-17", 1990), [1983, 9, 17]);
  assert.deepEqual(splitDate("1983-02-31", 1990), [1983, 2, 28]);
});

test("an empty or broken value falls back to a plausible adult birth year", () => {
  assert.deepEqual(splitDate("", 1991), [1991, 1, 1]);
  assert.deepEqual(splitDate("not a date", 1991), [1991, 1, 1]);
});

// --- typing ----------------------------------------------------------------

test("MMDDYYYY typed straight through is accepted", () => {
  assert.equal(typedDate("09171983"), "1983-09-17");
});

test("punctuation is ignored", () => {
  assert.equal(typedDate("09/17/1983"), "1983-09-17");
  assert.equal(typedDate("09-17-1983"), "1983-09-17");
});

test("nothing commits while it is still being typed", () => {
  ["", "0", "09", "0917", "0917198"].forEach((partial) =>
    assert.equal(typedDate(partial), null, `"${partial}" should not commit`),
  );
});

/**
 * The fault this exists to prevent: most date libraries roll 31 February
 * forward to 3 March rather than rejecting it. That is a real date for the
 * wrong moment, which is worse than an error.
 */
test("an impossible date is refused, never rolled forward", () => {
  assert.equal(typedDate("02311983"), null, "31 February must not become 3 March");
  assert.equal(typedDate("13011983"), null, "there is no month 13");
  assert.equal(typedDate("00011983"), null, "there is no month 0");
  assert.equal(typedDate("02301992"), null, "30 February in a leap year is still not a date");
});

test("29 February typed in a leap year is accepted", () => {
  assert.equal(typedDate("02291992"), "1992-02-29");
  assert.equal(typedDate("02291993"), null, "1993 was not a leap year");
});

test("years outside a human lifetime are refused", () => {
  assert.equal(typedDate("09171899"), null);
  assert.equal(typedDate("09172101"), null);
});

// --- display ---------------------------------------------------------------

test("months are named, never numbered", () => {
  assert.equal(MONTHS[0], "January");
  assert.equal(MONTHS[5], "June");
  assert.equal(humanDate("1983-09-17"), "17 September 1983");
  // The whole point: the ambiguity that 06/07 creates cannot arise here.
  assert.match(humanDate("1983-06-07"), /June/);
});

test("round-tripping through toIso is stable and clamps", () => {
  assert.equal(toIso(1983, 9, 17), "1983-09-17");
  assert.equal(toIso(1983, 2, 31), "1983-02-28");
  assert.equal(toIso(1992, 2, 29), "1992-02-29");
});
