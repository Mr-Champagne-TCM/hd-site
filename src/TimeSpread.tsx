import { useEffect, useRef, useState } from "react";
import { ADD_TIME_HASH, GATES_NOTE, holdsLine, offerLine, spreadSvg, usableSpread } from "../shared/timeSpread.mjs";

/**
 * AN UNKNOWN BIRTH TIME, MEASURED AND SAID ONCE (Jeremy's calls, 10/22): the
 * one line, the bar under it, the offer. Words and drawing live in
 * shared/timeSpread.mjs, so the PDF says the same.
 *
 * "add it here" opens `#add-time` on this page. The time-only form behind it
 * (once per chart, free, the chart and the reading redone) is the next piece
 * of work; until it is built the link has nothing to open.
 */

/** The tag, as the tables have always drawn it: gold, capitals, small. */
export const TAG = "align-middle text-[12px] uppercase tracking-[0.14em] text-brand-gold/80";

export function Tag({ className = "" }: { className?: string }) {
  return <span className={`${TAG} ${className}`}>provisional</span>;
}

/** The record's measured spread (time unknown, spread kept and sound), else null. */
export function measuredSpread(output: unknown) {
  return usableSpread(output);
}

/** The gate list's short note, under its numbers (shown whenever the gates are marked). */
export function GatesNote() {
  return <span className="mt-1 block text-[14px] leading-snug text-brand-muted">{GATES_NOTE}</span>;
}

/** The day, drawn at the width it is given (a phone gets a phone-sized drawing, not a shrunk one). */
function Day({ spread }: { spread: unknown }) {
  const box = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(640);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const set = () => setW(Math.max(280, Math.floor(el.clientWidth)));
    set();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(set);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  // Our own markup from our own numbers; every word in it is escaped by spreadSvg.
  // 13 px words, 12 px clock: the size of the page's small print, at a phone's width too (B1).
  const { svg } = spreadSvg(spread, { width: w, size: 13 });
  return <div ref={box} className="mt-4" data-time-bar dangerouslySetInnerHTML={{ __html: svg }} />;
}

/**
 * THE ONE LINE, THE BAR, THE OFFER -- right under "Your chart in three lines",
 * before any value is read. The word PROVISIONAL in the line is the tag itself.
 */
export function TimeNote({ output, tier }: { output: unknown; tier: number }) {
  const spread = measuredSpread(output);
  if (!spread) return null;
  const line = holdsLine(spread);
  const offer = offerLine(tier);
  return (
    <section
      aria-label="Your birth time"
      data-time-note
      className="mt-6 rounded-2xl border border-brand-gold/30 bg-brand-gold/[0.05] px-5 py-4 sm:px-6"
    >
      <p className="text-[16px] leading-relaxed text-brand-paper/90">
        {line.parts.map((p: { t?: string; tag?: string }, i: number) =>
          p.tag ? <Tag key={i} /> : <span key={i}>{p.t}</span>,
        )}
      </p>
      <Day spread={spread} />
      <p className="mt-3 text-[15px] leading-relaxed text-brand-muted">
        {offer.before}
        <a href={ADD_TIME_HASH} className="text-brand-teal underline decoration-brand-teal/40 underline-offset-4">
          {offer.link}
        </a>
        {offer.after}
      </p>
    </section>
  );
}
