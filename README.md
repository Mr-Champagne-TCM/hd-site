# hd-site

The public website for Human Design readings from
[The Champagne Method](https://thechampagnemethod.co).

Static pages, the design system, the words, and a checkout client. Charts are
computed by a private service; nothing in this repository calculates one.

## Related repositories

| Repo | Visibility | Holds |
|---|---|---|
| [hd-site](https://github.com/Mr-Champagne-TCM/hd-site) | Public | **This repo.** The site: pages, design tokens, copy, checkout client, an API base URL. |
| [hd-engine](https://github.com/Mr-Champagne-TCM/hd-engine) | Private | The chart engine and the API service that fronts it. |
| [hd-reading-app](https://github.com/Mr-Champagne-TCM/hd-reading-app) | Private | The Android app used for readings in person. |

## What is deliberately not here

- No chart calculation, and no ephemeris.
- No bodygraph geometry, in any form — source, bundle, source map or data file.
  Bodygraphs arrive from the API as finished SVG.
- No reading prompt.
- No key, token or secret. Anything shipped in a browser build is public by
  nature and is treated as such.

## Every commit is searched before it lands

This repo is public. Everything in it is readable by anyone, for ever, and git
history does not forget a deletion — so `tools/leak-scan.mjs` runs on every
commit and again in CI, where nobody can skip it.

Pages hide things. A bundler inlines a config object, a source map republishes
the whole original tree, a comment explains the thing it was meant to protect,
a glob sweeps up a `.env`. None of that shows on the rendered page and all of it
is one View Source away.

It looks for keys and tokens, engine internals, the reading prompt, real
people's names and phone numbers, source maps, stray `.env` files, notes to
ourselves left in HTML comments, and localhost URLs in built output. It scans
the **built output** as well as the source, because source can look clean while
the build inlines something from outside it.

It earned its place on its first run: it found a real client's name sitting in a
test fixture.

```
sh tools/install-hooks.sh     # once, per clone
node tools/leak-scan.mjs      # any time
```

A finding blocks. If something is a false positive, the fix is to narrow the
rule — not to add a skip, because the next real one will match that skip too.

## Status

Scaffolded 2026-08-26. The edge is built and tested; the site itself is not
built yet.
