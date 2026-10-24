/**
 * ONE QUOTE STYLE IN WHAT A BUYER READS (Jeremy's GO PDF, 10/23: "sure, don't
 * mix curly/straight apostrophes"): curly, as the titles already are -- ’ for
 * an apostrophe or a closing single quote, ‘ for an opening one, “ ” for
 * double quotes.
 *
 * The shop's own words are written curly in the source. This is for the words
 * it prints from elsewhere: the library's one-liners (generated into
 * shared/libraryGlance.mjs), the reading's section headings, which are fixed
 * in the checker's file (netlify/lib/interpretation.mjs, where the straight
 * form is also what the model is asked to write and what the checker reads,
 * so it stays straight there and is curled only for display), and -- since
 * decision 4 of the GO page v3 (10/23) -- the model's own sentences, curled
 * where the page, the PDF and the phone show them (readingView.mjs
 * forDisplay). The stored reading and every check still hold the model's text
 * exactly as it was written: nothing here rewrites what is stored.
 *
 * Display only: never run it on a key, a regex, an attribute, a URL, or on
 * text a check reads.
 *
 * THE PHONE HAS THE SAME FUNCTION, rule for rule (hd-reading-app Curly.kt);
 * its CurlyParityTest holds it to this one's output on every case of
 * curly_parity.json (written from this file by the phone's
 * tools/curly-parity-fixtures.mjs). Change one, change both.
 *
 * Each straight quote is decided from what is already written before it (so a
 * quote after a curled one, or after another straight one, reads the curled
 * form) and what follows it:
 *
 *   '  between a letter or digit and a letter    ’  don't, chart's, 1990's
 *   '  before a decade                            ’  the '90s
 *   '  before two digits and no closing quote     ’  in '08, back then
 *      later on the line
 *   '  "  at the start, or after a space, an       ‘  “  an opening quote, also
 *         opening bracket, a dash or an opening          inside another one:
 *         quote, and not before a space                  "'word'" -> “‘word’”
 *   '  "  anywhere else                            ’  ”  closing: others', "it"'s
 */

/** Whitespace, spelled out so the phone's regex reads the same set as this one (JS \s). */
const WS = "\\t\\n\\u000B\\f\\r \\u00A0\\u1680\\u2000-\\u200A\\u2028\\u2029\\u202F\\u205F\\u3000\\uFEFF";
const SPACE = new RegExp(`[${WS}]`);
/** A quote right after one of these opens. */
const OPENS_AFTER = new RegExp(`[${WS}(\\[{“‘—–-]`);
const WORD = /[\p{L}\p{N}]/u;
const LETTER = /\p{L}/u;
/** '90s: always an apostrophe (the decade). */
const DECADE = /^[0-9]{2}s(?![\p{L}\p{N}])/u;
/** '08: an apostrophe, unless a closing quote follows on the same line ('24-hour pause'). */
const YEAR = /^[0-9]{2}(?![\p{L}\p{N}])/u;
/** A closing single quote: after something that is not a space, and not before a letter or digit. */
const CLOSER = new RegExp(`[^${WS}']'(?![\\p{L}\\p{N}])`, "u");

export function curly(s) {
  const t = String(s ?? "");
  if (!t.includes("'") && !t.includes('"')) return t;
  let out = "";
  for (let i = 0; i < t.length; i++) {
    const ch = t[i];
    if (ch !== "'" && ch !== '"') {
      out += ch;
      continue;
    }
    const prev = out.length ? out[out.length - 1] : "";
    const next = i + 1 < t.length ? t[i + 1] : "";
    const opens = (prev === "" || OPENS_AFTER.test(prev)) && next !== "" && !SPACE.test(next);
    if (ch === '"') {
      out += opens ? "“" : "”";
      continue;
    }
    if (prev !== "" && WORD.test(prev) && next !== "" && LETTER.test(next)) {
      out += "’"; // don't, chart's, 1990's
      continue;
    }
    const after = t.slice(i + 1);
    if (DECADE.test(after)) {
      out += "’"; // the '90s
      continue;
    }
    if (YEAR.test(after)) {
      const lineEnd = t.indexOf("\n", i + 1);
      const rest = t.slice(i + 1, lineEnd < 0 ? t.length : lineEnd);
      if (!CLOSER.test(rest)) {
        out += "’"; // in '08
        continue;
      }
    }
    out += opens ? "‘" : "’";
  }
  return out;
}
