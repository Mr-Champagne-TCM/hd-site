import { test } from "node:test";
import assert from "node:assert/strict";
import {
  CHECKS,
  INTERPRETATION,
  SUMMARY_MARKER,
  TAKEAWAYS,
  brochureProblem,
  connectionProblem,
  draftProblem,
  motorProblem,
  trackEcho,
  trackRowProblem,
} from "../netlify/lib/interpretation.mjs";
import { LUNAR_FACT, structuredFacts } from "../netlify/lib/structured.mjs";

/**
 * THE 10/23 WORD-FOR-WORD READ OF ROUND rk-a3 (hd-e2e/verbatim-1023 M1, S9, N21, N22).
 * Wrong centre wiring the fact checks let through, brochure words, track rows that
 * only repeat their label, and Lunar authority's month. Every rule here was measured
 * on every stored draft (1,217: all AI test rounds, the A/B drafts, the rig's stored
 * readings, the phone's four and the library benchmarks) and on Jeremy's approved
 * lines, every hit read: 0 false (hd-e2e/ai-facts-1023/work). The sentences below are
 * the round's own, on its made-up charts.
 */

const section = (p, heading = INTERPRETATION[0]) => `${heading}\n\n${p}\n`;
const chart = (type, channels, more = {}) => ({ type, channels, ...more });
// rk-a3's charts (made-up births): the channels are all the wiring the checks read.
const R04 = chart("Generator", ["13-33 (The Prodigal)", "26-44 (Surrender)", "34-57 (Power)", "27-50 (Preservation)"]); // Throat+G | Heart+Sacral+Spleen
const R32 = chart("Generator", ["13-33 (The Prodigal)", "42-53 (Maturation)", "32-54 (Transformation)", "39-55 (Emoting)"]); // Throat+G | Sacral+Spleen+Solar Plexus+Root
const R18 = chart("Manifestor", ["4-63 (Logic)", "1-8 (Inspiration)", "21-45 (The Money Line)"]); // Head+Ajna | Throat+G+Heart
const R23 = chart("Projector", ["11-56 (Curiosity)", "25-51 (Initiation)"]); // Ajna+Throat | G+Heart
const R34 = chart("Manifestor", ["4-63 (Logic)", "13-33 (The Prodigal)", "7-31 (The Alpha)", "21-45 (The Money Line)", "39-55 (Emoting)"]);
const MG = chart("Manifesting Generator", ["20-34 (Charisma)", "13-33 (The Prodigal)"]); // Throat+G+Sacral

test("M1: motors said to reach a Throat no motor reaches are refused (R04, R32, rk-a R05, v3j R01)", () => {
  const r04 = "Your Throat center acts as the ultimate hub for expression and manifestation across your daily activities. Because this defined region connects directly to your motors and identity centers, your voice and physical actions carry weight and persistence.";
  assert.match(connectionProblem(section(r04), R04), /^The reading says the Throat is wired to motors in "Your energy, and how it starts", but the Throat is joined only to the G, and no motor reaches it: "Because this defined region connects directly to your motors/);
  // The same words on a Manifesting Generator, whose Sacral reaches the Throat, are true.
  assert.equal(connectionProblem(section(r04), MG), null);
  const r32 = "Your defined Throat center allows you to express your inner reality through voice and action, translating the power of your Sacral and Root motors into tangible results.";
  assert.match(connectionProblem(section(r32, INTERPRETATION[2]), R32), /the power of the Sacral and the Root reaches the Throat in "How you meet the world", but no channel of this chart joins them to the Throat/);
  assert.match(connectionProblem(section("Your defined Throat center takes the raw power from your Sacral center and gives it a voice through speech and action."), R04), /the power of the Sacral reaches the Throat/);
  assert.equal(connectionProblem(section("Your defined Throat center takes the vital force from your Sacral center and translates it into tangible words."), MG), null);
  assert.match(connectionProblem(section("Your Throat center is defined. This defined area translates the power from your motors into spoken words."), R04), /motor power reaches the Throat/);
  assert.match(connectionProblem(section("Your defined Throat center allows your voice to manifest clearly whenever your motor centers engage."), R04), /motor power reaches the Throat/);
  assert.match(connectionProblem(section("Your defined Root center continuously supplies mechanical stress and adrenaline. Working alongside your defined Throat center, this engine pushes you to manifest physical outcomes.", INTERPRETATION[3]), R32), /the Root works with the Throat in "What is consistently yours", but no channel of this chart joins the Root to the Throat/);
});

test("M1 (arms af-a/af-b): the Throat's vitality turned into words, and the same take-the-power claim moved to the G", () => {
  const R01 = chart("Generator", ["1-8 (Inspiration)", "10-57 (Perfected Form)", "6-59 (Intimacy)"]); // Throat+G+Spleen | Sacral+Solar Plexus
  // af-b R01: refused for the Throat, the part re-ask came back with the G -- no motor reaches either.
  assert.match(connectionProblem(section("Your defined G center channels that sacral power into outward expression and daily tasks."), R01), /^The reading says motor power reaches the G in "Your energy, and how it starts", but no motor of this chart is joined to the G: "/);
  assert.equal(connectionProblem(section("Your defined G center channels that sacral power into outward expression and daily tasks."), MG), null, "13-33 + 20-34: the G reaches the Sacral");
  // af-a R04: "This defined outlet" is the Throat of the sentence before.
  const r04 = "Because your Throat center stays colored in, your voice carries weight in any room you enter. This defined outlet ensures your vitality translates directly into tangible results whenever physical work meets your daily demands.";
  assert.match(connectionProblem(section(r04), R04), /motor power reaches the Throat .* the Throat is joined only to the G, and no motor reaches it/);
  assert.equal(connectionProblem(section(r04), MG), null);
  // Vitality on a Throat joined to the Spleen may be the Spleen's: not judged.
  assert.equal(connectionProblem(section("Your Throat center is defined, providing a direct channel to manifest your internal vitality into spoken words."), R01), null);
  assert.match(connectionProblem(section("Your Throat center is defined, providing a direct channel to manifest your internal life force into spoken words."), R04), /motor power reaches the Throat/);
});

test("M1: denials and a Manifestor's real motor pass; an Ego Projected voice carrying the Heart is not a wiring claim", () => {
  for (const p of [
    "Because your Projector type lacks a defined motor connected to the Throat, your energy moves in waves.",
    "Because your design operates without a motor connected to the Throat, stamina comes in waves.",
    "Your defined Ajna and Throat centers channel mental concepts directly into spoken words without relying on motor output to validate them.",
  ]) assert.equal(connectionProblem(section(p), R23), null, p);
  assert.equal(connectionProblem(section("Your Manifestor design gives you a powerful motor connected to the Throat, allowing your impact to manifest directly."), R18), null);
  assert.match(connectionProblem(section("Your design gives you a powerful motor connected to the Throat."), R23), /a motor is connected to the Throat .* the Throat is joined only to the Ajna, and no motor reaches it/);
  assert.equal(connectionProblem(section("Your voice carries the weight of your heart center's commitments.", INTERPRETATION[1]), R23), null);
});

test("M1: thoughts reaching words need the Ajna joined to the Throat (R18)", () => {
  const r18 = "Because your Throat center is defined, this mental processing finds a direct outlet into spoken words and manifested actions.";
  assert.match(connectionProblem(section(r18), R18), /says your thoughts reach your words directly in "Your energy, and how it starts", but no channel of this chart joins the Ajna to the Throat/);
  assert.match(connectionProblem(section("Because your Throat center is defined, your thoughts find a reliable bridge into expression.", INTERPRETATION[3]), R18), /your thoughts reach your words in "What is consistently yours", but no channel of this chart links the Ajna to the Throat/);
  assert.equal(connectionProblem(section(r18), R23), null, "11-56 joins them");
});

test("M1: a gap between two sides already joined is refused; between two parts of a split it passes (R23, R18)", () => {
  const r23 = "This mechanical layout means you often look outward for that missing link, relying on other people or shifting transits to bridge the gap between your conceptual mind and your expressive voice.";
  assert.match(connectionProblem(section(r23, "Your definition"), R23), /a gap lies between the Ajna and the Throat in "Your definition", but this chart's channels already join them/);
  const r18 = "This mechanical layout creates distinct islands that naturally seek transitional sparks to bridge the internal gap between your intellectual and motor centers.";
  assert.equal(connectionProblem(section(r18, "Your definition"), R18), null);
  assert.equal(connectionProblem(section("Because no channel connects them directly, other people naturally bridge the gap between your defined parts.", "Your definition"), R23), null);
  assert.equal(connectionProblem(section("Your Sacral and Solar Plexus connect directly, without any gaps between your Solar Plexus and your Root.", "Your definition"), R32), null);
});

test("N21: power from several centres needs two motors among them (R34)", () => {
  assert.match(connectionProblem(section("Because your Throat, G, and Heart are defined, you generate steady power from multiple centers."), R34), /says power comes from several centers in "Your energy, and how it starts", but of the Throat, the G and the Heart only the Heart is a motor/);
  assert.equal(connectionProblem(section("Because your Heart, Solar Plexus and Root are defined, you generate steady power from multiple centers."), R34), null);
});

test("M1: the Throat called the motor is refused with 'the' too; a motor outlet is what the Throat is", () => {
  assert.match(motorProblem(section("Your Throat center acts as the primary motor for your expression."), { definedCenters: ["Throat", "Ajna"] }), /calls the Throat a motor/);
  assert.equal(motorProblem(section("The defined Throat acts as a powerful motor outlet in your design."), { definedCenters: ["Throat", "Heart"] }), null);
  assert.equal(motorProblem(section("Your defined Throat center acts as the primary motor output for your design."), { definedCenters: ["Throat", "Root"] }), null);
});

test("S9: brochure words are refused; the words with real uses pass", () => {
  for (const [p, w] of [
    ["Gates 54, 53, 57 and 51 weave a fascinating tapestry of ambition.", "tapestry"],
    ["Because your design acts as a cosmic mirror for humanity, you take in every room.", "cosmic"],
    ["You sample the shifting weather of the cosmos.", "cosmos"],
    ["You witness the human drama with breathtaking objectivity and grace.", "breathtaking"],
    ["Your Sacral center acts as an inexhaustible engine.", "inexhaustible"],
  ]) assert.match(brochureProblem(section(p)), new RegExp(`^The reading uses "${w}" in "Your energy, and how it starts", a brochure word; it says the plain thing instead`), p);
  for (const p of [
    "Your unique way of answering shows up in the gut first.",
    "You remain the ultimate authority on what fits your life.",
    "Knowing this about yourself is a quiet superpower.",
    "By allowing time to work its magic, you see more of the picture.",
  ]) assert.equal(brochureProblem(section(p)), null, p);
  assert.ok(CHECKS.some(([name]) => name === "brochure"));
  assert.match(draftProblem(section("Your chart is a tapestry."), { type: "Generator" }), /brochure word/);
});

test("S9: a track row that only repeats its label and its feeling is refused; one with a day in it passes", () => {
  const rows = (on, off) => `${SUMMARY_MARKER}\n\nType: You run on a steady motor.\nStrategy: You answer what arrives.\nAuthority: Your gut answers first.\nProfile: You learn by trying.\nWhen it's on track: ${on}\nWhen it's off track: ${off}\n\n`;
  const okOff = "You wear yourself down forcing a door that will not open.";
  for (const echo of [
    "Surprise meets you when things are on track.",
    "Success greets you when it is on track.",
    "You experience success when your design is on track.",
    "Your experience of success reveals when you are on track.",
  ]) {
    assert.equal(trackEcho(echo), true, echo);
    assert.match(trackRowProblem(rows(echo, okOff)), /"When it's on track" line only repeats its label and its feeling/);
  }
  assert.match(trackRowProblem(rows("Satisfaction settles in once the day's work matches what your gut said yes to.", "Bitterness arises when you are off track.")), /"When it's off track" line only repeats its label/);
  for (const fine of [
    "You feel success when recognition arrives.",
    "Satisfaction settles in once the day's work matches what your gut said yes to.",
    "You meet life with genuine surprise.",
  ]) assert.equal(trackEcho(fine), false, fine);
});

test("N22: a Reflector's Lunar authority is a month in the facts, never twenty-four hours", () => {
  assert.match(structuredFacts({ type: "Reflector", authority: "Lunar" }), new RegExp(LUNAR_FACT.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(LUNAR_FACT, /about a month .* never twenty-four hours/);
  assert.doesNotMatch(structuredFacts({ type: "Generator", authority: "Sacral" }), /Lunar authority/);
});

test("Jeremy's approved lines pass every new rule (the home-page line and shape A's tails)", () => {
  const approved = [
    "(Defined Spleen center) Once or twice this week, when a sudden intuitive hunch tells you to take a different route home from the grocery store, you might follow that silent prompt immediately. Notice whether the alternative path feels naturally light, so that instant bodily trust is familiar when a heavier choice appears.",
    "(Sacral authority) This week, on small asks like a quick call, you might wait for your gut's sound before you answer. Notice which one comes, so the sound is familiar by the time a bigger ask arrives.",
    "(Channel 20-34) The next time an easy job gets a clear gut yes, you might go straight into it. Notice whether the energy feels absorbed or just busy, so you know the difference before more rides on it.",
    "(Undefined Solar Plexus) Once or twice this week, as you leave somewhere lively but easy, you might name your mood in one word. Notice how much of it stayed behind, so the same check is within reach after a tense conversation.",
  ];
  const block = `${TAKEAWAYS}\n\nThese are invitations to test, not instructions.\n\n${approved.join("\n\n")}\n`;
  for (const c of [R04, R18, R23, R32, R34, MG]) {
    assert.equal(connectionProblem(block, c), null);
    assert.equal(motorProblem(block, c), null);
  }
  assert.equal(brochureProblem(block), null);
});
