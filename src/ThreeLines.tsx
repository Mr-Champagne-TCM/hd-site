import { AUTHORITY_GLANCE, PROFILE_GLANCE, TYPE_GLANCE } from "../shared/libraryGlance.mjs";

/**
 * FIX 1A (Jeremy 10/19): "Your chart in three lines", a plain way in at the
 * top of the result page, on a computer and on a phone. BELOW the chart the
 * page keeps today's order (his 1B half: the tables stay where they are).
 *
 * Nothing here is written by the model except the third line on the reading
 * tier, which is the reading's own first experiment, moved up and never
 * rewritten. The other lines are the library's one-liners -- Jeremy's
 * approved words, generated into shared/libraryGlance.mjs -- picked by the
 * chart's own values. A chart without a reading (the chart tier) gets its
 * profile's one-liner as the third line instead.
 */

type Chart = { type?: string; authority?: string; profile?: string | number };

const GLANCE_TYPE = TYPE_GLANCE as Record<string, string>;
const GLANCE_AUTH = AUTHORITY_GLANCE as Record<string, string>;
const GLANCE_PROFILE = PROFILE_GLANCE as Record<string, string>;

/** "(Sacral authority) Notice how..." -> "Notice how..." */
export const firstExperiment = (takeaways: string[] | undefined | null) => {
  const t = (takeaways ?? []).find((s) => /^\(/.test(s));
  return t ? t.replace(/^\([^)]*\)\s*/, "") : null;
};

export default function ThreeLines({ chart, takeaways }: { chart: Chart; takeaways?: string[] | null }) {
  const profile = String(chart.profile ?? "").replace(/\s/g, "");
  const experiment = firstExperiment(takeaways);
  const rows: Array<[string, string, string | null]> = [
    ["Your energy", chart.type ?? "", GLANCE_TYPE[chart.type ?? ""] ?? null],
    ["How you decide", chart.authority ?? "", GLANCE_AUTH[chart.authority ?? ""] ?? null],
    experiment
      ? ["Something to try this week", "", experiment]
      : ["How you meet the world", profile ? `Profile ${profile}` : "", GLANCE_PROFILE[profile] ?? null],
  ];
  const shown = rows.filter(([, , line]) => line);
  if (!shown.length) return null;
  return (
    <section
      aria-labelledby="three-lines"
      className="mt-8 rounded-2xl border border-brand-teal/50 bg-brand-teal/[0.06] px-5 py-5 sm:px-6"
    >
      <h2 id="three-lines" className="font-display text-[clamp(1.25rem,3vw,1.5rem)] font-medium text-brand-paper">
        Your chart in {shown.length === 3 ? "three" : shown.length === 2 ? "two" : "one"} line{shown.length === 1 ? "" : "s"}
      </h2>
      <ol className="mt-3 space-y-3">
        {shown.map(([label, value, line], i) => (
          <li key={label} className="flex gap-3">
            <span className="mt-[2px] inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-teal font-sans text-[13px] font-semibold text-[#0d1b1a]">
              {i + 1}
            </span>
            <p className="text-[17px] leading-relaxed text-brand-paper">
              <span className="font-semibold text-brand-teal">{label}</span>
              {value ? <span className="text-brand-muted"> · {value}</span> : null}
              <br />
              {line}
            </p>
          </li>
        ))}
      </ol>
      <p className="mt-4 text-[15px] leading-relaxed text-brand-muted">
        Below: your chart and its tables, then{" "}
        <a href="#start-here" className="text-brand-teal underline decoration-brand-teal/40 underline-offset-4">
          Start here
        </a>
        , a short walk through it.
      </p>
    </section>
  );
}
