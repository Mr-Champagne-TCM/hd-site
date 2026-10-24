import { test, after } from "node:test";
import assert from "node:assert/strict";
import { buildSync } from "esbuild";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { pathToFileURL } from "node:url";
import { MESSAGES } from "../shared/customerMessages.mjs";

/**
 * BATCH-1024 ITEM 3 (live retest 10/23): on the add-time page, when fetch
 * itself failed (the connection dropped; nothing reached the server) the page
 * showed "addtime-slow", which says "Jeremy has been told" -- untrue when
 * nothing arrived. The catch branch now has its own honest line; a server
 * that answered keeps its words.
 *
 * No DOM here, so the form is run as a function: AddTime.tsx is bundled with
 * a stand-in React whose useState keeps its values where the test can read
 * them, and the form's own onSubmit is called with fetch stubbed.
 */

const dir = mkdtempSync(join(tmpdir(), "addtime-dropped-"));
after(() => rmSync(dir, { recursive: true, force: true }));
writeFileSync(
  join(dir, "react.js"),
  `export const H = { states: [], i: 0 };
export function useState(init) {
  const k = H.i++;
  if (!(k in H.states)) H.states[k] = typeof init === "function" ? init() : init;
  return [H.states[k], (v) => { H.states[k] = typeof v === "function" ? v(H.states[k]) : v; }];
}
export const useEffect = () => {};
export const useLayoutEffect = () => {};
export const useRef = (v = null) => ({ current: v });
export const useMemo = (f) => f();
export const useCallback = (f) => f;
export const useId = () => "id";
export const Fragment = "fragment";
export const createElement = (type, props, ...children) => ({ type, props: { ...props, children } });
export default { useState, useEffect, useLayoutEffect, useRef, useMemo, useCallback, useId, Fragment, createElement };
`,
);
writeFileSync(
  join(dir, "jsx-runtime.js"),
  `export const jsx = (type, props) => ({ type, props });
export const jsxs = jsx;
export const Fragment = "fragment";
`,
);
const out = join(dir, "addtime.mjs");
buildSync({
  stdin: {
    contents: `export * from ${JSON.stringify(join(process.cwd(), "src", "AddTime.tsx").replace(/\\/g, "/"))};\nexport { H } from "react";\n`,
    resolveDir: process.cwd(),
    loader: "ts",
  },
  bundle: true,
  outfile: out,
  format: "esm",
  platform: "node",
  jsx: "automatic",
  jsxImportSource: "fakejsx",
  alias: { react: join(dir, "react.js"), "fakejsx/jsx-runtime": join(dir, "jsx-runtime.js") },
  loader: { ".css": "empty" },
  logLevel: "silent",
});
const M = await import(pathToFileURL(out).href);

function find(node, type) {
  if (!node || typeof node !== "object") return null;
  if (Array.isArray(node)) {
    for (const n of node) {
      const f = find(n, type);
      if (f) return f;
    }
    return null;
  }
  if (node.type === type) return node;
  return find(node.props?.children, type);
}

/** The form, a time typed, submitted with `fetchImpl` standing in for the network. Returns the state it ends in. */
async function submitWith(fetchImpl, tier = 1) {
  M.H.states = [];
  M.H.i = 0;
  M.AddTimeForm({ token: "made-up-token", tier, kept: null });
  M.H.states[0] = "14:30"; // the time field
  M.H.i = 0;
  const form = find(M.AddTimeForm({ token: "made-up-token", tier, kept: null }), "form");
  assert.ok(form, "no form rendered");
  const real = globalThis.fetch;
  globalThis.fetch = fetchImpl;
  try {
    await form.props.onSubmit({ preventDefault() {} });
  } finally {
    globalThis.fetch = real;
  }
  return M.H.states[1];
}

const DROPPED = MESSAGES["addtime-connection-dropped"].text;

test("item 3: the connection dropped -- its own line, and it does not say Jeremy was told", async () => {
  for (const tier of [0, 1, 2]) {
    const state = await submitWith(async () => {
      throw new TypeError("Failed to fetch");
    }, tier);
    assert.equal(state.at, "failed");
    assert.equal(state.message, DROPPED, `tier ${tier}`);
    assert.doesNotMatch(state.message, /has been told|Jeremy/);
  }
});

test("item 3: the words are honest, his voice, and keep the catalogue's rules", () => {
  assert.equal(
    DROPPED,
    "That didn’t reach me — the connection dropped, so nothing has changed. The time you chose is still in the form; another try usually works.",
  );
  assert.equal(MESSAGES["addtime-connection-dropped"].act, false);
  assert.doesNotMatch(DROPPED, /'/, "a straight apostrophe");
  assert.doesNotMatch(DROPPED, /\bwe\b|\bplease\b/i);
});

test("item 3: a server that answered keeps its words", async () => {
  // The server's own sentence when it sent one.
  const said = await submitWith(async () =>
    new Response(JSON.stringify({ ok: false, error: { message: "The server’s own sentence." } }), { status: 503 }),
  );
  assert.equal(said.message, "The server’s own sentence.");
  // An answer with no readable words: the slow line, as before ("Jeremy has been told" is true there).
  for (const [tier, key] of [
    [1, "addtime-slow"],
    [0, "addtime-slow-summary"],
  ]) {
    const bare = await submitWith(async () => new Response("<html>bad gateway</html>", { status: 502 }), tier);
    assert.equal(bare.message, MESSAGES[key].text, key);
  }
  assert.match(MESSAGES["addtime-slow"].text, /Jeremy has been told/, "the server-failure text changed");
});
