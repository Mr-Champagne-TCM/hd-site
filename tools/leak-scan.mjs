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
 * Two jobs:
 *   1. nothing personal escapes -- names, emails, phone numbers, birth data
 *   2. no back door into paid work -- no paid tier asked for from the client,
 *      no paid content in the bundle, no unlock switch, no grant signing
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
/**
 * The scanner itself holds every pattern it looks for, so it always matches
 * itself. And `.local.` files are gitignored by definition -- they exist to
 * hold exactly the things this refuses to publish, which is why they are named
 * that way and why scanning them would make the rule unusable.
 */
const SKIP_FILES = new Set([join("tools", "leak-scan.mjs")]);
const SKIP_LOCAL = /\.local\.[A-Za-z0-9]+$/;
const TEXTY = new Set([
  ".html", ".htm", ".js", ".mjs", ".cjs", ".ts", ".tsx", ".jsx", ".json",
  ".css", ".svg", ".txt", ".md", ".yml", ".yaml", ".toml", ".map", ".env",
]);

/**
 * Terms too sensitive to write down in a public repo -- real client names, in
 * practice.
 *
 * The first version of this file hardcoded four of them. That put four real
 * first names into a public repo: the scanner leaking exactly what it was
 * written to catch. They live outside the repo now.
 *
 *   tools/private-terms.local.txt   gitignored, for this clone
 *   LEAK_SCAN_TERMS                 newline or comma separated, for CI
 *
 * When neither is present the scan still runs and SAYS SO in its output, rather
 * than passing quietly with a rule switched off.
 */
function privateTerms() {
  const out = [];
  const file = join(ROOT, "tools", "private-terms.local.txt");
  if (existsSync(file)) out.push(...readFileSync(file, "utf8").split("\n"));
  if (process.env.LEAK_SCAN_TERMS) out.push(...process.env.LEAK_SCAN_TERMS.split(/[\n,]/));
  return out.map((t) => t.trim()).filter((t) => t && !t.startsWith("#"));
}

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const RULES = [
  // --- Secrets ------------------------------------------------------------
  { id: "stripe-live", why: "a live Stripe key", re: /\b[sr]k_live_[A-Za-z0-9]{10,}/ },
  { id: "stripe-secret", why: "a Stripe secret key", re: /\bsk_test_[A-Za-z0-9]{10,}/ },
  { id: "github-token", why: "a GitHub token", re: /\bgh[pousr]_[A-Za-z0-9]{20,}|\bgithub_pat_[A-Za-z0-9_]{20,}/ },
  { id: "aws-key", why: "an AWS access key", re: /\bAKIA[0-9A-Z]{16}\b/ },
  { id: "anthropic-key", why: "an Anthropic API key", re: /\bsk-ant-[A-Za-z0-9-]{20,}/ },
  { id: "private-key", why: "a private key block", re: /-----BEGIN [A-Z ]*PRIVATE KEY-----/ },
  { id: "slack-token", why: "a Slack token", re: /\bxox[abposr]-[A-Za-z0-9-]{10,}/ },
  { id: "engine-key", why: "an engine API key", re: /X-Engine-Key["'\s:=]+[A-Za-z0-9_-]{16,}/i },
  {
    id: "assigned-secret",
    why: "a secret assigned inline instead of read from the environment",
    re: /\b(secret|passcode|password|api_?key|token)\s*[:=]\s*["'][A-Za-z0-9_\-/+=]{16,}["']/i,
  },

  // --- The engine's insides (A-6, C-1, C-2) -------------------------------
  {
    id: "engine-internals",
    why: "an engine internal that must never cross the wire",
    re: /\b(ecliptic\s*longitude|julian\s*day|designInstant|WHEEL_START|EphemerisProvider|AstronomyEphemeris)\b/i,
  },
  { id: "engine-source", why: "engine source. This repo compiles no Kotlin", ext: [".kt", ".kts"] },
  {
    id: "reading-prompt",
    why: "the reading prompt, which never leaves the private side",
    re: /hd-reading-prompt|you are writing a human design reading/i,
  },

  // --- Real people (D-section) --------------------------------------------
  { id: "phone", why: "what looks like a phone number", re: /\b\(?\d{3}\)?[ .-]\d{3}[ .-]\d{4}\b/ },
  {
    id: "real-email",
    why: "an email address that is not an obviously invented one",
    // OUR OWN SENDING DOMAIN IS NOT A LEAK. `hd-readings@thechampagnemethod.co`
    // is printed in the headers of every email the site sends. It exists to be
    // seen, and hiding it in an environment variable would protect nothing
    // while making the product's own voice settable per deploy.
    //
    // Narrowed to that domain and no further. A CLIENT's address is never at
    // thechampagnemethod.co, so this carve-out cannot swallow the case the rule
    // was written for. gmail.com is deliberately NOT included: a personal inbox
    // in a public repo is exactly what this catches, it caught one, and the fix
    // was to stop putting it there rather than to allow it.
    //
    // The carve-out ends with `(?![A-Za-z0-9.-])` and NOT with `\b`, which is
    // the difference between allowing our domain and allowing anything that
    // starts with it. `\b` matches at the dot in
    // `someone@thechampagnemethod.co.attacker.com`, so the first version of
    // this narrowing let an attacker-controlled domain through by prefix. Its
    // own test caught it.
    re: /\b[A-Za-z0-9._%+-]+@(?!example\.(com|org|net)\b|thechampagnemethod\.co(?![A-Za-z0-9.-]))[A-Za-z0-9.-]+\.(?!invalid\b)[A-Za-z]{2,}\b/,
  },
  {
    id: "birth-data",
    why: "what looks like stored birth data or a passcode",
    re: /"(birthDate|birthTime|birthLocal|clients|passcode)"\s*:/,
  },

  // --- A back door into paid work (A-5, P-1) ------------------------------
  //
  // The tier boundary is enforced inside the engine and the edge fixes tier at
  // 0, so nothing here should be asking for a paid tier or carrying paid
  // content. If any of this shows up, either the boundary moved or somebody
  // built a shortcut, and both are worth stopping a commit for.
  {
    id: "paid-tier-request",
    why: "client code asking for a paid tier - the edge fixes tier at 0",
    // Narrowed to the shipping surface rather than skipped in tests: the test
    // that names tier 2 exists to PROVE the edge ignores it, which is the
    // opposite of a back door. Every other rule still covers tests.
    onlyIn: ["src/", "dist/", "netlify/", "shared/"],
    re: /\btier\s*[:=]\s*["']?[12]\b|[?&]tier=[12]\b/,
  },
  {
    id: "paid-content",
    why: "paid content sitting in a public repo",
    // Not word-anchored around the quoted forms: a word boundary before a
    // quote can never match, needing a word character on one side. The
    // first draft of this rule was unfireable and its test caught it.
    //
    // NARROWED, with evidence. It used to match the bare identifier
    // `bodygraphSvg`, which made the chart tier unbuildable: the page has to
    // name the field to display the drawing, so the client, the type and the
    // bundle all carry the word by necessity. A rule that fires on the only
    // possible spelling of a required feature is a rule that gets skipped, and
    // a skipped rule protects nothing.
    //
    // A NAME IS NOT CONTENT. What must never be committed is the field
    // carrying an actual drawing, which the value form below catches, and a
    // render sitting in the tree as a file, which is the rule after this one.
    // Both are about bytes, not identifiers.
    re: /["']bodygraphSvg["']\s*:\s*["']\s*<svg|["']interpretation["']|["']activations["']/,
  },
  {
    id: "rendered-chart",
    why: "a rendered bodygraph committed to a public repo",
    // The picture is Jeremy's design -- the palette, the three-tier lighting,
    // the solved label positions -- and D-10 makes it the single global look
    // for the product. The chart LAYOUT is public knowledge on every Human
    // Design site; the DRAWING of it is not, and a committed render hands the
    // whole appearance to anyone who clones the repo.
    //
    // Matched on the renderer's own viewBox, which is specific to this drawing
    // and appears in every render. This caught a real one: a 188 KB sample was
    // about to go in as a test fixture.
    re: /viewBox\s*=\s*["']-120 -12 1090 1330["']/,
  },
  {
    id: "unlock-switch",
    why: "an unlock, bypass or preview switch",
    re: /[?&](unlock|bypass|admin|debug|preview|comp)=(1|true|yes)\b|\b(isPaid|hasPaid|unlocked|bypassPaywall)\s*=\s*true\b/i,
  },
  {
    id: "grant-minting",
    why: "signing or grant logic, which belongs server-side",
    re: /\bcreateHmac\b|\bHMAC_SECRET\b|\bmintGrant\b/,
    /**
     * Narrowed 2026-08-27, after it fired correctly and then fired wrongly.
     *
     * It fired CORRECTLY on `shared/grant.mjs` and blocked the commit. That was
     * a real mistake: `src/App.tsx` imports `shared/pricing.mjs`, so everything
     * in `shared/` is bundled and served, and signing code was sitting one
     * careless import from the browser. The file moved to `netlify/lib/`.
     *
     * Then it fired on the moved file, which is the rule contradicting its own
     * reason: it exists to keep this code server-side, so flagging it FOR being
     * server-side blocks the fix it just demanded. Netlify functions live in
     * this repo and are never bundled to the browser.
     *
     * `dist/` is the load-bearing entry. That is the built bundle, so if grant
     * logic ever does reach the browser -- by an import from src/, by a bundler
     * change, by anything -- this still blocks, which is the protection that
     * actually matters. Narrowing it did not weaken it; leaving it to cry wolf
     * on every server file is what would have.
     */
    onlyIn: ["src/", "shared/", "dist/"],
  },
  {
    id: "price-literal",
    why: "a price written outside shared/pricing.mjs (P-1)",
    re: /\$\s?(1\.11|11\.11|44\.44|33\.33|10\.00)\b/,
    exceptIn: ["shared/pricing.mjs", "DECISIONS.md", "README.md"],
  },

  // --- Things a build leaves behind ---------------------------------------
  { id: "source-map", why: "a source map, which republishes the whole original tree", ext: [".map"], builtOnly: true },
  { id: "sourcemap-link", why: "a link to a source map", re: /\/\/# sourceMappingURL=/, builtOnly: true },
  { id: "env-file", why: "an environment file", name: /^\.env(\..+)?$/ },
  {
    id: "todo-comment",
    why: "a note to ourselves, shipped to the public",
    re: /<!--[^>]*\b(TODO|FIXME|HACK|XXX|do not ship|internal only)\b/i,
  },
  { id: "localhost", why: "a local address left in the build", re: /https?:\/\/(localhost|127\.0\.0\.1)/, builtOnly: true },
];

/**
 * IS ANYONE ELSE GOING TO READ THIS OUTPUT?
 *
 * The private-term rule matches a real person's name, so quoting the offending
 * line prints the name. In a GitHub Actions log on a public repository that is
 * a leak, and withholding it there is not optional.
 *
 * In Jeremy's own terminal it is the opposite: he already knows the list, and
 * the line is the only thing that tells him WHICH entry fired. Withholding it
 * everywhere -- which is what the first version did -- turned a five-second
 * diagnosis into guesswork. Found the hard way, on a CI failure caused by an
 * ordinary English word being somebody's first name.
 */
const PUBLIC_LOG = Boolean(process.env.GITHUB_ACTIONS || process.env.CI);

/**
 * A FULL NAME IS MATCHED IN ANY CASE. A LONE FIRST NAME MUST MATCH ITS OWN.
 *
 * Everything here used to be case-insensitive, which is right for "Wilhelmina
 * Farnsworth" -- two words in that order are never an accident, in any casing,
 * so a lowercased slug or a mangled fixture is still caught.
 *
 * It is wrong for a single word, because plenty of first names are also
 * ordinary English -- and one of Jeremy's clients has exactly such a name,
 * which is also part of React's internal vocabulary and appears hundreds of
 * times in the bundle we ship. (Not written here: this repo is public and the
 * name is real. The scanner refused an earlier draft of this comment for
 * spelling it out, which is the rule working.) Matched case-insensitively, one
 * client's first name failed every build forever on a dependency's internals,
 * with nothing of ours in the file at all -- and a rule that cannot be
 * satisfied gets deleted, after which it protects nothing.
 *
 * So a one-word term is matched EXACTLY AS WRITTEN. It still catches
 * "Hello <Name>," which is what a real leak looks like here -- our own
 * delivery email greets people by first name -- and not the lowercase noun.
 *
 * THE TRADE-OFF, STATED: a lone first name leaked in lowercase (a URL slug,
 * say) is missed. Anyone worried about that for a particular person should add
 * their full name as well; both entries can sit in the list at once, and the
 * two-word one is caught in any casing. That is written in the header of
 * tools/private-terms.local.txt so it is a choice rather than a surprise.
 */
const TERMS = privateTerms();
const MULTI_WORD = TERMS.filter((t) => /\s/.test(t));
const ONE_WORD = TERMS.filter((t) => !/\s/.test(t));

if (MULTI_WORD.length) {
  RULES.push({
    id: "private-term",
    why: "a name or value from the private terms list",
    re: new RegExp("\\b(" + MULTI_WORD.map(escapeRe).join("|") + ")\\b", "i"),
  });
}
if (ONE_WORD.length) {
  RULES.push({
    id: "private-term",
    why: "a name from the private terms list, spelled as written",
    re: new RegExp("\\b(" + ONE_WORD.map(escapeRe).join("|") + ")\\b"),
  });
}

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

const targets = process.argv.slice(2);
const roots = targets.length ? targets : [".", "dist"];
const findings = [];

for (const root of roots) {
  if (!existsSync(root)) continue;
  const built = root.replace(/^\.\//, "").replace(/[/\\]$/, "") === "dist";
  for (const file of walk(root)) {
    const rel = relative(ROOT, file);
    const posix = rel.split(sep).join("/");
    if (SKIP_FILES.has(rel) || SKIP_LOCAL.test(rel)) continue;
    if (rel.split(sep).some((p) => SKIP_DIRS.has(p))) continue;
    const ext = extname(file).toLowerCase();
    const base = rel.split(sep).pop();

    for (const rule of RULES) {
      if (rule.builtOnly && !built) continue;
      if (rule.exceptIn && rule.exceptIn.some((p) => posix.endsWith(p))) continue;
      if (rule.onlyIn && !rule.onlyIn.some((p) => posix.startsWith(p))) continue;
      if (rule.ext && rule.ext.includes(ext)) {
        findings.push({ rel, rule, line: 0, text: "(" + ext + " file)" });
        continue;
      }
      if (rule.name && rule.name.test(base)) {
        findings.push({ rel, rule, line: 0, text: "(by filename)" });
        continue;
      }
      if (!rule.re || !TEXTY.has(ext)) continue;
      let content;
      try {
        content = readFileSync(file, "utf8");
      } catch {
        continue;
      }
      const lines = content.split("\n");
      for (let i = 0; i < lines.length; i++) {
        if (rule.re.test(lines[i])) {
          /**
           * THE OFFENDING LINE IS QUOTED -- EXCEPT WHEN QUOTING IT IS THE LEAK.
           *
           * Every other rule matches something you need to SEE to act on: a
           * key, a price, a stray localhost. The private-terms rule matches a
           * real person's name, and printing the line prints the name.
           *
           * That is fine in Jeremy's own terminal and NOT fine anywhere else.
           * This scan runs in GitHub Actions on a PUBLIC repository, where the
           * log is world-readable -- so the guard against publishing a client's
           * name would have published it, in the very act of catching it. The
           * same shape of mistake as the version that hardcoded four names.
           *
           * The location is enough to act on. Whoever gets this message knows
           * the list; they do not need to be told which entry matched.
           */
          const text =
            rule.id === "private-term" && PUBLIC_LOG
              ? "(line withheld: this log is public. Run the scan locally to see it)"
              : lines[i].trim().slice(0, 90);
          findings.push({ rel, rule, line: i + 1, text });
          break; // one report per rule per file is enough to block
        }
      }
    }
  }
}

const termNote = TERMS.length
  ? TERMS.length + " private term(s) loaded"
  : "NO private terms loaded - names are NOT being checked (see tools/private-terms.local.txt)";

if (findings.length === 0) {
  console.log("leak-scan: clean across " + roots.filter(existsSync).join(", ") + " - " + termNote);
  process.exit(0);
}

console.error("\nBLOCKED: " + findings.length + " thing(s) that should not be published here.\n");
for (const f of findings) {
  console.error("  " + f.rel + (f.line ? ":" + f.line : ""));
  console.error("    " + f.rule.why + "  [" + f.rule.id + "]");
  console.error("    " + f.text + "\n");
}
console.error("This repo is public and git history does not forget. Remove it before committing,");
console.error("and if a value was ever real, treat it as published and rotate it.\n");
process.exit(1);
