/**
 * Turn one stored reading record into the public samples the readings page
 * shows: the drawing, the chart-tier PDF exactly as it downloads, and the
 * values for the summary table.
 *
 * The record is whatever `netlify blobs:get readings <id>` returned. Nothing
 * about the buyer is copied out: the name is not printed on the sample PDF,
 * and the record holds no birth data to begin with.
 *
 *   node tools/sample-from-record.mjs <record.json> <outDir>
 */
import fs from "node:fs";
import path from "node:path";
import { readingPdf } from "../netlify/lib/readingPdf.mjs";

const [recordPath, outDir] = process.argv.slice(2);
if (!recordPath || !outDir) {
  console.error("usage: node tools/sample-from-record.mjs <record.json> <outDir>");
  process.exit(1);
}
fs.mkdirSync(outDir, { recursive: true });
const record = JSON.parse(fs.readFileSync(recordPath, "utf8"));
const output = record.output;

fs.writeFileSync(path.join(outDir, "bodygraph.svg"), output.bodygraphSvg);
const pdf = await readingPdf({ tier: 1, name: null, output, links: {}, reading: null });
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
  "Defined centres": output.definedCenters.join(" · "),
  "Undefined centres": output.undefinedCenters.join(" · "),
  "Open centres": output.openCenters.join(" · "),
  channels: output.channels.join(" · "),
  engineVersion: output.engineVersion,
  timeKnown: output.timeKnown,
};
fs.writeFileSync(path.join(outDir, "values.json"), JSON.stringify(values, null, 2));
if (record.reading) fs.writeFileSync(path.join(outDir, "reading.txt"), record.reading);
console.log(JSON.stringify(values, null, 2));
console.log(`svg ${output.bodygraphSvg.length} chars, pdf ${pdf.length} bytes, reading ${record.reading ? record.reading.length : 0} chars`);
