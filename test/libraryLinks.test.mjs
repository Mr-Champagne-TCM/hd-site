import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as L from "../shared/libraryLinks.mjs";
import * as G from "../shared/libraryGlance.mjs";

/**
 * The library anchors and the library's one-liners are the PHONE'S, not a
 * second set (Jeremy 10/16: "Clickable, identical to the phone").
 *
 * Held to snapshots of the phone app (test/fixtures/phone-parity):
 * phone-library-targets.txt is every anchor its LibraryLinks can produce
 * (its LibraryLinksTest writes it), and LibraryGlance.kt.txt is its generated
 * one-liner table.
 */

const DIR = new URL("./fixtures/phone-parity/", import.meta.url);
const targets = new Set(readFileSync(new URL("phone-library-targets.txt", DIR), "utf8").split(/\r?\n/).filter(Boolean));
const a = (url) => url.split("#")[1];

test("ids match the library's own scheme, case for case with the phone's test", () => {
  assert.equal(a(L.typeLink("Manifesting Generator")), "type-manifesting-generator");
  assert.equal(a(L.profileLink("4/1")), "profile-4-1");
  assert.equal(a(L.lineLink("Line 3")), "line-3");
  assert.equal(a(L.channelLink("57-20")), "channel-20-57");
  assert.equal(a(L.crossLink("Right Angle Cross of Eden (11/12 | 6/36)")), "cross-r-eden");
  assert.equal(a(L.crossLink("Right Angle Cross of The Sphinx (1/2 | 7/13)")), "cross-r-the-sphinx");
  assert.equal(a(L.crossLink("Juxtaposition Cross of Self-Expression (1/2 | 4/49)")), "cross-j-self-expression");
  assert.equal(a(L.crossLink("Left Angle Cross of The Plane (6/36 | 12/11)")), "cross-l-the-plane");
  assert.equal(L.crossLink("Juxtaposition Cross (99/2 | 3/4)"), L.CROSSES);
  assert.equal(L.profileLink(""), L.PROFILES);
  assert.equal(L.channelLink("?"), L.CHANNELS);
  assert.equal(L.typeLink(""), L.TYPES);
  assert.equal(L.SHOP, "https://humandesign.thechampagnemethod.co/");
  assert.equal(L.LIBRARY, "https://thechampagnemethod.co/library/human-design/");
});

test("every anchor the shop can produce is one the phone produces", () => {
  const ours = [
    ...["Generator", "Manifesting Generator", "Projector", "Manifestor", "Reflector"].map(L.typeLink),
    ...["1/3", "1/4", "2/4", "2/5", "3/5", "3/6", "4/6", "4/1", "5/1", "5/2", "6/2", "6/3"].map(L.profileLink),
    ...[1, 2, 3, 4, 5, 6].map((n) => L.lineLink(`Line ${n}`)),
    ...Object.keys(G.CHANNEL).map(L.channelLink),
    L.AUTHORITY, L.CENTERS, L.DEFINITION, L.CHANNELS, L.PROFILES, L.CROSSES, L.TYPES,
  ];
  for (const u of ours) assert.ok(targets.has(u), `${u} is not one of the phone's targets`);
  assert.equal(Object.keys(G.CHANNEL).length, 36);
});

test("the one-liners are the phone's LibraryGlance, word for word", () => {
  const kt = readFileSync(new URL("LibraryGlance.kt.txt", DIR), "utf8");
  const block = (name) => {
    const body = kt.split(`val ${name}:`)[1].split("\n    )")[0];
    const out = {};
    for (const m of body.matchAll(/^\s+(?:"((?:[^"\\]|\\.)*)"|'(.)') to "((?:[^"\\]|\\.)*)",$/gm)) {
      out[m[1] ?? m[2]] = m[3].replace(/\\"/g, '"').replace(/\\\$/g, "$").replace(/\\\\/g, "\\");
    }
    return out;
  };
  for (const name of ["CENTER_WHAT", "CENTER_DEFINED", "CENTER_UNDEFINED", "CENTER_OPEN", "CHANNEL", "PROFILE_LINE"]) {
    const phone = block(name);
    assert.ok(Object.keys(phone).length >= 6, `${name} did not parse`);
    assert.deepEqual({ ...G[name] }, phone, name);
  }
});
