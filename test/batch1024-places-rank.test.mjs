import { test, after } from "node:test";
import assert from "node:assert/strict";
import { normalise, placeClass, rankPlaces } from "../netlify/lib/placeRank.mjs";

/**
 * BATCH-1024 ITEM 6 (live retest 10/23): typing "Denver" listed Copenhagen,
 * Århus, Odense and Aalborg (and Henderson) after Denver -- the engine's
 * near-miss pass matched "denver" against "Denmark". The shop now orders the
 * engine's rows town-first: a town-name match before a country-name match, a
 * whole-word town prefix before a country prefix; the engine's own order
 * inside each class. Labels below are the engine's shape ("Town, State" /
 * "Town, Region, Country"); every name is a real public place.
 */

const P = (label, zone = "UTC", extra = {}) => ({ label, zone, ...extra });
const labels = (ps) => ps.map((p) => p.label);

test("item 6: 'Denver' -- Denver first, the near-miss town next, the Danish towns (matched on Denmark) last", () => {
  const engine = [
    P("Denver, Colorado", "America/Denver"),
    P("Copenhagen, Capital Region, Denmark", "Europe/Copenhagen"),
    P("Århus, Central Jutland, Denmark", "Europe/Copenhagen"),
    P("Odense, South Denmark, Denmark", "Europe/Copenhagen"),
    P("Aalborg, North Denmark, Denmark", "Europe/Copenhagen"),
    P("Henderson, Nevada", "America/Los_Angeles"),
  ];
  assert.deepEqual(labels(rankPlaces("Denver", engine)), [
    "Denver, Colorado",
    "Henderson, Nevada",
    "Copenhagen, Capital Region, Denmark",
    "Århus, Central Jutland, Denmark",
    "Odense, South Denmark, Denmark",
    "Aalborg, North Denmark, Denmark",
  ]);
  // The same rows, nothing dropped or added.
  assert.equal(rankPlaces("Denver", engine).length, engine.length);
  // Lower case, a trailing comma, a state after it: still Denver first.
  for (const q of ["denver", "Denver,", "denver co", "DENVER, Colorado"]) assert.equal(rankPlaces(q, engine)[0].label, "Denver, Colorado", q);
});

test("item 6: a whole-word town prefix beats a country prefix ('Den')", () => {
  const engine = [
    P("Copenhagen, Capital Region, Denmark"),
    P("Denton, Texas"),
    P("Aarhus, Central Jutland, Denmark"),
    P("Denver, Colorado"),
    P("Golden, Colorado"),
  ];
  const ranked = labels(rankPlaces("Den", engine));
  assert.deepEqual(ranked.slice(0, 2), ["Denton, Texas", "Denver, Colorado"]);
  assert.ok(ranked.indexOf("Golden, Colorado") < ranked.indexOf("Copenhagen, Capital Region, Denmark"), "a town that holds 'den' comes before a country match");
  assert.deepEqual(ranked.slice(-2), ["Copenhagen, Capital Region, Denmark", "Aarhus, Central Jutland, Denmark"]);
});

test("item 6: the classes, one by one", () => {
  assert.equal(placeClass("Denver", "Denver, Colorado"), 0);
  assert.equal(placeClass("portland", "South Portland, Maine"), 1);
  assert.equal(placeClass("den", "Golden, Colorado"), 2);
  assert.equal(placeClass("Denver", "Henderson, Nevada"), 3);
  assert.equal(placeClass("Denver", "Copenhagen, Capital Region, Denmark"), 4);
  assert.equal(placeClass("Texas", "Austin, Texas"), 4);
  assert.equal(normalise("Coeur d'Alene, Idaho"), "coeur d alene idaho");
  assert.equal(normalise("Århus"), "arhus");
});

test("item 6: the places that already read right still do -- Portland, Coeur d'Alene, Boise, Hartford", () => {
  const cases = [
    ["Portland", ["Portland, Oregon", "Portland, Maine", "Portland, Texas", "South Portland, Maine"]],
    ["portland maine", ["Portland, Maine", "South Portland, Maine"]],
    ["Coeur d'Alene", ["Coeur d'Alene, Idaho"]],
    ["coeur d", ["Coeur d'Alene, Idaho", "Coeur d'Alene Reservation, Idaho"]],
    ["Boise", ["Boise, Idaho", "Boise City, Oklahoma", "Idaho"]],
    ["boise idaho", ["Boise, Idaho"]],
    ["Hartford", ["Hartford, Connecticut", "Hartford, Wisconsin", "Hartford City, Indiana", "West Hartford, Connecticut", "East Hartford, Connecticut"]],
    ["hartford ct", ["Hartford, Connecticut", "West Hartford, Connecticut"]],
  ];
  for (const [q, rows] of cases) {
    const engine = rows.map((l) => P(l));
    assert.deepEqual(labels(rankPlaces(q, engine)), rows, q);
  }
});

test("item 6: a whole state as the fallback keeps its place, and its flag", () => {
  const engine = [P("Texas", "America/Chicago", { approximate: true }), P("Texas City, Texas"), P("Austin, Texas"), P("Dallas, Texas")];
  const ranked = rankPlaces("Texas", engine);
  assert.deepEqual(labels(ranked), ["Texas", "Texas City, Texas", "Austin, Texas", "Dallas, Texas"]);
  assert.equal(ranked[0].approximate, true);
});

test("item 6: nothing to rank, or something odd, is handed back as it came", () => {
  assert.deepEqual(rankPlaces("Denver", []), []);
  const one = [P("Denver, Colorado")];
  assert.equal(rankPlaces("Denver", one), one);
  assert.equal(rankPlaces("Denver", null), null);
  assert.deepEqual(labels(rankPlaces("", [P("B, X"), P("A, Y")])), ["B, X", "A, Y"]);
  assert.deepEqual(rankPlaces("Denver", [null, P("Denver, Colorado")]).map((p) => p?.label ?? null), ["Denver, Colorado", null]);
});

/* ---------------------------------------------- the function, end to end */

const ENV_KEYS = ["ENGINE_KEY", "ENGINE_URL", "RATE_SALT", "NETLIFY_BLOBS_CONTEXT", "RESEND_API_KEY", "CONTEXT"];
const savedEnv = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
const realFetch = globalThis.fetch;
after(() => {
  for (const [k, v] of Object.entries(savedEnv)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  globalThis.fetch = realFetch;
});

test("item 6: /api/places answers town-first, and caches the ranked list", async () => {
  process.env.ENGINE_KEY = "made-up-engine-key";
  process.env.ENGINE_URL = "http://engine.test";
  process.env.RATE_SALT = "made-up-salt";
  delete process.env.RESEND_API_KEY;
  process.env.NETLIFY_BLOBS_CONTEXT = Buffer.from(
    JSON.stringify({ edgeURL: "http://blobs.test", uncachedEdgeURL: "http://blobs.test", siteID: "made-up", token: "made-up", deployID: "made-up" }),
  ).toString("base64");
  const engine = ["Denver, Colorado", "Copenhagen, Capital Region, Denmark", "Odense, South Denmark, Denmark", "Henderson, Nevada"].map((l) => P(l));
  const cached = [];
  globalThis.fetch = async (url, init = {}) => {
    const u = String(url);
    if (u.startsWith("http://engine.test/v1/places")) return new Response(JSON.stringify({ places: engine }), { status: 200 });
    const method = String(init.method ?? "GET").toUpperCase();
    if (method === "PUT" && /places-cache/.test(u)) cached.push(JSON.parse(String(init.body)));
    return method === "GET" ? new Response(null, { status: 404 }) : new Response(null, { status: 200 });
  };
  const places = (await import("../netlify/functions/places.mjs?rank")).default;
  const res = await places(new Request("https://site.example/api/places?q=Denver&limit=25"), { deploy: { id: "rank-test", context: "production" }, ip: "198.51.100.7" });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.deepEqual(labels(body.places), ["Denver, Colorado", "Henderson, Nevada", "Copenhagen, Capital Region, Denmark", "Odense, South Denmark, Denmark"]);
  assert.equal(cached.length, 1);
  assert.deepEqual(labels(cached[0].places), labels(body.places));
});
