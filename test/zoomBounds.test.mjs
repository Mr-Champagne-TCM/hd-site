import { test } from "node:test";
import assert from "node:assert/strict";
import { importTs } from "./support/ts.mjs";

/**
 * The pan clamp, ported from the app's ZoomBounds.
 *
 * Its own module and its own tests for the reason the app gives: this is the
 * part that goes wrong, and it went wrong there first --
 *
 *   "Without this, `offset += pan` let a drag carry the chart clean out of view
 *    and leave the user staring at empty navy with no way back."
 *
 * THE INVARIANT: the chart always covers the viewport, or sits centred in it.
 * Asserted rather than eyeballed.
 */

const { ASPECT, MIN_SCALE, MAX_SCALE, clamp, clampScale, limits } = await importTs(
  "src",
  "zoomBounds.ts",
);

const W = 400;
const H = 800;

test("at the fitted scale the chart may not move at all horizontally", () => {
  // scale 1 means "fills the width exactly", so there is nothing to pan into.
  assert.equal(limits(1, W, H, ASPECT).x, 0);
  assert.deepEqual(clamp(999, 0, 1, W, H, ASPECT), { x: 0, y: 0 });
  assert.deepEqual(clamp(-999, 0, 1, W, H, ASPECT), { x: 0, y: 0 });
});

test("zooming in opens room to pan, symmetrically", () => {
  const m = limits(2, W, H, ASPECT);
  assert.equal(m.x, (W * 2 - W) / 2);
  assert.deepEqual(clamp(10_000, 0, 2, W, H, ASPECT), { x: m.x, y: 0 });
  assert.deepEqual(clamp(-10_000, 0, 2, W, H, ASPECT), { x: -m.x, y: 0 });
});

test("a tall viewport can leave the chart with no vertical room", () => {
  // The drawing is taller than it is wide, so which axis has slack depends on
  // the screen, not on the scale alone.
  const wide = limits(1, 1200, 300, ASPECT);
  assert.ok(wide.y > 0, "a short wide screen should allow vertical panning");
  const tall = limits(1, 400, 4000, ASPECT);
  assert.equal(tall.y, 0, "a very tall screen should pin the chart vertically");
});

test("THE CHART CANNOT BE DRAGGED OFF THE SCREEN, at any scale", () => {
  // The lala-land guard, swept rather than spot-checked.
  for (let scale = MIN_SCALE; scale <= MAX_SCALE; scale += 0.5) {
    for (const [x, y] of [[1e6, 1e6], [-1e6, -1e6], [1e6, -1e6], [0, 0]]) {
      const c = clamp(x, y, scale, W, H, ASPECT);
      const m = limits(scale, W, H, ASPECT);
      assert.ok(Math.abs(c.x) <= m.x + 1e-9, `x escaped at scale ${scale}`);
      assert.ok(Math.abs(c.y) <= m.y + 1e-9, `y escaped at scale ${scale}`);
    }
  }
});

test("zooming back out pulls a stale offset back in", () => {
  // The specific failure the app calls out: an offset left over from a deeper
  // zoom would strand the chart off-screen exactly as somebody tried to
  // recover it.
  const deep = clamp(1e6, 1e6, 8, W, H, ASPECT);
  const back = clamp(deep.x, deep.y, 1, W, H, ASPECT);
  assert.deepEqual(back, { x: 0, y: 0 });
});

test("scale is floored at the fitted size and capped where the app caps it", () => {
  assert.equal(clampScale(0.01), MIN_SCALE, "below fitted, the chart floats free");
  assert.equal(clampScale(1000), MAX_SCALE);
  assert.equal(MIN_SCALE, 1);
  assert.equal(MAX_SCALE, 8);
});

test("the aspect is the drawing's own, not a guess", () => {
  // BodygraphGeometry: VB_W 1090 / VB_H 1330.
  assert.ok(Math.abs(ASPECT - 1090 / 1330) < 1e-12);
  assert.ok(ASPECT < 1, "the bodygraph is taller than it is wide");
});
