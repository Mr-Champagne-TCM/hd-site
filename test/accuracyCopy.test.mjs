import { test } from "node:test";
import assert from "node:assert/strict";
import { importTs } from "./support/ts.mjs";

const { CREDIBILITY } = await importTs("src", "copy.ts");

/**
 * "Measured against the sky" quotes measured numbers. Each one here is pinned to
 * hd-reading-app validation/RESULTS.md, "2026-10-16 (evening) -- the shop's
 * 'Measured against the sky' numbers, re-measured for engine 0.5.0". Change a
 * number on the page only together with a new measurement in that file.
 */
const figures = () => CREDIBILITY.checks.map((c) => c[0]);
const all = () => [CREDIBILITY.body, ...CREDIBILITY.checks.flat(), CREDIBILITY.closing].join(" ");

test("the four figures are the 0.5.0 measurements", () => {
  assert.deepEqual(figures(), ["0.58″", "2.6 million", "15 of 15", "18×"]);
});

test("the Sun figure names the sample it came from", () => {
  const sun = CREDIBILITY.checks[0][1];
  assert.match(sun, /1,000 charts born between 1900 and 2030/);
  assert.match(sun, /about fourteen seconds of birth time/);
});

test("retired claims stay retired", () => {
  // 0.46″ came from 9 charts, never 24; Neptune has not been 12″ out since 0.4.0
  // (10/7); 20× rounded 19.3× up. "none of them decides a line" was refuted 8/27.
  for (const gone of [/24 charts/, /Neptune by about 12/, /20×/, /0\.46/, /none of them decides a line/,
    /within half an arcsecond/]) {
    assert.ok(!gone.test(all()), `retired claim is back: ${gone}`);
  }
});

test("the 18× says it compares the profile, not every line", () => {
  assert.match(CREDIBILITY.checks[3][1], /profile/);
});

test("the corrected bodies are named, and only those", () => {
  const sun = CREDIBILITY.checks[0][1];
  assert.match(sun, /Jupiter, Saturn, Uranus, Neptune and Pluto are now corrected/);
  assert.match(sun, /The Moon, Mercury, Venus and Mars sit further out/);
  assert.ok(!/Sun[^.]*corrected/.test(sun), "the Sun is not corrected");
});
