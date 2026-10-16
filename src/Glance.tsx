import { profileWithNames } from "./mechanics";
import { SIDES, activationLabel, planetName } from "../shared/planets.mjs";
import {
  AUTHORITY,
  CENTERS,
  CHANNELS,
  DEFINITION,
  crossLink,
  profileLink,
  typeLink,
} from "../shared/libraryLinks.mjs";
import type { SummaryData } from "./Summary";
import type { Activation } from "./Activations";

/**
 * "YOUR CHART AT A GLANCE", in the PDFs' order (Jeremy 10/16): the gold box of
 * six rows -- each the chart's value, then the READING'S OWN sentence about it
 * when there is a reading -- then the chart values, then the twenty-six
 * activations (reading tier only). One section, as page 2 of both PDFs is.
 *
 * Every label opens the library entry that explains it -- the same anchors the
 * PDFs link to (shared/libraryLinks.mjs, ported from the phone).
 */

type Props = {
  data: SummaryData & { personality?: Activation[]; design?: Activation[] };
  /** The reading's "IN SHORT" sentences, keyed Type/Strategy/Authority/Profile/Signature/Not-self. */
  says?: Record<string, string> | null;
  showActivations?: boolean;
};

const link = "transition-colors hover:text-brand-teal";

export default function Glance({ data, says = null, showActivations = false }: Props) {
  const provisional = new Set(data.provisional ?? []);
  const rows: Array<[string, string, string, string, keyof SummaryData]> = [
    ["Type", data.type, "Type", typeLink(data.type), "type"],
    ["Strategy", data.strategy, "Strategy", typeLink(data.type), "strategy"],
    ["Authority", data.authority, "Authority", AUTHORITY, "authority"],
    ["Profile", profileWithNames(String(data.profile)), "Profile", profileLink(data.profile), "profile"],
    ["When it's on track", data.signature ? `The feeling is ${String(data.signature).toLowerCase()}` : "", "Signature", typeLink(data.type), "signature"],
    ["When it's off track", data.notSelfTheme ? `The feeling is ${String(data.notSelfTheme).toLowerCase()}` : "", "Not-self", typeLink(data.type), "notSelfTheme"],
  ];

  const list = (v: string[] | undefined, none: string) => (v && v.length ? v.join(", ") : none);
  const values: Array<[string, string, string]> = [
    ["Definition", data.definition, DEFINITION],
    ["Incarnation cross", data.incarnationCross, crossLink(data.incarnationCross)],
    ["Defined centers", list(data.definedCenters, "None — Reflector"), CENTERS],
    // Absent on readings stored before the third state existed -- see readingPdf.
    ...(Array.isArray(data.undefinedCenters)
      ? ([["Undefined centers", list(data.undefinedCenters, "None"), CENTERS]] as Array<[string, string, string]>)
      : []),
    ["Open centers", list(data.openCenters, "None"), CENTERS],
    ["Channels", data.channels && data.channels.length ? data.channels.join("\n") : "None", CHANNELS],
  ];

  const sides = SIDES.map((s: { key: string; label: string; sub: string }) => ({
    ...s,
    list: ((s.key === "personality" ? data.personality : data.design) ?? []) as Activation[],
  })).filter((s: { list: Activation[] }) => s.list.length > 0);

  return (
    <section aria-labelledby="glance">
      <h2 id="glance" className="font-display text-[clamp(1.3rem,3vw,1.6rem)] font-medium tracking-tight text-brand-paper">
        Your chart at a glance
      </h2>

      <dl className="mt-4 overflow-hidden rounded-2xl border border-brand-gold/60 bg-white/[0.03]">
        {rows.map(([label, value, key, href, field], i) => {
          const sentence = says?.[key];
          return (
            <div
              key={label}
              className={
                "grid gap-1 px-5 py-3 sm:grid-cols-[11rem_1fr] sm:gap-4 " +
                (i ? "border-t border-brand-gold/15" : "")
              }
            >
              <dt className="pt-[3px] font-sans text-[12px] font-semibold uppercase tracking-[0.14em] text-brand-gold">
                <a href={href} rel="noreferrer" className={link}>
                  {label}
                </a>
              </dt>
              <dd className="text-[17px] leading-relaxed text-brand-paper">
                {value}.{sentence ? ` ${sentence}` : ""}
                {provisional.has(field) && (
                  <span className="ml-2 align-middle text-[12px] uppercase tracking-[0.14em] text-brand-gold/80">
                    provisional
                  </span>
                )}
              </dd>
            </div>
          );
        })}
      </dl>

      {!data.timeKnown && data.note && (
        <p className="mt-3 rounded-xl border border-brand-gold/30 bg-brand-gold/[0.06] px-4 py-3 text-[15px] leading-relaxed text-brand-paper/90">
          {data.note}
        </p>
      )}

      <h3 className="mt-8 border-b border-brand-gold/50 pb-2 font-sans text-[12px] font-semibold uppercase tracking-[0.18em] text-brand-gold">
        Your chart values
      </h3>
      <dl>
        {values.map(([label, value, href]) => (
          <div key={label} className="grid gap-1 border-b border-white/[0.06] py-3 sm:grid-cols-[11rem_1fr] sm:gap-4">
            <dt className="pt-[3px] font-sans text-[13px] uppercase tracking-[0.1em] text-brand-muted">
              <a href={href} rel="noreferrer" className={link}>
                {label}
              </a>
            </dt>
            <dd className="whitespace-pre-line text-[16px] leading-relaxed text-brand-paper">{value}</dd>
          </div>
        ))}
        {showActivations &&
          sides.map((side: { key: string; label: string; list: Activation[] }) => (
            <div key={side.key} className="grid gap-1 border-b border-white/[0.06] py-3 sm:grid-cols-[11rem_1fr] sm:gap-4">
              <dt className="pt-[3px] font-sans text-[13px] uppercase tracking-[0.1em] text-brand-muted">
                {side.key === "personality" ? "Personality" : "Design"}
              </dt>
              <dd className="grid grid-cols-2 gap-x-4 gap-y-1 text-[15px] min-[520px]:grid-cols-4">
                {side.list.map((a, i) => (
                  <span key={`${a.planet}-${i}`} className="whitespace-nowrap text-brand-paper/80">
                    {planetName(a.planet).toLowerCase()}{" "}
                    <strong className="font-semibold tabular-nums text-brand-paper">{activationLabel(a)}</strong>
                  </span>
                ))}
              </dd>
            </div>
          ))}
      </dl>
    </section>
  );
}
