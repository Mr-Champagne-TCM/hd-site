import { test } from "node:test";
import assert from "node:assert/strict";
import { readingPdf, NOTE_LINE_GAP } from "../netlify/lib/readingPdf.mjs";
import { Layout, layout, lineMetrics } from "../netlify/lib/pdfText.mjs";
import { TEXT } from "./support/tier2Fixture.mjs";

/**
 * BATCH-1024 ITEM 1 (live retest 10/23): a wrapped margin note had an extra
 * gap between its lines ("Decided over time, not in / the moment.", "Right
 * Angle Cross of Eden / (36/6 | 11/12)"). A note's lines now step by the
 * type's own line height, the step its label already took onto its value;
 * the body text keeps its spacing.
 */

const CHART = {
  type: "Manifesting Generator",
  strategy: "Wait to respond, then inform",
  authority: "Emotional",
  profile: "2/4",
  definition: "Single",
  signature: "Satisfaction",
  notSelfTheme: "Frustration",
  incarnationCross: "Right Angle Cross of Eden (36/6 | 11/12)",
  definedCenters: ["Throat", "Sacral", "Solar Plexus"],
  undefinedCenters: ["Root"],
  openCenters: ["Head", "Ajna", "G", "Heart", "Spleen"],
  channels: ["20-34 (Charisma)"],
  channelLines: ["20-34 (Charisma), Throat to Sacral"],
  timeKnown: true,
};

const NOTE_STEP = lineMetrics(8.5).h; // 10pt: the label-to-value step

let cached = null;
async function runs() {
  if (cached) return cached;
  const r = await readingPdf({ tier: 2, name: "Robin Testwell", output: CHART, reading: TEXT, inspect: true });
  cached = r.runs;
  return cached;
}

function after(rs, text) {
  const i = rs.findIndex((x) => x.text === text);
  assert.ok(i >= 0, `${text} not printed`);
  return [rs[i], rs[i + 1]];
}

test("item 1: a wrapped margin value steps like its label onto it, no extra gap", async () => {
  const rs = (await runs()).filter((x) => x.size === 8.5 && x.x >= 430);
  for (const [first, second] of [
    ["Decided over time, not in", "the moment."],
    ["Right Angle Cross of Eden", "(36/6 | 11/12)"], // no-break spaces around the bar
  ]) {
    const [a, b] = after(rs, first);
    assert.equal(b.text, second, `${first} wraps before ${second}`);
    assert.equal(b.page, a.page);
    assert.equal(b.y - a.y, NOTE_STEP, `${first} / ${second}: ${b.y - a.y}pt between lines`);
  }
  // The label onto its value: the same step.
  const [label, value] = after(rs, "EMOTIONAL AUTHORITY");
  assert.equal(value.text, "Decided over time, not in");
  assert.equal(value.y - label.y, NOTE_STEP);
  // A label that breaks ("ON TRACK, / THE FEELING IS") steps the same way.
  const [on, feel] = after(rs, "ON TRACK,");
  assert.equal(feel.text, "THE FEELING IS");
  assert.equal(feel.y - on.y, NOTE_STEP);
});

test("item 1: the notes stay apart (9pt between one note and the next label)", async () => {
  const rs = (await runs()).filter((x) => x.size === 8.5 && x.x >= 430);
  const [, last] = after(rs, "Decided over time, not in");
  const [center] = after(rs, "CENTER");
  assert.equal(center.y - last.y, NOTE_STEP + 9);
});

test("item 1: a label that breaks keeps one link box per line, and the boxes do not overlap", async () => {
  const r = await readingPdf({ tier: 2, name: "Robin Testwell", output: CHART, reading: TEXT, inspect: true });
  const type = r.links.filter((l) => l.uri.endsWith("#type-manifesting-generator") && l.left >= 430);
  const [m, g] = [r.runs.find((x) => x.text === "MANIFESTING"), r.runs.find((x) => x.text === "GENERATOR")];
  const mine = type.filter((l) => l.page === m.page && l.top < g.y + 3 && l.bottom > m.y - 10);
  assert.equal(mine.length, 2, JSON.stringify(type));
  const [a, b] = mine.sort((p, q) => p.top - q.top);
  assert.ok(a.bottom <= b.top + 0.01, `boxes overlap: ${a.bottom} > ${b.top}`);
  assert.ok(a.top < m.y && a.bottom > m.y && b.top < g.y && b.bottom > g.y, "each box sits on its own line");
});

test("item 1: the body text keeps its own spacing (x1.08 + 3pt)", async () => {
  const body = (await runs()).filter((x) => x.size === 10.5 && x.x < 120 && !x.bold);
  const steps = new Set();
  for (let i = 1; i < body.length; i++) if (body[i].page === body[i - 1].page) steps.add(+(body[i].y - body[i - 1].y).toFixed(2));
  const m = lineMetrics(10.5);
  assert.ok(steps.has(m.h + m.extra), `body steps: ${[...steps].join(", ")}`);
  assert.equal(m.h + m.extra, 17);
});

test("item 1: Layout's default spacing is unchanged; the override only replaces the room between lines", async () => {
  const PDFDocument = (await import("pdfkit")).default;
  const doc = new PDFDocument({ autoFirstPage: false });
  doc.registerFont("body", "Helvetica"); // the spacing does not depend on the face
  const p = { size: 8.5, color: "#000", bold: false, letterSpacing: 0 };
  const text = "Right Angle Cross of Eden\n(36/6 | 11/12)";
  const plain = new Layout(doc, text, p, 122);
  const tight = layout(doc, text, p, 122, { extra: NOTE_LINE_GAP });
  assert.equal(plain.lineCount, 2);
  assert.equal(plain.height, 10 + 4 + 10);
  assert.equal(tight.lineCount, 2);
  assert.equal(tight.height, 10 + NOTE_LINE_GAP + 10);
  assert.equal(NOTE_LINE_GAP, 0);
});
