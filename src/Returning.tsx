import { useState, type ReactNode } from "react";
import ChartThumb from "./ChartThumb";
import { PRIVACY_NOTE, RETURNING } from "./copy";
import { TIERS, money } from "../shared/pricing.mjs";
import { correctionNote, grownNote } from "../shared/correctionNote.mjs";
import MailtoText from "./MailtoText";
import { customerText } from "../shared/customerMessages.mjs";
import { Tag } from "./TimeSpread";
import { HINT, hint } from "../shared/linkHints.mjs";

/**
 * THE RETURNING BUYER (release 2), the pieces more than one page uses:
 * the two cards under the question, the confirm screen after paying for an
 * upgrade, the calm notes on a reading, and "A chart for someone else" at the
 * end of a top-tier reading.
 *
 * Mock v2 (HD-Returning-Buyer-Flow-Mock-v2.pdf) accepted by Jeremy on 10/19,
 * with his two changes: the someone-else card says START A NEW chart for
 * someone else, on every screen it appears; and the library notes on the
 * summary and chart cards (App.tsx).
 */

export const btn =
  "inline-block rounded-full bg-brand-teal px-6 py-3 text-center font-sans text-[16px] font-semibold text-[#0d1b1a] shadow-lg shadow-brand-teal/25 transition-all duration-200 hover:-translate-y-0.5 disabled:translate-y-0 disabled:cursor-not-allowed disabled:opacity-40";
export const btnQuiet =
  "inline-block rounded-full border border-brand-teal/60 px-6 py-3 text-center font-sans text-[16px] text-brand-teal transition-colors hover:bg-brand-teal/10";
export const h1 =
  "font-display text-[clamp(1.7rem,4vw,2.25rem)] font-medium leading-[1.15] tracking-tight text-brand-gold";
export const linkCls =
  "text-brand-teal underline decoration-brand-teal/40 underline-offset-4 transition-colors hover:decoration-brand-teal";

const [SUMMARY, CHART, READING] = TIERS;

/** "The reading" -> "reading". */
export const tierWord = (tier: number) => (TIERS[tier]?.label ?? "The chart").replace(/^The\s+/i, "").toLowerCase();

/** "Alex’s" or "your". */
export const whoseOf = (whose: string | null | undefined, cap = false) =>
  whose ? `${whose}’s` : cap ? "Your" : "your";

/** Someone new: two soft overlapping circles -- two charts, side by side, each its own. */
function TwoCircles() {
  return (
    <svg viewBox="0 0 112 136" aria-hidden className="h-[103px] w-[84px] shrink-0 sm:h-[137px] sm:w-[112px]">
      <defs>
        <radialGradient id="r2g" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#E8CBA0" stopOpacity="0.42" />
          <stop offset="1" stopColor="#E8CBA0" stopOpacity="0.04" />
        </radialGradient>
        <radialGradient id="r2t" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#3FE0C5" stopOpacity="0.36" />
          <stop offset="1" stopColor="#3FE0C5" stopOpacity="0.04" />
        </radialGradient>
      </defs>
      <circle cx="42" cy="68" r="32" fill="url(#r2g)" stroke="#E8CBA0" strokeOpacity="0.7" strokeWidth="1.5" />
      <circle cx="70" cy="68" r="32" fill="url(#r2t)" stroke="#3FE0C5" strokeOpacity="0.7" strokeWidth="1.5" />
      <path d="M42 56 l4 8 -4 8 -4 -8z" fill="#E8CBA0" fillOpacity="0.85" />
      <path d="M70 56 l4 8 -4 8 -4 -8z" fill="#3FE0C5" fillOpacity="0.85" />
      <circle cx="20" cy="26" r="1.6" fill="#E8CBA0" />
      <circle cx="94" cy="22" r="1.2" fill="#3FE0C5" />
      <circle cx="98" cy="112" r="1.6" fill="#E8CBA0" />
      <circle cx="14" cy="108" r="1.2" fill="#F3EFF7" fillOpacity="0.7" />
    </svg>
  );
}

/** One of the two cards under the question: a picture, the words, then the price and the button. */
export function ChoiceCard({
  tone,
  picture,
  eyebrow,
  title,
  children,
  action,
}: {
  tone: "gold" | "teal";
  picture: ReactNode;
  eyebrow: string;
  title: string;
  children: ReactNode;
  action: ReactNode;
}) {
  const glow =
    tone === "gold"
      ? "radial-gradient(120% 70% at 0% 0%, rgba(232,203,160,0.16), transparent 60%)"
      : "radial-gradient(120% 70% at 0% 0%, rgba(63,224,197,0.12), transparent 60%)";
  return (
    <div
      data-card={tone === "teal" ? "someone-new" : "for-me"}
      className={
        "flex flex-col rounded-3xl border p-6 shadow-xl shadow-black/20 sm:p-7 " +
        (tone === "gold" ? "border-brand-gold/40" : "border-brand-teal/30")
      }
      style={{ backgroundImage: glow, backgroundColor: "rgba(255,255,255,0.035)" }}
    >
      <div className="flex items-center gap-4 sm:gap-5">
        {picture}
        <div>
          <p className="font-sans text-[13px] font-semibold uppercase tracking-[0.16em] text-brand-teal">{eyebrow}</p>
          <h2 className="mt-1.5 font-display text-[1.4rem] font-medium leading-[1.2] text-brand-paper sm:text-[1.6rem]">
            {title}
          </h2>
        </div>
      </div>
      {children}
      <div className="mt-auto pt-6">{action}</div>
    </div>
  );
}

/** The kept birth line, shown -- not asked for. */
export function KeptLine({ label = RETURNING.keptLabel, line }: { label?: string; line: string }) {
  return (
    <div className="mt-5 rounded-xl border border-brand-gold/20 bg-black/10 px-4 py-3">
      <p className="font-sans text-[12px] uppercase tracking-[0.14em] text-brand-muted/90">{label}</p>
      <p className="mt-1 text-[16px] leading-snug text-brand-paper">{line}</p>
    </div>
  );
}

/**
 * "START A NEW CHART FOR SOMEONE ELSE" -- Jeremy 10/19: "the for someone else
 * card needs to say something like start a new one for someone else, otherwise
 * it looks a bit like there are 2 charts accessible there."
 */
export function SomeoneNewCard({ onStart }: { onStart: () => void }) {
  return (
    <ChoiceCard
      tone="teal"
      picture={<TwoCircles />}
      eyebrow={RETURNING.someoneNewEyebrow}
      title={RETURNING.startNew}
      action={
        <button type="button" onClick={onStart} className={btnQuiet}>
          {RETURNING.startTheirs}
        </button>
      }
    >
      <p className="mt-5 text-[17px] leading-relaxed text-brand-paper/90">{RETURNING.someoneNewBody}</p>
      <p className="mt-5 flex flex-wrap items-baseline gap-2">
        <span className="font-sans text-[15px] text-brand-muted">from</span>
        <span className="font-display text-[2.1rem] leading-none text-brand-gold tabular-nums">{money(SUMMARY.cents)}</span>
      </p>
      <p className="mt-2 text-[15px] leading-snug text-brand-paper/85">
        The summary, the chart or the reading: {money(SUMMARY.cents)}, {money(CHART.cents)} or {money(READING.cents)}.
      </p>
      <p className="mt-2 text-[15px] leading-snug text-brand-teal">{RETURNING.staysWithYours}</p>
    </ChoiceCard>
  );
}

/** A calm notice at the top of a reading: the correction note, or "Your chart has grown". */
export function CalmNote({
  eyebrow,
  lead,
  body,
  learn,
}: {
  eyebrow: string;
  lead: string;
  body?: string;
  learn?: { label: string; href: string } | null;
}) {
  return (
    <div data-note={eyebrow} className="mt-6 rounded-2xl border border-brand-teal/40 bg-brand-teal/[0.07] px-5 py-4">
      <p className="font-sans text-[12px] font-semibold uppercase tracking-[0.16em] text-brand-teal">{eyebrow}</p>
      <p className="mt-2 text-[18px] leading-snug text-brand-paper">{lead}</p>
      {body && <p className="mt-3 text-[16px] leading-relaxed text-brand-paper/90">{body}</p>}
      {learn && (
        <p className="mt-3 text-[15px]">
          <a href={learn.href} {...hint(learn.label, HINT.library)} rel="noreferrer" className={linkCls}>
            {learn.label}
          </a>
        </p>
      )}
    </div>
  );
}

/** The notes a filled reading may carry, in order: grown, then the correction. */
export function ReadingNotes({
  grown,
  label,
  correction,
  tier,
}: {
  grown: { fromLabel: string | null } | null | undefined;
  label: string | null;
  correction: unknown;
  /** The page's tier: a birth time added says "your summary" / "your chart" / "your chart and your reading" (10/22). */
  tier?: number;
}) {
  const g = grown ? grownNote(grown.fromLabel, label) : null;
  const c = correctionNote(correction, { tier });
  return (
    <>
      {g && <CalmNote eyebrow={g.eyebrow} lead={g.lead} body={g.body} />}
      {c && <CalmNote eyebrow={c.eyebrow} lead={c.lead} body={c.body} learn={c.learn} />}
    </>
  );
}

/**
 * AFTER PAYING FOR AN UPGRADE: CONFIRM, DO NOT RETYPE (mock v2 step 2).
 * Three ways on (Jeremy p10: "Start a new chart for someone else (3rd
 * option?)"): make my reading, change a detail, start a new chart for
 * someone else.
 */
export function ConfirmKept({
  token,
  tier,
  whose,
  fromTier,
  birthLine,
  chart,
  chartParts = null,
  timeKnown = true,
  definedCenters,
  onChange,
  theirs = false,
}: {
  /** Someone else's chart ("Start a new chart for someone else"), grown: their details, their chart. */
  theirs?: boolean;
  token: string;
  tier: number;
  whose: string | null;
  fromTier: number | null;
  birthLine: string | null;
  chart: string | null;
  /** The same values, each marked when it changes during an unknown birth day (B2). */
  chartParts?: { text: string; provisional: boolean }[] | null;
  timeKnown?: boolean;
  definedCenters: string[];
  onChange: () => void;
}) {
  const [state, setState] = useState<{ at: "idle" | "working" } | { at: "failed"; message: string }>({ at: "idle" });

  async function confirm() {
    setState({ at: "working" });
    try {
      // NO BIRTH IN THE REQUEST: the server casts from the record's kept details.
      const res = await fetch("/api/chart", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reading: token, kept: true }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        setState({ at: "failed", message: body?.error?.message ?? customerText("chart-slow-paid") });
        return;
      }
      window.location.replace(`/r/${encodeURIComponent(token)}`);
    } catch {
      setState({
        at: "failed",
        message: "The connection dropped before that finished. Your purchase is safe — another try usually works.",
      });
    }
  }

  const what = tierWord(tier);
  const from = fromTier === null ? "chart" : tierWord(fromTier);
  return (
    <section id="yours" className="page-bottom mx-auto max-w-5xl px-6 pt-20 sm:px-8">
      <h2 className="font-display text-[clamp(1.6rem,3.6vw,2rem)] font-medium leading-[1.18] tracking-tight text-brand-gold">
        {whoseOf(whose, true)} {what}, from the {from} you already have
      </h2>
      <p className="mt-3 max-w-[62ch] text-[17px] leading-relaxed text-brand-paper/90">{theirs ? RETURNING.confirmBodyTheirs : RETURNING.confirmBody}</p>
      <div
        className="mt-6 flex max-w-[34rem] items-center gap-5 rounded-3xl border border-brand-gold/35 p-5"
        style={{ backgroundImage: "radial-gradient(120% 80% at 0% 0%, rgba(232,203,160,0.14), transparent 60%)" }}
      >
        <ChartThumb defined={definedCenters} size={92} label={`${whoseOf(whose, true)} chart, drawn small`} />
        <div>
          <p className="font-sans text-[12px] uppercase tracking-[0.14em] text-brand-muted/90">Born</p>
          <p className="mt-1 text-[16px] leading-snug text-brand-paper">{birthLine}</p>
          {chart && (
            <>
              <p className="mt-3 font-sans text-[12px] uppercase tracking-[0.14em] text-brand-muted/90">{theirs ? "Their chart" : "Your chart"}</p>
              <p className="mt-1 text-[16px] leading-snug text-brand-paper">
                {chartParts?.length
                  ? chartParts.map((p, i) => (
                      <span key={i}>
                        {i > 0 && " · "}
                        {p.text}
                        {p.provisional && (
                          <>
                            {" "}
                            <Tag />
                          </>
                        )}
                      </span>
                    ))
                  : chart}
              </p>
            </>
          )}
        </div>
      </div>
      <div className="mt-7 flex flex-col items-start gap-3 sm:flex-row sm:flex-wrap">
        <button type="button" onClick={confirm} disabled={state.at === "working"} className={btn}>
          {state.at === "working" ? "Working…" : theirs ? RETURNING.confirmYesTheirs(what) : RETURNING.confirmYes(what)}
        </button>
        <button type="button" onClick={onChange} className={btnQuiet}>
          {RETURNING.changeDetail}
        </button>
        <a href={`/u/${encodeURIComponent(token)}#new`} {...hint(RETURNING.startNew, HINT.someoneNew)} className={btnQuiet}>
          {RETURNING.startNew}
        </a>
      </div>
      {state.at === "failed" && (
        <p className="mt-6 max-w-[62ch] rounded-xl border border-brand-gold/50 bg-brand-gold/[0.08] px-4 py-3 text-[15px] leading-relaxed text-brand-paper">
          <MailtoText text={state.message} />
        </p>
      )}
      {/* No time to make "more exact": the line says how to add one (B2). */}
      <p className="mt-5 max-w-[62ch] text-[15px] leading-relaxed text-brand-muted">
        {theirs
          ? timeKnown ? RETURNING.confirmHelpTheirs : RETURNING.confirmHelpNoTimeTheirs
          : timeKnown ? RETURNING.confirmHelp : RETURNING.confirmHelpNoTime}
      </p>
      <p className="mt-4 max-w-[62ch] text-[15px] leading-relaxed text-brand-muted">
        {/* The one privacy sentence (copy.ts), here too. */}
        {PRIVACY_NOTE}
      </p>
    </section>
  );
}

/** Kept at the end of a top-tier reading, as Jeremy circled (mock v1 p15). */
export function SomeoneElseSection({ token }: { token: string }) {
  return (
    <section>
      <h2 className="font-display text-[20px] font-medium text-brand-paper">{RETURNING.someoneElseHeading}</h2>
      <p className="mt-2 max-w-[60ch] text-[16px] leading-relaxed text-brand-muted">{RETURNING.someoneElseBody}</p>
      <a href={`/u/${encodeURIComponent(token)}#new`} {...hint(RETURNING.startNew, HINT.someoneNew)} className={"mt-4 " + btnQuiet}>
        {RETURNING.startNew}
      </a>
    </section>
  );
}

