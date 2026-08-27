import { useEffect, useRef, useState } from "react";

/**
 * A birth place, and the four faults that cost the most building it once.
 *
 * 1. THE ANSWERS MUST NOT APPEAR BEHIND THE KEYBOARD.
 *
 *    On the phone this was reported as "the search options list didn't come
 *    up". It had. It rendered underneath the keyboard, so from where he sat it
 *    looked like nothing happened. Code already existed to prevent it and
 *    failed, because it repositioned on FOCUS — and at the moment of focus the
 *    list is empty, the page is short, there is nowhere to scroll to, so
 *    nothing moved and the answers then appeared below the fold.
 *
 *    Two things are needed together and neither works alone: reposition when
 *    the NUMBER OF RESULTS CHANGES while the field has focus, and guarantee
 *    there is room to scroll into. Hence the spacer below, which exists purely
 *    so the scroll has somewhere to go.
 *
 *    On the web the keyboard does not resize the page — it overlays it — so the
 *    visible height comes from visualViewport rather than from window.
 *
 * 2. NEVER AUTO-PICK WHILE SOMEBODY IS TYPING. On the phone a resolve effect
 *    keyed on the query text ran every keystroke and put the chosen town
 *    straight back, so the list never rendered and the place could not be
 *    changed once set. Nothing here is keyed on the text being edited.
 *
 * 3. SAY WHICH PLACE WAS ACTUALLY RESOLVED. The field holds what someone called
 *    their town, misspellings and all; the chart is cast from whatever the index
 *    matched. Those are two different things and the gap is invisible — a wrong
 *    match produces a complete, plausible chart in the wrong timezone.
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
 * fifty thousand and begins with a state name. The engine knows which entries
 * came from its state table; the page should not have to infer it.
 */
export type Place = { label: string; zone: string; approximate?: boolean };

/**
 * A per-session answer cache, and the reason the field felt slow.
 *
 * Measured against the live site: a lookup costs 340-1230ms warm, and even a
 * server CACHE HIT costs 400-600ms, because the function still round-trips to
 * Netlify Blobs before it can answer. A phone adds another 100-300ms on top of
 * every one of those. Reported as "more than 2 seconds waited... I had to type
 * more but it was just delay".
 *
 * Every one of those round trips was being paid again for a prefix already
 * typed: backspace a single character and the answer that had arrived a moment
 * earlier was fetched a second time.
 *
 * Held outside the component so it survives a remount. It is deliberately NOT
 * persisted to storage -- the towns somebody types are their birth place, and
 * those are not written to disk anywhere else either.
 */
const answers = new Map<string, Place[]>();

/**
 * An instant, provisional list built from what is already known.
 *
 * Adding a character can only ever REMOVE matches, never add them, so a cached
 * shorter prefix already contains every answer still standing. Filtering it
 * renders something under the finger immediately and the real answer replaces
 * it a moment later.
 *
 * The guard that matters: a cached list was capped at `limit`, so it is not
 * guaranteed complete. "w" returns eight towns and Wichita Falls need not be
 * among them. An empty filter therefore means "I do not know", NOT "no such
 * town" -- so nothing is shown in that case and the field keeps saying it is
 * looking. This can only ever show fewer answers than the server, briefly. It
 * cannot invent one and it cannot claim a town does not exist.
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

  const wrapRef = useRef<HTMLDivElement>(null);
  const seq = useRef(0);

  // Every character. No minimum length, and no debounce long enough to feel
  // broken -- 90ms is under the gap between keystrokes for most typing, so it
  // collapses bursts without ever making the field feel like it is waiting.
  useEffect(() => {
    const q = query.trim();
    if (!q) {
      setResults([]);
      setSearching(false);
      return;
    }

    const mine = ++seq.current;

    // Already answered this exact query in this session: no request at all, no
    // spinner, no wait. Backspacing through a town is now free, and that is the
    // single biggest source of the lag -- it was re-fetching answers it had.
    const exact = answers.get(q.toLowerCase());
    if (exact) {
      setResults(exact);
      setSearching(false);
      return;
    }

    // Nothing exact, so show what can be worked out from a shorter prefix while
    // the real answer is on its way. `searching` stays true so the list still
    // says it is looking rather than presenting a partial answer as final.
    const guess = provisional(q);
    if (guess) setResults(guess);
    setSearching(true);

    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/places?q=${encodeURIComponent(q)}&limit=8`);
        const body = await res.json();
        // An answer that arrived late must not overwrite a newer one.
        if (mine !== seq.current) return;
        const places = Array.isArray(body?.places) ? body.places : [];
        answers.set(q.toLowerCase(), places);
        setResults(places);
      } catch {
        // A failed request must not wipe a provisional list off the screen --
        // an approximate answer beats an empty box.
        if (mine === seq.current && !guess) setResults([]);
      } finally {
        if (mine === seq.current) setSearching(false);
      }
    }, 90);
    return () => clearTimeout(timer);
  }, [query]);

  /**
   * Wake the engine when the field is touched, not when the first answer is
   * wanted.
   *
   * The engine scales to zero, so the first lookup after an idle spell pays a
   * cold start -- that is the two-second wait, and it lands on the very first
   * keystroke, which is the worst possible moment for it. Focusing the field
   * happens a second or two before any character is typed, and one throwaway
   * request there is enough to have the machine awake and the function warm by
   * the time it matters.
   *
   * Once per session. It is a single tiny request, and it is not free.
   */
  const warmed = useRef(false);
  const warm = () => {
    if (warmed.current) return;
    warmed.current = true;
    fetch("/api/places?q=a&limit=1").catch(() => {});
  };

  /**
   * Reposition on RESULT COUNT, not on focus.
   *
   * This is the whole fix. On focus the list is empty and there is nothing to
   * scroll to; by the time answers exist, nothing re-runs unless it watches
   * them. `results.length` in the dependency list is the load-bearing part.
   */
  useEffect(() => {
    if (!focused || results.length === 0) return;
    const el = wrapRef.current;
    if (!el) return;
    /**
     * Nudge until it lands, rather than once and hope.
     *
     * A single attempt is not enough and measuring proved it: the spacer that
     * makes room renders in the same commit as the list, so the first attempt
     * runs against a document that has not finished growing and the browser
     * caps the scroll. Measured on an 812px screen the field asked to move 778px
     * and moved 440 — better than nothing, and still leaving the last answers
     * behind the keyboard.
     *
     * So it checks its work. Each pass scrolls by whatever distance is left; if
     * the page has grown since, the next pass gets further. It stops when the
     * field is at the top, when a pass achieves nothing (genuinely capped), or
     * after a handful of tries — never looping.
     */
    let tries = 0;
    let timer: number | undefined;

    const settle = () => {
      tries += 1;
      const top = el.getBoundingClientRect().top;
      // An ABSOLUTE target, computed fresh each pass from the page offset. A
      // relative scrollBy is a guess about where the page is when it lands.
      if (top > 14) window.scrollTo({ top: window.scrollY + top - 12, behavior: "auto" });
      if (tries < 7) timer = window.setTimeout(settle, 80);
    };

    // It keeps checking for about half a second rather than acting once, and
    // that is not belt-and-braces. Measuring showed the field landing at 350
    // when it had been asked for 12, while every scroll method moved it there
    // instantly when called by hand -- so something puts it back afterwards.
    // The browser's own scroll-the-focused-input-into-view runs late and does
    // exactly that. Holding the position for a few passes outlasts it.
    const first = requestAnimationFrame(() => {
      timer = window.setTimeout(settle, 0);
    });

    return () => {
      cancelAnimationFrame(first);
      if (timer) clearTimeout(timer);
    };
  }, [focused, results.length]);

  /** How much room the keyboard has left, when the browser will say. */
  const [viewportH, setViewportH] = useState<number | null>(null);
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const onResize = () => setViewportH(vv.height);
    vv.addEventListener("resize", onResize);
    onResize();
    return () => vv.removeEventListener("resize", onResize);
  }, []);

  const showList = focused && query.trim().length > 0;

  return (
    <div>
      <label className="block" ref={wrapRef}>
        <span className="mb-2 block font-sans text-[15px] font-semibold text-brand-paper">
          Place of birth
        </span>
        <input
          type="text"
          autoComplete="off"
          placeholder="Town, and the state or country"
          value={query}
          onFocus={() => {
            setFocused(true);
            warm();
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

      {showList && (
        <ul
          className="mt-2 divide-y divide-brand-gold/10 overflow-y-auto rounded-xl border border-brand-gold/25 bg-ground-top/90"
          style={{ maxHeight: viewportH ? Math.max(140, viewportH * 0.4) : 280 }}
        >
          {results.map((p) => (
            <li key={`${p.label}|${p.zone}`}>
              <button
                type="button"
                // onMouseDown, not onClick: a click arrives after blur, and by
                // then the list may be gone.
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
          {results.length === 0 && (
            <li className="px-4 py-3 text-[15px] text-brand-muted">
              {searching ? "Looking…" : "No town by that name yet — another spelling may find it."}
            </li>
          )}
        </ul>
      )}

      {/*
        Fault 1's other half, and the size is not a guess.

        A FULL viewport, not a fraction of one. The first version used half, and
        measuring it on an 812px screen showed the field at 790px and STAYING
        there: reaching the top needed ~778px of scroll and only 320px of room
        existed, so the browser capped the scroll to nothing and the answers
        rendered at 880px — off the bottom, exactly where a keyboard sits. The
        effect above ran perfectly and achieved nothing, which is precisely the
        way this bug hides.

        Anything shorter than one screen means some starting position cannot
        reach the top. One screen means every position can.
      */}
      {showList && (
        <div aria-hidden style={{ height: Math.max(320, viewportH ?? window.innerHeight) }} />
      )}

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
