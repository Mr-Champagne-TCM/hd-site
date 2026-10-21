/**
 * THE CHART ENGINE, LOCALLY. The live engine on Fly needs a key that lives
 * only in Netlify's secret environment (unreadable by design), so the rig runs
 * the same engine here: the JVM service from ../hd-engine's own build jars,
 * on a loopback port, with a throwaway key made for this run. No network.
 *
 * In front of it, a RECORD/REPLAY CACHE keyed by the exact request body, so a
 * machine without Java (or a run with --engine=cache) still answers every
 * chart the rig has ever asked for. A miss with no engine is an error that
 * names the combination, never a silent fake chart.
 */
import { spawn } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { ENGINE_CACHE, SIBLINGS } from "./paths.mjs";

const GRADLE = join(homedir(), ".gradle", "caches", "modules-2", "files-2.1");

function newest(dir, re) {
  if (!existsSync(dir)) return null;
  const hits = readdirSync(dir).filter((f) => re.test(f));
  if (!hits.length) return null;
  const v = (f) => f.match(/(\d+)\.(\d+)\.(\d+)/)?.slice(1).map(Number) ?? [0, 0, 0];
  hits.sort((a, b) => {
    const [x, y] = [v(a), v(b)];
    return x[0] - y[0] || x[1] - y[1] || x[2] - y[2];
  });
  return join(dir, hits.at(-1));
}

function gradleJar(group, name, version) {
  const base = join(GRADLE, group, name, version);
  if (!existsSync(base)) return null;
  for (const h of readdirSync(base)) {
    const f = join(base, h, `${name}-${version}.jar`);
    if (existsSync(f)) return f;
  }
  return null;
}

/** The classpath the engine's own Gradle build resolves (gradle/libs.versions.toml). */
export function engineClasspath(root = SIBLINGS.engine) {
  const toml = existsSync(join(root, "gradle", "libs.versions.toml"))
    ? readFileSync(join(root, "gradle", "libs.versions.toml"), "utf8")
    : "";
  const ver = (k, d) => toml.match(new RegExp(`^${k}\\s*=\\s*"([^"]+)"`, "m"))?.[1] ?? d;
  const kotlin = ver("kotlin", "2.3.20");
  const ser = ver("serializationJson", "1.9.0");
  const astro = ver("astronomy", "v2.1.19");
  const parts = [
    newest(join(root, "api", "build", "libs"), /^api-\d+\.\d+\.\d+\.jar$/),
    newest(join(root, "engine", "build", "libs"), /^engine-\d+\.\d+\.\d+\.jar$/),
    gradleJar("org.jetbrains.kotlin", "kotlin-stdlib", kotlin),
    gradleJar("org.jetbrains.kotlinx", "kotlinx-serialization-core-jvm", ser),
    gradleJar("org.jetbrains.kotlinx", "kotlinx-serialization-json-jvm", ser),
    gradleJar("com.github.cosinekitty", "astronomy", astro),
  ];
  const missing = parts.findIndex((p) => !p);
  return missing === -1 ? { ok: true, cp: parts } : { ok: false, missing: ["api jar", "engine jar", "kotlin-stdlib", "serialization-core", "serialization-json", "astronomy"][missing] };
}

/**
 * Start the engine. Resolves to { url, key, version, stop } or { url: null }
 * when it cannot run (then only the cache answers).
 */
export async function startEngine({ mode = "local", port = 0, log = () => {} } = {}) {
  if (mode === "cache") return { url: null, key: null, version: "cache", stop: async () => {} };
  const found = engineClasspath();
  if (!found.ok) {
    log(`engine: cannot run locally (${found.missing} not found); answering from the cache only`);
    return { url: null, key: null, version: "cache", stop: async () => {} };
  }
  const key = randomBytes(18).toString("hex");
  const p = port || 18900 + Math.floor(Math.random() * 90);
  const child = spawn("java", ["-Xmx384m", "-cp", found.cp.join(process.platform === "win32" ? ";" : ":"), "com.tcm.hd.api.ServerKt"], {
    env: { ...process.env, PORT: String(p), ENGINE_KEYS: `${key}:2:1000000` },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });
  let out = "";
  child.stdout.on("data", (d) => (out += d));
  child.stderr.on("data", (d) => (out += d));
  const url = `http://127.0.0.1:${p}`;
  const t0 = Date.now();
  let version = null;
  while (Date.now() - t0 < 30_000) {
    if (child.exitCode !== null) break;
    try {
      const r = await fetch(`${url}/v1/health`);
      if (r.ok) {
        version = (await r.json()).engineVersion;
        break;
      }
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  if (!version) {
    child.kill();
    log(`engine: did not start (${out.slice(-300)}); answering from the cache only`);
    return { url: null, key: null, version: "cache", stop: async () => {} };
  }
  log(`engine: ${version} on ${url} (local JVM, pid ${child.pid})`);
  return {
    url,
    key,
    version,
    pid: child.pid,
    stop: async () => {
      if (child.exitCode === null) {
        child.kill();
        await new Promise((r) => {
          child.once("exit", r);
          setTimeout(r, 3000);
        });
      }
    },
  };
}

/**
 * The cache in front of the engine. `ask(path, body)` returns the engine's
 * {status, json}. Recorded answers are written to ENGINE_CACHE/<sha>.json.
 */
export function engineCache(engine, { dir = ENGINE_CACHE, log = () => {} } = {}) {
  mkdirSync(dir, { recursive: true });
  const stats = { hits: 0, live: 0, misses: 0 };
  const file = (k) => join(dir, createHash("sha256").update(k).digest("hex").slice(0, 32) + ".json");
  async function ask(method, path, body = null) {
    const k = `${method} ${path} ${body ?? ""}`;
    const f = file(k);
    if (engine.url) {
      const res = await fetch(`${engine.url}${path}`, {
        method,
        headers: { "Content-Type": "application/json", "X-Engine-Key": engine.key },
        ...(body ? { body } : {}),
      });
      const json = await res.json().catch(() => null);
      stats.live += 1;
      if (res.ok) writeFileSync(f, JSON.stringify({ k, status: res.status, json, version: engine.version }));
      return { status: res.status, json };
    }
    if (existsSync(f)) {
      stats.hits += 1;
      const c = JSON.parse(readFileSync(f, "utf8"));
      return { status: c.status, json: c.json };
    }
    stats.misses += 1;
    log(`engine-cache: MISS with no engine for ${path}`);
    return { status: 503, json: { error: { code: "rig_no_engine", message: "The rig has no engine and no cached answer for this chart." } } };
  }
  return { ask, stats };
}
