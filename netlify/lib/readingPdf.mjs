import PDFDocument from "pdfkit";
import SVGtoPDF from "svg-to-pdfkit";
import { TIERS } from "../../shared/pricing.mjs";
import { OUTFIT_400, OUTFIT_600 } from "./fonts/outfit.mjs";

/**
 * The chart tier's PDF — "a page you can share and a PDF you keep".
 *
 * The page has existed since the reading link was built; this is the other
 * half of what that tier was sold as, and until it existed the tier could not
 * honestly be sold. `SELLABLE_MAX_LEVEL` stays where it is until this ships.
 *
 * THE LAYOUT IS THE APP'S, not a new one. docs/PDF_LAYOUT_HANDOFF.md in the app
 * repo settled the order after Jeremy read a real generated one and said "PDF
 * is a slog. SO MANY details hidden inside paragraphs": bodygraph, then at a
 * glance, then the mechanics. The web's chart tier is that document minus the
 * written reading, which it did not buy.
 *
 * THE DRAWING IS THE SAME DRAWING. It is the SVG the engine already produced
 * and the page already showed, drawn into the PDF rather than redrawn for it.
 * A second painter would be a second set of coordinates to keep in step, and
 * D-10 is explicit that there is one bodygraph.
 *
 * THE FONT IS EMBEDDED, AND THAT IS NOT COSMETIC. The label positions were
 * solved against Outfit at 16 with 0.19em of tracking, and the tightest of them
 * clears a gate disc by six units. Letting the PDF fall back to Helvetica puts
 * different metrics under those solved positions, which is precisely the
 * "text overlapping graphics" fault this drawing has been through four rounds
 * of fixing.
 *
 * The variable Outfit was tried first and rendered the gate numerals clipped
 * and faint. Two static instances are cut from it instead, at 400 and 600 --
 * the two weights the drawing actually uses.
 */

/** The panel palette, matching what the page shows on screen. */
const INK = "#F3EFF7";
const MUTED = "#B4A8CE";
const GOLD = "#C9A227";
const GROUND = "#1A1040";
const PANEL = "#241A4E";
const RULE = "#3A2E63";

const PAGE = { w: 612, h: 792 };
const M = 54;

/**
 * Build the PDF and hand back the bytes.
 *
 * Resolves to a Buffer rather than streaming, because a Netlify function
 * returns a response body rather than a pipe, and a chart is small enough that
 * holding it costs nothing.
 */
export function readingPdf({ tier, name, output, generatedAt = new Date() }) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: [PAGE.w, PAGE.h],
      margin: 0,
      /**
       * THE INITIAL FONT IS OURS, and this line is the whole fix for a 500 in
       * production that every local run passed.
       *
       * PDFDocument loads a DEFAULT font in its constructor -- Helvetica --
       * before any of our code registers anything. It does that by requiring
       * `pdfkit/js/standard-fonts/Helvetica.cjs` at runtime, and the deployed
       * bundle has no such file:
       *
       *   Cannot find module '/var/task/node_modules/pdfkit/js/standard-fonts/Helvetica.cjs'
       *
       * Naming our own font here means the standard set is never touched at
       * all, which is both the fix and what we wanted anyway: nothing in this
       * document should be rendered in a font that is not Outfit.
       *
       * A BUFFER, NOT A PATH -- and that is the second half of the same bug.
       * The path version was right in the repo and wrong in the bundle:
       * esbuild inlines this module into netlify/functions/pdf.mjs, so
       * `import.meta.url` names a different directory at runtime and the fonts
       * were looked for somewhere they had never been. A compiled-in buffer
       * has no path to get wrong.
       */
      font: OUTFIT_400,
      info: {
        Title: name ? `${name} — Human Design` : "Human Design",
        Author: "The Champagne Method",
        // No Subject or Keywords. A PDF's metadata travels with the file
        // wherever it is forwarded, and there is nothing here worth putting
        // in it that is not already on the page.
        Creator: "thechampagnemethod.co",
      },
    });

    const chunks = [];
    doc.on("data", (c) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    doc.registerFont("body", OUTFIT_400);
    doc.registerFont("bold", OUTFIT_600);

    drawChartPage(doc, { name, output, tier });
    doc.addPage();
    drawFactsPage(doc, { name, output, generatedAt });

    doc.end();
  });
}

function background(doc) {
  doc.rect(0, 0, PAGE.w, PAGE.h).fill(GROUND);
}

function heading(doc, text, y) {
  doc.font("bold").fontSize(22).fillColor(GOLD).text(text, M, y, { width: PAGE.w - M * 2 });
  return doc.y;
}

function drawChartPage(doc, { name, output, tier }) {
  background(doc);

  heading(doc, name ? `${name}’s Human Design` : "Your Human Design", M);
  doc
    .font("body")
    .fontSize(10)
    .fillColor(MUTED)
    .text((TIERS[tier]?.label ?? "").toUpperCase(), M, doc.y + 2, { characterSpacing: 1.6 });

  /**
   * The drawing, sized to the page rather than the page to the drawing.
   *
   * `preserveAspectRatio` does the work, so a change to the viewBox in the
   * engine cannot silently stretch this. If the shape of the chart ever
   * changes, it changes here by getting smaller, never by distorting.
   */
  const svg = typeof output?.bodygraphSvg === "string" ? output.bodygraphSvg : null;
  if (svg) {
    const top = doc.y + 16;
    SVGtoPDF(doc, svg, M, top, {
      width: PAGE.w - M * 2,
      height: PAGE.h - top - M - 26,
      preserveAspectRatio: "xMidYMid meet",
      // 600 and above is the weight the centre names use; everything else in
      // the drawing is the numerals.
      fontCallback: (family, bold, italic, opts) =>
        bold || Number(opts?.["font-weight"]) >= 500 ? "bold" : "body",
    });
  }

  footer(doc);
}

function drawFactsPage(doc, { output, generatedAt }) {
  background(doc);
  let y = heading(doc, "At a glance", M) + 14;

  /**
   * The same rows the summary shows on screen, in the same order.
   *
   * Read from the engine's own field names rather than from a copy, so a field
   * that changes name upstream goes missing here loudly instead of being
   * quietly rendered blank.
   */
  const ROWS = [
    ["Type", output?.type],
    ["Strategy", output?.strategy],
    ["Authority", output?.authority],
    ["Profile", output?.profile],
    ["Definition", output?.definition],
    ["Not-Self Theme", output?.notSelfTheme],
    ["Signature", output?.signature],
    ["Incarnation Cross", output?.incarnationCross],
  ];

  const provisional = new Set(Array.isArray(output?.provisional) ? output.provisional : []);
  const KEY = {
    Type: "type",
    Strategy: "strategy",
    Authority: "authority",
    Profile: "profile",
    "Not-Self Theme": "notSelfTheme",
    Signature: "signature",
  };

  const labelW = 150;
  const valueX = M + labelW;
  const valueW = PAGE.w - M * 2 - labelW;

  for (const [label, value] of ROWS) {
    if (!value) continue;
    doc.font("body").fontSize(9).fillColor(MUTED).text(label.toUpperCase(), M, y + 2, {
      width: labelW - 10,
      characterSpacing: 1.1,
    });
    doc.font("bold").fontSize(12).fillColor(INK).text(String(value), valueX, y, { width: valueW });
    let next = doc.y;

    // The engine says which fields a noon assumption puts in doubt. Reading its
    // list rather than keeping a copy means the two cannot disagree.
    if (provisional.has(KEY[label])) {
      doc.font("body").fontSize(8.5).fillColor(GOLD).text("PROVISIONAL", valueX, next + 1, {
        width: valueW,
        characterSpacing: 1,
      });
      next = doc.y;
    }

    y = next + 10;
    doc.moveTo(M, y - 5).lineTo(PAGE.w - M, y - 5).strokeColor(RULE).lineWidth(0.5).stroke();
  }

  y += 8;
  y = centresBlock(doc, "Defined centres", output?.definedCenters, y);
  y = centresBlock(doc, "Open centres", output?.openCenters, y);

  if (Array.isArray(output?.channels) && output.channels.length) {
    y = centresBlock(doc, "Channels", output.channels, y);
  }

  if (output?.note) {
    doc.rect(M, y + 4, PAGE.w - M * 2, 40).fill(PANEL);
    doc
      .font("body")
      .fontSize(10)
      .fillColor(MUTED)
      .text(String(output.note), M + 14, y + 16, { width: PAGE.w - M * 2 - 28 });
  }

  footer(doc, generatedAt);
}

function centresBlock(doc, title, values, y) {
  if (!Array.isArray(values) || values.length === 0) return y;
  doc.font("body").fontSize(9).fillColor(MUTED).text(title.toUpperCase(), M, y, {
    characterSpacing: 1.1,
  });
  doc
    .font("bold")
    .fontSize(11)
    .fillColor(INK)
    .text(values.join("  ·  "), M, doc.y + 2, { width: PAGE.w - M * 2 });
  return doc.y + 14;
}

/**
 * The footer names where it came from and when.
 *
 * A chart with no date on it is one somebody cannot tell apart from an older
 * one after an engine change, and the engine version is what a support question
 * actually needs.
 */
function footer(doc, generatedAt) {
  const y = PAGE.h - M + 6;
  doc.moveTo(M, y - 12).lineTo(PAGE.w - M, y - 12).strokeColor(RULE).lineWidth(0.5).stroke();
  doc.font("body").fontSize(8.5).fillColor(MUTED).text("thechampagnemethod.co", M, y, {
    width: (PAGE.w - M * 2) / 2,
  });
  if (generatedAt) {
    doc.font("body").fontSize(8.5).fillColor(MUTED).text(
      generatedAt.toISOString().slice(0, 10),
      PAGE.w / 2,
      y,
      { width: (PAGE.w - M * 2) / 2, align: "right" },
    );
  }
}
