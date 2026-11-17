import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";

/**
 * THE EXAMPLE'S DRAWING (Jeremy 11/16, call 1: "1"). The offer page's example shows the chart drawn,
 * loaded in the visitor's browser from the main site, which already publishes it. The drawing itself
 * stays out of this public repository (leak-scan rule rendered-chart), and the link to the readings
 * page is what stands there until it arrives, and if it never does.
 */
const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

test("THE EXAMPLE ASKS THE MAIN SITE FOR THE DRAWING, and keeps the link as its fallback", () => {
  const app = read("src/App.tsx");
  assert.match(app, /<ExampleDrawing\b[\s\S]{0,400}fallback=\{[\s\S]{0,700}\{EXAMPLE\.drawing\}/);
  assert.match(app, /the three lines, the drawing and every value\./);

  const drawing = read("src/ExampleDrawing.tsx");
  assert.match(drawing, /EXAMPLE_DRAWING_URL = "https:\/\/thechampagnemethod\.co\/samples\/bodygraph\.svg"/);
  // Through the same gate as a buyer's own drawing, and no cookie or referrer goes with the request.
  assert.match(drawing, /checkBodygraph\(t\)\.ok/);
  assert.match(drawing, /credentials: "omit"/);
  assert.match(drawing, /referrerPolicy: "no-referrer"/);
  // Only when the example is near the screen.
  assert.match(drawing, /IntersectionObserver/);
});

test("NO DRAWING IS COMMITTED HERE: public/ carries no svg of a chart", () => {
  const dir = new URL("../public/samples/", import.meta.url);
  const files = existsSync(dir) ? readdirSync(dir) : [];
  assert.deepEqual(files.filter((f) => /\.svg$/i.test(f)), []);
});
