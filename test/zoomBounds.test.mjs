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

// --- the floor, after the first real walk-through ---------------------------

test("THE FLOOR SHOWS THE WHOLE CHART, it does not fill the width", async () => {
  // Jeremy on the live viewer: "jumps into a zoom level that is VERY close.
  // cannot zoom further out... No side to side action." Both were the same
  // fault -- at one viewport width the drawing is exactly as wide as the
  // viewport (so the horizontal pan limit is zero) and much taller than it (so
  // the head and root are off screen with nothing to zoom out to).
  const { fitScale, ASPECT, MIN_SCALE, clampScale } = await import("../src/zoomBounds.ts")
    .catch(() => import("../src/zoomBounds.js"));

  // A wide desktop overlay: the whole drawing must fit inside the height.
  const wide = fitScale(1200, 800);
  assert.ok(wide < MIN_SCALE, "the floor still fills the width on a wide screen");
  assert.ok(Math.abs(1200 * wide / ASPECT - 800) < 1, "the drawing does not fit the height exactly");

  // A phone, where the WIDTH is the binding constraint. Filling it is already
  // the most that fits, so the floor stays where it was.
  assert.equal(fitScale(390, 700), MIN_SCALE);

  // Never above 1, whatever the shape.
  for (const [w, h] of [[100, 100000], [1, 1], [800, 800]]) {
    assert.ok(fitScale(w, h) <= MIN_SCALE, `${w}x${h} produced a floor above 1`);
  }
});

test("an unmeasured viewport does not produce a nonsense floor", async () => {
  // The element is measured after it exists, so zero is a real state that this
  // is asked about before the first paint.
  const { fitScale, MIN_SCALE } = await import("../src/zoomBounds.ts")
    .catch(() => import("../src/zoomBounds.js"));
  for (const [w, h] of [[0, 0], [0, 800], [1200, 0], [-5, 100]]) {
    assert.equal(fitScale(w, h), MIN_SCALE, `${w}x${h} did not fall back to 1`);
  }
});

test("clampScale respects a floor below one, which is what made Fit work", async () => {
  const { clampScale, MAX_SCALE } = await import("../src/zoomBounds.ts")
    .catch(() => import("../src/zoomBounds.js"));
  assert.equal(clampScale(0.1, 0.5), 0.5, "the computed floor was ignored");
  assert.equal(clampScale(0.7, 0.5), 0.7);
  assert.equal(clampScale(99, 0.5), MAX_SCALE);
  // With no floor given it behaves exactly as it always did.
  assert.equal(clampScale(0.1), 1);
});

test("THE CONTROLS DO NOT STAND ON THE CHART", async () => {
  // Measured on a real screen while Jeremy was looking at it: a 581px viewport,
  // the control bar starting 69px from the bottom, and the chart at the fitted
  // scale exactly as tall as the viewport -- so the Root was under the bar
  // every time. "can never see the bottom center."
  //
  // The floor is asked about the space that is actually VISIBLE, not the whole
  // rectangle, so this checks the arithmetic that decision rests on.
  const { fitScale, ASPECT } = await import("../src/zoomBounds.ts").catch(() =>
    import("../src/zoomBounds.js"),
  );

  const CHROME_TOP = 40;
  const CHROME_BOTTOM = 76;
  const viewportH = 581;
  const usableH = viewportH - CHROME_TOP - CHROME_BOTTOM;

  const naive = fitScale(1396, viewportH);
  const honest = fitScale(1396, usableH);
  assert.ok(honest < naive, "reserving the furniture did not shrink the fitted scale");

  // At the honest floor the drawing fits inside the visible band, with the
  // bottom of the chart ABOVE where the control bar starts.
  const drawH = 1396 * honest / ASPECT;
  assert.ok(drawH <= usableH + 1, `the drawing is ${drawH}px in a ${usableH}px band`);
  const bottom = CHROME_TOP + (usableH - drawH) / 2 + drawH;
  assert.ok(
    bottom <= viewportH - CHROME_BOTTOM + 1,
    `the chart still reaches ${bottom}px, and the controls start at ${viewportH - CHROME_BOTTOM}px`,
  );
});
