import { useEffect, useState } from "react";
import { checkBodygraph } from "./bodygraphGate";

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
 * The chart, and a way to look at it closely.
 *
 * Jeremy: "I want them to be able to zoom on the bg alone. Zooming the whole
 * page doesn't behave politely." He is right -- pinching the page moves the
 * nav, the headings and the summary table along with the drawing, and on a
 * phone it is easy to end up somewhere you cannot get back from.
 *
 * NO GESTURE CODE. The picker cost five rounds of tail-chasing to replace a
 * native behaviour, and the lesson recorded from it is that a custom control
 * replacing something that works is five rounds minimum. So this opens a
 * fullscreen panel, sets the drawing to a chosen width, and lets the BROWSER'S
 * OWN SCROLLING do the panning. Three zoom steps, two buttons, and nothing
 * that can be dropped, mis-tracked or fought with.
 */
function Viewer({ svg, alt }: { svg: string; alt: string }) {
  const [open, setOpen] = useState(false);
  const [zoom, setZoom] = useState(2);

  // Escape closes it, and the page behind must not scroll under a fullscreen
  // panel -- the same rule the picker's sheet needed.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open]);

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
        onClick={() => {
          setZoom(2);
          setOpen(true);
        }}
        className="block w-full cursor-zoom-in rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-teal/50"
        aria-label={`${alt} — open larger`}
      >
        {drawing}
      </button>
      <figcaption className="mt-2 text-center font-sans text-[13px] text-brand-muted">
        Tap the chart to look closely
      </figcaption>

      {open && (
        <div className="fixed inset-0 z-50 flex flex-col bg-[#120a2e]">
          <div className="flex items-center justify-between gap-3 border-b border-brand-gold/20 px-4 py-3">
            <div className="flex items-center gap-2">
              <ZoomButton
                label="Zoom out"
                onClick={() => setZoom((z) => Math.max(1, z - 1))}
                disabled={zoom <= 1}
              >
                −
              </ZoomButton>
              <span className="min-w-[3.5rem] text-center font-sans text-[14px] text-brand-muted">
                {zoom}×
              </span>
              <ZoomButton
                label="Zoom in"
                onClick={() => setZoom((z) => Math.min(4, z + 1))}
                disabled={zoom >= 4}
              >
                +
              </ZoomButton>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-full border border-brand-teal/50 px-4 py-2 font-sans text-[15px] text-brand-teal"
            >
              Done
            </button>
          </div>
          {/*
            The panning. `overflow-auto` on the frame and a width larger than it
            on the drawing is the whole mechanism -- a scroll the browser
            already knows how to do, on every device, with momentum and edges
            and everything else that would otherwise have to be written.
          */}
          <div className="flex-1 overflow-auto overscroll-contain p-3">
            <div style={{ width: `${zoom * 100}%`, minWidth: "100%" }}>
              {drawing}
            </div>
          </div>
        </div>
      )}
    </figure>
  );
}

function ZoomButton({
  children,
  label,
  onClick,
  disabled,
}: {
  children: React.ReactNode;
  label: string;
  onClick: () => void;
  disabled: boolean;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
      className="h-11 w-11 rounded-full border border-brand-gold/40 font-sans text-[20px] leading-none text-brand-paper disabled:opacity-30"
    >
      {children}
    </button>
  );
}
