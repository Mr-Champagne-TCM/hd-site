# Where the HD platform stands

_Updated 29 August 2026, late — the day the site went live and took a real
payment. Supersedes UNVERIFIED.md and CHANGED-OVERNIGHT.md as the place to look
first._

## THE SHORT VERSION

**You are live and selling.** A real card was charged at the reading tier and
delivered. The bank account is attached. Nothing is half-finished and nothing is broken.

**One thing has a clock on it:** nothing. The Stripe website review completed.

**The only open build** is a re-send tool so you can help somebody who lost
their email — designed, not started, and it needs a decision from you first
(see section 7).

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

| # | What | State |
|---|---|---|
| B1 | Refund / terms wording | **Done.** "All purchases are final", his wording, live in the shop footer |
| B2 | A reading sample for the tiers page | **Done.** Real excerpt from a real chart, live at thechampagnemethod.co/readings/ |
| B3 | ~~Pixel noise at maximum zoom~~ | Changed, **not proven fixed** — see below |
| B4 | ~~B-1 on the main site~~ | **Done** |
| B5 | **The twenty-six activations** | **Done.** Sold in every price table and shipped in none of them until today. Now on PDF page 4 and on the reading page |
| B6 | **A re-send tool** | **NOT STARTED.** The one open build. Needs a decision — section 7 |

### B3, honestly

I could not reproduce it. Measured side by side in Chrome at 8x with a
15,360 x 18,742px element -- larger than Jeremy's screen produces -- the old
approach rendered losslessly. The giant-element theory was wrong.

What changed anyway: the viewer now moves a `viewBox` window over an element
that stays the size of the viewport, instead of sizing an element to
`viewportWidth * scale`. That removes the only pathological case in the viewer
and is strictly cheaper, which is worth having on a machine whose GPU is known
to time out -- but it is not a proven fix for what he saw, and should not be
written up as one. If the noise comes back, the next suspect is the machine,
not the drawing.

---

## 3. What is left to TEST

Six of the seven are now confirmed by a person or by production logs.

| # | What | State |
|---|---|---|
| T1 | The reading page updates itself while writing | **Confirmed** — Jeremy: "Page updated automagically when reading came in" |
| T2 | The Processing indicator | **Confirmed** — seen, ~1.5 min |
| T3 | Email subjects name the chart | **Confirmed** — five emails, five separate Gmail threads. The same inbox holds the before: two earlier runs, made under one test name and that name plus a number, collapsed into a single conversation |
| T4 | chart-differs fires only on an upgrade | **Confirmed** — Jeremy: "No 'chart is different at lower tier' - good" |
| T5 | The zoom clears the controls | **Was still broken, now fixed.** It opened at the raw box and only `reset()` subtracted the furniture, so Fit repaired a state the viewer had put you in. Verified in a browser at open, at 8x, and back to Fit |
| T6 | The upgrade credit reaches Stripe | **Confirmed in production logs.** See below |
| T7 | The weekly watch report | Waiting for Monday 13:00 UTC. Its absence is the alarm |

### T6, from the checkout function's own logs, 29 August

Credits are in cents, exactly as the function logged them. Prices are not
written here -- they live in `shared/pricing.mjs` and nowhere else (P-1), which
is the rule the scanner enforced when this table first tried to spell them out.

```
16:43  tier 0, credit 0        ladder A: 0 -> 1 -> 2
17:00  tier 1, credit 111
17:03  tier 2, credit 1111

17:42  tier 1, credit 0        ladder B: 1 -> 2
17:49  tier 2, credit 1111

18:45  tier 0, credit 0        ladder C: 0 -> 2
18:47  tier 2, credit 111
```

Each credit equals the full price of the tier already owned, so on every one of
the three routes the amounts paid sum to the top tier's price exactly. D-6 is no
longer an assertion about a table; it is production data across three routes.

---

## 3b. Before real money — the two payment gaps

Both closed in code, 2026-08-29. Found by reading the payment path rather than
the tracker, when Jeremy asked whether he was ready for live Stripe keys.

| | Was | Now |
|---|---|---|
| **Claimed twice** | The session id lives in the buyer's browser history and every POST to `/api/claim` minted another reading and another email. One payment, unlimited copies | The reading's id is an HMAC of the Stripe session id, so a repeat claim finds the first one's work and returns the same link. Nothing written, nothing sent |
| **Paid and vanished** | Delivery only ever happened when the browser returned. A closed tab meant money taken and NO record anywhere — no reading, no email, no alert, because nothing knew a purchase had happened | `reconcile` runs every 15 minutes, asks Stripe who paid in the last 48 hours, and compares against the store. Anything missing raises an incident and, when armed, delivers it |

**`reconcile` ships REPORT-ONLY.** It alerts and changes nothing until
`RECONCILE_DELIVER=1` is set in Netlify. **Set that at the same time as the live
Stripe key** — the alert itself says so if it ever fires while unset.

A webhook was considered and deliberately not built. It is faster and it is
another secret and another moving part, and it can be missed — which means the
reconciliation would be needed anyway as a backstop. This catches every cause,
including a webhook that never arrives.

---

## 4. What is left for JEREMY

| # | What | Blocking? |
|---|---|---|
| J1 | ~~Live Stripe keys~~ | **Done.** Live and charging |
| J2 | ~~Refund decision~~ | **Done** |
| J3 | ~~A real purchase~~ | **Done.** Reading tier, delivered, PDF read end to end |
| J4 | ~~Bank account~~ | **Done.** UFCU ····2993, USD default, FREE settlement |
| J5 | Paste client names into `tools/private-terms.local.txt` | **Done** — 7 terms, armed locally and in CI |
| J6 | First payout | Arrives on its own, 7–14 days after the first charge |

---

## 4b. What happened on 29 August, in order

1. Went live on real Stripe keys. First attempt failed: the key was stored as
   `keysk_live_…` — the word "key" copied along with the token. Fixed; the
   scanner now shape-checks the key so the next one says so in plain words.
2. A real reading-tier purchase. Chart in ~19s, reading written ~10s after.
3. Read all seven PDF pages and found two faults: profile lines collapsed into
   one row (a parser bug, not the model), and the reading told a Manifesting
   Generator to "wait for a proper invitation" — **Projector strategy**. Both
   fixed, both now tested; his reading was regenerated clean.
4. Found the reading tier promises "all twenty-six activations" and shipped
   none. Built. His app had them all along.
5. Stripe demanded a VAT number from a US sole proprietor. Support confirmed a
   form bug; Anne advised entering zeros; it cleared. Business review complete.
6. Disabled every non-USD payment method. Did **not** clear the VAT task —
   my theory was wrong — but the checkout is USD-only, which is right anyway.
7. Published the privacy policy, linked the readings page from the homepage,
   and prerendered the shop, which had been serving **643 bytes** to anything
   that does not run JavaScript.

---

## 4c. Bugs found in our own tooling today

- **The leak scanner decided "is this built output?" from the ROOT, not the
  FILE.** Default roots are `.` and `dist`, and walking `.` descends into
  `dist` — so every built file was scanned twice, once with `built=false`, and
  every `builtOnly` rule was mis-applied on that pass. Since it was written.
- **The scanner printed the name it caught**, into a world-readable CI log.
  Now withheld in public logs, shown locally where it is the only clue.
- **Commit messages were never scanned.** They are now, by hook and in CI.
- **A one-word private term matched case-insensitively** and broke every build
  on a dependency's vocabulary. One-word terms now match their own casing.

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

---

## 7. The one open question, for when you are rested

**The re-send tool.** So somebody who lost their delivery email can be helped.

The problem: minting a reading link needs `GRANT_SECRET`, sending needs
`RESEND_API_KEY`, and both are Netlify secrets that cannot be read back. So it
cannot be a local script.

**What I proposed and then argued against myself:** putting `GRANT_SECRET` in
the Android app. It is the wrong call. That key signs every reading link, an
APK is trivially unzipped, and rotating it invalidates every link every
customer holds. A Stripe key would be worse — that one moves money.

**The design to build instead:** the app holds a *revocable support token*, not
a secret. It authorises a request; it does not create authority. The endpoint
does the work, only ever sends to the address on the purchase (D-9), and can
read and re-send but never create, edit or refund. Lose the phone, revoke one
token.

**Also open:** he remembers a plan to create and track Stripe discount codes
from the app. It is not in either repo — every "discount" in the code is either
the upgrade credit or the app's festival special price for cash payments. D-8
says we never validate or hold a code, but that does not forbid *creating* one.
If he wants it, it is a real feature and needs scoping, including where the
Stripe key would live.
