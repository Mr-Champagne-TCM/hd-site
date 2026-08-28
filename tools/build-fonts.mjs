/**
 * Regenerate netlify/lib/fonts/outfit.mjs from the TTF files beside it.
 *
 * The fonts are compiled into source rather than read from disk, because a
 * path that is right in the repo can be wrong in the bundle -- see the comment
 * in outfit.mjs. This script is how that file gets made, so it is never edited
 * by hand.
 *
 *   node tools/build-fonts.mjs
 */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const dir = fileURLToPath(new URL("../netlify/lib/fonts/", import.meta.url));
const b64 = (f) => readFileSync(dir + f).toString("base64");
const existing = readFileSync(dir + "outfit.mjs", "utf8");

const next = existing
  .replace(/(OUTFIT_400 = Buffer\.from\(\n  ")[^"]*/, `$1${b64("Outfit-400.ttf")}`)
  .replace(/(OUTFIT_600 = Buffer\.from\(\n  ")[^"]*/, `$1${b64("Outfit-600.ttf")}`);

writeFileSync(dir + "outfit.mjs", next);
console.log("outfit.mjs regenerated from the TTFs");
