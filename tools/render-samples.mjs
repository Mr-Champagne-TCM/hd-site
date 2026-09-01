/**
 * Render sample PDFs so a layout change can be LOOKED AT, not reasoned about.
 *
 * WHY THIS EXISTS. Adding the third centre row to the glance page pushed the
 * "if you would like more" box past the footer, and the clamp that was supposed
 * to keep it on the page printed it ON TOP of the channels list instead --
 * three layers of overlapping text on a document somebody paid for. Every test
 * passed. Nothing but rendering it and looking would have caught it.
 *
 * Payloads come from the engine's PayloadDumpTest, which picks real charts that
 * hit the centre-state edge cases: an ordinary chart, a Reflector (no defined
 * centres) and one with no open centres -- which the engine sweep puts at one
 * chart in seven, so it is not an exotic case.
 *
 *   ./gradlew :api:test --tests '*PayloadDumpTest*'      (in hd-engine)
 *   node tools/render-samples.mjs <payloadDir> <outDir> [readingFile]
 */
import fs from "node:fs";
import path from "node:path";
import { readingPdf } from "../netlify/lib/readingPdf.mjs";

const [payloadDir, outDir, readingFile] = process.argv.slice(2);
if (!payloadDir || !outDir) {
  console.error("usage: node tools/render-samples.mjs <payloadDir> <outDir> [readingFile]");
  process.exit(1);
}
fs.mkdirSync(outDir, { recursive: true });
const NAMES = { ordinary: "Ordinary Sample", reflector: "Reflector Sample", noopen: "No-Open Sample" };

for (const c of Object.keys(NAMES)) {
  const file = path.join(payloadDir, `${c}.json`);
  if (!fs.existsSync(file)) continue;
  const output = JSON.parse(fs.readFileSync(file, "utf8"));
  const reading = readingFile ? fs.readFileSync(readingFile, "utf8") : null;
  const buf = await readingPdf({ tier: reading ? 2 : 1, name: NAMES[c], output, links: {}, reading });
  const out = path.join(outDir, `${c}${reading ? "-t2" : ""}.pdf`);
  fs.writeFileSync(out, buf);
  console.log(
    `${path.basename(out)}  ${(buf.length / 1024).toFixed(0)} KB  ` +
      `defined=${output.definedCenters.length} undefined=${output.undefinedCenters.length} open=${output.openCenters.length}`,
  );
}
