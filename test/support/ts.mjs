import { buildSync } from "esbuild";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { pathToFileURL } from "node:url";

/**
 * Import a TypeScript source file from a test.
 *
 * The entry-form logic lives in .ts because the page is TypeScript, and the
 * tests are plain .mjs run by `node --test`. Something has to bridge that.
 *
 * WHAT THIS REPLACES, AND WHY IT MATTERS. Both date and time tests used to
 * shell out:
 *
 *     execFileSync(process.execPath, [".../node_modules/esbuild/bin/esbuild", ...])
 *
 * That passed on Windows every single time and could never pass on Linux. On
 * Windows `bin/esbuild` is a JavaScript shim, so running it with `node` works.
 * On Linux esbuild's installer REPLACES that same path with the native binary,
 * so `node` reads machine code as source and dies with "Invalid or unexpected
 * token". CI failed on every push for a day and a half on exactly this, and the
 * only reason it was ever noticed is that the failure notices reached an inbox
 * somebody finally read.
 *
 * Two lessons are baked in here rather than written in a comment somewhere:
 *
 *   - use the published API, not a package's internal file layout. `buildSync`
 *     is the same call on every platform and picks its own binary
 *   - depend on what you use. esbuild was a transitive dependency of vite, so
 *     nothing guaranteed its presence, its version, or its shape. It is a
 *     declared devDependency now
 *
 * `pathToFileURL` rather than string-patching the path, because a Windows drive
 * letter is not a valid URL and the hand-rolled version only looked correct.
 */
export async function importTs(...segments) {
  const dir = mkdtempSync(join(tmpdir(), "tsload-"));
  const out = join(dir, "module.mjs");
  buildSync({
    entryPoints: [join(process.cwd(), ...segments)],
    outfile: out,
    format: "esm",
    // Nothing here touches Node or the DOM: these are pure functions about
    // dates and clocks, and keeping the target neutral means the test exercises
    // the same code the browser gets.
    platform: "neutral",
  });
  process.on("exit", () => rmSync(dir, { recursive: true, force: true }));
  return import(pathToFileURL(out).href);
}
