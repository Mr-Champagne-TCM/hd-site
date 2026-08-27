import { useState } from "react";
import BirthDateField from "./BirthDateField";
import PlaceField, { type Place } from "./PlaceField";
import Summary, { type SummaryData } from "../Summary";
import { ENTRY, PRIVACY_NOTE, SITE } from "../copy";
import { humanDate } from "./birthDate";

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

  const timeLooksRight = /^\d{1,2}:\d{2}(:\d{2})?$/.test(time.trim());
  const ready =
    !!date &&
    !!place &&
    timeKnown !== null &&
    (timeKnown === false || timeLooksRight) &&
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
          birth: {
            date,
            zone: place.zone,
            timeKnown,
            ...(timeKnown ? { time: time.trim() } : {}),
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
          {PRIVACY_NOTE}
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
          Another chart
        </button>
      </section>
    );
  }

  const field =
    "w-full rounded-xl border border-brand-gold/30 bg-ground-top/60 px-3 py-3 text-[17px] " +
    "text-brand-paper placeholder:text-brand-muted/50 focus:border-brand-teal focus:outline-none " +
    "focus:ring-2 focus:ring-brand-teal/40";

  return (
    <section id="yours" className="mx-auto max-w-5xl px-6 pt-20 sm:px-8">
      <h2 className="font-display text-[clamp(1.6rem,3.6vw,2rem)] font-medium leading-[1.18] tracking-tight text-brand-gold">
        {ENTRY.title}
      </h2>
      <p className="mt-3 max-w-[62ch] text-[17px] leading-relaxed text-brand-paper/85">
        {ENTRY.body}
      </p>

      <form onSubmit={submit} className="mt-8 max-w-[34rem] space-y-7">
        <BirthDateField value={date} onChange={setDate} />
        <PlaceField chosen={place} onChoose={setPlace} />

        <fieldset>
          <legend className="mb-2 font-sans text-[15px] font-semibold text-brand-paper">
            Time of birth
          </legend>

          <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-brand-gold/25 bg-ground-top/40 px-4 py-3">
            <input
              type="checkbox"
              checked={timeKnown === false}
              onChange={(e) => setTimeKnown(e.target.checked ? false : null)}
              className="mt-1 h-4 w-4 accent-[#3FE0C5]"
            />
            <span>
              <span className="text-[16px] text-brand-paper">{ENTRY.timeUnknownLabel}</span>
              <span className="mt-1 block text-[14px] leading-relaxed text-brand-muted">
                {ENTRY.timeUnknownHelp}
              </span>
            </span>
          </label>

          {timeKnown !== false && (
            <label className="mt-3 block">
              <span className="text-[14px] text-brand-muted">24-hour, as HH:MM</span>
              <input
                type="text"
                inputMode="numeric"
                placeholder="14:30"
                value={time}
                onChange={(e) => {
                  setTime(e.target.value);
                  setTimeKnown(e.target.value.trim() ? true : null);
                }}
                className={"mt-1 " + field}
              />
            </label>
          )}
        </fieldset>

        {state.at === "failed" && (
          <p className="rounded-xl border border-brand-gold/50 bg-brand-gold/[0.08] px-4 py-3 text-[15px] leading-relaxed text-brand-paper">
            {state.message}
          </p>
        )}

        <div>
          <button
            type="submit"
            disabled={!ready}
            className="rounded-full bg-brand-teal px-6 py-3.5 font-sans text-[16px] font-semibold text-[#0d1b1a] shadow-lg shadow-brand-teal/25 transition-all duration-200 hover:-translate-y-0.5 disabled:translate-y-0 disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none"
          >
            {state.at === "working" ? "Working…" : "My summary"}
          </button>
          <p className="mt-3 max-w-[52ch] text-[14px] leading-relaxed text-brand-muted">
            {PRIVACY_NOTE}
          </p>
        </div>
      </form>
    </section>
  );
}
