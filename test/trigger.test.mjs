import { test } from "node:test";
import assert from "node:assert/strict";
import { TRIGGER_HEADER, triggerOk, triggerToken } from "../netlify/lib/trigger.mjs";

/**
 * WHO MAY SET THE WRITER RUNNING.
 *
 * A background function's path is on the public internet like every other. The
 * job it starts is idempotent, so this is not a door to anything -- but two
 * invocations racing on one purchase both call Google, and only one of those
 * answers is ever kept. The other is billed and thrown away.
 */

// Obviously invented, and named so the leak scanner does not have to guess.
// It blocked the first version of this line, which is exactly its job: a
// literal assigned to something called SECRET is indistinguishable from a real
// one until somebody reads it.
const FAKE_GRANT = "not-a-real-value-only-a-test-fixture-0000";

test("the right token opens it and nothing else does", () => {
  const good = triggerToken(FAKE_GRANT);
  assert.equal(triggerOk(good, FAKE_GRANT), true);
  assert.equal(triggerOk(good, "a-different-fixture-entirely-here-000"), false);
  assert.equal(triggerOk("x".repeat(good.length), FAKE_GRANT), false);
});

test("A LENGTH MISMATCH IS ANSWERED, NOT THROWN", () => {
  // timingSafeEqual throws on differing lengths, and a throw is itself a timing
  // signal -- so the length is checked first, deliberately.
  for (const wrong of ["", "short", "x".repeat(200), null, undefined, 12345, {}]) {
    assert.doesNotThrow(() => triggerOk(wrong, FAKE_GRANT));
    assert.equal(triggerOk(wrong, FAKE_GRANT), false);
  }
});

test("no secret means nothing is authorised, rather than everything", () => {
  // The failure mode that matters: a missing GRANT_SECRET must not make the
  // check pass vacuously.
  assert.equal(triggerToken(null), null);
  assert.equal(triggerOk("anything", null), false);
  assert.equal(triggerOk("", ""), false);
});

test("the token is derived, not stored, so there is no second secret to rotate", () => {
  assert.equal(triggerToken(FAKE_GRANT), triggerToken(FAKE_GRANT), "the token is not stable");
  assert.notEqual(triggerToken(FAKE_GRANT), FAKE_GRANT, "the grant secret itself is being sent");
  assert.ok(!triggerToken(FAKE_GRANT).includes(FAKE_GRANT.slice(0, 12)));
});

test("the header is the one both callers send", async () => {
  assert.equal(TRIGGER_HEADER, "x-tcm-trigger");
  const { readFileSync } = await import("node:fs");
  const { fileURLToPath } = await import("node:url");
  const read = (p) => readFileSync(fileURLToPath(new URL(`../${p}`, import.meta.url)), "utf8");
  for (const caller of ["netlify/functions/chart.mjs", "netlify/functions/sweep.mjs"]) {
    assert.match(read(caller), /TRIGGER_HEADER/, `${caller} does not send the trigger`);
  }
  // And the writer checks it before doing anything at all.
  const writer = read("netlify/functions/interpret.mjs");
  assert.match(writer, /triggerOk\(request\.headers\.get\(TRIGGER_HEADER\)/);
});

test("THE WRITER IS A BACKGROUND FUNCTION, which is the whole reason this works", async () => {
  // A synchronous function is cut off at ten seconds on the free plan and a
  // reading takes tens of seconds. Background answers 202 at once and gets
  // fifteen minutes -- so it can be called on demand rather than polled.
  const writer = await import("../netlify/functions/interpret.mjs");
  assert.equal(writer.config.background, true, "the writer is no longer a background function");
  assert.equal(writer.config.path, "/api/interpret");
  assert.equal(writer.config.schedule, undefined, "the writer is polling again");

  // And the net is slow, because finding nothing is its normal case.
  const net = await import("../netlify/functions/sweep.mjs");
  assert.equal(net.config.schedule, "*/15 * * * *");
});
