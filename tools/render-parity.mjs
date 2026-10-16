/**
 * Renders the shop PDF for the phone's four made-up fixture clients
 * (test/fixtures/phone-parity), or for one shop record, so it can be LOOKED
 * at beside the phone's.
 *
 *   node tools/render-parity.mjs <outDir>            -> <outDir>/<slug>.pdf
 *   node tools/render-parity.mjs <out.pdf> <record.json> [name] [birth.json]
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { readingPdf } from "../netlify/lib/readingPdf.mjs";
import { SITE } from "../netlify/lib/siteLinks.mjs";

const here = fileURLToPath(new URL("../test/fixtures/phone-parity/", import.meta.url));
const local = fileURLToPath(new URL("../test/fixtures/phone-parity.local/", import.meta.url));
export const FIXTURES = [
  ["claude-test-four", "Claude Test Four", { date: "1976-12-14", time: "18:18" }],
  ["claude-test-three", "Claude Test Three", { date: "1964-03-20", time: "14:44" }],
  ["claude-test-two", "Claude Test Two", { date: "1976-09-17", time: "13:39" }],
  ["claude-test", "Claude Test", { date: "1987-03-14", time: "08:45" }],
];

const [out, record, name, birthFile] = process.argv.slice(2);
if (record) {
  const r = JSON.parse(readFileSync(record, "utf8"));
  const birth = birthFile ? JSON.parse(readFileSync(birthFile, "utf8")) : (r.birth ?? null);
  const bytes = await readingPdf({ tier: r.tier, name: name ?? r.buyer?.name ?? null, output: r.output, links: SITE, reading: r.reading ?? null, birth });
  writeFileSync(out, bytes);
  console.log(`wrote ${out} (${bytes.length} bytes)`);
} else {
  mkdirSync(out, { recursive: true });
  for (const [slug, nm, b] of FIXTURES) {
    const output = JSON.parse(readFileSync(join(here, `${slug}.output.json`), "utf8"));
    const reading = readFileSync(join(local, `${slug}.reading.txt`), "utf8"); // tools/phone-parity-sync.mjs
    const birth = { ...b, timeKnown: true, place: "Chicago, Illinois", zone: "America/Chicago" };
    const bytes = await readingPdf({ tier: 2, name: nm, output, links: SITE, reading, birth });
    writeFileSync(join(out, `${slug}.pdf`), bytes);
    console.log(`wrote ${slug}.pdf (${bytes.length} bytes)`);
  }
}
