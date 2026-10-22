import { test } from "node:test";
import assert from "node:assert/strict";
import { TAKEAWAYS, spellingProblem, takeawayProblem } from "../netlify/lib/interpretation.mjs";

/**
 * THE TRY-THIS SHAPE AND US SPELLING (10/21). Jeremy picked shape A for the
 * four things to try: when, one thing to try, what to notice, and why it starts
 * small. Every stored line opened "Notice / Watch" and none said when. The rig
 * also found a stored reading saying "centre". Made-up lines only.
 */

const block = (...lines) => `${TAKEAWAYS}\n\nThese are invitations to test, not instructions.\n\n${lines.join("\n\n")}\n`;
const A = [
  "(Sacral authority) This week, on small asks like a quick call, you might wait for your gut's sound before you answer, and notice which one comes, so the sound is familiar by the time a bigger ask arrives.",
  "(Channel 20-34) The next time an easy job gets a clear gut yes, you might go straight into it and notice whether the energy feels absorbed or just busy, so you know the difference before more rides on it.",
  "(Profile 4/1) Over the next few days, in an easy conversation with a friend, you might share one thing you have been reading about and notice whether it opens a door, which is practice for when a bigger opening comes.",
  "(Undefined Solar Plexus) Once or twice this week, as you leave somewhere lively but easy, you might name your mood in one word and notice how much of it stayed behind, so the same check is within reach after a tense conversation.",
];

test("TRY-THIS SHAPE A PASSES: when, 'you might', notice, and the calm tail (both tails Jeremy approved)", () => {
  assert.equal(takeawayProblem(block(...A)), null);
});

test("A TRY-THIS LINE THAT OPENS 'Notice / Watch / Observe / Pay attention' IS REFUSED", () => {
  for (const soft of ["Notice", "Watch", "Observe", "Pay attention to"]) {
    const line = `(Sacral authority) ${soft} what the body does in the first second after a question.`;
    assert.match(takeawayProblem(block(line, ...A.slice(1))), new RegExp(`opens with "${soft.split(" ").slice(0, 2).join(" ").replace(" to", "")}`, "i"), soft);
  }
});

test("each part of the shape is required: no 'you might', no when, nothing to notice, no tail", () => {
  const cases = [
    [/has no "you might/, "(Sacral) This week, on small asks, wait for your gut's sound and notice it, so it is familiar later."],
    [/does not say when/, "(Sacral) You might wait for your gut's sound and notice which one comes, so it is familiar later."],
    [/names nothing to notice/, "(Sacral) This week, on small asks, you might wait for your gut's sound, so it is familiar later."],
    [/has no ", so/, "(Sacral) This week, on small asks, you might wait for your gut's sound and notice which one comes."],
  ];
  for (const [why, line] of cases) assert.match(takeawayProblem(block(line, ...A.slice(1))), why, line);
});

test("no two try-this lines begin the same way", () => {
  const twin = A[1].replace("(Channel 20-34) The next time", "(Channel 20-34) This week, on small");
  assert.match(takeawayProblem(block(A[0], twin, A[2], A[3])), /begins the same way/);
});

test("a section with no try-this lines leaves this rule nothing to say (structure is judged elsewhere)", () => {
  assert.equal(takeawayProblem("Your energy, and how it starts\n\nYou carry a steady motor.\n"), null);
});

const reading = (sentence) => `IN SHORT\n\nType: You are a Generator.\n\nYour energy, and how it starts\n\nYou carry a motor.\n\n${sentence}\n`;

test("US SPELLING: a UK spelling in the written reading is refused, by name", () => {
  for (const [word, sentence] of [
    ["centre", "Your Sacral centre is defined."],
    ["behaviour", "Your behaviour follows the motor."],
    ["recognise", "You recognise the pull."],
    ["colour", "The colour of the day changes."],
    ["programme", "No programme is needed."],
    ["whilst", "Rest whilst it settles."],
  ]) {
    assert.match(spellingProblem(reading(sentence)), new RegExp(`spells "${word}" the UK way`, "i"), word);
  }
});

test("US SPELLING: US words that look like UK ones pass (advise, exercise, surprise, analyses, practice)", () => {
  for (const sentence of [
    "Your Sacral center is defined.",
    "Nothing here is meant to advise you; exercise your own judgment.",
    "The surprise is welcome, and the analyses agree.",
    "A practice of waiting helps; you might fulfill it gently.",
  ]) {
    assert.equal(spellingProblem(reading(sentence)), null, sentence);
  }
});
