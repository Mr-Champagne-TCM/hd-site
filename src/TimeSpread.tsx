import { useEffect, useRef, useState } from "react";
import { fix } from "../shared/fixMock.mjs";
import { holdsLine, offerLine, spreadSvg, usableSpread } from "../shared/timeSpread.mjs";
import TimeField from "./entry/TimeField";

/**
 * MOCK TIME (Jeremy 10/22): an unknown birth time, measured and said once.
 *
 *   ?fix=TIME              the one line, the day drawn with its rows, the tags
 *   ?fix=TIME,TIMEBAR      the same, the day drawn without rows (his choice)
 *   ?fix=TIME,TIMEOFFERB   the second wording of "Found your birth time?"
 *
 * Words and drawing: shared/timeSpread.mjs, so the PDF and the phone match.
 */

/** The tag, as the tables have always drawn it: gold, capitals, small. */
export const TAG = "align-middle text-[12px] uppercase tracking-[0.14em] text-brand-gold/80";

export function Tag({ className = "" }: { className?: string }) {
  return <span className={`${TAG} ${className}`}>provisional</span>;
}

/** True when this chart's page uses the measured spread (switch on, spread kept, time unknown). */
export function measuredSpread(output: unknown) {
  return fix("TIME") ? usableSpread(output) : null;
}

/** The day, drawn at the width it is given (a phone gets a phone-sized drawing, not a shrunk one). */
function Day({ spread, rows }: { spread: unknown; rows: boolean }) {
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
  const { svg } = spreadSvg(spread, { width: w, rows });
  return <div ref={box} className="mt-4" dangerouslySetInnerHTML={{ __html: svg }} />;
}

/**
 * THE ONE LINE, THE DAY, THE OFFER -- right under "Your chart in three lines",
 * before any value is read. The word PROVISIONAL in the line is the tag itself.
 */
export function TimeNote({ output, tier }: { output: unknown; tier: number }) {
  const spread = measuredSpread(output);
  if (!spread) return null;
  const line = holdsLine(spread);
  const offer = offerLine(tier, fix("TIMEOFFERB") ? "B" : "A");
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
      <Day spread={spread} rows={!fix("TIMEBAR")} />
      <p className="mt-3 text-[15px] leading-relaxed text-brand-muted">
        {offer.before}
        <a href="#add-time" className="text-brand-teal underline decoration-brand-teal/40 underline-offset-4">
          {offer.link}
        </a>
        {offer.after}
      </p>
    </section>
  );
}

/** "#add-time" on the page, followed as it changes. */
export function useAddTime() {
  const read = () => (typeof window !== "undefined" ? window.location.hash === "#add-time" : false);
  const [on, setOn] = useState(read);
  useEffect(() => {
    const f = () => {
      setOn(read());
      window.scrollTo({ top: 0 });
    };
    window.addEventListener("hashchange", f);
    return () => window.removeEventListener("hashchange", f);
  }, []);
  return on;
}

/**
 * WHERE "add it here" GOES -- a MOCK of the time-only form (the full flow is
 * not built): the kept birth line, the shop's own time box, one button. Once
 * per chart, free; the chart (and the reading) are redone from it.
 */
export function AddTimeMock({ tier, birthLine }: { tier: number; birthLine: string | null }) {
  const [time, setTime] = useState("");
  const kept = (birthLine ?? "").split(" · ").filter((p) => !/time unknown/i.test(p)).join(" · ");
  return (
    <section className="page-bottom mx-auto max-w-3xl px-6 pt-16 sm:px-8" data-add-time>
      <p className="mb-6 inline-block rounded-full border border-brand-gold/40 px-3 py-1 font-sans text-[12px] uppercase tracking-[0.16em] text-brand-gold">
        Mock · the full flow is not built
      </p>
      <h1 className="font-display text-[clamp(1.6rem,3.6vw,2rem)] font-medium leading-[1.18] tracking-tight text-brand-gold">
        Add your birth time
      </h1>
      <div className="mt-4 max-w-[62ch] rounded-xl border border-brand-teal/30 bg-brand-teal/[0.06] px-4 py-3 text-[16px] leading-relaxed text-brand-paper">
        Once, and free.{" "}
        {tier >= 2
          ? "Your chart and your reading are made again from the time you add; the date and place stay as they are."
          : "Your chart is made again from the time you add; the date and place stay as they are."}
      </div>
      {kept && <p className="mt-5 text-[15px] text-brand-muted">{kept}</p>}
      <div className="mt-6 max-w-[34rem]">
        <TimeField value={time} onChange={setTime} unknown={false} onUnknownChange={() => {}} askUnknown={false} />
      </div>
      <div className="mt-7">
        <button
          type="button"
          disabled
          className="rounded-full bg-brand-teal px-6 py-3.5 font-sans text-[16px] font-semibold text-[#0d1b1a] shadow-lg shadow-brand-teal/25 disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none"
        >
          {tier >= 2 ? "Redo my chart and reading" : "Redo my chart"}
        </button>
        <a href="#" className="ml-0 mt-4 block font-sans text-[15px] text-brand-teal underline decoration-brand-teal/40 underline-offset-4 sm:ml-5 sm:mt-0 sm:inline">
          Back to my chart
        </a>
      </div>
    </section>
  );
}
