import { test } from "node:test";
import assert from "node:assert/strict";
import { familiarLabel } from "../netlify/lib/interpretation.mjs";

/**
 * WHAT BECOMES FAMILIAR IS THE PRACTICE, NOT A CHART LABEL (10/25 batch; interpretation.mjs). Stored drafts,
 * word for word: the clunk, and the tails that are Jeremy's own shape and must pass.
 */
test("a bare chart label made familiar is refused", () => {
  for (const [line, label] of [
    ["Notice whether your words land cleanly, so Channel 10-20 is familiar when addressing significant professional moments.", "Channel 10-20"],
    ["Notice which adjustments work best, so 1/3 profile is familiar when tackling more complex situations.", "1/3 profile"],
    ["Notice how your body signals clarity, so Splenic authority is familiar when making bigger choices.", "Splenic authority"],
    ["Notice whether your physical body relaxes or tightens in that environment, so your open Spleen center is familiar when entering an unfamiliar social gathering.", "your open Spleen center"],
    ["Notice whether the mistake teaches you something useful, so the 3 line pattern is familiar when tackling real challenges.", "the 3 line pattern"],
    ["Notice how the room shifts, so the 6/2 profile is familiar when a friend asks for advice.", "the 6/2 profile"],
  ]) {
    assert.equal(familiarLabel(line), label, line);
  }
});

test("a practice made familiar passes, Jeremy's own tails included", () => {
  for (const line of [
    // His edit of the home-page line (10/22).
    "Notice whether the alternative path feels naturally light, so that instant bodily trust is familiar when a heavier choice appears.",
    // His locked tail.
    "Notice what settles, so it is within reach when a decision is heavier.",
    // A practice that names a label is fine.
    "Notice which choice retains its appeal across time, so consulting your Lunar authority is familiar when facing major life decisions.",
    "Notice how solitude restores your perspective, so honoring your 2 line is familiar when entering busy social gatherings.",
    // Claude, live 10/25.
    "Notice whether that sound points somewhere your thinking would not, so trusting a quick uh-huh is familiar when friends are planning a weekend trip together.",
    "Notice how your advice is received once they have asked, so waiting to be asked is familiar when your team plans a new project.",
  ]) {
    assert.equal(familiarLabel(line), null, line);
  }
});
