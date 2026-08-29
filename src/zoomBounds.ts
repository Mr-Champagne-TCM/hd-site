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

/**
 * WHAT THE VIEWER SHOWS, AS A viewBox RATHER THAN A GIANT ELEMENT.
 *
 * The drawing used to be an element sized `viewportWidth * scale`. At the top
 * of the range on a wide screen that is 15,360 x 18,742 CSS pixels of SVG --
 * around 288 million pixels of potential raster for a picture that is only ever
 * seen through a 1920 x 1000 window.
 *
 * HONESTY ABOUT WHY THIS CHANGED. Jeremy reported pixel noise at maximum zoom
 * and I could not reproduce it: Chrome renders the giant element losslessly at
 * that exact size, measured side by side against this approach. So this is NOT
 * a proven fix for what he saw. What it is, is the removal of the only
 * pathological case in the viewer -- the same picture, drawn through a window
 * the size of the window, so the compositor is asked for a screenful instead of
 * a mural. On a machine whose GPU is known to time out under load, that is
 * worth having whether or not it was the cause.
 *
 * The arithmetic is a straight inversion of the positioning it replaces. The
 * old element sat at `left = (w - drawW)/2 + offset.x` and was `drawW` wide for
 * `src.w` user units, so one CSS pixel is `src.w / drawW` user units; the
 * window's top-left in user space is `src.x - left * that`. Both axes share one
 * scale, which is why `preserveAspectRatio="none"` is safe here and would be a
 * distortion anywhere else.
 */
export type Box = { x: number; y: number; w: number; h: number };

/** The drawing's own coordinate system, from BodygraphGeometry. */
export const SOURCE_BOX: Box = { x: -120, y: -12, w: 1090, h: 1330 };

/** The `viewBox` attribute for a window of `viewW x viewH` at this scale/offset. */
export function viewBoxFor({
  viewW,
  viewH,
  scale,
  offset,
  src = SOURCE_BOX,
  aspect = ASPECT,
}: {
  viewW: number;
  viewH: number;
  scale: number;
  offset: { x: number; y: number };
  src?: Box;
  aspect?: number;
}): Box | null {
  if (!(viewW > 0) || !(viewH > 0) || !(scale > 0)) return null;
  const drawW = viewW * scale;
  const drawH = drawW / aspect;
  // Where the drawing's top-left would have been, in CSS pixels.
  const left = (viewW - drawW) / 2 + offset.x;
  const top = (viewH - drawH) / 2 + offset.y;
  // User units per CSS pixel. Identical on both axes by construction.
  const k = src.w / drawW;
  return {
    x: src.x - left * k,
    y: src.y - top * k,
    w: viewW * k,
    h: viewH * k,
  };
}

/** The same, formatted for the attribute. */
export function viewBoxAttr(box: Box | null): string | null {
  if (!box) return null;
  const n = (v: number) => (Number.isFinite(v) ? v.toFixed(4) : "0");
  return `${n(box.x)} ${n(box.y)} ${n(box.w)} ${n(box.h)}`;
}

/**
 * THE CONTROLS SIT ON THE DRAWING, so the drawing is not given that space.
 *
 * Measured on Jeremy's screen while he was looking at it: the control bar
 * starts 69px above the bottom of a 581px viewport, and at the FITTED scale
 * the chart is exactly as tall as the viewport -- so the Root, the bottom
 * centre, is under the bar every single time. Zoomed in it was 95px of
 * overlap. "can never see the bottom center."
 *
 * The fix is not to move the bar. It is to stop pretending the whole viewport
 * is available: everything works from a box with the furniture subtracted, so
 * FIT means "the whole chart fits in the space you can actually see" rather
 * than "in the rectangle".
 *
 * The top inset is smaller because the only thing up there is a hint and a
 * Done button in the corners, not a bar across the middle.
 *
 * AT MODULE SCOPE because the opening scale needs it too, and when it lived
 * inside the component it was easy for one caller to reach for the raw box
 * instead -- which is exactly what happened. See `visible` below.
 */
export const CHROME_TOP = 40;
export const CHROME_BOTTOM = 76;

/**
 * The part of the overlay a drawing may actually occupy.
 *
 * ONE FUNCTION, because there were two answers and only one of them was right.
 * `reset()` subtracted the furniture and the OPENING scale did not, so the
 * viewer opened with the Root under the control bar and pressing Fit moved it
 * out -- Jeremy: "chart can clear but starts after click with the bottom
 * hidden." A control that repairs the state you were put in is a control
 * covering for a bug.
 */
export function visible(box: { w: number; h: number }): { w: number; h: number } {
  return { w: box.w, h: Math.max(0, box.h - CHROME_TOP - CHROME_BOTTOM) };
}
