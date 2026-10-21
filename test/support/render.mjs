import { buildSync } from "esbuild";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { pathToFileURL } from "node:url";

/**
 * Render a page component to its HTML, the way the server would, for a test.
 *
 * importTs (./ts.mjs) is for pure functions; a component needs React with it.
 * So one bundle is built from the component's own .tsx with react-dom/server
 * inside it (no DOM, no browser), and `render(name, props)` gives the markup of
 * the first paint -- what a buyer sees before touching anything. Text is what
 * the tests read, so `text(html)` strips the tags.
 */
export async function loadComponents(...segments) {
  const dir = mkdtempSync(join(tmpdir(), "tsxload-"));
  const out = join(dir, "module.mjs");
  const file = join(process.cwd(), ...segments).replace(/\\/g, "/");
  buildSync({
    stdin: {
      contents:
        `export * as M from ${JSON.stringify(file)};\n` +
        `export { renderToStaticMarkup } from "react-dom/server";\n` +
        `export { createElement } from "react";\n`,
      resolveDir: process.cwd(),
      loader: "ts",
    },
    bundle: true,
    outfile: out,
    format: "esm",
    platform: "node",
    jsx: "automatic",
    loader: { ".css": "empty" },
    // React's server build requires Node's own modules, which an ES module bundle can only reach this way.
    banner: { js: 'import { createRequire as __createRequire } from "node:module"; const require = __createRequire(import.meta.url);' },
    logLevel: "silent",
  });
  process.on("exit", () => rmSync(dir, { recursive: true, force: true }));
  const mod = await import(pathToFileURL(out).href);
  const render = (name, props = {}) => {
    // React warns, rightly, that a layout effect does not run on the server; the first paint is what is read here.
    const warn = console.error;
    console.error = (...a) => (/useLayoutEffect does nothing on the server/.test(String(a[0])) ? undefined : warn(...a));
    try {
      return mod.renderToStaticMarkup(mod.createElement(mod.M[name], props));
    } finally {
      console.error = warn;
    }
  };
  return { M: mod.M, render };
}

/** The words of rendered HTML, one space between, entities read. */
export const text = (html) =>
  html
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
