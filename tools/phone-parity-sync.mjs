/**
 * Copies the phone app's PDF output into this repo's parity fixtures, so
 * test/phoneParity.test.mjs can hold the shop's PDF to the phone's.
 *
 *   1. In ../hd-reading-app:  ./gradlew :app:testDebugUnitTest --tests "*PdfOrderTest" --tests "*PdfBrandingTest" --tests "*LibraryLinksTest"
 *   2. Here:                  node tools/phone-parity-sync.mjs [../hd-reading-app]
 *
 * WHAT GOES WHERE. This repo is PUBLIC and the phone's is private:
 *   test/fixtures/phone-parity/        committed -- the library's one-liners
 *                                      (public on the website already), the
 *                                      library anchors, the engine's chart
 *                                      values for the four made-up clients
 *   test/fixtures/phone-parity.local/  gitignored -- the four model-written
 *                                      readings and the phone's page text and
 *                                      link boxes, which carry them
 * Without the .local folder the parity tests skip and say so.
 */
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const phone = process.argv[2] ?? join(root, "..", "hd-reading-app");
const pub = join(root, "test", "fixtures", "phone-parity");
const priv = join(root, "test", "fixtures", "phone-parity.local");
mkdirSync(pub, { recursive: true });
mkdirSync(priv, { recursive: true });

const SLUGS = ["claude-test-four", "claude-test-three", "claude-test-two", "claude-test"];
const app = join(phone, "app");

copyFileSync(join(app, "src/main/kotlin/co/thechampagnemethod/hdreadings/LibraryGlance.kt"), join(pub, "LibraryGlance.kt.txt"));
copyFileSync(join(app, "build/pdf-links/library-targets.txt"), join(pub, "phone-library-targets.txt"));

const xml = readFileSync(
  join(app, "build/test-results/testDebugUnitTest/TEST-co.thechampagnemethod.hdreadings.PdfBrandingTest.xml"),
  "utf8",
);
for (const slug of SLUGS) {
  copyFileSync(join(app, `src/test/resources/pdf/${slug}.txt`), join(priv, `${slug}.reading.txt`));
  copyFileSync(join(app, `build/pdf-render/${slug}/text.tsv`), join(priv, `${slug}.phone.tsv`));
  const line = new RegExp(`LINKS ${slug}: (.*)`).exec(xml)?.[1];
  if (!line) throw new Error(`no LINKS line for ${slug} -- run the phone's PdfBrandingTest first`);
  const rows = line.split("; ").map((item) => {
    const [page, uri] = item.split(" ", 2);
    const box = item.slice(item.indexOf("[") + 1, item.indexOf("]")).split(" ");
    return [page.slice(1), uri, ...box].join("\t");
  });
  writeFileSync(join(priv, `${slug}.phone.links.tsv`), rows.join("\n") + "\n");
}
console.log(`synced ${SLUGS.length} clients from ${phone}`);
// The engine values (test/fixtures/phone-parity/*.output.json) are NOT copied
// here: they came from hd-engine itself (ChartScope.scope at the reading tier,
// engine 0.4.0, for the same four Chicago births), with the drawing and the
// computedAt instant removed. Remake them that way if the engine changes.
