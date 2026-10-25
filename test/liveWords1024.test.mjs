import { test } from "node:test";
import assert from "node:assert/strict";
import {
  INTERPRETATION,
  SUMMARY_MARKER,
  TAKEAWAYS,
  brochureProblem,
  draftProblem,
  glanceEcho,
  glanceProblem,
  repeatWordProblem,
  tagProblem,
} from "../netlify/lib/interpretation.mjs";

/**
 * AI WORDING SEEN LIVE ON 10/23 (live test 6, the reading upgrade from a chart), measured on every stored draft
 * (hd-e2e/batch-1024): "profound" three times in one reading; a try-this tag "(Inner Authority)" while the
 * reading says "Emotional authority"; a page-2 glance row "You move through daily life as a Projector."; "weave
 * a tapestry" (the 10/23 brochure check already refuses it). The phone's Reading.kt is the same word for word
 * (LiveWords1024Test).
 */

const section = (p, heading = INTERPRETATION[0]) => `${heading}\n\n${p}\n`;

test("profound: twice passes, a third time is refused, quoting the third", () => {
  const two = section("You carry a profound sense of direction. Others feel a profound calm around you.");
  assert.equal(repeatWordProblem(two), null);
  const three = `${two}\n${INTERPRETATION[1]}\n\nWaiting brings profound clarity before you commit.\n`;
  assert.equal(
    repeatWordProblem(three),
    `The reading uses "profound" a third time in "How you decide"; twice in one reading is enough, so this one says the plain thing instead: "Waiting brings profound clarity before you commit...."`,
  );
  assert.match(repeatWordProblem(section("A profound gift, profoundly felt, and profound in its reach.")), /uses "profound" a third time in "Your energy, and how it starts"/);
  // In the summary rows too, and counted across the whole reading.
  const rows = `${SUMMARY_MARKER}\n\nType: You carry a profound steadiness.\n\n${section("A profound calm. A profound pull toward work.")}`;
  assert.match(repeatWordProblem(rows), /a third time in "Your energy, and how it starts"/);
  // draftProblem runs it.
  assert.match(draftProblem(three, { type: "Generator", channels: [] }) ?? "", /a third time/);
});

test("a try-this tag that names no authority is refused; a named one passes", () => {
  const block = (tag) => `${TAKEAWAYS}\n\nThese are invitations to test, not instructions.\n\n(${tag}) This week, on a small plan, you might sleep on it for one night. Notice how it sits, so the pause is familiar when a decision is heavier.\n`;
  const chart = { type: "Projector", authority: "Emotional", profile: "6/2", channels: [] };
  for (const tag of ["Inner Authority", "Authority", "Your Inner Authority", "inner authority", "Inner Authority, provisional"]) {
    assert.equal(
      tagProblem(block(tag), chart),
      `A takeaway's (chart feature) says "(${tag})" without naming the authority; it names it as the reading does: "(Emotional authority)"`,
      tag,
    );
  }
  for (const tag of ["Emotional authority", "Emotional authority, provisional", "Inner Authority: Emotional", "Emotional inner authority", "Strategy"]) {
    assert.equal(tagProblem(block(tag), chart), null, tag);
  }
  assert.match(tagProblem(block("Inner Authority"), { ...chart, authority: "Ego Manifested" }), /"\(Ego Manifested authority\)"$/);
});

test("a glance row that only repeats its value is refused; one with a word of its own passes", () => {
  for (const [k, row] of [
    ["Type", "You move through daily life as a Projector."],
    ["Type", "You operate as a Projector."],
    ["Type", "Generator"],
    ["Type", "You operate as a Generator who moves through life waiting to respond."],
    ["Strategy", "Your strategy is waiting for the invitation."],
    ["Authority", "Your inner authority is emotional."],
    ["Profile", "Your profile is the 6/2."],
    ["Profile", "6/2"],
  ]) assert.equal(glanceEcho(k, row), true, row);
  for (const [k, row] of [
    ["Type", "You see how others work and guide them well once they ask."],
    ["Type", "You decide through your Ego Projected authority."],
    ["Strategy", "Waiting for the invitation lets your guidance land where it is wanted."],
    ["Authority", "Clarity comes over hours or days as feelings rise and fall."],
    ["Profile", "Your 6/2 profile asks you to try things first and watch from the roof later."],
    // The track rows have their own check.
    ["Signature", "Success."],
  ]) assert.equal(glanceEcho(k, row), false, row);
  const page = `${SUMMARY_MARKER}\n\nType: You move through daily life as a Projector.\nStrategy: Waiting for the invitation lets your guidance land where it is wanted.\n\n${section("x")}`;
  assert.equal(
    glanceProblem(page),
    `The "Type" line only repeats its value ("You move through daily life as a Projector."); it says what that is like in an ordinary day.`,
  );
});

test("weave a tapestry is refused by the 10/23 brochure check; weave alone is not a brochure word", () => {
  assert.match(brochureProblem(section("Your life can weave a rich tapestry of meaning.")) ?? "", /uses "tapestry" in "Your energy, and how it starts", a brochure word/);
  assert.equal(brochureProblem(section("Your Cross weaves together gates 5, 35, 47 and 22.")), null);
});
