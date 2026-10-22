import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { birthTimeNote, chartFactsOnly } from "../netlify/lib/interpretation.mjs";

/**
 * THE READING'S FACTS NOTE, BYTE FOR BYTE THE PHONE'S (10/22). An unknown birth
 * time: when the record keeps a usable spread (engine /v1/spread, ok), the NOTE
 * names only what the birth day changes. The phone builds the same NOTE from
 * the same changes (hd-reading-app f04afa5, BirthTime.noteChanges ->
 * Reading.birthTimeNote). Its wording code is copied by
 * tools/phone-parity-sync.mjs into test/fixtures/phone-parity/birthTimeNote.kt.txt;
 * this test reads the phone's words out of it and holds the shop's NOTE, as the
 * model gets it, to them.
 *
 * The shop asks in form mode (the live prompt fills the JSON form), so the
 * on-track / off-track names are the form's, as the phone's always are.
 */

const kt = readFileSync(new URL("./fixtures/phone-parity/birthTimeNote.kt.txt", import.meta.url), "utf8").replace(/\r\n/g, "\n");
const joinLiterals = (expr) => expr.replace(/"\s*\+\s*\n\s*"/g, "");
const centers = /val centers = "([^"]+)"/.exec(kt)[1];
const NAMES = Object.fromEntries([...kt.matchAll(/"(\w+)" to (?:"([^"]+)"|(centers))/g)].map((m) => [m[1], m[2] ?? centers]));
const HEAD = /val head = "([^"]+)"/.exec(kt)[1];
const EMPTY = joinLiterals(/isEmpty\(\)\) \{\s*return ("[\s\S]*?")\s*\}/.exec(kt)[1]).slice(1, -1).replace("$head", HEAD);
const MAIN = joinLiterals(/\n {8}return ("\$head [\s\S]*?")\n {4}\}/.exec(kt)[1]).slice(1, -1);
const [, MEASURED, NOT_MEASURED] = /\$\{if \(p\.measured\) "([^"]+)" else "([^"]+)"\}/.exec(MAIN);

/** The phone's NOTE for these (already filtered) fields, in its own words. */
function phoneNote(fields, measured) {
  if (!fields.length) return EMPTY;
  const said = [...new Set(fields.map((f) => NAMES[f]).filter(Boolean))];
  const list = said.length < 2 ? said.join("") : `${said.slice(0, -1).join(", ")} and ${said.at(-1)}`;
  return MAIN.replace("$head", HEAD)
    .replace(/\$\{if \(p\.measured\) "[^"]+" else "[^"]+"\}/, measured ? MEASURED : NOT_MEASURED)
    .replace("${provisionalNames(p.fields)}", list);
}

const chart = (spread) => ({
  type: "Generator",
  strategy: "Wait to respond",
  authority: "Emotional",
  profile: "3/5",
  timeKnown: false,
  ...(spread ? { timeSpread: { v: 1, ok: true, minutes: 1440, noon: 720, window: [6, 860], changes: spread, segments: {}, clock: [[0, 0]], gates: "change" } } : {}),
});

const CASES = [
  // The phone's own PromptV3lTest case, and the made-up days of the 10/22 rig (theo, addRead, addUp).
  ["profile", "definedCenters", "undefinedCenters", "channels"],
  ["profile", "definition", "definedCenters", "undefinedCenters", "channels"],
  ["authority", "profile", "definition", "incarnationCross", "definedCenters", "undefinedCenters", "channels"],
  ["authority", "profile", "definedCenters", "undefinedCenters", "openCenters", "channels"],
  ["type", "strategy", "authority", "profile", "definition", "signature", "notSelfTheme", "incarnationCross", "definedCenters", "undefinedCenters", "openCenters", "channels"],
  ["incarnationCross"],
  ["signature", "notSelfTheme"],
  [],
];

test("the phone's NOTE code was found and read (the fixture is the phone's own, synced)", () => {
  assert.equal(HEAD, "NOTE: birth time was not known and the chart was cast at noon.");
  assert.equal(Object.keys(NAMES).length, 12);
  assert.match(MAIN, /\$\{provisionalNames\(p\.fields\)\}/);
});

for (const changes of CASES) {
  test(`a measured day changing ${changes.join(", ") || "nothing"}: the shop's NOTE is the phone's, byte for byte`, () => {
    const out = chart(changes);
    const shop = birthTimeNote(out, { form: true });
    assert.equal(shop, phoneNote(changes, true));
    // What the model is actually sent ends with it.
    assert.ok(chartFactsOnly(out, { form: true }).trimEnd().endsWith(shop));
    // A value the day does not change is never named.
    if (!changes.includes("type")) assert.doesNotMatch(shop, /\bType\b/);
    if (!changes.includes("authority")) assert.doesNotMatch(shop, /Inner Authority/);
  });
}

test("no usable spread: the phone's three (Type, Inner Authority, Profile); a known time: no NOTE", () => {
  assert.equal(birthTimeNote(chart(null), { form: true }), phoneNote(["type", "authority", "profile"], false));
  // A spread that is not ok is no spread.
  const bad = chart(["profile"]);
  bad.timeSpread.ok = false;
  assert.equal(birthTimeNote(bad, { form: true }), phoneNote(["type", "authority", "profile"], false));
  assert.equal(birthTimeNote({ ...chart(["profile"]), timeKnown: true }, { form: true }), null);
  assert.doesNotMatch(chartFactsOnly({ ...chart(["profile"]), timeKnown: true }, { form: true }), /NOTE/);
});
