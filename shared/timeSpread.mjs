/**
 * AN UNKNOWN BIRTH TIME, SAID AND DRAWN (Jeremy's calls, 10/22).
 *
 * The words and the little bar for a chart cast at noon, from the
 * `timeSpread` the engine works out once when the chart is made
 * (netlify/lib/birthSpread.mjs, the engine's POST /v1/spread). One module, so
 * the page and the PDF say the same sentence and draw the same bar.
 *
 * His design, in his words where he gave them:
 *   - ONE line. "Your birth time isn't known, so this chart is cast at noon. It
 *     holds for a birth between about 12:30 AM and 2:30 PM; outside those
 *     hours the lines marked PROVISIONAL may change."
 *   - PROVISIONAL only on the lines that really change that day, next to the
 *     line's LABEL, in gold capitals -- and the word in the sentence in exactly
 *     that style, "so they see what 'provisional' means very clearly".
 *   - The gate list moves with the Moon: always PROVISIONAL with no birth
 *     time, with a short note, and never part of the "holds between" window.
 *   - Under the line, the BAR ONLY (his pick of the two mocked): midnight to
 *     midnight, the stretch where the chart holds in gold, a noon marker.
 *   - The offer, option A: "Found your birth time? You're welcome to add it
 *     here, once and free — your chart and your reading are redone from it."
 *
 * Nothing here knows a timezone: the spread carries its own wall clock.
 */

export const PROVISIONAL = "PROVISIONAL";

/** The record's spread, when it can be used (else the page keeps the older note). */
export function usableSpread(output) {
  const s = output?.timeSpread;
  if (!output || output.timeKnown !== false || !s || s.ok !== true || !Array.isArray(s.window)) return null;
  return s;
}

/**
 * WHICH LINES ARE MARKED, as the page's own field names. With a spread: the
 * values that change that day, plus the gates and the 26 activations (always,
 * with no time). Without one (an older record): the engine's own list.
 */
export function markedFields(output) {
  if (!output || output.timeKnown !== false) return new Set();
  const s = usableSpread(output);
  if (!s) return new Set(output.provisional ?? []);
  return new Set([...s.changes, "gates", "planetNumbers"]);
}

/**
 * The gate list's short note, under its numbers, whenever the gates are
 * marked: they are marked even inside the hours the line names, and this
 * says why. (New words, 10/22 build: flagged for Jeremy.)
 */
export const GATES_NOTE = "The Moon moves to a new gate about every ten hours, so this list can change even where the rest of the chart holds.";

/* ------------------------------------------------------------------ clock */

/** Wall-clock minute of day for minute index k of the spread's day. */
export function wallMinute(spread, k) {
  let w = spread.clock?.[0] ?? [0, 0];
  for (const c of spread.clock ?? []) if (c[0] <= k) w = c;
  return w[1] + (k - w[0]);
}

/** 870 -> "2:30 PM"; 720 -> "noon"; 0 -> "midnight". */
export function sayClock(min) {
  const m = ((Math.round(min) % 1440) + 1440) % 1440;
  if (m === 720) return "noon";
  if (m === 0) return "midnight";
  const h = Math.floor(m / 60);
  const mm = m % 60;
  // A no-break space: "2:15" and "PM" never land on two lines.
  return `${((h + 11) % 12) + 1}:${String(mm).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
}

/**
 * The window's edges as said: nearest 15 minutes, "about". Never rounded past
 * noon (the chart is cast there, so the window always holds it) and never
 * rounded onto midnight when the window stops short of it ("just after
 * midnight", "just before midnight" instead).
 */
export function windowWords(spread) {
  const [a, b] = spread.window;
  const fromStart = a === 0;
  const toEnd = b === spread.minutes - 1;
  const wa = wallMinute(spread, a);
  const wb = wallMinute(spread, b);
  const r15 = (m) => Math.round(m / 15) * 15;
  let start = null;
  if (!fromStart) {
    const r = Math.min(r15(wa), 720);
    start = r <= 0 ? "just after midnight" : sayClock(r);
  }
  let end = null;
  if (!toEnd) {
    const r = Math.max(r15(wb), 720);
    end = r >= 1440 ? "just before midnight" : sayClock(r);
  }
  return { start, end, fromStart, toEnd };
}

/* ------------------------------------------------------------ the one line */

const CAST = "Your birth time isn’t known, so this chart is cast at noon.";

/**
 * The one line, as parts: `{ t }` plain words, `{ tag }` the word PROVISIONAL
 * drawn exactly like the tags. `text` is the same line as plain text.
 */
export function holdsLine(spread) {
  const parts = [];
  if (!spread.changes.length) {
    parts.push({ t: `${CAST} Your chart is the same whatever time you were born.` });
  } else {
    const w = windowWords(spread);
    const just = (s) => /^just/.test(s ?? "");
    const about = (s) => (just(s) ? s : `about ${s}`);
    // Each case: the words before the tag, and after it.
    let hold;
    let tail = " may change.";
    const edgeOnly = (w.fromStart || just(w.start)) && (w.toEnd || just(w.end));
    if (edgeOnly) {
      // Only minutes at midnight are out: say so, not "between just after midnight and just before".
      const when = [!w.fromStart && "the first minutes after midnight", !w.toEnd && "the last minutes before midnight"]
        .filter(Boolean)
        .join(" or ");
      hold = `It holds for a birth at almost any hour; only in ${when} may the lines marked `;
      tail = " change.";
    } else if (w.fromStart) hold = `It holds for a birth before ${about(w.end)}; after that, the lines marked `;
    else if (w.toEnd) hold = `It holds for a birth after ${about(w.start)}; before that, the lines marked `;
    else {
      // One "about" for the pair, as in Jeremy's line; "just after midnight" carries its own.
      const e = just(w.start) && !just(w.end) ? `about ${w.end}` : w.end;
      hold = `It holds for a birth between ${about(w.start)} and ${e}; outside those hours the lines marked `;
    }
    parts.push({ t: `${CAST} ${hold}` }, { tag: PROVISIONAL }, { t: tail });
  }
  return { parts, text: parts.map((p) => p.t ?? p.tag).join("") };
}

/* -------------------------------------------------------------- the offer */

const noun = (tier) => (tier >= 2 ? "your chart and your reading" : tier === 1 ? "your chart" : "your summary");
const verb = (tier) => (tier >= 2 ? "are" : "is");

/**
 * "Found your birth time?" -- self-serve, once per chart, free (option A, his
 * pick). A request, never a command. `link` is the words that open the time
 * box, at `r/<token>#add-time`.
 */
export function offerLine(tier) {
  return {
    before: "Found your birth time? You’re welcome to ",
    link: "add it here",
    after: `, once and free — ${noun(tier)} ${verb(tier)} redone from it.`,
  };
}
export const offerText = (tier) => {
  const o = offerLine(tier);
  return o.before + o.link + o.after;
};

/** Where "add it here" goes on the page itself: the reading link's own time box. */
export const ADD_TIME_HASH = "#add-time";

/* -------------------------------------------------------------- the drawing */

const PALETTES = {
  // The shop's page (tailwind brand tokens), dark.
  dark: { day: "rgba(180,168,206,0.22)", hold: "#E8CBA0", dim: "#B4A8CE", gold: "#E8CBA0", noon: "#F3EFF7", text: "#F3EFF7" },
  // The PDF's white page (readingPdf.mjs INK / GOLD / RULE / DIM).
  paper: { day: "#E3E7EB", hold: "#C9A227", dim: "#55636F", gold: "#8A6D0F", noon: "#0E1A2B", text: "#0E1A2B" },
};

/** Outfit, measured roughly: enough to keep the noon label inside the bar. */
export function textWidth(s, size) {
  let w = 0;
  for (const ch of String(s)) {
    if (/[ilj.,:;'|!]/.test(ch)) w += 0.26;
    else if (/[ frt1/()]/.test(ch)) w += 0.34;
    else if (/[mwMW]/.test(ch)) w += 0.82;
    else if (/[A-Z]/.test(ch)) w += 0.64;
    else if (/[0-9]/.test(ch)) w += 0.55;
    else w += 0.53;
  }
  // A little over, never under: a label measured short is a label clipped at the edge.
  return w * size * 1.08;
}

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const n = (v) => Math.round(v * 10) / 10;

/**
 * THE DAY, DRAWN: a bar from midnight to midnight; the stretch where this
 * chart holds in gold; a noon marker, "cast at noon"; the clock under it.
 * No rows, no percentages, no legend. `width` in px (or pt for the PDF);
 * returns { svg, width, height }.
 */
export function spreadSvg(spread, { width = 640, palette = "dark", font = "Outfit", size = 11 } = {}) {
  const P = PALETTES[palette] ?? PALETTES.dark;
  const N = spread.minutes;
  const same = !spread.changes.length;
  const x0 = 1;
  const x1 = width - 1;
  const X = (k) => x0 + ((x1 - x0) * k) / N;
  const parts = [];
  const text = (x, y, s, { anchor = "start", fill = P.dim, weight = 400, sz = size } = {}) =>
    parts.push(
      `<text x="${n(x)}" y="${n(y)}" font-family="${font}" font-size="${sz}" font-weight="${weight}" fill="${fill}" text-anchor="${anchor}">${esc(s)}</text>`,
    );
  const rect = (x, y, w, h, fill, r = 0) =>
    w > 0 && parts.push(`<rect x="${n(x)}" y="${n(y)}" width="${n(Math.max(w, 0.8))}" height="${n(h)}" rx="${r}" fill="${fill}"/>`);

  // The noon marker's words sit above the bar.
  const noonX = X(spread.noon);
  let y = size + 2;
  const castW = textWidth("cast at noon", size);
  const castX = Math.min(Math.max(noonX - castW / 2, x0), x1 - castW);
  text(castX, y, "cast at noon", { fill: P.gold, weight: 600 });
  if (same) text(x0, y, "the same all day", { fill: P.text, weight: 600 });
  y += 6;

  // The bar.
  const barH = 10;
  const barTop = y;
  rect(x0, barTop, x1 - x0, barH, P.day, barH / 2);
  const [a, b] = spread.window;
  rect(X(a), barTop, X(b + 1) - X(a), barH, P.hold, barH / 2);
  y += barH;

  // The clock under it: 12 AM, 6 AM, 12 PM, 6 PM, 12 AM, placed by real time.
  const at = (wall) => {
    for (let k = 0; k < N; k++) if (wallMinute(spread, k) === wall) return k;
    return null;
  };
  const ticks = [
    [0, "12 AM", "start"],
    [at(360), "6 AM", "middle"],
    [at(720) ?? spread.noon, "12 PM", "middle"],
    [at(1080), "6 PM", "middle"],
    [N, "12 AM", "end"],
  ].filter(([k]) => k !== null);
  y += size + 4;
  for (const [k, label, anchor] of ticks) {
    parts.push(`<rect x="${n(X(k) - (anchor === "end" ? 0.8 : anchor === "start" ? 0 : 0.4))}" y="${n(barTop + barH + 1)}" width="0.8" height="3" fill="${P.dim}"/>`);
    text(X(k), y, label, { anchor, sz: size - 1 });
  }
  const height = Math.ceil(y + 5);

  // Noon: one line through the bar.
  parts.push(`<rect x="${n(noonX - 0.75)}" y="${n(barTop - 3)}" width="1.5" height="${n(barH + 6)}" fill="${P.noon}"/>`);

  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" ` +
    `aria-label="${esc(ariaFor(spread))}">${parts.join("")}</svg>`;
  return { svg, width, height };
}

/** What the drawing shows, in words, for a screen reader. */
function ariaFor(spread) {
  if (!spread.changes.length) return "Your birth day from midnight to midnight: the chart is the same all day.";
  const w = windowWords(spread);
  const span = w.fromStart ? `until ${w.end}` : w.toEnd ? `from ${w.start}` : `from ${w.start} to ${w.end}`;
  return `Your birth day from midnight to midnight. This chart holds ${span}.`;
}
