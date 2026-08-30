/**
 * Prerender the offer page, and ONLY the offer page.
 *
 * WHY. The shop is React mounted into an empty <div id="root">, so the HTML the
 * server actually sends is 643 bytes: a script tag and nothing else. A reader
 * with a browser sees a full page; anything that does not run JavaScript sees a
 * blank document. That includes Stripe's own website check -- which is how an
 * account review came to say "your business website must be accessible and
 * include detailed information about your business and the products you sell"
 * for a site that describes all three tiers in detail.
 *
 * It is also every link preview: Slack, iMessage, WhatsApp and Facebook all
 * fetch without running scripts, so sharing the shop shared an empty card.
 *
 * PORTED FROM the-champagne-method/scripts/prerender.mjs rather than invented.
 * That one has been rendering six pages for months; this is the same approach
 * with a different route list and one addition it does not need.
 *
 * THE ADDITION: /r/ AND /u/ MUST NOT GET THE OFFER PAGE.
 *
 * netlify.toml sends /r/* and /u/* to index.html, because a delivered reading
 * has no file of its own. If index.html carried the prerendered OFFER page,
 * somebody opening their reading link would see the sales page flash up and
 * then be replaced -- React swaps the container on mount, so the wrong content
 * is painted first. On the one page somebody has paid for.
 *
 * So the un-prerendered shell is kept as app.html and the redirects point
 * there. The offer page gets the words; the reading link gets the blank shell
 * it has always had, which is correct for a page whose content is private and
 * arrives over the network anyway.
 *
 * VALIDATED BEFORE IT IS WRITTEN. A render that comes back short, loses its
 * title, or loses its module script is discarded and the built file is left
 * exactly as it was. A prerender that silently produces a worse page than no
 * prerender is the failure worth guarding against.
 */
import { createServer } from "node:http";
import { readFile, writeFile, copyFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { execFile } from "node:child_process";
import { extname, join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const run = promisify(execFile);
const DIST = join(dirname(fileURLToPath(import.meta.url)), "..", "dist");
const PORT = 4198;

/**
 * One route. The offer page is the only page with public content -- everything
 * else behind this domain is a token away and belongs to one person.
 */
const ROUTES = [{ path: "/", sentinel: "Human Design" }];

const CHROME_CANDIDATES = [
  process.env.CHROME_PATH,
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
  "/usr/bin/google-chrome",
  "/usr/bin/google-chrome-stable",
  "/usr/bin/chromium-browser",
  "/usr/bin/chromium",
].filter(Boolean);

const MIME = {
  ".html": "text/html", ".js": "text/javascript", ".css": "text/css",
  ".svg": "image/svg+xml", ".json": "application/json", ".jpg": "image/jpeg",
  ".png": "image/png", ".ico": "image/x-icon", ".woff2": "font/woff2",
  ".txt": "text/plain", ".webmanifest": "application/manifest+json",
};

function findChrome() {
  for (const c of CHROME_CANDIDATES) if (existsSync(c)) return c;
  return null;
}

function serve() {
  const server = createServer(async (req, res) => {
    let p = decodeURIComponent(req.url.split("?")[0]);
    if (p.endsWith("/")) p += "index.html";
    try {
      const body = await readFile(join(DIST, p));
      res.writeHead(200, { "Content-Type": MIME[extname(p)] ?? "application/octet-stream" });
      res.end(body);
    } catch {
      res.writeHead(404).end("not found");
    }
  });
  return new Promise((resolve) => server.listen(PORT, "127.0.0.1", () => resolve(server)));
}

const textLength = (html) =>
  html.replace(/<script[\s\S]*?<\/script>/g, "").replace(/<[^>]*>/g, "").replace(/\s+/g, "").length;

/**
 * THE SHELL IS SAVED FIRST, before anything is rendered over the top of it.
 * If this step did not happen, a second build would copy the ALREADY
 * prerendered index.html into app.html and every reading link would start
 * showing the offer page.
 */
await copyFile(join(DIST, "index.html"), join(DIST, "app.html"));
console.log("[prerender] app.html written — the shell /r/ and /u/ are served from");

const chrome = findChrome();
if (!chrome) {
  console.warn("[prerender] SKIPPED — no Chrome found. The offer page ships as the React shell.");
  process.exit(0);
}

const server = await serve();
let written = 0;

for (const { path, sentinel } of ROUTES) {
  const target = join(DIST, path.slice(1), "index.html");
  const before = await readFile(target, "utf8");
  const beforeLen = textLength(before);
  const title = before.match(/<title>([^<]*)<\/title>/)?.[1] ?? "";

  let html;
  try {
    const { stdout } = await run(
      chrome,
      ["--headless=new", "--disable-gpu", "--no-sandbox", "--hide-scrollbars",
        "--virtual-time-budget=12000", "--dump-dom", `http://127.0.0.1:${PORT}${path}`],
      { maxBuffer: 64 * 1024 * 1024 },
    );
    html = stdout;
  } catch (err) {
    console.warn(`[prerender] ${path} — Chrome failed (${err.message.split("\n")[0]}), left as built`);
    continue;
  }

  const afterLen = textLength(html);
  const problems = [];
  if (!html.startsWith("<!DOCTYPE html>")) problems.push("no doctype");
  if (!html.includes('<script type="module"')) problems.push("lost the module script");
  if (title && !html.includes(`<title>${title}</title>`)) problems.push("lost its title");
  if (!html.includes(sentinel)) problems.push(`missing sentinel "${sentinel}"`);
  if (afterLen <= beforeLen) problems.push(`no text gained (${beforeLen} -> ${afterLen})`);

  if (problems.length) {
    console.warn(`[prerender] ${path} — REJECTED: ${problems.join("; ")}. Left as built.`);
    continue;
  }

  await writeFile(target, html, "utf8");
  written++;
  console.log(`[prerender] ${path.padEnd(24)} ${beforeLen} -> ${afterLen} chars of text`);
}

server.close();
console.log(`[prerender] ${written} of ${ROUTES.length} prerendered`);
