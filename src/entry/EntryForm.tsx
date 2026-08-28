import { useEffect, useRef, useState } from "react";
import BirthDateField from "./BirthDateField";
import PlaceField, { type Place } from "./PlaceField";
import TimeField from "./TimeField";
import Summary, { type SummaryData } from "../Summary";
import { ENTRY, privacyFor, SITE } from "../copy";
import { humanDate } from "./birthDate";
import { TIERS } from "../../shared/pricing.mjs";
import { warmEngine } from "./warm";
import { claimIfReturning, heldGrant, ownedNow } from "../purchase";

/**
 * The way in.
 *
 * Nothing is asked for before the price has been shown — the offer, the worked
 * example and the three prices all sit above this on the page.
 *
 * Time is three-way, not two: given, explicitly unknown, or not yet said. The
 * app makes the same distinction, and for the same reason — somebody who simply
 * has not reached the field yet must not be told a chart was cast at noon on
 * their behalf.
 */

/**
 * A labelled rule, used to fence the questions top and bottom.
 *
 * The closing one takes `done` and answers the actual question being asked --
 * "am I finished?" -- rather than only marking a boundary. Until every field is
 * answered it stays quiet; once they are it turns teal and says so. That is the
 * same information the submit button already carries in its enabled state, put
 * where somebody scanning down the page will meet it first.
 */
function Rule({ label, done }: { label: string; done?: boolean }) {
  return (
    <div className="flex items-center gap-3" aria-hidden>
      <span
        className={
          "h-px flex-1 " + (done ? "bg-brand-teal/40" : "bg-brand-gold/20")
        }
      />
      <span
        className={
          "font-sans text-[12px] uppercase tracking-[0.18em] " +
          (done ? "text-brand-teal" : "text-brand-muted/70")
        }
      >
        {done ? "Ready" : label}
      </span>
      <span
        className={
          "h-px flex-1 " + (done ? "bg-brand-teal/40" : "bg-brand-gold/20")
        }
      />
    </div>
  );
}

/**
 * Which promise this form is allowed to make.
 *
 * This is the summary path, tier 0, and tier 0 genuinely keeps nothing. The
 * paid paths pass their own tier and get the sentence that is true for them --
 * the seam is here rather than added later, because a privacy sentence chosen
 * by hand at three call sites is one that will eventually be wrong at one of
 * them.
 */
const TIER = 0;

type State =
  | { at: "asking" }
  | { at: "working" }
  | { at: "done"; summary: SummaryData }
  | { at: "failed"; message: string };

export default function EntryForm() {
  const [date, setDate] = useState("");
  const [place, setPlace] = useState<Place | null>(null);
  const [timeKnown, setTimeKnown] = useState<boolean | null>(null);
  const [time, setTime] = useState("");
  const [state, setState] = useState<State>({ at: "asking" });

  /**
   * Catch somebody coming back from Stripe.
   *
   * They return to this page with a session id in the URL. It is handed
   * straight to the server, which asks Stripe whether it was really paid for --
   * the id itself proves nothing. On the way through, the parameter is stripped
   * from the address bar, so a reload does not re-claim and a shared link does
   * not carry a purchase.
   *
   * Runs once, and says something either way. A payment that succeeded in
   * silence is indistinguishable from one that failed.
   */
  const [purchase, setPurchase] = useState<
    { ok: true; level: number } | { ok: false; message: string } | null
  >(null);
  /**
   * What is owned right now, which OUTLIVES the banner.
   *
   * The banner is driven by the ?paid= parameter, and that parameter is
   * stripped on first load so a reload cannot re-claim. Reported exactly as it
   * behaved: "I got a payment received banner, but I clicked refresh and it
   * went away." The entitlement was fine; nothing on screen said so.
   */
  const [owned, setOwned] = useState(() => ownedNow());
  useEffect(() => {
    claimIfReturning().then((r) => {
      if (r) setPurchase(r);
      setOwned(ownedNow());
    });
  }, []);

  /**
   * Wake the engine when the form is OFFERED, not when it is touched.
   *
   * Asked for directly: "ready at load to start typing, not after click into
   * field". Warming on first touch still spent the cold start on somebody who
   * was already there -- they answer the date and reach the place field within
   * seconds, and the machine is still starting.
   *
   * Scrolling this section into view happens well before any of that, and it is
   * the earliest moment that still means something: a visitor who never reaches
   * the form never wakes anything, and neither does a crawler that only reads
   * the top of the page. Firing on page load would wake it for both.
   */
  const section = useRef<HTMLElement>(null);
  useEffect(() => {
    const el = section.current;
    if (!el || typeof IntersectionObserver === "undefined") {
      // No observer to lean on: wake it now rather than not at all.
      warmEngine();
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          warmEngine();
          io.disconnect();
        }
      },
      // A little before it arrives, so the head start is real.
      { rootMargin: "400px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  // TimeField hands back a complete 24-hour "HH:MM" or an empty string, so
  // there is nothing to re-validate here -- a second opinion about the same
  // string is how the two come to disagree.
  const timeReady = /^\d{2}:\d{2}$/.test(time);
  const ready =
    !!date &&
    !!place &&
    (timeKnown === false || timeReady) &&
    state.at !== "working";

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!ready || !place) return;
    setState({ at: "working" });
    try {
      const res = await fetch("/api/chart", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          grant: heldGrant() ?? undefined,
          birth: {
            date,
            zone: place.zone,
            timeKnown: timeKnown !== false,
            ...(timeKnown !== false ? { time } : {}),
          },
        }),
      });
      const body = await res.json();
      if (!res.ok) {
        // The edge and the engine both write messages meant for a person to
        // read, so they are shown rather than reworded.
        setState({
          at: "failed",
          message:
            body?.error?.message ??
            "That did not go through. Nothing was charged — another try usually works.",
        });
        return;
      }
      setState({ at: "done", summary: body as SummaryData });
    } catch {
      setState({
        at: "failed",
        message:
          "The connection dropped before that finished. Nothing was charged, and your details " +
          "were not stored.",
      });
    }
  }

  if (state.at === "done") {
    return (
      <section id="yours" className="mx-auto max-w-5xl px-6 pt-20 sm:px-8">
        <h2 className="font-display text-[clamp(1.6rem,3.6vw,2rem)] font-medium leading-[1.18] tracking-tight text-brand-gold">
          {humanDate(date)}
          {place ? `, ${place.label}` : ""}
        </h2>
        <p className="mt-3 max-w-[60ch] text-[16px] leading-relaxed text-brand-muted">
          {privacyFor(TIER)}
        </p>
        <div className="mt-6 max-w-[46rem]">
          <Summary data={state.summary} />
        </div>
        <p className="mt-4 text-[15px] leading-relaxed text-brand-muted">
          Every word in it is explained in{" "}
          <a
            href={SITE.hd101}
            className="text-brand-teal underline decoration-brand-teal/40 underline-offset-4 transition-colors hover:decoration-brand-teal"
          >
            Human Design, plainly
          </a>
          , free in the library.
        </p>
        <button
          type="button"
          onClick={() => setState({ at: "asking" })}
          className="mt-6 text-[15px] text-brand-teal underline decoration-brand-teal/40 underline-offset-4"
        >
          {ENTRY.restart}
        </button>
      </section>
    );
  }

  const field =
    "w-full rounded-xl border border-brand-gold/30 bg-ground-top/60 px-3 py-3 text-[17px] " +
    "text-brand-paper placeholder:text-brand-muted/50 focus:border-brand-teal focus:outline-none " +
    "focus:ring-2 focus:ring-brand-teal/40";

  return (
    <section ref={section} id="yours" className="mx-auto max-w-5xl px-6 pt-20 sm:px-8">
      <h2 className="font-display text-[clamp(1.6rem,3.6vw,2rem)] font-medium leading-[1.18] tracking-tight text-brand-gold">
        {ENTRY.title}
      </h2>
      <p className="mt-3 max-w-[62ch] text-[17px] leading-relaxed text-brand-paper/85">
        {ENTRY.body}
      </p>

      {purchase?.ok === true && (
        <p className="mt-5 rounded-xl border border-brand-teal/40 bg-brand-teal/[0.08] px-4 py-3 text-[15px] leading-relaxed text-brand-paper">
          Payment received, thank you. Your details below, and it is yours.
        </p>
      )}
      {purchase?.ok !== true && owned && (
        <p className="mt-5 rounded-xl border border-brand-teal/25 bg-brand-teal/[0.05] px-4 py-3 text-[15px] leading-relaxed text-brand-paper">
          {TIERS[owned.level] ? `You have ${TIERS[owned.level].label.replace(/^The /, "the ")}` : "Purchase held"}
          , paid for on this device. It stays with this tab.
        </p>
      )}
      {purchase?.ok === false && (
        <p className="mt-5 rounded-xl border border-brand-gold/50 bg-brand-gold/[0.08] px-4 py-3 text-[15px] leading-relaxed text-brand-paper">
          {purchase.message}
        </p>
      )}

      <form onSubmit={submit} className="mt-8 max-w-[34rem]">
        {/*
          A top and a bottom on the asking.

          Three fields in a column have no edge: nothing marks where the
          questions begin, and nothing marks where they stop, so somebody who
          has answered all three still has to guess whether more is coming.
          A labelled rule at each end draws that boundary, and the closing one
          says so in words rather than leaving it to be inferred from whitespace.
        */}
        <Rule label={ENTRY.startRule} />

        <div className="space-y-7 py-7">
          <BirthDateField value={date} onChange={setDate} />
          <PlaceField chosen={place} onChoose={setPlace} />

          <TimeField
            value={time}
            onChange={setTime}
            unknown={timeKnown === false}
            onUnknownChange={(u) => {
              setTimeKnown(u ? false : null);
              if (u) setTime("");
            }}
          />
        </div>

        <Rule label={ENTRY.endRule} done={ready} />

        {state.at === "failed" && (
          <p className="mt-6 rounded-xl border border-brand-gold/50 bg-brand-gold/[0.08] px-4 py-3 text-[15px] leading-relaxed text-brand-paper">
            {state.message}
          </p>
        )}

        <div className="mt-7">
          <button
            type="submit"
            disabled={!ready}
            className="rounded-full bg-brand-teal px-6 py-3.5 font-sans text-[16px] font-semibold text-[#0d1b1a] shadow-lg shadow-brand-teal/25 transition-all duration-200 hover:-translate-y-0.5 disabled:translate-y-0 disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none"
          >
            {state.at === "working" ? "Working…" : "My summary"}
          </button>
          <p className="mt-3 max-w-[52ch] text-[14px] leading-relaxed text-brand-muted">
            {privacyFor(TIER)}
          </p>
        </div>
      </form>
    </section>
  );
}
