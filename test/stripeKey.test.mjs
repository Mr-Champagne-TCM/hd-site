import { test } from "node:test";
import assert from "node:assert/strict";
import { createSession } from "../netlify/lib/stripe.mjs";

/**
 * THE KEY IS CHECKED BEFORE IT IS BLAMED ON STRIPE.
 *
 * Written after a live switchover stored `key` + the actual key -- the label
 * copied along with the token out of Stripe's own table. What that produced was
 * a 502 with a generic message, nothing in Stripe's request log to find (an
 * unauthenticated call is attributed to no account), and an empty line in the
 * function log. A stray three letters cost a full investigation.
 *
 * These assert the shape check fires before any network call, and that the
 * message says enough to recognise the mistake without ever printing the key.
 */

const REAL_SHAPE = "sk_test_" + "0".repeat(24);

test("A KEY WITH A STRAY PREFIX IS REFUSED, AND SAYS SO", async () => {
  // Exactly what went into Netlify.
  await assert.rejects(
    () => createSession("key" + REAL_SHAPE, {}),
    (e) => {
      assert.match(e.message, /does not look like a secret key/);
      assert.match(e.message, /should begin/);
      // And it does not print the key.
      assert.ok(!e.message.includes(REAL_SHAPE), "the error echoed the key");
      return true;
    },
  );
});

test("a publishable key is refused too, which is the other classic paste", async () => {
  await assert.rejects(
    () => createSession("pk_live_" + "0".repeat(24), {}),
    /does not look like a secret key/,
  );
});

test("an empty or missing key still says 'no key'", async () => {
  await assert.rejects(() => createSession("", {}), /no key/);
  await assert.rejects(() => createSession(undefined, {}), /no key/);
  await assert.rejects(() => createSession("   ", {}), /no key/);
});

test("a trailing newline is trimmed rather than being a mystery", async () => {
  // Invisible in every UI that shows the value, and fatal without this.
  // It must get PAST the shape check -- the network call then fails, which is
  // a different and honest failure.
  await assert.rejects(
    () => createSession(REAL_SHAPE + "\n", {}, {}),
    (e) => {
      assert.ok(
        !/does not look like a secret key/.test(e.message),
        "a trimmable key was rejected as malformed: " + e.message,
      );
      return true;
    },
  );
});

test("restricted keys are allowed, because they are a real Stripe key type", async () => {
  const e = await createSession("rk_live_" + "0".repeat(24), {}).catch((err) => err);
  assert.ok(!/does not look like a secret key/.test(e.message), e.message);
});
