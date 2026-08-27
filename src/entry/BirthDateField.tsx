import { useMemo, useState } from "react";
import { MONTHS, clampDay, daysInMonth, splitDate, toIso, typedDate } from "./birthDate";

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
 * else — a named month means that ambiguity cannot arise here at all. A numeric
 * month would put the bug back.
 *
 * Typing stays available underneath, because when somebody rattles the numbers
 * off, typing beats any picker.
 */

const THIS_YEAR = new Date().getFullYear();

export default function BirthDateField({
  value,
  onChange,
}: {
  value: string;
  onChange: (iso: string) => void;
}) {
  // Nobody being read was born this year. An empty field opens about
  // thirty-five years back rather than at today or at 1900 — a year list
  // starting at 1900 when someone was born in 1983 is a calendar with extra
  // steps.
  const [year, month, day] = splitDate(value, THIS_YEAR - 35);

  const [typed, setTyped] = useState("");
  const [typedBad, setTypedBad] = useState(false);

  const years = useMemo(
    () => Array.from({ length: THIS_YEAR - 1900 + 1 }, (_, i) => THIS_YEAR - i),
    [],
  );
  const days = useMemo(
    () => Array.from({ length: daysInMonth(year, month) }, (_, i) => i + 1),
    [year, month],
  );

  /** A month change can strand the day: 31 January to February. */
  const set = (y: number, m: number, d: number) => onChange(toIso(y, m, clampDay(y, m, d)));

  const onTyped = (raw: string) => {
    setTyped(raw);
    setTypedBad(false);
    const iso = typedDate(raw);
    // Only commit a complete, real date. Committing early would turn a
    // half-typed "0931" into a date while somebody is still mid-keystroke.
    if (iso) {
      onChange(iso);
      setTyped("");
      return;
    }
    // Eight digits that did not make a date is a mistake worth naming, rather
    // than a field that silently ignores what was typed.
    if (raw.replace(/\D/g, "").length === 8) setTypedBad(true);
  };

  const select =
    "w-full rounded-xl border border-brand-gold/30 bg-ground-top/60 px-3 py-3 text-[17px] " +
    "text-brand-paper focus:border-brand-teal focus:outline-none focus:ring-2 focus:ring-brand-teal/40";

  return (
    <fieldset>
      <legend className="mb-2 font-sans text-[15px] font-semibold text-brand-paper">
        Date of birth
      </legend>

      <div className="grid grid-cols-[1.4fr_0.8fr_1fr] gap-2">
        <label>
          <span className="sr-only">Month</span>
          <select
            className={select}
            value={month}
            onChange={(e) => set(year, Number(e.target.value), day)}
          >
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
            className={select}
            value={day}
            onChange={(e) => set(year, month, Number(e.target.value))}
          >
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
            className={select}
            value={year}
            onChange={(e) => set(Number(e.target.value), month, day)}
          >
            {years.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="mt-3">
        <label className="block">
          <span className="text-[14px] text-brand-muted">
            Or type it straight in, if you know it by heart — 06251985 for 25 June 1985
          </span>
          <input
            inputMode="numeric"
            autoComplete="bday"
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
            That is eight digits, but not a date that exists — month first, then day, then the
            four-digit year.
          </p>
        )}
      </div>
    </fieldset>
  );
}
