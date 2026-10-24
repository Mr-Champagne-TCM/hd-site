import { test } from "node:test";
import assert from "node:assert/strict";
import { INTERPRETATION, connectionProblem } from "../netlify/lib/interpretation.mjs";

/**
 * GROUPED SENTENCES (10/24). The 10/23 Claude rounds (hd-e2e/ai-test-claude-1023 c1, t1-t45; hd-e2e/ai-opus-1023
 * op1) had first drafts refused for sentences that are right: a list of centres on one side, several channels, or two
 * claims in one sentence, read as "1-8 joins the G and the Heart". Each sentence below is the round's own (the cut
 * ones finished from the same chart's facts), on the round's made-up chart; a wrong claim is still refused.
 */

const section = (p, heading = "Your definition") => `${heading}\n\n${p}\n`;
const chart = (type, channels) => ({ type, channels });
// rk-a3's charts (made-up births), as the rounds wrote for them.
const R01 = chart("Generator", ["1-8", "10-57", "6-59"]); // G+Throat+Spleen | Sacral+Solar Plexus
const R04 = chart("Generator", ["13-33", "26-44", "34-57", "27-50"]); // Throat+G | Heart+Sacral+Spleen
const R05 = chart("Generator", ["47-64", "16-48", "2-14", "29-46", "10-34"]); // Head+Ajna | Throat+Spleen | G+Sacral
const R06 = chart("Generator", ["17-62", "10-34", "10-57", "34-57", "9-52", "32-54", "18-58"]); // Ajna+Throat | G+Sacral+Spleen+Root
const R08 = chart("Manifesting Generator", ["47-64", "7-31", "10-34", "6-59"]); // Head+Ajna | G+Throat+Sacral+Solar Plexus
const R09 = chart("Manifesting Generator", ["13-33", "7-31", "29-46", "37-40", "30-41"]); // G+Throat+Sacral | Solar Plexus+Heart+Root
const R10 = chart("Manifesting Generator", ["17-62", "10-20", "20-57", "20-34", "10-34", "10-57", "34-57", "32-54", "18-58"]);
const R12 = chart("Manifesting Generator", ["47-64", "21-45", "2-14", "26-44"]); // Head+Ajna | Throat+Heart+Spleen | G+Sacral
const R13 = chart("Manifestor", ["47-64", "24-61", "4-63", "11-56", "12-22", "37-40", "28-38", "18-58"]);
const R18 = chart("Manifestor", ["4-63", "1-8", "21-45"]); // Head+Ajna | Throat+G+Heart
const R24 = chart("Projector", ["47-64", "23-43", "25-51"]); // Head+Ajna+Throat | G+Heart
const R25 = chart("Projector", ["23-43", "1-8"]); // Ajna+Throat+G

test("grouped sentences that are right pass (the Claude rounds' first drafts)", () => {
  for (const [p, c] of [
    ["Channels 1-8 and 21-45 join your G and Heart to your Throat.", R18],
    ["Channels 1-8 and 21-45 tie your G and Heart centers to your Throat.", R18],
    ["Separately, channels 1-8 and 21-45 tie your G and Heart to the Throat.", R18],
    ["Channels 1-8 and 21-45 join the G and Heart to the Throat.", R18],
    ["Channel 4-63 joins your Head and Ajna; channels 1-8 and 21-45 link your G and Heart to your Throat.", R18],
    ["Your Head and Ajna join through Channel 4-63, while the Throat links to the G and Heart through channels 1-8 and 21-45.", R18],
    ["The G, Throat and Spleen link through channels 1-8 and 10-57, while the Sacral and Solar Plexus join through 6-59.", R01],
    ["The G, Throat and Spleen connect through channels 1-8 and 10-57.", R01],
    ["Your Head and Ajna are joined by 47-64, Throat and Spleen joined by 16-48, and G and Sacral joined by three channels.", R05],
    ["Your G, Throat and Sacral link through channels 13-33, 7-31 and 29-46; the Solar Plexus, Heart and Root link through 37-40 and 30-41.", R09],
    ["Your G, Throat and Sacral link through channels 13-33, 7-31 and 29-46.", R09],
    ["Solar Plexus, Heart and Root are joined by 37-40 and 30-41.", R09],
    ["Your G, Throat and Sacral link through channels 29-46, 7-31 and 13-33, while your Solar Plexus, Heart and Root are tied by 37-40 and 30-41.", R09],
    ["Your Ajna and Throat connect through 17-62, while the G, Sacral and Spleen link with the Root through several channels.", R06],
    ["In the second, your G, Sacral and Spleen connect with the Root through channels such as 10-34 and 18-58.", R06],
    ["A second group joins the G center to the Throat and Sacral, with the Solar Plexus tied to the Sacral by 6-59.", R08],
    ["Separately, channels 26-44, 34-57 and 27-50 tie your Heart and Sacral to your Spleen.", R04],
    ["Channels 26-44, 34-57 and 27-50 join your Heart and Sacral centers to your Spleen.", R04],
    ["Because your Heart connects to your Throat by way of your Solar Plexus, through channels 37-40 and 12-22, you can speak from feeling.", R13],
    ["Your Ajna and G have something to share, but they are not motors; they connect your G and Ajna to your Throat for expression through 1-8 and 23-43.", R25],
    ["The Sacral, Spleen and Throat are joined through channels like 20-34 and 34-57.", R10],
    ["The G, Ajna and Root link into this line through channels 10-34, 17-62 and 18-58.", R10],
    ["You have sustaining Sacral energy plus a Heart wired straight to your Throat, so you can move fast on several tracks.", R12],
    // A number before its own claim (c1 R08, delivered).
    ["In the second group, channel 7-31 ties your G center to the Throat, channel 10-34 ties the G to the Sacral, and channel 6-59 joins the Sacral to the Solar Plexus.", R08],
  ]) assert.equal(connectionProblem(section(p), c), null, p);
});

test("a grouped sentence that names a channel joining other centres is still refused", () => {
  // 25-51 joins the G and the Heart; 1-8 the G and the Throat. Nothing in the sentence joins the Heart to the Throat.
  assert.match(
    connectionProblem(section("Channels 25-51 and 23-43 join your Heart and Ajna to your Throat."), R24),
    /^The reading says Channel 25-51 joins the Heart and the Throat in "Your definition"; it joins the G and the Heart: "/,
  );
  // The list's channels do not link the Throat and the Spleen (16-48 is the chart's, but not in the sentence).
  assert.match(
    connectionProblem(section("The G, Throat and Spleen link through channels 1-8 and 34-57."), chart("Generator", ["1-8", "34-57", "16-48"])),
    /^The reading says Channel 1-8 joins the G and the Spleen in "Your definition"; it joins the G and the Throat: "/,
  );
  // A channel the chart does not have, in a list.
  assert.match(
    connectionProblem(section("Channels 1-8 and 21-45 join your G and Heart to your Throat."), chart("Projector", ["1-8", "25-51"])),
    /^The reading wires the Heart and the Throat through Channel 21-45 in "Your definition", a channel this chart does not have: "/,
  );
  // The old shapes, one pair, one number.
  assert.match(
    connectionProblem(section("Because your Heart center connects to your Throat center through the 25-51 channel, your voice carries the direct force of your personal will.", INTERPRETATION[1]), R24),
    /^The reading says Channel 25-51 joins the Heart and the Throat in "How you decide"; it joins the G and the Heart: "/,
  );
  assert.match(
    connectionProblem(section("The steady drive found in your Sacral center connects to your Throat center through Channel 2-14.", INTERPRETATION[0]), R12),
    /^The reading says Channel 2-14 joins the Sacral and the Throat in "Your energy, and how it starts"; it joins the G and the Sacral: "/,
  );
  // A list to a centre no channel of the chart links ("such as" lets the chart answer, and it says no).
  assert.match(
    connectionProblem(section("Your G, Sacral and Spleen connect with the Throat through channels such as 10-34 and 18-58."), R06),
    /^The reading says Channel 10-34 joins the G and the Throat in "Your definition"; it joins the G and the Sacral: "/,
  );
  // Without numbers: each of the list, to the object, on the chart.
  assert.match(
    connectionProblem(section("Your G, Sacral and Spleen link with the Ajna."), R06),
    /^The reading says the G and the Ajna connect in "Your definition", but no channel of this chart links them: "/,
  );
});

test("the old wrong shapes the lists change nothing for", () => {
  // rk-a R01, a bench draft: "<two centres> join this engine", no number: judged as the pair, as before.
  assert.match(
    connectionProblem(section("Your defined G and Solar Plexus centers join this vital engine to radiate active momentum that others readily notice.", INTERPRETATION[0]), R01),
    /^The reading says the G and the Solar Plexus connect in "Your energy, and how it starts", but no channel of this chart links them: "/,
  );
  assert.match(
    connectionProblem(section("Because your Throat center connects directly to the Heart center, your spoken words carry the exact commitments.", INTERPRETATION[1]), chart("Projector", ["11-56", "25-51"])),
    /^The reading says the Throat and the Heart connect directly in "How you decide", but no channel of this chart joins them: "/,
  );
  // A list after "directly": every one of them (v3p R24, v3t2 R06; the G is in another part of the chart).
  assert.match(
    connectionProblem(section("Because your defined Throat center connects directly to your Ajna and G centers, your expression carries conceptual clarity.", INTERPRETATION[2]), R24),
    /^The reading says the Throat and the G connect directly in "How you meet the world", but no channel of this chart joins them: "/,
  );
  // Names joined by a comma alone are not a list.
  assert.equal(connectionProblem(section("Beyond your defined Throat, your G links to your Sacral through 2-14."), R12), null);
});
