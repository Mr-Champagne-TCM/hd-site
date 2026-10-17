// Writes public/404.html from netlify/lib/notFoundPage.mjs. Run from the repo root:
//   node tools/write-404.mjs
// test/footerEverywhere.test.mjs fails if the file differs from what this writes.
import { writeFileSync } from "node:fs";
import { notFoundPage } from "../netlify/lib/notFoundPage.mjs";

writeFileSync(new URL("../public/404.html", import.meta.url), notFoundPage() + "\n");
console.log("wrote public/404.html");
