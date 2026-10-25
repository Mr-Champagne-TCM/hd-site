import { test } from "node:test";
import assert from "node:assert/strict";
import PDFDocument from "pdfkit";
import { OUTFIT_400 } from "../netlify/lib/fonts/outfit.mjs";
import { ROBOTO_400 } from "../netlify/lib/fonts/roboto.mjs";
import { useFont, measure, paint } from "../netlify/lib/pdfText.mjs";

/**
 * ONE OPEN PER FONT PER DOCUMENT (10/25 live test: a 10-page reading's PDF took 31 s on Netlify and
 * its download timed out). "fallback" (every "→") and the bodygraph's "svgBody" are the same Outfit
 * file; pdfkit kept whichever came second uncached and parsed Outfit again on every call.
 */
test("the fallback face is opened once per document, even after the bodygraph's equal face", () => {
  const doc = new PDFDocument({ font: ROBOTO_400, autoFirstPage: false });
  doc.registerFont("body", ROBOTO_400);
  doc.registerFont("fallback", OUTFIT_400);
  doc.registerFont("svgBody", OUTFIT_400);
  doc.font("svgBody"); // the bodygraph opens Outfit first, as in readingPdf
  const p = paint(10, "#000");
  // "body" is the same Roboto the document starts with: the same trap. One measure opens each name once.
  measure(doc, "Reading your bodygraph →", p);
  const opened = doc._fontCount;
  for (let i = 0; i < 20; i++) measure(doc, "Reading your bodygraph →", p);
  assert.equal(doc._fontCount, opened, "a face was opened again");
  // The face drawn is the same font object either name gives.
  useFont(doc, "fallback");
  const fb = doc._font;
  doc.font("svgBody");
  assert.equal(doc._font, fb);
});
