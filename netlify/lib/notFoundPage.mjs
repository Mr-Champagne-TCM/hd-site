import { messagePage } from "./messagePage.mjs";

/**
 * THE SHOP'S 404 (10/17, footer-everywhere mock). Netlify answered any address
 * that is not a page with its own "Page not found" and a link to Netlify's
 * support forum. Now it is the shop's calm page -- brand line, one sentence, a
 * way to the readings -- ending with the footer theme like every other page.
 *
 * Written to public/404.html by tools/write-404.mjs (Netlify serves that file
 * for every missing address); test/footerEverywhere.test.mjs keeps the file
 * equal to this.
 */
export function notFoundPage() {
  return messagePage({
    heading: "This page isn't here",
    message:
      "The address may have been cut short or typed with a small slip. The readings, and what each " +
      "one includes, are on the front page. If this came with a purchase, hd-readings@thechampagnemethod.co reaches Jeremy.",
    back: "/",
    backLabel: "The readings",
  });
}
