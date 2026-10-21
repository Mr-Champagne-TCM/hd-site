#!/usr/bin/env node
/**
 * Just the local shop, for clicking around by hand: same fakes as a full run,
 * nothing driven. Stops on Ctrl+C (or when stdin closes).
 *
 * usage: node tools/e2e/serve.mjs [--engine=local|cache] [--for=<minutes>]
 * Build first if src/ changed: npm run build
 */
import { join } from "node:path";
import { startRig } from "./harness/server.mjs";
import { FIXTURES, RUNS } from "./harness/paths.mjs";

const engineMode = (process.argv.find((a) => a.startsWith("--engine=")) ?? "--engine=local").split("=")[1];
const runDir = join(RUNS, "serve-" + new Date().toISOString().replace(/[:.]/g, "-"));
const rig = await startRig({ runDir, fixturesDir: FIXTURES, engineMode, log: (m) => process.stdout.write(m + "\n") });
process.stdout.write(`shop: ${rig.origin}\noutbox: ${join(runDir, "outbox")}\nfake Stripe code for $0: RIGFREE100\n`);
const stop = async () => {
  await rig.stop();
  process.exit(0);
};
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
const minutes = Number((process.argv.find((a) => a.startsWith("--for=")) ?? "--for=0").split("=")[1]);
if (minutes > 0) setTimeout(stop, minutes * 60_000);
else if (process.stdin.isTTY) process.stdin.resume();
else setInterval(() => {}, 1 << 30);
