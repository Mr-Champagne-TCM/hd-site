import { test } from "node:test";
import assert from "node:assert/strict";
import { deliveryEmail } from "../netlify/lib/deliveryEmail.mjs";
import { SITE } from "../netlify/lib/siteLinks.mjs";
import * as PRICING from "../shared/pricing.mjs";

/**
 * DECISION 15 (GO v3, my pick, pending Jeremy; 10/23 read F7, B10): a new
 * chart's receipt names the chart the way the chart will be titled -- the
 * first name its form starts with -- as an upgrade's receipt names its
 * chart's title. Not the full name on the payment. (Prices from pricing.mjs only: P-1.)
 */
const receipt = (o) => deliveryEmail({ url: "https://x.test/r/a.b", links: SITE, pending: true, ...o }).subject;
const [s, c, r] = PRICING.TIERS.map((t) => t.cents);
const $ = PRICING.money;

test("decision 15: a new chart's receipt says the chart's name, the first name on the payment", () => {
  assert.equal(receipt({ tier: 1, name: "Robin Testwell", amountCents: c }), `Receipt: Robin’s Human Design chart, ${$(c)}`);
  assert.equal(receipt({ tier: 2, name: "Mary-Jane O'Brien", amountCents: r }), `Receipt: Mary-Jane’s Human Design reading, ${$(r)}`);
  assert.equal(receipt({ tier: 0, name: "James", amountCents: s }), `Receipt: James’s Human Design summary, ${$(s)}`);
  assert.equal(receipt({ tier: 0, name: null, amountCents: s }), `Receipt: Your Human Design summary, ${$(s)}`);
});

test("decision 15: an upgrade, a gift and the ready email are as they were", () => {
  assert.equal(receipt({ tier: 2, name: "Alex Rivera", chartName: "Robin", amountCents: r }), `Receipt: Robin’s Human Design reading, ${$(r)}`);
  assert.equal(receipt({ tier: 1, name: "Emery Testwell", someoneNew: true, amountCents: c }), `Receipt: Emery Testwell, a Human Design chart for someone else, ${$(c)}`);
  assert.equal(deliveryEmail({ tier: 1, name: "Robin Testwell", url: "https://x.test/r/a.b", links: SITE }).subject, "Robin Testwell’s Human Design chart is ready");
});
