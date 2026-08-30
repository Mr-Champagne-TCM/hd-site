import { SIDES, activationLabel, planetName } from "../shared/planets.mjs";

/**
 * The twenty-six activations, on the page.
 *
 * THE PDF HAD THESE FIRST, and only by a few minutes -- they had never existed
 * anywhere before that, despite being sold in every price table, on the offer
 * page and in every delivery email as "All twenty-six activations with the
 * planet behind each". Jeremy found the gap by buying his own reading with a
 * real card and reading all seven pages of it.
 *
 * IT IS HERE AS WELL AS IN THE PDF because of his earlier ruling about the
 * written interpretation: "Should have PDF content, in the page, then PDF'able
 * when they need." A deliverable whose only form is a download is one nobody
 * opens on a phone.
 *
 * THE NAMING IS SHARED with the PDF (../shared/planets.mjs) rather than copied.
 * Two tables would be two places for the engine's `NORTH_NODE` to escape from,
 * and only one of them would get fixed.
 */
export type Activation = { planet?: string; gate?: number | null; line?: number | null };

export default function Activations({
  personality,
  design,
}: {
  personality?: Activation[] | null;
  design?: Activation[] | null;
}) {
  const sides = SIDES.map((s) => ({
    ...s,
    list: (s.key === "personality" ? personality : design) ?? [],
  })).filter((s) => s.list.length > 0);

  /**
   * NOTHING RATHER THAN AN EMPTY FRAME. A chart with no activations is a
   * chart the engine answered oddly, and a heading over two blank columns
   * looks like the page failed rather than like there was nothing to show.
   */
  if (!sides.length) return null;

  const total = sides.reduce((n, s) => n + s.list.length, 0);

  return (
    <section className="mt-12 border-t border-brand-gold/15 pt-10">
      <h2 className="font-display text-[20px] font-medium text-brand-paper">
        Your {total === 26 ? "twenty-six" : total} activations
      </h2>
      <p className="mt-2 max-w-[62ch] text-[16px] leading-relaxed text-brand-muted">
        Every gate your chart activates, and the planet behind each one. Each number is
        a gate and the line within it — 6.2 is gate 6, line 2.
      </p>

      <div className="mt-6 grid gap-x-10 gap-y-8 sm:grid-cols-2">
        {sides.map((side) => (
          <div key={side.key}>
            <p className="font-sans text-[12px] uppercase tracking-[0.16em] text-brand-gold">
              {side.label}
            </p>
            <p className="mt-1 text-[14px] text-brand-muted">{side.sub}</p>
            <dl className="mt-3">
              {side.list.map((a, i) => (
                <div
                  key={`${a.planet}-${a.gate}-${a.line}-${i}`}
                  className="flex items-baseline justify-between gap-4 border-b border-brand-gold/10 py-[7px]"
                >
                  <dt className="text-[16px] text-brand-paper/85">{planetName(a.planet)}</dt>
                  <dd className="font-sans text-[16px] font-semibold tabular-nums text-brand-paper">
                    {activationLabel(a)}
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        ))}
      </div>
    </section>
  );
}
