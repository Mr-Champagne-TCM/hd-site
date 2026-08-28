import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { warmEngine } from "./warm";

/**
 * A birth place, and the faults that cost the most building it.
 *
 * 1. THE ANSWERS MUST NOT APPEAR BEHIND THE KEYBOARD.
 *
 *    Reported first as "the search options list didn't come up". It had -- it
 *    rendered underneath the keyboard, so from where he sat nothing happened.
 *
 *    The first attempt at fixing it SCROLLED THE PAGE to drag the field up, and
 *    that was the wrong idea carried out carefully. It needed a screen-tall
 *    spacer to have somewhere to scroll to, it fought the browser's own
 *    scroll-the-focused-input behaviour, and on the phone it produced this:
 *    "the screen jumped away... the jump left me with a view above the keyboard
 *    that was blank page space". A fix that moves the whole page is a fix that
 *    can land anywhere.
 *
 *    So the page does not move at all now. The list is POSITIONED rather than
 *    scrolled to: fixed to the visual viewport, directly under the field when
 *    there is room under it and directly above the field when there is not,
 *    with its height capped to whatever the keyboard has left. There is no
 *    scrolling, no spacer, and nothing to fight, so there is nothing that can
 *    jump.
 *
 *    It is rendered through a portal because a `fixed` child of a transformed
 *    ancestor is positioned against that ancestor instead of the viewport --
 *    a gradient or animation added to the page later would otherwise break this
 *    quietly and at a distance.
 *
 * 2. NEVER AUTO-PICK WHILE SOMEBODY IS TYPING. On the phone a resolve effect
 *    keyed on the query text ran every keystroke and put the chosen town
 *    straight back, so the list never rendered and the place could not be
 *    changed once set. Nothing here is keyed on the text being edited.
 *
 * 3. SAY WHICH PLACE WAS ACTUALLY RESOLVED. The field holds what somebody
 *    called their town, misspellings and all; the chart is cast from whatever
 *    the index matched. A wrong match produces a complete, plausible chart in
 *    the wrong timezone.
 *
 * 4. A WHOLE STATE IS NOT A BIRTHPLACE. Fifteen US states span two time zones.
 *    Someone born in El Paso charted against "Texas" is an hour out, and an
 *    hour moves the Moon, which moves the Profile. The risk is said out loud.
 */

/**
 * `approximate` is set by the engine when the entry is a whole state rather
 * than a town.
 *
 * It comes down the wire rather than being worked out here from the shape of
 * the label, because that guess is wrong: "Texas City, Texas" is a real town of
 * fifty thousand and begins with a state name.
 */
export type Place = { label: string; zone: string; approximate?: boolean };

/**
 * A per-session answer cache, and the reason the field felt slow.
 *
 * Measured against the live site: a lookup costs 340-1230ms warm, and even a
 * server CACHE HIT costs 400-600ms because the function still round-trips to
 * Netlify Blobs before it can answer. A phone adds another 100-300ms to every
 * one of those.
 *
 * Each of those round trips was being paid again for a prefix already typed:
 * backspace one character and the answer that had arrived a moment earlier was
 * fetched a second time.
 *
 * Held outside the component so it survives a remount. Deliberately NOT
 * persisted -- the towns somebody types are their birth place.
 */
const answers = new Map<string, Place[]>();

/**
 * An instant, provisional list built from what is already known.
 *
 * Adding a character can only ever REMOVE matches, so a cached shorter prefix
 * already contains every answer still standing.
 *
 * Twenty-five are asked for rather than eight, and that is what makes this work
 * rather than merely exist. Narrowing a cached list can only find what the
 * cached list contains, so a short prefix capped at eight almost never had the
 * town still being typed -- the narrowing returned nothing and every keystroke
 * waited on the network anyway. A wider first answer costs nothing extra to
 * fetch and makes the local narrowing succeed for the rest of the word.
 *
 * The guard that matters: a cached list is still capped, so it is not
 * guaranteed complete. "w" returns eight towns and Wichita Falls need not be
 * among them. An empty filter therefore means "I do not know", NOT "no such
 * town" -- so nothing is shown in that case and the field keeps saying it is
 * looking.
 */
function provisional(query: string): Place[] | null {
  const lower = query.toLowerCase();
  for (let cut = lower.length - 1; cut >= 1; cut -= 1) {
    const cached = answers.get(lower.slice(0, cut));
    if (!cached) continue;
    const narrowed = cached.filter((p) => p.label.toLowerCase().includes(lower));
    return narrowed.length > 0 ? narrowed : null;
  }
  return null;
}

/** Where the list should sit, in viewport coordinates. */
type Box = { left: number; width: number; top?: number; bottom?: number; maxHeight: number };

export default function PlaceField({
  chosen,
  onChoose,
}: {
  chosen: Place | null;
  onChoose: (p: Place | null) => void;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Place[]>([]);
  const [focused, setFocused] = useState(false);
  const [searching, setSearching] = useState(false);
  const [box, setBox] = useState<Box | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);
  const seq = useRef(0);

  useEffect(() => {
    const q = query.trim();
    if (!q) {
      setResults([]);
      setSearching(false);
      return;
    }

    const mine = ++seq.current;

    // Already answered this exact query in this session: no request at all, no
    // spinner, no wait. Backspacing through a town is free.
    const exact = answers.get(q.toLowerCase());
    if (exact) {
      setResults(exact);
      setSearching(false);
      return;
    }

    // Show what can be worked out from a shorter prefix while the real answer
    // is on its way. `searching` stays true, so a partial answer is never
    // presented as a final one.
    const guess = provisional(q);
    if (guess) setResults(guess);
    setSearching(true);

    // 90ms is under the gap between keystrokes for most typing, so it collapses
    // bursts without ever making the field feel like it is waiting.
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/places?q=${encodeURIComponent(q)}&limit=25`);
        const body = await res.json();
        // An answer that arrived late must not overwrite a newer one.
        if (mine !== seq.current) return;
        const places = Array.isArray(body?.places) ? body.places : [];
        answers.set(q.toLowerCase(), places);
        setResults(places);
      } catch {
        // A failed request must not wipe a provisional list off the screen.
        if (mine === seq.current && !guess) setResults([]);
      } finally {
        if (mine === seq.current) setSearching(false);
      }
    }, 90);
    return () => clearTimeout(timer);
  }, [query]);

  const showList = focused && query.trim().length > 0;

  /**
   * Measure, do not scroll.
   *
   * `visualViewport` is what the keyboard actually leaves visible -- on the web
   * a keyboard overlays the page rather than resizing it, so `innerHeight` says
   * the screen is still full height and is useless here.
   */
  const place = useCallback(() => {
    const el = inputRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const vv = window.visualViewport;
    const vTop = vv?.offsetTop ?? 0;
    const vBottom = vTop + (vv?.height ?? window.innerHeight);

    const gap = 6;
    const below = vBottom - r.bottom - gap - 8;
    const above = r.top - vTop - gap - 8;

    // Under the field when it fits, over it when it does not. 160px is about
    // three answers -- less than that and flipping is worth it.
    if (below >= 160 || below >= above) {
      setBox({ left: r.left, width: r.width, top: r.bottom + gap, maxHeight: Math.max(96, below) });
    } else {
      setBox({
        left: r.left,
        width: r.width,
        bottom: window.innerHeight - r.top + gap,
        maxHeight: Math.max(96, above),
      });
    }
  }, []);

  // Before paint, so the list never appears in the wrong place for a frame.
  useLayoutEffect(() => {
    if (showList) place();
  }, [showList, results.length, place]);

  useEffect(() => {
    if (!showList) return;
    const vv = window.visualViewport;
    window.addEventListener("scroll", place, { passive: true });
    window.addEventListener("resize", place);
    vv?.addEventListener("resize", place);
    vv?.addEventListener("scroll", place);
    return () => {
      window.removeEventListener("scroll", place);
      window.removeEventListener("resize", place);
      vv?.removeEventListener("resize", place);
      vv?.removeEventListener("scroll", place);
    };
  }, [showList, place]);

  const list = showList && box && (
    <ul
      className="fixed z-40 divide-y divide-brand-gold/10 overflow-y-auto overscroll-contain rounded-xl border border-brand-gold/25 bg-ground-top shadow-2xl"
      style={{
        left: box.left,
        width: box.width,
        top: box.top,
        bottom: box.bottom,
        maxHeight: box.maxHeight,
      }}
    >
      {/*
        Twenty-five are FETCHED so the local narrowing has something to work
        with; eight are SHOWN, because a dropdown of twenty-five towns is a
        list nobody reads. The extra seventeen are working memory, not content.
      */}
      {results.slice(0, 8).map((p) => (
        <li key={`${p.label}|${p.zone}`}>
          <button
            type="button"
            // onMouseDown, not onClick: a click arrives after blur, and by then
            // the list may be gone.
            onMouseDown={(e) => {
              e.preventDefault();
              onChoose(p);
              setQuery(p.label);
              setFocused(false);
            }}
            className="block w-full px-4 py-3 text-left text-[16px] text-brand-paper transition-colors hover:bg-white/[0.06]"
          >
            {p.label}
            <span className="ml-2 text-[13px] text-brand-muted">{p.zone}</span>
            {p.approximate && (
              <span className="ml-2 text-[12px] uppercase tracking-[0.14em] text-brand-gold/80">
                whole state
              </span>
            )}
          </button>
        </li>
      ))}
      {results.slice(0, 8).length === 0 && (
        <li className="px-4 py-3 text-[15px] text-brand-muted">
          {searching ? "Looking…" : "No town by that name yet — another spelling may find it."}
        </li>
      )}
    </ul>
  );

  return (
    <div>
      <label className="block">
        <span className="mb-2 block font-sans text-[15px] font-semibold text-brand-paper">
          Place of birth
        </span>
        <input
          ref={inputRef}
          type="text"
          autoComplete="off"
          placeholder="Town, and the state or country"
          value={query}
          onFocus={() => {
            setFocused(true);
            warmEngine();
          }}
          // A blur that fires before a tap registers would close the list under
          // the finger, so the close is deferred by a beat.
          onBlur={() => setTimeout(() => setFocused(false), 150)}
          onChange={(e) => {
            setQuery(e.target.value);
            // Typing clears the choice so answers can appear. Nothing puts it
            // back except a tap -- that is fault 2.
            if (chosen) onChoose(null);
          }}
          className="w-full rounded-xl border border-brand-gold/30 bg-ground-top/60 px-3 py-3 text-[17px] text-brand-paper placeholder:text-brand-muted/50 focus:border-brand-teal focus:outline-none focus:ring-2 focus:ring-brand-teal/40"
        />
      </label>

      {typeof document !== "undefined" && list ? createPortal(list, document.body) : null}

      {chosen && !showList && (
        <div className="mt-2 rounded-xl border border-brand-teal/30 bg-brand-teal/[0.06] px-4 py-3">
          <p className="text-[15px] leading-snug text-brand-paper">
            Charting as <strong className="font-semibold">{chosen.label}</strong>
            <span className="ml-2 text-[13px] text-brand-muted">{chosen.zone}</span>
          </p>
          <button
            type="button"
            onClick={() => {
              onChoose(null);
              setQuery("");
            }}
            className="mt-1 text-[14px] text-brand-teal underline decoration-brand-teal/40 underline-offset-4"
          >
            Somewhere else
          </button>
          {chosen.approximate && (
            <p className="mt-2 text-[14px] leading-relaxed text-brand-gold">
              That is a whole state rather than a town, so the chart will be roughly right rather
              than exactly right. An hour moves the Moon, which moves the Profile — a town name
              would pin it down, if one comes to mind.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
