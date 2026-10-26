import { test } from "node:test";
import assert from "node:assert/strict";
import { pdfArgs, pdfKey, pdfReady, keptPages, keptPdf, keepPdf, warmPdf, dropPdfs, ringPdf } from "../netlify/lib/pdfStore.mjs";
import { handlePdf } from "../netlify/lib/pdfHandler.mjs";
import { fillReading, mintReadingLink, saveReading } from "../netlify/lib/reading.mjs";

/**
 * EVERY PDF WRITTEN AHEAD, AND KEPT (10/26, Jeremy: "figure out how to write them without failing/lagging";
 * lib/pdfStore.mjs). The download hands over the kept copy; the page reads the kept count; nothing on a
 * buyer's request builds a PDF that is already kept.
 */
const SECRET = "s".repeat(64);
const NOW = Date.UTC(2026, 9, 26, 12);
const ID = "a".repeat(32);
const ID2 = "b".repeat(32);

function memStore() {
  const data = new Map();
  return {
    data,
    async get(k, opts = {}) {
      if (!data.has(k)) return null;
      const v = data.get(k);
      if (opts.type === "json") return JSON.parse(v);
      if (opts.type === "arrayBuffer") return v instanceof Uint8Array ? v.buffer.slice(v.byteOffset, v.byteOffset + v.byteLength) : null;
      return v;
    },
    async set(k, v) { data.set(k, v instanceof Uint8Array ? new Uint8Array(v) : v); },
    async setJSON(k, v) { data.set(k, JSON.stringify(v)); },
    async list({ prefix = "" } = {}) { return { blobs: [...data.keys()].filter((k) => k.startsWith(prefix)).map((key) => ({ key })) }; },
    async delete(k) { data.delete(k); },
  };
}

/** A one-page PDF the page counter can read (pdfPageCount), standing in for readingPdf. */
const PDF = (pages = 1) => {
  const kids = Array.from({ length: pages }, (_, i) => `${4 + i} 0 R`).join(" ");
  const objs = [`1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj`, `2 0 obj<</Type/Pages/Kids[${kids}]/Count ${pages}>>endobj`];
  for (let i = 0; i < pages; i++) objs.push(`${4 + i} 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 612 792]>>endobj`);
  return new TextEncoder().encode(`%PDF-1.4\n${objs.join("\n")}\ntrailer<</Root 1 0 R>>\n%%EOF`);
};

const chart = (over = {}) => ({ tier: 1, output: { type: "Generator" }, filledAt: 100, writtenAt: null, birth: { name: "Kit O'Brien" }, buyer: { name: "Tanya", email: "buyer@example.com" }, ...over });

test("which copy: the record as it is now, under this deploy; a reading has one only once it is written", () => {
  assert.equal(pdfKey(ID, chart(), "6adee2"), `${ID}/100-0-6adee2`);
  assert.notEqual(pdfKey(ID, chart(), "a"), pdfKey(ID, chart({ filledAt: 101 }), "a"), "a corrected chart is a new copy");
  assert.notEqual(pdfKey(ID, chart(), "a"), pdfKey(ID, chart(), "b"), "a new deploy draws its own");
  assert.equal(pdfReady(chart()), true);
  assert.equal(pdfReady(chart({ tier: 0 })), false, "a summary has no PDF");
  assert.equal(pdfReady(chart({ tier: 2 })), false, "a reading not yet written");
  assert.equal(pdfReady(chart({ tier: 2, reading: "words" })), true);
  assert.equal(pdfReady(chart({ pending: true })), false);
});

test("one set of inputs: the add-time key, the gift lines and the written words go into every copy", () => {
  const a = pdfArgs(chart({ tier: 2, reading: "THE WORDS", fresh: true }), ID, SECRET, { x: 1 });
  assert.equal(a.reading, "THE WORDS");
  assert.equal(a.gift, true);
  assert.match(a.addTimeUrl, /\/t\/.+/);
  assert.equal(a.name, "Kit O'Brien");
});

test("warmPdf builds once, keeps the bytes and the count, and drops the record's older copies", async () => {
  const pdfs = memStore();
  let builds = 0;
  const make = async () => { builds++; return PDF(3); };
  await pdfs.set(`pdf/${ID}/99-0-old`, PDF(2));
  await pdfs.setJSON(`pages/${ID}/99-0-old`, { pages: 2 });
  const out = await warmPdf({ pdfs, current: { id: ID, reading: chart() }, secret: SECRET, links: {}, build: "new", now: NOW, make });
  assert.deepEqual([out.built, out.pages], [true, 3]);
  assert.equal(await keptPages(pdfs, `${ID}/100-0-new`), 3);
  assert.equal(pdfs.data.has(`pdf/${ID}/99-0-old`), false, "the older copy is gone");
  // Asked again: kept, no second build.
  const again = await warmPdf({ pdfs, current: { id: ID, reading: chart() }, secret: SECRET, links: {}, build: "new", now: NOW, make });
  assert.deepEqual([again.built, again.why, builds], [false, "kept", 1]);
  // A reading not yet written: nothing built.
  const notYet = await warmPdf({ pdfs, current: { id: ID2, reading: chart({ tier: 2 }) }, secret: SECRET, links: {}, build: "new", now: NOW, make });
  assert.deepEqual([notYet.built, builds], [false, 1]);
  // Gone with its record.
  await dropPdfs(pdfs, ID);
  assert.equal([...pdfs.data.keys()].filter((k) => k.includes(`/${ID}/`)).length, 0);
});

test("two builders at once: the second sees the first's lock and does not build", async () => {
  const pdfs = memStore();
  let builds = 0;
  let release;
  const slow = () => new Promise((r) => { builds++; release = () => r(PDF(1)); });
  const first = warmPdf({ pdfs, current: { id: ID, reading: chart() }, secret: SECRET, links: {}, build: "d", now: NOW, make: slow });
  await new Promise((r) => setTimeout(r, 5));
  const second = await warmPdf({ pdfs, current: { id: ID, reading: chart() }, secret: SECRET, links: {}, build: "d", now: NOW + 1000, make: slow });
  assert.equal(second.why, "another builder");
  release();
  assert.equal((await first).built, true);
  assert.equal(builds, 1);
});

test("the download hands over the kept copy without building; with none kept it builds once and keeps it", async () => {
  const readings = memStore();
  const id = "c".repeat(32);
  await saveReading(readings, { id, tier: 1, output: null, name: "Tanya", email: "buyer@example.com", purchasedAt: NOW - 1000 }, NOW - 1000);
  await fillReading(readings, id, { type: "Generator", definedCenters: [] }, NOW - 500);
  const token = mintReadingLink({ id, tier: 1, now: NOW }, SECRET);
  const pdfs = memStore();
  let builds = 0;
  const build = async () => { builds++; return PDF(2); };
  const first = await handlePdf({ token, secret: SECRET, store: readings, build, links: {}, now: NOW, pdfs, deploy: "d1" });
  assert.equal(first.status, 200, JSON.stringify(first.body ?? "").slice(0, 200));
  assert.equal(builds, 1);
  assert.equal(first.kept, undefined);
  const second = await handlePdf({ token, secret: SECRET, store: readings, build, links: {}, now: NOW, pdfs, deploy: "d1" });
  assert.equal(second.status, 200);
  assert.equal(second.kept, true, "the kept copy was handed over");
  assert.equal(builds, 1, "no second build");
  assert.deepEqual([...second.bytes], [...first.bytes]);
});

test("keptPdf and keepPdf never throw on a store that fails", async () => {
  const broken = { get: async () => { throw new Error("down"); }, set: async () => { throw new Error("down"); }, setJSON: async () => { throw new Error("down"); }, list: async () => { throw new Error("down"); }, delete: async () => {} };
  assert.equal(await keptPdf(broken, "x/1-0-d"), null);
  assert.equal(await keptPages(broken, "x/1-0-d"), null);
  assert.equal(await keepPdf(broken, "x/1-0-d", PDF(1)), 1, "the count is still known");
});

test("the PDF builder is rung with the trigger token, and a failed ring is no failure", async () => {
  const calls = [];
  const ok = await ringPdf({ origin: "https://x.test", token: "tok", header: "x-tcm-trigger", id: ID, fetchImpl: async (url, init) => { calls.push([url, init.headers["x-tcm-trigger"], init.body]); return new Response(null, { status: 202 }); } });
  assert.equal(ok, true);
  assert.deepEqual(calls[0], ["https://x.test/api/pdf-warm", "tok", JSON.stringify({ id: ID })]);
  assert.equal(await ringPdf({ origin: "https://x.test", token: "tok", header: "h", id: ID, fetchImpl: async () => { throw new Error("no net"); } }), false);
  assert.equal(await ringPdf({ origin: "https://x.test", token: null, header: "h", id: ID }), false);
});
