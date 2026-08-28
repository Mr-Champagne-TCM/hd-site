import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { importTs } from "./support/ts.mjs";

/**
 * Which path opens a reading, and which does not.
 *
 * A route is one regular expression, which is exactly the kind of thing that
 * looks obviously right and is quietly wrong at the edges. The dangerous
 * direction is a pattern that matches MORE than `/r/<token>` -- every extra
 * path it swallows is a page that silently renders a reading shell instead of
 * whatever was actually asked for.
 */

const { tokenFromPath } = await importTs("src", "readingRoute.ts");

test("a real link yields its token", () => {
  const token = "eyJyIjoiYWJjIn0.mVh-9_x";
  assert.equal(tokenFromPath(`/r/${token}`), token);
  assert.equal(tokenFromPath(`/r/${token}/`), token, "a trailing slash is the same link");
});

test("the token charset covers what a signed link actually contains", () => {
  // base64url plus the dot that separates payload from signature.
  for (const t of ["abc", "a-b_c", "A1.B2", "x".repeat(300), "aA0-_.aA0-_"]) {
    assert.equal(tokenFromPath(`/r/${t}`), t, `${t} was not accepted`);
  }
});

test("NOTHING ELSE IS A READING - the offer page stays the offer page", () => {
  for (const path of [
    "/",
    "/r",
    "/r/",
    "/reading/abc",
    "/rr/abc",
    "/r/abc/extra",
    "/x/r/abc",
    "/library/r/abc",
    "/api/reading",
  ]) {
    assert.equal(tokenFromPath(path), null, `${path} was treated as a reading link`);
  }
});

test("a path that could be an injection is not a token", () => {
  for (const path of [
    "/r/../../etc/passwd",
    "/r/abc?x=1",
    "/r/abc#frag",
    "/r/<script>",
    "/r/a b",
    "/r/a%2Fb",
  ]) {
    assert.equal(tokenFromPath(path), null, `${path} produced a token`);
  }
});

/**
 * The redirect has to exist or the whole route is a 404 in production and works
 * perfectly in dev, which is the worst way for this to fail: invisible until a
 * real buyer clicks a real link.
 */
test("netlify.toml serves /r/* from the app, and does NOT catch everything", () => {
  const toml = readFileSync(fileURLToPath(new URL("../netlify.toml", import.meta.url)), "utf8");
  assert.match(toml, /from\s*=\s*"\/r\/\*"/, "no /r/* redirect -- links would 404 in production");
  assert.match(toml, /status\s*=\s*200/, "the redirect must rewrite, not bounce");

  // A blanket fallback would turn every genuine 404 into a 200 with an offer
  // page in it, which is how a broken link stops looking broken.
  assert.doesNotMatch(toml, /from\s*=\s*"\/\*"/, "a catch-all fallback would hide every 404");
});
