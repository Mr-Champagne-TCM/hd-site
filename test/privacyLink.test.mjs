import { test } from "node:test";
import assert from "node:assert/strict";
import { deliveryEmail } from "../netlify/lib/deliveryEmail.mjs";
import { SITE } from "../netlify/lib/siteLinks.mjs";
import { TIERS } from "../shared/pricing.mjs";

/**
 * THE RULE: every email a BUYER receives carries a link to the privacy policy,
 * in both bodies.
 *
 * Why a test and not a note in a file somebody has to remember reading. The
 * policy describes what a purchase collects and what becomes of it. It was
 * written, published, and then linked from nowhere at all for a day -- not the
 * shop, not the emails, not the PDF -- because nothing anywhere said it had to
 * be. A convention that lives in one person's memory is the convention that
 * lapses the first time a new email type is added in a hurry.
 *
 * This enumerates the cross product rather than a list of known emails, so a
 * NEW combination is covered the moment the argument exists. If a future email
 * type takes an argument this loop does not know about, add it here -- and the
 * failing test is the reminder to do so.
 *
 * BOTH BODIES, not just the HTML. The plain-text alternative is what text-only
 * clients and screen readers render. It was missing there when this was first
 * written, and the HTML-only check would have passed and called it done.
 */
test("EVERY buyer email links the privacy policy, in html AND text", () => {
  const tiers = TIERS.map((_, i) => i + 1);
  let checked = 0;

  for (const tier of tiers) {
    for (const pending of [false, true]) {
      for (const writing of [false, true]) {
        const { html, text } = deliveryEmail({
          tier,
          pending,
          writing,
          name: "Sample",
          url: "https://humandesign.thechampagnemethod.co/r/token",
          links: SITE,
        });
        const where = `tier=${tier} pending=${pending} writing=${writing}`;
        assert.ok(html.includes(SITE.privacy), `html is missing the privacy link: ${where}`);
        assert.ok(text.includes(SITE.privacy), `text is missing the privacy link: ${where}`);
        checked++;
      }
    }
  }

  // A loop that silently checked nothing would pass. This is the guard on the guard.
  assert.ok(checked >= 12, `expected at least 12 variants, checked ${checked}`);
});

/** The URL itself, so a typo cannot ship quietly. */
test("the privacy link points at the readings policy, not the old root URL", () => {
  assert.equal(SITE.privacy, "https://thechampagnemethod.co/readings/privacy/");
});
