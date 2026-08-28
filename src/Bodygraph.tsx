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
export default function Bodygraph({ svg, alt }: { svg: unknown; alt?: string }) {
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
        The drawing did not come through just now. Everything else on your reading is here, and
        reloading usually brings it back — nothing about your purchase has changed.
      </p>
    );
  }

  return (
    <figure className="m-0">
      <div
        role="img"
        aria-label={alt ?? "Your bodygraph"}
        className="w-full [&>svg]:h-auto [&>svg]:w-full"
        dangerouslySetInnerHTML={{ __html: verdict.svg }}
      />
    </figure>
  );
}
