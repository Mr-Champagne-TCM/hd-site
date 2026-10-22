import { SITE } from "./copy";
import type { ReadingView } from "./StartHere";
import { AUTHORITY, CENTERS, DEFINITION, LIBRARY, crossLink, profileLink, typeLink } from "../shared/libraryLinks.mjs";
import Linked from "./Linked";
import CoachCard from "./CoachCard";
import { marginFields, markedFields } from "../shared/timeSpread.mjs";
import { Tag, measuredSpread } from "./TimeSpread";

/**
 * The written interpretation, on the page.
 *
 * Jeremy, looking at a tier-2 link that showed only the chart: "Should have PDF
 * content, in the page, then PDF'able when they need." He is right. A reading
 * whose only form is a download is a reading nobody opens on a phone, and the
 * PDF stops being the thing they keep and becomes the thing they have to fetch
 * before they can read anything at all.
 *
 * THE SERVER PARSES IT, not this. `interpretation.mjs` holds the prompt, and a
 * prompt shipped to every visitor is the product given away. What arrives here
 * is finished blocks -- a heading, a lede where there is one, and paragraphs.
 *
 * THE LAYOUT IS THE DOCUMENT'S, not a second design. Same order, same margin
 * notes, same lede-then-two-paragraphs shape, so somebody reading the page and
 * somebody holding the PDF are reading the same thing in the same order. Two
 * arrangements of one reading is two things to keep in step.
 */

export type Section = {
  heading: string;
  lede: string | null;
  paragraphs: string[];
};

export type Written = { summary: Record<string, string>; sections: Section[] };

/** The four that describe the chart's mechanics, in the document's order. */
const MECHANICS = [
  "Your incarnation cross",
  "Your definition",
  "Your channels",
  "Your profile lines",
];

const TAKEAWAYS = "Things to experiment with";

/**
 * A channel or profile line arrives as "term: sentence" -- the shape the prompt
 * fixes. Split on the FIRST colon so a sentence containing one survives, and
 * fall back to printing the line whole. A reading that came back slightly off
 * should look slightly off, never incomplete.
 */
function Termed({ line }: { line: string }) {
  const at = line.indexOf(":");
  if (at <= 0) {
    return <p className="text-[16px] leading-relaxed text-brand-paper/85">{line}</p>;
  }
  return (
    <div className="grid gap-1 sm:grid-cols-[14rem_1fr] sm:gap-5">
      <p className="text-[15px] leading-snug text-brand-paper">{line.slice(0, at).trim()}</p>
      <p className="text-[16px] leading-relaxed text-brand-muted">{line.slice(at + 1).trim()}</p>
    </div>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="font-sans text-[12px] uppercase tracking-[0.18em] text-brand-gold">
      {children}
    </h3>
  );
}

export default function WrittenReading({
  written,
  notes,
}: {
  written: Written;
  notes: Record<string, Array<[string, string]>>;
}) {
  const find = (h: string) => written.sections.find((s) => s.heading === h);
  const mechanics = MECHANICS.map(find).filter(Boolean) as Section[];
  const takeaways = find(TAKEAWAYS);
  const interpretation = written.sections.filter(
    (s) => !MECHANICS.includes(s.heading) && s.heading !== TAKEAWAYS,
  );

  return (
    <div className="mt-12 space-y-12">
      {mechanics.length > 0 && (
        <section>
          <h2 className="font-display text-[clamp(1.4rem,3vw,1.75rem)] font-medium tracking-tight text-brand-gold">
            The mechanics of your chart
          </h2>
          <div className="mt-6 space-y-7">
            {mechanics.map((s) => (
              <div key={s.heading}>
                <Label>{s.heading}</Label>
                <div className="mt-2 space-y-3">
                  {s.paragraphs.map((p, i) =>
                    s.heading === MECHANICS[2] || s.heading === MECHANICS[3] ? (
                      <Termed key={i} line={p} />
                    ) : (
                      <p key={i} className="text-[16px] leading-relaxed text-brand-paper/85">
                        {p}
                      </p>
                    ),
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {interpretation.length > 0 && (
        <section>
          <h2 className="font-display text-[clamp(1.4rem,3vw,1.75rem)] font-medium tracking-tight text-brand-gold">
            Your reading
          </h2>
          <div className="mt-6 space-y-10">
            {interpretation.map((s) => (
              <article
                key={s.heading}
                /*
                  The gold rule is the document's, moved to the left on a page
                  that scrolls. In print the margin sits beside the writing; on a
                  phone there is no beside, so the facts go under the section
                  they belong to rather than into a second column nobody can see.
                */
                className="border-l-2 border-brand-gold/40 pl-5"
              >
                <Label>{s.heading}</Label>
                {s.lede && (
                  <p className="mt-2 text-[19px] font-medium leading-snug text-brand-paper">
                    {s.lede}
                  </p>
                )}
                <div className="mt-3 space-y-3">
                  {s.paragraphs.map((p, i) => (
                    <p key={i} className="text-[16px] leading-relaxed text-brand-paper/85">
                      {p}
                    </p>
                  ))}
                </div>
                {(notes[s.heading]?.length ?? 0) > 0 && (
                  <dl className="mt-4 flex flex-wrap gap-x-8 gap-y-2">
                    {notes[s.heading].map(([k, v]) => (
                      <div key={k}>
                        <dt className="font-sans text-[11px] uppercase tracking-[0.16em] text-brand-gold/90">
                          {k}
                        </dt>
                        <dd className="text-[14px] leading-snug text-brand-muted">{v}</dd>
                      </div>
                    ))}
                  </dl>
                )}
              </article>
            ))}
          </div>
        </section>
      )}

      {takeaways && (
        <section>
          <h2 className="font-display text-[clamp(1.4rem,3vw,1.75rem)] font-medium tracking-tight text-brand-gold">
            {TAKEAWAYS}
          </h2>
          <div className="mt-4 space-y-3">
            {takeaways.paragraphs.map((p, i) => (
              <p key={i} className="text-[16px] leading-relaxed text-brand-paper/85">
                {p}
              </p>
            ))}
          </div>
        </section>
      )}

      {/*
        THE DISCLAIMER IS OURS, NOT THE MODEL'S -- the same constant the PDF
        prints. The validator refuses a reading without one, but what a reader
        is handed must not be a version the model reworded.
      */}
      <p className="text-[14px] leading-relaxed text-brand-muted">
        This reading describes a Human Design chart and is offered for
        self-reflection. It is not medical, psychological, legal or financial
        advice, and it does not predict the future.
      </p>

      <p className="text-[15px] leading-relaxed text-brand-muted">
        Every word in it is explained in{" "}
        <a
          href={SITE.hd101}
          rel="noreferrer"
          className="text-brand-teal underline decoration-brand-teal/40 underline-offset-4"
        >
          The Human Design library
        </a>
        , free.
      </p>
    </div>
  );
}

/* ==========================================================================
 * THE READING IN THE PDFs' ORDER (Jeremy 10/16) -- used whenever the server
 * sends a `view` (a reading that lays out the new way). Decision first, then
 * energy, how you meet the world, on/off track, the cross, the definition,
 * then the two center sections; the experiments; the disclaimer; the onward
 * note. Each section keeps its bold lead line; its chart facts follow it,
 * every label opening its library entry as the PDF margin's labels do.
 * ========================================================================== */


/** The library entry behind a margin label -- the phone's noteHref. */
function noteHref(label: string, chart: { type?: string; profile?: string; incarnationCross?: string }) {
  if (label.endsWith("AUTHORITY")) return AUTHORITY;
  if (label === "CENTER") return CENTERS;
  if (label === "DEFINITION") return DEFINITION;
  if (label.startsWith("PROFILE")) return profileLink(chart.profile);
  if (label === "INCARNATION CROSS") return crossLink(chart.incarnationCross);
  if (label.includes("TRACK") || label === String(chart.type ?? "").toUpperCase()) return typeLink(chart.type);
  return null;
}

/** With an unknown birth time: does this margin note's value change during the birth day (10/22)? */
function noteTagged(label: string, chart: unknown) {
  if (!measuredSpread(chart)) return false;
  const marked = markedFields(chart);
  return marginFields(label, chart).some((f: string) => marked.has(f));
}

export function ReadingInOrder({
  v,
  notes,
  chart,
}: {
  v: ReadingView;
  notes: Record<string, Array<[string, string]>>;
  chart: { type?: string; profile?: string; incarnationCross?: string; channels?: string[] };
}) {
  const feature = /^\((.+?)\)\s*([\s\S]+)$/;
  const [intro, ...items] = v.takeaways;
  return (
    <div className="space-y-12">
      <section aria-labelledby="your-reading">
        <h2 id="your-reading" className="font-display text-[clamp(1.3rem,3vw,1.6rem)] font-medium tracking-tight text-brand-paper">
          Your reading
        </h2>
        <div className="mt-6 space-y-10">
          {v.reading.map((s) => (
            <article key={s.heading} className="border-l-2 border-brand-gold/40 pl-5">
              <Label>{s.heading}</Label>
              {s.lede && (
                <p className="mt-2 text-[19px] font-semibold leading-snug text-brand-paper">
                  <Linked text={s.lede} chart={chart} />
                </p>
              )}
              <div className="mt-3 space-y-3">
                {s.paragraphs.map((p, i) => (
                  <p key={i} className="text-[16px] leading-relaxed text-brand-paper/85">
                    {/* FIX 7 (10/19): the Human Design words open the library. */}
                    <Linked text={p} chart={chart} />
                  </p>
                ))}
              </div>
              {(notes[s.heading]?.length ?? 0) > 0 && (
                <dl className="mt-4 flex flex-wrap gap-x-8 gap-y-2">
                  {notes[s.heading].map(([k, val]) => {
                    const href = noteHref(k, chart);
                    const label = k.replace(/\n/g, " ");
                    return (
                      <div key={k}>
                        <dt className="font-sans text-[11px] font-semibold uppercase tracking-[0.16em] text-brand-gold/90">
                          {href ? (
                            <a href={href} rel="noreferrer" className="transition-colors hover:text-brand-teal">
                              {label}
                            </a>
                          ) : (
                            label
                          )}
                          {noteTagged(k, chart) && <Tag className="block font-semibold" />}
                        </dt>
                        <dd className="text-[14px] leading-snug text-brand-muted">{val}</dd>
                      </div>
                    );
                  })}
                </dl>
              )}
            </article>
          ))}
        </div>
      </section>

      {v.takeaways.length > 0 && (
        <section aria-labelledby="experiments">
          <h2 id="experiments" className="font-display text-[clamp(1.3rem,3vw,1.6rem)] font-medium tracking-tight text-brand-gold">
            {TAKEAWAYS}
          </h2>
          {intro && (
            <p className="mt-3 text-[16px] leading-relaxed text-brand-paper/85">
              <Linked text={intro} chart={chart} />
            </p>
          )}
          <ul className="mt-4 space-y-4">
            {items.map((p, i) => {
              const m = feature.exec(p);
              return (
                <li key={i} className="relative pl-6">
                  <span aria-hidden className="absolute left-0 top-[0.8em] h-[2px] w-3 bg-brand-gold" />
                  {m && <p className="text-[17px] font-semibold text-brand-gold">{m[1]}</p>}
                  <p className="text-[17px] leading-relaxed text-brand-paper/90">
                    <Linked text={m ? m[2] : p} chart={chart} />
                  </p>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {/* FIX 10B (10/19): the coaching card ends the reading, before its disclaimer, as in the PDF. */}
      <CoachCard />

      <p className="border-t border-white/10 pt-4 text-[14px] leading-relaxed text-brand-muted">{v.disclaimer}</p>

      {/* The PDFs' onward note: both free pages, as an invitation. */}
      <p className="text-[15px] leading-relaxed text-brand-muted">
        Every word above is explained in{" "}
        <a href={LIBRARY} rel="noreferrer" className="text-brand-teal underline decoration-brand-teal/40 underline-offset-4">
          The Human Design library
        </a>
        , and the drawing at the top in{" "}
        <a href={SITE.bodygraph} rel="noreferrer" className="text-brand-teal underline decoration-brand-teal/40 underline-offset-4">
          “Reading your bodygraph.”
        </a>{" "}
        Both are free.
      </p>
    </div>
  );
}
