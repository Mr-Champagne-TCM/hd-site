/**
 * WHAT A CUSTOMER READS WHEN SOMETHING DID NOT GO TO PLAN.
 *
 * Jeremy, 10/16: "errors on our side should not look like errors to the
 * customer." Every sentence a buyer can be shown on a failure path lives here,
 * once, under a key -- the server sends the key and the words, and the page
 * falls back to the same words when the server could not answer at all.
 *
 * THE RULES EVERY ENTRY KEEPS
 *
 *   Plain words. No codes, no "timezone name", no "HH:MM", no stack trace.
 *   Never blame. "That's on our side" when it is; nothing at all about whose
 *     fault it is when it is the customer's typo.
 *   Invitations, not commands (his pillar). "Another try in a minute usually
 *     works", never "Try again".
 *   Always a next step, and the money stated plainly whenever money is in play.
 *
 * `act` says whether the CUSTOMER has something to do (a mistyped date) or
 * whether this is ours to carry and they need not think about it.
 *
 * Kept free of anything server-only so the page can import it (src/) as well
 * as the functions (netlify/).
 */

export const CONTACT = "hd-readings@thechampagnemethod.co";

export const MESSAGES = {
  // --- buying ---------------------------------------------------------------
  "checkout-unavailable": {
    act: false,
    text: "The payment page didn't open just now. Nothing was charged, and another try in a minute usually works.",
  },
  "checkout-not-offered": {
    act: false,
    text: "That one isn't on offer, so nothing was charged. The readings that are on offer are on the home page whenever you'd like them.",
  },
  "checkout-not-yet": {
    act: false,
    text: "That one is not ready to buy yet. Nothing was charged — the summary is available now.",
  },

  // --- coming back from Stripe ------------------------------------------------
  "claim-confirm-later": {
    act: false,
    heading: "Your purchase is safe",
    text:
      `Your purchase couldn't be confirmed just now — that's on our side. If you were charged, it is safe: ` +
      `reloading this page in a minute usually confirms it, and your link comes by email too. ` +
      `${CONTACT} reaches Jeremy.`,
  },
  "claim-not-found": {
    act: false,
    heading: "Your purchase is safe",
    text: `That purchase couldn't be found from this page. If you were charged, ${CONTACT} reaches Jeremy and he'll sort it out.`,
  },
  "claim-not-paid": {
    act: false,
    text: "That purchase hasn't completed, so nothing was charged. The readings are on the home page whenever you'd like them.",
  },
  "purchase-safe-setup-pending": {
    act: false,
    heading: "Your purchase is safe",
    text:
      `Your payment went through and your purchase is safe. Your reading page is still being set up on our side — ` +
      `Jeremy has been told, and your link will reach you by email. ${CONTACT} reaches him any time.`,
  },

  // --- the birth-details form -----------------------------------------------
  "chart-check-date": {
    act: true,
    text: "That birth date doesn't look quite right. Could you check the day, month and year? Everything else can stay as it is.",
  },
  "chart-check-time": {
    act: true,
    text:
      "That birth time doesn't look quite right. Could you check it? If the time isn't known, " +
      "“I don't know my birth time” is a perfectly good answer.",
  },
  "chart-check-place": {
    act: true,
    text: "That birth place didn't come through. Could you pick the town from the list once more?",
  },
  "chart-form-unreadable": {
    act: false,
    text: "That didn't come through properly. Nothing was charged, and another try usually works.",
  },
  "chart-slow-free": {
    act: false,
    text:
      "Something on our side is slow right now, so your chart didn't come through. Nothing was charged, " +
      "and your details are still in the form — another try in a minute usually works.",
  },
  "chart-slow-paid": {
    act: false,
    text:
      "Something on our side is slow right now. Your purchase is safe, and your details are still in the form — " +
      `another try in a minute usually works. Jeremy has been told. ${CONTACT} reaches him.`,
  },
  "chart-not-saved": {
    act: false,
    text:
      "Your chart was drawn, but saving it didn't finish on our side. Your purchase is safe and your details " +
      `are still in the form — another try in a minute usually works. Jeremy has been told. ${CONTACT} reaches him.`,
  },
  "chart-payment-required": {
    act: false,
    text:
      "This one needs to be paid for first. Nothing was charged just now, and your birth details were not stored. " +
      "The readings, and what each one includes, are on the home page whenever you'd like them.",
  },
  // The text is written by ratelimit.mjs (it names the wait); this is the key.
  "chart-too-many": { act: false, text: null },

  // --- the town search ------------------------------------------------------
  "places-unavailable": {
    act: false,
    text:
      "Town search isn't answering just now — that's on our side, not your spelling. " +
      "It usually comes back within a minute, and everything else you've entered is kept.",
  },
  "places-too-many": {
    act: false,
    text:
      "That is a great many place searches in an hour. Nothing is wrong and nothing was charged — it clears on its own shortly.",
  },

  // --- the reading page -----------------------------------------------------
  "reading-unavailable": {
    act: false,
    heading: "Your reading is safe",
    text:
      "Your reading couldn't be fetched just now — that's on our side, and nothing is lost. " +
      "Reloading in a minute usually finds it.",
  },
  "reading-link-expired": {
    act: false,
    heading: "This link has finished its six days",
    text:
      "This link has expired — they last six days. Your reading is kept for a year, so it can be sent to you again.",
  },
  "reading-link-bad": {
    act: false,
    heading: "That link could not be opened",
    text:
      "That link could not be opened. Reading links are long, and some apps cut them short — " +
      "opening it again from the email it came in usually works.",
  },
  "reading-connection-dropped": {
    act: false,
    heading: "Your reading is safe",
    text: "The connection dropped before your reading arrived. Nothing is lost — reloading usually finds it.",
  },
  // While Gemini writes (or retries). Unchanged words, kept here so the
  // taxonomy can name what a buyer sees when the writer is struggling.
  "reading-writing": {
    act: false,
    text: "Nothing needs doing — this page will show it as soon as it is written, and an email arrives too.",
  },
  "reading-writing-long": {
    act: false,
    text:
      "This is taking longer than it should. Nothing is lost and nothing needs doing — Jeremy has been told, " +
      "and the email will reach you when it is written.",
  },

  // --- the PDF download -----------------------------------------------------
  "pdf-unavailable": {
    act: false,
    heading: "Your reading is safe",
    text:
      "Your PDF didn't come together just now — that's on our side, and your reading is safe. " +
      "Another try in a minute usually works.",
  },
  "pdf-link-expired": {
    act: false,
    heading: "This link has finished its six days",
    text:
      "This link has expired — they last six days. Your reading is kept for a year, and a fresh link " +
      "can be sent from your reading page.",
  },
  "pdf-not-ready": {
    act: false,
    heading: "Nothing to draw yet",
    text: "Your birth details haven't been entered yet, so there is nothing to draw. Your reading page has the form.",
  },

  // --- sending the link again -----------------------------------------------
  "resend-unavailable": {
    act: false,
    text: "That could not be sent just now. Nothing has changed about your reading — trying again usually works.",
  },
  "resend-too-many": {
    act: false,
    text:
      "That has been sent a few times just now. In a few minutes it will go through again — nothing is wrong with your reading.",
  },
  "resend-no-address": {
    act: false,
    text: `There is no email address on this purchase, so there is nowhere to send it. ${CONTACT} reaches Jeremy, and he can sort it out.`,
  },

  // --- "Email me my charts" (release 2) ---------------------------------------
  "mycharts-unavailable": {
    act: false,
    text: "That could not be sent just now — that's on our side. Nothing is lost, and another try in a few minutes usually works.",
  },
  "mycharts-bad-email": {
    act: true,
    text: "That doesn't look like a whole email address yet. The one you used when you bought is the one that works here, whenever you're ready.",
  },
  "mycharts-too-many": {
    act: false,
    text: "That has been asked a few times just now. In a little while it will go through again — nothing is wrong.",
  },

  // --- adding a birth time found later (10/22) -------------------------------
  "addtime-check-time": {
    act: true,
    text: "That birth time doesn't look quite right. Could you check it?",
  },
  "addtime-slow": {
    act: false,
    text:
      "Something on our side is slow right now, so your chart wasn't redone — nothing has changed, and the time " +
      `you typed is still in the form. Another try in a minute usually works. Jeremy has been told. ${CONTACT} reaches him.`,
  },
  "addtime-not-saved": {
    act: false,
    text:
      "Your chart was cast again, but saving it didn't finish on our side, so nothing has changed yet. The time you " +
      `typed is still in the form — another try in a minute usually works. Jeremy has been told. ${CONTACT} reaches him.`,
  },
  "addtime-used": {
    act: false,
    heading: "Your birth time is already added",
    text: `A birth time can be added once to each chart, and this chart has its time. For anything else about it, ${CONTACT} reaches Jeremy.`,
  },
  "addtime-known": {
    act: false,
    heading: "Your chart already has its birth time",
    text: `This chart was cast from a known birth time, so there is nothing to add. For anything else about it, ${CONTACT} reaches Jeremy.`,
  },
  "addtime-gone": {
    act: false,
    heading: "This chart is no longer kept",
    text: `Charts are kept for a year from the day they were bought, and this one has passed its year. ${CONTACT} reaches Jeremy, whenever you'd like to ask about it.`,
  },
  "addtime-none": {
    act: false,
    heading: "A birth time can't be added here",
    text: `This chart was made before birth details were kept with it, so a time can't be added on this page. ${CONTACT} reaches Jeremy, and he can help.`,
  },

  // --- the net under everything ---------------------------------------------
  "our-side-generic": {
    act: false,
    heading: "Nothing is lost",
    text:
      `Something on our side didn't work just now. Nothing is lost — another try in a minute usually works, ` +
      `and ${CONTACT} reaches Jeremy.`,
  },
};

/** The words for a key. Unknown keys fall back to the generic net, never to nothing. */
export function customerText(key) {
  return MESSAGES[key]?.text ?? MESSAGES["our-side-generic"].text;
}

export function customerHeading(key) {
  return MESSAGES[key]?.heading ?? null;
}
