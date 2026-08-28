import { useEffect, useLayoutEffect, useRef, useState } from "react";

/**
 * One value, chosen from a list, drawn by us rather than by the operating
 * system.
 *
 * WHAT THIS REPLACES AND WHY. A `<select>` is three different controls wearing
 * one name: a grey list on desktop, a bottom wheel on iOS, a white dialog on
 * Android. Three appearances of the same field, none of them ours, and none of
 * them stylable -- the option list is drawn by the OS and CSS cannot reach it.
 * Jeremy's call, after seeing all three: custom everywhere.
 *
 * WHAT A `<select>` GAVE US FOR FREE, and therefore what this file has to earn
 * back by hand. Each of these is a real behaviour somebody depends on, not a
 * nicety:
 *
 *   - opens already scrolled to the current value
 *   - keyboard: arrows move, Enter chooses, Escape closes, Home/End jump
 *   - type-ahead: pressing "j" jumps to July
 *   - screen readers announce it as a list with a selected item
 *   - closes when you touch anything else
 *   - never renders off the edge of the screen
 *
 * That list is the specification for this component, and it is why a custom
 * dropdown is more work than it looks rather than less.
 *
 * ATTACHED TO ITS FIELD, ALWAYS -- including on a phone.
 *
 * The first version opened as a bottom sheet on small screens, which is the
 * conventional mobile pattern and was wrong here. Jeremy: "dropdowns should
 * stay attached to the field they represent, not float around... this
 * disassociates the dropdown from the field."
 *
 * He is right, and the reason is that this form has THREE of them in a row.
 * A sheet at the bottom of the screen is a list of numbers with no visible
 * connection to the box that opened it -- it could be the day or the year, and
 * the only clue is a caption. A panel under the field needs no caption at all.
 *
 * What the sheet was protecting against was being clipped at the screen edge.
 * That is handled by measuring instead: the panel flips above the field when
 * there is not room below, and anchors to whichever side keeps it on screen.
 */

export type Option = { value: string; label: string; short?: string };

export default function Picker({
  label,
  value,
  options,
  placeholder,
  onChange,
  columns = 3,
  disabled = false,
}: {
  label: string;
  value: string;
  options: Option[];
  placeholder: string;
  onChange: (value: string) => void;
  /** Months want three across; days and years want more. */
  columns?: number;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  /**
   * The active highlight is for KEYBOARD USE ONLY.
   *
   * Opening with nothing chosen puts `active` at 0 so the arrow keys have
   * somewhere to start -- but drawing that highlight made January look already
   * picked, which is exactly the fault the dashes were introduced to fix: a
   * value nobody chose, sitting there ready to be accepted by anyone who does
   * not look twice.
   *
   * So the position exists from the moment it opens and is only PAINTED once
   * somebody actually presses a key or moves a pointer over an option.
   */
  const [showActive, setShowActive] = useState(false);
  /**
   * WHETHER THE LIST IS TALLER THAN ITS BOX.
   *
   * A truncated list that looks complete is worse than a short one. The
   * desktop panel capped at 16rem cut the day grid off after 30 with nothing
   * on screen to say a 31st existed -- Jeremy went to Day first, saw five tidy
   * rows, and reported the month was missing a day. It was not: it was below
   * the fold of a scroll area with no scrollbar and no edge.
   *
   * So overflow is measured rather than guessed at, and a fade is drawn only
   * when there is genuinely more below. A permanent fade would be decoration
   * that lies on the lists which fit.
   */
  const [overflows, setOverflows] = useState(false);
  /**
   * WHERE THE PANEL FITS, measured rather than assumed.
   *
   * Three fields sit in a row and the last one is against the right edge on a
   * phone, so a panel anchored left every time would hang off the screen. And
   * the form sits low enough on a short screen that there is sometimes no room
   * below at all. Both are measured after the panel exists and before it is
   * painted, so neither is ever briefly visible in the wrong place.
   */
  const [place, setPlace] = useState<{ above: boolean; left: number | null }>({
    above: false,
    left: null,
  });
  const root = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const typed = useRef({ text: "", at: 0 });

  const index = options.findIndex((o) => o.value === value);
  const chosen = index >= 0 ? options[index] : null;

  /**
   * Open ALREADY SHOWING the current value, which a select does without being
   * asked. Layout effect rather than effect: scrolling after paint is a visible
   * jump, and on a long year list it is a big one.
   */
  useLayoutEffect(() => {
    if (!open) return;
    setActive(index >= 0 ? index : 0);
    setShowActive(false);
    const el = list.current?.querySelector<HTMLElement>(
      '[data-current="true"]',
    );
    el?.scrollIntoView({ block: "center" });
    const box = list.current;
    setOverflows(!!box && box.scrollHeight > box.clientHeight + 2);

    const field = button.current?.getBoundingClientRect();
    const panelEl = box?.parentElement?.parentElement as
      HTMLElement | undefined;
    if (field && panelEl) {
      const h = panelEl.offsetHeight;
      const w = panelEl.offsetWidth;

      /**
       * CENTRED ON ITS FIELD, THEN CLAMPED TO THE SCREEN.
       *
       * Anchoring to one side or the other was not enough. The day field sits
       * in the MIDDLE of the row: a panel wider than it overflows whichever
       * edge it is pinned to, and pinning right pushed the first column --
       * 1, 7, 13, 19, 25, 31 -- clean off the left of the screen.
       *
       * So it is centred on the field it belongs to, which is where the eye
       * expects it, and then slid back inside the viewport if that would hang
       * it off either edge. Month lands flush left, year flush right, day
       * centred, all from one rule.
       */
      const MARGIN = 8;
      const wanted = field.left + field.width / 2 - w / 2;
      const clamped = Math.max(
        MARGIN,
        Math.min(wanted, window.innerWidth - w - MARGIN),
      );
      setPlace({
        // Flip up only when there is genuinely more room up there. A panel
        // that flips on a screen where neither side fits should stay put.
        above:
          field.bottom + h + MARGIN > window.innerHeight &&
          field.top - h - MARGIN > 0,
        // Stored relative to the wrapper, because that is what `left` on an
        // absolutely positioned child is measured from.
        left: clamped - field.left,
      });
    }
  }, [open, index, options.length]);

  // Close on anything else. Pointerdown rather than click, so a press that
  // starts outside closes immediately rather than waiting for the release.
  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", away);
    return () => document.removeEventListener("pointerdown", away);
  }, [open]);

  function choose(i: number) {
    const opt = options[i];
    if (!opt) return;
    onChange(opt.value);
    setOpen(false);
    button.current?.focus();
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (!open) {
      if (["Enter", " ", "ArrowDown", "ArrowUp"].includes(e.key)) {
        e.preventDefault();
        setOpen(true);
      }
      return;
    }
    const last = options.length - 1;
    const move = (to: number) => {
      e.preventDefault();
      const next = Math.max(0, Math.min(last, to));
      setActive(next);
      setShowActive(true);
      list.current
        ?.querySelectorAll<HTMLElement>("[data-opt]")
        [next]?.scrollIntoView({ block: "nearest" });
    };

    switch (e.key) {
      case "Escape":
        e.preventDefault();
        setOpen(false);
        button.current?.focus();
        return;
      case "Enter":
      case " ":
        e.preventDefault();
        choose(active);
        return;
      case "ArrowDown":
        return move(active + columns);
      case "ArrowUp":
        return move(active - columns);
      case "ArrowRight":
        return move(active + 1);
      case "ArrowLeft":
        return move(active - 1);
      case "Home":
        return move(0);
      case "End":
        return move(last);
      default:
        break;
    }

    /**
     * Type-ahead, because a select has it and losing it would be a real
     * regression on a hundred-item year list. Keystrokes within a second
     * accumulate, so "199" reaches 1990 rather than stopping at 1.
     */
    if (e.key.length === 1 && !e.metaKey && !e.ctrlKey && !e.altKey) {
      const now = Date.now();
      const text =
        (now - typed.current.at < 1000 ? typed.current.text : "") +
        e.key.toLowerCase();
      typed.current = { text, at: now };
      const hit = options.findIndex((o) =>
        o.label.toLowerCase().startsWith(text),
      );
      if (hit >= 0) move(hit);
    }
  }

  const field =
    "w-full rounded-xl border px-3 py-3 text-left text-[17px] transition-colors " +
    (open
      ? "border-brand-teal ring-2 ring-brand-teal/40 "
      : "border-brand-gold/30 hover:border-brand-gold/50 ") +
    (chosen ? "text-brand-paper " : "text-brand-muted/70 ") +
    "bg-ground-top/60 focus:border-brand-teal focus:outline-none focus:ring-2 focus:ring-brand-teal/40 " +
    "disabled:opacity-40";

  const panel =
    "absolute z-50 w-max min-w-full max-w-[min(22rem,88vw)] rounded-xl border-2 " +
    "border-brand-teal/70 bg-[#241a4e] p-3 shadow-2xl " +
    (place.above ? "bottom-[calc(100%+6px)] " : "top-[calc(100%+6px)] ") +
    // Before the first measurement there is no offset to apply, so it opens
    // flush with its field rather than jumping from an arbitrary guess.
    (place.left === null ? "left-0" : "");

  return (
    <div ref={root} className="relative">
      <button
        ref={button}
        type="button"
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={onKeyDown}
        className={field}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={label}
      >
        <span className="flex items-center justify-between gap-2">
          <span className="truncate">
            {chosen ? chosen.label : placeholder}
          </span>
          <span aria-hidden className="text-[11px] text-brand-muted">
            ▾
          </span>
        </span>
      </button>

      {open && (
        <div
          className={panel}
          role="presentation"
          style={place.left === null ? undefined : { left: place.left }}
        >
          {/*
              The fade anchors to the LIST, not to the panel. The panel is
              absolutely positioned already, and giving it `relative` as well
              let the CSS decide which won -- it chose relative, and the whole
              panel dropped into the page flow.
            */}
          <div className="relative">
            <div
              ref={list}
              role="listbox"
              aria-label={label}
              tabIndex={-1}
              onKeyDown={onKeyDown}
              className="grid max-h-[46vh] gap-2 overflow-y-auto overscroll-contain sm:max-h-80"
              style={{
                gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
              }}
            >
              {options.map((o, i) => {
                const isChosen = o.value === value;
                return (
                  <button
                    key={o.value}
                    data-opt
                    data-current={isChosen || undefined}
                    type="button"
                    role="option"
                    aria-selected={isChosen}
                    onClick={() => choose(i)}
                    onPointerEnter={() => {
                      setActive(i);
                      setShowActive(true);
                    }}
                    className={
                      // 44px minimum touch target, which is the number that
                      // decides whether a phone user hits the month they meant.
                      "min-h-[44px] rounded-lg border px-2 py-2 text-center text-[15px] transition-colors " +
                      (isChosen
                        ? "border-brand-teal bg-brand-teal font-semibold text-[#0d1b1a] "
                        : showActive && i === active
                          ? "border-brand-gold/40 bg-white/10 text-brand-paper "
                          : "border-brand-gold/15 bg-white/[0.04] text-brand-paper ")
                    }
                  >
                    {o.short ?? o.label}
                  </button>
                );
              })}
            </div>
            {overflows && (
              <div
                aria-hidden
                className="pointer-events-none absolute inset-x-0 bottom-0 h-14 bg-gradient-to-t from-[#241a4e] via-[#241a4e] to-transparent"
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
