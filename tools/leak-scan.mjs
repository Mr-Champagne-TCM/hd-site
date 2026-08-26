#!/usr/bin/env node
/**
 * What did we just publish?
 *
 * This repo is PUBLIC. Everything committed here is readable by anyone, for
 * ever, including after it is deleted -- git history does not forget. So every
 * commit gets searched before it lands, rather than after somebody notices.
 *
 * Pages hide things. A build inlines a config object, a source map ships the
 * whole original tree, a developer comment explains the thing the comment was
 * meant to protect, an .env gets swept up by a glob. None of it is visible on
 * the rendered page and all of it is one View Source away.
 *
 * Scans BOTH the source and the built output. The built output matters more:
 * source can look clean while the bundler inlines something from outside it.
 *
 *   node tools/leak-scan.mjs [dir ...]     defaults to . and dist
 *
 * A finding blocks. If something is a false positive, narrow the rule --
 * do not add a skip and move on, because the next real one will match it too.
 */
import { readdirSync, readFileSync, statSync, existsSync } from "node:fs";
import { join, extname, relative, sep } from "node:path";

const ROOT = process.cwd();
const SKIP_DIRS = new Set(["node_modules", ".git", ".netlify", "coverage"]);
/** The scanner names the things it hunts, so it must not hunt itself. */
const SKIP_FILES = new Set([join("tools", "leak-scan.mjs")]);
const TEXTY = new Set([
  ".html", ".htm", ".js", ".mjs", ".cjs", ".ts", ".tsx", ".jsx", ".json",
  ".css", ".svg", ".txt", ".md", ".yml", ".yaml", ".toml", ".map", ".env",
]);

const RULES = [
  // --- Secrets ------------------------------------------------------------
  { id: "stripe-live", why: "a live Stripe key", re: /\b[sr]k_live_[A-Za-z0-9]{10,}/ },
  { id: "stripe-test", why: "a Stripe secret key", re: /\bsk_test_[A-Za-z0-9]{10,}/ },
  { id: "github-token", why: "a GitHub token", re: /\bgh[pousr]_[A-Za-z0-9]{20,}|\bgithub_pat_[A-Za-z0-9_]{20,}/ },
  { id: "aws-key", why: "an AWS access key", re: /\bAKIA[0-9A-Z]{16}\b/ },
  { id: "anthropic-key", why: "an Anthropic API key", re: /\bsk-ant-[A-Za-z0-9-]{20,}/ },
  { id: "private-key", why: "a private key block", re: /-----BEGIN [A-Z ]*PRIVATE KEY-----/ },
  { id: "slack-token", why: "a Slack token", re: /\bxox[abposr]-[A-Za-z0-9-]{10,}/ },
  { id: "engine-key", why: "an engine API key", re: /X-Engine-Key["'\s:=]+[A-Za-z0-9_-]{16,}/i },
  { id: "assigned-secret", why: "a secret assigned inline instead of read from the environment",
    re: /\b(secret|passcode|password|api_?key|token)\s*[:=]\s*["'][A-Za-z0-9_\-\/+=]{16,}["']/i },

  // --- The engine's insides (A-6, C-2) ------------------------------------
  { id: "engine-internals", why: "an engine internal that must never cross the wire",
    re: /\b(ecliptic\s*longitude|julian\s*day|designInstant|WHEEL_START|EphemerisProvider|AstronomyEphemeris)\b/i },
  { id: "kotlin-source", why: "engine source. This repo compiles no Kotlin", ext: [".kt", ".kts"] },
  { id: "reading-prompt", why: "the reading prompt, which never leaves the private side",
    re: /you are writing a human design reading|hd-reading-prompt/i },

  // --- Real people (D-section) --------------------------------------------
  { id: "client-name", why: "a real client's name", re: /\b(Desiree|Pierre|Diana|Anon Omous)\b/ },
  { id: "phone", why: "what looks like a phone number", re: /\b\(?\d{3}\)?[ .-]\d{3}[ .-]\d{4}\b/ },
  { id: "birth-data", why: "what looks like stored birth data",
    re: /"(birthDate|birthTime|birthLocal|clients)"\s*:/ },

  // --- Things a build leaves behind ---------------------------------------
  { id: "source-map", why: "a source map, which republishes the whole original tree", ext: [".map"], builtOnly: true },
  { id: "sourcemap-link", why: "a link to a source map", re: /\/\/# sourceMappingURL=/, builtOnly: true },
  { id: "env-file", why: "an environment file", name: /^\.env(\..+)?$/ },
  { id: "todo-comment", why: "a note to ourselves, shipped to the public",
    re: /<!--[^>]*\b(TODO|FIXME|HACK|XXX|do not ship|internal only)\b/i },
  { id: "localhost", why: "a local address left in the build", re: /https?:\/\/(localhost|127\.0\.0\.1)/, builtOnly: true },
];

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

const targets = process.argv.slice(2);
const roots = targets.length ? targets : [".", "dist"];
const findings = [];

for (const root of roots) {
  if (!existsSync(root)) continue;
  const built = root.replace(/^\.\//, "") === "dist";
  for (const file of walk(root)) {
    const rel = relative(ROOT, file);
    if (SKIP_FILES.has(rel)) continue;
    if (rel.split(sep).some((p) => SKIP_DIRS.has(p))) continue;
    const ext = extname(file).toLowerCase();
    const base = rel.split(sep).pop();

    for (const rule of RULES) {
      if (rule.builtOnly && !built) continue;
      if (rule.ext && rule.ext.includes(ext)) {
        findings.push({ rel, rule, line: 0, text: `(${ext} file)` });
        continue;
      }
      if (rule.name && rule.name.test(base)) {
        findings.push({ rel, rule, line: 0, text: "(by filename)" });
        continue;
      }
      if (!rule.re) continue;
      if (!TEXTY.has(ext)) continue;
      let content;
      try { content = readFileSync(file, "utf8"); } catch { continue; }
      const lines = content.split(/\r?\n/);
      for (let i = 0; i < lines.length; i++) {
        if (rule.re.test(lines[i])) {
          findings.push({ rel, rule, line: i + 1, text: lines[i].trim().slice(0, 90) });
          break; // one report per rule per file is enough to block
        }
      }
    }
  }
}

if (findings.length === 0) {
  console.log(`leak-scan: clean across ${roots.filter(existsSync).join(", ")}`);
  process.exit(0);
}

console.error(`\nBLOCKED: ${findings.length} thing(s) that should not be published here.\n`);
for (const f of findings) {
  console.error(`  ${f.rel}${f.line ? ":" + f.line : ""}`);
  console.error(`    ${f.rule.why}  [${f.rule.id}]`);
  console.error(`    ${f.text}\n`);
}
console.error("This repo is public and git history does not forget. Remove it before committing,");
console.error("and if a value was ever real, treat it as published and rotate it.\n");
process.exit(1);
