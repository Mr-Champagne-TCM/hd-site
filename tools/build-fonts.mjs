/**
 * Regenerate netlify/lib/fonts/outfit.mjs and roboto.mjs from the TTF files
 * beside them.
 *
 * The fonts are compiled into source rather than read from disk, because a
 * path that is right in the repo can be wrong in the bundle -- see the comment
 * in outfit.mjs. This script is how those files get made, so they are never
 * edited by hand.
 *
 *   node tools/build-fonts.mjs
 */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const dir = fileURLToPath(new URL("../netlify/lib/fonts/", import.meta.url));
const b64 = (f) => readFileSync(dir + f).toString("base64");

const outfit = readFileSync(dir + "outfit.mjs", "utf8")
  .replace(/(OUTFIT_400 = Buffer\.from\(\n  ")[^"]*/, `$1${b64("Outfit-400.ttf")}`)
  .replace(/(OUTFIT_600 = Buffer\.from\(\n  ")[^"]*/, `$1${b64("Outfit-600.ttf")}`);
writeFileSync(dir + "outfit.mjs", outfit);

const roboto = readFileSync(dir + "roboto.mjs", "utf8")
  .replace(/(ROBOTO_400 = Buffer\.from\(\n  ")[^"]*/, `$1${b64("Roboto-Regular.ttf")}`)
  .replace(/(ROBOTO_700 = Buffer\.from\(\n  ")[^"]*/, `$1${b64("Roboto-Bold.ttf")}`);
writeFileSync(dir + "roboto.mjs", roboto);

console.log("outfit.mjs and roboto.mjs regenerated from the TTFs");
