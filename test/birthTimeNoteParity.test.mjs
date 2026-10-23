import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { BIRTH_TIME_NOTE, birthTimeNote, chartFactsOnly } from "../netlify/lib/interpretation.mjs";

/**
 * THE READING'S FACTS NOTE, BYTE FOR BYTE THE PHONE'S. An unknown birth time:
 * since 10/23 (the word-for-word read of round rk-a3, M2) one NOTE for every
 * unknown-time chart, asking the reading never to mention the birth time or
 * call a value provisional -- the page shows the time line, the bar and the
 * PROVISIONAL tags. (Before: a NOTE naming the values the birth day changes,
 * and a rule that the reading name every one; every unknown-time reading of
 * rk-a3 then carried a forced sentence.) The phone builds the same NOTE
 * (Reading.BIRTH_TIME_NOTE). Its wording code is copied by
 * tools/phone-parity-sync.mjs into test/fixtures/phone-parity/birthTimeNote.kt.txt;
 * this test reads the phone's words out of it and holds the shop's NOTE, as the
 * model gets it, to them.
 */

const kt = readFileSync(new URL("./fixtures/phone-parity/birthTimeNote.kt.txt", import.meta.url), "utf8").replace(/\r\n/g, "\n");
// const val BIRTH_TIME_NOTE =\n "…" +\n "…"
const decl = /const val BIRTH_TIME_NOTE =\s*((?:"[^"]*"\s*\+?\s*)+)/.exec(kt)?.[1] ?? "";
const PHONE = [...decl.matchAll(/"([^"]*)"/g)].map((m) => m[1]).join("");

const chart = (spread) => ({
  type: "Generator",
  strategy: "Wait to respond",
  authority: "Emotional",
  profile: "3/5",
  timeKnown: false,
  ...(spread ? { timeSpread: { v: 1, ok: true, minutes: 1440, noon: 720, window: [6, 860], changes: spread, segments: {}, clock: [[0, 0]], gates: "change" } } : {}),
});

const CASES = [
  ["profile", "definedCenters", "undefinedCenters", "channels"],
  ["authority", "profile", "definition", "incarnationCross", "definedCenters", "undefinedCenters", "channels"],
  ["type", "strategy", "authority", "profile", "definition", "signature", "notSelfTheme", "incarnationCross", "definedCenters", "undefinedCenters", "openCenters", "channels"],
  ["signature", "notSelfTheme"],
  [],
];

test("the phone's NOTE code was found and read (the fixture is the phone's own, synced)", () => {
  assert.match(PHONE, /^NOTE: the birth time was not known\. /);
  assert.match(kt, /fun birthTimeNote\(timeKnown: Boolean, spreadChanges: List<String>\?\): String\? =\s*if \(provisionalValues\(timeKnown, spreadChanges\) == null\) null else BIRTH_TIME_NOTE/);
  assert.equal(BIRTH_TIME_NOTE, PHONE);
});

for (const changes of CASES) {
  test(`a measured day changing ${changes.join(", ") || "nothing"}: the shop's NOTE is the phone's, byte for byte`, () => {
    const out = chart(changes);
    const shop = birthTimeNote(out, { form: true });
    assert.equal(shop, PHONE);
    // What the model is actually sent ends with it.
    assert.ok(chartFactsOnly(out, { form: true }).trimEnd().endsWith(shop));
    // No value is named: the page tags them.
    assert.doesNotMatch(shop, /\bType\b|Inner Authority|Profile|Channels/);
  });
}

test("no usable spread: the same NOTE; a known time: no NOTE", () => {
  assert.equal(birthTimeNote(chart(null), { form: true }), PHONE);
  const bad = chart(["profile"]);
  bad.timeSpread.ok = false;
  assert.equal(birthTimeNote(bad, { form: true }), PHONE);
  assert.equal(birthTimeNote({ ...chart(["profile"]), timeKnown: true }, { form: true }), null);
  assert.doesNotMatch(chartFactsOnly({ ...chart(["profile"]), timeKnown: true }, { form: true }), /NOTE/);
});
