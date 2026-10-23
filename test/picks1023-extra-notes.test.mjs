import { test } from "node:test";
import assert from "node:assert/strict";
import { correctionNote } from "../shared/correctionNote.mjs";

/**
 * EXTRA (copy-fix "For Jeremy" item 3, picks-1023, pending Jeremy): the
 * "Change a detail" note and the first-details note say what stayed the same
 * beside what moved, BEFORE their closing sentence -- the order the 10/23
 * read's N1 gave the "Birth time added" note.
 */
const moved = [{ field: "profile", was: "3/5", now: "3/6" }];

test("extra: the correction note -- moved, the same, then the close", () => {
  const n = correctionNote({ type: "correction", changed: ["time"], was: { time: "10:00", timeKnown: true }, now: { time: "11:30", timeKnown: true }, chart: moved });
  assert.equal(
    n.body,
    "One part came out differently: your Profile is now 3/6 (it was 3/5). Your Type and Authority are the same. That follows from your correction — nothing went wrong, and everything below is written for the corrected chart.",
  );
});

test("extra: the first-details note -- moved, the same, then the close", () => {
  const n = correctionNote({ type: "first-details", chart: moved });
  assert.equal(
    n.body,
    "One part came out differently: your Profile is now 3/6 (it was 3/5). Your Type and Authority are the same. A birth time that was guessed before and is known now would do exactly this — nothing went wrong, and everything below is written for this chart.",
  );
});

test("extra: with all three moved there is no 'same' sentence, and the close still ends the note", () => {
  const all = [
    { field: "type", was: "Generator", now: "Projector" },
    { field: "profile", was: "3/5", now: "3/6" },
    { field: "authority", was: "Sacral", now: "Splenic" },
  ];
  const n = correctionNote({ type: "correction", changed: ["date"], was: { date: "1990-01-01" }, now: { date: "1990-01-02" }, chart: all });
  assert.match(n.body, /^Three parts came out differently: .+\. That follows from your correction — nothing went wrong, and everything below is written for the corrected chart\.$/);
  assert.doesNotMatch(n.body, /the same\./);
});
