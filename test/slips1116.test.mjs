import { test } from "node:test";
import assert from "node:assert/strict";
import { loadComponents, text } from "./support/render.mjs";
import { deliveryEmail } from "../netlify/lib/deliveryEmail.mjs";
import { sessionParams } from "../netlify/lib/checkout.mjs";
import { SITE } from "../netlify/lib/siteLinks.mjs";
import { CHART, READING, SESSION, checkoutNextStepKept, money } from "../shared/pricing.mjs";

/**
 * THE ONE-TO-ONE'S THREE SMALL WORDINGS (Jeremy 11/16, "6 yes"). The local run of a reading's owner
 * taking the one-to-one found three places that still spoke as if a reading were about to be written
 * or had been bought: the line under Stripe's Pay button, the receipt's subject, and the confirm step.
 * That buyer keeps the reading they have (interpretJob wordsToCarry), and what they bought is the call.
 */

test("UNDER THE PAY BUTTON: a reading's owner is told they pick a time, not that a reading is written", () => {
  assert.equal(checkoutNextStepKept(3, 2), "Next: one look at your kept birth details, then you pick a time for your thirty minutes.");
  assert.match(checkoutNextStepKept(3, 1), /then your reading is written and you pick a time for your thirty minutes\.$/);
  // The reading and the chart say what they always said.
  assert.equal(checkoutNextStepKept(2, 1), "Next: one look at your kept birth details, then your reading is written.");
  assert.equal(checkoutNextStepKept(1, 0), "Next: one look at your kept birth details, then your chart is drawn.");

  const line = (alreadyPaidCents) =>
    sessionParams({ level: 3, alreadyPaidCents, origin: "https://x.test", upgrades: "r1", kept: true }).custom_text.submit.message;
  assert.doesNotMatch(line(READING.cents), /is written/);
  assert.match(line(READING.cents), /pick a time/);
  assert.match(line(CHART.cents), /reading is written and you pick a time/);
});

test("THE RECEIPT'S SUBJECT names the one-to-one", () => {
  const mail = (more) => deliveryEmail({ tier: 2, name: "Alex Rivera", url: "https://x.test/r/a.b", links: SITE, pending: true, ...more });
  const due = SESSION.cents - READING.cents;
  assert.equal(mail({ session: true, amountCents: due }).subject, `Receipt: Alex’s Human Design one-to-one, ${money(due)}`);
  assert.equal(mail({ session: true, amountCents: SESSION.cents }).subject, `Receipt: Alex’s Human Design one-to-one, ${money(SESSION.cents)}`);
  assert.equal(mail({ amountCents: READING.cents }).subject, `Receipt: Alex’s Human Design reading, ${money(READING.cents)}`);
});

const returning = await loadComponents("src", "Returning.tsx");

test("THE CONFIRM STEP: a reading's owner is not asked to 'make my reading'", () => {
  const kept = { birthLine: "June 18, 1972 · 2:30 PM · Duluth, Minnesota" };
  const page = (props) => text(returning.render("ConfirmKept", { tier: 2, token: "t", kept, whose: "Avery", ...props }));

  const fromReading = page({ session: true, fromTier: 2 });
  assert.match(fromReading, /Avery’s one-to-one, with the reading you already have/);
  assert.match(fromReading, /These are right — on to picking a time/);
  assert.doesNotMatch(fromReading, /make my reading|reading, from the reading/);

  // A chart's owner taking the one-to-one does have a reading written.
  const fromChart = page({ session: true, fromTier: 1 });
  assert.match(fromChart, /Avery’s reading and one-to-one, from the chart you already have/);
  assert.match(fromChart, /These are right — make my reading/);

  // And the plain reading upgrade is as it was.
  const plain = page({ fromTier: 1 });
  assert.match(plain, /Avery’s reading, from the chart you already have/);
  assert.match(plain, /These are right — make my reading/);
});
