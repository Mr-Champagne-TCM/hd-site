// alertNotes.mjs is imported FIRST, on purpose: it reaches failures.mjs, which
// reaches it again through health.mjs and playbook.mjs. This file proves that
// circle loads from this end too.
import { NOTES, SIGN_OFF, fillNote, moneyInvolved, signOff } from "../netlify/lib/alertNotes.mjs";
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { KINDS } from "../netlify/lib/failures.mjs";
import { PLAYBOOK, optionLines } from "../netlify/lib/playbook.mjs";

/**
 * THE SIGN-OFF (Jeremy 10/16): "Respectfully, Jeremy" -- and "Very
 * Respectfully, Jeremy" whenever money was involved. Never "Warmly".
 */

const MONEY = /Very Respectfully, Jeremy"?$/;
const NO_MONEY = /(^|[^y] )Respectfully, Jeremy"?$/;

/** The kinds where nothing was charged: the checkout never opened. */
const NOTHING_CHARGED = ["checkout-misconfigured", "checkout-crash"];

/** Every note an alert offers, as the alert fills it: [kind, noteKey, words]. */
function offered({ paid = false } = {}) {
  const out = [];
  for (const [kind, play] of Object.entries(PLAYBOOK)) {
    const lines = optionLines({ kind, ...(paid ? { paid: true } : {}) }, { link: "https://shop.example/r/x" });
    play.options.forEach((o, i) => {
      if (o.startsWith("note:")) out.push([kind, o.slice(5), lines[i].split("\n")[1]]);
    });
  }
  return out;
}

test("the sign-off lives in one place: no note carries its own", () => {
  for (const [key, words] of Object.entries(NOTES)) {
    assert.doesNotMatch(words, /Jeremy|Warmly|Respectfully/, `${key} signs itself`);
  }
});

test("NO NOTE SAYS 'Warmly' -- not in the notes, not in anything an alert offers", () => {
  assert.doesNotMatch(readFileSync(new URL("../netlify/lib/alertNotes.mjs", import.meta.url), "utf8"), /Warmly/);
  for (const paid of [false, true]) {
    for (const [kind, , words] of offered({ paid })) assert.doesNotMatch(words, /Warmly/, kind);
  }
});

test("EVERY MONEY KIND ends 'Very Respectfully, Jeremy'", () => {
  const money = Object.keys(PLAYBOOK).filter((k) => !NOTHING_CHARGED.includes(k));
  assert.ok(money.length >= 40, `only ${money.length} money kinds`);
  for (const [kind, key, words] of offered()) {
    if (NOTHING_CHARGED.includes(kind)) continue;
    assert.match(words, MONEY, `${kind} (${key})`);
    assert.equal(signOff(kind), SIGN_OFF.MONEY, kind);
  }
});

test("EVERY NOTHING-CHARGED KIND ends 'Respectfully, Jeremy' (not 'Very')", () => {
  const seen = offered().filter(([kind]) => NOTHING_CHARGED.includes(kind));
  assert.equal(seen.length, NOTHING_CHARGED.length);
  for (const [kind, key, words] of seen) {
    assert.match(words, NO_MONEY, `${kind} (${key})`);
    assert.doesNotMatch(words, /Very Respectfully/, kind);
    assert.match(words, /nothing was charged/i, `${kind}: the note itself says nothing was charged`);
  }
});

test("money is read from the taxonomy: exactly the checkout kinds that say 'Nothing was charged' are no-money", () => {
  const playbookNoMoney = Object.keys(PLAYBOOK).filter((k) => !moneyInvolved(k));
  assert.deepEqual(playbookNoMoney.sort(), [...NOTHING_CHARGED].sort());
  // Across the whole registry, too: only kinds on the way IN, before a purchase.
  for (const kind of Object.keys(KINDS).filter((k) => !moneyInvolved(k))) {
    assert.match(kind, /^(checkout-|claim-not-paid$|chart-bad-request$|chart-payment-required$|places-rate-limited$)/, kind);
  }
});

test("an incident recorded as paid is money, whatever its kind; no kind given is money too", () => {
  assert.equal(signOff("checkout-misconfigured", { paid: true }), SIGN_OFF.MONEY);
  assert.equal(signOff(undefined), SIGN_OFF.MONEY);
  assert.equal(signOff("a-kind-nobody-named"), SIGN_OFF.MONEY);
  assert.match(fillNote("safe-link"), MONEY);
  assert.match(fillNote("checkout-down", { kind: "checkout-crash" }), NO_MONEY);
});

test("a filled note ends on its sign-off, after one space", () => {
  assert.ok(fillNote("link-again", { link: "https://x/r/1", kind: "resend-crash" }).endsWith("whenever you need it. Very Respectfully, Jeremy"));
  assert.ok(fillNote("checkout-down", { shop: "https://x", kind: "checkout-misconfigured" }).endsWith("come back to Human Design readings: https://x Respectfully, Jeremy"));
});
