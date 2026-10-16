import { test } from "node:test";
import assert from "node:assert/strict";
import { importTs } from "./support/ts.mjs";

const { CREDIBILITY } = await importTs("src", "copy.ts");

/**
 * "Measured against the sky" quotes measured numbers. Each one here is pinned to
 * hd-reading-app validation/RESULTS.md, "2026-10-16 (evening) -- the shop's
 * 'Measured against the sky' numbers, re-measured for engine 0.5.0". Change a
 * number on the page only together with a new measurement in that file.
 *
 * v3 (10/16): rewritten for a reader with no astronomy. The page speaks in
 * seconds of birth time and charts per thousand, never in arcseconds.
 */
const figures = () => CREDIBILITY.checks.map((c) => c[0]);
const card = (i) => CREDIBILITY.checks[i][1];
const all = () => [CREDIBILITY.title, CREDIBILITY.body, ...CREDIBILITY.checks.flat(), CREDIBILITY.closing].join(" ");

test("same shape as before: title, body, four cards, closing", () => {
  assert.equal(CREDIBILITY.title, "Measured against the sky");
  assert.equal(CREDIBILITY.checks.length, 4);
  for (const [figure, text] of CREDIBILITY.checks) {
    assert.ok(figure.length > 0 && text.length > 0);
  }
  assert.ok(CREDIBILITY.closing.length > 0);
});

test("the four figures are the 0.5.0 measurements, in units a buyer has", () => {
  assert.deepEqual(figures(), ["14 seconds", "2.6 million", "15 of 15", "1 in 3,000"]);
});

test("no astronomy units on the page", () => {
  assert.ok(!/″|arcsec|root mean square|ephemer/i.test(all()));
});

test("card 1: the Sun in birth time, on the 1,000-chart sample, against the clock's own rounding", () => {
  assert.match(card(0), /1,000 test charts/);
  assert.match(card(0), /counted in birth time/);
  assert.match(card(0), /up to 30 seconds out/);
  assert.match(card(0), /The Sun sets your profile/);
});

test("card 2: the slow planets are said to be PLACED more precisely, not FOLLOWED (birth-time) more closely", () => {
  // Jupiter-Pluto are 0.08-0.10″ against the Sun's 0.58″ in position, but in
  // birth-time seconds they are 22 s to 8 min. Card 1 defines "follows" in
  // birth time, so card 2 must not reuse it.
  assert.match(card(1), /Jupiter to Pluto, are now corrected against NASA's record, and this engine places them even more precisely than it places the Sun/);
  assert.ok(!/follows them/.test(card(1)));
  assert.ok(!/record too/.test(card(1)), "\"too\" would imply the Sun is corrected");
});

test("card 3 does not call the disagreeing pair well-known", () => {
  assert.ok(!/well-known/.test(card(2)));
  assert.match(card(2), /two independent ones agreed with this engine on every one/);
});

test("card 4: profile residual vs NASA, and the rules split is not attributed to 'other calculators'", () => {
  assert.match(card(3), /only when the Sun sits right on the border between two profiles/);
  assert.match(card(3), /disagree over the rules themselves on about 6 charts in every 1,000/);
  assert.ok(!/Other calculators disagree with each other/.test(card(3)));
});

test("body and closing say only what was measured", () => {
  assert.match(CREDIBILITY.body, /around the time you were born/); // design half is ~88 days earlier
  assert.match(CREDIBILITY.closing, /the very same planet data/); // Moshier mode, not raw NASA files
  assert.match(CREDIBILITY.closing, /As far as I can find/); // the hedge stays
});

test("retired claims stay retired", () => {
  for (const gone of [/24 charts/, /Neptune by about 12/, /20×/, /18×/, /0\.46/, /0\.58/,
    /none of them decides a line/, /within half an arcsecond/, /closer to it than the Sun/]) {
    assert.ok(!gone.test(all()), `retired claim is back: ${gone}`);
  }
});
