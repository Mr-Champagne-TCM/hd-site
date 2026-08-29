import { test } from "node:test";
import assert from "node:assert/strict";
import { creditFor, sessionParams } from "../netlify/lib/checkout.mjs";
import { TIERS, ladder } from "../shared/pricing.mjs";

/**
 * WHAT COMES OFF THE PRICE.
 *
 * This is the arithmetic that overcharged a real buyer. Credit used to come
 * only from a GRANT held in the tab that paid -- and the path the site tells
 * everybody to use, the link in their email on a later visit, has no such tab.
 * Jeremy upgraded from his emailed link and Stripe asked the full price while
 * the PDF in his hand promised the credit.
 *
 * "No confusion allowed involving money."
 */

test("THE EMAILED LINK EARNS THE CREDIT, which is the whole fix", () => {
  // No grant at all -- a different device, a week later. This returned zero.
  assert.equal(creditFor({ grantTier: -1, linkTier: 0, level: 1 }), TIERS[0].cents);
  assert.equal(creditFor({ grantTier: -1, linkTier: 1, level: 2 }), TIERS[1].cents);
  assert.equal(creditFor({ grantTier: -1, linkTier: 0, level: 2 }), TIERS[0].cents);
});

test("the tab still earns it, for somebody who never closed it", () => {
  assert.equal(creditFor({ grantTier: 0, linkTier: -1, level: 1 }), TIERS[0].cents);
});

test("the BETTER of the two wins", () => {
  // A chart link and a stale summary grant: they own the chart.
  assert.equal(creditFor({ grantTier: 0, linkTier: 1, level: 2 }), TIERS[1].cents);
  assert.equal(creditFor({ grantTier: 1, linkTier: 0, level: 2 }), TIERS[1].cents);
});

test("NOTHING PROVEN IS NOTHING CREDITED", () => {
  // A signature that does not verify is worth exactly as much as no signature.
  // The caller passes -1 for both, and full price is the honest answer.
  assert.equal(creditFor({ grantTier: -1, linkTier: -1, level: 2 }), 0);
  assert.equal(creditFor({ level: 1 }), 0);
  assert.equal(creditFor({ grantTier: null, linkTier: "1", level: 2 }), 0);
});

test("buying something you already own, or cheaper, earns nothing back", () => {
  // Not an upgrade. The alternative is a negative line item, or a free tier.
  assert.equal(creditFor({ linkTier: 2, level: 2 }), 0);
  assert.equal(creditFor({ linkTier: 2, level: 0 }), 0);
  assert.equal(creditFor({ linkTier: 1, level: 1 }), 0);
});

test("EVERY ROUTE TO THE TOP COSTS THE SAME (D-6)", () => {
  // The promise the whole ladder rests on, checked through the credit function
  // rather than through the table that describes it.
  const top = TIERS[TIERS.length - 1].cents;

  // Straight there.
  assert.equal(top - creditFor({ level: TIERS.length - 1 }), top);

  // One step at a time, paying each due amount in turn.
  let paidSoFar = 0;
  let owned = -1;
  for (let level = 0; level < TIERS.length; level += 1) {
    const due = TIERS[level].cents - creditFor({ linkTier: owned, level });
    paidSoFar += due;
    owned = level;
  }
  assert.equal(paidSoFar, top, "the ladder does not total the top price");

  // And the jump from the bottom.
  const jump = TIERS[0].cents + (top - creditFor({ linkTier: 0, level: TIERS.length - 1 }));
  assert.equal(jump, top, "summary then reading does not total the top price");
});

test("the credit reaches Stripe as a smaller amount, not as a note", () => {
  const full = sessionParams({ level: 2, alreadyPaidCents: 0, origin: "https://x" });
  const credited = sessionParams({
    level: 2,
    alreadyPaidCents: creditFor({ linkTier: 1, level: 2 }),
    origin: "https://x",
  });
  const amount = (p) => p.line_items[0].price_data.unit_amount;
  assert.equal(amount(full), TIERS[2].cents);
  assert.equal(amount(credited), TIERS[2].cents - TIERS[1].cents);
  assert.ok(amount(credited) > 0, "a credited price must still be a payment");
});

test("the ladder table and the credit function agree", () => {
  // Two descriptions of one promise. They must not drift.
  ladder().forEach((row, level) => {
    assert.equal(
      row.tier.cents - creditFor({ linkTier: level - 1, level }),
      row.due,
      `tier ${level} disagrees with the ladder`,
    );
  });
});
