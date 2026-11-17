import { test } from "node:test";
import assert from "node:assert/strict";
import { loadComponents, text } from "./support/render.mjs";
import { deliveryEmail } from "../netlify/lib/deliveryEmail.mjs";
import { sessionParams } from "../netlify/lib/checkout.mjs";
import { SITE } from "../netlify/lib/siteLinks.mjs";
import { CHART, READING, SESSION, checkoutNextStepKept, money } from "../shared/pricing.mjs";

/**
 * THE ONE-TO-ONE'S THREE SMALL WORDINGS (Jeremy 11/16, "6 yes"). The local run of a reading's owner
 * taking the one-on-one found three places that still spoke as if a reading were about to be written
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

test("THE RECEIPT'S SUBJECT names the one-on-one", () => {
  const mail = (more) => deliveryEmail({ tier: 2, name: "Alex Rivera", url: "https://x.test/r/a.b", links: SITE, pending: true, ...more });
  const due = SESSION.cents - READING.cents;
  assert.equal(mail({ session: true, amountCents: due }).subject, `Receipt: Alex’s Human Design one-on-one, ${money(due)}`);
  assert.equal(mail({ session: true, amountCents: SESSION.cents }).subject, `Receipt: Alex’s Human Design one-on-one, ${money(SESSION.cents)}`);
  assert.equal(mail({ amountCents: READING.cents }).subject, `Receipt: Alex’s Human Design reading, ${money(READING.cents)}`);
});

const returning = await loadComponents("src", "Returning.tsx");

test("THE CONFIRM STEP: a reading's owner is not asked to 'make my reading'", () => {
  const kept = { birthLine: "June 18, 1972 · 2:30 PM · Duluth, Minnesota" };
  const page = (props) => text(returning.render("ConfirmKept", { tier: 2, token: "t", kept, whose: "Avery", ...props }));

  const fromReading = page({ session: true, fromTier: 2 });
  assert.match(fromReading, /Avery’s one-on-one, with the reading you already have/);
  assert.match(fromReading, /These are right — on to picking a time/);
  assert.doesNotMatch(fromReading, /make my reading|reading, from the reading/);

  // A chart's owner taking the one-on-one does have a reading written.
  const fromChart = page({ session: true, fromTier: 1 });
  assert.match(fromChart, /Avery’s reading and one-on-one, from the chart you already have/);
  assert.match(fromChart, /These are right — make my reading/);

  // And the plain reading upgrade is as it was.
  const plain = page({ fromTier: 1 });
  assert.match(plain, /Avery’s reading, from the chart you already have/);
  assert.match(plain, /These are right — make my reading/);
});

test("A READING'S OWNER WHO TAKES THE ONE-TO-ONE gets a subject about the time to pick, not a second 'reading is ready'", () => {
  const ready = (more) => deliveryEmail({ tier: 2, name: "Rowan Testwell", chartName: "Rowan", url: "https://x.test/r/a.b", links: SITE, ...more });
  assert.equal(ready({ session: true, bookOnly: true }).subject, "Rowan’s One-on-one: Pick a time");
  assert.equal(deliveryEmail({ tier: 2, name: null, url: "https://x.test/r/a.b", links: SITE, session: true, bookOnly: true }).subject, "Your One-on-one: Pick a time");
  // A one-on-one whose reading is NEW still says the reading is ready, and a plain reading is untouched.
  assert.equal(ready({ session: true }).subject, "Rowan’s Human Design reading is ready");
  assert.equal(ready({ bookOnly: true }).subject, "Rowan’s Human Design reading is ready");
  // The body still carries the booking line.
  assert.match(ready({ session: true, bookOnly: true }).text, /THIRTY MINUTES WITH JEREMY/i);
});

// ---- A CHART BOUGHT FOR SOMEONE ELSE SAYS "THEIR" IN FOUR MORE PLACES (Jeremy 11/16, after the live round) ----

test("THEIR CHART ON STRIPE: its own product with 'Their chart…', and the line under Pay says 'their'", async () => {
  const { tierProduct, checkoutProduct } = await import("../netlify/lib/checkout.mjs");
  assert.deepEqual(tierProduct(1), { id: "hd_chart", name: "Human Design chart", description: CHART.checkoutDescription });
  const theirs = tierProduct(1, { theirs: true });
  assert.equal(theirs.id, "hd_chart_their");
  assert.equal(theirs.name, "Human Design chart");
  assert.match(theirs.description, /^Their chart drawn as a picture/);
  assert.match(tierProduct(2, { theirs: true }).description, /^Their chart drawn, about/);
  assert.match(tierProduct(3, { theirs: true }).description, /their chart on screen, and the written reading\.$/);
  // The checkout asks Stripe for that product.
  const asked = [];
  const id = await checkoutProduct({ level: 1, mode: "test", theirs: true, ensure: async (p) => asked.push(p.id), ready: new Set() });
  assert.equal(id, "hd_chart_their");
  assert.deepEqual(asked, ["hd_chart_their"]);

  assert.equal(checkoutNextStepKept(2, 1, true), "Next: one look at their kept birth details, then their reading is written.");
  assert.equal(checkoutNextStepKept(1, 0, true), "Next: one look at their kept birth details, then their chart is drawn.");
  assert.match(checkoutNextStepKept(3, 2, true), /their kept birth details, then you pick a time for your thirty minutes/);
  const line = sessionParams({ level: 2, alreadyPaidCents: CHART.cents, origin: "https://x.test", upgrades: "r1", kept: true, theirs: true }).custom_text.submit.message;
  assert.match(line, /their kept birth details, then their reading is written/);
  // With no shared product to hand, the inline one says "Their" too.
  const inline = sessionParams({ level: 1, origin: "https://x.test", fresh: true }).line_items[0].price_data.product_data;
  assert.match(inline.description, /^Their chart drawn as a picture/);
});

test("THEIR CHART'S UPGRADE: the credit says whose chart it is, and the receipt says 'their birth details'", async () => {
  const { checkoutCredit } = await import("../netlify/lib/checkout.mjs");
  const credit = (fresh) =>
    checkoutCredit({
      body: { upgrade: true, reading: "tok" },
      secret: "s",
      level: 2,
      readLink: () => ({ ok: true, id: "r1" }),
      head: async () => ({ id: "r1", tier: 1, fresh, birth: { date: "1975-09-02" } }),
    });
  assert.equal((await credit(true)).theirs, true);
  assert.equal((await credit(false)).theirs, false);

  const receipt = (more) => deliveryEmail({ tier: 2, name: "Alex Rivera", chartName: "Quinn", url: "https://x.test/r/a.b", links: SITE, pending: true, kept: true, ...more });
  assert.match(receipt({ keptTheirs: true }).text, /Their birth details are already kept/);
  assert.match(receipt({ keptTheirs: true }).text, /Confirm their birth details/);
  assert.match(receipt({}).text, /Your birth details are already kept/);
  assert.match(receipt({}).text, /Confirm your birth details/);
});

const entry = await loadComponents("src/entry", "EntryForm.tsx");

test("THE FIX-A-DETAIL FORM on someone else's chart says 'their'", () => {
  const initial = { date: "1975-09-02", time: "21:05", timeKnown: true, place: "Portland, Maine", zone: "America/New_York", name: "Quinn" };
  const form = (theirs) => text(entry.render("default", { readingToken: "t", tier: 1, name: "Alex Rivera", chartName: "Quinn", mode: "correct", initial, theirs }));
  const t = form(true);
  assert.match(t, /Their details as they are kept now/);
  assert.match(t, /their chart is then cast from the corrected details/);
  assert.match(t, /Their earlier details stay on file/);
  assert.match(t, /I don’t know their birth time/);
  assert.doesNotMatch(t, /Your details as they are kept now|I don’t know my birth time/);
  const mine = form(false);
  assert.match(mine, /Your details as they are kept now/);
  assert.match(mine, /I don’t know my birth time/);
});
