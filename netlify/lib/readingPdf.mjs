import PDFDocument from "pdfkit";
import SVGtoPDF from "svg-to-pdfkit";
import QRCode from "qrcode";
import { TIERS } from "../../shared/pricing.mjs";
import { OUTFIT_400, OUTFIT_600 } from "./fonts/outfit.mjs";
import {
  AUTHORITY_NOTES,
  NOT_SELF_NOTES,
  PROFILE_NOTES,
  SIGNATURE_NOTES,
  STRATEGY_NOTES,
  TYPE_NOTES,
  describe,
} from "./mechanics.mjs";

/**
 * The chart tier's PDF, in the app's format.
 *
 * REBUILT AGAINST THE APP'S CURRENT OUTPUT — `Jeremy-pdf-view.pdf`, and it took
 * three files to get there. The August sample in the repo draws the chart light
 * on a white page; a preliminary run he shared moved the legend to page two;
 * this is the one he called final. The lesson is cheap and worth keeping: ASK
 * WHICH FILE IS CURRENT before matching one, because every version of it looked
 * authoritative on its own.
 *
 *   A PAPER PAGE WITH A NAVY PANEL. The page is white and the chart stays dark,
 *   inset. Which is exactly what the website already does on screen — "the
 *   chart wears its navy as a panel on the violet page" — so there was never a
 *   second drawing to make. The screen SVG is the PDF's drawing.
 *
 *   A GOLD-RULED BOX of value-plus-sentence rows, which is where the approved
 *   Type, Strategy and Authority sentences belong. The app already had the
 *   shape; this fills it with the same words the page shows.
 *
 *   A PLAIN VALUES TABLE under it — thin rules, no border — for the things that
 *   are values rather than explanations.
 *
 *   THE LEGEND IS ON PAGE ONE, under the drawing, and it is a key to the
 *   CHANNEL LINES — personality, design, both, open. Under the chart is where
 *   it belongs: it explains what is directly above it, and somebody who prints
 *   only the first page still has it.
 *
 *   A FOOTER of name and page number, and NO DATE. Jeremy asked for today's
 *   date off it, and he is right: a generation date on a document about a fixed
 *   birth moment only invites the question of whether it has changed.
 *
 * WHAT THE WEB CANNOT MATCH, and does not pretend to: the app prints the birth
 * moment under the name. We do not keep it, by his own ruling, so the heading
 * is the name alone.
 *
 * The personality and design activation grids are absent for a different
 * reason — they are the READING tier, and this document is the chart tier.
 */

const PAPER = "#FCFBF8";
const INK = "#2A2620";
const MUTED = "#8A8272";
const GOLD = "#C9A227";
const RULE = "#E3DDCB";

const PAGE = { w: 612, h: 792 };
const M = 56;
const COL = PAGE.w - M * 2;

export async function readingPdf({ tier, name, output, links }) {
  /**
   * The QR, drawn as vector rather than raster so it stays crisp at any size
   * and costs a few hundred bytes. The app has one beside the same link; a
   * printed page cannot be clicked, and retyping a URL from paper is a thing
   * nobody does.
   */
  const guide = links?.bodygraph ?? "https://thechampagnemethod.co/library/bodygraph/";
  let qr = null;
  try {
    qr = await QRCode.toString(guide, { type: "svg", margin: 0, errorCorrectionLevel: "M" });
  } catch {
    /* a missing QR is a page without a QR, never a failed download */
  }

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: [PAGE.w, PAGE.h],
      margin: 0,
      /**
       * The initial font is ours, and this is the fix for a 500 that three
       * local checks passed: PDFDocument loads Helvetica in its constructor by
       * requiring a file the deployed bundle does not contain. A buffer also
       * has no path to get wrong — the path version was right in the repo and
       * wrong the moment esbuild moved the module.
       */
      font: OUTFIT_400,
      info: {
        Title: name ? `${name} — Human Design` : "Human Design",
        Author: "The Champagne Method",
        Creator: "thechampagnemethod.co",
      },
    });

    const chunks = [];
    doc.on("data", (c) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    doc.registerFont("body", OUTFIT_400);
    doc.registerFont("bold", OUTFIT_600);

    chartPage(doc, { name, output, links, qr });
    doc.addPage();
    glancePage(doc, { output, tier });

    doc.end();
  });
}

function paper(doc) {
  doc.rect(0, 0, PAGE.w, PAGE.h).fill(PAPER);
}

const HOME = "https://thechampagnemethod.co";

/**
 * Name on the left, page number on the right. No date, by his instruction.
 *
 * THE NAME IS A LINK, which is what he asked for -- a PDF is read on a screen
 * far more often than it is printed, and a URL somebody has to retype is a URL
 * nobody follows. `link` and `underline` are pdfkit's own, so the annotation is
 * a real one rather than blue text pretending.
 */
function footer(doc, page) {
  const y = PAGE.h - 46;
  doc.font("body").fontSize(8.5).fillColor(MUTED);
  doc.text("The Champagne Method · thechampagnemethod.co", M, y, {
    width: COL * 0.7,
    link: HOME,
    underline: false,
  });
  doc.fillColor(MUTED).text(String(page), PAGE.w - M - 40, y, { width: 40, align: "right" });
}

function chartPage(doc, { name, output, links, qr }) {
  paper(doc);

  doc
    .font("body")
    .fontSize(8.5)
    .fillColor(GOLD)
    .text("THE CHAMPAGNE METHOD · HUMAN DESIGN INTERPRETATION", M, M, {
      characterSpacing: 1.7,
    });
  doc
    .font("bold")
    .fontSize(26)
    .fillColor(INK)
    .text(name || "Your Human Design", M, doc.y + 6, { width: COL });

  const oneLine = [
    output?.type,
    output?.profile && `Profile ${output.profile}`,
    output?.authority && `${output.authority} authority`,
  ]
    .filter(Boolean)
    .join("  ·  ");
  if (oneLine) {
    doc.font("body").fontSize(11).fillColor(MUTED).text(oneLine, M, doc.y + 8, { width: COL });
  }

  const ruleY = doc.y + 12;
  doc.moveTo(M, ruleY).lineTo(PAGE.w - M, ruleY).strokeColor(GOLD).lineWidth(1).stroke();

  /**
   * THE SCREEN DRAWING, dark, on a paper page — which is the app's design and
   * was the whole thing I got backwards. The SVG carries its own navy ground
   * and border, so the panel comes for free: nothing here draws a rectangle.
   */
  const svg = typeof output?.bodygraphSvg === "string" ? output.bodygraphSvg : null;
  const legendTop = PAGE.h - 150;
  if (svg) {
    const top = ruleY + 20;
    SVGtoPDF(doc, svg, M, top, {
      width: COL,
      height: legendTop - top - 14,
      preserveAspectRatio: "xMidYMid meet",
      fontCallback: (family, bold, italic, opts) =>
        bold || Number(opts?.["font-weight"]) >= 500 ? "bold" : "body",
    });
  }

  channelKey(doc, legendTop, links, qr);
  footer(doc, 1);
}

function glancePage(doc, { output, tier }) {
  paper(doc);

  doc.font("body").fontSize(11).fillColor(INK).text("Your chart at a glance", M, M);
  doc
    .font("body")
    .fontSize(8.5)
    .fillColor(GOLD)
    .text("THE CHAMPAGNE METHOD", PAGE.w / 2, M + 1, {
      width: COL / 2,
      align: "right",
      characterSpacing: 1.7,
    });

  let y = M + 26;
  /**
   * The gold-ruled box: a value and a sentence about it, which is the app's
   * shape and the reason the sentences were written.
   */
  const rows = [
    ["TYPE", output?.type, describe(TYPE_NOTES, output?.type)],
    ["STRATEGY", output?.strategy, describe(STRATEGY_NOTES, output?.strategy)],
    ["AUTHORITY", output?.authority, describe(AUTHORITY_NOTES, output?.authority)],
    /**
     * ALL SIX CARRY A SENTENCE NOW. The three added later were drafted and
     * approved the same way as the first three: in the conversation, not in a
     * file somebody was pointed at.
     */
    ["PROFILE", output?.profile, profileNote(output?.profile)],
    ["SIGNATURE", output?.signature, describe(SIGNATURE_NOTES, output?.signature)],
    ["NOT-SELF", output?.notSelfTheme, describe(NOT_SELF_NOTES, output?.notSelfTheme)],
  ].filter(([, v]) => v);

  if (rows.length) {
    const labelW = 92;
    const textX = M + 14 + labelW;
    const textW = COL - 28 - labelW;
    const startY = y;

    let inner = y + 12;
    for (const [label, value, note] of rows) {
      doc
        .font("body")
        .fontSize(8)
        .fillColor(GOLD)
        .text(label, M + 14, inner + 2, { width: labelW - 10, characterSpacing: 1.1 });
      doc
        .font("bold")
        .fontSize(10.5)
        .fillColor(INK)
        .text(`${value}.`, textX, inner, { width: textW, continued: Boolean(note) });
      if (note) doc.font("body").fillColor(INK).text(` ${note}`, { width: textW });
      inner = doc.y + 12;
    }
    doc.rect(M, startY, COL, inner - startY - 2).strokeColor(GOLD).lineWidth(1).stroke();
    y = inner + 22;
  }

  doc
    .font("body")
    .fontSize(8.5)
    .fillColor(GOLD)
    .text("YOUR CHART VALUES", M, y, { characterSpacing: 1.3 });
  y = doc.y + 8;

  /**
   * Channels arrive from the engine already named -- "20-34 (Charisma)" -- so
   * one per line rather than run together, which is how the app prints them and
   * the only way the names are readable.
   */
  const values = [
    ["Definition", output?.definition],
    ["Incarnation cross", output?.incarnationCross],
    ["Defined centres", (output?.definedCenters ?? []).join(", ")],
    ["Open centres", (output?.openCenters ?? []).join(", ")],
    ["Channels", (output?.channels ?? []).join("\n")],
  ].filter(([, v]) => v);

  const lw = 150;
  for (const [label, value] of values) {
    doc.moveTo(M, y).lineTo(PAGE.w - M, y).strokeColor(RULE).lineWidth(0.5).stroke();
    doc
      .font("body")
      .fontSize(8.5)
      .fillColor(MUTED)
      .text(label.toUpperCase(), M, y + 8, { width: lw - 12, characterSpacing: 1.1 });
    doc
      .font("body")
      .fontSize(10.5)
      .fillColor(INK)
      .text(String(value), M + lw, y + 6, { width: COL - lw });
    y = doc.y + 8;
  }
  doc.moveTo(M, y).lineTo(PAGE.w - M, y).strokeColor(RULE).lineWidth(0.5).stroke();

  if (output?.note) {
    doc.font("body").fontSize(9).fillColor(MUTED).text(String(output.note), M, y + 12, {
      width: COL,
    });
    y = doc.y;
  }

  /**
   * A soft line toward the next tier, which Jeremy asked for — and it NAMES
   * what is in it rather than saying "the rest of it". Nothing is asked of the
   * reader; the sentence describes and stops.
   */
  const next = TIERS[tier + 1];
  if (next) {
    const boxY = Math.min(y + 22, PAGE.h - 150);
    doc
      .font("body")
      .fontSize(8.5)
      .fillColor(GOLD)
      .text("IF YOU WOULD LIKE MORE", M, boxY, { characterSpacing: 1.3 });
    doc
      .font("body")
      .fontSize(10)
      .fillColor(INK)
      .text(
        `${next.label} adds ${lowerFirst(next.blurb)} What you have already paid comes off what ` +
          "you pay next — nobody pays twice for the same thing. ",
        M,
        doc.y + 6,
        { width: COL, lineGap: 1.5, continued: true },
      )
      .fillColor(GOLD)
      .text("humandesign.thechampagnemethod.co", {
        link: "https://humandesign.thechampagnemethod.co",
        underline: false,
      });
  }

  footer(doc, 2);
}

/**
 * A profile is a PAIR -- "2/4 -- Hermit / Opportunist" -- and there are twelve
 * of them. Rather than write twelve, each LINE is described and the pair reads
 * as its two halves, which is how the app names them too.
 */
function profileNote(profile) {
  const m = /^(\d)\s*\/\s*(\d)/.exec(String(profile ?? ""));
  if (!m) return null;
  const first = describe(PROFILE_NOTES, m[1]);
  const second = describe(PROFILE_NOTES, m[2]);
  if (!first || !second) return null;
  return `${first} ${second}`;
}

function lowerFirst(s) {
  return typeof s === "string" && s ? s[0].toLowerCase() + s.slice(1) : "";
}

/**
 * THE CHANNEL KEY, under the drawing it explains.
 *
 * Four ways a line between two gates can be drawn, and without this a reader is
 * looking at a picture full of them with no way to tell them apart. Under the
 * chart rather than on the next page, so somebody who prints only page one
 * still has it.
 *
 * The swatches are DRAWN rather than described, because "violet means design"
 * is useless beside a line whose violet you cannot check. Every one is
 * outlined: the personality line is near-white by design — it reads on navy and
 * would disappear on paper without a border.
 */
function channelKey(doc, top, links, qr) {
  const KEY = [
    ["#F0F3F9", "Personality", "conscious — what you know"],
    ["#7C5BFF", "Design", "unconscious — what the body knows"],
    ["#F0F3F9", "Both", "held consciously AND unconsciously", "#7C5BFF"],
    ["#1F3151", "Open", "not activated — open to others"],
  ];
  const half = COL / 2;
  doc.lineWidth(0.5);
  KEY.forEach(([colour, label, blurb, second], i) => {
    const cx = M + (i % 2) * half;
    const cy = top + Math.floor(i / 2) * 30;
    doc.roundedRect(cx, cy + 3, 30, second ? 4 : 7, 2).fillAndStroke(colour, RULE);
    if (second) doc.roundedRect(cx, cy + 8, 30, 4, 2).fillAndStroke(second, RULE);
    doc.font("bold").fontSize(9).fillColor(INK).text(label, cx + 40, cy, { width: half - 50 });
    doc.font("body").fontSize(7.5).fillColor(MUTED).text(blurb, cx + 40, doc.y, {
      width: half - 50,
    });
  });

  const guide = links?.bodygraph ?? "https://thechampagnemethod.co/library/bodygraph/";
  /**
   * ONE CENTRED LINE, not two joined with `continued`.
   *
   * The first version drew the sentence and the URL as two calls so the URL
   * could be gold, and they landed on top of each other -- `continued` carries
   * the pen position, and `align: "center"` re-centres each fragment
   * independently, so both were centred over the same span. The whole line is
   * the link now, which is also the larger tap target.
   */
  doc
    .font("body")
    .fontSize(9)
    .fillColor(GOLD)
    .text("How to understand your bodygraph chart  →  thechampagnemethod.co/library/bodygraph",
      M, top + 66, { width: COL, align: "center", link: guide, underline: false });
}
