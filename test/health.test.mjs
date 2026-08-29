import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ALERT_QUIET_SECONDS,
  INCIDENT_TTL_SECONDS,
  digest,
  incidents,
  record,
  reportFailure,
} from "../netlify/lib/health.mjs";

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
  const { subject, text } = digest({ found: [] });
  assert.match(subject, /all clear/);
  assert.match(text, /Nothing failed in the last 7 days/);
  assert.match(text, /If it stops/, "the digest does not explain why it arrives when all is well");
});

test("the subject carries the answer, so it need not be opened", () => {
  const found = [
    { kind: "ready-email", detail: "timeout", at: 2 },
    { kind: "ready-email", detail: "timeout", at: 1 },
  ];
  const { subject, text } = digest({ found });
  assert.match(subject, /2 problems to follow up/);
  assert.match(text, /2 x ready-email/);
});

test("one problem is not called 'problems'", () => {
  const { subject } = digest({ found: [{ kind: "k", detail: null, at: 1 }] });
  assert.match(subject, /1 problem to follow up/);
});

test("the digest reaches the forwarding address, never the personal one", async () => {
  const { SITE } = await import("../netlify/lib/siteLinks.mjs");
  const watch = await import("../netlify/functions/watch.mjs");
  assert.equal(SITE.contact, "hd-readings@thechampagnemethod.co");
  assert.equal(watch.config.schedule, "0 13 * * 1", "the weekly report is not scheduled for Monday");
});

// --- the immediate alert ----------------------------------------------------

test("A FAILURE EMAILS THE MOMENT IT HAPPENS", async () => {
  // Jeremy: "immediately if a failure occurs." Waiting a week to learn that
  // nobody's reading was delivered is not monitoring.
  const store = fakeStore();
  const sent = [];
  const r = await reportFailure(store, {
    kind: "ready-email",
    detail: "resend 500",
    now: 1_000_000,
    send: async (m) => sent.push(m),
    site: "https://x",
  });
  assert.equal(r.alerted, true);
  assert.equal(sent.length, 1);
  assert.match(sent[0].subject, /ready-email failed/);
  assert.match(sent[0].text, /resend 500/);
});

test("forty identical alerts is its own kind of silence", async () => {
  // Resend going down does not fail once, it fails on every purchase until it
  // is fixed. The first goes; the rest are held and counted in the weekly.
  const store = fakeStore();
  const sent = [];
  const send = async (m) => sent.push(m);
  const t = 5_000_000;
  await reportFailure(store, { kind: "ready-email", detail: "a", now: t, send });
  await reportFailure(store, { kind: "ready-email", detail: "b", now: t + 60_000, send });
  const held = await reportFailure(store, { kind: "ready-email", detail: "c", now: t + 120_000, send });
  assert.equal(sent.length, 1, "the repeats were not held back");
  assert.equal(held.reason, "quiet_period");

  // ...but every one is still on file, so the weekly report counts them all.
  const found = await incidents(store, { now: t + 120_000, window: 24 * 60 * 60 * 1000 });
  assert.equal(found.length, 3, "a held alert lost its incident");

  // And a DIFFERENT kind is never held behind another kind's quiet period.
  await reportFailure(store, { kind: "claim-email", detail: "d", now: t + 130_000, send });
  assert.equal(sent.length, 2, "a different failure was silenced by an unrelated one");

  // Once the hour is up, it speaks again.
  await reportFailure(store, {
    kind: "ready-email",
    detail: "e",
    now: t + ALERT_QUIET_SECONDS * 1000 + 1,
    send,
  });
  assert.equal(sent.length, 3, "the quiet period never ended");
});

test("an alert that cannot be sent still leaves the incident on file", async () => {
  const store = fakeStore();
  const r = await reportFailure(store, {
    kind: "claim-email",
    detail: "x",
    now: 1,
    send: async () => {
      throw new Error("resend is down too");
    },
  });
  assert.equal(r.recorded, true);
  const found = await incidents(store, { now: 1, window: 1000 });
  assert.equal(found.length, 1);
});

test("with no mail key it records and says so, rather than throwing", async () => {
  const r = await reportFailure(fakeStore(), { kind: "k", detail: "d", now: 1 });
  assert.deepEqual(r, { recorded: true, alerted: false });
});
