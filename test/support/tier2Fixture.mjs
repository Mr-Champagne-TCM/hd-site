/**
 * A STAND-IN FOR WHAT GEMINI RETURNS, shaped exactly as the prompt demands and
 * written to be READ.
 *
 * The first version of this file was `clause 1 runs on long enough that...`
 * repeated to the right word count. It measured the layout correctly and was
 * useless to review: Jeremy read the PDF and asked, reasonably, "what is clause
 * 1?" A fixture nobody can read makes a reviewer squint past the very thing
 * they were asked to look at.
 *
 * So this is plausible prose for the chart it belongs to -- Manifesting
 * Generator, 2/4, Sacral authority, Throat and Sacral defined, channel 20-34.
 * It is NOT approved copy and it is not what a buyer receives. It exists so a
 * page of this document looks like a page of this document.
 */

const S = [
  "IN SHORT",
  "",
  "Type: You carry a motor that renews itself overnight, as long as it spends itself on the right things.",
  "Strategy: Let the question arrive first — the gut answers before the mind can argue with it.",
  "Authority: The body reports before language does, and it does not need a second opinion.",
  "Profile: Time alone is not withdrawal here; it is where the thing worth being called out for gets made.",
  "Signature: A day that landed somewhere it belonged settles in the body rather than in the thoughts.",
  "Not-self: A grinding, abrasive stuckness is the sign that something started before it was met.",
  "",
  "Your incarnation cross",
  "",
  "Carrying the Right Angle Cross of Eden (6/36 | 12/11), you move between intimacy and friction, " +
    "stillness and crisis. Gate 6 governs the wall between one person and another and when it opens; " +
    "gate 36 carries the appetite for new experience that keeps testing it. With 12 and 11 beneath them, " +
    "the theme is finding language for what has been lived rather than for what has only been imagined.",
  "",
  "Your definition",
  "",
  "Operating with a Single definition, everything defined in you connects into one unbroken run — " +
    "Throat to Sacral through channel 20-34, with nothing stranded on the far side of a gap. " +
    "Nobody else is needed to close a circuit for you, which is why your processing tends to be quick, " +
    "self-contained, and slightly impatient with being talked through.",
  "",
  "Your channels",
  "",
  "20-34 (Charisma), Throat to Sacral: Doing and saying arrive together here, so what you commit to " +
    "tends to be underway before it has been announced.",
  "",
  "Your profile lines",
  "",
  "Line 2 (Hermit), conscious: A natural aptitude sits in you largely unexamined, and it is other " +
    "people calling for it, rather than your own plans, that draws it out.",
  "",
  "Line 4 (Opportunist), unconscious: What comes to you travels through people you already know, " +
    "which makes the network itself the thing worth tending.",
  "",
];

const SECTIONS = [
  [
    "Your energy, and how it starts",
    "Running from a defined Sacral straight to the Throat, your energy starts with a physical yes rather than a plan.",
    [
      "Because your Sacral centre is defined, you carry a motor that generates rather than borrows. " +
        "It builds over a day and renews overnight, and what refills it is work that actually matched " +
        "its appetite. The distinction that matters is not busy against idle — it is whether the thing " +
        "you spent yourself on was one you responded to, or one you talked yourself into.",
      "With channel 20-34 joining that motor to your Throat, there is no gap between deciding and " +
        "moving. Manifesting Generator energy skips steps other people take in order, and it is not " +
        "carelessness: the route simply is shorter. What it costs is that a start is often already " +
        "underway before anyone else has been told it is happening.",
    ],
  ],
  [
    "How you decide",
    "Sacral authority answers in the body, in the moment, before language has caught up.",
    [
      "Your authority is the Sacral, which means the answer arrives as energy rather than as a " +
        "conclusion. Something rises toward a thing or goes flat in front of it, and that reading is " +
        "available immediately — there is no wave to wait out. The difficulty is rarely hearing it. " +
        "It is that reasoning arrives a second later, sounds more articulate, and can talk over it.",
      "Because nothing in your design decides slowly, a long deliberation is usually a sign the gut " +
        "already answered and was overruled. The practical form of this is small: notice what the body " +
        "did in the first second, before the sentence explaining it. On a chart with no Solar Plexus " +
        "defined, waiting for emotional clarity is waiting for a signal that is not coming.",
    ],
  ],
  [
    "How you meet the world",
    "The fourth line means influence moves through people you already know rather than through strangers.",
    [
      "Your 4 line works from a base of existing relationships. Opportunity arrives through the people " +
        "already around you, and the network is less a strategy than the actual mechanism — which is " +
        "why letting it go quiet costs more here than it would on another profile.",
      "Paired with the 2, this makes an unusual shape: the aptitude develops in private and the " +
        "opening arrives socially. Neither half works alone. Solitude with no network leaves it " +
        "unfound; a network with no solitude leaves nothing worth calling out.",
    ],
  ],
  [
    "What is consistently yours",
    "Your Throat and Sacral are fixed, which makes expression and life force the two things that do not change with company.",
    [
      "Defined centres do not fluctuate. Your Sacral and your Throat are yours in every room, which " +
        "means the capacity to work and the capacity to voice are reliable — you can be counted on " +
        "for both, including by yourself.",
      "This is also what other people feel most immediately from you. A defined Sacral is amplified " +
        "by anyone open in that centre nearby, so your ordinary working pace can register as " +
        "considerable drive to somebody standing next to it.",
    ],
  ],
  [
    "What you take in from others",
    "Seven open centres mean most of what you feel in a room arrives from the room.",
    [
      "With Head, Ajna, G, Heart, Spleen, Solar Plexus and Root all open, you take in and amplify " +
        "what is around you. An open Solar Plexus reads a room's mood as though it were your own; an " +
        "open Root borrows its pressure to hurry. Neither began with you, and both leave when you do.",
      "Openness is not deficiency. It is where you take in the most and see the most — an open Ajna " +
        "can hold a question without needing to settle it. The trouble is only ever mistaking the " +
        "borrowed for the built-in, which is why noticing what changes when you leave a room is worth " +
        "more here than any amount of analysis inside it.",
    ],
  ],
  [
    "When it is working, and when it is not",
    "Satisfaction and frustration are two readings on the same instrument, and both are information.",
    [
      "Satisfaction is the signature of a Generator design, and it is bodily rather than mental — " +
        "the settling at the end of a day whose energy went somewhere it belonged. It follows having " +
        "responded, not having achieved.",
      "Frustration is the other end of the same dial. It shows up when energy was committed to " +
        "something it was not met by: a start made from an idea rather than a response. Read as a " +
        "verdict it is discouraging; read as an instrument it is precise, and it points at the moment " +
        "the gut was overruled rather than at anything about you.",
    ],
  ],
];

const TAKEAWAY_BLOCK = [
  "Things to experiment with",
  "",
  "These are invitations to test against your own experience rather than instructions, and you remain " +
    "the authority on what fits and what does not.",
  "",
  "(Sacral authority) Notice what the body does in the first second after a question, before any reasoning arrives.",
  "",
  "(Channel 20-34) Watch what happens when speaking and doing arrive together rather than one after the other.",
  "",
  "(Open Solar Plexus) Notice how a room's mood reads as your own while you are in it, and how it changes once you leave.",
  "",
  "(Profile line 4) Watch where opportunity actually arrives from over a month, and how much of it comes through people you already know.",
  "",
  "This reading describes a Human Design chart and is offered for self-reflection. It is not medical, " +
    "psychological, legal or financial advice, and it does not predict the future.",
];

export const TEXT = [
  ...S,
  ...SECTIONS.flatMap(([heading, lede, paras]) => [heading, "", lede, "", ...paras.flatMap((p) => [p, ""])]),
  ...TAKEAWAY_BLOCK,
].join("\n");
