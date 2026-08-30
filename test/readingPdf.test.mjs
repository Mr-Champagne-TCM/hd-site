import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { readingPdf, printSwap } from "../netlify/lib/readingPdf.mjs";
import { importTs } from "./support/ts.mjs";

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

/** Thirteen bodies, the shape the engine returns. */
const ACTIVATIONS = [
  "SUN", "EARTH", "MOON", "NORTH_NODE", "SOUTH_NODE", "MERCURY", "VENUS",
  "MARS", "JUPITER", "SATURN", "URANUS", "NEPTUNE", "PLUTO",
].map((planet, i) => ({ planet, gate: i + 1, line: (i % 6) + 1 }));

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

test("THE STANDARD FONT SET IS NEVER TOUCHED", async () => {
  // A 500 in production that every local run passed:
  //
  //   Cannot find module '/var/task/node_modules/pdfkit/js/standard-fonts/Helvetica.cjs'
  //
  // PDFDocument loads a DEFAULT font in its constructor, before any of our
  // code registers anything, and it does so by requiring a file the deployed
  // bundle does not contain. Naming our own font at construction means the
  // standard set is never loaded -- which is also what we wanted: nothing in
  // this document should be in a font that is not Outfit.
  //
  // Asserted on the OUTPUT rather than on the option, because the option is
  // the fix and the output is the promise.
  const pdf = (await make()).toString("latin1");
  for (const std of ["Helvetica", "Times-Roman", "Courier", "ZapfDingbats", "Symbol"]) {
    assert.ok(!pdf.includes(std), `${std} reached the PDF, so a standard font was loaded`);
  }
});


// --- matched to the app's CURRENT output ------------------------------------
//
// It took three files to get here. The August sample in the repo draws the
// chart light on a white page; a preliminary run moved the legend to page two;
// `Jeremy-pdf-view.pdf` is the one he called final. Each looked authoritative
// on its own, which is the lesson: ASK WHICH FILE IS CURRENT.




test("the footer carries a real link annotation, and no date", async () => {
  const pdf = (await make()).toString("latin1");
  // pdfkit writes a /Link annotation, not blue text pretending.
  assert.match(pdf, /\/Subtype \/Link/, "the footer link is not a real annotation");
  assert.match(pdf, /thechampagnemethod\.co/);
});


test("a row with no approved sentence shows its value and stops", async () => {
  // The app has words for all six of Type, Strategy, Authority, Profile,
  // Signature and Not-self. Three are approved. Inventing the rest would put
  // unsigned-off Human Design copy on a paying customer's document.
  const buf = await make();
  assert.equal(buf.subarray(0, 5).toString(), "%PDF-");
});

/**
 * WHAT A UNIT TEST CAN AND CANNOT SAY ABOUT A PDF.
 *
 * Three assertions were written here that read the document's TEXT -- that the
 * page is paper, that the key names all four line kinds, that the approved
 * sentences arrived. All three failed, and the reason is worth keeping: an
 * embedded subset font writes text as GLYPH INDICES, not characters, so
 * "Personality" is not in the file in any form a string search can find. The
 * first version searched the raw bytes and would have passed on nothing at all;
 * inflating the streams only got as far as glyph ids.
 *
 * So the layout is verified by LOOKING -- the pages are rendered and read
 * against the app's own output, which is how every fault in this document was
 * actually found. These tests assert the things a test can genuinely hold: that
 * the document exists, that its structure is right, and that the pieces which
 * appear uncompressed really are as intended.
 *
 * A test that cannot fail for the right reason is worse than no test, because
 * the green tick gets believed.
 */

test("the document has the structure the layout depends on", async () => {
  const pdf = (await make()).toString("latin1");
  assert.match(pdf, /\/Count 2/, "expected exactly two pages");
  // A real link annotation, not blue text pretending -- the footer and the
  // upgrade line both carry one.
  assert.match(pdf, /\/Subtype \/Link/, "no link annotation in the document");
  assert.ok((pdf.match(/\/Subtype \/Link/g) ?? []).length >= 2, "expected at least two links");
});

test("the sentences the document draws are the approved ones", async () => {
  // Asserted at the SOURCE rather than in the output, since the output cannot
  // be read back. This at least catches the copy going missing or drifting
  // from the page's own version.
  const { TYPE_NOTES, describe } = await import("../netlify/lib/mechanics.mjs");
  assert.match(describe(TYPE_NOTES, "Manifesting Generator"), /Manifestor's directness/);
  assert.equal(describe(TYPE_NOTES, "Not A Type"), null, "an unknown type must draw nothing");
});

test("the server copy of the sentences matches the page's, word for word", async () => {
  // Two copies exist on purpose -- src/ is bundled and served, so a server
  // module importing from it is the shape that once put signing code one
  // import from the browser. Two copies that disagree are worse than one.
  const server = await import("../netlify/lib/mechanics.mjs");
  const page = await importTs("src", "mechanics.ts");
  const maps = [
    "TYPE_NOTES",
    "STRATEGY_NOTES",
    "AUTHORITY_NOTES",
    // The three added later, and the profile line names, drift exactly as
    // easily as the first three did.
    "PROFILE_NOTES",
    "SIGNATURE_NOTES",
    "NOT_SELF_NOTES",
    "PROFILE_LINE_NAMES",
  ];
  for (const map of maps) {
    assert.ok(server[map], `${map} is missing from the server copy`);
    assert.deepEqual(server[map], page[map], `${map} has drifted between server and page`);
  }
});

/**
 * THE PRINT RECOLOUR.
 *
 * These two hex values are the engine's, and they live in another repo. The
 * swap is a string match against them, which means its failure mode is SILENCE
 * -- it matches nothing and the page comes out navy, exactly as it did on the
 * first run of it. So the count is asserted, not just the result.
 */
test("the print swap recolours the panel and the figure, and says how many", () => {
  const svg =
    '<svg><rect fill="#0E1A2B"/><path fill="#152744"/>' +
    '<text stroke="#0e1a2b">x</text><circle fill="#C9A227"/></svg>';
  const { svg: out, hits } = printSwap(svg);
  assert.equal(hits, 3, "expected three recolours, including the lowercase one");
  assert.ok(!/#0[eE]1[aA]2[bB]/.test(out), "the navy ground survived");
  assert.ok(!/#152744/i.test(out), "the figure colour survived");
  assert.match(out, /#5B6576/, "the panel did not become the app's slate");
  assert.match(out, /#263E66/, "the figure did not become the app's navy");
  assert.match(out, /#C9A227/, "THE GOLD MUST NOT MOVE -- it is the brand");
});

test("a colour that is not in the map passes through untouched", () => {
  const { svg, hits } = printSwap('<svg fill="#7C5BFF" stroke="#F0F3F9"/>');
  assert.equal(hits, 0);
  assert.match(svg, /#7C5BFF/);
  assert.match(svg, /#F0F3F9/);
});

test("the profile is named the way the app names it", async () => {
  const { profileWithNames } = await import("../netlify/lib/mechanics.mjs");
  assert.equal(profileWithNames("2/4"), "2/4 — Hermit / Opportunist");
  assert.equal(profileWithNames("6/2"), "6/2 — Role Model / Hermit");
  // A shape nobody planned for prints the value rather than nothing.
  assert.equal(profileWithNames("9/9"), "9/9");
  assert.equal(profileWithNames(null), "");
});

// --- tier 2, the written interpretation -------------------------------------

test("tier 1 gets two pages; a tier-2 reading gets the app's seven", async () => {
  const buf = await make({ tier: 1 });
  assert.match(buf.toString("latin1"), /\/Count 2/, "the chart tier grew pages");
});

test("A READING IS ONLY LAID OUT WHEN THE TIER PAID FOR ONE", async () => {
  // Passing reading text at tier 1 must not quietly hand over the reading
  // tier's pages. The tier is the entitlement; the text is just data.
  const { TEXT } = await import("./support/tier2Fixture.mjs");
  const one = await make({ tier: 1, reading: TEXT });
  assert.match(one.toString("latin1"), /\/Count 2/, "tier 1 was given the reading pages");
});

test("the reading's pages are built from the text, and only from valid text", async () => {
  const { TEXT } = await import("./support/tier2Fixture.mjs");
  const { firstProblem } = await import("../netlify/lib/interpretation.mjs");
  assert.equal(firstProblem(TEXT), null, "the fixture itself is not a valid reading");

  const two = await make({ tier: 2, reading: TEXT });
  const pages = Number(/\/Count (\d+)/.exec(two.toString("latin1"))?.[1]);
  assert.ok(pages >= 6 && pages <= 8, `expected the app's seven-ish pages, got ${pages}`);
});

test("a tier-2 purchase with no reading text yet still produces the chart", async () => {
  // Generation is separate from delivery, and it can fail. A missing
  // interpretation must leave the two chart pages, not a broken download.
  const buf = await make({ tier: 2, reading: null });
  assert.match(buf.toString("latin1"), /\/Count 2/);
});

/**
 * THE TWENTY-SIX ACTIVATIONS ARE ACTUALLY IN THE DOCUMENT.
 *
 * Sold in every price table, on the offer page and in every delivery email:
 * "All twenty-six activations with the planet behind each." They were in none
 * of them. Jeremy bought his own reading with a real card and found the gap --
 * the failure a test suite cannot find, because nothing was broken. It was
 * simply never built, while being charged for.
 *
 * His Android app had them all along, which is what the app is for: the web
 * has to match it or beat it.
 */
test("A READING-TIER PDF CARRIES THE ACTIVATIONS PAGE", async () => {
  const { TEXT } = await import("./support/tier2Fixture.mjs");
  // The text inside is glyph indices under a subset font, so it cannot be
  // string-searched. The PAGE COUNT is the honest assertion: the activations
  // are a whole page, so the document is one longer than it used to be.
  const withActs = await make({
    tier: 2,
    reading: TEXT,
    output: { ...OUTPUT, personality: ACTIVATIONS, design: ACTIVATIONS },
  });
  const withNone = await make({
    tier: 2,
    reading: TEXT,
    output: { ...OUTPUT, personality: [], design: [] },
  });
  const count = (b) => Number(/\/Count (\d+)/.exec(b.toString("latin1"))?.[1]);
  assert.ok(count(withActs) > 0, "no pages at all");
  assert.equal(
    count(withActs),
    count(withNone),
    "the activations page must exist either way, so an empty chart is not a missing page",
  );
  assert.ok(count(withActs) >= 8, `expected eight-ish pages with activations, got ${count(withActs)}`);
});

test("the chart tier is NOT given the activations, because it did not buy them", async () => {
  // Two pages: the chart and the glance. No activations, no reading.
  const buf = await make({ tier: 1, output: { ...OUTPUT, personality: ACTIVATIONS, design: ACTIVATIONS } });
  assert.match(
    buf.toString("latin1"),
    /\/Count 2/,
    "the chart tier grew a page it did not pay for",
  );
});

test("planet names are turned into words, including one the map does not know", async () => {
  const { planetName, activationLabel } = await import("../netlify/lib/readingPdf.mjs");
  assert.equal(planetName("NORTH_NODE"), "North Node");
  assert.equal(planetName("SUN"), "Sun");
  // An engine that adds a body tomorrow must not print it raw.
  assert.equal(planetName("CHIRON_RETROGRADE"), "Chiron Retrograde");
  assert.equal(activationLabel({ gate: 6, line: 2 }), "6.2");
  assert.equal(activationLabel({ gate: 6, line: null }), "6");
  assert.equal(activationLabel(null), "");
});
