# Where the HD platform stands

_Snapshot taken 29 August 2026, after two days of building and two live
walk-throughs. Supersedes UNVERIFIED.md and CHANGED-OVERNIGHT.md as the place
to look first._

**Live and working.** Stripe is in sandbox, the site is unannounced, and
everything below the "what is left" line is what stands between that and
selling to a stranger.

- Shop — https://humandesign.thechampagnemethod.co
- Tier descriptions — https://thechampagnemethod.co/readings/
- Engine — tcm-hd-engine.fly.dev, tier cap 2
- 367 tests, 0 failures. CI green. Every function run from the deploy artefact
  before each release.

---

## 1. What works, end to end

A purchase now goes: **pay → land on your own reading link → enter birth details
→ chart appears → (reading tier) words arrive a minute later → emails at each
step.** Every part of that has been walked by Jeremy on the live site.

| | State |
|---|---|
| Summary, chart and reading tiers | All buyable, all deliver |
| The written interpretation | **Real Gemini readings are being produced.** Prompt in a blob, validated before storage, write-once |
| The bodygraph | One drawing, engine-rendered, recoloured for print |
| PDFs | 2 pages at chart tier, 7 at reading tier, matched to the app's format |
| Upgrade credit | Travels with the signed link — any device, any day |
| Upgrade funnel | `/u/<token>`: tiles with the discount applied, owned tiers greyed |
| Emails | Three stages, three subjects, each naming whose chart it is |
| Monitoring | Immediate alert on failure, weekly report either way |
| Paywall | On. A chart request with no proof is refused |

---

## 2. What is left to BUILD

Nothing here blocks testing. Ordered by what matters.

| # | What | Why it is not done |
|---|---|---|
| B1 | **Refund / terms wording** | Jeremy leaned "no refunds" and parked the decision until just before launch. He decides the policy; the writing is an hour |
| B2 | **A reading sample for the tiers page** | The reading tier is the only one with no evidence shown. Needs one real generation from the EXAMPLE chart — never a client's |
| B3 | **Pixel noise at maximum zoom** in the viewer | Queued by Jeremy. The PDF zooms losslessly, so it is the viewer's rendering rather than the drawing |
| B4 | **B-1 on the main site** — scroll indicator and ellipsis | Approved, queued for after launch |

---

## 3. What is left to TEST

Everything below is deployed and has never been confirmed by a person.

| # | What | How to prove it |
|---|---|---|
| T1 | **The reading page updates itself** while the words are being written | Buy a reading, sit on the page, do not refresh. It should fill in on its own within a minute or two |
| T2 | **The Processing indicator** | Same moment — three pulsing dots and the word Processing |
| T3 | **Email subjects name the chart** | Any purchase. Two different names must land in two different Gmail conversations |
| T4 | **The chart-differs warning only fires on an upgrade** | Buy a summary while already owning something, with different birth details. It should NOT warn. Then upgrade with different details — it should |
| T5 | **The zoom clears the controls** | Open the chart. The Root must be visible at Fit, not under the button bar |
| T6 | **The upgrade credit reaches Stripe** | Upgrade from an emailed link on any device. The payment page must show the discounted amount |
| T7 | **The weekly watch report** | Arrives Monday 13:00 UTC, saying "all clear" if nothing failed. Its absence is the alarm |

---

## 4. What is left for JEREMY, and only him

| # | What | Blocking? |
|---|---|---|
| J1 | **Live Stripe keys** | Yes, before real money |
| J2 | **The refund/terms decision** (see B1) | Yes, before real money |
| J3 | **A real purchase on live keys**, once J1 is done | Yes |
| J4 | **Paste client names into `tools/private-terms.local.txt`** — gitignored, never leaves his machine. Until then the leak scanner's name rule has never run once | No |
| J5 | Four client first names in this repo's git history — he ruled: **leave them**, they are friends' or invented | Closed |

---

## 5. Standing decisions worth not relitigating

- **One bodygraph** (D-10). A client never chooses a palette. Print is a medium,
  not a choice.
- **Birth details are never stored.** They compute a chart and are discarded. An
  upgrade asks again, and the chart is COMPARED rather than the details kept.
- **Identity is the email on the purchase** (D-9). Re-delivery goes there and
  nowhere else.
- **Six days for a link, a year for the purchase** (D-9d). An expired link
  refreshes itself.
- **The reading prompt never enters this repo.** It is the product, this repo is
  public, and it lives in a blob.
- **Gemini receives chart values only.** No name, no date, no time, no place —
  asserted against the actual request body.
- **Every route to the top costs the same** (D-6), proved through the credit
  function rather than the table describing it.

---

## 6. The lessons that keep paying

- **LOOK AT THE OUTPUT.** A commit once claimed a change it had not made; a
  reading PDF was a chart PDF; a marketing page quoted a channel its own example
  did not have. All three were found by rendering the thing and reading it, and
  none by re-reading a diff.
- **A test that cannot fail for the right reason is worse than no test.** The
  seven-page test passed while the endpoint never handed over the reading.
- **The scanner has been right every time it fired** — four times, including the
  reading prompt itself.
- **My harness has now been mistaken for the product twice** — `pdf.pdf`, and a
  PDF full of fixture prose. A stand-up must look like the thing or announce
  that it is not.
