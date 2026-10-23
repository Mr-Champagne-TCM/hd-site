/**
 * ONE QUOTE STYLE IN WHAT A BUYER READS (Jeremy's GO PDF, 10/23: "sure, don't
 * mix curly/straight apostrophes"): curly, as the titles already are -- ’ for
 * an apostrophe or a closing single quote, ‘ for an opening one, “ ” for
 * double quotes.
 *
 * The shop's own words are written curly in the source. This is for the few
 * words it prints from elsewhere: the library's one-liners (generated into
 * shared/libraryGlance.mjs) and the reading's section headings, which are
 * fixed in the checker's file (netlify/lib/interpretation.mjs, where the
 * straight form is also what the model is asked to write and what the
 * checker reads, so it stays straight there and is curled only for display).
 *
 * Display only: never run it on a key, a regex, an attribute or a URL.
 */
export function curly(s) {
  return String(s ?? "")
    .replace(/(\p{L}|\p{N})'(?=\p{L})/gu, "$1’") // don't, chart's, 1990's
    .replace(/(^|[\s([{“—–-])'(?=\S)/gu, "$1‘") // an opening single quote
    .replace(/'/g, "’") // what is left closes: others', 'it'
    .replace(/(^|[\s([{‘—–-])"(?=\S)/gu, "$1“")
    .replace(/"/g, "”");
}
