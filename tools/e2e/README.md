# The local end-to-end test rig

Every buyer journey, run on this machine, before a deploy. Zero credits.

- The real shop: this checkout's `dist/` and every Netlify function, called the way Netlify calls them.
- Fakes for everything outside: Stripe (a click-through payment page), Resend (an outbox of files), Gemini (stored live readings replayed word for word).
- The real chart engine, run locally from `../hd-engine`'s own build.
- The real website, served locally from `../the-champagne-method`.
- Headless Chrome clicks through every path a buyer can take, captures every page (1280 px and 390 px), every PDF and every email, then runs the truth checks and writes a report.

Built 10/21 after the live test found 19 bugs and 16 wording items that a local run could have found. Jeremy: "No more errors found after deploy, please."

## Run it

```
node tools/e2e/run.mjs        (or: npm run e2e -- <options>)
```

| Option | What it does |
|---|---|
| `--skip-build` | use `dist/` as it is (otherwise `npm run build` first) |
| `--only=rowan,theo` | just those journeys (ids in `combos.json`) |
| `--engine=cache` | no Java: answer charts from the recorded engine cache |
| `--no-website` | skip the website pages |
| `--update-baseline` | after a release is live and read: this run's words become "the last release" |
| `--checks-only=<run folder>` | re-check and re-report an earlier run (seconds) |
| `HD_LIVE_LINKS=1` | also open links to other sites (read-only GETs) |

- Output: `<data home>\runs\<when>-<commit>\report.html` and `report.pdf`. The terminal prints both paths.
- Exit code 1 when any check fails, so it can stand in front of a deploy.
- Each run folder is about 100 MB (every page and PDF page as a PNG, the emails, the local store). Old ones can be deleted by hand; the rig never deletes them.
- Just the shop, to click around by hand: `node tools/e2e/serve.mjs --for=30` (fake Stripe code for $0: `RIGFREE100`).

## How long, and what it costs

| | |
|---|---|
| Whole run | about 13 to 15 minutes (28 purchases and 5 birth times added, ~140 page states, ~230 links) |
| Re-check an earlier run | about 5 seconds |
| Netlify credits | 0 (nothing is deployed) |
| Stripe | 0 (a local fake; no key) |
| Email | 0 (written to files; nothing is sent) |
| Gemini | 0 (replayed; never called) |
| Fly engine | 0 (run locally) |

## First-time setup (once per machine)

- Node 20+, `uv` (Python runs through `uv run --with playwright ...`), Google Chrome, Java 21.
- `../hd-engine` built once (`gradlew :api:jar :engine:jar`, the jars in `api/build/libs` and `engine/build/libs`). Without Java, `--engine=cache` answers every chart the rig has asked for before.
- `../the-champagne-method` with its `node_modules` (for the website pages and the sample PDFs).
- `../hd-reading-app` (for the readings-site handler and the phone-copy scan). Optional.
- **The data home**, outside this public repo: `<workspace>\hd-e2e\` (override with `HD_E2E_HOME`).
  - `fixtures\` the JSON `/api/reading` returned for real live-test records (`all-readings.json` plus one file per record). These carry real model writing for made-up people, so they never go in this repo.
  - `engine-cache\`, `runs\`, `baseline\` are made by the rig.
  - Captures hold rendered bodygraphs, which `tools/leak-scan.mjs` blocks anywhere in the repo tree: one more reason the data home sits outside it.
- To add a stored reading: open the record's link, copy what `/api/reading` returned (DevTools, Network) into a `.json` in `fixtures\`. The rig replays it for any purchase with the same birth.

## What it drives (`combos.json`)

| Journey | Path | Chart shape |
|---|---|---|
| rowan | summary → For me chart → For me reading | Projector, Self-Projected, 1 channel |
| maya | summary → chart with **Change a detail** → reading | Projector, Emotional, 2 channels |
| theo | summary → reading in one step, **unknown birth time** | Generator, 4 channels |
| sage | chart new; then **someone new** summary (Quinn) and reading (Morgan) | MG, 5 channels |
| jordan | reading new, **$0 code**, **no name** | Generator, Sacral, 1 channel |
| reflector | chart → reading | Reflector, Lunar, 0 channels |
| egoM | reading new | Manifestor, Ego Manifested |
| egoP | summary → chart; someone new with unknown time and no name | Projector, Ego Projected |
| mental | reading new | Projector, Mental |
| ch6 | chart new | MG, 6 channels |
| manifestor | summary new | Manifestor, Emotional |
| addSum | summary, **unknown time**; the time added from the page; then the chart | the chart keeps the time and the spent offer |
| addChart | chart, **unknown time**; a week on (rig clock), the page's link expired, the time added from the **PDF's** link | the PDF's link never expires |
| addPage | chart, **unknown time**; the time added from the page | |
| addRead | reading, **unknown time**; the time added from the page | the reading written again |
| addUp | chart, **unknown time**, grown to the reading before use; the time added from the reading's PDF | the offer goes with the upgrade |

Plus: 10 pre-10/16 purchases written into the store the old way (no name, no birth), the expired-link page and its "send a fresh link", a link cut short, "Email me my charts" for the heavy inbox (timed at live store speed), the phone readings site with a link that never existed, the shop's 404, and the website's readings, privacy, library and tools pages and sample PDFs.

- Births are made up (`find-births.mjs` walks dates arithmetically; the named ones are the 10/21 live-test people, also made up).
- A reading for a chart with a stored live reading replays those exact words through the real renderer and checker. Any other chart gets a marked placeholder (`[RIG PLACEHOLDER]`), so its pages and PDF are tested but its words are not judged.

## What it checks (`checks/index.mjs`)

| Check | Guards | What fails it |
|---|---|---|
| run-complete, no-live-calls, no-incidents | the rig | a journey that could not finish; any call to an outside host; any alert that would have paged Jeremy |
| values-match-engine | #2 | a table value differing from the engine's full chart for that birth; "None" where the chart has data; a channel list with one too many or one missing |
| provisional-marks | #3 #17 | unknown time, with the engine's spread kept (10/22): a line that changes during the birth day without PROVISIONAL beside its label, a line that holds all day marked, a tag after the value, the gates or the 26 activations unmarked (page, three-lines box, PDF page 1 and its value rows); Start here's lists, channels and profile and the reading's margin notes tagged other than by the spread's changes (page and PDF). With no spread (an older record): Type / Authority / Profile without "provisional"; Type provisional but its centers not. Everywhere: "usually your Type and Authority" (shop, website, phone source) |
| unknown-time-line | #17 | unknown time: the one line missing, said twice, or not the kept spread's; the kept spread not the engine's own `/v1/spread` answer (the harness keeps those in `<run>\spread-truth\`); the bar ("cast at noon" over the clock) missing; the offer missing or reworded; "add it here" not a link to `#add-time`; the gates' note missing; the same on PDF page 1, where "add it here" must be the record's never-expiring `/t/<key>`; no spread kept on an engine that makes them |
| stripe-next-step | #4 | Stripe's line under Pay asking for birth details on an upgrade that keeps them |
| confirm-button-tier | #5 | "make my reading" on a chart upgrade |
| someone-new-their | #16 #19 W8 | "your birth date", "your summary", "I don't know my birth time", a "Your Human Design" title, in what the buyer reads about someone else's chart; a nameless gift chart titled with the buyer's name |
| form-missing-count | #1 | any count short of three ("One thing left", "Two things left"), or "That’s everything", on a blank form |
| authority-side-note | #14 | the CENTER side note not naming the authority's own center, on the page or in the PDF |
| pdf-page-fill | #6 | a PDF page under 15% filled (measured on the rendered page); "above" with nothing above; a page that is only the coaching card |
| links | links | any link on our sites not 200; any #anchor missing or not in view when the page loads with the hash (library entries open from the hash) |
| near-miss-words | #9 #15 AI5 | a near miss of "not-self" / "signature"; another type's feeling word in on-track / off-track text; **the shop's own checker probed** with "not-sf", "not self", "signiture" and another type's word: each must be refused |
| doubled-text | W6 AI2 | the same sentence or clause (6+ words) twice in one page, PDF or email (the three-lines box's copy of the first try-this line, fix 1A, is the one copy by design) |
| my-charts-rows | #8 | two rows reading the same; one chart listed twice |
| my-charts-time | #7 | more than 6 s with every store request slowed to the live 400 ms |
| readings-site-unknown | #18 | "expired" for a link that never existed |
| website-claims | #10 #11 #12 | the website saying a phone number is collected at payment (every checkout has it off; the in-person readings on Jeremy’s phone are another matter), the summary keeps no birth details (it does), or Signature / Not-self |
| sample-pdfs | #13 | a sample PDF with a "Timezone:" line or the old title |
| us-spelling-no-shop | rules | UK spellings; "shop" in customer copy |
| tier-aware-copy | W2 W3 W5 W12 | "Below: your chart and its tables" on a summary; "your reading" to summary and chart buyers; "While you wait" with nothing to wait for; "INTERPRETATION" on the chart-only PDF; the bodygraph guide given the library's address |
| style | W1 W4 W9 W10 W14 | a period on a table value standing alone (a reading's "Projector. &lt;sentence&gt;" is right); a spaced hyphen as a dash; "Cross of The"; UK date order; a footer date months behind the site; a privacy "Last updated" older than its text |
| drawing-names | W13 | "EGO" in the drawing, "Heart" in the tables |
| correction-note | W15 | the correction note gone once the chart grows |
| fresh-link-email | W7 | the fresh-link email not saying it is one |
| phone-width | rules | any page wider than 390 px |
| two-emails | 4A | a purchase sending other than one receipt and one "ready"; a birth time added sending other than one "ready" and no receipt |
| add-time | Offer A | the time box not opening from the page's `#add-time` or the PDF's `/t/<key>`; "I don't know" on it; the kept line not the chart's date and place, or showing a time; the wrong button; a week on, the page's link not expired while the PDF's opens; after the add: an unknown-time chart, a spread, PROVISIONAL, "cast at noon", the offer or an add-it-here link left on the page or in the PDF; no "Birth time added" note or no time in the birth line; the reading not written again; either way in, opened again, not saying it is used; the ready email without a link; an upgrade after use cast at noon or offering it again |
| ai-writing | AI1 AI3 AI4 | most try-this lines opening "Notice / Watch / Observe"; glance rows that are fragments (an -ing opening and no main verb; "Waiting for the invitation keeps…" is a sentence); the known word slips |

Findings are tagged **AI / data** when the words are not in the source (the model wrote them, or they are chart data), so a fix goes to the prompt and checker rather than the code.

## Tests for the checks

A check that misses a real error masks it; a check that fires on right text is a false error. Either makes the rig a new source of the mistakes it is there to stop.

```
node tools/e2e/checks/selftest.mjs            (newest finished run as the base; about 5 seconds)
node tools/e2e/checks/selftest.mjs --base=<run folder> --only=style,links --keep
```

- For every check, a **known-good** document that must pass: one taken from a real run, corrected the way the fix would correct it, plus look-alikes that are right as they are ("Reading your bodygraph", a reading's "Projector. <sentence>", the in-person row on the privacy page).
- And **known-bad** versions of that same document, each with one error planted in the shape the live test found it ("One thing left", "not-sf", "CENTER: Single"…). Each must fail, with a finding that names it.
- Each case runs alone on a small copy in `<data home>\selftest-tmp\`, deleted afterwards. The base run is only read. Planted words are short and made up.
- Checks that read numbers the driver measured (PDF fill, phone width, link status, the my-charts time, emails per step) are tested by changing those recorded numbers: that is all the check reads.
- It also checks every error-set item the rig can see is planted at least once and caught **the way the report counts it** (`errorset.json` match and where), so the report's "caught" list can be trusted.
- Exit code 1 if any case fails, a check has no good or no bad case, or an error-set item is not caught.
- Cases live in `checks/selftest/cases.mjs`. A new check, or a new item in the error set, gets its cases there.

## What still needs a human, and why

- **New AI word slips and tone.** The rig catches the patterns already named (soft try-this openers, fragments, the listed slips, doubled takeaways). A new odd word or wrong register is a matter of reading. The report's "changed words since the last release" is the list to read, instead of everything.
- **Placeholder readings.** Charts with no stored live reading (Reflector, Ego, Mental here) get placeholder words. Their layout, PDF and notes are checked; their writing is not. Add a stored reading to `fixtures\` to bring one under the AI checks.
- **The phone app (W11, W16, and the phone halves of #6 #9 #14).** Its screens, its PDF and its Kotlin checker run on the phone, outside this rig. The rig scans the phone source only for the unknown-time sentence (#17). The phone's own unit tests, or a phone run, cover the rest; the checker probe's four cases are worth porting to its parity tests.
- **Push dates (half of W9).** The privacy "Last updated" is checked against its last commit; that the page goes live a day later is a push date the rig cannot see.
- **Whether a page looks right.** Every page and PDF page is screenshotted (desk + phone), and fill and width are measured, but colors, spacing and whether a drawing reads well are still for eyes. The screenshots are in the run folder.
- **The real Stripe page.** The fake shows exactly the parameters the shop sends (product name, description, amount, the line under Pay). How Stripe itself lays them out needs the test-mode variant below.

## Stripe test mode (designed, not built yet)

For a run against Stripe's real test API, once Jeremy pastes a test key:

- `node tools/e2e/run.mjs --stripe=test` asks for the key in a hidden prompt (no echo). It is held in memory only: never printed, logged, written to disk or put in a URL.
- Anything but `sk_test_` / `rk_test_` is refused before any call. A live key can never start this mode.
- The fetch router then lets exactly one more host through, `api.stripe.com`, with the test key. Resend, Gemini and every other host stay faked or blocked.
- The driver uses Stripe's real hosted test checkout: a test-mode 100%-off promotion code (created once in the test dashboard) or the published test card `4242 4242 4242 4242`. If Stripe shows a bot check, the run stops and says so; it never tries to get past one.
- What it adds over the fake: Stripe's own validation of `custom_text` and product names, promotion-code behavior, the real `customer_details` shape, and a screenshot of the real payment page.
- Test-mode objects (products `hd_summary`, `hd_chart`, `hd_reading`, sessions) stay in the test dashboard. Cost: 0.

## How it works (files)

| File | Job |
|---|---|
| `run.mjs` | the one command: build, start the rig and the website, drive, check, report |
| `serve.mjs` | the rig alone, for clicking by hand |
| `harness/server.mjs` | the local shop: dist + functions + Blobs + engine proxy + fakes + `/__rig` controls |
| `harness/fakeStripe.mjs`, `fakeMail.mjs`, `fakeGemini.mjs` | the fakes |
| `harness/engine.mjs` | the local JVM engine + record/replay cache |
| `harness/seed.mjs` | the pre-10/16 purchases |
| `harness/paths.mjs` | where the sibling repos and the data home are |
| `drive/drive.py`, `drive/pdfcap.py` | the buyer, in headless Chrome; PDF text, links, page PNGs and fill |
| `checks/*.mjs` | the truth checks and the baseline diff |
| `checks/selftest.mjs`, `checks/selftest/` | the tests for the checks (above) |
| `report/report.mjs`, `report/print.py` | report.html and report.pdf |
| `combos.json` | births and journeys |
| `errorset.json` | the 10/21 error set, item by item, mapped to its check |
| `find-births.mjs` | finds a made-up birth for a chart shape |

Notes:
- The harness swaps `: | * ? " < >` in Blobs keys for look-alike characters, because the local Blobs server keeps keys as Windows file names. Netlify's store has no such limit, and nothing in the site sees the difference.
- Each journey is its own visitor (its own made-up IP), as each buyer is live; otherwise the per-visitor limits refuse the run halfway.
- The site runs with `PAYWALL=1`, a stand-in prompt in the config store (form mode, no private words), and secrets made fresh for each run.

## What it never does

- Deploy anything (Netlify, Fly, GitHub Pages), or push to any main.
- Call live Stripe, Resend, Gemini, or the live engine. The site's `fetch` refuses every outside host, and the report lists any attempt.
- Write to anything live, or send an email.
- Print a secret. The rig's own keys are random per run and shaped only to pass the site's format checks.
