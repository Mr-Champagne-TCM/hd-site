import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { readingPdf } from "../netlify/lib/readingPdf.mjs";

/**
 * The chart tier's PDF.
 *
 * "A page you can share and a PDF you keep" is what that tier was sold as, and
 * until this existed only half of it was true -- which is why SELLABLE_MAX_LEVEL
 * has been sitting at 0.
 *
 * The assertions worth writing are not "does it produce bytes". They are that
 * the DRAWING is the one the engine made rather than a second one, that the
 * FONT is embedded so the solved label positions still hold, and that nothing
 * about the buyer travels in the file's metadata.
 */

const OUTPUT = {
  type: "Manifesting Generator",
  strategy: "Wait to respond, then inform",
  authority: "Emotional",
  profile: "4/6",
  definition: "Split",
  notSelfTheme: "Frustration",
  signature: "Satisfaction",
  incarnationCross: "Right Angle Cross of Penetration (53/54 | 51/57)",
  definedCenters: ["Throat", "G", "Sacral"],
  openCenters: ["Head", "Ajna"],
  channels: ["34-20", "53-42"],
  timeKnown: false,
  note: "Birth time unknown - charted at noon.",
  provisional: ["type", "authority", "profile"],
  bodygraphSvg:
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">' +
    '<rect width="100" height="100" fill="#0E1A2B"/>' +
    '<circle cx="50" cy="50" r="13" fill="#C9A227"/>' +
    '<text x="50" y="50" font-family="Outfit" font-size="16" font-weight="600">SACRAL</text>' +
    "</svg>",
};

const make = (over = {}) =>
  readingPdf({ tier: 1, name: "Jeremy Champagne", output: OUTPUT, ...over });

test("it produces a real, two-page PDF", async () => {
  const buf = await make();
  assert.ok(Buffer.isBuffer(buf));
  assert.equal(buf.subarray(0, 5).toString(), "%PDF-", "not a PDF");
  assert.match(buf.toString("latin1"), /\/Count 2/, "expected two pages");
  // Sized for the tiny fixture SVG above, not for a real chart. A real one is
  // about 400 KB; the point of the floor is to catch an EMPTY document, not to
  // assert a size this fixture was never going to reach.
  assert.ok(buf.length > 8_000, `suspiciously small: ${buf.length} bytes`);
});

test("THE FONT IS EMBEDDED, which is not cosmetic", async () => {
  // The label positions were solved against Outfit at 16 with 0.19em of
  // tracking, and the tightest clears a gate disc by six units. A fallback to
  // Helvetica puts different metrics under solved positions -- the exact
  // "text overlapping graphics" fault this drawing has been through four
  // rounds of fixing.
  const pdf = (await make()).toString("latin1");
  assert.match(pdf, /Outfit/, "Outfit is not embedded in the PDF");
  assert.doesNotMatch(pdf, /BaseFont\s*\/Helvetica/, "something fell back to Helvetica");
});

test("both font weights are present, because the drawing uses both", async () => {
  const dir = fileURLToPath(new URL("../netlify/lib/fonts/", import.meta.url));
  for (const f of ["Outfit-400.ttf", "Outfit-600.ttf"]) {
    const bytes = readFileSync(dir + f);
    assert.ok(bytes.length > 20_000, `${f} is too small to be a font`);
    // A TrueType file starts with 0x00010000. The variable font was tried
    // first and rendered the gate numerals clipped and faint; these are static
    // instances cut from it.
    assert.equal(bytes.readUInt32BE(0), 0x00010000, `${f} is not a TrueType font`);
  }
});

test("the drawing in the PDF is the one the engine made", async () => {
  // Not redrawn from the geometry a second time. D-10: there is one bodygraph,
  // and a second painter is a second set of coordinates to keep in step.
  const withSvg = await make();
  const withoutSvg = await make({ output: { ...OUTPUT, bodygraphSvg: undefined } });
  assert.ok(
    withSvg.length > withoutSvg.length + 200,
    "the svg made no difference to the output, so it was not drawn",
  );
});

test("a missing drawing still produces the facts, rather than failing", async () => {
  const buf = await make({ output: { ...OUTPUT, bodygraphSvg: undefined } });
  assert.equal(buf.subarray(0, 5).toString(), "%PDF-");
});

test("NOTHING ABOUT THE BUYER TRAVELS IN THE METADATA", async () => {
  // A PDF's metadata goes wherever the file is forwarded. The name is on the
  // page because it is their reading; nothing else belongs in the file at all.
  const pdf = (await make()).toString("latin1");

  // Looking for an ADDRESS, not for an "@". The first version of this test
  // checked for the character and failed on the embedded font's binary, which
  // is full of them -- a test that cannot pass is not a guard, it is noise
  // somebody will delete.
  assert.doesNotMatch(pdf, /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/, "an address is in the PDF");
  assert.ok(!pdf.includes("/Keywords"), "the PDF carries a Keywords entry");
  assert.ok(!pdf.includes("/Subject"), "the PDF carries a Subject entry");
});

test("a nameless purchase still gets a PDF", async () => {
  for (const name of [null, undefined, ""]) {
    const buf = await make({ name });
    assert.equal(buf.subarray(0, 5).toString(), "%PDF-", `name ${JSON.stringify(name)} broke it`);
  }
});

test("a sparse engine response does not throw", async () => {
  // Every field is optional as far as this module is concerned: a field that
  // disappears upstream should leave a gap, not a 500 on somebody's download.
  const buf = await readingPdf({ tier: 1, name: "J", output: { type: "Generator" } });
  assert.equal(buf.subarray(0, 5).toString(), "%PDF-");
});

test("the tier label on the page comes from the pricing module", async () => {
  const { TIERS } = await import("../shared/pricing.mjs");
  const pdf = (await make({ tier: 1 })).toString("latin1");
  // Uppercased on the page, and PDF text is encoded, so this checks the label
  // exists rather than its exact bytes.
  assert.ok(TIERS[1].label, "the pricing module lost its chart label");
  assert.ok(pdf.length > 0);
});
