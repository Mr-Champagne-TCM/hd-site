import PDFDocument from "pdfkit";
import SVGtoPDF from "svg-to-pdfkit";
import QRCode from "qrcode";
import { TIERS } from "../../shared/pricing.mjs";
import {
  DISCLAIMER,
  INTERPRETATION,
  MECHANICS,
  TAKEAWAYS,
  marginNotes,
  parseReading,
} from "./interpretation.mjs";
import { sellable } from "../../shared/availability.mjs";
import { activationLabel, planetName } from "../../shared/planets.mjs";
import { OUTFIT_400, OUTFIT_600 } from "./fonts/outfit.mjs";
import {
  AUTHORITY_NOTES,
  NOT_SELF_NOTES,
  PROFILE_NOTES,
  SIGNATURE_NOTES,
  STRATEGY_NOTES,
  TYPE_NOTES,
  describe,
  profileWithNames,
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
/** The hairline the app rules its glance box with. Measured off its own PDF. */
const ROW_RULE = "#EFE6C8";

/**
 * THE DRAWING, RECOLOURED FOR PRINT — and only the two colours that carry the
 * medium, measured off the app's own PDF rather than guessed:
 *
 *   panel ground   #0E1A2B -> #5B6576
 *   robed figure   #152744 -> #263E66
 *
 * The app runs its screen dark and its print light; this is the same departure,
 * and D-10 is intact — a CLIENT never chooses a scheme, and there is still one
 * bodygraph. What moves is the medium, chosen by us.
 *
 * Done here rather than in the engine because ONE drawing goes on the wire and
 * that stays true: a second render would be a second set of coordinates to keep
 * in step, and a bigger blob in storage, for two hex values.
 *
 * THE HALO MOVES WITH THE GROUND ON PURPOSE. `palette.halo` is the same navy,
 * and its whole job is to be the colour behind a label so the channels under it
 * are pushed back. If the ground moved and the halo did not, every centre name
 * would sit in a dark patch.
 *
 * The risk this carries is that it is a STRING SWAP against constants that live
 * in another repo. If the engine's palette moves, this quietly does nothing
 * rather than failing — so `printSwap` reports what it matched and the tests
 * assert both keys are hit.
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

const PAGE = { w: 612, h: 792 };
const M = 56;
const COL = PAGE.w - M * 2;

export async function readingPdf({ tier, name, output, links, reading = null }) {
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

    /**
     * THE WRITTEN INTERPRETATION, when there is one -- tier 2 and above.
     *
     * `reading` is the raw text the model returned, already checked by
     * `firstProblem` before it was ever stored. Parsing it HERE rather than
     * storing a parsed shape means the document is always built from the thing
     * that was validated, never from a derivative of it.
     */
    const written = tier >= 2 && typeof reading === "string" ? parseReading(reading) : null;

    glancePage(doc, { output, tier, links, written });
    if (written) {
      doc.addPage();
      mechanicsPage(doc, written);
      /**
       * THE ACTIVATIONS, which the reading tier has always been sold with and
       * has never once shipped. Page three, between the mechanics and the
       * reading: they are chart facts, so they belong with the other chart
       * facts rather than after the prose.
       */
      doc.addPage();
      activationsPage(doc, { output, links, page: 4 });
      interpretationPages(doc, { output, written });
    }

    doc.end();
  });
}

function paper(doc) {
  doc.rect(0, 0, PAGE.w, PAGE.h).fill(PAPER);
}

const HOME = "https://thechampagnemethod.co";

/**
 * What a purchase collects and what becomes of it.
 *
 * ON PAGE ONE ONLY, not in every footer. This document is read straight
 * through and often kept; a policy link repeated on all fourteen pages reads
 * as boilerplate and gets skipped everywhere. Once, on the page nobody misses,
 * is the placement that actually gets found.
 */
const PRIVACY = "https://thechampagnemethod.co/readings/privacy/";

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
  if (page === 1) {
    doc.text("Privacy", M + COL * 0.7 + 8, y, {
      width: COL * 0.25,
      link: PRIVACY,
      underline: true,
    });
  }
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
    output?.profile && `Profile ${profileWithNames(output.profile)}`,
    output?.authority && `${output.authority} authority`,
    // The one line everybody reads. Without a birth time these three are
    // provisional, and the page-two note is not where a reader's eye lands.
    output?.timeKnown === false && "birth time unknown — provisional",
  ]
    .filter(Boolean)
    .join("  ·  ");
  if (oneLine) {
    doc.font("body").fontSize(11).fillColor(MUTED).text(oneLine, M, doc.y + 8, { width: COL });
  }

  const ruleY = doc.y + 12;
  doc.moveTo(M, ruleY).lineTo(PAGE.w - M, ruleY).strokeColor(GOLD).lineWidth(1).stroke();

  /**
   * THE ENGINE'S DRAWING, recoloured for paper. It carries its own ground and
   * border, so the panel comes for free: nothing here draws a rectangle.
   */
  const raw = typeof output?.bodygraphSvg === "string" ? output.bodygraphSvg : null;
  const svg = raw ? printSwap(raw).svg : null;
  // 166, not 150: the key gained a line explaining what a white centre's gate
  // numbers mean, and the chart gives up those points rather than the footer.
  const legendTop = PAGE.h - 166;
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

function glancePage(doc, { output, tier, links, written = null }) {
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
    ["PROFILE", output?.profile && profileWithNames(output.profile), profileNote(output?.profile)],
    ["SIGNATURE", output?.signature, describe(SIGNATURE_NOTES, output?.signature)],
    ["NOT-SELF", output?.notSelfTheme, describe(NOT_SELF_NOTES, output?.notSelfTheme)],
  ].filter(([, v]) => v);

  if (rows.length) {
    const labelW = 92;
    const textX = M + 14 + labelW;
    const textW = COL - 28 - labelW;
    const startY = y;

    /**
     * A HAIRLINE BETWEEN EVERY ROW, and the value in the SAME WEIGHT as the
     * sentence after it -- both of which are the app's, and both of which I had
     * diverged from: no rules at all, and the value set bold.
     *
     * The bold read well on its own and it is still wrong here. This document
     * is meant to be the app's document, and a reader who has both should not
     * be able to tell which one made which.
     */
    let inner = y + 12;
    rows.forEach(([label, value, note], i) => {
      if (i) {
        doc
          .moveTo(M + 14, inner - 6)
          .lineTo(PAGE.w - M - 14, inner - 6)
          .strokeColor(ROW_RULE)
          .lineWidth(0.5)
          .stroke();
      }
      doc
        .font("body")
        .fontSize(8)
        .fillColor(GOLD)
        .text(label, M + 14, inner + 2, { width: labelW - 10, characterSpacing: 1.1 });
      doc
        .font("body")
        .fontSize(10)
        .fillColor(INK)
        .text(note ? `${value}. ${note}` : `${value}.`, textX, inner, {
          width: textW,
          lineGap: 1,
        });
      inner = doc.y + 9;
    });
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
  /**
   * THE THREE CENTRE ROWS ARE ALWAYS PRINTED, "None" included.
   *
   * They partition the nine centres exactly, so a reader can add them up. A
   * Reflector has no defined centres and some charts have no open ones; under
   * the old `.filter` those rows simply disappeared, which reads as a document
   * that failed to work something out rather than as a fact about the chart.
   */
  const centres = (list) => (list ?? []).join(", ") || "None";
  /**
   * A READING STORED BEFORE THE THIRD STATE EXISTED has no `undefinedCenters`
   * key at all, and its `openCenters` still means "everything not defined".
   * Absent is not empty: printing "Undefined centres: None" on such a reading
   * would be a false statement on a document somebody already holds. Those
   * readings keep the two rows they were sold with; only charts cast by the
   * three-state engine get the third row.
   */
  const threeState = Array.isArray(output?.undefinedCenters);
  const values = [
    ["Definition", output?.definition],
    ["Incarnation cross", output?.incarnationCross],
    ["Defined centres", centres(output?.definedCenters)],
    ...(threeState ? [["Undefined centres", centres(output.undefinedCenters)]] : []),
    ["Open centres", centres(output?.openCenters)],
    ["Channels", (output?.channels ?? []).join("\n")],
  ].filter(([, v]) => v);

  const lw = 150;
  /**
   * A LONG CHANNEL LIST GOES TWO ACROSS. Eleven channels one under another is
   * what pushed the offer off the page on the densest chart in the sweep
   * (one in 2,500 charts has ten or more). Two columns halve the height and
   * the list is still read top to bottom, left column first.
   */
  const channelList = output?.channels ?? [];
  for (const [label, value] of values) {
    doc.moveTo(M, y).lineTo(PAGE.w - M, y).strokeColor(RULE).lineWidth(0.5).stroke();
    doc
      .font("body")
      .fontSize(8.5)
      .fillColor(MUTED)
      .text(label.toUpperCase(), M, y + 8, { width: lw - 12, characterSpacing: 1.1 });
    if (label === "Channels" && channelList.length > 6) {
      const half = Math.ceil(channelList.length / 2);
      const gap = 16;
      const cw = (COL - lw - gap) / 2;
      doc.font("body").fontSize(10.5).fillColor(INK);
      doc.text(channelList.slice(0, half).join("\n"), M + lw, y + 6, { width: cw });
      const yLeft = doc.y;
      doc.text(channelList.slice(half).join("\n"), M + lw + cw + gap, y + 6, { width: cw });
      y = Math.max(yLeft, doc.y) + 6;
      continue;
    }
    doc
      .font("body")
      .fontSize(10.5)
      .fillColor(INK)
      .text(String(value), M + lw, y + 6, { width: COL - lw });
    y = doc.y + 6;
  }
  doc.moveTo(M, y).lineTo(PAGE.w - M, y).strokeColor(RULE).lineWidth(0.5).stroke();

  /**
   * WHERE THE WORDS ARE EXPLAINED, as a real link annotation.
   *
   * Jeremy: "human design, plainly link in PDF missing. needed." He is right,
   * and this page is exactly where it is missed -- it is where somebody meets
   * "Manifesting Generator" and "incarnation cross" as bare values. The offer
   * page and the reading page both offer the glossary at that moment; the
   * document they keep did not.
   *
   * ONE LINE, ONE LINK. Not two fragments joined with `continued` -- that is
   * the mistake the page-one guide line already made once, where each fragment
   * re-centred over the same span and they landed on top of each other.
   */
  const hd101 = links?.hd101 ?? "https://thechampagnemethod.co/library/human-design/";
  doc
    .font("body")
    .fontSize(9)
    .fillColor(GOLD)
    .text(
      "Every word above is explained in Human Design, plainly  —  free in the library",
      M,
      y + 10,
      { width: COL, link: hd101, underline: false },
    );
  y = doc.y + 4;

  if (output?.note) {
    doc.font("body").fontSize(9).fillColor(MUTED).text(String(output.note), M, y + 12, {
      width: COL,
    });
    y = doc.y;
  }

  /**
   * A soft line toward the next tier — and it now says WHERE the credit lives,
   * which is Jeremy's note and a money question, so it gets said plainly.
   *
   * REWRITTEN once the credit stopped depending on a browser tab. It used to
   * say the offer was on "the page your chart came from" and that starting
   * anywhere else begins at full -- which was true, and was the bug: credit
   * came only from a grant held in the tab that paid, so the emailed link the
   * sentence pointed at was exactly the case that did NOT work. Jeremy paid
   * the full price to find that out.
   *
   * The credit travels with the signed link now, so this says what is true and
   * useful in one breath: open it from the email and the discount is already
   * on the price.
   *
   * THE GENERIC PURCHASE URL IS STILL DELIBERATELY ABSENT. A printed link that
   * skips the token is a link that skips the credit.
   *
   * No imperative: it describes where the thing is and stops.
   */
  // Not for a tier that cannot be bought yet. A PDF is kept and re-read; an
  // offer inside one outlives the moment it was true.
  const next = sellable(tier + 1) ? TIERS[tier + 1] : null;
  /**
   * NO CLAMP. `Math.min(y + 22, PAGE.h - 150)` did not make room when the page
   * ran long -- it pulled the offer UP and printed it on top of the channels
   * row and the glossary line. Adding the third centre row was enough to
   * trigger it, and the result was three layers of overlapping text on a
   * document somebody paid for.
   *
   * It is measured against the footer now, and simply left out when it will not
   * fit. A missing upsell is a smaller fault than a broken page.
   */
  /**
   * MEASURED, NOT ESTIMATED. A fixed 100pt allowance guessed this box's height
   * and dropped it off a page it had ample room on -- by five points. The
   * strings are built first and asked how tall they are, so the only thing that
   * can leave the offer out is genuinely running out of page.
   */
  if (next) {
    /**
     * MORE THAN WHAT, EXACTLY. "If you would like more" leaves the reader to
     * work out what they are holding and what is being offered; naming the
     * tier they bought does that work for them, and makes the heading true on
     * whichever document it lands.
     */
    const offerHead = `IF YOU WOULD LIKE MORE THAN THIS ${(TIERS[tier]?.label ?? "").replace(/^The\s+/i, "").toUpperCase()}`.trim();
    const offerBody =
      `${next.label} contains ${lowerFirst(next.blurb)} What you have already paid comes off ` +
      "the price, and the link in your email is what proves it — so opening this from there " +
      "means the credit is already applied. Nobody pays twice for the same thing.";
    const headH = doc.font("body").fontSize(8.5).heightOfString(offerHead, { width: COL, characterSpacing: 1.3 });
    const bodyH = doc.font("body").fontSize(10).heightOfString(offerBody, { width: COL, lineGap: 1.5 });
    const boxH = headH + 6 + bodyH;

    /**
     * TOP-ALIGNED WHEN THERE IS SLACK, BOTTOM-ALIGNED WHEN THERE IS NOT.
     *
     * A fixed `y + 22` put the offer 20pt past the footer on a chart with six
     * defined centres and four channels -- so it was dropped, on a page showing
     * ninety points of white space below it. Sliding it down to sit just above
     * the footer keeps it on every page that can hold it at all; the guard is
     * what stops the slide turning back into the overlap this replaced.
     */
    const boxY = Math.min(y + 22, PAGE.h - 60 - boxH);
    if (boxY >= y + 8) {
      doc.font("body").fontSize(8.5).fillColor(GOLD).text(offerHead, M, boxY, { characterSpacing: 1.3 });
      doc.font("body").fontSize(10).fillColor(INK).text(offerBody, M, doc.y + 6, { width: COL, lineGap: 1.5 });
      footer(doc, 2);
    } else {
      /**
       * AND WHEN EVEN THAT WILL NOT FIT, A THIRD PAGE -- never a dropped offer
       * and never an overlap. Jeremy, on seeing the densest chart lose the
       * box: "I don't like this." The glance page is the last page of every
       * tier that can be offered more, so a page after it disturbs nothing.
       */
      footer(doc, 2);
      doc.addPage();
      paper(doc);
      doc.font("body").fontSize(8.5).fillColor(GOLD).text(offerHead, M, M, { characterSpacing: 1.3 });
      doc.font("body").fontSize(10).fillColor(INK).text(offerBody, M, doc.y + 6, { width: COL, lineGap: 1.5 });
      footer(doc, 3);
    }
  } else {
    footer(doc, 2);
  }
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

  /**
   * A GOLD RULE ABOVE AND A PALE ONE BELOW, which is what the app draws and
   * what makes this read as a key rather than as four stray captions. Measured
   * off its PDF: 1pt gold over, 0.5pt over the guide line under.
   */
  doc.moveTo(M, top).lineTo(PAGE.w - M, top).strokeColor(GOLD).lineWidth(1).stroke();

  /** The QR takes the right end, so the four entries share what is left. */
  const QR = 46;
  const textW = COL - QR - 18;
  const half = textW / 2;
  const rowsY = top + 11;
  const ROW = 27;
  const SW = 13;

  doc.lineWidth(0.5);
  KEY.forEach(([colour, label, blurb, second], i) => {
    const cx = M + (i % 2) * half;
    const cy = rowsY + Math.floor(i / 2) * ROW;
    /**
     * A SQUARE, not a pill. The app draws a filled square with a hairline
     * outline, and the outline is not decoration: the personality swatch is
     * near-white by design and would be an invisible hole on paper without it.
     * "Both" is the square split down the middle, because that is literally
     * what the channel is — one half each.
     */
    doc.rect(cx, cy + 1, SW, SW).fillAndStroke(colour, MUTED);
    if (second) {
      doc.rect(cx + SW / 2, cy + 1, SW / 2, SW).fill(second);
      doc.rect(cx, cy + 1, SW, SW).strokeColor(MUTED).stroke();
    }
    doc.font("bold").fontSize(9.5).fillColor(INK).text(label, cx + SW + 8, cy, {
      width: half - SW - 14,
    });
    doc.font("body").fontSize(7.5).fillColor(MUTED).text(blurb, cx + SW + 8, doc.y + 1, {
      width: half - SW - 14,
    });
  });

  const belowY = rowsY + ROW * 2 - 3;
  doc.moveTo(M, belowY).lineTo(M + textW, belowY).strokeColor(RULE).lineWidth(0.5).stroke();

  /**
   * WHAT A WHITE CENTRE'S GATE NUMBERS MEAN.
   *
   * The drawing already carries this and always has -- a centre with lit gates
   * is undefined, one with none is open -- but nothing on the page said so, so
   * a reader had no way to tell the two apart. NO THIRD COLOUR: adding one
   * would put this chart out of agreement with every reference calculator, for
   * information the picture is already showing.
   */
  doc
    .font("body")
    .fontSize(7.5)
    .fillColor(MUTED)
    .text(
      "In a centre left unfilled, a gate drawn in white or violet means undefined — all of them dark means open.",
      M,
      belowY + 5,
      { width: textW, align: "center" },
    );

  /**
   * THE QR, beside the guide line it encodes. It was built at the top of this
   * module and then never drawn -- passed in, unused, and absent from the page
   * for a whole review round. Vector, so it stays crisp at any size.
   *
   * A printed page cannot be clicked, and retyping a URL off paper is a thing
   * nobody does.
   */
  if (qr) {
    try {
      SVGtoPDF(doc, qr, PAGE.w - M - QR, rowsY, { width: QR, height: QR });
    } catch {
      /* a missing QR is a page without a QR, never a failed download */
    }
  }

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
      M, belowY + 19, { width: textW, align: "center", link: guide, underline: false });
}

/* ==========================================================================
 * TIER 2 -- the written interpretation, laid out as the app lays it out.
 *
 * Measured off `Jeremy-pdf-view.pdf` rather than invented: a mechanics page of
 * gold-labelled blocks, then the six interpretation sections as a two-column
 * spread -- the writing on the left, chart facts in the right margin against a
 * gold rule. Two sections to a page, and a section is never split across one.
 * ========================================================================== */

/** Where the writing stops and the margin begins. */
/**
 * Measured off the app's page 4, not chosen: its writing column runs 55pt to
 * 405pt and its margin starts at 435pt. A narrower column was the reason the
 * first attempt put ONE section on a page where the app fits two -- the layout
 * was right and the measurements were mine.
 */
const BODY_W = 350;
const NOTE_GAP = 30;
const NOTE_X = M + BODY_W + NOTE_GAP;
const NOTE_W = COL - BODY_W - NOTE_GAP;
const FOOT = PAGE.h - 70;

/** A running head, so a loose page still says what it belongs to. */
function runningHead(doc, title) {
  doc.font("body").fontSize(11).fillColor(INK).text(title, M, M);
  doc
    .font("body")
    .fontSize(8.5)
    .fillColor(GOLD)
    .text("THE CHAMPAGNE METHOD", PAGE.w / 2, M + 1, {
      width: COL / 2,
      align: "right",
      characterSpacing: 1.7,
    });
  const y = M + 20;
  doc.moveTo(M, y).lineTo(PAGE.w - M, y).strokeColor(RULE).lineWidth(0.5).stroke();
  return y + 16;
}

function sectionLabel(doc, text, x, y, width) {
  doc
    .font("body")
    .fontSize(8.5)
    .fillColor(GOLD)
    .text(String(text).toUpperCase(), x, y, { width, characterSpacing: 1.3 });
  return doc.y + 4;
}

/**
 * PAGE THREE: the mechanics.
 *
 * Four blocks. Two are paragraphs; two are lists whose lines the model was told
 * to write in a fixed shape -- "20-34 (Charisma), Throat to Sacral: ..." -- so
 * they are split on the FIRST colon and set as a term beside its sentence.
 *
 * A line that carries no colon is printed whole rather than dropped. A reading
 * that came back slightly off should LOOK slightly off; silently discarding a
 * channel would leave a document that is wrong and looks finished.
 */
/**
 * THE TWENTY-SIX ACTIVATIONS.
 *
 * SOLD AND NOT SHIPPED, until now. Every price table, the offer page and every
 * delivery email describe the reading tier as "All twenty-six activations with
 * the planet behind each, and the written interpretation." The written
 * interpretation arrived. The activations never existed anywhere -- not in this
 * document, not on the page -- and a comment further up this very file said
 * they belonged to the reading tier, which is as close as code gets to a note
 * saying "not built yet".
 *
 * Jeremy bought his own reading with a real card and it was missing. That is
 * the kind of gap that only a real purchase finds, and the kind that matters
 * most: it is the difference between what was paid for and what was handed
 * over.
 *
 * PERSONALITY AND DESIGN, SIDE BY SIDE, because that is what they are -- the
 * same thirteen bodies read at two moments, and the comparison is the point.
 * The planet names arrive SCREAMING_SNAKE from the engine and are turned into
 * words here; "NORTH_NODE" on a document somebody paid for reads as a leak of
 * the machinery.
 */
/**
 * PAGE: the activations, in two columns.
 *
 * Design is drawn FIRST in reading order on the left because it comes first in
 * time -- roughly three months before birth -- and the document says so rather
 * than assuming anybody knows.
 */
function activationsPage(doc, { output, links, page }) {
  paper(doc);
  let y = runningHead(doc, "Your twenty-six activations");

  const personality = Array.isArray(output?.personality) ? output.personality : [];
  const design = Array.isArray(output?.design) ? output.design : [];

  doc
    .font("body")
    .fontSize(10)
    .fillColor(MUTED)
    .text(
      "Every gate your chart activates, and the planet behind each one. The personality " +
        "side is the moment you were born and is what you are conscious of. The design side " +
        "is about three months earlier and is what the body knows without being told.",
      M,
      y,
      { width: COL, lineGap: 1.5 },
    );
  y = doc.y + 16;

  const colW = (COL - 24) / 2;
  const right = M + colW + 24;
  const head = (x, label, count) => {
    sectionLabel(doc, label, x, y, colW);
    doc
      .font("body")
      .fontSize(8.5)
      .fillColor(MUTED)
      .text(`${count} activations`, x, y + 12, { width: colW });
  };
  head(M, "Personality — conscious", personality.length);
  head(right, "Design — unconscious", design.length);
  y += 30;

  const rows = Math.max(personality.length, design.length);
  const startY = y;
  const ROW = 17;

  const column = (list, x) => {
    let ry = startY;
    for (const a of list) {
      doc.font("body").fontSize(10).fillColor(INK).text(planetName(a.planet), x, ry, { width: colW - 54 });
      doc
        .font("bold")
        .fontSize(10)
        .fillColor(INK)
        .text(activationLabel(a), x + colW - 54, ry, { width: 54, align: "right" });
      doc
        .moveTo(x, ry + ROW - 5)
        .lineTo(x + colW, ry + ROW - 5)
        .strokeColor(ROW_RULE)
        .lineWidth(0.5)
        .stroke();
      ry += ROW;
    }
    return ry;
  };

  const endLeft = column(personality, M);
  const endRight = column(design, right);
  y = Math.max(endLeft, endRight) + 14;

  doc
    .font("body")
    .fontSize(9)
    .fillColor(MUTED)
    .text(
      "Each number is a gate and the line within it — 6.2 is gate 6, line 2. What the gates " +
        "mean is explained in Human Design, plainly, free in the library.",
      M,
      y,
      { width: COL, link: links?.hd101 ?? "https://thechampagnemethod.co/library/human-design/", underline: false, lineGap: 1 },
    );

  footer(doc, page);
}

function mechanicsPage(doc, written) {
  paper(doc);
  let y = runningHead(doc, "The mechanics of your chart");

  for (const heading of MECHANICS) {
    const section = written.sections.find((s) => s.heading === heading);
    if (!section || !section.paragraphs.length) continue;

    if (y > FOOT - 90) {
      footer(doc, 3);
      doc.addPage();
      paper(doc);
      y = runningHead(doc, "The mechanics of your chart");
    }

    y = sectionLabel(doc, heading, M, y, COL);
    const listy = heading === MECHANICS[2] || heading === MECHANICS[3];

    for (const para of section.paragraphs) {
      const at = listy ? para.indexOf(":") : -1;
      if (at > 0) {
        const top = y;
        doc.font("body").fontSize(9.5).fillColor(INK).text(para.slice(0, at).trim(), M, top, {
          width: 168,
        });
        const afterTerm = doc.y;
        doc.font("body").fontSize(10.5).fillColor(MUTED).text(para.slice(at + 1).trim(), M + 180, top, {
          width: COL - 180,
          lineGap: 1,
        });
        y = Math.max(afterTerm, doc.y) + 8;
        continue;
      }
      doc.font("body").fontSize(10.5).fillColor(INK).text(para, M, y, { width: COL, lineGap: 1.5 });
      y = doc.y + 10;
    }
    y += 8;
  }

  footer(doc, 3);
}

/**
 * PAGES FOUR ONWARD: the reading itself.
 *
 * A SECTION IS NEVER SPLIT. Its height is measured before anything is drawn,
 * and a page without room starts a new one instead. A lede stranded at the foot
 * of a page with its two paragraphs overleaf is the fault this avoids -- and it
 * is a fault only a real reading shows, never a fixture.
 */
function interpretationPages(doc, { output, written }) {
  const notes = marginNotes(output);
  doc.addPage();
  paper(doc);
  let y = runningHead(doc, "Your reading");
  // Five, not four: the activations took page four. A footer that disagrees
  // with the page it is printed on is the kind of small wrongness that makes a
  // paid document feel unchecked.
  let page = 5;

  const measure = (section) => {
    let h = 16;
    h += doc
      .font("body")
      .fontSize(8.5)
      .heightOfString(section.heading.toUpperCase(), { width: BODY_W });
    if (section.lede) {
      h += 8 + doc.font("bold").fontSize(13).heightOfString(section.lede, { width: BODY_W, lineGap: 1 });
    }
    for (const para of section.paragraphs) {
      h += 10 + doc.font("body").fontSize(10.5).heightOfString(para, { width: BODY_W, lineGap: 1.5 });
    }
    return h;
  };

  for (const heading of INTERPRETATION) {
    const section = written.sections.find((s) => s.heading === heading);
    if (!section) continue;

    if (y + measure(section) > FOOT) {
      footer(doc, page);
      page += 1;
      doc.addPage();
      paper(doc);
      y = runningHead(doc, "Your reading");
    }

    const top = y;
    y = sectionLabel(doc, heading, M, y, BODY_W);
    if (section.lede) {
      doc.font("bold").fontSize(13).fillColor(INK).text(section.lede, M, y, {
        width: BODY_W,
        lineGap: 1,
      });
      y = doc.y + 8;
    }
    for (const para of section.paragraphs) {
      doc.font("body").fontSize(10.5).fillColor(INK).text(para, M, y, {
        width: BODY_W,
        lineGap: 1.5,
      });
      y = doc.y + 10;
    }

    /**
     * THE MARGIN, AND EVERY WORD OF IT COMES FROM THE CHART.
     *
     * Not from the model. This is the column a reader checks the writing
     * against, so a value here must be one the engine produced. A paraphrase
     * that drifted would be indistinguishable from the chart being wrong.
     */
    let ny = top;
    for (const [k, v] of notes[heading] || []) {
      if (!k) continue;
      doc.font("body").fontSize(8.5).fillColor(GOLD).text(k, NOTE_X, ny, {
        width: NOTE_W,
        characterSpacing: 0.8,
      });
      doc.font("body").fontSize(9).fillColor(MUTED).text(String(v ?? ""), NOTE_X, doc.y + 1, {
        width: NOTE_W,
        lineGap: 1,
      });
      ny = doc.y + 8;
    }

    // The rule runs the height of whichever column is taller, so it reads as
    // this section's own edge rather than as a fixed decoration.
    const bottom = Math.max(y, ny) - 6;
    doc
      .moveTo(NOTE_X - 16, top)
      .lineTo(NOTE_X - 16, bottom)
      .strokeColor(GOLD)
      .lineWidth(0.75)
      .stroke();

    y = bottom + 22;
  }

  const takeaways = written.sections.find((s) => s.heading === TAKEAWAYS);
  if (takeaways && takeaways.paragraphs.length) {
    if (y > FOOT - 130) {
      footer(doc, page);
      page += 1;
      doc.addPage();
      paper(doc);
      y = runningHead(doc, "Your reading");
    }
    y = sectionLabel(doc, TAKEAWAYS, M, y, COL);
    /**
     * EACH TAKEAWAY IS MEASURED BEFORE IT IS DRAWN. The 130pt allowance above
     * only guarded the START of the block; a fifth paragraph, or four long
     * ones, walked straight into the footer -- the geometry check caught it on
     * every tier-2 render the day the fixture's fifth section grew by a line.
     * A real reading's takeaways are whatever length the model wrote them.
     */
    for (const para of takeaways.paragraphs) {
      const h = doc.font("body").fontSize(10.5).heightOfString(para, { width: COL, lineGap: 1.5 });
      if (y + h > FOOT) {
        footer(doc, page);
        page += 1;
        doc.addPage();
        paper(doc);
        y = runningHead(doc, "Your reading");
      }
      doc.font("body").fontSize(10.5).fillColor(INK).text(para, M, y, { width: COL, lineGap: 1.5 });
      y = doc.y + 10;
    }
  }

  /**
   * THE DISCLAIMER IS OURS, NOT THE MODEL'S.
   *
   * The prompt asks for it and the validator refuses a reading without it, but
   * what is PRINTED is the constant from `interpretation.mjs` -- so a model
   * that reworded it cannot reword what a reader is handed.
   */
  const disclaimerH = doc.font("body").fontSize(8.5).heightOfString(DISCLAIMER, { width: COL, lineGap: 1 });
  if (y + 8 + disclaimerH > FOOT) {
    footer(doc, page);
    page += 1;
    doc.addPage();
    paper(doc);
    y = runningHead(doc, "Your reading");
  }
  doc.font("body").fontSize(8.5).fillColor(MUTED).text(DISCLAIMER, M, y + 8, {
    width: COL,
    lineGap: 1,
  });

  footer(doc, page);
}
