/**
 * Render EVERY layout class of the PDF, so a change can be checked by looking
 * and by measuring rather than by reasoning about one sample.
 *
 * Rows come from the engine's PayloadDumpTest (real charts picked for their
 * centre-state and density edge cases, each with and without a birth time).
 * Columns are the things the PDF builder branches on:
 *
 *   tier 1            two pages, offer box present
 *   tier 2, reading   the written reading laid out, plus the activations page
 *   tier 2, no text   a reading-tier purchase whose interpretation has not arrived
 *
 * crossed with the buyer's name: absent, short, and long enough to wrap.
 *
 * `legacy-*` is the STORED-READING class: a payload with `undefinedCenters`
 * removed, exactly as every reading bought before the three-state engine is
 * held in the blob store. Those re-render on every open and must keep their
 * two rows, not grow a wrong third one.
 *
 *   node tools/render-matrix.mjs <payloadDir> <outDir>
 */
import fs from "node:fs";
import path from "node:path";
import { readingPdf } from "../netlify/lib/readingPdf.mjs";
import { TEXT } from "../test/support/tier2Fixture.mjs";

const [payloadDir, outDir] = process.argv.slice(2);
if (!payloadDir || !outDir) {
  console.error("usage: node tools/render-matrix.mjs <payloadDir> <outDir>");
  process.exit(1);
}
fs.mkdirSync(outDir, { recursive: true });

const NAMES = {
  noname: null,
  short: "Ada Lovelace",
  long: "Maria de los Angeles Fernandez-Ochoa de la Torre y Villanueva",
};
const TIERS = {
  t1: { tier: 1, reading: null },
  t2: { tier: 2, reading: TEXT },
  t2none: { tier: 2, reading: null },
};

const payloads = fs.readdirSync(payloadDir).filter((f) => f.endsWith(".json")).sort();
const rows = [];
for (const file of payloads) {
  const base = file.replace(/\.json$/, "");
  const output = JSON.parse(fs.readFileSync(path.join(payloadDir, file), "utf8"));
  const variants = [[base, output]];
  if (base === "ordinary" || base === "noopen") {
    // The stored-reading shape: no undefinedCenters key at all.
    const { undefinedCenters, ...legacy } = output;
    void undefinedCenters;
    variants.push([`legacy-${base}`, legacy]);
  }
  for (const [label, out] of variants) {
    for (const [tk, t] of Object.entries(TIERS)) {
      for (const [nk, name] of Object.entries(NAMES)) {
        const buf = await readingPdf({ tier: t.tier, name, output: out, links: {}, reading: t.reading });
        const pdf = `${label}__${tk}__${nk}.pdf`;
        fs.writeFileSync(path.join(outDir, pdf), buf);
        const pages = Number(/\/Count (\d+)/.exec(buf.toString("latin1"))?.[1]);
        rows.push({
          pdf, label, tier: tk, name: nk, pages,
          defined: out.definedCenters?.length ?? null,
          undefined: Array.isArray(out.undefinedCenters) ? out.undefinedCenters.length : "absent",
          open: out.openCenters?.length ?? null,
          channels: out.channels?.length ?? 0,
          timeKnown: out.timeKnown,
        });
      }
    }
  }
}
fs.writeFileSync(path.join(outDir, "matrix.json"), JSON.stringify(rows, null, 2));
for (const r of rows) {
  console.log(
    `${r.pdf.padEnd(40)} pages=${r.pages} def=${r.defined} und=${r.undefined} open=${r.open} ch=${r.channels} time=${r.timeKnown}`,
  );
}
console.log(`${rows.length} PDFs written to ${outDir}`);
