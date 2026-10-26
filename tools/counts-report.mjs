// The offer page's visits and Buy clicks, day by day and by source (netlify/lib/counts.mjs).
// Usage: npx netlify blobs:list counts --json | node tools/counts-report.mjs [days]
import { readFileSync } from "node:fs";

const days = Number(process.argv[2]) || 14;
const listing = JSON.parse(readFileSync(0, "utf8"));
const keys = (listing.blobs ?? listing).map((b) => b.key ?? b);
const since = new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);

const rows = new Map();
for (const key of keys) {
  const [day, e, src, tier, kind] = key.split("/");
  if (!day || day < since) continue;
  const id = `${day}  ${src}`;
  const r = rows.get(id) ?? { day, src, visit: 0, buy: { 0: 0, 1: 0, 2: 0 }, kinds: {} };
  if (e === "visit") r.visit++;
  if (e === "buy") {
    r.buy[tier] = (r.buy[tier] ?? 0) + 1;
    r.kinds[kind] = (r.kinds[kind] ?? 0) + 1;
  }
  rows.set(id, r);
}

const out = [...rows.values()].sort((a, b) => (a.day === b.day ? b.visit - a.visit : a.day < b.day ? 1 : -1));
console.log("day         source      visits  buy:summary chart reading   (new / step further / someone new)");
for (const r of out) {
  const k = `${r.kinds.new ?? 0} / ${r.kinds.upgrade ?? 0} / ${r.kinds.someone ?? 0}`;
  console.log(`${r.day}  ${r.src.padEnd(10)}  ${String(r.visit).padStart(6)}  ${String(r.buy[0]).padStart(11)} ${String(r.buy[1]).padStart(5)} ${String(r.buy[2]).padStart(7)}   ${k}`);
}
if (!out.length) console.log(`(no counts in the last ${days} days)`);
