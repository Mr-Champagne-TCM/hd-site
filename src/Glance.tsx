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
import { TECH_HOW, TECH_TITLE_NOTE, techTitle } from "../shared/readingCopy.mjs";
import type { SummaryData } from "./Summary";
import type { Activation } from "./Activations";
import { fix } from "../shared/fixMock.mjs";
import { crossName } from "../shared/crossName.mjs";
import { gateList } from "../shared/gateList.mjs";
import { NOON_NOTE_A, NOON_NOTE_B } from "../shared/fixCopy.mjs";

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
    ["Incarnation cross", crossName(data.incarnationCross), crossLink(data.incarnationCross)],
    ["Defined centers", list(data.definedCenters, "None — Reflector"), CENTERS],
    // Absent on readings stored before the third state existed -- see readingPdf.
    ...(Array.isArray(data.undefinedCenters)
      ? ([["Undefined centers", list(data.undefinedCenters, "None"), CENTERS]] as Array<[string, string, string]>)
      : []),
    ["Open centers", list(data.openCenters, "None"), CENTERS],
    /**
     * CHANNELS AND ACTIVATED GATES, ON EVERY TIER (Jeremy 10/22: "gates/channels
     * go to summary (with no explanation)"). Values only: the channels as the
     * chart names them, the gates as numbers. A summary stored before 10/22
     * carries neither, so it gets no row rather than a "None" that would be
     * untrue (the 10/21 live test's "Channels: None"); a chart that truly has
     * no channel still says "None".
     */
    ...(Array.isArray(data.channels)
      ? ([["Channels", data.channels.length ? data.channels.join("\n") : "None", CHANNELS]] as Array<[string, string, string]>)
      : []),
    ...(Array.isArray(data.activatedGates)
      ? ([["Activated gates", gateList(data.activatedGates), CHANNELS]] as Array<[string, string, string]>)
      : []),
  ];
  // MOCK FIX 17A: with no birth time the centers and channels are marked provisional too.
  const valueProvisional = (label: string) =>
    fix("17A") && data.timeKnown === false && /centers$|^Channels$/.test(label);
  // MOCK FIX 17: one sentence for an unknown time, the same on the page, the PDF and the phone.
  const noonNote = fix("17A") ? NOON_NOTE_A : fix("17B") ? NOON_NOTE_B : data.note;

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
                {/* A bare value carries no period (W1: the summary's "Projector."); one with its sentence keeps it. */}
                {sentence ? `${value}.` : value}
                {sentence ? ` ${sentence}` : ""}
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

      {!data.timeKnown && noonNote && (
        <p className="mt-3 rounded-xl border border-brand-gold/30 bg-brand-gold/[0.06] px-4 py-3 text-[15px] leading-relaxed text-brand-paper/90">
          {noonNote}
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
            <dd className="whitespace-pre-line text-[16px] leading-relaxed text-brand-paper">
              {value}
              {valueProvisional(label) && (
                <span className="ml-2 align-middle text-[12px] uppercase tracking-[0.14em] text-brand-gold/80">
                  provisional
                </span>
              )}
            </dd>
          </div>
        ))}
      </dl>

      {/*
        FIX 6A (Jeremy 10/19): the planet numbers fold away, CLOSED, in place,
        named "Technical values ... (for the curious)" with a line on how to
        read them. A newcomer met "sun 21.5 · earth 48.5" with no meaning
        given; nothing here is needed to use the reading. The PDF prints the
        same grid under the same heading (a PDF cannot fold).
      */}
      {showActivations && sides.length > 0 && (
        <details className="mt-4 rounded-xl border border-brand-gold/25 bg-white/[0.02] px-4 py-3">
          <summary className="cursor-pointer select-none font-sans text-[14px] font-semibold text-brand-gold">
            {techTitle(sides.reduce((n: number, s: { list: Activation[] }) => n + s.list.length, 0))}{" "}
            <span className="font-normal text-brand-muted">{TECH_TITLE_NOTE}</span>
          </summary>
          <p className="mt-3 max-w-[62ch] text-[15px] leading-relaxed text-brand-paper/85">{TECH_HOW}</p>
          <dl className="mt-2">
            {sides.map((side: { key: string; label: string; list: Activation[] }) => (
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
        </details>
      )}
    </section>
  );
}
