import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { checkBodygraph } from "./bodygraphGate";
import { ASPECT, MAX_SCALE, MIN_SCALE, clamp, clampScale } from "./zoomBounds";

/**
 * The drawing, on the page.
 *
 * Thin on purpose. Everything that could be got wrong -- what markup is allowed
 * in, what a truncated response looks like, what to say when it fails -- lives
 * in bodygraphGate.ts where it can be tested without a browser. This file is the
 * twenty lines that put the result in the DOM.
 *
 * INLINE, via dangerouslySetInnerHTML, and the reason is the font. An <img>
 * with a data: URL would need no gate at all, but an SVG loaded that way is its
 * own document and cannot reach the page's Outfit -- every label would fall
 * back to whatever the device has, take different metrics, and land back on top
 * of the graphics. The label positions were solved against Outfit at 16 with
 * 0.19em of tracking, and the tightest of them clears a gate disc by six units.
 *
 * So the markup goes in live, and it goes through checkBodygraph first. There
 * is no path in this file that renders unchecked markup.
 */
export default function Bodygraph({
  svg,
  alt,
}: {
  svg: unknown;
  alt?: string;
}) {
  const verdict = checkBodygraph(svg);

  if (!verdict.ok) {
    // SAID, not swallowed. A missing chart on a page somebody paid for is not
    // a cosmetic problem, and a blank space would look like a slow image.
    // The reason goes to the console for us; the visitor gets a sentence that
    // tells them the truth -- their reading is fine, the picture is not showing
    // -- and does not ask them to do anything that will not help.
    if (typeof console !== "undefined") {
      console.error(`bodygraph refused: ${verdict.reason}`);
    }
    return (
      <p className="rounded-xl border border-brand-gold/40 bg-brand-gold/[0.06] px-4 py-3 text-[15px] leading-relaxed text-brand-paper">
        The drawing did not come through just now. Everything else on your
        reading is here, and reloading usually brings it back — nothing about
        your purchase has changed.
      </p>
    );
  }

  return <Viewer svg={verdict.svg} alt={alt ?? "Your bodygraph"} />;
}

/**
 * The chart, and the full-screen zoom behind a tap.
 *
 * MIMICS THE APP, at Jeremy's instruction, because he has already had this
 * argument with himself once and settled it there. The first web version used
 * plus/minus buttons and browser scrolling -- safe, and not what he asked for.
 *
 * What the app does, and therefore what this does:
 *
 *   tap the chart          full screen, on the panel navy
 *   opens at scale 1       which FILLS THE WIDTH. Opening any smaller reads as
 *                          nothing having happened -- the app's own note
 *   pinch to zoom          1x to 8x
 *   drag to move           clamped, so the chart always covers the viewport
 *   Done, top right        in gold
 *
 * SCALE MEANS MULTIPLES OF THE VIEWPORT WIDTH, the app's meaning, so the drawing
 * is sized and positioned rather than transformed. Its note on why: a
 * canvas-transform version "measured 1.14x on screen while claiming 1.6x, and a
 * zoom factor that does not mean what it says cannot be reasoned about."
 *
 * The clamp is a direct port in ./zoomBounds.ts, tested rather than eyeballed,
 * because that is the part the app got wrong first: an unclamped drag "let a
 * drag carry the chart clean out of view and leave the user staring at empty
 * navy with no way back."
 *
 * Gesture handling is Pointer Events -- one API for touch, pen and mouse -- and
 * `touch-action: none` on the surface so the browser does not take the pinch
 * for itself and zoom the whole page, which is the behaviour being replaced.
 */
function Viewer({ svg, alt }: { svg: string; alt: string }) {
  const [open, setOpen] = useState(false);

  const drawing = (
    <div
      role="img"
      aria-label={alt}
      className="[&>svg]:h-auto [&>svg]:w-full"
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );

  return (
    <figure className="m-0">
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="block w-full cursor-zoom-in rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-teal/50"
        aria-label={`${alt} — open larger`}
      >
        {drawing}
      </button>
      <figcaption className="mt-2 text-center font-sans text-[13px] text-brand-muted">
        Tap the chart to zoom in
      </figcaption>
      {open && <Zoom svg={svg} alt={alt} onClose={() => setOpen(false)} />}
    </figure>
  );
}

function Zoom({
  svg,
  alt,
  onClose,
}: {
  svg: string;
  alt: string;
  onClose: () => void;
}) {
  const surface = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(MIN_SCALE);
  const [offset, setOffset] = useState({ x: 0, y: 0 });

  /**
   * Live pointers, in a ref rather than state. A gesture updates many times a
   * second and none of those updates should cause a render on their own -- the
   * render comes from the scale and offset they produce.
   */
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<{ dist: number; cx: number; cy: number } | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  /**
   * THE VIEWPORT, MEASURED AFTER IT EXISTS.
   *
   * This used to read `surface.current.clientWidth` DURING render, when the
   * element has not been created yet, so the first pass sized the drawing to
   * one pixel and nothing re-rendered to correct it. The viewer opened empty.
   *
   * Reported exactly as that behaves: empty on desktop, and on a phone "a
   * pinch pops the graph into view" -- because a pointer event was the first
   * thing to cause a second render, which finally had a real element to
   * measure.
   *
   * Measured in a layout effect and kept in state, so the first PAINT already
   * has the right numbers, and observed after that so a rotation or a resize
   * does not strand it at the old size.
   */
  const [box, setBox] = useState({ w: 0, h: 0 });
  useLayoutEffect(() => {
    const el = surface.current;
    if (!el) return;
    const measure = () => setBox({ w: el.clientWidth, h: el.clientHeight });
    measure();
    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", measure);
      return () => window.removeEventListener("resize", measure);
    }
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const view = () => box;

  function centroid() {
    const pts = [...pointers.current.values()];
    const cx = pts.reduce((s, p) => s + p.x, 0) / pts.length;
    const cy = pts.reduce((s, p) => s + p.y, 0) / pts.length;
    const dist =
      pts.length > 1 ? Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y) : 0;
    return { cx, cy, dist };
  }

  function down(e: React.PointerEvent) {
    (e.target as Element).setPointerCapture?.(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    gesture.current = centroid();
  }

  function move(e: React.PointerEvent) {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const now = centroid();
    const was = gesture.current;
    if (!was) return;

    // Pinch only when two fingers are down; one finger is a drag.
    const next =
      was.dist > 0 && now.dist > 0
        ? clampScale(scale * (now.dist / was.dist))
        : scale;

    const { w, h } = view();
    // RE-CLAMPED AGAINST THE NEW SCALE, not the old one. Zooming back out
    // shrinks the pan limits, and an offset left over from a deeper zoom would
    // strand the chart off-screen at the moment somebody was recovering it.
    const moved = clamp(
      offset.x + (now.cx - was.cx),
      offset.y + (now.cy - was.cy),
      next,
      w,
      h,
      ASPECT,
    );

    gesture.current = now;
    setScale(next);
    setOffset(moved);
  }

  function up(e: React.PointerEvent) {
    pointers.current.delete(e.pointerId);
    gesture.current = pointers.current.size ? centroid() : null;
  }

  /**
   * ZOOM TO A POINT, keeping whatever is under it under it.
   *
   * `px`/`py` are relative to the surface. The drawing's left edge sits at
   * (w - drawW)/2 + offset.x, so the fraction of the drawing under the cursor is
   * (px - left)/drawW; holding that fraction still across a scale change gives
   * the new offset directly. Passing the centre makes it an ordinary zoom, which
   * is what the buttons do.
   */
  function zoomTo(nextRaw: number, px?: number, py?: number) {
    const { w, h } = view();
    if (!(w > 0 && h > 0)) return;
    const next = clampScale(nextRaw);
    const curW = w * scale;
    const curH = curW / ASPECT;
    const nxtW = w * next;
    const nxtH = nxtW / ASPECT;
    const ax = px ?? w / 2;
    const ay = py ?? h / 2;
    const left = (w - curW) / 2 + offset.x;
    const top = (h - curH) / 2 + offset.y;
    const u = curW ? (ax - left) / curW : 0.5;
    const v = curH ? (ay - top) / curH : 0.5;
    const ox = ax - u * nxtW - (w - nxtW) / 2;
    const oy = ay - v * nxtH - (h - nxtH) / 2;
    setScale(next);
    setOffset(clamp(ox, oy, next, w, h, ASPECT));
  }

  /**
   * THE WHEEL IS OURS WHILE THIS IS OPEN.
   *
   * Reported after the viewer finally opened: "ctrl + scroll zooms whole page
   * and it gets weird". It did -- ctrl+wheel is the browser's own page zoom, and
   * nothing here was stopping it, so the chart and the entire interface scaled
   * together against a fixed overlay.
   *
   * Attached with `passive: false` through an effect rather than as onWheel,
   * because React's synthetic wheel handler is registered passively and
   * preventDefault() inside it does nothing at all. This is the one case where
   * the listener has to be added by hand.
   *
   * Every wheel event over the surface is swallowed, ctrl or not: a plain scroll
   * has nowhere to go behind a full-screen overlay, and letting it through is
   * how a page ends up scrolled somewhere else when the viewer closes.
   */
  useEffect(() => {
    const el = surface.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      // Trackpads report small deltas continuously and mice report ~100 at a
      // time; exponentiating the delta makes both feel the same and keeps the
      // step proportional, so zooming out is the exact inverse of zooming in.
      const step = Math.exp(-e.deltaY / 320);
      zoomTo(scale * step, e.clientX - rect.left, e.clientY - rect.top);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  });

  function reset() {
    setScale(MIN_SCALE);
    setOffset({ x: 0, y: 0 });
  }

  const { w, h } = view();
  const ready = w > 0 && h > 0;
  const drawW = w * scale;
  const drawH = drawW / ASPECT;

  return (
    <div className="fixed inset-0 z-50 bg-[#0E1A2B]">
      <div
        ref={surface}
        className="absolute inset-0 touch-none overflow-hidden"
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={up}
        // A way back for a mouse, which cannot pinch.
        onDoubleClick={reset}
      >
        {ready && (
          <div
            role="img"
            aria-label={alt}
            className="absolute [&>svg]:h-full [&>svg]:w-full"
            style={{
              width: drawW,
              height: drawH,
              left: (w - drawW) / 2 + offset.x,
              top: (h - drawH) / 2 + offset.y,
            }}
            dangerouslySetInnerHTML={{ __html: svg }}
          />
        )}
      </div>

      <p className="pointer-events-none absolute left-5 top-4 font-sans text-[12px] text-brand-muted">
        Pinch or scroll to zoom, drag to move
      </p>
      <button
        type="button"
        onClick={onClose}
        className="absolute right-3 top-2 rounded-full px-4 py-2 font-sans text-[16px] text-brand-gold"
      >
        Done
      </button>
      {/*
        CONTROLS, because a pinch is not available to everybody. A mouse without
        a wheel, a trackpad somebody has never scrolled on, a keyboard user --
        all of them had no way to zoom at all, which Jeremy reported as "no zoom
        in / out controls available for not ctrl+scroll".

        The reading is on the same row as the buttons rather than floating
        separately, so what the numbers mean is beside the thing that changes
        them.
      */}
      <div className="absolute bottom-5 left-1/2 flex -translate-x-1/2 items-center gap-2 rounded-full border border-brand-gold/25 bg-[#0E1A2B]/90 px-2 py-1.5">
        <button
          type="button"
          aria-label="Zoom out"
          disabled={scale <= MIN_SCALE}
          onClick={() => zoomTo(scale / 1.4)}
          className="h-9 w-9 rounded-full font-sans text-[20px] leading-none text-brand-gold disabled:opacity-30"
        >
          −
        </button>
        <span className="min-w-[5.5rem] text-center font-sans text-[12px] tabular-nums text-brand-muted">
          {scale.toFixed(1)}× of {MAX_SCALE}×
        </span>
        <button
          type="button"
          aria-label="Zoom in"
          disabled={scale >= MAX_SCALE}
          onClick={() => zoomTo(scale * 1.4)}
          className="h-9 w-9 rounded-full font-sans text-[20px] leading-none text-brand-gold disabled:opacity-30"
        >
          +
        </button>
        <button
          type="button"
          disabled={scale <= MIN_SCALE}
          onClick={reset}
          className="ml-1 rounded-full px-3 py-1.5 font-sans text-[13px] text-brand-teal disabled:opacity-30"
        >
          Fit
        </button>
      </div>
    </div>
  );
}
