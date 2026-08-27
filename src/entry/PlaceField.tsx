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

export type Place = { label: string; zone: string };

/** States that span two time zones. A chart cast against one of these is a guess. */
const SPLIT_ZONE_STATES = [
  "Alaska", "Arizona", "Florida", "Idaho", "Indiana", "Kansas", "Kentucky",
  "Michigan", "Nebraska", "Nevada", "North Dakota", "Oregon", "South Dakota",
  "Tennessee", "Texas",
];

/** Does this look like a state rather than a town? */
function looksLikeAState(label: string): boolean {
  const head = label.split(",")[0].trim();
  return SPLIT_ZONE_STATES.some((s) => s.toLowerCase() === head.toLowerCase());
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
    setSearching(true);
    const mine = ++seq.current;
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/places?q=${encodeURIComponent(q)}&limit=8`);
        const body = await res.json();
        // An answer that arrived late must not overwrite a newer one.
        if (mine !== seq.current) return;
        setResults(Array.isArray(body?.places) ? body.places : []);
      } catch {
        if (mine === seq.current) setResults([]);
      } finally {
        if (mine === seq.current) setSearching(false);
      }
    }, 90);
    return () => clearTimeout(timer);
  }, [query]);

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
    // Wait a frame so the list has laid out and the page is tall enough.
    const id = requestAnimationFrame(() => {
      const top = el.getBoundingClientRect().top;
      // Leave the field just below the top edge, so the answers get the rest of
      // whatever the keyboard has left.
      window.scrollBy({ top: top - 12, behavior: "smooth" });
    });
    return () => cancelAnimationFrame(id);
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
          onFocus={() => setFocused(true)}
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

      {/* Fault 1's other half. Without room to scroll INTO, the scroll above is
          capped at zero and does nothing at all, silently. */}
      {showList && <div aria-hidden style={{ height: viewportH ? viewportH * 0.5 : 320 }} />}

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
          {looksLikeAState(chosen.label) && (
            <p className="mt-2 text-[14px] leading-relaxed text-brand-gold">
              That is a whole state, and this one spans two time zones. The chart will be roughly
              right rather than exactly right — an hour moves the Moon, which moves the Profile. A
              town name would pin it down.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
