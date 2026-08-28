import { test } from "node:test";
import assert from "node:assert/strict";
import { deliveryEmail } from "../netlify/lib/deliveryEmail.mjs";
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

const build = (tier, name) => deliveryEmail({ tier, name, url: URL_, links: LINKS });

// --- D-11, point by point --------------------------------------------------

test("the thank-you sentence names the tier and IS the link", () => {
  for (const [tier, word] of [[0, "summary"], [1, "chart"], [2, "reading"]]) {
    const { html, text } = build(tier, "Jeremy");
    const lead = `Thank you for your purchase! Here is your Human Design ${word}`;
    assert.ok(text.includes(lead), `tier ${tier} text is missing the sentence`);
    // The sentence sits INSIDE the anchor, not beside it.
    assert.ok(
      html.includes(`href="${URL_}" style="color:#3fe0c5;text-decoration:underline">${lead}`),
      `tier ${tier}: the sentence is not the hyperlink`,
    );
  }
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

test("the upgrade is offered below the top tier and NOT at it", () => {
  for (const tier of [0, 1]) {
    assert.match(build(tier, "J").text, /would like the rest/, `tier ${tier} lost its upgrade line`);
  }
  const top = build(2, "J");
  assert.doesNotMatch(top.text, /would like the rest/, "the top tier was offered an upgrade");
  assert.doesNotMatch(top.html, /would like the rest/, "the top tier was offered an upgrade");
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
  assert.ok(html.length < 4000, `html is ${html.length} bytes -- too big to be only a door`);
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

test("the six days are stated as a fact about the link, never as pressure", () => {
  const { text } = build(1, "J");
  assert.match(text, /active for six days/);
  // And immediately followed by the reassurance, so it cannot read as a threat.
  assert.match(text, /sent again/);
  assert.match(text, /kept for a year/);
});

test("the subject says what arrived, so it can be found again in a year", () => {
  // "Thank you for your purchase" is a lovely opening and a useless search term.
  assert.equal(build(0, "J").subject, "Your Human Design summary");
  assert.equal(build(1, "J").subject, "Your Human Design chart");
  assert.equal(build(2, "J").subject, "Your Human Design reading");
});

test("the tier words come from the pricing module, not from this file", async () => {
  const { TIERS } = await import("../shared/pricing.mjs");
  for (let tier = 0; tier < TIERS.length; tier++) {
    const word = TIERS[tier].label.replace(/^The\s+/i, "").toLowerCase();
    assert.ok(build(tier, "J").subject.endsWith(word), `tier ${tier} drifted from its label`);
  }
});

// --- what a missing or hostile value does ----------------------------------

test("a missing name is a plainer greeting, not a failed send", () => {
  for (const name of [undefined, null, ""]) {
    const { text } = deliveryEmail({ tier: 1, name, url: URL_, links: LINKS });
    assert.match(text, /^Hello,/, "a nicety became a failure");
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

// --- the sender ------------------------------------------------------------

test("D-12: both addresses are the domain, and no personal inbox travels", () => {
  assert.equal(FROM, "The Champagne Method <hd-readings@thechampagnemethod.co>");
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
