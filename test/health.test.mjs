import { test } from "node:test";
import assert from "node:assert/strict";
import { INCIDENT_TTL_SECONDS, digest, incidents, record } from "../netlify/lib/health.mjs";

/**
 * The watcher.
 *
 * "No silent failing" is the requirement, and the thing being guarded against
 * is subtle: a delivery email that fails leaves a buyer looking at a page that
 * seems fine. Nobody finds out unless they write in.
 */

function fakeStore() {
  const data = new Map();
  return {
    data,
    async setJSON(key, value, opts) {
      data.set(key, { value, opts });
    },
    async get(key) {
      return data.get(key)?.value ?? null;
    },
    async list() {
      return { blobs: [...data.keys()].map((key) => ({ key })) };
    },
  };
}

test("an incident is recorded with a reason and an expiry", async () => {
  const store = fakeStore();
  const entry = await record(store, { kind: "claim-email", detail: "resend 401", now: 1000 });
  assert.equal(entry.kind, "claim-email");
  assert.equal(entry.detail, "resend 401");
  const [only] = [...store.data.values()];
  assert.ok(only.opts.expiration instanceof Date, "nothing expires this incident");
  assert.equal(only.opts.expiration.getTime(), 1000 + INCIDENT_TTL_SECONDS * 1000);
});

test("A BROKEN MONITOR MUST NOT BREAK WHAT IT MONITORS", async () => {
  // These calls sit inside the purchase path. A throw here would fail a
  // purchase in order to report that a purchase was not reported.
  const angry = {
    async setJSON() {
      throw new Error("blobs are down");
    },
  };
  assert.equal(await record(angry, { kind: "claim-email", detail: "x" }), null);
  assert.equal(await record(null, { kind: "claim-email" }), null);
  assert.equal(await record(fakeStore(), {}), null, "an incident with no kind is not an incident");

  const unreadable = {
    async list() {
      throw new Error("blobs are down");
    },
  };
  assert.deepEqual(await incidents(unreadable), []);
});

test("only incidents inside the window are reported, newest first", async () => {
  const store = fakeStore();
  const now = 10_000_000;
  await record(store, { kind: "ready-email", detail: "old", now: now - 40 * 60 * 60 * 1000 });
  await record(store, { kind: "ready-email", detail: "recent", now: now - 60_000 });
  await record(store, { kind: "claim-email", detail: "newer", now: now - 30_000 });
  const found = await incidents(store, { now, window: 24 * 60 * 60 * 1000 });
  assert.deepEqual(found.map((i) => i.detail), ["newer", "recent"]);
});

test("NOTHING ABOUT THE BUYER IS RECORDED", async () => {
  // A monitoring store is exactly where personal data goes to be forgotten
  // about, and its retention would be nobody's job. The detail is truncated
  // hard for the same reason.
  const store = fakeStore();
  const entry = await record(store, { kind: "k", detail: "x".repeat(500) });
  assert.equal(entry.detail.length, 200);
  const written = JSON.stringify([...store.data.values()]);
  assert.ok(!/@/.test(written), "an address shape reached the health store");
});

test("THE DIGEST GOES OUT EVEN WHEN NOTHING IS WRONG", () => {
  // This is the whole design. A watcher that only speaks on failure cannot be
  // told apart from one that has stopped -- so the all-clear is what proves it
  // is alive, and silence becomes the alarm.
  const { subject, text } = digest({ found: [], hours: 24 });
  assert.match(subject, /all clear/);
  assert.match(text, /Nothing failed/);
  assert.match(text, /If it stops/, "the digest does not explain why it arrives when all is well");
});

test("the subject carries the answer, so it need not be opened", () => {
  const found = [
    { kind: "ready-email", detail: "timeout", at: 2 },
    { kind: "ready-email", detail: "timeout", at: 1 },
  ];
  const { subject, text } = digest({ found, hours: 24 });
  assert.match(subject, /2 problems/);
  assert.match(text, /2 x ready-email/);
});

test("one problem is not called 'problems'", () => {
  const { subject } = digest({ found: [{ kind: "k", detail: null, at: 1 }], hours: 24 });
  assert.match(subject, /1 problem \(/);
});

test("the digest reaches the forwarding address, never the personal one", async () => {
  const { SITE } = await import("../netlify/lib/siteLinks.mjs");
  const watch = await import("../netlify/functions/watch.mjs");
  assert.equal(SITE.contact, "hd-readings@thechampagnemethod.co");
  assert.equal(watch.config.schedule, "0 13 * * *", "the watch is no longer scheduled");
});
