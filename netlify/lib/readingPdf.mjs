import PDFDocument from "pdfkit";
import SVGtoPDF from "svg-to-pdfkit";
import { TIERS } from "../../shared/pricing.mjs";
import { OUTFIT_400, OUTFIT_600 } from "./fonts/outfit.mjs";
import { AUTHORITY_NOTES, STRATEGY_NOTES, TYPE_NOTES, describe } from "./mechanics.mjs";

/**
 * The chart tier's PDF, in the app's format.
 *
 * REBUILT AGAINST THE APP'S OWN OUTPUT, which Jeremy asked me to look at rather
 * than guess from. `tools/reading-layout/sample-output-ON-DEVICE.pdf` settled
 * all of this, and the first web version matched none of it:
 *
 *   PAPER, NOT NAVY. A dark page is a screenshot pretending to be a document —
 *   it costs a cartridge to print, and the pale gate numerals that read well on
 *   a lit screen close up on paper. The engine renders a print palette for
 *   exactly this, returned alongside the screen one.
 *
 *   A GOLD-RULED BOX of value-plus-sentence rows, which is where the approved
 *   Type, Strategy and Authority sentences belong. The app already had the
 *   shape; this fills it with the same words the page shows.
 *
 *   A PLAIN VALUES TABLE under it — thin rules, no border — for the things that
 *   are values rather than explanations.
 *
 *   A LEGEND under the drawing, so somebody holding the page alone can read it.
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

export function readingPdf({ tier, name, output }) {
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

    chartPage(doc, { name, output });
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

function chartPage(doc, { name, output }) {
  paper(doc);

  doc
    .font("body")
    .fontSize(8.5)
    .fillColor(GOLD)
    .text("THE CHAMPAGNE METHOD", M, M, { characterSpacing: 1.7 });
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
   * The PRINT drawing, not the screen one. Falls back to the screen version for
   * a reading stored before the print palette existed — a legible dark chart
   * beats a blank page.
   */
  const svg =
    typeof output?.bodygraphPrintSvg === "string"
      ? output.bodygraphPrintSvg
      : typeof output?.bodygraphSvg === "string"
        ? output.bodygraphSvg
        : null;

  const legendTop = PAGE.h - 118;
  if (svg) {
    const top = ruleY + 18;
    SVGtoPDF(doc, svg, M, top, {
      width: COL,
      height: legendTop - top - 12,
      preserveAspectRatio: "xMidYMid meet",
      fontCallback: (family, bold, italic, opts) =>
        bold || Number(opts?.["font-weight"]) >= 500 ? "bold" : "body",
    });
  }

  doc
    .font("body")
    .fontSize(9)
    .fillColor(MUTED)
    .text(
      "Filled centres are consistently yours. Open centres take their colour from whoever is " +
        "nearby. The numbers are the gates — the filled ones are active in your chart.",
      M,
      legendTop,
      { width: COL, lineGap: 2 },
    );

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

  /**
   * The gold-ruled box: a value and a sentence about it, which is the app's
   * shape and the reason the sentences were written.
   */
  const rows = [
    ["TYPE", output?.type, describe(TYPE_NOTES, output?.type)],
    ["STRATEGY", output?.strategy, describe(STRATEGY_NOTES, output?.strategy)],
    ["AUTHORITY", output?.authority, describe(AUTHORITY_NOTES, output?.authority)],
  ].filter(([, v]) => v);

  let y = M + 26;
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

  const values = [
    ["Definition", output?.definition],
    ["Incarnation cross", output?.incarnationCross],
    ["Signature", output?.signature],
    ["Not-self theme", output?.notSelfTheme],
    ["Defined centres", (output?.definedCenters ?? []).join(", ")],
    ["Open centres", (output?.openCenters ?? []).join(", ")],
    ["Channels", (output?.channels ?? []).join("   ")],
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

function lowerFirst(s) {
  return typeof s === "string" && s ? s[0].toLowerCase() + s.slice(1) : "";
}
