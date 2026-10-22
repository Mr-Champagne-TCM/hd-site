/**
 * AN UNKNOWN BIRTH TIME, SAID AND DRAWN (mock, Jeremy 10/22).
 *
 * The words and the little day-chart for a chart cast at noon, from the
 * `timeSpread` the shop works out once when the chart is made
 * (netlify/lib/birthSpread.mjs). One module, so the page, the PDF and the
 * phone say the same sentence and draw the same picture.
 *
 * Jeremy's design, in his words where he gave them:
 *   - ONE line. "Your birth time isn't known, so this chart is cast at noon. It
 *     holds for a birth between about 12:30 AM and 2:30 PM; outside those
 *     hours the lines marked PROVISIONAL may change." Nothing changes all day:
 *     "Your chart is the same whatever time you were born", and nothing marked.
 *   - PROVISIONAL only on the lines that really change that day, next to the
 *     line's LABEL, in gold capitals -- and the word in the sentence in exactly
 *     that style, "so they see what 'provisional' means very clearly".
 *   - The gate list moves with the Moon: always PROVISIONAL with no birth
 *     time, and never part of the "holds between" window.
 *   - A small midnight-to-midnight chart beside the line: the stretch where
 *     the chart holds, a noon marker, and at most three thin rows, one per
 *     value that changes ("like a line chart from midnight to midnight,
 *     showing the profile stretches throughout the day").
 *
 * Nothing here knows a timezone: the spread carries its own wall clock.
 */

export const PROVISIONAL = "PROVISIONAL";

/** The record's spread, when it can be used (else the page keeps today's note). */
export function usableSpread(output) {
  const s = output?.timeSpread;
  if (!output || output.timeKnown !== false || !s || s.ok !== true || !Array.isArray(s.window)) return null;
  return s;
}

/**
 * WHICH LINES ARE MARKED, as the page's own field names. With a spread: the
 * values that change that day, plus the gates and the 26 activations (always,
 * with no time). Without one (an older record): the engine's own list, as today.
 */
export function markedFields(output) {
  if (!output || output.timeKnown !== false) return new Set();
  const s = usableSpread(output);
  if (!s) return new Set(output.provisional ?? []);
  return new Set([...s.changes, "gates", "planetNumbers"]);
}

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
 * "Found your birth time?" -- self-serve, once per chart, free. Two wordings
 * for Jeremy to pick from (requests, never commands; "I", never "the shop").
 * `link` is the words that open the time box.
 */
export function offerLine(tier, variant = "A") {
  if (variant === "B") {
    return {
      before: `If you find your birth time later, I’d be glad to redo ${noun(tier)} from it, once and at no cost. You can `,
      link: "add it here",
      after: ".",
    };
  }
  return {
    before: "Found your birth time? You’re welcome to ",
    link: "add it here",
    after: `, once and free — ${noun(tier)} ${verb(tier)} redone from it.`,
  };
}
export const offerText = (tier, variant) => {
  const o = offerLine(tier, variant);
  return o.before + o.link + o.after;
};

/* --------------------------------------------------------------- the rows */

const CENTER_FIELDS = ["definedCenters", "undefinedCenters", "openCenters"];
/** Top to bottom, as the bodygraph has them. */
const BODY_ORDER = ["Head", "Ajna", "Throat", "G", "Heart", "Sacral", "Spleen", "Solar Plexus", "Root"];
const STATE = { definedCenters: "defined", undefinedCenters: "undefined", openCenters: "open" };

/** All runs of one field as [{ start, end, value }]. */
function runsOf(spread, field) {
  const runs = spread.segments?.[field];
  if (!runs) return null;
  return runs.map(([start, value], i) => ({ start, end: (runs[i + 1]?.[0] ?? spread.minutes) - 1, value }));
}

/** Each center's state (defined / undefined / open) at minute k. */
function centerStates(spread, k) {
  const out = {};
  for (const f of CENTER_FIELDS) {
    const runs = spread.segments?.[f];
    let v = null;
    if (runs) for (const [st, val] of runs) if (st <= k) v = val;
    if (v === null) continue;
    for (const c of String(v).split(", ").filter(Boolean)) out[c] = STATE[f];
  }
  return out;
}

/** Every minute a center list changes. */
function centerCuts(spread) {
  const cuts = new Set([0]);
  for (const f of CENTER_FIELDS) for (const [k] of spread.segments?.[f] ?? []) cuts.add(k);
  return [...cuts].sort((x, y) => x - y);
}

/**
 * ONE ROW FOR ONE OR TWO CENTERS that move together (Head and Ajna both
 * defined, then both not), each stretch named in a word. Null when they do
 * not move together, or do not move.
 */
function centersRow(spread, names) {
  const moving = [...names].sort((x, y) => BODY_ORDER.indexOf(x) - BODY_ORDER.indexOf(y));
  if (!moving.length || moving.length > 2) return null;
  const starts = centerCuts(spread);
  const words = [];
  for (const k of starts) {
    const st = centerStates(spread, k);
    const set = new Set(moving.map((c) => st[c]));
    if (set.size !== 1) return null;
    words.push([...set][0]);
  }
  const segs = [];
  starts.forEach((start, i) => {
    if (segs.length && segs.at(-1).value === words[i]) return;
    segs.push({ start, value: words[i] });
  });
  segs.forEach((x, i) => (x.end = (segs[i + 1]?.start ?? spread.minutes) - 1));
  if (segs.length < 2) return null;
  return { field: "centers", label: moving.join(", "), segments: segs };
}

/** The centers whose state changes anywhere in the day. */
function movingCenters(spread) {
  const states = centerCuts(spread).map((k) => centerStates(spread, k));
  return [...new Set(states.flatMap((x) => Object.keys(x)))].filter((c) => new Set(states.map((x) => x[c])).size > 1);
}

/** The cross, said short: "Consciousness", or by its angle when the name stays. */
function crossShort(v) {
  const m = /^(Right Angle|Juxtaposition|Left Angle) Cross of (?:the |The )?([^(]+?)\s*(?:\(|$)/.exec(String(v));
  return m ? m[2] : String(v);
}

const ORDER = ["type", "authority", "profile", "definition", "centers", "channels", "incarnationCross"];

/**
 * THE ROWS UNDER THE BAR: at most three, one per value that changes.
 *
 * Every edge of the gold stretch is EXPLAINED by a row that changes right
 * there (10/22 review: Boise's stretch ended at 5:40 PM where neither of its
 * two rows changed -- a Heart center did). So the rows that explain an edge
 * come first; then the big three (Type, Authority, Profile); then the rest.
 * Shown in the reading order.
 */
export function graphRows(spread, max = 3) {
  const make = (field, label, fmt = (v) => v) => {
    const runs = runsOf(spread, field);
    return runs ? { field, label, segments: runs.map((r) => ({ ...r, value: fmt(r.value) })) } : null;
  };
  const channels = () => {
    const r = make("channels", "Channels");
    if (!r) return null;
    const sets = r.segments.map((x) => (x.value ? x.value.split(", ") : []));
    // Counts, when every change changes the count ("4 channels | 5 | 4"). A channel
    // swapped for another keeps its count, so then each stretch names the channels
    // that come and go ("20-57 | 16-48"); "–" where none of them is there.
    if (sets.every((x, i) => i === 0 || x.length !== sets[i - 1].length)) {
      r.segments.forEach((x, i) => (x.value = i ? String(sets[i].length) : `${sets[i].length} channels`));
      return r;
    }
    const always = sets[0].filter((c) => sets.every((x) => x.includes(c)));
    r.segments.forEach((x, i) => {
      const v = sets[i].filter((c) => !always.includes(c));
      x.value = v.length ? v.join(" · ") : "–";
    });
    return r;
  };
  const together = centersRow(spread, movingCenters(spread));
  const pool = [
    make("type", "Type"),
    make("authority", "Authority"),
    make("profile", "Profile"),
    make("definition", "Definition"),
    together,
    channels(),
    make("incarnationCross", "Cross", crossShort),
  ].filter(Boolean);

  // The edges of the stretch: the minute it starts and the minute after it ends, inside the day.
  const [a, z] = spread.window;
  const edges = [a > 0 ? a : null, z < spread.minutes - 1 ? z + 1 : null].filter((e) => e !== null);
  const explains = (r, e) => r.segments.some((x) => x.start === e);
  const chosen = [];
  const take = (r) => r && !chosen.includes(r) && chosen.length < max && chosen.push(r);
  for (const e of edges) {
    if (chosen.some((r) => explains(r, e))) continue;
    // Who explains this edge, most readable first: the big three, Definition, centers moving
    // together, ONE center that changes right here ("Heart: undefined, defined"), then the
    // channel count, then the cross.
    const by = (fields) => pool.find((x) => fields.includes(x.field) && explains(x, e));
    let r = by(["type", "authority", "profile"]) ?? by(["definition"]) ?? by(["centers"]);
    if (!r) {
      const before = centerStates(spread, e - 1);
      const after = centerStates(spread, e);
      const changed = Object.keys({ ...before, ...after }).filter((c) => before[c] !== after[c]);
      for (const c of changed.sort((x, y) => BODY_ORDER.indexOf(x) - BODY_ORDER.indexOf(y))) {
        r = centersRow(spread, [c]);
        if (r) break;
      }
      if (r) pool.push(r);
    }
    r ??= by(["channels"]) ?? by(["incarnationCross"]);
    take(r);
  }
  for (const f of ["type", "authority", "profile"]) take(pool.find((x) => x.field === f));
  for (const r of pool) take(r);
  chosen.sort((x, y) => ORDER.indexOf(x.field) - ORDER.indexOf(y.field));
  for (const r of chosen) for (const x of r.segments) x.noon = x.start <= spread.noon && spread.noon <= x.end;
  return chosen;
}

/* -------------------------------------------------------------- the drawing */

const PALETTES = {
  // The shop's page (tailwind brand tokens) and the phone (Theme.kt), both dark.
  dark: { day: "rgba(180,168,206,0.22)", hold: "#E8CBA0", holdRow: "rgba(232,203,160,0.85)", seg: "rgba(180,168,206,0.42)", text: "#F3EFF7", dim: "#B4A8CE", gold: "#E8CBA0", noon: "#F3EFF7", segText: "#F3EFF7" },
  phone: { day: "rgba(159,176,196,0.22)", hold: "#C9A227", holdRow: "rgba(217,180,67,0.9)", seg: "rgba(159,176,196,0.45)", text: "#F2EFE9", dim: "#9FB0C4", gold: "#D9B443", noon: "#F2EFE9", segText: "#F2EFE9" },
  // The PDF's white page (readingPdf.mjs INK / GOLD / RULE / DIM).
  paper: { day: "#E3E7EB", hold: "#C9A227", holdRow: "#D9BE6A", seg: "#CBD2D9", text: "#0E1A2B", dim: "#55636F", gold: "#8A6D0F", noon: "#0E1A2B", segText: "#0E1A2B" },
};

/** Outfit, measured roughly: enough to keep labels apart. */
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
 * Labels for a row of stretches: centered on each, kept apart, kept inside.
 * Returns [{ x, text, displaced }].
 */
function placeLabels(items, x0, x1, size, pad = 10) {
  const out = items.map((it) => ({ ...it, w: textWidth(it.text, size) }));
  for (const o of out) o.x = Math.min(Math.max(o.cx - o.w / 2, x0), x1 - o.w);
  for (let i = 1; i < out.length; i++) out[i].x = Math.max(out[i].x, out[i - 1].x + out[i - 1].w + pad);
  for (let i = out.length - 1; i >= 0; i--) {
    if (out[i].x + out[i].w > x1) out[i].x = x1 - out[i].w;
    if (i < out.length - 1 && out[i].x + out[i].w + pad > out[i + 1].x) out[i].x = out[i + 1].x - pad - out[i].w;
  }
  // Still touching or pushed off the row (long labels, narrow row): two lines, each label
  // at its own stretch, on the first line it fits.
  const bad = out.some((o, i) => o.x < x0 - 0.5 || o.x + o.w > x1 + 0.5 || (i > 0 && o.x < out[i - 1].x + out[i - 1].w + pad / 2));
  if (bad) {
    const end = [-Infinity, -Infinity];
    for (const o of out) {
      o.x = Math.min(Math.max(o.cx - o.w / 2, x0), x1 - o.w);
      const line = end[0] + pad / 2 <= o.x ? 0 : end[1] + pad / 2 <= o.x ? 1 : end[0] <= end[1] ? 0 : 1;
      if (end[line] + pad / 2 > o.x) o.x = Math.min(end[line] + pad / 2, x1 - o.w);
      o.line = line;
      end[line] = o.x + o.w;
    }
  }
  for (const o of out) o.line ??= 0;
  for (const o of out) o.displaced = Math.abs(o.x + o.w / 2 - o.cx) > o.w / 2 + 2;
  return out;
}

/**
 * THE DAY, DRAWN. A bar from midnight to midnight; the stretch where this
 * chart holds in gold; a noon marker, "cast at noon"; under it (rows: true)
 * one thin row per value that changes, each stretch named. No percentages,
 * no legend. `width` in px (or pt for the PDF); returns { svg, width, height }.
 */
export function spreadSvg(spread, { width = 640, rows = true, palette = "dark", font = "Outfit", size = 11 } = {}) {
  const P = PALETTES[palette] ?? PALETTES.dark;
  const N = spread.minutes;
  const same = !spread.changes.length;
  const list = rows && !same ? graphRows(spread) : [];
  const narrow = width < 480;
  const labelCol = list.length && !narrow ? Math.max(...list.map((r) => textWidth(r.label, size))) + 14 : 0;
  const x0 = labelCol + 1;
  const x1 = width - 1;
  const X = (k) => x0 + ((x1 - x0) * k) / N;
  const parts = [];
  const text = (x, y, s, { anchor = "start", fill = P.dim, weight = 400, sz = size, spacing = 0 } = {}) =>
    parts.push(
      `<text x="${n(x)}" y="${n(y)}" font-family="${font}" font-size="${sz}" font-weight="${weight}" fill="${fill}" text-anchor="${anchor}"${
        spacing ? ` letter-spacing="${spacing}"` : ""
      }>${esc(s)}</text>`,
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
    for (let k = 0; k < N; k++) if (spreadWall(spread, k) === wall) return k;
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
  const axisBottom = y + 3;

  // The rows.
  const rowTops = [];
  if (list.length) {
    y += narrow ? 22 : 14;
    for (const r of list) {
      if (narrow) {
        text(x0, y, r.label.toUpperCase(), { fill: P.dim, sz: size - 2, weight: 600, spacing: 0.8 });
        y += 5;
      }
      const top = y;
      rowTops.push(top);
      const h = 6;
      if (!narrow) text(0, top + h - 0.5, r.label, { fill: P.dim, sz: size - 0.5 });
      for (const s of r.segments) {
        const gap = 1.2;
        rect(X(s.start) + (s.start ? gap / 2 : 0), top, X(s.end + 1) - X(s.start) - (s.start ? gap / 2 : 0) - (s.end < N - 1 ? gap / 2 : 0), h, s.noon ? P.holdRow : P.seg, 2);
      }
      const labels = placeLabels(
        r.segments.map((s) => ({ cx: (X(s.start) + X(s.end + 1)) / 2, text: s.value, noon: s.noon, s })),
        x0,
        x1,
        size - 0.5,
      );
      const ly = top + h + size + 1;
      const lines = Math.max(...labels.map((l) => l.line)) + 1;
      for (const l of labels) {
        text(l.x, ly + l.line * (size + 2), l.text, { fill: l.noon ? P.gold : P.segText, sz: size - 0.5, weight: l.noon ? 600 : 400 });
        if (l.displaced) {
          const cx = l.s ? (X(l.s.start) + X(l.s.end + 1)) / 2 : l.x;
          parts.push(`<rect x="${n(cx - 0.4)}" y="${n(top + h + 0.5)}" width="0.8" height="2.5" fill="${P.dim}"/>`);
        }
      }
      y = ly + (lines - 1) * (size + 2) + (narrow ? 17 : 9);
    }
  }
  const height = Math.ceil(Math.max(y, axisBottom) + 2);

  // Noon: one line through the bar and down through the rows.
  parts.push(`<rect x="${n(noonX - 0.75)}" y="${n(barTop - 3)}" width="1.5" height="${n(barH + 6)}" fill="${P.noon}"/>`);
  // ...and a short mark through each row, so the noon stretch of every row lines up
  // (a line all the way down crossed the words under the rows).
  for (const t of rowTops) parts.push(`<rect x="${n(noonX - 0.5)}" y="${n(t - 3)}" width="1" height="12" fill="${P.noon}" opacity="0.8"/>`);

  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" ` +
    `aria-label="${esc(ariaFor(spread, list))}">${parts.join("")}</svg>`;
  return { svg, width, height };
}

/** Wall-clock minute for minute index k (the drawing's own copy, no import cycle). */
function spreadWall(spread, k) {
  return wallMinute(spread, k);
}

/** What the drawing shows, in words, for a screen reader. */
function ariaFor(spread, list) {
  if (!spread.changes.length) return "Your birth day from midnight to midnight: the chart is the same all day.";
  const w = windowWords(spread);
  const span = w.fromStart ? `until ${w.end}` : w.toEnd ? `from ${w.start}` : `from ${w.start} to ${w.end}`;
  const rows = list.map((r) => `${r.label}: ${r.segments.map((s) => s.value).join(", then ")}`).join(". ");
  return `Your birth day from midnight to midnight. This chart holds ${span}.${rows ? " " + rows + "." : ""}`;
}
