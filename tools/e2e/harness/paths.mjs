/**
 * WHERE EVERYTHING IS, worked out once.
 *
 * The rig lives in this (public) repo, but what it reads and writes does not:
 *
 *   - the sibling repos it tests against (the website, the phone app's
 *     readings site, the chart engine), found next to this checkout;
 *   - its DATA HOME: replay fixtures (real model writing for made-up people,
 *     which this public repo never carries -- see .gitignore on
 *     test/fixtures/phone-parity.local/), the engine answer cache, every run's
 *     captures and the text baseline. Captures hold rendered bodygraphs, which
 *     tools/leak-scan.mjs refuses anywhere inside the repo tree, so the data
 *     home is outside it by design.
 *
 * Override with HD_WORKSPACE (the folder holding hd-site, hd-engine,
 * the-champagne-method, hd-reading-app) and HD_E2E_HOME (the data home).
 */
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
export const REPO = resolve(HERE, "..", "..", "..");
export const E2E = resolve(HERE, "..");

function workspace() {
  if (process.env.HD_WORKSPACE) return resolve(process.env.HD_WORKSPACE);
  const parent = resolve(REPO, "..");
  if (existsSync(join(parent, "hd-engine")) && existsSync(join(parent, "the-champagne-method"))) return parent;
  return join(homedir(), "Documents", "Claude Code Workspace");
}

export const WORKSPACE = workspace();
export const SIBLINGS = {
  engine: join(WORKSPACE, "hd-engine"),
  website: join(WORKSPACE, "the-champagne-method"),
  phone: join(WORKSPACE, "hd-reading-app"),
};
export const HOME = process.env.HD_E2E_HOME ? resolve(process.env.HD_E2E_HOME) : join(WORKSPACE, "hd-e2e");
export const FIXTURES = join(HOME, "fixtures");
export const ENGINE_CACHE = join(HOME, "engine-cache");
export const RUNS = join(HOME, "runs");
export const BASELINE = join(HOME, "baseline");
