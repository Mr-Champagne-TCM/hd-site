import { test } from "node:test";
import assert from "node:assert/strict";
import { strategyProblem, READING_SCHEMA } from "../netlify/lib/structured.mjs";
import { chartFactsOnly, negatedAt, typeProblem } from "../netlify/lib/interpretation.mjs";

/**
 * THE INVITATION RULES, NARROWED (10/7). Seven of seventeen live 3.5 Flash
 * Lite drafts were refused for an invitation; four of those were honest:
 * the verb ("Your strategy invites you to...") and a denial ("without needing
 * to wait for an external invitation"). Both rules must still refuse what they
 * were built for: a non-Projector told to wait for, need, or be given one.
 */

const slot = (type, strategy, decide = "") =>
  strategyProblem({ summary: { strategy }, decide: { lede: decide, paragraphs: [] } }, type);

test("#4 STILL REFUSES what it was built for: a non-Projector's strategy is to wait for an invitation", () => {
  for (const [type, strategy, decide] of [
    ["Generator", "Wait for the right invitation."], // the #4 test case
    ["Manifesting Generator", "x.", "You decide once the invitation arrives."], // the #4 test case
    ["Generator", "Do not act until you are invited."], // a denial of ACTING, not of waiting
    ["Reflector", "Wait to be invited before you commit."],
    ["Manifestor", "Hold out for the invite."],
    ["Generator", "There is no rush, so wait for the invitation."], // the comma ends the denial
    ["Generator", "Wait for invitations, then respond."],
    ["Generator", "Never move before the invitation arrives."], // "before" keeps it a condition
  ]) {
    assert.match(slot(type, strategy, decide) ?? "", /invitation strategy/, `${type}: ${strategy} ${decide ?? ""}`);
  }
});

test("#4 NO LONGER REFUSES the verb or a denial (live 10/7)", () => {
  for (const [type, strategy, decide] of [
    // verbatim, live: Manifesting Generator Strategy line (twice), Reflector How you decide
    ["Manifesting Generator", "Your strategy invites you to wait for something to respond to before taking action, then inform those affected."],
    ["Manifesting Generator", "Your strategy invites you to wait for something in your outer world to arrive before you act."],
    ["Reflector", "x.", "Your Lunar authority invites you to take your time with major choices by discussing them."],
    ["Generator", "Each question invites your gut to answer."],
    ["Generator", "An open door invites you in; your Sacral decides."],
    ["Manifestor", "You never need an invitation; inform, then act."],
    ["Manifestor", "Unlike a Projector, you do not wait for an invitation."],
    ["Generator", "Respond to what arrives without waiting for an invitation."],
    // verbatim, live (final run): a Manifestor How you decide -- the verb, after a noun phrase
    ["Manifestor", "x.", "Rushing your process invites friction, whereas honoring your emotional wave lets you step forward."],
    ["Generator", "Your choices invite friction when the gut is skipped."],
    ["Projector", "Wait for the invitation."], // their own strategy
  ]) {
    assert.equal(slot(type, strategy, decide), null, `${type}: ${strategy} ${decide ?? ""}`);
  }
});

test("the text-level rules still refuse every phrasing they were built for", () => {
  for (const [type, line] of [
    // Jeremy's own paid reading, the original finding
    ["Manifesting Generator", "stop pushing against closed doors, and wait for a proper invitation to engage"],
    // the two F45 deliveries
    ["Generator", "Your Sacral will signal whether an invitation belongs to you."],
    ["Generator", "The Sacral requires an external invitation or encounter to spark into motion."],
    // live 10/7, both true refusals
    ["Generator", "Frustration is a cue to pause, step back, and wait for a proper invitation to respond."],
    ["Manifesting Generator", "This engine thrives on engagement, yet it requires an external invitation or stimulus to unlock its true power."],
    ["Generator", "Do not move until you are invited."],
  ]) {
    assert.match(typeProblem(line, type) ?? "", /Projector strategy/, line);
  }
});

test("the text-level rules let a DENIED invitation through (live 10/7, a Manifestor)", () => {
  for (const [type, line] of [
    ["Manifestor", "You carry an initiating force designed to move things forward without needing to wait for an external invitation."],
    ["Generator", "You do not need to wait for an invitation."],
    ["Manifestor", "You never wait for an invitation to begin."],
    ["Reflector", "Nothing here requires an invitation; the lunar month is your clock."],
  ]) {
    assert.equal(typeProblem(line, type), null, line);
  }
});

test("'without waiting' after a forcing verb is a scolding, refused for all but a Manifestor (live 10/7)", () => {
  // verbatim, live: a Generator and a Manifesting Generator -- both true refusals
  for (const [type, line] of [
    ["Generator", "Frustration shows up with irritation when you push forward without waiting for a proper invitation."],
    ["Manifesting Generator", "You meet frustration and resistance when you try to force things without waiting for an invitation."],
    ["Reflector", "Disappointment follows when you rush ahead instead of waiting for an invitation."],
  ]) {
    assert.match(typeProblem(line, type) ?? "", /Projector strategy/, line);
  }
  // verbatim, live: a Manifestor, three times -- right for a Manifestor
  for (const line of [
    "You are built to initiate impact directly without waiting for an outside invitation.",
    "Your energy is designed to move and impact your surroundings without waiting for an outside invitation.",
  ]) {
    assert.equal(typeProblem(line, "Manifestor"), null, line);
  }
  // no forcing verb: a plain denial still passes for a Generator
  assert.equal(typeProblem("Respond to what arrives without waiting for an invitation.", "Generator"), null);
});

test("'pause for an invitation' is the Projector strategy too (live 10/7, a Generator takeaway)", () => {
  const live = "(Sacral center) Watch what happens when you pause for an invitation instead of initiating action out of mental pressure.";
  assert.match(typeProblem(live, "Generator") ?? "", /Projector strategy/);
  assert.equal(typeProblem(live, "Projector"), null);
});

test("the 2 line is called out whatever the type (live 10/7, a Reflector 6/2 takeaway)", () => {
  const live = "(Profile 6/2) Watch what happens when you step back and let your natural talents remain quiet until invited.";
  assert.equal(typeProblem(live, "Reflector"), null);
  assert.equal(typeProblem("Your 2/4 profile keeps talent quiet until you are invited out.", "Generator"), null);
  assert.equal(typeProblem("As the Hermit line, you wait to be invited out.", "Manifestor"), null);
  // Only that sentence: the next one is judged on its own.
  assert.match(typeProblem("Wait until invited. Your Line 2 talent is quiet.", "Reflector") ?? "", /Projector strategy/);
  assert.match(typeProblem("Do not move until you are invited.", "Generator") ?? "", /Projector strategy/);
});

test("negatedAt: one clause, and a condition keeps the mention live", () => {
  const at = (s, w) => negatedAt(s, s.indexOf(w), s.indexOf(w) + w.length);
  assert.equal(at("You never need an invitation.", "invitation"), true);
  assert.equal(at("No rush, wait for the invitation.", "invitation"), false);
  assert.equal(at("Do not act until you are invited.", "until you are invited"), false);
  assert.equal(at("Don't wait for an invitation.", "invitation"), true);
  assert.equal(at("Don’t wait for an invitation.", "invitation"), true);
  assert.equal(at("Wait for an invitation.", "invitation"), false);
});

test("FORM-MODE FACTS say on track / off track; letter mode keeps the old lines; the values are the same", () => {
  const out = { type: "Projector", signature: "Success", notSelfTheme: "Bitterness" };
  const form = chartFactsOnly(out, { form: true });
  assert.match(form, /^When it's on track, the feeling is: Success$/m);
  assert.match(form, /^When it's off track, the feeling is: Bitterness$/m);
  assert.doesNotMatch(form, /Signature|Not-Self/);
  const letter = chartFactsOnly(out);
  assert.match(letter, /^Signature: Success$/m);
  assert.match(letter, /^Not-Self Theme: Bitterness$/m);
  // Nothing else moved: the two outputs differ in exactly those two lines.
  const diff = form.split("\n").filter((l, i) => l !== letter.split("\n")[i]);
  assert.equal(diff.length, 2);
});

test("the two summary slots named after the old words carry the note; the rest do not", () => {
  const p = READING_SCHEMA.properties.summary.properties;
  for (const k of ["signature", "notSelf"]) assert.match(p[k].description, /Never the words "signature" or "not-self"/);
  for (const k of ["type", "strategy", "authority", "profile"]) assert.equal(p[k].description, "ONE sentence, at most 22 words.");
});
