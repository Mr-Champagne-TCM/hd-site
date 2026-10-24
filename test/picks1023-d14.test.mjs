import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

/**
 * DECISION 14 (GO v3; Jeremy 10/23: "options", not "choices"): on the someone-new page the
 * way back goes to the choices, so it says "← Back to your options", and its
 * hover/label says the same ("Opens your options for … chart"). Before the
 * buyer's own details are in (pending), it still goes to the chart's own
 * page and says "Back to … chart".
 */
const app = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");

test("decision 14: 'Back to your options', with a hover to match", () => {
  assert.ok(app.includes('const backLabel = data!.pending ? `Back to ${whoseOf(whose)} chart` : "Back to your options";'));
  assert.match(app, /data!\.pending \? ownPageHint\(whoseOf\(whose\), "chart"\) : `Opens your options for \$\{whoseOf\(whose\)\} chart`/);
  assert.match(app, />\s*← \{backLabel\}\s*<\/a>/);
  assert.ok(!app.includes("← Back to {whoseOf(whose)} chart"), "the old fixed words are gone");
});
