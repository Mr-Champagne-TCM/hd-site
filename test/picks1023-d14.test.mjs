import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

/**
 * DECISION 14 (GO v3, my pick, pending Jeremy): on the someone-new page the
 * way back goes to the choices, so it says "← Back to your choices", and its
 * hover/label says the same ("Opens your choices for … chart"). Before the
 * buyer's own details are in (pending), it still goes to the chart's own
 * page and says "Back to … chart".
 */
const app = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");

test("decision 14: 'Back to your choices', with a hover to match", () => {
  assert.ok(app.includes('const backLabel = data!.pending ? `Back to ${whoseOf(whose)} chart` : "Back to your choices";'));
  assert.match(app, /data!\.pending \? ownPageHint\(whoseOf\(whose\), "chart"\) : `Opens your choices for \$\{whoseOf\(whose\)\} chart`/);
  assert.match(app, />\s*← \{backLabel\}\s*<\/a>/);
  assert.ok(!app.includes("← Back to {whoseOf(whose)} chart"), "the old fixed words are gone");
});
