import { SITE } from "./copy";

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
          Human Design, plainly
        </a>
        , free in the library.
      </p>
    </div>
  );
}
