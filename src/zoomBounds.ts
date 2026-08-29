/**
 * How far a zoomed chart may be dragged before it would leave the screen.
 *
 * A DIRECT PORT of `ZoomBounds` in the app's BodygraphView.kt, arithmetic and
 * reasoning both, because this is the part that goes wrong and the app already
 * got it wrong once:
 *
 *   "Without this, `offset += pan` let a drag carry the chart clean out of view
 *    and leave the user staring at empty navy with no way back -- getting lost
 *    in lala land, in the words of the person it happened to."
 *
 * Kept as pure functions in their own module for the same reason it is a
 * separate object over there: the invariant can be ASSERTED rather than
 * eyeballed. The chart must always cover the viewport, or sit centred in it.
 *
 * `scale` has one meaning, the app's meaning: MULTIPLES OF THE VIEWPORT WIDTH.
 * 1 fills the width exactly. The app learned that the hard way too -- a
 * canvas-transform version "measured 1.14x on screen while claiming 1.6x, and a
 * zoom factor that does not mean what it says cannot be reasoned about."
 */

/** The drawing's own proportions, from BodygraphGeometry: VB_W / VB_H. */
export const ASPECT = 1090 / 1330;

/** The pan limit on each axis. Zero means that axis must not move at all. */
export function limits(
  scale: number,
  viewW: number,
  viewH: number,
  aspect: number = ASPECT,
): { x: number; y: number } {
  const w = viewW * scale;
  const h = w / aspect;
  return { x: Math.max(0, (w - viewW) / 2), y: Math.max(0, (h - viewH) / 2) };
}

/** `x` and `y` pulled back inside those limits. */
export function clamp(
  x: number,
  y: number,
  scale: number,
  viewW: number,
  viewH: number,
  aspect: number = ASPECT,
): { x: number; y: number } {
  const m = limits(scale, viewW, viewH, aspect);
  return {
    x: noNegativeZero(Math.min(Math.max(x, -m.x), m.x)),
    y: noNegativeZero(Math.min(Math.max(y, -m.y), m.y)),
  };
}

/**
 * `-0` is a real value in JavaScript and it leaks out of this clamp.
 *
 * When a limit is zero, `Math.max(-999, -0)` returns `-0`, so panning left at
 * the fitted scale yields `{ x: -0 }`. It behaves identically to 0 in CSS and
 * in arithmetic, and it is NOT identical under Object.is -- which is what
 * caught it: a test asserting the chart cannot move returned -0 and failed
 * against 0.
 *
 * Normalised here rather than in the test, because a function that sometimes
 * returns -0 is a function that will surprise the next caller too.
 */
function noNegativeZero(v: number): number {
  return v === 0 ? 0 : v;
}

/** The app's range. Below 1 the chart would float free of the viewport. */
/**
 * THE FLOOR IS "THE WHOLE CHART FITS", NOT "IT FILLS THE WIDTH".
 *
 * This was 1, meaning one viewport width, and on a wide screen that is already
 * too close: the drawing is TALLER than it is wide, so filling the width pushes
 * the head and the root off the top and bottom with nothing to zoom out to.
 *
 * Jeremy, on the live site: "clicking the graph jumps into a zoom level that is
 * VERY close. cannot zoom further out from this 'too close' perspective... No
 * side to side action." Both are the same fault -- at that scale the horizontal
 * pan limit is exactly zero, because the drawing is precisely as wide as the
 * viewport.
 *
 * And it is why FIT did nothing: it returned to a floor he was already sitting
 * on. A control that is already satisfied looks broken, and it was not wrong to
 * read it that way.
 *
 * `MIN_SCALE` stays as the name for the app's meaning of 1, because the drag
 * arithmetic below is expressed in viewport widths and must not be re-based.
 * What changes is that the floor is now COMPUTED from the viewport.
 */
export const MIN_SCALE = 1;
export const MAX_SCALE = 8;

/**
 * The largest scale at which the whole drawing is visible.
 *
 * Never more than 1: on a tall, narrow viewport the width is the binding
 * constraint and filling it is already the most that fits.
 */
export function fitScale(viewW: number, viewH: number, aspect: number = ASPECT): number {
  if (!(viewW > 0) || !(viewH > 0)) return MIN_SCALE;
  return Math.min(MIN_SCALE, (viewH * aspect) / viewW);
}

export function clampScale(scale: number, floor: number = MIN_SCALE): number {
  return Math.min(Math.max(scale, Math.min(floor, MAX_SCALE)), MAX_SCALE);
}
