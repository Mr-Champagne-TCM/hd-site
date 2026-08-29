# Unverified, and waiting on Jeremy

Two lists. The first is everything written but **never run in production** — a
passing test suite is not the same as a thing that worked once for a real
buyer. The second is what needs Jeremy specifically, because nobody else can
do it.

Kept here rather than in a conversation because conversations end.

_Last updated 2026-08-28._

---

## 1. Built, tested locally, NEVER RUN IN PRODUCTION

Nothing below has served a real purchase. Ordered by what breaks worst.

| What | Risk if it is wrong | How it gets proven |
|---|---|---|
| **One door after payment** — Stripe returns to the offer page, which now confirms the payment and sends the browser to `/r/<token>` | Highest. It is the money path. A buyer would see "Payment received" and then nothing until their email arrived | One sandbox purchase, end to end |
| **No birth form on the offer page** | A stranger has no way to see a chart without paying. Deliberate, but it is the funnel | Load the offer page |
| **The second email** (chart ready) — only fires on a first fill, which never happened before the fix | Buyer never learns their chart is ready | The same sandbox purchase |
| **Unsellable tier no longer offered for sale** — the reading had a live Buy button that the checkout refuses | An error at the moment somebody tries to pay | Open a chart-tier reading |
| **Zoom** — ctrl+scroll swallowed, − / + / Fit controls | Contained to the viewer | Pinch and scroll on a phone |
| **PDF matched to the app** — slate panel, square legend swatches, QR, row rules, named profile | Cosmetic | Download it |
| **Watcher** — daily digest, all-clear included | It fails silently, which is the exact thing it exists to prevent | Wait for the 13:00 UTC digest, once |
| **Email copy** — RESOURCES label, "contains" not "adds" | Cosmetic | Read the email |

## 2. Waiting on Jeremy

| # | What | Why only he can do it | Blocking? |
|---|---|---|---|
| 1 | **One sandbox purchase, end to end**, watching for **two** emails | Needs a card and his inbox | Yes — nothing above is proven without it |
| 2 | **Approve the tier-2 reading pages** on a local stand-up | His subject, his voice | Blocks tier 2 shipping |
| 3 | **Refund / terms policy** — parked until just before launch. He is inclined to **no refunds**; the features need designing either way | It is a commercial decision | Yes, before real money |
| 4 | **Paste client names into `tools/private-terms.local.txt`** | The names are his; the file is gitignored and never leaves his machine. Until then the leak scanner's name rule has **never run** | No, but it is the only unchecked rule |
| 5 | **Decide about four client first names in this repo's git history** — `hd-site` is public. Leave, rewrite history (breaks clones), or make the repo private | His clients | No |
| 6 | **Live Stripe keys** — staying sandbox for now, by his decision | Keys never reach Claude | Yes, before real money |
| 7 | **`PAYWALL=1` in Netlify** — off for now, by his decision. The form is gone from the page, but the API still serves a chart to a direct request | Netlify env is his | No, while sandbox |
| 8 | **`GEMINI_API_KEY` in Netlify** when tier 2 is wired | Key is his | Blocks tier 2 |

## 3. Tier 2 — where it actually stands

Ported from `hd-reading-app`, not reinvented: same prompt, same section list,
same validator, so a reading is the same reading whichever door it came from.

| Piece | State |
|---|---|
| Prompt, section list, validator, parser | **Done** — `netlify/lib/interpretation.mjs` |
| Privacy rule (chart values only reach Gemini) | **Done and tested** — asserted against the real request body, not against the helper |
| PDF pages for the reading | **Done** — seven pages, the same as the app |
| The Gemini call | **Done** — `netlify/lib/gemini.mjs`, prompt ported word for word |
| Storing it, write-once | **Done** — `fillInterpretation` |
| Generating it | **Done** — a background function called on demand, with a 15-minute safety net |
| Site rendering | **Done** — the reading is on the page, not only in the PDF |
| The wait, said in words | **Done** — a tier-2 buyer sees "being written now" rather than a short page |
| `GEMINI_API_KEY` in Netlify | **Jeremy has added it** (free tier, his decision) |
| Email nuance | **Done** — three stages, three subjects; the middle one no longer promises unwritten words |
| **Has never run against the real Gemini** | The whole path is tested against a fake. Nobody has seen a real generated reading on the web |
| `SELLABLE_MAX_LEVEL` | Stays at **1** until a real one has been read and approved |
