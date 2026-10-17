import { test } from "node:test";
import assert from "node:assert/strict";
import { emailFooter, FOOTER_OPTIONS, HD_NAME, BUSINESS_NAME } from "../netlify/lib/emailFooter.mjs";
import { deliveryEmail, SIGN_OFF } from "../netlify/lib/deliveryEmail.mjs";
import { SITE } from "../netlify/lib/siteLinks.mjs";
import { SHOP } from "../shared/libraryLinks.mjs";

/**
 * The email footer as a theme (Jeremy 10/16, mock stage). Every option must
 * keep the house rules the delivery email already lives by: "by" lowercase,
 * the policy link present, every HTML link also in the plain text.
 */

const hrefs = (html) => [...html.matchAll(/href="([^"]+)"/g)].map((m) => m[1].replace(/&amp;/g, "&"));

test("every option ends with the HD sign-off and the policy line", () => {
  for (const o of FOOTER_OPTIONS) {
    const { html, text } = emailFooter(o, SITE);
    assert.equal(text[0], SIGN_OFF, `${o} lost the sign-off`);
    assert.equal(text.at(-1), `What we keep, and for how long: ${SITE.privacy}`, `${o} lost the policy`);
    assert.ok(html.includes(`href="${SITE.privacy}"`), `${o} lost the policy link`);
    assert.ok(html.includes(`>${HD_NAME}</a>`), `${o} lost the HD name`);
    assert.doesNotMatch(html + text.join("\n"), /Human Design By /, "'by' is always lowercase");
  }
});

test("every link in the HTML is in the plain text too", () => {
  for (const o of FOOTER_OPTIONS) {
    const { html, text } = emailFooter(o, SITE);
    const body = text.join("\n");
    for (const h of hrefs(html)) assert.ok(body.includes(h), `${o}: ${h} is HTML-only`);
  }
});

test("A is today's footer: the HD name opens the coaching home, no business name", () => {
  const { html, text } = emailFooter("A", SITE);
  assert.deepEqual(hrefs(html), [SITE.home, SITE.privacy]);
  assert.doesNotMatch(html + text.join("\n"), /Coaching and Consulting/);
});

test("from B on, the HD name opens the shop, as it does on the PDF", () => {
  for (const o of FOOTER_OPTIONS.filter((x) => x !== "A")) {
    const { html } = emailFooter(o, SITE);
    assert.match(html, new RegExp(`href="${SHOP}"[^>]*>${HD_NAME}</a>`), `${o}: HD name not to the shop`);
  }
});

test("C and D carry the business name, linked to the coaching home", () => {
  for (const o of ["C1", "C2", "D1", "D2"]) {
    const { html, text } = emailFooter(o, SITE);
    assert.match(html, new RegExp(`href="${SITE.home}"[^>]*>${BUSINESS_NAME}</a>`), `${o}`);
    assert.ok(text.includes(BUSINESS_NAME) && text.includes(SITE.home), `${o} text`);
  }
});

test("the delivery email still sends today's footer unless told otherwise", () => {
  const args = { tier: 1, name: "Claude Test Five", url: "https://example.test/r/x", links: SITE };
  assert.deepEqual(deliveryEmail(args), deliveryEmail({ ...args, footer: "A" }));
  assert.notDeepEqual(deliveryEmail(args).html, deliveryEmail({ ...args, footer: "C1" }).html);
});
