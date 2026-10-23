import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { COACH, techTitle } from "../shared/readingCopy.mjs";
import { CHECKOUT_NEXT_STEP, CHECKOUT_NEXT_STEP_THEIR } from "../shared/pricing.mjs";
import { deliveryEmail } from "../netlify/lib/deliveryEmail.mjs";
import { SITE } from "../netlify/lib/siteLinks.mjs";

/**
 * DECISIONS 19 + 25 (GO v3, my pick "spell out", pending Jeremy; 10/23 read
 * F1): numbers in words in customer copy, as the rest of it says them --
 * "twenty-six", "six days", "two minutes", "thirty-minute". Data (gates,
 * degrees, dates, prices, times) stays in figures.
 */
const src = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

test("decision 25: the planet numbers' title and the coaching link in words (= the phone's ReadingCopy.kt)", () => {
  assert.equal(techTitle(), "Technical values: your twenty-six planet numbers");
  assert.equal(techTitle(26), "Technical values: your twenty-six planet numbers");
  assert.equal(COACH.link, "A free thirty-minute conversation");
  assert.match(COACH.body, /thirty minutes/);
});

test("decision 25: the emails say six days, and the receipt two minutes", () => {
  const ready = deliveryEmail({ tier: 1, name: "Robin", url: "https://x.test/r/a.b", links: SITE });
  assert.ok(ready.text.includes("This link works for six days;"));
  const receipt = deliveryEmail({ tier: 1, name: "Robin", url: "https://x.test/r/a.b", links: SITE, pending: true });
  assert.match(receipt.text, /Next, about two minutes|NEXT, ABOUT TWO MINUTES/);
  assert.ok(src("netlify/lib/myChartsEmail.mjs").includes("Each link is new and works for six days."));
  assert.equal(CHECKOUT_NEXT_STEP, "Next: your birth date, time and place (about two minutes).");
  assert.equal(CHECKOUT_NEXT_STEP_THEIR, "Next: their birth date, time and place (about two minutes).");
});

test("decision 25: no '6 days', '2 minutes', '26 planet' or '30-minute' left in the words a buyer reads", () => {
  for (const f of ["shared/readingCopy.mjs", "shared/pricing.mjs", "netlify/lib/deliveryEmail.mjs", "netlify/lib/myChartsEmail.mjs", "shared/customerMessages.mjs", "src/copy.ts"]) {
    assert.doesNotMatch(src(f).replace(/^\s*(\*|\/\/).*$/gm, ""), /\b6 days\b|\b2 minutes\b|\b26 planet\b|\b30-minute\b/, f);
  }
});
