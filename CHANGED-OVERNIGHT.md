# What changed overnight, 29 August

Everything from your walk-through, fixed and **deployed** — site and engine.
Ordered by what to check first.

**358 tests, 0 failures.** CI green. Every function imported and run from the
unzipped deploy artefact before shipping.

---

## The two that cost money

**The upgrade was charging full price.** Credit came only from a `grant` held in
the browser tab that paid — so upgrading from your emailed link on a later visit
got nothing, which is the one path the site tells everybody to use. Checkout now
also accepts the **signed reading token** and takes the better of the two. Both
are server-verified signatures; neither is a claim anyone can type.

*Check:* upgrade from an email link on any device. The Stripe page should show
the discounted amount.

**The engine key was capped at tier 1**, which is what refused your reading
purchase. Raised to 2 and deployed. And the deeper fix: **a paid request the
engine refuses is now an incident**, alerted the moment it happens. Two numbers
in two repositories are meant to move together; last time the only reason anyone
found out was that the buyer was you.

*Check:* your stuck tier-2 purchase should now go through. Open its link and
submit the form again.

## The upgrade funnel — your design

Clicking an upgrade no longer drops you into Stripe. It goes to **`/u/<token>`**:
the same tiles, discount already applied, full price struck through, tiers you
already own greyed out and saying so. Only then to Stripe.

*Verified on a real build:* summary and chart show "You already have this"; the
reading shows its discounted price with the full one struck through and
"already paid comes off".

**The funnel now appears on both views.** It was missing after payment because a
*pending* reading is deliberately never sold the next tier, and that view still
had that answer in hand. Submitting the form now goes to `/r/<token>` — **one
view of a purchase instead of two**, which also lands you at the **top** of the
page instead of mid-way down it.

## The bodygraph viewer

**It opened already cropped and Fit did nothing.** Both were one fault: the floor
was "fills the width", and the drawing is taller than it is wide — so on a
desktop the head and root were off-screen with nowhere to go, and the sideways
pan limit was exactly zero. Fit returned to a floor you were already sitting on.

The floor is computed from the viewport now and means **the whole chart fits**.

*Verified:* opens at 0.5× with the entire chart visible; zoom in to 0.7×; Fit
returns to 0.5×; Fit and zoom-out both disable at the floor.

## Birth details entered twice

Detect, **don't** store. On an upgrade, the new chart is compared to your
previous one — engine output to engine output, which is exact, not a guess about
what was typed. If it differs you get **both charts side by side, before any
output**, and two buttons: *Change my details* / *These details are right*.
Neither is labelled the mistake — a birth time learned since last time does this
exactly as a typo does.

The care went into **not crying wolf**: only fields decided by the birth moment,
only when present on both sides (a summary carries fewer fields than a reading),
order and whitespace ignored, the drawing and the noon-note not compared at all.
An unreadable store is a comparison *not made*, never a failure.

## Emails

- What you **bought** is named first; the upgrade is a separate block under its
  own heading. The summary email no longer describes the chart.
- **"The same link has it"** — same link as what? It names the page now.
- **"If anything here is unclear, hd-readings@… reaches Jeremy directly."**
- The **year leads** and the six days follows, as a fact about one link rather
  than a countdown. Opening a rested link offers you a fresh one.

## Smaller

| | |
|---|---|
| "Free reading, either way" | → **"Free to read, either way"** — it was offering a free reading |
| Submit button | Names the tier: "My chart", "My reading" |
| Privacy line | Moved **above** the form |
| "Email me this link" | **Removed** — you were standing on a page reached by that link. The duplicate-email bug goes with it |
| Arrow keys in place search | Work, and **focus never leaves the input** — typing carries on mid-selection. Enter only takes a highlighted result |
| PDF | No longer claims the credit only works from your email link |

## Two I found myself

**A flash on the upgrade page.** While the fetch was in flight it promised a
credit above three tiles that hadn't rendered — and if the link then proved
unreadable, the promise had already been read. Now it says "Reading your link…"
until the server answers.

**A commit that claimed a change it hadn't made.** The PDF's upgrade paragraph
and the comment above it were edited in one script; the second assertion failed,
so neither landed — then the comment was fixed alone. Caught by rendering the
page and reading it, not by re-reading the diff.

---

## Not done, and why

**A teaser bodygraph on the summary page.** You said discuss before implementing
the funnel content. It's the one funnel piece that's new content rather than a
fix, so it waited.

**Pixel noise at maximum zoom.** Queued, as you said. The PDF zooms losslessly,
so it's the viewer's rendering rather than the drawing.

**Birth details shown at the top of the output page.** This resolved itself —
that view no longer exists. Submitting goes to the canonical reading page, which
never showed them.

---

## Still true, and still yours

- **Stripe is sandbox.** Test cards only, unchanged, as you asked.
- `PAYWALL=1` is on. `/api/chart` with no proof returns 402 — verified live.
- `SELLABLE_MAX_LEVEL` is 2. All three tiers buyable.
- **No reading has ever been produced by the real Gemini.** The whole path is
  tested against a fake. Your tier-2 purchase completing will be the first.
- `tools/private-terms.local.txt` is still empty — the name rule has never run.
- Fresh PDFs in your Downloads: `HD-tier1-review.pdf`, `HD-tier2-review.pdf`.
