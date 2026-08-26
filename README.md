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

## Status

Scaffolded 2026-08-26. The site itself is not built yet.
