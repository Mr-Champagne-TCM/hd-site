#!/usr/bin/env node
/**
 * The voice rule, enforced rather than remembered.
 *
 * Jeremy's copy never commands the reader. It invites. "If you'd like to see
 * yours" rather than "Get yours now". This greps the copy for the sentence
 * shapes that give a command, plus the scarcity and urgency vocabulary that has
 * no place on this site at all.
 *
 * It reads src/copy.ts, which is where every word on the page lives.
 *
 *   node tools/voice-check.mjs
 *
 * A hit is not automatically wrong -- "Wait to respond" is a Human Design
 * Strategy, quoted, not an instruction from us. So this REPORTS and asks, and
 * only hard-fails on the vocabulary that is banned outright.
 */
import { readFileSync } from "node:fs";

const text = readFileSync("src/copy.ts", "utf8");

/** Never, under any circumstances. W-2 and W-3. */
const BANNED = [
  [/\bonly \d+ (left|remaining|spots?|places?)/i, "scarcity claim"],
  [/\b(hurry|act now|don'?t miss|last chance|limited time|ends (soon|today|tonight))\b/i, "urgency"],
  [/\b(intro(ductory)? price|launch price|was \$|normally \$|save \d+%)/i, "intro or slashed pricing"],
  [/\bcountdown\b/i, "countdown"],
  [/\bunlock your (true|real|best)\b/i, "brochure voice"],
  [/\b(you should|you need to|you must|you have to) \b/i, "telling the reader what they should be"],
];

/** Imperative openings, reported for a human to judge. */
const IMPERATIVE = new RegExp(
  "(^|[.!?\"'\u201c]\s+)(" +
    ["get", "buy", "start", "click", "enter", "sign", "join", "discover", "unlock",
     "learn", "find out", "take", "grab", "claim", "book", "order", "try",
     "download", "subscribe", "register", "choose", "pick", "select", "tell us",
     "let us", "see", "read", "check"].join("|") +
    ")\b",
  "gi",
);

// Both quote styles: copy.ts uses double quotes for prose and single quotes for
// short labels. An earlier version only matched double quotes and reported a
// clean pass over half the file.
const strings = [
  ...text.matchAll(/"([^"\n]{4,})"/g),
  ...text.matchAll(/'([^'\n]{4,})'/g),
].map((m) => m[1]);

let failed = 0;
const flagged = [];

for (const s of strings) {
  if (s.length < 12) continue;
  for (const [re, why] of BANNED) {
    if (re.test(s)) {
      console.error(`BANNED (${why}): ${s.slice(0, 80)}`);
      failed++;
    }
  }
  const m = s.match(IMPERATIVE);
  if (m) flagged.push([m[0].trim(), s.slice(0, 80)]);
}

if (flagged.length) {
  console.log(`\n${flagged.length} phrase(s) opening in the imperative — read each and decide:\n`);
  for (const [word, s] of flagged) console.log(`  "${word}" → ${s}`);
  console.log("\nA quoted Human Design Strategy is fine. Us telling the reader what to do is not.\n");
}

if (failed) {
  console.error(`\n${failed} banned phrase(s). These do not ship.`);
  process.exit(1);
}
console.log(`voice-check: ${strings.length} strings, no banned phrasing.`);
