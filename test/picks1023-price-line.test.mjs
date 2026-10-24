import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

/**
 * PRICE LINE (Jeremy on GO v3, 10/23): the offer page's line under the
 * invitation, "The price is here before anything is asked of you.", is gone,
 * and the space it left is taken up: no empty paragraph, and the "Three ways
 * in" label sits closer to the invitation (mt-6, was mt-10 under the line).
 */
const read = (p) => readFileSync(new URL(`../src/${p}`, import.meta.url), "utf8");

test("price line: the words are gone from the copy and the page", () => {
  const copy = read("copy.ts");
  const app = read("App.tsx");
  assert.ok(!/body:\s*"The price is here/.test(copy), "TIERS_INTRO has no body line");
  assert.ok(!app.includes("TIERS_INTRO.body"), "nothing renders TIERS_INTRO.body");
  assert.ok(!/<p[^>]*>\s*<\/p>/.test(app), "no empty paragraph left behind");
});

test("price line: the invitation runs straight into the label, a little closer", () => {
  const app = read("App.tsx");
  assert.match(app, /\{TIERS_INTRO\.lead\}\s*<\/h2>\s*\)\}/, "the heading stands alone, no fragment around it");
  assert.ok(app.includes('<p className={(fresh ? "" : "mt-6 ") + "font-sans'), "the label's gap is mt-6");
  assert.ok(!app.includes('(fresh ? "" : "mt-10 ")'), "the old mt-10 gap is gone");
});
