import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { cleanSource, countSource, fromCheckout } from "../shared/countSource.mjs";
import { countDay, countKey, handleCount, sweepCounts } from "../netlify/lib/counts.mjs";

/**
 * THE OFFER PAGE'S VISITS AND BUY CLICKS (10/26, Jeremy: "a yes"; lib/counts.mjs). Plain daily totals with one
 * word for the source -- nothing that tells one visitor from another, and never a page that carries a link.
 */
const NOW = Date.UTC(2026, 9, 26, 17, 0); // 1 PM in New York
const SHOP = "humandesign.thechampagnemethod.co";

function memStore() {
  const data = new Map();
  return {
    data,
    async set(k, v) { data.set(k, v); },
    async list() { return { blobs: [...data.keys()].map((key) => ({ key })) }; },
    async delete(k) { data.delete(k); },
  };
}

test("the source is the link's tag, else the referring site as one word, never its address", () => {
  assert.equal(countSource("?src=ig-oct", "https://l.instagram.com/?u=x", SHOP), "ig-oct");
  assert.equal(countSource("?utm_source=Instagram", "", SHOP), "instagram");
  assert.equal(countSource("", "https://l.instagram.com/?u=https%3A%2F%2Fx", SHOP), "instagram");
  assert.equal(countSource("", "https://www.google.com/search?q=human+design", SHOP), "google");
  assert.equal(countSource("", "https://thechampagnemethod.co/library/bodygraph/", SHOP), "website");
  assert.equal(countSource("", `https://${SHOP}/r/abc`, SHOP), "self");
  assert.equal(countSource("", "", SHOP), "direct");
  assert.equal(countSource("", "https://someblog.example/post?name=Jane", SHOP), "other");
  assert.equal(countSource("?src=<script>", "", SHOP), "direct", "a tag that is not a plain word is ignored");
  assert.equal(cleanSource("x".repeat(30)), null);
  assert.equal(fromCheckout("https://checkout.stripe.com/c/pay/cs_live_x"), true);
  assert.equal(fromCheckout("https://www.instagram.com/"), false);
});

test("a count's key is the whole record: New York day, event, source, tier, kind -- nothing else", () => {
  assert.equal(countDay(NOW), "2026-10-26");
  assert.equal(countDay(Date.UTC(2026, 9, 27, 3, 0)), "2026-10-26", "11 PM in New York is still the 26th");
  const k = countKey({ e: "buy", src: "instagram", tier: 0, kind: "new" }, NOW, () => 0);
  assert.equal(k, `2026-10-26/buy/instagram/0/new/${NOW}-0000`);
  assert.match(countKey({ e: "visit", src: "direct" }, NOW), /^2026-10-26\/visit\/direct\/-\/-\/\d+-[a-z0-9]{4}$/);
  assert.match(countKey({ e: "visit", src: "Bad Source!" }, NOW), /\/visit\/other\//, "an odd source is 'other'");
  assert.equal(countKey({ e: "buy", src: "x", tier: 7 }, NOW), null, "no such tier");
  assert.match(countKey({ e: "buy", src: "ig", tier: 3, kind: "upgrade" }, NOW, () => 0), /\/buy\/ig\/3\/upgrade\//,"the one-to-one (11/16) is level 3");
  assert.equal(countKey({ e: "pageview" }, NOW), null, "only the two events");
  assert.equal(countKey(null, NOW), null);
  // A field sent along that is not one of these never reaches the key.
  assert.doesNotMatch(countKey({ e: "visit", src: "ig", email: "a@b.c", path: "/r/token" }, NOW), /@|token|\/r\//);
});

test("POST /api/count writes one blob per count and answers 204 whatever it was sent", async () => {
  const store = memStore();
  assert.equal(await handleCount({ text: JSON.stringify({ e: "visit", src: "instagram" }), store, now: NOW }), 204);
  assert.equal(await handleCount({ text: JSON.stringify({ e: "buy", src: "instagram", tier: 2, kind: "someone" }), store, now: NOW }), 204);
  assert.equal(await handleCount({ text: "not json", store, now: NOW }), 204);
  assert.equal(await handleCount({ text: "x".repeat(500), store, now: NOW }), 204);
  assert.equal(await handleCount({ text: JSON.stringify({ e: "visit" }), store: { set: async () => { throw new Error("down"); } }, now: NOW }), 204);
  const keys = [...store.data.keys()];
  assert.equal(keys.length, 2);
  assert.ok(keys.some((k) => k.startsWith("2026-10-26/buy/instagram/2/someone/")));
});

test("counts past ninety days are deleted; newer ones stay", async () => {
  const store = memStore();
  await store.set("2026-07-27/visit/direct/-/-/1", "1"); // 91 days before 10/26
  await store.set("2026-07-29/visit/direct/-/-/2", "1");
  await store.set("2026-10-26/visit/direct/-/-/3", "1");
  const out = await sweepCounts(store, { now: NOW });
  assert.deepEqual([out.listed, out.deleted], [3, 1]);
  assert.equal(store.data.has("2026-07-27/visit/direct/-/-/1"), false);
});

test("the offer page counts a visit; only startCheckout counts a Buy; token pages count nothing", () => {
  const app = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");
  const purchase = readFileSync(new URL("../src/purchase.ts", import.meta.url), "utf8");
  const count = readFileSync(new URL("../src/count.ts", import.meta.url), "utf8");
  // The visit counter sits in the offer page's own branch, after the /u/ and ?paid= returns.
  const offer = app.slice(app.indexOf("NO BIRTH FORM FOR SOMEBODY WHO HAS NOT BOUGHT ANYTHING"));
  assert.match(offer, /<VisitCount \/>/);
  assert.equal(app.split("<VisitCount />").length, 2, "one place only");
  assert.match(purchase, /countBuy\(level, how\.upgrade && how\.reading \? "upgrade" : how\.someoneNew \? "someone" : "new"\);\s*\n\s*const res = await fetch\("\/api\/checkout"/);
  // Nothing about the page or the visitor is sent: the two bodies, whole.
  assert.match(count, /send\(\{ e: "visit", src: SOURCE \}\)/);
  assert.match(count, /send\(\{ e: "buy", src: SOURCE, tier: level, kind \}\)/);
  assert.doesNotMatch(count, /localStorage|sessionStorage|document\.cookie|location\.pathname/);
});
