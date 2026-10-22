import { test } from "node:test";
import assert from "node:assert/strict";
import { buildReadingView, sections } from "../netlify/lib/readingView.mjs";
import { INTERPRETATION } from "../netlify/lib/interpretation.mjs";
import { readingPdf } from "../netlify/lib/readingPdf.mjs";
import { TEXT } from "./support/tier2Fixture.mjs";

/**
 * THE REPEAT, OPTION A (Jeremy 10/22: "need to keep takeaway box, i worked
 * hard on that recently"), and no sentence broken across two PDF pages (the
 * option-A mock broke "What you take in from others" mid-sentence, pages 7/8).
 */

const CHART = {
  type: "Manifesting Generator",
  strategy: "Wait to respond, then inform",
  authority: "Sacral",
  profile: "2/4",
  definition: "Single",
  notSelfTheme: "Frustration",
  signature: "Satisfaction",
  incarnationCross: "Right Angle Cross of Eden (6/36 | 12/11)",
  definedCenters: ["Throat", "Sacral"],
  undefinedCenters: ["Solar Plexus", "Root"],
  openCenters: ["Head", "Ajna", "G", "Heart", "Spleen"],
  channels: ["20-34 (Charisma)"],
  channelLines: ["20-34 (Charisma), Throat to Sacral"],
  activatedGates: [6, 11, 12, 20, 34, 36],
  timeKnown: true,
};

const firstLine = (reading, heading) => sections(reading).get(heading).split("\n").map((l) => l.trim()).find(Boolean);

test("Start here keeps its centers Takeaway; the two center sections drop that same opening line", () => {
  const v = buildReadingView(CHART, TEXT);
  for (const h of [INTERPRETATION[3], INTERPRETATION[4]]) {
    const lede = firstLine(TEXT, h);
    assert.ok(v.centersTakeaway.includes(lede), `the box holds ${h}'s opening line`);
    const sec = v.reading.find((x) => x.heading === h);
    assert.equal(sec.lede, null, `${h} prints no bold opening line`);
    assert.ok(!sec.paragraphs.includes(lede), `${h} does not print it as a paragraph either`);
    assert.ok(sec.paragraphs.length > 0, "the rest of the section stays");
  }
  // Every other section keeps its bold line.
  for (const h of [INTERPRETATION[0], INTERPRETATION[1], INTERPRETATION[2], INTERPRETATION[5]]) {
    assert.equal(v.reading.find((x) => x.heading === h).lede, firstLine(TEXT, h), h);
  }
});

test("a center section whose opening line is NOT the box's sentence keeps it", () => {
  // The box takes each section's first paragraph; a first paragraph of two lines is not its first line.
  const h = INTERPRETATION[3];
  const lede = firstLine(TEXT, h);
  const text = TEXT.replace(lede, `${lede}\nA second line in the same first paragraph, made up for the test.`);
  const v = buildReadingView(CHART, text);
  assert.ok(!v.centersTakeaway.includes(lede));
  assert.equal(v.reading.find((x) => x.heading === h).lede, lede);
});

/**
 * The fixture with every long paragraph said twice: paragraphs of eight lines
 * and more, which must cross pages somewhere. (The paragraph flow before this
 * fix broke 4 of this text's 16 page breaks mid-sentence; checked 10/22.)
 */
const LONG = TEXT.split("\n").map((l) => (l.length > 180 && !l.startsWith("(") ? `${l} ${l}` : l)).join("\n");

/** The reading pages' body lines in order, with their page (10.5 pt, ink, at the margin). */
async function bodyLines(name, reading) {
  const r = await readingPdf({ tier: 2, name, output: CHART, reading, inspect: true });
  return r.runs.filter((x) => x.page >= 5 && x.size === 10.5 && !x.bold && Math.abs(x.x - 54) < 0.5);
}

test("NO SENTENCE IS BROKEN ACROSS TWO PDF PAGES (whatever the name does to the page breaks)", async () => {
  let breaks = 0;
  for (const [name, reading] of [null, "Al", "Jeremy Champagne", "Maximiliana Theodora Fitzgerald-Okonkwo"].flatMap((n) => [[n, TEXT], [n, LONG]])) {
    const lines = await bodyLines(name, reading);
    for (let i = 1; i < lines.length; i++) {
      if (lines[i].page === lines[i - 1].page) continue;
      breaks++;
      assert.match(lines[i - 1].text.trim(), /[.!?]["”’)]*$/, `page ${lines[i - 1].page} ends mid-sentence: "…${lines[i - 1].text.slice(-60)}"`);
    }
  }
  assert.ok(breaks > 0, "the fixture crosses pages, so the rule was tested");
});

test("a section's label never ends a page alone (it keeps its first whole sentences with it)", async () => {
  const r = await readingPdf({ tier: 2, name: "Jeremy Champagne", output: CHART, reading: TEXT, inspect: true });
  const heads = r.runs.filter((x) => x.page >= 5 && x.size === 9 && x.bold && Math.abs(x.x - 54) < 0.5);
  for (const h of heads) {
    const after = r.runs.filter((x) => x.page === h.page && x.y > h.y && x.size >= 10.5 && Math.abs(x.x - 54) < 0.5);
    assert.ok(after.length > 0, `${h.text} is the last thing on page ${h.page}`);
  }
});
