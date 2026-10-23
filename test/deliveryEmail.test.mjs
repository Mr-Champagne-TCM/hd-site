import { test } from "node:test";
import assert from "node:assert/strict";
import { deliveryEmail, SIGN_OFF } from "../netlify/lib/deliveryEmail.mjs";
import { FROM, REPLY_TO, sendMail } from "../netlify/lib/mail.mjs";
import { randomBytes } from "node:crypto";

/**
 * The delivery email, against D-11 and against the voice rules.
 *
 * The voice assertions are not decoration. Every transactional email ever
 * written is full of imperatives -- "Click here", "View your chart now",
 * "Upgrade today" -- and that is exactly the register this site does not use.
 * It is the easiest place in the whole product to slip, because the slip reads
 * as normal everywhere else.
 */

const LINKS = {
  hd101: "https://thechampagnemethod.co/library/human-design/",
  bodygraph: "https://thechampagnemethod.co/library/bodygraph/",
  home: "https://thechampagnemethod.co",
};
const URL_ = "https://humandesign.thechampagnemethod.co/r/abc.def";

const build = (tier, name, pending = false) =>
  deliveryEmail({ tier, name, url: URL_, links: LINKS, pending });

// --- D-11, point by point --------------------------------------------------

test("the receipt thanks them in TEXT, and the action is a BUTTON (fix 4A)", () => {
  for (const tier of [0, 1, 2]) {
    for (const pending of [true, false]) {
      const { html, text } = build(tier, "Jeremy", pending);
      if (pending) assert.ok(text.includes("Thank you. Your payment went through, and here is your receipt."), `tier ${tier} receipt lost the thank-you`);
      // A table with a background colour is the only thing that renders as a
      // button everywhere; a styled <a> collapses to a text link in Outlook.
      assert.match(html, /<table[^>]*role="presentation"[\s\S]*?bgcolor="#3fe0c5"/);
      assert.match(html, /border-radius:999px/);
    }
  }
});

test("THE RECEIPT'S BUTTON IS JEREMY'S OWN WORDS: 'Enter your birth details'", () => {
  // His markup on the 4A mock, 10/19. The ready email opens what is there.
  for (const [tier, word] of [[0, "summary"], [1, "chart"], [2, "reading"]]) {
    const pendingMail = deliveryEmail({ tier, name: "J", url: URL_, links: LINKS, pending: true });
    const filledMail = deliveryEmail({ tier, name: "J", url: URL_, links: LINKS, pending: false });
    assert.ok(pendingMail.text.includes("Enter your birth details:"), `tier ${tier} receipt button wording is wrong`);
    assert.ok(filledMail.text.includes(`Open your ${word}:`), `tier ${tier} ready wording is wrong`);
    assert.doesNotMatch(pendingMail.text, /Open your/, "a receipt offered to open something not made yet");
    assert.doesNotMatch(filledMail.text, /Enter your birth details/, "a ready email asked for the details again");
  }
});

test("the action is what the button links to, in both emails", () => {
  for (const pending of [true, false]) {
    const { html } = deliveryEmail({ tier: 1, name: "J", url: URL_, links: LINKS, pending });
    const btn = html.match(/<a href="([^"]+)"[^>]*border-radius:999px"( title="[^"]*" aria-label="[^"]*")?>([^<]+)</);
    assert.ok(btn, "no button found");
    assert.equal(btn[1], URL_);
    assert.equal(btn[3], pending ? "Enter your birth details" : "Open your chart");
    // The link label says where it goes (Jeremy's GO PDF, 10/23: "link labels (hover hints?)").
    assert.equal(
      btn[2],
      pending
        ? ' title="Opens the page to enter your birth details" aria-label="Enter your birth details (Opens the page to enter your birth details)"'
        : ' title="Opens your chart" aria-label="Open your chart (Opens your chart)"',
    );
  }
});

test("A REAL RECEIPT: what, the amount, the date, and the next step (fix 4A)", async () => {
  const paidAt = Date.UTC(2026, 9, 17, 22, 0); // 5 PM in Chicago, October 17
  const { READING, money } = await import("../shared/pricing.mjs");
  const r = deliveryEmail({ tier: 2, name: "Alex", url: URL_, links: LINKS, pending: true, amountCents: READING.cents, paidAt });
  assert.equal(r.subject, `Receipt: Alex’s Human Design reading, ${money(READING.cents)}`);
  for (const body of [r.text, r.html]) {
    assert.match(body, /Human Design: the reading/);
    assert.ok(body.includes(money(READING.cents)));
    assert.match(body, /October 17, 2026/);
    assert.match(body, /Paid by card through/);
    assert.match(body, /Next, about 2 minutes|NEXT, ABOUT 2 MINUTES/);
    assert.match(body, /Your birth date, time and place/);
  }
  // A 100%-off code: nothing charged, and no card was used.
  const free = deliveryEmail({ tier: 2, name: "Alex", url: URL_, links: LINKS, pending: true, amountCents: 0, paidAt });
  assert.ok(free.text.includes(`Amount paid: ${money(0)}`));
  assert.match(free.text, /Paid through: Stripe/);
  assert.doesNotMatch(free.text, /by card/);
  // Unknown amount or date (an older purchase re-sent): the row is left out, never guessed.
  const old = deliveryEmail({ tier: 1, name: "Alex", url: URL_, links: LINKS, pending: true });
  assert.doesNotMatch(old.text, /Amount paid|Date:/);
  assert.equal(old.subject, "Receipt: Alex’s Human Design chart");
});

test("ONE READY EMAIL on the reading tier, listing what is on the page", () => {
  const r = deliveryEmail({ tier: 2, name: "Alex", url: URL_, links: LINKS, pending: false });
  assert.match(r.text, /Your chart and your written reading are ready\./);
  for (const t of ["Your bodygraph, drawn", "About 1,200 words written to your chart", "Four small things to try", "A PDF to keep"]) {
    assert.ok(r.text.includes(`✓ ${t}`), t);
  }
});

test("the ready email's subject names the chart (fix 17A), the greeting the buyer", () => {
  const r = deliveryEmail({ tier: 2, name: "Jeremy", chartName: "Mary", url: URL_, links: LINKS, pending: false });
  assert.equal(r.subject, "Mary’s Human Design reading is ready");
  assert.match(r.text, /^Hello Jeremy,/);
});
test("each library link carries a line saying what it is for", () => {
  // Jeremy: "there should be a description after it".
  const { html, text } = build(1, "Jeremy");
  for (const body of [html, text]) {
    assert.match(body, /Every part of a chart, one layer at a time/);
    assert.match(body, /what the shapes mean/);
  }
});

test("the greeting is gold, not the brightest thing on the page", () => {
  // "The brighter white makes it feel insignificant."
  const { html } = build(1, "Jeremy");
  assert.match(html, /color:#c9a227">Hello Jeremy,/);
});

test("there is a link home", () => {
  const { html, text } = build(1, "Jeremy");
  assert.ok(html.includes(LINKS.home) && text.includes(LINKS.home));
});

test("both library links are present, in both bodies", () => {
  for (const tier of [0, 1, 2]) {
    const { html, text } = build(tier, "Jeremy");
    for (const href of [LINKS.hd101, LINKS.bodygraph]) {
      assert.ok(html.includes(href), `tier ${tier} html is missing ${href}`);
      assert.ok(text.includes(href), `tier ${tier} text is missing ${href}`);
    }
  }
});

test("the upgrade NAMES the tier and what is in it, never 'the rest of it'", () => {
  // Jeremy: "'If you would like the rest of it' -- 'it'? Be clear. They aren't
  // as familiar with what they are getting until they get it in hand. We have
  // been swimming in this topic so we know all too well what 'it' is. Pretend
  // they don't."
  //
  // ONLY FOR A TIER THAT CAN ACTUALLY BE BOUGHT. This used to check tier 1 ->
  // "The reading" too, and it passed while the offer page said in plain words
  // that the reading is not ready and the checkout function refused to sell it.
  // A test can assert a promise the product cannot keep; this one did.
  const { text } = build(0, "J");
  assert.ok(text.includes("The chart"), "the summary email does not name the chart");
  assert.doesNotMatch(text, /the rest of it/i, 'the summary email still says "the rest of it"');
});

test("AN UNSELLABLE TIER IS NEVER OFFERED IN AN EMAIL", async () => {
  // An email is the one surface nobody can correct after the fact, so it must
  // never carry an offer the checkout will refuse.
  //
  // The chart tier CAN now offer the reading, because the reading exists and is
  // for sale. What is asserted is the rule rather than today's ceiling: an
  // upgrade line appears exactly when the next tier is sellable, and the top
  // tier never has one because there is nothing above it.
  const { sellable } = await import("../shared/availability.mjs");
  for (const tier of [0, 1, 2]) {
    const { text, html } = build(tier, "J");
    const offered = /comes off what you pay next/.test(text);
    assert.equal(
      offered,
      sellable(tier + 1),
      `tier ${tier} ${offered ? "offered" : "did not offer"} the next tier, which is ${sellable(tier + 1) ? "" : "not "}sellable`,
    );
    assert.equal(/comes off what you pay next/.test(html), offered, "html and text disagree");
  }
});

test("no upgrade at the top tier, because there is nothing above it", () => {
  const top = build(2, "J");
  assert.doesNotMatch(top.text, /comes off what you pay next/, "the top tier was offered an upgrade");
  assert.doesNotMatch(top.html, /comes off what you pay next/, "the top tier was offered an upgrade");
});

test("the upgrade uses the SAME link, because there is only one", () => {
  const { html } = build(0, "J");
  const hrefs = [...html.matchAll(/href="([^"]+)"/g)].map((m) => m[1]);
  const readingLinks = hrefs.filter((h) => h.includes("/r/"));
  assert.ok(readingLinks.length >= 1, "no reading link at all");
  assert.deepEqual([...new Set(readingLinks)], [URL_], "more than one reading URL in the email");
});

test("NOTHING IS ATTACHED - the email is a door, not the product", () => {
  const { html, text } = build(1, "J");
  for (const body of [html, text]) {
    assert.doesNotMatch(body, /<svg|base64|attachment/i, "the product travelled in the email");
  }
  // 7000, was 6000: the link labels (10/23) add a title and an aria-label to each of the email's
  // eight links, about 0.7 KB. Still far under anything that could carry a chart.
  assert.ok(html.length < 7000, `html is ${html.length} bytes -- too big to be only a door`);
});

// --- the voice -------------------------------------------------------------

test("no imperatives: it offers, it does not instruct", () => {
  const banned = [
    /\bclick here\b/i,
    /\bview your\b/i,
    /\bget started\b/i,
    /\bupgrade now\b/i,
    /\bdon'?t miss\b/i,
    /\bact (now|fast)\b/i,
    /\bhurry\b/i,
    /\bexpires? soon\b/i,
    /\blimited time\b/i,
    /\bonly \d+ (left|remaining)\b/i,
  ];
  for (const tier of [0, 1, 2]) {
    const { subject, html, text } = build(tier, "Jeremy");
    for (const re of [...banned]) {
      for (const [what, body] of [["subject", subject], ["html", html], ["text", text]]) {
        assert.doesNotMatch(body, re, `tier ${tier} ${what} matched ${re}`);
      }
    }
  }
});

test("THE SIX DAYS ARE ABSENT FROM THE FIRST EMAIL (the receipt)", () => {
  // Jeremy: "shown in the context of the first email, it adds anxiety about
  // what happens when 6 days passes. Do they lose their purchase?"
  //
  // It arrives seconds after a card is charged, before they hold anything, so
  // it reads as a question about whether the purchase expires rather than as
  // how to get something back.
  for (const tier of [0, 1, 2]) {
    const pendingMail = deliveryEmail({ tier, name: "J", url: URL_, links: LINKS, pending: true });
    assert.doesNotMatch(pendingMail.text, /six days|6 days/i, `tier ${tier} pending mentions six days`);
    assert.doesNotMatch(pendingMail.html, /six days|6 days/i, `tier ${tier} pending mentions six days`);
  }
});

test("and present once there is something to come back TO", () => {
  const { text } = build(1, "J");
  assert.match(text, /This link works for 6 days/);
  // THE REASSURANCE COMES FIRST NOW, not after. Jeremy asked "are we still
  // doing that?" about the six days, which is what a limit reads as when it
  // leads: a countdown. The year leads instead, and the six days is a fact
  // about one link rather than about the purchase.
  const year = text.indexOf("kept for a year");
  const six = text.indexOf("works for 6 days");
  assert.ok(year >= 0 && six > year, "the six-day line still leads");
  assert.match(text, /sends you a fresh one/);
});

test("the subject says what arrived, so it can be found again in a year", () => {
  // "Thank you for your purchase" is a lovely opening and a useless search term.
  //
  // "is ready" was added when the reading tier gained a third email and two of
  // them collided. It stays on every tier rather than only where it was needed:
  // one rule for what a subject says beats a rule with an exception in it.
  //
  // AND WHOSE CHART IT IS. Every buyer got the identical subject, so Gmail
  // collapsed every purchase into one conversation -- six messages in one
  // thread, and Jeremy went looking for his summary and arrived at a reading.
  // The count was never the hazard; following a link to somebody else's chart
  // is.
  assert.equal(build(0, "J").subject, "J’s Human Design summary is ready");
  assert.equal(build(1, "J").subject, "J’s Human Design chart is ready");
  assert.equal(build(2, "J").subject, "J’s Human Design reading is ready");
});

test("TWO PEOPLE ON ONE ADDRESS GET TWO CONVERSATIONS", () => {
  // One address buying for a partner or a friend is the case the credit rule
  // was written around, and it is exactly the case that threaded into one.
  const a = build(1, "Grace Hopper").subject;
  const b = build(1, "Ada Lovelace").subject;
  assert.notEqual(a, b, "two different charts still share a subject");
  assert.match(a, /^Grace Hopper/);
  assert.match(b, /^Ada Lovelace/);
});

test("a nameless purchase still gets a sensible subject", () => {
  // Stripe does not always hand back a name, and a missing one must not
  // produce "'s Human Design chart".
  for (const nameless of [null, undefined, ""]) {
    assert.equal(build(1, nameless).subject, "Your Human Design chart is ready");
  }
});

test("the tier words come from the pricing module, not from this file", async () => {
  const { TIERS } = await import("../shared/pricing.mjs");
  for (let tier = 0; tier < TIERS.length; tier++) {
    const word = TIERS[tier].label.replace(/^The\s+/i, "").toLowerCase();
    assert.ok(build(tier, "J").subject.includes(word), `tier ${tier} drifted from its label`);
  }
});

// --- what a missing or hostile value does ----------------------------------

test("a missing name is a plainer greeting, not a failed send", () => {
  for (const name of [undefined, null, ""]) {
    const { text } = deliveryEmail({ tier: 1, name, url: URL_, links: LINKS });
    // "Hello there," rather than "Hello," -- a bare "Hello," reads like a field
    // that failed to fill, which is what a guest checkout with no name gave
    // every buyer on 2026-09-02.
    assert.match(text, /^Hello there,/, "a nicety became a failure");
  }
});

test("a name with markup in it cannot become markup", () => {
  const { html } = build(1, '<img src=x onerror="alert(1)">');
  assert.doesNotMatch(html, /<img/, "a buyer's name was rendered as html");
  assert.match(html, /&lt;img/);
});

test("an unknown tier still produces a sendable email", () => {
  for (const tier of [-1, 7, undefined, null, "1"]) {
    const { subject, html, text } = deliveryEmail({ tier, name: "J", url: URL_, links: LINKS });
    assert.ok(subject && html && text, `tier ${JSON.stringify(tier)} produced nothing`);
  }
});

test("it ends '— Human Design by The Champagne Method', 'by' lowercase (Jeremy 10/16)", () => {
  assert.equal(SIGN_OFF, "— Human Design by The Champagne Method");
  for (const tier of [0, 1, 2]) {
    for (const pending of [false, true]) {
      const { html, text } = build(tier, "Jeremy", pending);
      // The sign-off is the last line before the home link and the policy line.
      const lines = text.split("\n");
      const at = lines.indexOf(SIGN_OFF);
      assert.ok(at > 0, `tier ${tier} lost the sign-off`);
      assert.equal(lines[at + 1], "Charts and readings, for you or someone close to you.");
      assert.match(html, />Human Design by The Champagne Method<\/a>/);
      // The footer (Jeremy 10/16, mock v2 "E") carries the business name too,
      // as its own column linking the coaching site -- and only there.
      const biz = lines.indexOf("The Champagne Method Coaching and Consulting");
      assert.ok(biz > at, `tier ${tier}: the coaching column follows the HD column`);
      assert.equal(lines[biz + 1], "Coaching, if you’d like to go further.");
      assert.equal(lines[biz + 2], LINKS.home);
      assert.equal(text.split("Coaching and Consulting").length - 1, 1, "the business name appears once, in the footer");
      assert.doesNotMatch(text + html, /Human Design By /, "'by' is always lowercase");
    }
  }
});

// --- the sender ------------------------------------------------------------

test("D-12: both addresses are the domain, and no personal inbox travels", () => {
  // Jeremy 10/16 (brand check B5): the HD sender name, "by" lowercase.
  assert.equal(FROM, "Human Design by The Champagne Method <hd-readings@thechampagnemethod.co>");
  assert.doesNotMatch(FROM, /Coaching and Consulting/, "the business name is for non-HD mail");
  assert.equal(REPLY_TO, "hd-readings@thechampagnemethod.co");
  // The From must be a domain that can be authenticated, and the Reply-To must
  // not be a personal inbox: replies are routed by forwarding at the registrar,
  // so Jeremy's own address appears in neither the repo nor a buyer's headers.
  for (const [what, value] of [["From", FROM], ["Reply-To", REPLY_TO]]) {
    assert.doesNotMatch(value, /gmail\.com/i, `${what} carries a personal inbox`);
    assert.match(value, /@thechampagnemethod\.co/, `${what} is not on the sending domain`);
  }
});

test("sendMail refuses rather than throws, on every missing piece", async () => {
  const key = randomBytes(16).toString("hex");
  const full = { to: "a@example.com", subject: "s", html: "<p>h</p>", text: "t" };
  const cases = [
    [{ ...full }, {}, "misconfigured"],
    [{ ...full, to: undefined }, { apiKey: key }, "no_recipient"],
    [{ ...full, to: "not-an-address" }, { apiKey: key }, "no_recipient"],
    [{ ...full, subject: "" }, { apiKey: key }, "no_subject"],
    [{ ...full, html: "" }, { apiKey: key }, "no_body"],
    [{ ...full, text: "" }, { apiKey: key }, "no_text_body"],
  ];
  for (const [msg, opts, reason] of cases) {
    const r = await sendMail(msg, opts);
    assert.equal(r.ok, false);
    assert.equal(r.reason, reason);
  }
});

test("a plain-text alternative is required, not optional", async () => {
  // Without one a message is likelier to be filtered, and it is the version a
  // screen reader and a text-only client actually get.
  const r = await sendMail(
    { to: "a@example.com", subject: "s", html: "<p>h</p>" },
    { apiKey: randomBytes(16).toString("hex") },
  );
  assert.equal(r.reason, "no_text_body");
});

test("the send carries From, Reply-To, and exactly one recipient", async () => {
  let seen = null;
  const fetchImpl = async (url, init) => {
    seen = { url, init, body: JSON.parse(init.body) };
    return { ok: true, status: 200, json: async () => ({ id: "eml_1" }) };
  };
  const { subject, html, text } = build(1, "Jeremy");
  const r = await sendMail({ to: "buyer@example.com", subject, html, text }, { apiKey: "k", fetchImpl });

  assert.equal(r.ok, true);
  assert.equal(r.id, "eml_1");
  assert.equal(seen.body.from, FROM);
  assert.equal(seen.body.reply_to, REPLY_TO);
  assert.deepEqual(seen.body.to, ["buyer@example.com"], "more than one recipient on a private reading");
  assert.match(seen.init.headers.Authorization, /^Bearer /);
});

test("a provider failure is reported, never thrown, and never echoes the address", async () => {
  const cases = [
    [{ ok: false, status: 500, json: async () => ({ message: "boom" }) }, "provider_down"],
    [{ ok: false, status: 422, json: async () => ({ message: "bad to: buyer@example.com" }) }, "rejected"],
  ];
  for (const [res, reason] of cases) {
    const r = await sendMail(
      { to: "buyer@example.com", subject: "s", html: "<p>h</p>", text: "t" },
      { apiKey: "k", fetchImpl: async () => res },
    );
    assert.equal(r.ok, false);
    assert.equal(r.reason, reason);
    assert.equal(r.address, undefined, "the failure carried the recipient back to the caller");
  }
});

test("a network failure and a timeout are both answers", async () => {
  const dead = await sendMail(
    { to: "a@example.com", subject: "s", html: "<p>h</p>", text: "t" },
    { apiKey: "k", fetchImpl: async () => { throw new Error("ECONNRESET"); } },
  );
  assert.deepEqual(dead, { ok: false, reason: "unreachable" });

  const slow = await sendMail(
    { to: "a@example.com", subject: "s", html: "<p>h</p>", text: "t" },
    {
      apiKey: "k",
      timeoutMs: 5,
      fetchImpl: (url, init) =>
        new Promise((_, reject) =>
          init.signal.addEventListener("abort", () => {
            const e = new Error("aborted");
            e.name = "AbortError";
            reject(e);
          }),
        ),
    },
  );
  assert.deepEqual(slow, { ok: false, reason: "timeout" });
});

test("the library block is labelled as free, so it reads as free tools", () => {
  // Jeremy: the heading alone made the two links look load-bearing -- like
  // something needed to use the reading rather than something free beside it.
  // W5 (10/21): not "While you wait" on the receipt -- nothing is being waited
  // for there; the next step is the buyer's.
  const mail = deliveryEmail({ tier: 0, name: "Jeremy", url: "https://x/r/t", links: LINKS, pending: true });
  assert.match(mail.html, /Free in the library/);
  assert.match(mail.text, /FREE IN THE LIBRARY:/);
  assert.doesNotMatch(mail.html + mail.text, /while you wait/i);
  const ready = deliveryEmail({ tier: 0, name: "Jeremy", url: "https://x/r/t", links: LINKS, pending: false });
  assert.match(ready.html, /Free in the library/);
});

test("the next tier CONTAINS its parts, it does not add them", () => {
  // "adds" asks the reader to compute a delta against what they are holding.
  const mail = deliveryEmail({ tier: 0, name: "Jeremy", url: "https://x/r/t", links: LINKS, pending: false });
  const all = mail.html + mail.text;
  assert.match(all, /contains/);
  assert.ok(!/\badds\b/.test(all), "the upgrade line still says 'adds'");
});

// --- two emails, two subjects (fix 4A, 10/19) -------------------------------

test("EVERY EMAIL A BUYER GETS HAS ITS OWN SUBJECT", () => {
  // An inbox showing the same subject twice reads as a duplicate send.
  const at = (o) => deliveryEmail({ tier: 2, name: "J", url: "https://x/r/t", links: LINKS, ...o });
  const subjects = [at({ pending: true, amountCents: 4444 }).subject, at({ pending: false }).subject];
  assert.equal(new Set(subjects).size, 2, `subjects collide: ${subjects.join(" | ")}`);
});

test("there is no middle 'bodygraph is ready' email any more", () => {
  // `writing` is ignored: the reading tier gets one ready email, when the words are written.
  const mail = deliveryEmail({ tier: 2, name: "J", url: "https://x/r/t", links: LINKS, pending: false, writing: true });
  assert.doesNotMatch(mail.subject, /being written/);
  assert.match(mail.subject, /reading is ready/);
});

test("the chart tier's ready email says what is on its page", () => {
  const chart = deliveryEmail({ tier: 1, name: "J", url: "https://x/r/t", links: LINKS });
  assert.match(chart.subject, /Human Design chart is ready/);
  assert.match(chart.text, /Your chart is ready\./);
});

test("'colored in', the one word for it (fix 18A)", () => {
  for (const pending of [true, false]) {
    const { text, html } = deliveryEmail({ tier: 1, name: "J", url: "https://x/r/t", links: LINKS, pending });
    assert.match(text + html, /why some are colored in and some are not/);
    assert.doesNotMatch(text + html, /filled/);
  }
});