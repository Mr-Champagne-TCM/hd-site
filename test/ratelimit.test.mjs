import { test } from "node:test";
import assert from "node:assert/strict";
import { check, record, prune, LIMITS, HOUR, DAY, WEEK } from "../netlify/lib/ratelimit.mjs";

const T0 = Date.parse("2026-08-26T12:00:00Z");

/** Fills a list with n hits spread evenly back from `now` across `span`. */
function spread(n, now, span) {
  return Array.from({ length: n }, (_, i) => now - Math.floor((i * span) / n) - 1);
}

test("the 21st request in an hour is refused — T-10", () => {
  let hits = [];
  for (let i = 0; i < 20; i++) {
    assert.equal(check(hits, T0).allowed, true, `call ${i + 1} should pass`);
    hits = record(hits, T0);
  }
  const verdict = check(hits, T0);
  assert.equal(verdict.allowed, false);
  assert.equal(verdict.limit.name, "hour");
});

test("the refusal is a sentence, not a code", () => {
  const hits = spread(20, T0, HOUR / 2);
  const { message } = check(hits, T0);
  assert.match(message, /nothing was charged/i);
  assert.match(message, /go through in about/i);
  assert.doesNotMatch(message, /429|rate.?limit|error/i);
});

test("an hour later, the hourly window has moved on", () => {
  const hits = spread(20, T0, HOUR - 60_000);
  assert.equal(check(hits, T0).allowed, false);
  assert.equal(check(hits, T0 + HOUR).allowed, true);
});

test("the daily cap holds when the hourly one keeps clearing", () => {
  // 100 hits spread across 23 hours: never 20 in any one hour, but 100 in a day.
  const hits = spread(100, T0, 23 * HOUR);
  const verdict = check(hits, T0);
  assert.equal(verdict.allowed, false);
  assert.equal(verdict.limit.name, "day");
});

/**
 * The reason the weekly cap exists at all. Without it, someone pacing
 * themselves under the daily limit takes 700 charts a week, and under the
 * hourly limit alone, 3,360.
 */
test("the weekly cap stops two heavy days becoming seven", () => {
  const hits = spread(210, T0, 6 * DAY);
  const verdict = check(hits, T0);
  assert.equal(verdict.allowed, false);
  assert.equal(verdict.limit.name, "week");
});

test("209 in a week still goes through", () => {
  const hits = spread(209, T0, 6 * DAY);
  assert.equal(check(hits, T0).allowed, true);
});

test("the message names the window actually hit, not the smallest", () => {
  const hits = spread(210, T0, 6 * DAY);
  assert.match(check(hits, T0).message, /in a week/);
});

test("retryAfter points at when a slot really frees", () => {
  const hits = spread(20, T0, HOUR - 60_000);
  const { retryAfter } = check(hits, T0);
  assert.ok(retryAfter > 0, "should be in the future");
  assert.ok(retryAfter <= 3600, `should be within the hour, got ${retryAfter}`);
  // And at that moment, it genuinely passes.
  assert.equal(check(hits, T0 + retryAfter * 1000).allowed, true);
});

test("nothing is remembered past a week", () => {
  const old = [T0 - WEEK - 1, T0 - WEEK - 60_000];
  assert.deepEqual(prune(old, T0), []);
  assert.equal(record([], T0).length, 1);
});

test("record never mutates what it was given", () => {
  const hits = [T0 - 1000];
  const next = record(hits, T0);
  assert.equal(hits.length, 1, "the original list should be untouched");
  assert.equal(next.length, 2);
});

test("the limits are the ones agreed, not whatever crept in", () => {
  assert.deepEqual(
    LIMITS.map((l) => [l.name, l.max]),
    [["hour", 20], ["day", 100], ["week", 210]],
  );
});
