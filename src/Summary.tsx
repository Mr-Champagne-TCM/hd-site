/**
 * The summary, rendered.
 *
 * ONE component for the worked example on the offer page and for what a buyer
 * actually receives. They were briefly two, and two would have drifted: the
 * example is a promise about what arrives, and a promise rendered by different
 * code than the thing it promises is a promise nobody is checking.
 *
 * Takes the API's own shape, unchanged. No renaming on the way in — a field
 * called `notSelfTheme` on the wire is `notSelfTheme` here, so a change at the
 * boundary shows up as a missing value rather than as a silent blank.
 */

export type SummaryData = {
  type: string;
  strategy: string;
  authority: string;
  profile: string;
  definition: string;
  notSelfTheme: string;
  signature: string;
  incarnationCross: string;
  definedCenters: string[];
  openCenters: string[];
  timeKnown: boolean;
  note?: string;
  provisional?: string[];
};

/** Display label, and the field it comes from. Order is the reading order. */
const ROWS: ReadonlyArray<readonly [string, keyof SummaryData]> = [
  ["Type", "type"],
  ["Strategy", "strategy"],
  ["Authority", "authority"],
  ["Profile", "profile"],
  ["Definition", "definition"],
  ["Not-Self Theme", "notSelfTheme"],
  ["Signature", "signature"],
  ["Incarnation Cross", "incarnationCross"],
];

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1 px-5 py-3 sm:grid-cols-[13rem_1fr] sm:gap-4">
      <dt className="font-sans text-[14px] uppercase tracking-[0.12em] text-brand-muted/80">
        {label}
      </dt>
      <dd className="text-[17px] leading-snug text-brand-paper">{children}</dd>
    </div>
  );
}

export default function Summary({ data }: { data: SummaryData }) {
  // The API says which fields a noon assumption puts in doubt. Reading its list
  // rather than keeping a copy here means the two cannot disagree.
  const provisional = new Set(data.provisional ?? []);

  return (
    <div className="overflow-hidden rounded-2xl border border-brand-gold/25 bg-white/[0.04]">
      <dl className="divide-y divide-brand-gold/10">
        {ROWS.map(([label, field]) => (
          <Row key={label} label={label}>
            {String(data[field])}
            {provisional.has(field) && (
              <span className="ml-2 align-middle text-[12px] uppercase tracking-[0.14em] text-brand-gold/80">
                provisional
              </span>
            )}
          </Row>
        ))}
        <Row label="Defined centres">{data.definedCenters.join(" · ")}</Row>
        <Row label="Open centres">{data.openCenters.join(" · ")}</Row>
      </dl>

      {!data.timeKnown && data.note && (
        <p className="border-t border-brand-gold/20 bg-brand-gold/[0.06] px-5 py-4 text-[15px] leading-relaxed text-brand-paper/90">
          {data.note}
        </p>
      )}
    </div>
  );
}
