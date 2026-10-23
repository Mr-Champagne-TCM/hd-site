import { AUTHORITY_GLANCE, PROFILE_GLANCE, TYPE_GLANCE } from "../shared/libraryGlance.mjs";
import { markedFields } from "../shared/timeSpread.mjs";
import { Tag, measuredSpread } from "./TimeSpread";

/**
 * FIX 1A (Jeremy 10/19): "Your chart in three lines", a plain way in at the
 * top of the result page, on a computer and on a phone. BELOW the chart the
 * page keeps today's order (his 1B half: the tables stay where they are).
 *
 * Nothing here is written by the model. The three lines are the library's
 * one-liners -- Jeremy's approved words, generated into
 * shared/libraryGlance.mjs -- picked by the chart's own values: Type,
 * Authority, Profile, on EVERY tier.
 *
 * CALL 2 = OPTION B (Jeremy, GO PDF 10/23): the reading tier's third row used
 * to be the reading's first try-this line, moved up whole, so the line printed
 * twice (here and in the list below), under a label ("Something to try this
 * week") that doubled every v3 line's own "This week,". Now the third row is
 * the profile's one-liner on the reading tier too, as on the summary and the
 * chart; the four try-this lines stay only in their own section.
 */

type Chart = {
  type?: string;
  authority?: string;
  profile?: string | number;
  provisional?: string[];
  bodygraphSvg?: string;
};

const GLANCE_TYPE = TYPE_GLANCE as Record<string, string>;
const GLANCE_AUTH = AUTHORITY_GLANCE as Record<string, string>;
/** The engine names "Ego Manifested" / "Ego Projected"; the library has one Ego line for both (10/22). */
const authorityGlance = (a: string) => GLANCE_AUTH[a] ?? (/^Ego\b/.test(a) ? GLANCE_AUTH.Ego : null) ?? null;
const GLANCE_PROFILE = PROFILE_GLANCE as Record<string, string>;

export default function ThreeLines({ chart, takeaways }: { chart: Chart; takeaways?: string[] | null }) {
  const profile = String(chart.profile ?? "").replace(/\s/g, "");
  const rows: Array<[string, string, string | null]> = [
    ["Your energy", chart.type ?? "", GLANCE_TYPE[chart.type ?? ""] ?? null],
    ["How you decide", chart.authority ?? "", authorityGlance(chart.authority ?? "")],
    ["How you meet the world", profile ? `Profile ${profile}` : "", GLANCE_PROFILE[profile] ?? null],
  ];
  const shown = rows.filter(([, , line]) => line);
  if (!shown.length) return null;
  /**
   * WITH NO BIRTH TIME the box marks the values that can move, as the table
   * below it already does (10/21 live test, bug 3: it stated Type, Authority
   * and Profile plainly while the table called them provisional).
   */
  const unsure = new Set(chart.provisional ?? []);
  // With a measured spread: only what really changes that day, and the tag beside the label (10/22).
  const measured = measuredSpread(chart) ? markedFields(chart) : null;
  const rowField: Record<string, string> = {
    "Your energy": "type",
    "How you decide": "authority",
    "How you meet the world": "profile",
  };
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
              {measured?.has(rowField[label]) && <Tag className="ml-2" />}
              {/* "Profile 6/2" keeps together, and the dot stays behind the label or its tag (a no-break
                  space before it): on a phone a lone "·" opened the next line (10/23 verbatim read, N19). */}
              {value ? (
                <span className="text-brand-muted">
                  {"\u00a0· "}
                  <span className="whitespace-nowrap">{value}</span>
                </span>
              ) : null}
              {!measured && unsure.has(rowField[label]) && (
                <span className="ml-2 align-middle text-[12px] uppercase tracking-[0.14em] text-brand-gold/80">
                  provisional
                </span>
              )}
              <br />
              {line}
            </p>
          </li>
        ))}
      </ol>
      {/* "Start here" exists only with a written reading; the chart tier's page has none to point at. */}
      <p className="mt-4 text-[15px] leading-relaxed text-brand-muted">
        {takeaways && takeaways.length ? (
          <>
            Below: your chart and its tables, then{" "}
            <a href="#start-here" className="text-brand-teal underline decoration-brand-teal/40 underline-offset-4">
              Start here
            </a>
            , a short walk through it.
          </>
        ) : chart.bodygraphSvg === undefined ? (
          // The summary has no drawing, so it does not promise one (W2, 10/21). It names what the
          // section below explains (10/22 verbatim read: "these three" read as the three lines above).
          "Below: your chart at a glance, and what Type, Strategy and Authority mean."
        ) : (
          "Below: your chart and its tables."
        )}
      </p>
    </section>
  );
}
