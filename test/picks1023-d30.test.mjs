import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { readingPdf } from "../netlify/lib/readingPdf.mjs";
import { GIFT_CREDIT_KEEPS, GIFT_PROOF, giftCredit } from "../shared/giftCopy.mjs";

/**
 * DECISION 30 (GO v3, my pick, pending Jeremy; 10/23 read F6): a chart bought
 * for someone else is read by the person it is for, who paid nothing and was
 * sent no email. Its page and its PDF's page 3 say the credit in words true
 * for either reader; the buyer's own charts are as they were.
 */
const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
const OUTPUT = JSON.parse(read("test/fixtures/phone-parity/claude-test-four.output.json"));
const BIRTH = { date: "1976-12-14", time: "18:18", timeKnown: true, place: "Chicago, Illinois", zone: "America/Chicago" };
/** Page 3's words, one string. */
const page3 = async (gift) => {
  const r = await readingPdf({ tier: 1, name: "Quinn", output: OUTPUT, birth: BIRTH, inspect: true, ...(gift ? { gift: true } : {}) });
  return r.runs.filter((x) => x.page === 3).map((x) => x.text).join(" ").replace(/\s+/g, " ");
};

test("decision 30: the gift words", () => {
  assert.equal(giftCredit("chart"), "This chart was a gift. What was paid for it comes off what is paid next — nobody pays twice for the same thing.");
  assert.equal(giftCredit("summary"), "This summary was a gift. What was paid for it comes off what is paid next — nobody pays twice for the same thing.");
  assert.equal(GIFT_PROOF, "The link in the email that came with the purchase is what proves it, so going further from there means the credit is already applied.");
  assert.equal(GIFT_CREDIT_KEEPS, "The credit keeps, and this link is how you come back to it.");
  for (const s of [giftCredit("chart"), GIFT_PROOF, GIFT_CREDIT_KEEPS]) assert.doesNotMatch(s, /\byou paid\b|\byour email\b|\bwhat you\b/i);
});

test("decision 30: a gift's PDF page 3 says the gift words; the buyer's own says what it said", async () => {
  const gift = await page3(true);
  assert.ok(gift.includes("This chart was a gift. What was paid for it comes off what is paid next"), gift);
  assert.ok(gift.includes("The link in the email that came with the purchase is what proves it"), gift);
  assert.ok(!/What you have already paid|link in your email/.test(gift), "no buyer-only words on a gift");
  const own = await page3(false);
  assert.ok(own.includes("What you have already paid comes off what you pay next"));
  assert.ok(own.includes("The link in your email is what"));
});

test("decision 30: the page and the PDF are told it is a gift", () => {
  assert.match(read("src/ReadingPage.tsx"), /gift=\{reading\.fresh === true\}/);
  assert.match(read("netlify/lib/pdfHandler.mjs"), /gift: reading\.fresh === true,/);
  const actions = read("src/ReadingActions.tsx");
  assert.match(actions, /giftCredit\(tier >= 1 \? "chart" : "summary"\)/);
  assert.match(actions, /gift \? GIFT_CREDIT_KEEPS : "Your credit keeps, and this link is how you come back to it\."/);
});
