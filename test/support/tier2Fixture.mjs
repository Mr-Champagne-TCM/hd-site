/**
 * A stand-in for what Gemini returns, shaped exactly as the prompt demands.
 * Placeholder wording -- this exists to test LAYOUT, not to be read.
 */
// The prompt specifies 60-75 words per body paragraph. A fixture fatter than
// that measures a document nobody will ever be handed.
const P = (n) =>
  Array.from({ length: n }, (_, i) =>
    `Because your Sacral centre is defined, clause ${i + 1} runs on long enough that the measured height matches a real paragraph rather than a short one.`,
  ).join(" ");

export const READING = [
  "IN SHORT",
  "",
  "Type: You carry a motor that renews itself overnight, as long as it spends itself on the right things.",
  "Strategy: Let the question arrive first, and the gut answers before the mind can argue with it.",
  "Authority: The body reports before language does, and it does not need a second opinion.",
  "Profile: Time alone is not withdrawal here; it is where the thing worth being called out for is made.",
  "Signature: A day that landed somewhere it belonged settles in the body rather than in the thoughts.",
  "Not-self: A grinding, abrasive stuckness is the sign that something started before it was met.",
  "",
  "Your incarnation cross",
  "",
  `Carrying the Right Angle Cross of Eden (6/36 | 12/11), you navigate the friction between peace and crisis, intimacy and variety. ${P(1)}`,
  "",
  "Your definition",
  "",
  `Operating with a Single definition, all your defined parts connect into one continuous stream without any gaps. ${P(1)}`,
  "",
  "Your channels",
  "",
  "20-34 (Charisma), Throat to Sacral: Operating as a powerhouse of pure doing, your actions spring instantly from physical vitality when the moment is right.",
  "",
  "Your profile lines",
  "",
  "Line 2 (Hermit), conscious: Natural gifts live inside you quietly, resting until the right call coaxes them out into the light.",
  "",
  "Line 4 (Opportunist), unconscious: Influence travels naturally through your existing network of friends, acquaintances, and communities.",
  "",
];

const LEDES = [
  "Spanning from a powerful motor directly to the voice, your energy ignites through a physical yes rather than mental planning.",
  "Waiting for the body to answer physically keeps your decisions aligned with your actual capacity and truth.",
  "Meeting people through the network you already have is how your particular kind of impact travels.",
  "What is defined in you never changes, and it is the ground everything else is measured against.",
  "Your open centres take in what is around you, amplify it, and hand it back as though it were yours.",
  "Satisfaction and frustration are the two readings on the same instrument, and both are information.",
];

const HEADINGS = [
  "Your energy, and how it starts",
  "How you decide",
  "How you meet the world",
  "What is consistently yours",
  "What you take in from others",
  "When it is working, and when it is not",
];

HEADINGS.forEach((h, i) => {
  READING.push(h, "", LEDES[i], "", P(3), "", P(3), "");
});

READING.push(
  "Things to experiment with",
  "",
  "These are invitations to test against your own experience rather than instructions, and you remain the authority on what fits and what does not.",
  "",
  "(Sacral authority) Notice what the body does in the first second after a question, before any reasoning arrives.",
  "",
  "(Channel 20-34) Watch what happens when speaking and doing arrive together rather than one after the other.",
  "",
  "(Open Solar Plexus) Notice how a room's mood reads as your own while you are in it, and how it changes once you leave.",
  "",
  "(Profile line 4) Watch where opportunity actually arrives from over a month, and how much of it comes through people you already know.",
  "",
  "This reading describes a Human Design chart and is offered for self-reflection. It is not medical, psychological, legal or financial advice, and it does not predict the future.",
);

export const TEXT = READING.join("\n");
