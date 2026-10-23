import PDFDocument from "pdfkit";
import SVGtoPDF from "svg-to-pdfkit";
import QRCode from "qrcode";
import { TIERS } from "../../shared/pricing.mjs";
import { DISCLAIMER, TAKEAWAYS, marginNotes, structureProblem, summaryRows } from "./interpretation.mjs";
import { sellable } from "../../shared/availability.mjs";
import { OUTFIT_400, OUTFIT_600 } from "./fonts/outfit.mjs";
import { ROBOTO_400, ROBOTO_700 } from "./fonts/roboto.mjs";
import {
  AUTHORITY_NOTES,
  NOT_SELF_NOTES,
  PROFILE_NOTES,
  SIGNATURE_NOTES,
  STRATEGY_NOTES,
  TYPE_NOTES,
  describe,
} from "./mechanics.mjs";
import { buildReadingView, NO_CHANNELS, PROFILE_LINE_NAMES } from "./readingView.mjs";
import { birthLine } from "../../shared/birthLine.mjs";
import { chartTitle } from "../../shared/chartName.mjs";
import { termSpans } from "../../shared/readingTerms.mjs";
import { JEREMY_JPG } from "./photo.mjs";
import { COACH, TECH_HOW, TECH_TITLE_NOTE, techTitle } from "../../shared/readingCopy.mjs";
import { gateList } from "../../shared/gateList.mjs";
import { GATES_NOTE, holdsLine, marginFields, markedFields, offerLine, spreadSvg, usableSpread } from "../../shared/timeSpread.mjs";
import {
  AUTHORITY,
  BODYGRAPH_GUIDE,
  CENTERS,
  CHANNELS,
  DEFINITION,
  GATES,
  LIBRARY,
  SHOP,
  SITE_URL,
  channelLink,
  crossLink,
  lineLink,
  profileLink,
  typeLink,
} from "../../shared/libraryLinks.mjs";
import { Layout, drawText, drawLayout, hooks, layout, measure, paint, phraseRects, textBox, lineMetrics } from "./pdfText.mjs";

/**
 * THE CLIENT PDF -- the SAME DOCUMENT the phone app makes (Jeremy 10/16: "All
 * PDFs should look the same").
 *
 * PORTED FROM hd-reading-app PdfExport.kt (main @ 0e8fcd4), which is the spec:
 * the same pages in the same order, the same sizes, colours and positions, the
 * same Roboto, the same branding lines, the same links to the same library
 * anchors. Where this file differs from the phone it says so, at the place it
 * differs.
 *
 *   1  the bodygraph, its key, the guide line and the QR
 *   2  "Your chart at a glance": the gold-ruled box (the reading's OWN summary
 *      sentences on the reading tier), the chart values, the 26 activations
 *      (reading tier only -- the chart tier never bought them), the onward note
 *   3-4 "Start here": centers, channels, profile, each with the library's
 *      one-liner and a Takeaway of sentences the reading already holds
 *   5+ "Your reading", decision first; the experiments; the disclaimer last
 *
 * The old mechanics page and separate activations page are gone, exactly as
 * on the phone (calls 1-8, 10/15-10/16).
 *
 * WHAT CANNOT MATCH, and does not pretend to:
 *   - The drawing is the ENGINE'S bodygraph (one drawing on the wire, D-10),
 *     recoloured for print and labelled in Outfit, which the engine solved its
 *     label positions against. The phone draws its own with the same geometry.
 *   - The chart tier (1) has no reading, so its glance box keeps the approved
 *     library sentences it has always had, and it still offers the next tier.
 *     Its onward note and that offer sit on a page 3 of their own, "Where to
 *     go from here", every time (10/16, option B); the phone has no such page.
 */

/* --------------------------------------------------------------- the print swap */

/**
 * THE DRAWING, RECOLOURED FOR PRINT -- only the two colours that carry the
 * medium, measured off the app's own PDF rather than guessed:
 *
 *   panel ground   #0E1A2B -> #5B6576
 *   robed figure   #152744 -> #263E66
 *
 * The halo moves with the ground on purpose (it is the colour behind a label).
 * A string swap against constants that live in another repo, so `printSwap`
 * reports what it matched and the tests assert both keys are hit.
 */
const PRINT_SWAP = Object.freeze({
  "#0e1a2b": "#5B6576",
  "#152744": "#263E66",
});

export function printSwap(svg) {
  let hits = 0;
  const out = String(svg).replace(/#[0-9a-fA-F]{6}(?![0-9a-fA-F])/g, (hex) => {
    const to = PRINT_SWAP[hex.toLowerCase()];
    if (!to) return hex;
    hits += 1;
    return to;
  });
  return { svg: out, hits };
}

/** "Success" -> "The feeling is success". Empty stays empty, so the row is dropped. */
export function feelingIs(word) {
  return word ? `The feeling is ${String(word).toLowerCase()}` : word;
}
/** "The feeling of having been seen..." -> "Having been seen...". Other openings stay. */
export function feelingNote(note) {
  if (!note) return note;
  const cut = String(note).replace(/^The (?:feeling|signal|sense) (?:of|that) /, "");
  return cut.charAt(0).toUpperCase() + cut.slice(1);
}

/* ------------------------------------------------------------------- the page */

// US Letter.
export const W = 612;
export const H = 792;
const MARGIN = 54;
const CONTENT_W = W - MARGIN * 2;

// The reading runs in a narrow column with chart facts in the margin beside
// it, all measured from the page edge: body 54..406, rule 420, notes 436..558.
const BODY_W = 352;
const RULE_X = MARGIN + 366;
const NOTE_X = MARGIN + 382;
const NOTE_W = 122;

const INK = "#0E1A2B";
const GOLD = "#8A6D0F"; // darkened for contrast on white
const RULE = "#C9A227";
const DIM = "#55636F";
const HAIR = "#E3E7EB";
const HAIR_WARM = "#EFE6C8";
const MARK = "#A08A3E";
const LIB_TEAL = "#3FA7A0"; // the library's own words, as in the Reading tab
const BODY2 = "#33414F";
const VALUE_RULE = "#EFF2F4";

/**
 * The running-head mark on every page after the first, and the page-one
 * eyebrow above the name (Jeremy 10/16, his wording; "by" always lowercase).
 */
export const WORDMARK = "HUMAN DESIGN by THE CHAMPAGNE METHOD COACHING AND CONSULTING";
export const WORDMARK_TRACKING = 0.18;
export const TITLE_MARK = "HUMAN DESIGN INTERPRETATION by THE CHAMPAGNE METHOD";
/** The same mark on a chart without a written reading, which is not an interpretation (W12, 10/21). */
export const TITLE_MARK_CHART = TITLE_MARK.replace("INTERPRETATION", "CHART");

/** Footer on every page: the business name, then the site. The whole line goes home. */
export const FOOTER = "The Champagne Method Coaching and Consulting · thechampagnemethod.co";

/**
 * Under the chart values on page 2: both free pages, the library and the
 * bodygraph guide, each at its own address (W12, 10/21: it said both were "at
 * .../library/human-design", where the bodygraph guide is not).
 */
export const ONWARD_NOTE =
  "Every word above is explained in The Human Design library, and the drawing on " +
  "page 1 in “Reading your bodygraph.” Both are free: thechampagnemethod.co/library/human-design " +
  "and thechampagnemethod.co/library/bodygraph.";

/**
 * The chart tier's last page, "Where to go from here" (Jeremy 10/16, item 12
 * option B). On a page of its own the chart values are no longer "above" the
 * note, so it names the page instead.
 */
export const NEXT_STEPS_HEAD = "Where to go from here";
export const ONWARD_NOTE_PAGE = ONWARD_NOTE.replace("Every word above", "Every word on page 2");

/** Page-2 note phrases that are links, and where they go. */
export const ONWARD_LINKS = Object.freeze([
  ["The Human Design library", LIBRARY],
  ["Reading your bodygraph", BODYGRAPH_GUIDE],
  ["thechampagnemethod.co/library/human-design", LIBRARY],
  ["thechampagnemethod.co/library/bodygraph", BODYGRAPH_GUIDE],
]);

/** Under the bodygraph key, beside the QR. */
export const GUIDE_URL = "thechampagnemethod.co/library/bodygraph";
export const GUIDE_PROMPT = "How to read your bodygraph →";
/** Under the QR, two short lines (fix 17A, 10/19). */
export const QR_CAPTION = Object.freeze(["Scan: how to read", "your bodygraph"]);

/** An unknown birth time on a record with no spread (older, or the spread could not be had). */
const NOON_NOTE =
  "Birth time was not known, so this chart is cast at noon. Type, " +
  "Authority and Profile should be treated as provisional.";

const wordmarkPaint = () => paint(7, MARK, true, WORDMARK_TRACKING);

/* --------------------------------- an unknown birth time (Jeremy 10/22) */

/**
 * The tag: gold capitals, as the page draws it -- beside a label, and inside
 * the one line about the time, so "PROVISIONAL" reads as one thing everywhere.
 */
const TAG_PAINT = paint(6.5, GOLD, true, 0.14);

/** The record's measured spread (time unknown, spread kept and sound), else null. */
const measured = (c) => usableSpread(c);

/**
 * The tag beside a label: on the label's line when it fits the label column,
 * else just under it. Returns how many lines the label now takes. `colW`
 * stops 10 pt short of the value column, so a tag on the label's line never
 * runs into the value ("STRATEGY PROVISIONAL Wait to respond" read as one).
 */
function labelTag(pdf, label, lp, x, baseline, colW) {
  const lw = measure(pdf, label, lp);
  const tw = measure(pdf, "PROVISIONAL", TAG_PAINT);
  if (lw + 5 + tw <= colW) {
    drawText(pdf, "PROVISIONAL", x + lw + 5, baseline, TAG_PAINT);
    return 1;
  }
  drawText(pdf, "PROVISIONAL", x, baseline + 9, TAG_PAINT);
  return 2;
}

/**
 * Words in more than one paint, wrapped greedily at `width` -- the one line
 * with its gold PROVISIONAL, the offer with its link. `parts`: { text, p, href? }.
 */
function drawRich(d, parts, x, width, size) {
  const pdf = d.pdf;
  const tokens = [];
  for (const part of parts) {
    // Plain spaces only: a no-break space ("2:15 PM") keeps its words together.
    const bits = part.p === TAG_PAINT ? [part.text] : part.text.split(/( +)/).filter(Boolean);
    for (const t of bits) tokens.push({ text: t, p: part.p, href: part.href ?? null, w: measure(pdf, t, part.p), space: /^ +$/.test(t) });
  }
  const lines = [[]];
  let lw = 0;
  for (const t of tokens) {
    if (t.space && !lines.at(-1).length) continue;
    if (!t.space && lw + t.w > width && lines.at(-1).length) {
      while (lines.at(-1).length && lines.at(-1).at(-1).space) lines.at(-1).pop();
      lines.push([]);
      lw = 0;
    }
    lines.at(-1).push(t);
    lw += t.w;
  }
  const m = lineMetrics(size);
  const lh = m.h + m.extra;
  d.need(lines.length * lh);
  lines.forEach((line, i) => {
    let cx = x;
    const base = d.y + m.asc + i * lh;
    for (const t of line) {
      drawText(pdf, t.text, cx, base, t.p);
      // The link's words AND the spaces between them are underlined, as one link.
      if (t.href) d.rect(cx, base + 0.16 * t.p.size, t.w, 0.6, LIB_TEAL);
      if (t.href && !t.space) d.link(textBox(pdf, t.text, cx, base, t.p), t.href, 0.5);
      cx += t.w;
    }
  });
  d.y += lines.length * lh - m.extra;
}

/** Page 1, under the chart's three facts: the one line, the day drawn, the offer. */
function timeNote(d, { spread, tier, addTimeUrl }) {
  const base = paint(9.5, INK);
  d.gap(5);
  drawRich(
    d,
    holdsLine(spread).parts.map((p) => (p.tag ? { text: p.tag, p: TAG_PAINT } : { text: p.t, p: base })),
    MARGIN,
    CONTENT_W,
    9.5,
  );
  d.gap(7);
  const { svg, height } = spreadSvg(spread, { width: CONTENT_W, palette: "paper", size: 7.5 });
  try {
    SVGtoPDF(d.pdf, svg, MARGIN, d.y, {
      width: CONTENT_W,
      height,
      // The drawing is laid out in points: one unit is one point, as the page is.
      assumePt: true,
      fontCallback: (family, bold, italic, opts) => (bold || Number(opts?.["font-weight"]) >= 500 ? "svgBold" : "svgBody"),
    });
  } catch {
    /* a drawing that will not draw is a page without it */
  }
  d.gap(height + 5);
  const o = offerLine(tier);
  const dim = paint(8.5, DIM);
  drawRich(
    d,
    [{ text: o.before, p: dim }, { text: o.link, p: paint(8.5, INK), href: addTimeUrl }, { text: o.after, p: dim }],
    MARGIN,
    CONTENT_W,
    8.5,
  );
  d.gap(10);
}

/**
 * A cursor down the page that starts a new one when a block will not fit --
 * the phone's Doc. Everything is drawn through this so nothing has to know
 * its own page number, and so a heading can be kept with the block under it:
 * measure first, break first, draw second.
 */
class Doc {
  constructor(pdf) {
    this.pdf = pdf;
    this.open = false;
    this.y = 0;
    this.pageNo = 0;
    this.head = null;
    /** Clickable areas, page by page -- also handed back for the tests. */
    this.links = [];
    /**
     * NO CLOSING BLOCK ON A PAGE OF ITS OWN (fix 6): `alone` is the page one
     * landed on by itself, `aloneKind` which one ("note" or "card"); `squeeze`
     * the page whose white space gives way so it fits; `keepClosing` sends the
     * block before it along instead.
     */
    this.alone = null;
    this.aloneKind = null;
    this.squeeze = null;
    this.keepClosing = false;
    /** White space given by `space`, page by page, and where the page-2 note ended. */
    this.spaced = {};
    this.noteEnd = null;
    /** The page the chart values began on, when they ran onto the next one (else null). */
    this.spilled = null;
  }

  /**
   * A closing block about to be drawn: was it pushed onto a page of its own?
   * `split`: it is on a page with only the tail of the block before it (the
   * last row of planet numbers, under no heading), which is as good as alone.
   */
  closing(kind, split = false) {
    if ((this.atTop || split) && this.alone === null) {
      this.alone = this.pageNo;
      this.aloneKind = kind;
    }
  }

  link(r, uri, pad = 1.5, kind = undefined) {
    const box = { page: this.pageNo, left: r.left - pad, top: r.top - pad, right: r.right + pad, bottom: r.bottom + pad, uri, ...(kind ? { kind } : {}) };
    this.links.push(box);
    this.pdf.link(box.left, box.top, box.right - box.left, box.bottom - box.top, uri);
  }

  linkText(text, x, baseline, p, uri) {
    this.link(textBox(this.pdf, text, x, baseline, p), uri);
  }

  /** Link every line of `l`, drawn with its top-left at (x, top). */
  linkLayout(l, x, top, uri) {
    l.lines.forEach((line, i) => {
      if (!line.text) return;
      const base = top + l.baseline(i);
      this.link(textBox(this.pdf, line.text, x, base, l.paint), uri);
    });
  }

  get bottom() {
    return H - MARGIN - 26;
  }

  start(runningHead = null) {
    this.finish();
    this.pageNo += 1;
    if (this.pageNo > 1) this.pdf.addPage();
    this.open = true;
    this.y = MARGIN;
    this.head = runningHead;
    if (runningHead) this.drawHead(runningHead);
  }

  /**
   * The wordmark is a letterhead mark, not a title: small, dim, on the right,
   * so the page's own label reads as the heading.
   */
  drawHead(ctx) {
    drawText(this.pdf, ctx, MARGIN, this.y + 9, paint(9.5, INK, true));
    const mark = wordmarkPaint();
    const w = measure(this.pdf, WORDMARK, mark);
    drawText(this.pdf, WORDMARK, W - MARGIN - w, this.y + 9, mark);
    this.linkText(WORDMARK, W - MARGIN - w, this.y + 9, mark, SHOP);
    this.y += 15;
    this.rect(MARGIN, this.y, W - MARGIN * 2, 0.7, HAIR);
    this.y += 16;
  }

  rect(x, y, w, h, color, opacity = 1) {
    this.pdf.save();
    this.pdf.rect(x, y, w, h).fillOpacity(opacity).fill(color);
    this.pdf.restore();
  }

  /** Break to a new page unless `h` still fits. */
  need(h) {
    if (this.y + h > this.bottom) this.start(this.head);
  }

  breakPage() {
    this.start(this.head);
  }

  /** True at the top of a page, before anything has been drawn under the head. */
  get atTop() {
    return this.y <= MARGIN + 31 + 0.5;
  }

  drawLines(l, from, to, x = MARGIN, spans = null) {
    drawLayout(this.pdf, l, x, this.y, from, to);
    if (spans) this.termLinks(l, from, to, x, this.y, spans);
    this.y += l.lineTop(to) - l.lineTop(from);
  }

  gap(h) {
    this.y += h;
  }

  /** White space only (never the room under drawn text), which gives way on the squeezed page. */
  space(h) {
    this.y += this.squeeze && this.squeeze.page === this.pageNo ? h * this.squeeze.f : h;
    this.spaced[this.pageNo] = (this.spaced[this.pageNo] ?? 0) + h;
  }

  draw(l, x = MARGIN, spans = null) {
    drawLayout(this.pdf, l, x, this.y);
    if (spans) this.termLinks(l, 0, l.lineCount, x, this.y, spans);
    this.y += l.height;
  }

  /**
   * FIX 7 (Jeremy 10/19): the Human Design words in the reading open their
   * library entry -- "Decode here, don't dilute". Each term (shared/
   * readingTerms.mjs `termSpans`, worked out on the laid-out text) gets a link
   * box on every line it occupies and a thin teal line under it, the brand's
   * own highlight, so a reader can see it is clickable. Lines [from, to) of
   * `l`, drawn with the top of line `from` at `top`.
   */
  termLinks(l, from, to, x, top, spans) {
    const size = l.paint.size;
    for (let i = from; i < to; i++) {
      const line = l.lines[i];
      const base = top - l.lineTop(from) + l.baseline(i);
      for (const sp of spans) {
        const s = Math.max(sp.start, line.start);
        let e = Math.min(sp.end, line.end);
        while (e > s && /\s/.test(l.text[e - 1])) e--;
        if (e <= s) continue;
        const x0 = x + measure(this.pdf, l.text.slice(line.start, s), l.paint);
        const x1 = x0 + measure(this.pdf, l.text.slice(s, e), l.paint);
        this.rect(x0, base + 0.16 * size, x1 - x0, 0.6, LIB_TEAL);
        this.link({ left: x0, top: base - 0.9277 * size, right: x1, bottom: base + 0.2441 * size }, sp.href, 0.5, "term");
      }
    }
  }

  block(l, x = MARGIN, after = 0) {
    this.need(l.height);
    this.draw(l, x);
    this.y += after;
  }

  rule(color, thickness = 0.7, from = MARGIN, to = W - MARGIN) {
    this.rect(from, this.y, to - from, thickness, color);
    this.y += thickness;
  }

  finish() {
    if (!this.open) return;
    // The whole footer line is the link home; the page number is not.
    const p = paint(8, DIM);
    const base = H - MARGIN + 14;
    drawText(this.pdf, FOOTER, MARGIN, base, p);
    drawText(this.pdf, String(this.pageNo), W - MARGIN - 8, base, p);
    this.linkText(FOOTER, MARGIN, base, p, SITE_URL);
    this.open = false;
  }

  L(text, p, width = CONTENT_W) {
    return layout(this.pdf, text, p, width);
  }
}

/**
 * Builds the PDF. `birth` is the record's birth block (null on readings stored
 * before 16 Oct 2026, which simply get no birth line). Resolves to the bytes,
 * or -- with `inspect` set, for the tests -- to `{ bytes, links, runs, pages,
 * alone, aloneKind }`: every link box and every run of text drawn, page by page.
 *
 * NO PAGE HOLDS ONLY A CLOSING BLOCK (10/21 live test, bug 6; Jeremy's pick 6B):
 * the page-2 note, or the coaching card, pushed onto a page of its own. It is
 * pulled up: the page before gives a little of its white space until it fits.
 * Only if it cannot (the card is tall) does the block before it go with it.
 */
export async function readingPdf(args) {
  const out = (r) => (args.inspect ? r : r.bytes);
  let first = await buildPdf(args);
  /**
   * PAGE 2'S VALUES STAY ON PAGE 2 (10/22: the new Activated gates row -- and,
   * with no birth time, its tag and note -- ran the last row onto page 3 under
   * page 2's running head). When the table spills, that page's white space
   * gives way: the most it can give first (0.55), then, if that kept it whole,
   * the gentler 0.8 when that does too. Neither: it spills, as before. At most
   * two more builds.
   */
  let base = {};
  if (first.spilled !== null) {
    const at = (f) => buildPdf(args, { squeeze: { page: first.spilled, f } });
    const most = await at(0.55);
    if (most.spilled === null) {
      const gentle = await at(0.8);
      const pick = gentle.spilled === null ? gentle : most;
      base = { squeeze: { page: first.spilled, f: pick === gentle ? 0.8 : 0.55 } };
      first = pick;
    }
  }
  if (first.alone === null) return out(first);
  /**
   * Each try is a whole build, and the download (and the reading page's page
   * count) waits on them, so at most three. Only page 2 has white space that
   * gives (`space`), so only the page-2 note can be pulled up -- never the
   * card, after the reading's pages. The most page 2 can give is tried first:
   * if that is not enough, nothing gentler is. If it is, everything on that
   * page sits higher by the white space it gave, so where the note ended says
   * which gentler squeeze (0.9, 0.8, 0.7 of the space) still fits; the
   * gentlest that does is built.
   */
  const page = first.alone - 1;
  // A page already squeezed for its values keeps at least that squeeze.
  const squeezed = (f) => buildPdf(args, { squeeze: { page, f: base.squeeze?.page === page ? Math.min(f, base.squeeze.f) : f } });
  if (first.aloneKind === "note") {
    const most = await squeezed(0.6);
    if (most.alone === null) {
      const room = most.noteEnd?.page === page ? most.bottom - most.noteEnd.y : 0;
      const given = most.spaced[page] ?? 0;
      const f = [0.9, 0.8, 0.7].find((f) => (f - 0.6) * given <= room);
      if (f) {
        const gentler = await squeezed(f);
        if (gentler.alone === null) return out(gentler);
      }
      return out(most);
    }
  }
  return out(await buildPdf(args, { ...base, keepClosing: true }));
}

async function buildPdf({ tier, name, output, links: _links, reading = null, birth = null, inspect = false, addTimeUrl = null }, opts = {}) {
  const qr = (() => {
    try {
      return QRCode.create(BODYGRAPH_GUIDE, { errorCorrectionLevel: "M" });
    } catch {
      return null; // a missing QR is a page without a QR, never a failed download
    }
  })();

  return new Promise((resolve, reject) => {
    const pdf = new PDFDocument({
      size: [W, H],
      margin: 0,
      /**
       * The initial font is ours: PDFDocument loads Helvetica in its
       * constructor otherwise, from a file the deployed bundle does not have.
       */
      font: ROBOTO_400,
      info: {
        Title: chartTitle(name),
        Author: "The Champagne Method",
        Creator: "thechampagnemethod.co",
      },
    });
    const chunks = [];
    pdf.on("data", (c) => chunks.push(c));
    pdf.on("error", reject);

    pdf.registerFont("body", ROBOTO_400);
    pdf.registerFont("bold", ROBOTO_700);
    pdf.registerFont("fallback", OUTFIT_400);
    pdf.registerFont("svgBody", OUTFIT_400);
    pdf.registerFont("svgBold", OUTFIT_600);

    const d = new Doc(pdf);
    Object.assign(d, opts);
    const runs = [];
    if (inspect) hooks.onText = (r) => runs.push({ page: d.pageNo, ...r });
    /**
     * THE WRITTEN INTERPRETATION, on the reading tier. Parsed HERE from the
     * stored, validated text, never from a stored derivative of it.
     */
    const text = tier >= 2 && typeof reading === "string" && reading.trim() ? reading.replace(/\r\n?/g, "\n") : null;

    bodygraphPage(d, { name, output, birth, qr, tier, addTimeUrl });
    glancePage(d, { output, tier, reading: text });
    // Same gate as the phone: a reading that can be laid out in the new order
    // gets the new order; anything else keeps its words as plain paragraphs.
    const view = text && structureProblem(text) === null ? buildReadingView(output, text) : null;
    if (view) {
      startHere(d, view, output);
      readingPages(d, output, view);
    } else if (text) {
      plainReading(d, text);
    }
    d.finish();
    if (inspect) hooks.onText = null;

    const pages = d.pageNo;
    pdf.on("end", () => {
      const bytes = Buffer.concat(chunks);
      resolve({ bytes, links: d.links, runs, pages, alone: d.alone, aloneKind: d.aloneKind, spaced: d.spaced, noteEnd: d.noteEnd, bottom: d.bottom, spilled: d.spilled });
    });
    pdf.end();
  });
}

/**
 * How many pages a built PDF has (fix 9A: the button says "PDF, 8 pages").
 * Counted from the document's own page objects, so it is the real file's
 * count rather than a guess.
 */
export function pdfPageCount(bytes) {
  const s = Buffer.isBuffer(bytes) ? bytes.toString("latin1") : String(bytes ?? "");
  return (s.match(/\/Type\s*\/Page(?![a-zA-Z])/g) ?? []).length;
}

/* --------------------------------------------------------------------- page 1 */

/** Width over height of the drawing's reference box (-120 -12 1090 1330). */
const ASPECT = 1090 / 1330;
/** The key strip: 900 x 138 reference units, drawn as wide as the chart. */
const LEG_W = 900;
const LEG_H = 138;
const LEGEND_ASPECT = LEG_W / LEG_H;

function profileWords(profile) {
  const digits = String(profile ?? "").replace(/\D/g, "");
  if (digits.length !== 2) return "";
  return [...digits].map((x) => PROFILE_LINE_NAMES[x]).filter(Boolean).join(" / ");
}

function bodygraphPage(d, { name, output, birth, qr, tier, addTimeUrl = null }) {
  const c = output ?? {};
  const spread = measured(c);
  const marked = spread ? markedFields(c) : null;
  const pdf = d.pdf;
  d.start();
  const eyebrow = paint(8, MARK, true, 0.19);
  const titleMark = Number.isInteger(tier) && tier < 2 ? TITLE_MARK_CHART : TITLE_MARK;
  drawText(pdf, titleMark, MARGIN, d.y + 8, eyebrow);
  d.linkText(titleMark, MARGIN, d.y + 8, eyebrow, SHOP);
  d.gap(16);
  drawText(pdf, chartTitle(name), MARGIN, d.y + 19, paint(24, INK, true));
  d.gap(25);
  const born = birthLine(birth);
  if (born) {
    drawText(pdf, born, MARGIN, d.y + 9, paint(9.5, DIM));
    d.gap(14);
  } else {
    d.gap(4);
  }
  d.rule(RULE, 1.5);
  d.gap(9);
  const words = profileWords(c.profile);
  const facts = [
    ["type", c.type],
    ["profile", `Profile ${c.profile ?? ""}${words ? ` — ${words}` : ""}`],
    ["authority", `${c.authority ?? ""} authority`],
  ].filter(([, v]) => v);
  if (marked) {
    // An unknown birth time: each fact that changes that day carries its tag.
    let x = MARGIN;
    facts.forEach(([field, v], i) => {
      if (i) x += drawText(pdf, "  ·  ", x, d.y + 9, paint(10, DIM));
      x += drawText(pdf, v, x, d.y + 9, paint(10, DIM));
      if (marked.has(field)) x += 4 + drawText(pdf, "PROVISIONAL", x + 4, d.y + 9, TAG_PAINT);
    });
  } else {
    drawText(pdf, facts.map(([, v]) => v).join("  ·  "), MARGIN, d.y + 9, paint(10, DIM));
  }
  d.gap(13);

  if (spread) {
    timeNote(d, { spread, tier, addTimeUrl });
  } else if (c.timeKnown === false) {
    d.block(d.L(NOON_NOTE, paint(9.5, GOLD)), MARGIN, 10);
  }

  // The chart is aspect-locked, the key is aspect-locked and as wide as the
  // chart, so the whole block is a function of one unknown:
  //   total = h + (h * ASPECT / LEGEND_ASPECT) + gap
  const gap = 12;
  const avail = d.bottom - d.y - 4;
  const perHeight = 1 + ASPECT / LEGEND_ASPECT;
  const chartH = Math.min(CONTENT_W / ASPECT, (avail - gap) / perHeight);
  const chartW = chartH * ASPECT;
  const legendH = chartW / LEGEND_ASPECT;
  const left = MARGIN + (CONTENT_W - chartW) / 2;

  const raw = typeof c.bodygraphSvg === "string" ? c.bodygraphSvg : null;
  if (raw) {
    try {
      // The engine's drawing as drawn: "HEART" over "(EGO)" is the engine's own label since 0.6.0 (W13).
      SVGtoPDF(pdf, printSwap(raw).svg, left, d.y, {
        width: chartW,
        height: chartH,
        preserveAspectRatio: "xMidYMid meet",
        fontCallback: (family, bold, italic, opts) =>
          bold || Number(opts?.["font-weight"]) >= 500 ? "svgBold" : "svgBody",
      });
    } catch {
      /* a drawing that will not draw is a page without it, never a failed download */
    }
  }
  d.gap(chartH + gap);

  const guideBox = drawLegend(d, { left, top: d.y, width: chartW, height: legendH });

  // The QR lives in the gutter the chart leaves beside the key, so it costs
  // no vertical space at all.
  const gutter = left - MARGIN - 8;
  const qrSide = Math.min(Math.min(legendH, gutter), 74);
  if (qrSide > 34 && qr) {
    const qx = left + chartW + 8;
    // Up a little, to make room for its caption (fix 17A, 10/19).
    const qy = d.y + (legendH - qrSide) / 2 - 6;
    drawQr(pdf, qr, qx, qy, qrSide);
    d.link({ left: qx, top: qy, right: qx + qrSide, bottom: qy + qrSide }, BODYGRAPH_GUIDE, 0);
    // A QR with no word under it is a square nobody scans: say where it goes.
    const cp = paint(6.5, DIM);
    QR_CAPTION.forEach((t, i) => {
      drawText(pdf, t, qx + (qrSide - measure(pdf, t, cp)) / 2, qy + qrSide + 8 + i * 8, cp);
    });
  }
  d.link(guideBox, BODYGRAPH_GUIDE);
  d.gap(legendH);
}

/** The QR as vector squares, black on the phone's pale ground, two-module margin. */
function drawQr(pdf, qr, x, y, side) {
  const n = qr.modules.size;
  const total = n + 4;
  const u = side / total;
  pdf.save();
  pdf.rect(x, y, side, side).fill("#F4F1EA");
  pdf.fillColor("#000000");
  for (let r = 0; r < n; r++) {
    for (let col = 0; col < n; col++) {
      if (qr.modules.get(r, col)) pdf.rect(x + (col + 2) * u, y + (r + 2) * u, u + 0.02, u + 0.02);
    }
  }
  pdf.fill("#000000");
  pdf.restore();
}

/**
 * What the colours mean -- the phone's Bodygraph.drawLegend, on a white page.
 * Two columns, two rows, a gold rule over, a pale one over the guide line,
 * and the guide line right-aligned to end where the QR begins. The swatch
 * colours are the ENGINE drawing's, because they are the key to the drawing
 * printed above them. Returns the box around the guide line (one link).
 */
function drawLegend(d, b) {
  const pdf = d.pdf;
  const titleInk = INK;
  const subInk = DIM;
  const ruleInk = GOLD;
  const scale = Math.min(b.width / LEG_W, b.height / LEG_H);
  const offX = b.left + (b.width - LEG_W * scale) / 2;
  const offY = b.top + (b.height - LEG_H * scale) / 2;
  const tx = (x) => offX + x * scale;
  const ty = (y) => offY + y * scale;
  const s = (v) => v * scale;

  const KEY = [
    ["Personality", "conscious — what you know", "#F0F3F9"],
    ["Design", "unconscious — what the body knows", "#7C5BFF"],
    ["Both", "held consciously and unconsciously", "#F0F3F9", "#7C5BFF"],
    ["Open", "not activated — open to others", "#1F3151"],
  ];
  const colW = LEG_W / 2;
  const rowH = 48;
  const barX = 16;
  KEY.forEach(([title, sub, fill, second], i) => {
    const x0 = (i % 2) * colW + barX;
    const cy = 21 + Math.floor(i / 2) * rowH;
    const side = 26;
    const sx = tx(x0);
    const sy = ty(cy - side / 2);
    const sw = s(side);
    pdf.save();
    if (second) {
      pdf.rect(sx, sy, sw / 2, sw).fill(fill);
      pdf.rect(sx + sw / 2, sy, sw / 2, sw).fill(second);
    } else {
      pdf.rect(sx, sy, sw, sw).fill(fill);
    }
    pdf.rect(sx, sy, sw, sw).lineWidth(s(1.2)).strokeColor("#8A9099").stroke();
    pdf.restore();
    const textX = tx(x0 + 26 + 18);
    drawText(pdf, title, textX, ty(cy + 1), paint(s(22), titleInk, true));
    drawText(pdf, sub, textX, ty(cy + 22), paint(s(17), subInk));
  });

  d.rect(tx(0), ty(0), tx(LEG_W) - tx(0), s(1.2), ruleInk, 150 / 255);
  d.rect(tx(barX), ty(96), tx(LEG_W - barX) - tx(barX), s(0.8), ruleInk, 90 / 255);

  const urlP = paint(s(18), ruleInk, true);
  const promptP = paint(s(18), subInk);
  const right = tx(LEG_W - barX);
  const base = ty(122);
  const urlW = drawText(pdf, GUIDE_URL, right, base, urlP, { align: "right" });
  const promptRight = right - urlW - s(10);
  const promptW = drawText(pdf, GUIDE_PROMPT, promptRight, base, promptP, { align: "right" });
  return {
    left: promptRight - promptW,
    top: base - (1900 / 2048) * s(18),
    right,
    bottom: base + (500 / 2048) * s(18),
  };
}

/* --------------------------------------------------------------------- page 2 */

const SUMMARY_KEYS = ["Type", "Strategy", "Authority", "Profile", "Signature", "Not-self"];

/**
 * The chart tier's sentences: it has no reading, so its glance box keeps the
 * approved library sentences it has always carried (a shop-only case -- the
 * phone always has a reading).
 */
function chartTierSentences(c) {
  const m = /^(\d)\s*\/\s*(\d)/.exec(String(c.profile ?? ""));
  const a = m && describe(PROFILE_NOTES, m[1]);
  const b = m && describe(PROFILE_NOTES, m[2]);
  return {
    Type: describe(TYPE_NOTES, c.type),
    Strategy: describe(STRATEGY_NOTES, c.strategy),
    Authority: describe(AUTHORITY_NOTES, c.authority),
    Profile: a && b ? `${a} ${b}` : null,
    Signature: feelingNote(describe(SIGNATURE_NOTES, c.signature)),
    "Not-self": feelingNote(describe(NOT_SELF_NOTES, c.notSelfTheme)),
  };
}

function glancePage(d, { output, tier, reading }) {
  const c = output ?? {};
  const marked = measured(c) ? markedFields(c) : null;
  const glanceField = ["type", "strategy", "authority", "profile", "signature", "notSelfTheme"];
  const pdf = d.pdf;
  d.start("Your chart at a glance");
  // Value from the chart, sentence from the model. Never the reverse.
  const says = reading ? summaryRows(reading) : chartTierSentences(c);
  const words = profileWords(c.profile);
  const rows = [
    ["TYPE", c.type],
    ["STRATEGY", c.strategy],
    ["AUTHORITY", c.authority],
    ["PROFILE", `${c.profile ?? ""}${words ? ` — ${words}` : ""}`],
    // On track / off track (Jeremy 10/5, option C), said as a feeling.
    ["WHEN IT'S ON TRACK", c.signature ? `The feeling is ${String(c.signature).toLowerCase()}` : ""],
    ["WHEN IT'S OFF TRACK", c.notSelfTheme ? `The feeling is ${String(c.notSelfTheme).toLowerCase()}` : ""],
  ];
  const labelPaint = paint(7.5, GOLD, true, 0.12);
  const valuePaint = paint(10.5, INK);
  // Each label opens its library entry; strategy and on/off track live in the
  // type's own entry there.
  const glanceHref = [typeLink(c.type), typeLink(c.type), AUTHORITY, profileLink(c.profile), typeLink(c.type), typeLink(c.type)];

  const boxTop = d.y;
  d.space(9);
  rows.forEach(([label, value], i) => {
    const sentence = says[SUMMARY_KEYS[i]] ?? "";
    const t = sentence ? `${value}. ${sentence}` : `${value}.`;
    const l = d.L(t, valuePaint, CONTENT_W - 138);
    if (i > 0) d.rect(MARGIN + 14, d.y, W - MARGIN * 2 - 28, 0.6, HAIR_WARM);
    d.space(6);
    drawText(pdf, label, MARGIN + 16, d.y + 8, labelPaint);
    d.linkText(label, MARGIN + 16, d.y + 8, labelPaint, glanceHref[i]);
    const tagRows = marked?.has(glanceField[i]) ? labelTag(pdf, label, labelPaint, MARGIN + 16, d.y + 8, 96) : 0;
    // 122, not 90: "WHEN IT'S OFF TRACK" needs the room.
    drawLayout(pdf, l, MARGIN + 122, d.y - 2);
    d.gap(Math.max(l.height, 14, tagRows > 1 ? 21 : 0));
    d.space(4);
  });
  d.space(6);
  d.rect(MARGIN, boxTop, CONTENT_W, 1, RULE);
  d.rect(MARGIN, d.y, CONTENT_W, 1, RULE);
  d.rect(MARGIN, boxTop, 1, d.y - boxTop, RULE);
  d.rect(W - MARGIN - 1, boxTop, 1, d.y - boxTop, RULE);
  d.space(22);

  drawText(pdf, "YOUR CHART VALUES", MARGIN, d.y + 8, paint(7.5, GOLD, true, 0.17));
  d.gap(13);
  d.rule(RULE, 0.8);
  d.space(2);

  const valueRow = (label, value, href, field = null, note = null) => {
    const l = d.L(value, paint(10, INK), CONTENT_W - 110);
    // A short note under the value (the gate list's, with no birth time), smaller and dim.
    const n = note ? d.L(note, paint(8.5, DIM), CONTENT_W - 110) : null;
    d.need(l.height + (n ? n.height + 3 : 0) + 10);
    d.space(5);
    const lp = paint(8, DIM, false, 0.06);
    drawText(pdf, label.toUpperCase(), MARGIN, d.y + 8, lp);
    d.linkText(label.toUpperCase(), MARGIN, d.y + 8, lp, href);
    // The tag beside the row's label (Jeremy 10/22: "next to section header").
    const tagRows = field && marked?.has(field) ? labelTag(pdf, label.toUpperCase(), lp, MARGIN, d.y + 8, 100) : 0;
    drawLayout(pdf, l, MARGIN + 110, d.y - 1);
    if (n) drawLayout(pdf, n, MARGIN + 110, d.y - 1 + l.height + 3);
    d.gap(Math.max(l.height + (n ? n.height + 3 : 0), 12, tagRows > 1 ? 20 : 0));
    d.space(4);
    d.rect(MARGIN, d.y, CONTENT_W, 0.5, VALUE_RULE);
  };

  const list = (v, none) => (Array.isArray(v) && v.length ? v.join(", ") : none);
  const valuesFrom = d.pageNo;
  valueRow("Definition", c.definition ?? "", DEFINITION, "definition");
  // The engine's name as it gives it ("Cross of the Vessel of Love" since engine 0.6.0, W14).
  valueRow("Incarnation cross", c.incarnationCross ?? "", crossLink(c.incarnationCross), "incarnationCross");
  valueRow("Defined centers", list(c.definedCenters, "None — Reflector"), CENTERS, "definedCenters");
  /**
   * A READING STORED BEFORE THE THIRD STATE EXISTED has no `undefinedCenters`
   * key at all, and its `openCenters` still means "everything not defined".
   * Absent is not empty, so those readings keep the two rows they were sold
   * with (a shop-only case: every phone chart has all three).
   */
  if (Array.isArray(c.undefinedCenters)) valueRow("Undefined centers", list(c.undefinedCenters, "None"), CENTERS, "undefinedCenters");
  valueRow("Open centers", list(c.openCenters, "None"), CENTERS, "openCenters");
  valueRow("Channels", Array.isArray(c.channels) && c.channels.length ? c.channels.join("\n") : "None", CHANNELS, "channels");
  // The gate numbers, as the page lists them (10/22: values only, every tier).
  if (Array.isArray(c.activatedGates)) {
    valueRow("Activated gates", gateList(c.activatedGates), GATES, "gates", marked?.has("gates") ? GATES_NOTE : null);
  }
  if (d.pageNo !== valuesFrom) d.spilled = valuesFrom;

  // The activations, in a four-up grid -- the READING tier's, never sold with
  // the chart tier.
  const activationRow = (label, acts) => {
    // Five across, 12pt rows (fix 6A, 10/19; was four across, 13pt).
    const cols = 5;
    const rowH = 12;
    const rowsN = Math.ceil(acts.length / cols);
    const h = rowsN * rowH;
    d.need(h + 10);
    d.space(5);
    drawText(pdf, label.toUpperCase(), MARGIN, d.y + 8, paint(8, DIM, false, 0.06));
    const colW = (CONTENT_W - 110) / cols;
    const nameP = paint(9, BODY2);
    const gateP = paint(9, INK, true);
    acts.forEach((a, i) => {
      const cx = MARGIN + 110 + (i % cols) * colW;
      const cy = d.y + 8 + Math.floor(i / cols) * rowH;
      const nm = String(a.planet ?? "").toLowerCase().replace(/_/g, " ") + " ";
      drawText(pdf, nm, cx, cy, nameP);
      drawText(pdf, `${a.gate}.${a.line}`, cx + measure(pdf, nm, nameP), cy, gateP);
    });
    d.gap(h);
    d.space(4);
    d.rect(MARGIN, d.y, CONTENT_W, 0.5, VALUE_RULE);
  };
  const pers = Array.isArray(c.personality) ? c.personality : [];
  const des = Array.isArray(c.design) ? c.design : [];
  let techPage = null;
  if (tier >= 2 && pers.length + des.length > 0) {
    /**
     * FIX 6A (Jeremy 10/19): the same grid, NAMED AND EXPLAINED -- the page
     * folds it closed under the same heading; a PDF cannot fold. A newcomer
     * read "sun 21.5 · earth 48.5" as numbers with no meaning given.
     */
    // Compact on purpose: page 2 is nearly full on a long reading, and the
    // page count must not change for this (Jeremy's 6A). The grid below runs
    // five across instead of four, which pays for the heading and the line.
    const how = d.L(TECH_HOW, paint(8, DIM), CONTENT_W);
    const head = `${techTitle(pers.length + des.length)} ${TECH_TITLE_NOTE}`.toUpperCase();
    if (d.keepClosing) {
      // The whole technical block travels with the closing note under it (fix 6).
      const rowsH = [pers, des].filter((a) => a.length).reduce((n, a) => n + 5 + Math.ceil(a.length / 5) * 12 + 4 + 0.5, 0);
      const note = d.L(ONWARD_NOTE, paint(9, DIM), CONTENT_W);
      d.need(8 + 12 + how.height + 4 + 0.8 + rowsH + 14 + note.height);
    }
    d.need(8 + 12 + how.height + 4 + 40);
    d.space(8);
    const headW = drawText(pdf, head, MARGIN, d.y + 8, paint(7.5, GOLD, true, 0.15));
    if (marked?.has("planetNumbers")) drawText(pdf, "PROVISIONAL", MARGIN + headW + 6, d.y + 8, TAG_PAINT);
    techPage = d.pageNo;
    d.gap(12);
    d.draw(how);
    d.space(4);
    d.rule(RULE, 0.8);
    if (pers.length) activationRow("Personality", pers);
    if (des.length) activationRow("Design", des);
  }

  // The tiers below the reading end on a calm page of their own (10/16,
  // option B): the onward note and the offer used to spill onto page 3 as
  // one stray block under a page-2 running head.
  if (tier < 2) return nextStepsPage(d, tier);

  // The onward pointer: both free pages, in the voice of an invitation.
  let onward = d.L(ONWARD_NOTE, paint(9, DIM), CONTENT_W);
  d.space(14);
  d.need(onward.height);
  d.closing("note", techPage !== null && d.pageNo !== techPage);
  // Off page 2 the note names the page, as the chart tier's does ("above" pointed at nothing).
  if (d.pageNo !== 2) onward = d.L(ONWARD_NOTE_PAGE, paint(9, DIM), CONTENT_W);
  const noteTop = d.y;
  d.draw(onward);
  linkOnward(d, onward, noteTop);
  d.noteEnd = { page: d.pageNo, y: d.y };
}

function linkOnward(d, layout, top) {
  for (const [phrase, uri] of ONWARD_LINKS) {
    for (const r of phraseRects(d.pdf, layout, phrase)) {
      d.link({ left: r.left + MARGIN, top: r.top + top, right: r.right + MARGIN, bottom: r.bottom + top }, uri);
    }
  }
}

/**
 * A soft line toward the next tier, on the tiers that can be offered more
 * (a shop-only block: the phone sells nothing). It says WHERE the credit
 * lives. Null when there is nothing sellable above this tier.
 */
function offerLayouts(d, tier) {
  if (tier >= 2) return null;
  const next = sellable(tier + 1) ? TIERS[tier + 1] : null;
  if (!next) return null;
  const label = (TIERS[tier]?.label ?? "").replace(/^The\s+/i, "").toUpperCase();
  const head = `IF YOU WOULD LIKE MORE THAN THIS ${label}`.trim();
  const body = d.L(
    `${next.label} contains ${lowerFirst(next.blurb)} What you have already paid comes off ` +
      "the price, and the link in your email is what proves it — so opening this from there " +
      "means the credit is already applied. Nobody pays twice for the same thing.",
    paint(10, INK),
  );
  return { head, body };
}

/** A small gold label over a gold rule, as YOUR CHART VALUES has on page 2. */
function sectionLabel(d, text) {
  drawText(d.pdf, text, MARGIN, d.y + 8, paint(7.5, GOLD, true, 0.17));
  d.gap(13);
  d.rule(RULE, 0.8);
  d.gap(10);
}

/**
 * The chart tier's last page (Jeremy 10/16, item 12 option B, mock page 13):
 * the free library note, then the offer, each under its own label, on a page
 * of their own every time. Measured, never estimated: if the chart values
 * already ran onto page 3 and there is room under them, it follows them there
 * and the note keeps "Every word above", which is then true.
 */
function nextStepsPage(d, tier) {
  const o = offerLayouts(d, tier);
  let onward = d.L(ONWARD_NOTE, paint(10, INK), CONTENT_W);
  const total = 10 + 23 + onward.height + 34 + 23 + (o ? o.body.height : 0);
  if (d.pageNo >= 3 && d.y + 40 + total <= d.bottom) {
    d.gap(40);
  } else {
    onward = d.L(ONWARD_NOTE_PAGE, paint(10, INK), CONTENT_W);
    d.start(NEXT_STEPS_HEAD);
    d.gap(10);
  }
  sectionLabel(d, "FREE TO READ, EITHER WAY");
  const noteTop = d.y;
  d.draw(onward);
  linkOnward(d, onward, noteTop);
  if (o) {
    d.gap(34);
    sectionLabel(d, o.head);
    d.draw(o.body);
  }
  // The coaching card ends this PDF too (fix 10B).
  d.gap(18);
  coachPanel(d, coachLayouts(d));
}

function lowerFirst(s) {
  return typeof s === "string" && s ? s[0].toLowerCase() + s.slice(1) : "";
}

/* ----------------------------------------------------------------- Start here */

const START_HERE = "Start here";
const LIST_W = 470;

/**
 * Pages 3 and 4, "Start here": centers on page 3, channels and profile from
 * page 4 (call 1: two pages, never one crowded one). The profile Takeaway is
 * the two profile-line sentences ONLY -- the glance box keeps its Profile
 * sentence (call 4).
 */
function startHere(d, v, c) {
  d.start(START_HERE);
  const firstPage = d.pageNo;
  /**
   * WITH NO BIRTH TIME, the lists whose values change during the birth day
   * carry the tag beside their label, as every other place they print does
   * (Jeremy 10/22: "wherever it prints").
   */
  const marked = measured(c) ? markedFields(c) : new Set();
  const others = marked.has("undefinedCenters") || marked.has("openCenters");

  const defined = v.definedCenters.map((it) => itemBlock(d, it, false));
  const other = v.otherCenters.map((it) => itemBlock(d, it, true));
  sectionHead(d, 1, "Your centers", "", 15 + (defined[0]?.h ?? 20));
  subLabel(d, `Colored in (${v.definedCenters.length}) · steady, yours`, defined[0]?.h ?? 20, marked.has("definedCenters"));
  if (!defined.length) plainLine(d, "None colored in.");
  else itemList(d, defined, () => CENTERS);
  if (other.length) {
    d.gap(4);
    subLabel(d, `Not colored in (${other.length}) · taken in from others`, other[0].h, others);
    itemList(d, other, () => CENTERS);
  }
  takeaway(d, v.centersTakeaway, c);

  if (d.pageNo === firstPage) d.start(START_HERE);
  const chans = v.channels.map((it) => itemBlock(d, it, false));
  sectionHead(d, 2, "Your channels", `(${v.channels.length})`, chans[0]?.h ?? 20, marked.has("channels"));
  if (!chans.length) plainLine(d, NO_CHANNELS);
  else itemList(d, chans, (it) => channelLink(it.title));
  takeaway(d, v.channelsTakeaway, c);

  const lines = v.profileLines.map((it) => itemBlock(d, it, false));
  sectionHead(d, 3, "Your profile", v.profile, lines[0]?.h ?? 20, marked.has("profile"));
  itemList(d, lines, (it) => lineLink(it.title));
  takeaway(d, v.profileLinesTakeaway, c);
}

/** A gold-ringed number, the section title, a dim count beside it, and the tag when it can change. */
function sectionHead(d, n, title, count, keep, tag = false) {
  const pdf = d.pdf;
  const h = 24;
  d.need(22 + h + keep);
  d.gap(d.y > MARGIN + 40 ? 22 : 2);
  const cy = d.y + 9;
  pdf.save();
  pdf.circle(MARGIN + 8, cy, 8).lineWidth(0.9).strokeColor(RULE).stroke();
  pdf.restore();
  const np = paint(9, GOLD, true);
  drawText(pdf, String(n), MARGIN + 8 - measure(pdf, String(n), np) / 2, cy + 3.2, np);
  const tp = paint(13, GOLD, true);
  drawText(pdf, title, MARGIN + 24, cy + 4.6, tp);
  let x = MARGIN + 24 + measure(pdf, title, tp);
  if (count) x += 8 + drawText(pdf, count, x + 8, cy + 4.6, paint(9.5, DIM));
  if (tag) drawText(pdf, "PROVISIONAL", x + 8, cy + 4.6, TAG_PAINT);
  d.gap(h);
}

function subLabel(d, text, keep, tag = false) {
  d.need(15 + keep);
  d.gap(2);
  const w = drawText(d.pdf, text.toUpperCase(), MARGIN, d.y + 8, paint(7.5, DIM, false, 0.12));
  if (tag) drawText(d.pdf, "PROVISIONAL", MARGIN + w + 6, d.y + 8, TAG_PAINT);
  d.gap(13);
}

function plainLine(d, text) {
  d.block(d.L(text, paint(10.5, INK), LIST_W), MARGIN, 4);
}

/** One list row, measured before it is drawn so it never splits across pages. */
function itemBlock(d, item, dim) {
  const line = item.line ? d.L(item.line, paint(dim ? 9.5 : 10, dim ? DIM : INK), LIST_W - 12) : null;
  return { item, dim, line, h: 6 + 13 + (line ? 3 + line.height : 0) + 6 };
}

/** "Throat · how you speak and act" over the library line on a teal bar. */
function itemList(d, items, href) {
  const pdf = d.pdf;
  items.forEach((b, i) => {
    d.need(b.h + 1);
    if (i > 0) d.rect(MARGIN, d.y, LIST_W, 0.5, HAIR);
    d.gap(6);
    const base = d.y + 10;
    const size = b.dim ? 10 : 10.5;
    let x = MARGIN;
    const titleP = paint(size, b.dim ? DIM : GOLD, true);
    x += drawText(pdf, b.item.title, x, base, titleP);
    if (!b.dim && b.item.name && b.item.name !== b.item.title) {
      x += drawText(pdf, " " + b.item.name, x, base, paint(size, INK, true));
    }
    // The item's own words (title and name, not the dim tag) open its library entry.
    d.link({ left: MARGIN, top: base - (1900 / 2048) * size, right: x, bottom: base + (500 / 2048) * size }, href(b.item));
    if (b.item.tag) drawText(pdf, " · " + b.item.tag, x, base, paint(9, DIM));
    d.gap(13);
    if (b.line) {
      d.gap(3);
      d.rect(MARGIN + 1, d.y - 1, 1.6, b.line.height + 2, LIB_TEAL);
      drawLayout(pdf, b.line, MARGIN + 12, d.y);
      d.gap(b.line.height);
    }
    d.gap(6);
  });
}

/** "TAKEAWAY" on a gold bar, then the reading's own sentences. Kept whole. */
function takeaway(d, lines, c) {
  if (!lines.length) return;
  const ls = lines.map((t) => d.L(t, paint(10.5, INK), LIST_W - 14));
  const h = 14 + ls.reduce((n, l) => n + l.height + 5, 0);
  d.gap(8);
  d.need(h + 4);
  const top = d.y;
  drawText(d.pdf, "TAKEAWAY", MARGIN + 14, d.y + 8, paint(7.5, GOLD, true, 0.14));
  d.gap(14);
  // The reading's own sentences, so their Human Design words link (fix 7).
  for (const l of ls) {
    d.draw(l, MARGIN + 14, termSpans(l.text, c));
    d.gap(5);
  }
  d.rect(MARGIN, top, 2.5, d.y - 3 - top, RULE);
}

/* -------------------------------------------------------------------- reading */

/** No widows or orphans: a paragraph splits only with at least this many lines each side. */
const MIN_SPLIT_LINES = 2;

/**
 * The least of a paragraph that may stand at the foot of a page: its first
 * whole sentences, two lines of them at least (flowParagraph breaks only
 * between sentences), else the whole paragraph. A section's label and bold
 * lead are kept with this much, so they never end a page alone.
 */
function firstPieceHeight(d, l, width) {
  const text = l.text.replace(/\n/g, " ");
  for (const m of text.matchAll(SENTENCE_END)) {
    const probe = new Layout(d.pdf, text.slice(0, m.index + m[0].length).trim(), l.paint, width);
    if (probe.lineCount >= MIN_SPLIT_LINES) return Math.min(probe.height, l.height);
  }
  return l.height;
}

/** The library entry behind a margin label, by what the label names. */
function noteHref(label, c) {
  if (label.endsWith("AUTHORITY")) return AUTHORITY;
  if (label === "CENTER") return CENTERS;
  if (label === "DEFINITION") return DEFINITION;
  if (label.startsWith("PROFILE")) return profileLink(c.profile);
  if (label === "INCARNATION CROSS") return crossLink(c.incarnationCross);
  if (label.includes("TRACK") || label === String(c.type ?? "").toUpperCase()) return typeLink(c.type);
  return null;
}

/** The height the PROVISIONAL tag adds under a margin note's label (the phone's NOTE_TAG_H). */
const NOTE_TAG_H = 9;

/** How much of a page "Your reading" needs under its big title before it may start there. */
const READING_START_ROOM = 260;

function readingPages(d, c, v) {
  const pdf = d.pdf;
  if (d.y < d.bottom - READING_START_ROOM) {
    /**
     * FIX 17A (Jeremy 10/19): the written reading starts on the page Start
     * here ends on (page 4), under a big title of its own, instead of leaving
     * that page half empty. A rule closes Start here; the running head of
     * every page after this one says "Your reading".
     */
    d.gap(26);
    d.rule(RULE, 1.2);
    d.gap(14);
    drawText(pdf, "Your reading", MARGIN, d.y + 18, paint(22, INK, true));
    d.gap(34);
    d.head = "Your reading";
  } else {
    d.start("Your reading");
  }
  const notes = marginNotes(c);
  // An unknown birth time: a margin value that changes that day carries the tag under its label (10/22, as the phone).
  const marked = measured(c) ? markedFields(c) : null;
  const tagged = (label) => Boolean(marked) && marginFields(label, c).some((f) => marked.has(f));

  for (const section of v.reading) {
    const h = section.heading;
    const head = d.L(h.toUpperCase(), paint(9, GOLD, true, 0.16), BODY_W);
    const ledeL = section.lede ? d.L(section.lede, paint(13, INK, true), BODY_W) : null;
    const bodyLs = section.paragraphs.map((p) => d.L(p, paint(10.5, INK), BODY_W));

    // Chart facts for the margin, always from the chart; beside the FIRST
    // part of the section only.
    const noteLs = (notes[h] ?? []).map(([k, val]) => [
      k ? d.L(k, paint(8.5, GOLD, true, 0.09), NOTE_W) : null,
      d.L(String(val ?? ""), paint(8.5, DIM), NOTE_W),
      k,
    ]);
    const notesH = noteLs.reduce((n, [kl, vl, k]) => n + (kl?.height ?? 0) + (tagged(k) ? NOTE_TAG_H : 0) + vl.height + 9, 0);

    // What must stay together: the label, the bold lead, and the first piece
    // of the first paragraph that may end a page (whole sentences, two lines).
    const lead = head.height + 6 + (ledeL ? ledeL.height + 8 : 0);
    const firstMin = bodyLs[0] ? firstPieceHeight(d, bodyLs[0], BODY_W) : 0;
    d.need(16 + Math.max(lead + firstMin, notesH));
    d.gap(d.atTop ? 0 : 16);

    let ny = d.y;
    for (const [kl, vl, k] of noteLs) {
      if (kl) {
        drawLayout(pdf, kl, NOTE_X, ny);
        const href = noteHref(k, c);
        if (href) d.linkLayout(kl, NOTE_X, ny, href);
        ny += kl.height;
      }
      if (tagged(k)) {
        drawText(pdf, "PROVISIONAL", NOTE_X, ny + 7, TAG_PAINT);
        ny += NOTE_TAG_H;
      }
      drawLayout(pdf, vl, NOTE_X, ny);
      ny += vl.height + 9;
    }

    // The gold rule follows the section onto each page it occupies.
    let partTop = d.y;
    const rule = (bottom) => d.rect(RULE_X, partTop + 2, 0.8, bottom - 4 - (partTop + 2), RULE);

    d.draw(head, MARGIN);
    d.gap(6);
    if (ledeL) {
      d.draw(ledeL, MARGIN, termSpans(ledeL.text, c));
      d.gap(8);
    }
    for (const l of bodyLs) {
      flowParagraph(
        d,
        l,
        () => rule(d.y + 9),
        () => {
          partTop = d.y;
        },
        (text) => termSpans(text, c),
        BODY_W,
      );
      d.gap(9);
    }
    rule(d.y);
  }

  const panel = coachLayouts(d);
  // When the card cannot be pulled up, the last thing to try travels with it, so it never ends the PDF alone (fix 6).
  takeaways(d, v.takeaways, d.keepClosing ? coachNeed(d, panel) + 8 : disclaimerLayout(d).height + 28, c);
  coachPanel(d, panel);
  disclaimer(d);
}

/**
 * FIX 10B (Jeremy 10/19): the coaching card at the end of the reading -- his
 * current photo (approach-candid.jpg, cropped round), "Talk it through with
 * Jeremy", and the free 30-minute conversation. Kept on the page of the
 * disclaimer under it; the PDF may grow a page for it.
 */
function coachLayouts(d) {
  const textW = CONTENT_W - 100;
  return {
    head: d.L(COACH.head, paint(12, INK, true), textW),
    body: d.L(COACH.body, paint(10, INK), textW),
    link: d.L(`${COACH.link} → ${COACH.shown}`, paint(10, LIB_TEAL, true), textW),
  };
}

/** The room the coaching card and the disclaimer under it take. */
function coachNeed(d, { head, body, link }) {
  const h = Math.max(70, 12 + head.height + 3 + body.height + 6 + link.height + 12);
  return 16 + h + 20 + disclaimerLayout(d).height + 2;
}

function coachPanel(d, { head, body, link }) {
  const pdf = d.pdf;
  const h = Math.max(70, 12 + head.height + 3 + body.height + 6 + link.height + 12);
  d.need(16 + h + 20 + disclaimerLayout(d).height + 2);
  d.closing("card");
  d.gap(16);
  const top = d.y;
  pdf.save();
  pdf.roundedRect(MARGIN, top, CONTENT_W, h, 8).lineWidth(0.9).strokeColor(LIB_TEAL).stroke();
  pdf.restore();
  const r = 25;
  const cx = MARGIN + 15 + r;
  const cy = top + h / 2;
  try {
    pdf.save();
    pdf.circle(cx, cy, r).clip();
    pdf.image(JEREMY_JPG, cx - r, cy - r, { width: 2 * r, height: 2 * r });
    pdf.restore();
  } catch {
    pdf.restore(); // no photo is a card without one, never a failed download
  }
  const x = MARGIN + 80;
  let y = top + 12;
  drawLayout(pdf, head, x, y);
  y += head.height + 3;
  drawLayout(pdf, body, x, y);
  y += body.height + 6;
  drawLayout(pdf, link, x, y);
  d.linkLayout(link, x, y, COACH.url);
  d.y = top + h;
}

/**
 * One paragraph, carried onto the next page when it does not fit -- BETWEEN
 * SENTENCES, never inside one (10/22: "What you take in from others" broke
 * mid-sentence across pages 7 and 8). The page keeps as many whole sentences
 * as fit, at least two lines of them; the rest starts the next page. A
 * paragraph with no sentence end that fits there moves whole. Only a sentence
 * taller than a whole page is split between lines (two at least each side).
 *
 * `spansFor(text)` gives the term links of a piece of text; `width` is the
 * paragraph's column (the lonely-word rule may have laid `l` out narrower).
 */
function flowParagraph(d, l, onBreak, onNewPage, spansFor = null, width = l.width) {
  const spans = (x) => (spansFor ? spansFor(x.text) : null);
  const turn = () => {
    onBreak();
    d.breakPage();
    onNewPage();
  };
  let cur = l;
  for (;;) {
    if (cur.height <= d.bottom - d.y) {
      d.draw(cur, MARGIN, spans(cur));
      return;
    }
    const cut = sentenceCut(d, cur, d.bottom - d.y, width);
    if (cut) {
      d.draw(cut.first, MARGIN, spans(cut.first));
      turn();
      cur = cut.rest;
    } else if (!d.atTop) {
      turn();
    } else {
      splitLines(d, cur, turn, spans(cur));
      return;
    }
  }
}

/** Where a sentence ends and another begins: after . ! ? (and a closing quote), before a capital. */
const SENTENCE_END = /[.!?]["”’)]*(?=\s+["“‘(]?[A-Z0-9])/g;

/**
 * The most whole sentences of `l` that fit in `room` (at least two lines), as
 * { first, rest } layouts; null when none do. Measured with plain layouts, so
 * only the two pieces actually drawn are laid out the full way.
 */
function sentenceCut(d, l, room, width) {
  const text = l.text.replace(/\n/g, " ");
  const cuts = [...text.matchAll(SENTENCE_END)].map((m) => m.index + m[0].length);
  for (let i = cuts.length - 1; i >= 0; i--) {
    const head = text.slice(0, cuts[i]).trim();
    const probe = new Layout(d.pdf, head, l.paint, width);
    if (probe.height > room) continue;
    if (probe.lineCount < MIN_SPLIT_LINES) return null;
    const first = d.L(head, l.paint, width);
    if (first.height > room) continue;
    return { first, rest: d.L(text.slice(cuts[i]).trim(), l.paint, width) };
  }
  return null;
}

/** A sentence taller than a page: between lines, at least two each side. */
function splitLines(d, l, turn, spans) {
  const n = l.lineCount;
  let from = 0;
  while (from < n) {
    const avail = d.bottom - d.y;
    let fit = 0;
    while (from + fit < n && l.lineTop(from + fit + 1) - l.lineTop(from) <= avail) fit++;
    if (from + fit === n) {
      d.drawLines(l, from, n, MARGIN, spans);
      return;
    }
    let take = Math.min(fit, n - from - MIN_SPLIT_LINES);
    if (take < MIN_SPLIT_LINES) take = Math.max(fit, 1);
    d.drawLines(l, from, from + take, MARGIN, spans);
    from += take;
    turn();
  }
}

/**
 * The takeaways, as a list. Each opens with the chart feature it comes from,
 * in parentheses, lifted out and set in gold. The heading, the intro and the
 * first item travel together; the last item travels with the disclaimer.
 */
function takeaways(d, paras, keepWith = 0, c = null) {
  if (!paras.length) return;
  const head = d.L(TAKEAWAYS.toUpperCase(), paint(9, GOLD, true, 0.16), 470);
  const intro = paras[0] ? d.L(paras[0], paint(10.5, INK), 470) : null;
  const feature = /^\((.+?)\)\s*(.+)$/s;
  const items = paras.slice(1).map((p) => {
    const m = feature.exec(p);
    const lead = m?.[1] ?? "";
    const l = d.L(m?.[2] ?? p, paint(11, INK), 470 - 16);
    return [lead ? d.L(lead, paint(11, GOLD, true), 470 - 16) : null, l];
  });
  const firstItem = items[0] ? 12 + (items[0][0]?.height ?? 0) + items[0][1].height : 0;
  d.need(18 + head.height + 8 + (intro ? intro.height + 4 : 0) + firstItem + (items.length <= 1 ? keepWith : 0));
  d.gap(d.atTop ? 0 : 18);
  d.draw(head);
  d.gap(8);
  if (intro) {
    d.need(intro.height);
    d.draw(intro, MARGIN, termSpans(intro.text, c));
    d.gap(4);
  }
  items.forEach(([leadL, l], i) => {
    const h = (leadL?.height ?? 0) + l.height;
    d.need(h + 12 + (i === items.length - 1 ? keepWith : 0));
    d.gap(9);
    d.rect(MARGIN, d.y + 6, 8, 1.5, RULE);
    if (leadL) d.draw(leadL, MARGIN + 16);
    d.draw(l, MARGIN + 16, termSpans(l.text, c));
  });
}

const disclaimerLayout = (d) => d.L(DISCLAIMER, paint(8.5, DIM));

function disclaimer(d) {
  const l = disclaimerLayout(d);
  d.need(l.height + 22);
  d.gap(20);
  d.rule("#DEE3E8", 0.6);
  d.gap(7);
  d.draw(l);
}

/** Fallback when the structure gate did not pass but there are still words. */
function plainReading(d, reading) {
  d.start("Your reading");
  for (const para of reading.split("\n\n").map((p) => p.trim()).filter(Boolean)) {
    d.block(d.L(para, paint(10.5, INK), 470), MARGIN, 9);
  }
}

export { lineMetrics };
