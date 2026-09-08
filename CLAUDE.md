# Claude reference for Mr-Champagne-TCM repositories

Read this before searching or asking the owner where something lives.

## Owner and public profiles

- Owner: Jeremy Champagne, The Champagne Method (TCM).
- Coaching site: https://thechampagnemethod.co
- Readings shop: https://humandesign.thechampagnemethod.co
- Instagram profile: https://www.instagram.com/mr_jeremy_champagne/
- Facebook profile: https://www.facebook.com/Mr.Champagne.Martin
- Readings support address: hd-readings@thechampagnemethod.co

## Where things live (all under github.com/Mr-Champagne-TCM)

| Repo | What it is | Hosting |
| --- | --- | --- |
| the-champagne-method | Coaching site, thechampagnemethod.co. Source of truth for brand copy, Person schema, and social links (index.html, sameAs block). Public repo. | GitHub Pages |
| hd-site | Human Design readings shop front end | Netlify |
| hd-engine | JVM chart engine and API | Fly.io |
| hd-reading-app | Android reading app; shares the engine module | Device |
| files-zip-watcher | Utility repo, also used as a scratch source for cloud sessions | n/a |
| clean-butt-battle | Arcade cabinet project (formerly bidet-blaster) | n/a |
| verbal-journal | Verbal Reflections app | n/a |

## Working rules learned the hard way

- Social links and brand facts are in the-champagne-method, not in the hd-* repos. If it is not attached to the session, clone it read-only with add_repo before reporting "not found".
- Never ask the owner to look up something that exists in any of the repos above, in Google Drive, or in Gmail. Search first, then report.
- A Google Doc titled "Claude Reference - Jeremy Champagne / TCM" in the owner's Drive mirrors this file and holds cross-repo notes and lessons learned. Update both when facts change.
- thechampagnemethod.co and its subdomains are blocked by the cloud session egress proxy. Read the repo instead of fetching the live site.
