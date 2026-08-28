function describe(map, value) {
  if (!value) return null;
  return map[value.trim()] ?? null;
}
const TYPE_NOTES = {
  Generator: "Your Sacral centre is defined, which means you carry a consistent, renewable kind of energy \u2014 the sort that builds over a day rather than arriving in bursts. It responds to what is already in front of you rather than initiating from nothing.",
  "Manifesting Generator": "You have a Generator's consistent Sacral energy with a Manifestor's directness attached to it. That combination tends to move in several directions at once and to skip steps other people take in order.",
  Manifestor: "Your energy initiates. It arrives in its own time rather than building steadily, and it is designed to start things rather than to respond to them \u2014 which is why it affects the people around you before they have been told.",
  Projector: "You have no defined Sacral, so your energy is not the consistent kind. What you have instead is the ability to see how other people's energy actually works, which is a different capacity and not a smaller one.",
  Reflector: "Every one of your centres is open, which is rare. You take on and reflect back the energy of whatever room you are in, so what you experience shifts with your company and your surroundings rather than staying fixed."
};
const STRATEGY_NOTES = {
  "Wait to respond": "Your energy engages with something that already exists \u2014 a question, an offer, a situation \u2014 rather than with an idea in your own head. The response comes first, and the decision follows it.",
  "Wait to respond, then inform": "The response comes first, as with any Generator. The informing is the Manifestor half: telling people before you move, because your movement lands on them whether or not they were expecting it.",
  "Inform before acting": "Your energy initiates, which means it arrives in other people's lives without warning. Saying what you are about to do is not permission-seeking; it is the thing that stops the impact being a surprise.",
  "Wait for the invitation": "Recognition is the mechanism. Being seen and asked is what lets your particular way of seeing land somewhere it can be used, rather than being offered where it was not wanted.",
  "Wait a lunar cycle": "You take on the energy around you, so a decision made on one day is not made from the same place as the same decision a week later. A full cycle lets you see it from every position before it settles."
};
const AUTHORITY_NOTES = {
  Emotional: "Your Solar Plexus is defined, which means you move through an emotional wave rather than sitting at one level. There is no truthful moment in that wave \u2014 clarity comes from having been through it, which takes whatever time it takes.",
  Sacral: "Your Sacral responds in the moment and it responds in the body, before language arrives. It is a yes or a no that shows up as energy rising or going flat, rather than as a conclusion you reasoned your way to.",
  Splenic: "Your Spleen speaks once, quietly, and in the present tense. It does not repeat itself and it does not argue \u2014 which is why it is easy to talk yourself past, and why it is described as the quietest of the authorities.",
  Ego: "Your Heart centre is defined and connected to the Throat. What is true for you here is what you actually have the will for, which is a question about wanting rather than about should.",
  "Self-Projected": "Your G centre reaches your Throat, so your direction becomes clear when you hear yourself say it. Talking it out with somebody who will listen without steering is the mechanism, not a preference.",
  Mental: "You have no inner authority that settles this on its own. Clarity comes from talking through a decision in the company of people you trust, using them as a sounding board rather than as advisors.",
  "Lunar": "As a Reflector, what is true for you moves with your surroundings. A full lunar cycle gives a decision the time to be seen from every angle before it is made."
};
const PROFILE_NOTES = {
  "1": "The first line investigates. It wants the ground under a thing before it will stand on it, and it is uncomfortable being asked to act before it has looked.",
  "2": "The second line is natural at something and largely unaware of it. It needs time alone for that to work, and it tends to be called out of that solitude by other people rather than by its own plans.",
  "3": "The third line finds out by trying. What looks like a series of mistakes from outside is the method working \u2014 it is discovering what does not hold, which is not the same as failing.",
  "4": "The fourth line works through the people it already knows. Opportunity arrives through that network rather than through strangers, which is why the network itself is the thing being tended.",
  "5": "The fifth line gets projected onto. People see a solution in it, sometimes accurately and sometimes not, and its reputation runs slightly ahead of it in either direction.",
  "6": "The sixth line lives in three parts \u2014 a trial-and-error start, a long look from the sidelines, and then a return. Which part it is in matters more than the number."
};
const SIGNATURE_NOTES = {
  Satisfaction: "The sense that the day's energy went somewhere it belonged. It is a bodily settling rather than a thought about how things went.",
  Peace: "A quiet that arrives when nothing is being pushed against. Not achievement \u2014 the absence of resistance.",
  Success: "The feeling of having been seen and used well. It follows recognition rather than effort, which is why it cannot be manufactured by working harder.",
  Surprise: "Delight at what a day turned out to hold. For an entirely open design, no two days are the same, and that is the point rather than the problem."
};
const NOT_SELF_NOTES = {
  Frustration: "The signal that energy went into something it was not met by. It shows up when action started before there was anything to respond to.",
  Anger: "The signal that arrives when a move landed on people who had not been told. It is about the informing, not about the move.",
  Bitterness: "The signal of effort spent where it was not invited. It follows work offered rather than asked for.",
  Disappointment: "The signal of having been shaped by the wrong surroundings. For an open design it is about company and place more than about events."
};
export {
  AUTHORITY_NOTES,
  NOT_SELF_NOTES,
  PROFILE_NOTES,
  SIGNATURE_NOTES,
  STRATEGY_NOTES,
  TYPE_NOTES,
  describe
};
