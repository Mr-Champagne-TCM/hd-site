import { test } from "node:test";
import assert from "node:assert/strict";
import { importTs } from "./support/ts.mjs";

const { formatTimeInput, toTwentyFourHour, timeProblem, displayTime } = await importTs("src", "entry", "time.ts");

/**
 * The colon is never typed.
 *
 * The fault: inputMode="numeric" gives a number pad with no colon on it, while
 * the validation demanded HH:MM. Four digits in, there was no way forward.
 */
test("the colon appears on its own after two digits", () => {
  assert.equal(formatTimeInput("0"), "0");
  assert.equal(formatTimeInput("03"), "03");
  assert.equal(formatTimeInput("031"), "03:1");
  assert.equal(formatTimeInput("0317"), "03:17");
});

test("a colon someone does manage to type is not doubled", () => {
  assert.equal(formatTimeInput("03:17"), "03:17");
});

test("more than four digits is ignored rather than accepted", () => {
  assert.equal(formatTimeInput("031745"), "03:17");
});

// --- 12-hour, and the two that catch people out ---------------------------

test("midnight is 12 AM and becomes 00", () => {
  assert.equal(toTwentyFourHour("1200", 12, "AM"), "00:00");
  assert.equal(toTwentyFourHour("1230", 12, "AM"), "00:30");
});

test("noon is 12 PM and stays 12", () => {
  assert.equal(toTwentyFourHour("1200", 12, "PM"), "12:00");
  assert.equal(toTwentyFourHour("1245", 12, "PM"), "12:45");
});

test("ordinary 12-hour times convert", () => {
  assert.equal(toTwentyFourHour("0317", 12, "AM"), "03:17");
  assert.equal(toTwentyFourHour("0317", 12, "PM"), "15:17");
  assert.equal(toTwentyFourHour("1105", 12, "PM"), "23:05");
});

test("a 12-hour clock has no hour 0 or 13", () => {
  assert.equal(toTwentyFourHour("0017", 12, "AM"), null);
  assert.equal(toTwentyFourHour("1317", 12, "PM"), null);
});

// --- 24-hour ---------------------------------------------------------------

test("24-hour times pass through", () => {
  assert.equal(toTwentyFourHour("0317", 24, "AM"), "03:17");
  assert.equal(toTwentyFourHour("1430", 24, "AM"), "14:30");
  assert.equal(toTwentyFourHour("0000", 24, "AM"), "00:00");
  assert.equal(toTwentyFourHour("2359", 24, "AM"), "23:59");
});

test("24 o'clock does not exist", () => {
  assert.equal(toTwentyFourHour("2400", 24, "AM"), null);
});

test("sixty minutes does not exist on either clock", () => {
  assert.equal(toTwentyFourHour("0360", 24, "AM"), null);
  assert.equal(toTwentyFourHour("0360", 12, "AM"), null);
});

test("nothing converts while it is still being typed", () => {
  ["", "0", "03", "031"].forEach((p) =>
    assert.equal(toTwentyFourHour(p, 24, "AM"), null, `"${p}"`),
  );
});

// --- what it says when it is wrong ----------------------------------------

test("a half-typed time is not called a mistake", () => {
  ["", "0", "03", "031"].forEach((p) => assert.equal(timeProblem(p, 24), null, `"${p}"`));
});

test("a real mistake is named in words", () => {
  assert.match(timeProblem("0360", 24), /sixty minutes/);
  assert.match(timeProblem("2500", 24), /00 to 23/);
  assert.match(timeProblem("1500", 12), /1 to 12/);
  assert.equal(timeProblem("1430", 24), null);
});

// --- reading it back -------------------------------------------------------

test("a stored 24-hour time reads back on whichever clock is in use", () => {
  assert.equal(displayTime("14:30", 24), "14:30");
  assert.equal(displayTime("14:30", 12), "2:30 PM");
  assert.equal(displayTime("00:15", 12), "12:15 AM");
  assert.equal(displayTime("12:15", 12), "12:15 PM");
});
