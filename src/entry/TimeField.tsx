import { useState } from "react";
import { displayTime } from "./time";
import { ENTRY } from "../copy";
import ClockDial from "./ClockDial";

/**
 * Time of birth.
 *
 * A clock BUTTON that opens OUR OWN dial -- see ClockDial for why the native
 * one was ruled out. In short: no visible AM/PM highlight, buttons running off
 * the edge of the screen, no way to fix the minutes without redoing the hour,
 * and typing hidden behind an icon.
 *
 * The history here is worth keeping, because the first version was worse than
 * either. It was a text field wanting "HH:MM" with `inputMode="numeric"` -- a
 * number pad with no colon on it. Four digits in and there was no way forward
 * at all, which is where Jeremy stopped. Whatever replaces it, the test is that
 * every value it demands can actually be entered with the keyboard it summons.
 *
 * The dial passes that test by not summoning one: the value is chosen by tapping
 * a face, and the two number boxes accept digits only.
 */

export default function TimeField({
  value,
  onChange,
  unknown,
  onUnknownChange,
}: {
  /** "HH:MM" in 24-hour form, or "" while incomplete. */
  value: string;
  onChange: (hhmm: string) => void;
  unknown: boolean;
  onUnknownChange: (unknown: boolean) => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <fieldset>
      <legend className="mb-2 font-sans text-[15px] font-semibold text-brand-paper">
        Time of birth
      </legend>

      {!unknown && (
        <div>
          {/*
            A button with a clock face on it.

            The version before this was a bare input under the words "tap to
            open your usual clock" -- an instruction standing in for an
            affordance, which is what an unclear control always needs.
          */}
          <button
            type="button"
            onClick={() => setOpen(true)}
            className={
              "flex w-full items-center gap-3 rounded-xl border px-4 py-3.5 text-left transition-colors " +
              (value
                ? "border-brand-teal/60 bg-brand-teal/[0.07]"
                : "border-brand-gold/30 bg-ground-top/60 hover:border-brand-gold/50")
            }
          >
            <svg
              aria-hidden
              viewBox="0 0 24 24"
              className={"h-6 w-6 shrink-0 " + (value ? "text-brand-teal" : "text-brand-muted")}
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
            >
              <circle cx="12" cy="12" r="9" />
              <path d="M12 7v5l3.2 1.9" />
            </svg>
            <span className={"text-[17px] " + (value ? "text-brand-paper" : "text-brand-muted")}>
              {value ? displayTime(value, 12) : "Choose the time"}
            </span>
            <span className="ml-auto text-[14px] text-brand-teal">
              {value ? "Change" : "Open clock"}
            </span>
          </button>

          {value && (
            <p className="mt-1.5 text-[14px] text-brand-muted">
              {displayTime(value, 12)} &middot; {value} on a 24-hour clock
            </p>
          )}

          {open && (
            <ClockDial
              value={value}
              onSet={(hhmm) => {
                onChange(hhmm);
                setOpen(false);
              }}
              onCancel={() => setOpen(false)}
            />
          )}
        </div>
      )}

      {/*
        "I don't know" comes AFTER the clock, and the order is the argument.

        Leading with it put the way out first and made failure the default
        reading of the field -- as Jeremy put it, it "implies you expect failure
        and cover that first". Most people know their birth time. So the clock is
        offered first, to somebody assumed to have an answer, and the fallback
        waits underneath for the ones who do not.
      */}
      <label className="mt-4 flex cursor-pointer items-start gap-3">
        <input
          type="checkbox"
          checked={unknown}
          onChange={(e) => onUnknownChange(e.target.checked)}
          className="mt-0.5 h-4 w-4 accent-[#3FE0C5]"
        />
        <span>
          <span className="text-[15px] text-brand-muted">{ENTRY.timeUnknownLabel}</span>
          {unknown && (
            <span className="mt-1 block text-[14px] leading-relaxed text-brand-muted">
              {ENTRY.timeUnknownHelp}
            </span>
          )}
        </span>
      </label>
    </fieldset>
  );
}
