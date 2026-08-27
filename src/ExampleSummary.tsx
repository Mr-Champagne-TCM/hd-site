/**
 * The worked example.
 *
 * A real response from the real engine, for an invented birth moment, rendered
 * exactly as a buyer's own will be — including the noon note, because a chart
 * cast without a time announces itself and a visitor should see that happen
 * before they pay rather than after.
 *
 * Hard-coded on purpose. Calling the live endpoint for this would spend a rate
 * limit slot and a machine wake on every visitor who scrolls past, to render an
 * answer that never changes. It was taken from a genuine call on 2026-08-27 and
 * is refreshed by hand if the shape ever changes.
 *
 * NOT Jeremy's own chart, deliberately. His cross is his.
 */
const EXAMPLE = {
  type: "Manifesting Generator",
  strategy: "Wait to respond, then inform",
  authority: "Sacral",
  profile: "1/3",
  definition: "Split",
  notSelfTheme: "Frustration",
  signature: "Satisfaction",
  incarnationCross: "Right Angle Cross of Service (52/58 | 17/18)",
  definedCenters: ["Ajna", "Throat", "G", "Sacral", "Spleen", "Root"],
  openCenters: ["Head", "Heart", "Solar Plexus"],
  timeKnown: false,
  chartedAt: "noon local",
  note: "Birth time unknown - charted at noon. Treat Type, Authority and Profile as provisional.",
  provisional: ["type", "strategy", "authority", "profile", "notSelfTheme", "signature"],
} as const;

const ROWS: ReadonlyArray<readonly [string, string, boolean]> = [
  ["Type", EXAMPLE.type, true],
  ["Strategy", EXAMPLE.strategy, true],
  ["Authority", EXAMPLE.authority, true],
  ["Profile", EXAMPLE.profile, true],
  ["Definition", EXAMPLE.definition, false],
  ["Not-Self Theme", EXAMPLE.notSelfTheme, true],
  ["Signature", EXAMPLE.signature, true],
  ["Incarnation Cross", EXAMPLE.incarnationCross, false],
];

export default function ExampleSummary() {
  return (
    <div className="overflow-hidden rounded-2xl border border-brand-gold/25 bg-white/[0.04]">
      <dl className="divide-y divide-brand-gold/10">
        {ROWS.map(([label, value, provisional]) => (
          <div key={label} className="grid gap-1 px-5 py-3 sm:grid-cols-[13rem_1fr] sm:gap-4">
            <dt className="font-sans text-[14px] uppercase tracking-[0.12em] text-brand-muted/80">
              {label}
            </dt>
            <dd className="text-[17px] leading-snug text-brand-paper">
              {value}
              {provisional && !EXAMPLE.timeKnown && (
                <span className="ml-2 align-middle text-[12px] uppercase tracking-[0.14em] text-brand-gold/80">
                  provisional
                </span>
              )}
            </dd>
          </div>
        ))}

        <div className="grid gap-1 px-5 py-3 sm:grid-cols-[13rem_1fr] sm:gap-4">
          <dt className="font-sans text-[14px] uppercase tracking-[0.12em] text-brand-muted/80">
            Defined centres
          </dt>
          <dd className="text-[17px] leading-snug text-brand-paper">
            {EXAMPLE.definedCenters.join(" · ")}
          </dd>
        </div>
        <div className="grid gap-1 px-5 py-3 sm:grid-cols-[13rem_1fr] sm:gap-4">
          <dt className="font-sans text-[14px] uppercase tracking-[0.12em] text-brand-muted/80">
            Open centres
          </dt>
          <dd className="text-[17px] leading-snug text-brand-paper">
            {EXAMPLE.openCenters.join(" · ")}
          </dd>
        </div>
      </dl>

      {/* The noon note, shown exactly where and how a real one appears. */}
      {!EXAMPLE.timeKnown && (
        <p className="border-t border-brand-gold/20 bg-brand-gold/[0.06] px-5 py-4 text-[15px] leading-relaxed text-brand-paper/90">
          {EXAMPLE.note}
        </p>
      )}
    </div>
  );
}
