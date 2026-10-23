import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PRIVACY_LABEL } from "../shared/footerTheme.mjs";
import { MESSAGES } from "../shared/customerMessages.mjs";
import { NOTES } from "../netlify/lib/alertNotes.mjs";
import { emailFooter } from "../netlify/lib/emailFooter.mjs";
import { SITE } from "../netlify/lib/siteLinks.mjs";

/**
 * DECISION 26 (GO v3, my pick, pending Jeremy; 10/23 read F2): customer copy
 * speaks as Jeremy, "I/my", not "we/our": the footer's privacy line on every
 * page and email, "How I check", and "on my side" in the error lines and in
 * the notes Jeremy sends after an alert.
 */
const WE = /\b(we|We|our|Our|ours|Ours|us|Us)\b/;
const src = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
const texts = (v) => (typeof v === "string" ? [v] : v && typeof v === "object" ? Object.values(v).flatMap(texts) : []);

test("decision 26: the privacy line under every footer says 'What I keep'", () => {
  assert.equal(PRIVACY_LABEL, "What I keep, and for how long");
  const { text, html } = emailFooter("A", SITE);
  assert.ok(String(text).includes(`What I keep, and for how long: ${SITE.privacy}`));
  assert.ok(String(html).includes(">What I keep, and for how long</a>"));
  assert.ok(src("public/404.html").includes(">What I keep, and for how long</a>"));
  assert.ok(src("public/404.html").includes('aria-label="What I keep, and for how long (Opens the privacy page)"'));
});

test("decision 26: the offer page's accuracy section is 'How I check'", () => {
  assert.ok(src("src/App.tsx").includes("How I check: the four numbers"));
  assert.ok(!src("src/App.tsx").includes("How we check"));
});

test("decision 26: no we/our/us in any customer message or alert note", () => {
  for (const [k, m] of Object.entries(MESSAGES)) for (const t of texts(m)) assert.doesNotMatch(t, WE, k);
  for (const [k, n] of Object.entries(NOTES)) for (const t of texts(n)) assert.doesNotMatch(t, WE, k);
  assert.match(MESSAGES["chart-slow-paid"].text, /^Something on my side is slow right now\./);
  assert.ok(texts(NOTES).some((t) => t.includes("It couldn’t be confirmed right away on my side, so your link is on its way to you by email.")));
});
