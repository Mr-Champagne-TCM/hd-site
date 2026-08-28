import { useMemo, useState } from "react";
import { MONTHS, clampDay, daysInMonth, toIso, typedDate } from "./birthDate";
import { warmEngine } from "./warm";

/**
 * A birth date, which is not the same problem as a date.
 *
 * Three parts on screen together, each picked directly. No calendar: for
 * somebody born in 1983 a calendar costs three navigations to reach a date they
 * know by heart.
 *
 * Native selects rather than custom columns, deliberately. They satisfy the
 * rules by construction rather than by code that could get them wrong: a select
 * opens ALREADY SCROLLED to its current value, it is the OS picker on a phone,
 * it takes keyboard and screen readers for free, and there is no scroll
 * position to compute. The app's custom columns exist because Compose has no
 * equivalent; the browser does.
 *
 * The month is NAMED. `06/07` is June 7 in the US and 6 July nearly everywhere
 * else -- a named month means that ambiguity cannot arise here at all.
 *
 * NOTHING IS PREFILLED, and that is the fix for a bug that looked like two.
 *
 * The first version opened showing January 1 1991 -- real-looking values that
 * had never been chosen. Two things went wrong at once. It offered a date
 * nobody entered, which is a wrong answer waiting to be submitted by anyone who
 * does not notice. And because no choice had been made, the form held no date,
 * so "My summary" stayed grey while every field on screen looked answered:
 * "I touched all the fields but kept the values and still no ungray... had to
 * change year away then back to get it active".
 *
 * Dashes fix both. An unchosen part reads as unchosen, and the button turns on
 * exactly when the last of the three is actually picked.
 */

const THIS_YEAR = new Date().getFullYear();

/** Nothing chosen yet. Not a value -- the absence of one. */
const NONE = "";

export default function BirthDateField({
  value,
  onChange,
}: {
  value: string;
  onChange: (iso: string) => void;
}) {
  /**
   * Each part is held separately, because a date is only a date once all three
   * exist. Deriving them from `value` cannot work: there is no ISO string that
   * means "March, no day, no year".
   */
  const parsed = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  const [year, setYear] = useState<number | null>(parsed ? Number(parsed[1]) : null);
  const [month, setMonth] = useState<number | null>(parsed ? Number(parsed[2]) : null);
  const [day, setDay] = useState<number | null>(parsed ? Number(parsed[3]) : null);

  const [typing, setTyping] = useState(false);
  const [typed, setTyped] = useState("");
  const [typedBad, setTypedBad] = useState(false);

  const years = useMemo(
    () => Array.from({ length: THIS_YEAR - 1900 + 1 }, (_, i) => THIS_YEAR - i),
    [],
  );

  /**
   * How many days to offer before the year is known.
   *
   * A leap year, so 29 February is never missing from the list. If the year
   * turns out not to be a leap year the day is clamped when the date is
   * assembled, which is the same rule that handles 31 January to February.
   */
  const days = useMemo(
    () => Array.from({ length: daysInMonth(year ?? 2000, month ?? 1) }, (_, i) => i + 1),
    [year, month],
  );

  /**
   * Publish only a COMPLETE date, and publish nothing otherwise.
   *
   * This is what keeps the submit button honest: it is enabled by the presence
   * of a date, so a partial answer must produce no date at all rather than a
   * plausible one built from defaults.
   */
  const commit = (y: number | null, m: number | null, d: number | null) => {
    setYear(y);
    setMonth(m);
    setDay(d);
    if (y === null || m === null || d === null) {
      if (value) onChange("");
      return;
    }
    onChange(toIso(y, m, clampDay(y, m, d)));
  };

  const onTyped = (raw: string) => {
    setTyped(raw);
    setTypedBad(false);
    const iso = typedDate(raw);
    // Only commit a complete, real date. Committing early would turn a
    // half-typed "0931" into a date while somebody is still mid-keystroke.
    if (iso) {
      const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso)!;
      commit(Number(m[1]), Number(m[2]), Number(m[3]));
      setTyped("");
      setTyping(false);
      return;
    }
    // Eight digits that did not make a date is a mistake worth naming, rather
    // than a field that silently ignores what was typed.
    if (raw.replace(/\D/g, "").length === 8) setTypedBad(true);
  };

  const select = (chosen: boolean) =>
    "w-full rounded-xl border bg-ground-top/60 px-3 py-3 text-[17px] " +
    "focus:border-brand-teal focus:outline-none focus:ring-2 focus:ring-brand-teal/40 " +
    (chosen
      ? "border-brand-gold/30 text-brand-paper"
      : "border-brand-gold/20 text-brand-muted");

  return (
    <fieldset>
      <legend className="mb-2 font-sans text-[15px] font-semibold text-brand-paper">
        Date of birth
      </legend>

      <div className="grid grid-cols-[1.4fr_0.8fr_1fr] gap-2">
        <label>
          <span className="sr-only">Month</span>
          <select
            className={select(month !== null)}
            value={month ?? NONE}
            onChange={(e) => {
              warmEngine();
              const v = e.target.value;
              commit(year, v === NONE ? null : Number(v), day);
            }}
          >
            <option value={NONE}>&mdash;</option>
            {MONTHS.map((name, i) => (
              <option key={name} value={i + 1}>
                {name}
              </option>
            ))}
          </select>
        </label>

        <label>
          <span className="sr-only">Day</span>
          <select
            className={select(day !== null)}
            value={day ?? NONE}
            onChange={(e) => {
              warmEngine();
              const v = e.target.value;
              commit(year, month, v === NONE ? null : Number(v));
            }}
          >
            <option value={NONE}>&mdash;</option>
            {days.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        </label>

        <label>
          <span className="sr-only">Year</span>
          <select
            className={select(year !== null)}
            value={year ?? NONE}
            onChange={(e) => {
              warmEngine();
              const v = e.target.value;
              commit(v === NONE ? null : Number(v), month, day);
            }}
          >
            <option value={NONE}>&mdash;&mdash;&mdash;&mdash;</option>
            {years.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </label>
      </div>

      {/*
        Typing is folded away rather than removed.

        The picker answers it for most people and a permanently visible second
        way to say the same thing reads as clutter -- Jeremy asked why it was
        even there. But the app's guidance is explicit that when somebody
        rattles the numbers off, typing beats any picker, and that is truest on
        a desktop keyboard. So it is one tap away and quiet until wanted.
      */}
      {!typing ? (
        <button
          type="button"
          onClick={() => setTyping(true)}
          className="mt-3 text-[14px] text-brand-teal underline decoration-brand-teal/40 underline-offset-4"
        >
          Type the date instead
        </button>
      ) : (
        <div className="mt-3">
          <label className="block">
            <span className="text-[14px] text-brand-muted">
              Month, day, then the four-digit year &mdash; 06251985 for 25 June 1985
            </span>
            <input
              inputMode="numeric"
              autoComplete="bday"
              autoFocus
              placeholder="MMDDYYYY"
              value={typed}
              onChange={(e) => onTyped(e.target.value)}
              className={
                "mt-1 w-full rounded-xl border bg-ground-top/60 px-3 py-2.5 text-[16px] " +
                "text-brand-paper placeholder:text-brand-muted/50 focus:outline-none focus:ring-2 " +
                (typedBad
                  ? "border-brand-gold focus:ring-brand-gold/40"
                  : "border-brand-gold/25 focus:border-brand-teal focus:ring-brand-teal/40")
              }
            />
          </label>
          {typedBad && (
            <p className="mt-1.5 text-[14px] leading-snug text-brand-gold">
              That is eight digits, but not a date that exists &mdash; month first, then day, then
              the four-digit year.
            </p>
          )}
          <button
            type="button"
            onClick={() => { setTyping(false); setTyped(""); setTypedBad(false); }}
            className="mt-2 text-[14px] text-brand-muted underline decoration-brand-muted/40 underline-offset-4"
          >
            Use the pickers
          </button>
        </div>
      )}

    </fieldset>
  );
}
