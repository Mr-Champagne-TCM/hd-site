import { useEffect, useRef, useState } from "react";

/**
 * Our own clock chooser.
 *
 * The native one was ruled out on the phone, and the reasons were specific
 * rather than aesthetic:
 *
 *   - AM and PM showed no highlight, so the only way to learn which was chosen
 *     was to press Set and read the field afterwards
 *   - its buttons ran off the right edge of the screen and "Set" was clipped.
 *     Nothing else on the device does that, so it is the dialog, not a display
 *     setting
 *   - the hour and the minute could not be reached separately. A right hour
 *     with wrong minutes meant starting the whole thing over
 *   - typing was possible only behind a keyboard icon, which is an interface
 *     for somebody who already knows it is there
 *
 * Every one of those is a property of a control we do not own, so this replaces
 * it rather than working around it. The FORMAT is deliberately the same -- a
 * dial, because that is the one Jeremy likes in the app and the one people have
 * used a thousand times. Only the flavour differs.
 *
 * What is different here, point for point: the active field is highlighted and
 * so is the meridiem; the panel is sized from the viewport so it cannot overrun;
 * the hour and the minute are separate controls and either can be tapped
 * directly; and both of them are plain number inputs, so typing needs no icon
 * and no discovery.
 */

type Mode = "hour" | "minute";

/** Where the numbers sit. 12 at the top, clockwise, like a clock. */
const OUTER = 100;
const INNER = 64;
const CENTER = 130;
const SIZE = CENTER * 2;

/** Below this distance from the middle a tap means the inner ring. */
const RING_SPLIT = 82;

function pad(n: number) {
  return String(n).padStart(2, "0");
}

/** Split "HH:MM" into the pieces the dial works in. */
function split(value: string, clock: 12 | 24) {
  const m = /^(\d{2}):(\d{2})$/.exec(value);
  if (!m) return { hour: clock === 12 ? 12 : 12, minute: 0, pm: false };
  const h24 = Number(m[1]);
  const minute = Number(m[2]);
  if (clock === 24) return { hour: h24, minute, pm: h24 >= 12 };
  const pm = h24 >= 12;
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return { hour: h12, minute, pm };
}

export default function ClockDial({
  value,
  onSet,
  onCancel,
}: {
  /** "HH:MM" in 24-hour form, or "" for a fresh start. */
  value: string;
  onSet: (hhmm: string) => void;
  onCancel: () => void;
}) {
  const [clock, setClock] = useState<12 | 24>(12);
  const initial = split(value, 12);
  const [hour, setHour] = useState(initial.hour);
  const [minute, setMinute] = useState(initial.minute);
  const [pm, setPm] = useState(initial.pm);
  const [mode, setMode] = useState<Mode>("hour");

  const dialRef = useRef<HTMLDivElement>(null);

  /** Escape closes, because a dialog that traps you is its own bug. */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);

  /** The page behind must not scroll while this is open. */
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  /** Switching clocks keeps the same instant rather than the same digits. */
  const toTwentyFour = (h: number, isPm: boolean) => {
    if (clock === 24) return h;
    if (h === 12) return isPm ? 12 : 0;
    return isPm ? h + 12 : h;
  };

  const changeClock = (next: 12 | 24) => {
    const h24 = toTwentyFour(hour, pm);
    if (next === 24) {
      setHour(h24);
    } else {
      setHour(h24 % 12 === 0 ? 12 : h24 % 12);
      setPm(h24 >= 12);
    }
    setClock(next);
  };

  /**
   * A tap anywhere on the face, not only on a printed number.
   *
   * The angle is measured from the middle, so the whole wedge belongs to the
   * value it points at. Requiring a hit on the glyph itself is what makes a
   * dial feel fussy on a small screen.
   */
  const pick = (clientX: number, clientY: number) => {
    const el = dialRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const dx = clientX - (r.left + r.width / 2);
    const dy = clientY - (r.top + r.height / 2);
    // Clockwise from twelve o'clock.
    let angle = (Math.atan2(dx, -dy) * 180) / Math.PI;
    if (angle < 0) angle += 360;

    if (mode === "minute") {
      setMinute(Math.round(angle / 6) % 60);
      return;
    }

    const step = Math.round(angle / 30) % 12;
    if (clock === 12) {
      setHour(step === 0 ? 12 : step);
      return;
    }
    // 24-hour has two rings: 1-12 outside, 13-23 and midnight inside.
    const dist = Math.hypot(dx, dy);
    const inner = dist < (RING_SPLIT * r.width) / SIZE;
    if (inner) setHour(step === 0 ? 0 : step + 12);
    else setHour(step === 0 ? 12 : step);
  };

  const dragging = useRef(false);

  /** Choosing an hour moves on to the minutes, the way a clock dial should. */
  const releaseToMinutes = () => {
    if (mode === "hour") setMode("minute");
  };

  const hourFor24 = (h: number) => (clock === 24 ? h : h);
  const displayHour = clock === 12 ? hour : hourFor24(hour);

  const commit = () => {
    const h24 = toTwentyFour(hour, pm);
    onSet(`${pad(h24)}:${pad(minute)}`);
  };

  /**
   * Typed entry, with no icon in front of it.
   *
   * It clamps rather than refuses: a stray third digit cannot produce an
   * impossible time, and nothing is rejected while somebody is still typing.
   */
  const typeHour = (raw: string) => {
    const d = raw.replace(/\D/g, "").slice(0, 2);
    if (d === "") return setHour(clock === 12 ? 12 : 0);
    const n = Number(d);
    if (clock === 12) setHour(Math.min(12, Math.max(1, n)));
    else setHour(Math.min(23, n));
  };

  const typeMinute = (raw: string) => {
    const d = raw.replace(/\D/g, "").slice(0, 2);
    if (d === "") return setMinute(0);
    setMinute(Math.min(59, Number(d)));
  };

  /** The numbers printed around the face, for whichever mode is active. */
  const ring = (radius: number, values: number[], label: (v: number) => string, active: (v: number) => boolean) =>
    values.map((v, i) => {
      const angle = ((i * (360 / values.length)) - 90) * (Math.PI / 180);
      const x = CENTER + radius * Math.cos(angle);
      const y = CENTER + radius * Math.sin(angle);
      return (
        <span
          key={`${radius}-${v}`}
          className={
            "pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 select-none text-[15px] " +
            (active(v) ? "font-semibold text-[#0d1b1a]" : "text-brand-paper/80")
          }
          style={{ left: `${(x / SIZE) * 100}%`, top: `${(y / SIZE) * 100}%` }}
        >
          {label(v)}
        </span>
      );
    });

  // Where the hand points, and how long it is.
  const handAngle =
    mode === "minute" ? minute * 6 : (clock === 24 ? hour % 12 : hour % 12) * 30;
  const handLength =
    mode === "hour" && clock === 24 && (hour === 0 || hour > 12) ? INNER : OUTER;

  const fieldButton = (on: boolean) =>
    // Wide enough for two digits at this size. The first version was 3.2rem with px-3 and CLIPPED them -- "12" rendered as half a 1 and half a 2.
    "w-[4.6rem] rounded-xl px-1 py-2 text-[34px] leading-none tabular-nums outline-none transition-colors " +
    (on
      ? "bg-brand-teal text-[#0d1b1a]"
      : "bg-white/[0.06] text-brand-paper hover:bg-white/[0.10]");

  const meridiemButton = (on: boolean) =>
    "rounded-lg px-3 py-2 text-[15px] font-semibold transition-colors " +
    (on ? "bg-brand-teal text-[#0d1b1a]" : "bg-white/[0.06] text-brand-muted hover:text-brand-paper");

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      // A tap on the backdrop is a cancel, the way every sheet behaves.
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      {/*
        Sized from the viewport, which is the whole reason the buttons cannot
        run off the edge: the panel is at most 92% of the screen and everything
        inside it is laid out relative to that, so there is no width it can
        exceed.
      */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Time of birth"
        className="w-[min(92vw,22rem)] max-h-[92vh] overflow-y-auto rounded-2xl border border-brand-gold/25 bg-ground-top p-5 shadow-2xl"
      >
        <div className="flex items-baseline justify-between">
          <p className="font-sans text-[13px] uppercase tracking-[0.16em] text-brand-muted">
            Time of birth
          </p>
          <div className="inline-flex rounded-lg bg-white/[0.06] p-0.5">
            {([12, 24] as const).map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => changeClock(c)}
                className={
                  "rounded-md px-2 py-1 text-[12px] font-semibold transition-colors " +
                  (clock === c ? "bg-brand-teal text-[#0d1b1a]" : "text-brand-muted")
                }
              >
                {c === 12 ? "12h" : "24h"}
              </button>
            ))}
          </div>
        </div>

        {/*
          Hour and minute are separate controls, and each one is both a target
          and a text box. Tapping either aims the dial at it; typing in either
          sets it outright. A right hour with wrong minutes never means starting
          again.
        */}
        <div className="mt-4 flex items-center justify-center gap-1">
          <input
            aria-label="Hour"
            inputMode="numeric"
            value={clock === 12 ? String(displayHour) : pad(displayHour)}
            onChange={(e) => typeHour(e.target.value)}
            onFocus={() => setMode("hour")}
            onClick={() => setMode("hour")}
            className={fieldButton(mode === "hour") + " text-center"}
          />
          <span className="px-0.5 text-[30px] leading-none text-brand-muted">:</span>
          <input
            aria-label="Minute"
            inputMode="numeric"
            value={pad(minute)}
            onChange={(e) => typeMinute(e.target.value)}
            onFocus={() => setMode("minute")}
            onClick={() => setMode("minute")}
            className={fieldButton(mode === "minute") + " text-center"}
          />

          {clock === 12 && (
            <div className="ml-3 flex flex-col gap-1">
              <button type="button" className={meridiemButton(!pm)} onClick={() => setPm(false)}>
                AM
              </button>
              <button type="button" className={meridiemButton(pm)} onClick={() => setPm(true)}>
                PM
              </button>
            </div>
          )}
        </div>

        <p className="mt-2 text-center text-[13px] text-brand-muted">
          {mode === "hour" ? "Choosing the hour" : "Choosing the minutes"} &mdash; tap the other to
          change it
        </p>

        {/* The face. Square by aspect ratio so it scales with the panel. */}
        <div
          ref={dialRef}
          className="relative mx-auto mt-4 aspect-square w-full max-w-[16rem] touch-none rounded-full bg-white/[0.04]"
          onPointerDown={(e) => {
            dragging.current = true;
            (e.target as Element).setPointerCapture?.(e.pointerId);
            pick(e.clientX, e.clientY);
          }}
          onPointerMove={(e) => {
            if (dragging.current) pick(e.clientX, e.clientY);
          }}
          onPointerUp={() => {
            dragging.current = false;
            releaseToMinutes();
          }}
          onPointerCancel={() => {
            dragging.current = false;
          }}
        >
          {/* The hand, drawn under the numbers. */}
          <svg viewBox={`0 0 ${SIZE} ${SIZE}`} className="absolute inset-0 h-full w-full">
            <circle cx={CENTER} cy={CENTER} r="3.5" className="fill-brand-teal" />
            <line
              x1={CENTER}
              y1={CENTER}
              x2={CENTER + handLength * Math.cos(((handAngle - 90) * Math.PI) / 180)}
              y2={CENTER + handLength * Math.sin(((handAngle - 90) * Math.PI) / 180)}
              className="stroke-brand-teal"
              strokeWidth="2"
            />
            <circle
              cx={CENTER + handLength * Math.cos(((handAngle - 90) * Math.PI) / 180)}
              cy={CENTER + handLength * Math.sin(((handAngle - 90) * Math.PI) / 180)}
              r="17"
              className="fill-brand-teal"
            />
          </svg>

          {mode === "hour" && clock === 12 &&
            ring(OUTER, [12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11], (v) => String(v), (v) => v === hour)}

          {mode === "hour" && clock === 24 && (
            <>
              {ring(OUTER, [12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11], (v) => String(v), (v) => v === hour)}
              {ring(
                INNER,
                [0, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23],
                (v) => pad(v),
                (v) => v === hour,
              )}
            </>
          )}

          {mode === "minute" &&
            ring(
              OUTER,
              [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55],
              (v) => pad(v),
              // The hand can sit on any minute; only the multiples of five are
              // printed, so the highlight follows the nearest printed one.
              (v) => v === Math.round(minute / 5) * 5 % 60,
            )}
        </div>

        <div className="mt-5 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-full px-4 py-2.5 text-[15px] text-brand-muted hover:text-brand-paper"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={commit}
            className="rounded-full bg-brand-teal px-5 py-2.5 text-[15px] font-semibold text-[#0d1b1a]"
          >
            Set
          </button>
        </div>
      </div>
    </div>
  );
}
