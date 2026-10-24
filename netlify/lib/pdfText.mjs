/**
 * TEXT ON THE PAGE, the way the phone app sets it.
 *
 * The phone's PDF (hd-reading-app PdfExport.kt) lays every block out with
 * Android's StaticLayout: greedy line breaking, line spacing (3pt, x1.08),
 * no extra padding, and its "no lonely last word" rule. pdfkit's own text flow
 * does none of that the same way, so this is a small port of exactly what the
 * phone does -- measure first, break first, draw second -- and the shop's PDF
 * uses it for every word it prints.
 *
 * Measured with pdfkit against the embedded Roboto (the phone's face), so a
 * line is as wide here as it is there. Line heights follow StaticLayout's
 * integer metrics: ascent and descent rounded, the extra (x1.08 + 3) rounded,
 * and none under the LAST line of a block.
 */

/** Roboto's own vertical metrics (hhea 1900 / -500 on 2048 units). */
const ASC = 1900 / 2048;
const DESC = 500 / 2048;

/** Characters Roboto has no glyph for, drawn in the fallback face instead. */
const FALLBACK = new Set(["→"]);

export function lineMetrics(size) {
  const asc = Math.round(ASC * size);
  const desc = Math.round(DESC * size);
  const h = asc + desc;
  const extra = Math.floor(h * 0.08 + 3 + 0.5);
  return { asc, desc, h, extra };
}

/** A paint, in the phone's terms: size, colour, weight, tracking in em. */
export function paint(size, color, bold = false, letterSpacing = 0) {
  return { size, color, bold, letterSpacing };
}

export function fontName(p) {
  return p.bold ? "bold" : "body";
}

/** Width of `text` in `p`, fallback glyphs included. */
export function measure(doc, text, p) {
  if (!text) return 0;
  const cs = p.letterSpacing * p.size;
  let w = 0;
  for (const run of runs(text)) {
    doc.font(run.fallback ? "fallback" : fontName(p)).fontSize(p.size);
    w += doc.widthOfString(run.text) + cs * run.text.length;
  }
  return w;
}

function runs(text) {
  const out = [];
  let cur = "";
  let fb = null;
  for (const ch of text) {
    const f = FALLBACK.has(ch);
    if (fb !== null && f !== fb) {
      out.push({ text: cur, fallback: fb });
      cur = "";
    }
    fb = f;
    cur += ch;
  }
  if (cur) out.push({ text: cur, fallback: fb });
  return out;
}

/** Draw `text` with its baseline at `y`. Returns the width drawn. */
export function drawText(doc, text, x, y, p, { align = "left" } = {}) {
  if (!text) return 0;
  const w = measure(doc, text, p);
  let cx = align === "right" ? x - w : x;
  hooks.onText?.({ text, x: cx, y, w, size: p.size, color: p.color, bold: p.bold });
  const cs = p.letterSpacing * p.size;
  for (const run of runs(text)) {
    doc.font(run.fallback ? "fallback" : fontName(p)).fontSize(p.size).fillColor(p.color);
    doc.text(run.text, cx, y, { lineBreak: false, baseline: "alphabetic", characterSpacing: cs });
    cx += doc.widthOfString(run.text) + cs * run.text.length;
  }
  return w;
}

/**
 * Where a line may break, as StaticLayout's line breaker allows it: after a
 * run of spaces, after a hyphen between letters, and either side of an em
 * dash. Returns the text cut into segments that each END at a break.
 */
function segments(para) {
  const out = [];
  let cur = "";
  const chars = [...para];
  for (let i = 0; i < chars.length; i++) {
    const ch = chars[i];
    const next = chars[i + 1];
    cur += ch;
    const isSpace = ch === " ";
    if (isSpace && next !== " ") {
      out.push(cur);
      cur = "";
    } else if (ch === "-" && /\p{L}/u.test(chars[i - 1] ?? "") && /\p{L}/u.test(next ?? "")) {
      out.push(cur);
      cur = "";
    } else if (ch === "—" && next && next !== " ") {
      out.push(cur);
      cur = "";
    } else if (next === "—" && !isSpace && ch !== "—") {
      out.push(cur);
      cur = "";
    }
  }
  if (cur) out.push(cur);
  return out;
}

/**
 * Greedy lines for one block of text at `width`. Hard breaks at "\n".
 * Each line: { start, end (exclusive, trailing spaces and the "\n" included),
 * text (no trailing space), width, paraStart, paraEnd }.
 */
function breakLines(doc, text, p, width) {
  const lines = [];
  let offset = 0;
  const paras = text.split("\n");
  paras.forEach((para, pi) => {
    const segs = segments(para);
    let lineStart = offset;
    let lineText = "";
    let first = true;
    const push = (endOffset, last) => {
      const t = lineText.replace(/ +$/, "");
      lines.push({
        start: lineStart,
        end: endOffset,
        text: t,
        width: measure(doc, t, p),
        paraStart: first,
        paraEnd: last,
      });
      first = false;
    };
    let pos = offset;
    for (const seg of segs) {
      const trial = (lineText + seg).replace(/ +$/, "");
      if (lineText && measure(doc, trial, p) > width + 0.01) {
        push(pos, false);
        lineStart = pos;
        lineText = "";
      }
      lineText += seg;
      pos += seg.length;
    }
    // A paragraph's "\n" belongs to its last line.
    const endOffset = pos + (pi < paras.length - 1 ? 1 : 0);
    push(endOffset, true);
    offset = endOffset;
  });
  return lines;
}

/**
 * One laid-out block: StaticLayout's answer, in points. `opts.extra`, when
 * given, replaces the room between lines (the margin notes, batch-1024 item 1).
 */
export class Layout {
  constructor(doc, text, p, width, opts = {}) {
    this.text = text;
    this.paint = p;
    this.width = width;
    this.opts = opts;
    this.lines = breakLines(doc, text, p, width);
    const base = lineMetrics(p.size);
    const m = opts.extra == null ? base : { ...base, extra: opts.extra };
    this.m = m;
    this.tops = [];
    let y = 0;
    this.lines.forEach((_, i) => {
      this.tops.push(y);
      y += m.h + (i < this.lines.length - 1 ? m.extra : 0);
    });
    this.tops.push(y);
    this.height = y;
  }
  get lineCount() {
    return this.lines.length;
  }
  lineTop(i) {
    return this.tops[i];
  }
  baseline(i) {
    return this.tops[i] + this.m.asc;
  }
}

/**
 * True when a paragraph inside `l` wrapped onto a last line that holds a
 * single word. A paragraph that is one line long (a value like "None") is
 * fine; only a WRAPPED paragraph can strand a word.
 */
export function hasLonelyLastWord(l) {
  for (const line of l.lines) {
    if (!line.paraEnd || line.paraStart) continue;
    if (line.text.trim().split(/\s+/).filter(Boolean).length < 2) return true;
  }
  return false;
}

/** How much narrower a paragraph may wrap to give its last word company (call 8). */
export const LONELY_MAX_PT = 24;
/** The same allowance for the 13pt lead lines, as the approved mock had it. */
export const LONELY_MAX_PT_LARGE = 48;
const LONELY_STEP_PT = 2;
export const lonelyAllowance = (size) => (size >= 12 ? LONELY_MAX_PT_LARGE : LONELY_MAX_PT);

/** Break before the last word of the line above the first lonely line. */
function carryDown(l, text) {
  for (let i = 1; i < l.lines.length; i++) {
    const line = l.lines[i];
    if (!line.paraEnd || line.paraStart) continue;
    if (line.text.trim().split(/\s+/).filter(Boolean).length >= 2) continue;
    const above = text.slice(l.lines[i - 1].start, line.start).replace(/\s+$/, "");
    const cut = above.lastIndexOf(" ");
    if (cut <= 0) return null;
    const at = l.lines[i - 1].start + cut;
    return text.slice(0, at) + "\n" + text.slice(at + 1);
  }
  return null;
}

/**
 * Test hooks: `onLayout` sees every laid-out block (the no-lonely-word check
 * reads it); `onText` sees every run drawn, with where it landed (the parity
 * test reads it, as the phone's RecordingCanvas does).
 */
export const hooks = { onLayout: null, onText: null };

/**
 * Every block of text on every page goes through here -- the phone's
 * PdfExport.layout. No paragraph ends with one word alone on its last line
 * (Jeremy 10/16, call 8): when it would, the paragraph wraps a little
 * narrower -- 2pt at a time, never more than 24pt (48pt for the 13pt lead
 * lines) -- until the last line has at least two words. If no width inside
 * that allowance works, the word before the lonely one is carried down.
 */
export function layout(doc, text, p, width, opts = {}) {
  const first = new Layout(doc, text, p, width, opts);
  let best = first;
  if (hasLonelyLastWord(first)) {
    let fixed = false;
    for (let w = width - LONELY_STEP_PT; w >= width - lonelyAllowance(p.size); w -= LONELY_STEP_PT) {
      const l = new Layout(doc, text, p, w, opts);
      if (!hasLonelyLastWord(l)) {
        best = l;
        fixed = true;
        break;
      }
    }
    if (!fixed) {
      let t = text;
      let l = first;
      for (let k = 0; k < 4 && hasLonelyLastWord(l); k++) {
        const next = carryDown(l, t);
        if (next === null) break;
        t = next;
        l = new Layout(doc, t, p, width, opts);
      }
      if (!hasLonelyLastWord(l)) best = l;
    }
  }
  hooks.onLayout?.(best);
  return best;
}

/** Draw lines [from, to) of `l` with the top of line `from` at (x, y). */
export function drawLayout(doc, l, x, y, from = 0, to = l.lineCount) {
  const top = l.lineTop(from);
  for (let i = from; i < to; i++) {
    drawText(doc, l.lines[i].text, x, y - top + l.baseline(i), l.paint);
  }
}

/**
 * Where `phrase` sits inside `l`, one box per line it occupies (a phrase can
 * wrap), relative to the layout's top-left. Spaces in the phrase may be line
 * breaks in the text (the lonely-word rule can carry one down).
 */
export function phraseRects(doc, l, phrase) {
  const re = new RegExp(phrase.split(" ").map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("[ \\n]"));
  const m = re.exec(l.text);
  if (!m) return [];
  const startAt = m.index;
  const endAt = m.index + m[0].length;
  const out = [];
  l.lines.forEach((line, i) => {
    const s = Math.max(startAt, line.start);
    let e = Math.min(endAt, line.end);
    while (e > s && /\s/.test(l.text[e - 1])) e--;
    if (e <= s) return;
    const x0 = measure(doc, l.text.slice(line.start, s), l.paint);
    const x1 = x0 + measure(doc, l.text.slice(s, e), l.paint);
    const base = l.baseline(i);
    out.push({ left: x0, top: base - ASC * l.paint.size, right: x1, bottom: base + DESC * l.paint.size });
  });
  return out;
}

/** The box around a run of text drawn at (x, baseline). */
export function textBox(doc, text, x, baseline, p) {
  return {
    left: x,
    top: baseline - ASC * p.size,
    right: x + measure(doc, text, p),
    bottom: baseline + DESC * p.size,
  };
}

export const FONT_ASC = ASC;
export const FONT_DESC = DESC;
