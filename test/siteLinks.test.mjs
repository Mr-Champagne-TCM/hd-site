import { test } from "node:test";
import assert from "node:assert/strict";
import { SITE as SERVER } from "../netlify/lib/siteLinks.mjs";
import { importTs } from "./support/ts.mjs";

/**
 * The two copies of the site's own links must agree.
 *
 * They are duplicated on purpose: src/ is bundled and served to every visitor,
 * and a server module importing from it is the shape that put signing code one
 * careless import away from the browser last time. Four constants are a cheap
 * duplication; two copies drifting in silence is not.
 */
const { SITE: CLIENT } = await importTs("src", "copy.ts");

test("every link the server sends matches the one the page shows", () => {
  for (const key of ["home", "library", "hd101", "bodygraph"]) {
    assert.equal(SERVER[key], CLIENT[key], `${key} has drifted between server and page`);
  }
});

test("the contact address is the forwarding one, never the personal inbox", () => {
  assert.equal(SERVER.contact, "hd-readings@thechampagnemethod.co");
  assert.doesNotMatch(SERVER.contact, /gmail/i, "the personal inbox reached a published surface");
});

test("every link is https and on the practice's own domain", () => {
  for (const key of ["home", "library", "hd101", "bodygraph"]) {
    assert.match(SERVER[key], /^https:\/\/thechampagnemethod\.co(\/|$)/, `${key} points somewhere else`);
  }
});
