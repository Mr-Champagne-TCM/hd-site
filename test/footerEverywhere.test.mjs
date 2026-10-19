import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  HD_NAME, BUSINESS_NAME, HD_LINE, COACH_LINE, HD_URL, COACH_URL, COACH_COLOR, PRIVACY_LABEL, footerColumns,
} from "../shared/footerTheme.mjs";
import { emailFooter } from "../netlify/lib/emailFooter.mjs";
import { messagePage } from "../netlify/lib/messagePage.mjs";
import { notFoundPage } from "../netlify/lib/notFoundPage.mjs";
import { SITE } from "../netlify/lib/siteLinks.mjs";

/**
 * THE FOOTER THEME EVERYWHERE (Jeremy 10/17): the email's ending on the shop's
 * own pages too. One set of words (shared/footerTheme.mjs) for all of them.
 */
const root = new URL("../", import.meta.url);
const read = (p) => readFileSync(new URL(p, root), "utf8").replace(/\r\n/g, "\n");

test("the words are the accepted ones, 'by' lowercase, each name to its own home", () => {
  assert.equal(HD_NAME, "Human Design by The Champagne Method");
  assert.equal(BUSINESS_NAME, "The Champagne Method Coaching and Consulting");
  assert.equal(HD_LINE, "Charts and readings, for you or someone close to you.");
  assert.equal(COACH_LINE, "Coaching, if you’d like to go further.");
  assert.equal(HD_URL, "https://humandesign.thechampagnemethod.co/");
  assert.equal(COACH_URL, SITE.home);
  assert.equal(COACH_COLOR, "#a78bfa");
  assert.equal(PRIVACY_LABEL, "What we keep, and for how long");
  const [hd, coach] = footerColumns("#E8CBA0");
  assert.deepEqual([hd.color, coach.color], ["#E8CBA0", COACH_COLOR]);
});

test("the email's footer E says exactly the shared words", () => {
  const { html, text } = emailFooter("E", SITE);
  for (const w of [HD_NAME, BUSINESS_NAME, HD_LINE, COACH_LINE]) {
    assert.ok(html.includes(w.replace(/&/g, "&amp;")), `html lost: ${w}`);
    assert.ok(text.includes(w) || text.includes(`— ${w}`), `text lost: ${w}`);
  }
});

test("the offer page footer carries the theme, and the business name is not said twice", () => {
  const app = read("src/App.tsx");
  assert.match(app, /import FooterTheme from "\.\/FooterTheme"/);
  assert.match(app, /<FooterTheme \/>/);
  assert.doesNotMatch(app, /\[SITE\.home, "The Champagne Method Coaching and Consulting"\]/);
  // The rest of the link row stays, Privacy last. "The Library" (the coaching
  // library) left the row with fix 13A (10/19): the header names the HD library.
  assert.match(app, /\[SITE\.hd101, "The Human Design library"\][\s\S]*\[SITE\.privacy, "Privacy"\]/);
  assert.doesNotMatch(app, /\[SITE\.library, "The Library"\]/);
});

test("the reading page ends with the theme and the privacy line, in every state", () => {
  const actions = read("src/ReadingActions.tsx");
  assert.match(actions, /<PageEnd \/>/);
  assert.doesNotMatch(actions, /The rest of the practice is at/);
  const page = read("src/ReadingPage.tsx");
  assert.match(page, /import \{ PageEnd \} from "\.\/FooterTheme"/);
  assert.match(page, /<PageEnd \/>\s*<\/div>\s*\);\s*\}\s*\n\s*const \{ reading \} = state;/, "the failed states end with it");
  const theme = read("src/FooterTheme.tsx");
  assert.match(theme, /from "\.\.\/shared\/footerTheme\.mjs"/);
  assert.doesNotMatch(theme, /Coaching, if you/, "words are read from the shared file, not typed again");
});

test("the plain message page (e.g. a PDF that could not be made) ends with the theme", () => {
  const html = messagePage({ heading: "x", message: "y", back: "/r/abc" });
  assert.ok(html.includes(`<a href="${HD_URL}" style="color:#E8CBA0">${HD_NAME}</a>`));
  assert.ok(html.includes(`<a href="${COACH_URL}" style="color:${COACH_COLOR}">${BUSINESS_NAME}</a>`));
  assert.ok(html.includes(`<a href="${SITE.privacy}">${PRIVACY_LABEL}</a>`));
  assert.ok(html.indexOf("<footer") > html.indexOf('class="back"'), "the footer comes after the way back");
});

test("the shop's 404 is the shop's own page, with the theme (was Netlify's)", () => {
  assert.equal(read("public/404.html"), notFoundPage() + "\n", "stale: run node tools/write-404.mjs");
  const html = notFoundPage();
  assert.match(html, /<h1>This page isn't here<\/h1>/);
  assert.match(html, /<a class="back" href="\/">The readings<\/a>/);
  assert.match(html, /<footer class="tf">/);
  assert.doesNotMatch(html, /netlify/i);
});
