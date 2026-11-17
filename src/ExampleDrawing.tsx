import { useEffect, useRef, useState, type ReactNode } from "react";
import Bodygraph from "./Bodygraph";
import { checkBodygraph } from "./bodygraphGate";

/**
 * THE EXAMPLE'S DRAWING, LOADED FROM THE MAIN SITE (Jeremy 11/16, call 1: "1").
 *
 * The drawing is never committed to this public repository (leak-scan rule
 * rendered-chart: a committed render hands the whole look to anyone who clones
 * it). The main site already publishes the example chart's drawing -- Jeremy's
 * own chart, the one example everywhere -- so the offer page asks for it there,
 * in the visitor's browser, and nothing is added here.
 *
 * - Asked for only when the example is near the screen, so the first screen
 *   does not carry 190 KB it may never show.
 * - Through the same gate as a buyer's own drawing (bodygraphGate.ts), and
 *   inline for the same reason: the labels were placed against the page's font.
 * - If it does not arrive (the main site is down, the file moved, the gate
 *   refuses it), `fallback` stays: the link to the page that shows it. A
 *   visitor is never shown a hole or an apology on a page selling something.
 */
export const EXAMPLE_DRAWING_URL = "https://thechampagnemethod.co/samples/bodygraph.svg";

export default function ExampleDrawing({ alt, fallback }: { alt: string; fallback: ReactNode }) {
  const holder = useRef<HTMLDivElement>(null);
  const [svg, setSvg] = useState<string | null>(null);

  useEffect(() => {
    const el = holder.current;
    if (!el) return;
    let alive = true;
    let asked = false;
    const ask = () => {
      if (asked) return;
      asked = true;
      fetch(EXAMPLE_DRAWING_URL, { credentials: "omit", referrerPolicy: "no-referrer" })
        .then((r) => (r.ok ? r.text() : Promise.reject(new Error(String(r.status)))))
        .then((t) => {
          if (alive && checkBodygraph(t).ok) setSvg(t);
        })
        .catch(() => {});
    };
    if (typeof IntersectionObserver === "undefined") {
      ask();
      return () => {
        alive = false;
      };
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          io.disconnect();
          ask();
        }
      },
      { rootMargin: "800px 0px" },
    );
    io.observe(el);
    return () => {
      alive = false;
      io.disconnect();
    };
  }, []);

  return (
    <div ref={holder}>
      {svg ? (
        <div className="mx-auto mt-6 max-w-[30rem] rounded-2xl border border-brand-gold/25 bg-white/[0.04] p-3 sm:p-5">
          <Bodygraph svg={svg} alt={alt} />
        </div>
      ) : (
        fallback
      )}
    </div>
  );
}
