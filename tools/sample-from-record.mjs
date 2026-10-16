/**
 * Turn one stored reading record into the public samples the readings page
 * shows: the drawing, the chart-tier PDF exactly as it downloads, and the
 * values for the summary table.
 *
 * The record is whatever `netlify blobs:get readings <id>` returned.
 *
 * THE PDF IS BUILT THE WAY /api/pdf BUILDS ONE (pdfHandler.mjs): the record's
 * output, its birth block (the birth line under the name, kept since 16 Oct
 * 2026) and the name the shop would print. The tier is the CHART tier whatever
 * was bought, because the readings page offers it under "The chart".
 *
 * THE NAME is the one a delivered PDF prints: the buyer's name from Stripe,
 * kept on the record. A purchase made with a 100%-off code collects none, so
 * its own download says "Your Human Design". `--name` supplies the name a
 * paying buyer's checkout would have kept -- only ever with that person's
 * leave (Jeremy 10/16, for his own chart: "my name is OK").
 *
 *   node tools/sample-from-record.mjs <record.json> <outDir> [--name "Jeremy Champagne"]
 */
import fs from "node:fs";
import path from "node:path";
import { readingPdf } from "../netlify/lib/readingPdf.mjs";
import { birthRecord } from "../netlify/lib/reading.mjs";
import { birthLine } from "../shared/birthLine.mjs";

const args = process.argv.slice(2);
const at = args.indexOf("--name");
const nameArg = at >= 0 ? args.splice(at, 2)[1] : undefined;
const [recordPath, outDir] = args;
if (!recordPath || !outDir || (at >= 0 && !nameArg)) {
  console.error('usage: node tools/sample-from-record.mjs <record.json> <outDir> [--name "Full Name"]');
  process.exit(1);
}
fs.mkdirSync(outDir, { recursive: true });
const record = JSON.parse(fs.readFileSync(recordPath, "utf8"));
const output = record.output;
const birth = birthRecord(record.birth);
const name = nameArg ?? record.buyer?.name ?? null;

fs.writeFileSync(path.join(outDir, "bodygraph.svg"), output.bodygraphSvg);
const pdf = await readingPdf({ tier: 1, name, output, links: {}, reading: null, birth });
fs.writeFileSync(path.join(outDir, "the-chart.pdf"), pdf);

const values = {
  Type: output.type,
  Strategy: output.strategy,
  Authority: output.authority,
  Profile: output.profile,
  Definition: output.definition,
  "Not-Self Theme": output.notSelfTheme,
  Signature: output.signature,
  "Incarnation Cross": output.incarnationCross,
  "Defined centers": output.definedCenters.join(" · "),
  "Undefined centers": output.undefinedCenters.join(" · "),
  "Open centers": output.openCenters.join(" · "),
  channels: output.channels.join(" · "),
  engineVersion: output.engineVersion,
  timeKnown: output.timeKnown,
  title: name || "Your Human Design",
  birthLine: birthLine(birth),
};
fs.writeFileSync(path.join(outDir, "values.json"), JSON.stringify(values, null, 2));
if (record.reading) fs.writeFileSync(path.join(outDir, "reading.txt"), record.reading);
console.log(JSON.stringify(values, null, 2));
console.log(`svg ${output.bodygraphSvg.length} chars, pdf ${pdf.length} bytes, reading ${record.reading ? record.reading.length : 0} chars`);
