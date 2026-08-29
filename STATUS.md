# Where the HD platform stands

_Updated 29 August 2026, after Jeremy's third live walk-through. Supersedes
UNVERIFIED.md and CHANGED-OVERNIGHT.md as the place to look first._

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
| B1 | **Refund / terms wording** | Jeremy's decision, put to him 29 Aug. Writing is an hour once he calls it |
| B2 | **A reading sample for the tiers page** | **BLOCKED, and correctly so.** It needs one real generation from the EXAMPLE chart, which needs the Gemini key and the engine key. Both are Netlify SECRET variables: write-only, unreadable even by the CLI, which is exactly the protection Jeremy asked for. The unblock is one sandbox tier-2 purchase entering 25 June 1985 / Chicago / time unknown; the reading can then be lifted from the blob store |
| B3 | ~~Pixel noise at maximum zoom~~ | **Changed, but NOT proven fixed.** See below |
| B4 | ~~B-1 on the main site~~ | **Done** 29 Aug, in `the-champagne-method` |

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
