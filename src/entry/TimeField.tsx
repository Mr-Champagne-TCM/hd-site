import { useState } from "react";
import { formatTimeInput, timeProblem, toTwentyFourHour, displayTime, type Meridiem } from "./time";
import { ENTRY } from "../copy";

/**
 * Time of birth.
 *
 * A NATIVE TIME INPUT, which on a phone is the operating system's own clock —
 * the dial on Android, the wheel on iOS. That is the control Jeremy already
 * likes in the app, and using the platform's own is better than rebuilding it:
 * it is the picker people have used a thousand times, it shows AM/PM or 24-hour
 * according to their device, and it hands back "HH:MM" in 24-hour form whatever
 * it displayed.
 *
 * It also makes the fault that blocked him impossible. The first version was a
 * text field wanting "HH:MM" with `inputMode="numeric"` — a number pad with no
 * colon on it, and no way forward once four digits were in. A native time input
 * has no colon to type.
 *
 * The typed fallback below is for anything that does not support it. Browsers
 * without `type="time"` show a plain text box, so the digits path is kept and
 * the colon is inserted after two of them rather than asked for.
 */

/** Does this browser give a real time control, or a text box wearing its name? */
function supportsNativeTime(): boolean {
  if (typeof document === "undefined") return false;
  const el = document.createElement("input");
  el.setAttribute("type", "time");
  // A browser that does not understand the type reports it as "text".
  return el.type === "time";
}

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
  const [native] = useState(supportsNativeTime);

  // Only used when the browser has no time control of its own.
  const [clock, setClock] = useState<12 | 24>(12);
  const [meridiem, setMeridiem] = useState<Meridiem>("AM");
  const [raw, setRaw] = useState("");
  const problem = timeProblem(raw, clock);
  const digits = raw.replace(/\D/g, "");

  const push = (nextRaw: string, nextClock: 12 | 24, nextMeridiem: Meridiem) => {
    setRaw(nextRaw);
    onChange(toTwentyFourHour(nextRaw, nextClock, nextMeridiem) ?? "");
  };

  const toggle = (active: boolean) =>
    "rounded-lg px-3 py-2 text-[15px] font-semibold transition-colors " +
    (active ? "bg-brand-teal text-[#0d1b1a]" : "text-brand-muted hover:text-brand-paper");

  const field =
    "w-full rounded-xl border bg-ground-top/60 px-3 py-3 text-[17px] text-brand-paper " +
    "placeholder:text-brand-muted/50 focus:outline-none focus:ring-2";

  return (
    <fieldset>
      <legend className="mb-2 font-sans text-[15px] font-semibold text-brand-paper">
        Time of birth
      </legend>

      <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-brand-gold/25 bg-ground-top/40 px-4 py-3">
        <input
          type="checkbox"
          checked={unknown}
          onChange={(e) => onUnknownChange(e.target.checked)}
          className="mt-1 h-4 w-4 accent-[#3FE0C5]"
        />
        <span>
          <span className="text-[16px] text-brand-paper">{ENTRY.timeUnknownLabel}</span>
          <span className="mt-1 block text-[14px] leading-relaxed text-brand-muted">
            {ENTRY.timeUnknownHelp}
          </span>
        </span>
      </label>

      {!unknown && (
        <div className="mt-3">
          {native ? (
            <>
              <label className="block">
                <span className="text-[14px] text-brand-muted">
                  Tap to open your usual clock
                </span>
                <input
                  type="time"
                  value={value}
                  onChange={(e) => onChange(e.target.value)}
                  // A birth time to the minute. Seconds are noise nobody has.
                  step={60}
                  className={
                    field +
                    " mt-1 border-brand-gold/30 focus:border-brand-teal focus:ring-brand-teal/40"
                  }
                />
              </label>
              {value && (
                <p className="mt-1.5 text-[14px] text-brand-muted">
                  {displayTime(value, 12)} &middot; {value} on a 24-hour clock
                </p>
              )}
            </>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <div className="inline-flex rounded-xl border border-brand-gold/25 bg-ground-top/40 p-1">
                  <button type="button" className={toggle(clock === 12)}
                    onClick={() => { setClock(12); push(raw, 12, meridiem); }}>
                    12-hour
                  </button>
                  <button type="button" className={toggle(clock === 24)}
                    onClick={() => { setClock(24); push(raw, 24, meridiem); }}>
                    24-hour
                  </button>
                </div>
                {clock === 12 && (
                  <div className="inline-flex rounded-xl border border-brand-gold/25 bg-ground-top/40 p-1">
                    {(["AM", "PM"] as const).map((m) => (
                      <button key={m} type="button" className={toggle(meridiem === m)}
                        onClick={() => { setMeridiem(m); push(raw, clock, m); }}>
                        {m}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <label className="mt-3 block">
                <span className="text-[14px] text-brand-muted">
                  Hour and minutes &mdash; the colon appears by itself
                </span>
                <input
                  type="text"
                  inputMode="numeric"
                  autoComplete="off"
                  placeholder={clock === 12 ? "3:17" : "14:30"}
                  value={raw}
                  onChange={(e) => push(formatTimeInput(e.target.value), clock, meridiem)}
                  className={
                    field +
                    " mt-1 " +
                    (problem
                      ? "border-brand-gold focus:ring-brand-gold/40"
                      : "border-brand-gold/30 focus:border-brand-teal focus:ring-brand-teal/40")
                  }
                />
              </label>
              {problem && (
                <p className="mt-1.5 text-[14px] leading-snug text-brand-gold">{problem}</p>
              )}
              {!problem && digits.length > 0 && digits.length < 4 && (
                <p className="mt-1.5 text-[14px] leading-snug text-brand-muted">
                  Four digits in all.
                </p>
              )}
            </>
          )}
        </div>
      )}
    </fieldset>
  );
}
