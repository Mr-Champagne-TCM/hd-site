/**
 * ONE-OFF: the "updated PDF" note to past buyers (Jeremy 10/21).
 *
 *   node tools/pdf-update-offer.mjs                      DRY RUN: counts only
 *   node tools/pdf-update-offer.mjs --preview A --out dir  also writes each note
 *                                                         as HTML for a look
 *   node tools/pdf-update-offer.mjs --send --option A [--max 10] [--delay 1500]
 *
 * DRY RUN BY DEFAULT. It lists and reads the live "readings" store (never
 * writes it) and prints how many would get the note, per tier, and how many
 * are skipped and why. No names, no addresses, ever -- ids as 8-character
 * prefixes at most.
 *
 * --send NEEDS ALL OF: the flag itself, --option A|B (the wording Jeremy
 * picked), and GRANT_SECRET + RESEND_API_KEY in this shell's environment
 * (Netlify does not reveal secret values, so they come from wherever Jeremy
 * keeps them). Sends one at a time, a pause between, at most --max (10; 100
 * hard cap = Resend's daily limit). Every send is appended to
 * tools/pdf-update-offer.sent.local.txt (gitignored: *.local.txt) as a JSON
 * line -- record id, buyer key (a hash, not the address), tier, option, mail
 * id -- and anyone in that file is skipped next time.
 *
 * The site's origin is the live shop; the store is reached with the Netlify
 * CLI's own login (netlify login) and this checkout's linked site.
 */
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { getStore } from "@netlify/blobs";
import { loadAll, planOffer, sendOffer } from "../netlify/lib/updateOffer.mjs";
import { updateOfferEmail } from "../netlify/lib/updateOfferEmail.mjs";
import { sendMail } from "../netlify/lib/mail.mjs";
import { SITE } from "../netlify/lib/siteLinks.mjs";
import { SHOP } from "../shared/libraryLinks.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const LOG = join(ROOT, "tools", "pdf-update-offer.sent.local.txt");
const ORIGIN = SHOP.replace(/\/$/, "");

const args = process.argv.slice(2);
const flag = (n) => args.includes(n);
const value = (n, d) => (args.includes(n) ? args[args.indexOf(n) + 1] : d);

function siteId() {
  // A worktree has no .netlify of its own; the main checkout is linked.
  for (const dir of [ROOT, process.env.HD_SITE_LINKED_DIR].filter(Boolean)) {
    const f = join(dir, ".netlify", "state.json");
    if (existsSync(f)) return JSON.parse(readFileSync(f, "utf8")).siteId;
  }
  if (process.env.NETLIFY_SITE_ID) return process.env.NETLIFY_SITE_ID;
  throw new Error("no linked site: run in the linked checkout, or set HD_SITE_LINKED_DIR / NETLIFY_SITE_ID");
}

function cliToken() {
  if (process.env.NETLIFY_AUTH_TOKEN) return process.env.NETLIFY_AUTH_TOKEN;
  const f = join(process.env.APPDATA ?? join(process.env.HOME ?? "", ".config"), "netlify", "Config", "config.json");
  const cfg = JSON.parse(readFileSync(f, "utf8"));
  return cfg.users[cfg.userId].auth.token;
}

function readLog() {
  if (!existsSync(LOG)) return [];
  return readFileSync(LOG, "utf8").split(/\r?\n/).filter(Boolean).map((l) => JSON.parse(l));
}

const store = getStore({ name: "readings", siteID: siteId(), token: cliToken(), consistency: "strong" });
const keys = [];
for await (const page of store.list({ paginate: true })) for (const b of page.blobs) keys.push(b.key);
const records = await loadAll(store, keys);
const { picks, skipped, byTier } = planOffer(records, readLog());

console.log(`records in store: ${keys.length}`);
console.log(`would send: ${picks.length}  (chart ${byTier[1]}, reading ${byTier[2]})`);
for (const [k, v] of Object.entries(skipped)) console.log(`skipped ${k}: ${v}`);
console.log(`picks: ${picks.map((p) => p.record.id.slice(0, 8)).join(" ") || "none"}`);

const preview = value("--preview", null);
if (preview) {
  if (!["A", "B"].includes(preview)) throw new Error("--preview needs A or B");
  const out = value("--out", "pdf-offer-preview");
  mkdirSync(out, { recursive: true });
  picks.forEach((p, i) => {
    const { html } = updateOfferEmail({
      tier: p.record.tier, name: "[name]", pdfUrl: `${ORIGIN}/api/pdf?t=PREVIEW`, pageUrl: `${ORIGIN}/r/PREVIEW`,
      purchasedAt: p.record.purchasedAt * 1000, links: SITE, option: preview,
    });
    writeFileSync(join(out, `note-${i + 1}-t${p.record.tier}.html`), html);
  });
  console.log(`preview: ${picks.length} file(s) in ${out} (name shown as [name])`);
}

if (!flag("--send")) {
  console.log("DRY RUN: nothing sent. Add --send --option A|B to send.");
  process.exit(0);
}

const option = value("--option", null);
const secret = process.env.GRANT_SECRET;
const apiKey = process.env.RESEND_API_KEY;
if (!["A", "B"].includes(option)) throw new Error("--send needs --option A or B");
if (!secret || !apiKey) throw new Error("--send needs GRANT_SECRET and RESEND_API_KEY in the environment");

const result = await sendOffer({
  picks,
  option,
  secret,
  origin: ORIGIN,
  links: SITE,
  send: (msg) => sendMail(msg, { apiKey }),
  appendLog: async (line) => appendFileSync(LOG, JSON.stringify(line) + "\n"),
  max: Number(value("--max", 10)),
  delayMs: Number(value("--delay", 1500)),
});
console.log(`sent ${result.sent}, failed ${result.failed}: ${result.ids.join(" ")}`);
