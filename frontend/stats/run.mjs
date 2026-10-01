// Statistics harness: `npm run stats`.
//
// Measures seeds 100000, 42 and 7777 under each of the six presets
// (universe.ts), prints a table and appends it to Documents/stats.md with the
// commit it was measured at. The counts are deterministic; only the timings
// vary between runs.
//
// Universes are independent, so they are measured in parallel: one worker
// thread per core, less one, each loading the TypeScript simulation through
// Vite's module runner (runnerImport, marked experimental in Vite 8) and
// taking the next universe when it finishes one. Rows are put back in table
// order, so the report does not depend on which worker measured what.
// Timings are taken while the other workers run, so they are slower than a
// universe measured alone would be.

import { execSync } from "node:child_process";
import { appendFileSync, existsSync, writeFileSync } from "node:fs";
import { availableParallelism } from "node:os";
import { fileURLToPath } from "node:url";
import { isMainThread, parentPort, Worker } from "node:worker_threads";
import { runnerImport } from "vite";

const UNIVERSE_MODULE = fileURLToPath(new URL("./universe.ts", import.meta.url));
const STATS_FILE = fileURLToPath(new URL("../../Documents/stats.md", import.meta.url));
const VERSION_MODULE = fileURLToPath(new URL("../src/simulation/version.ts", import.meta.url));

const FILE_HEADER = `# Universe statistics

Appended by \`npm run stats\` (frontend/stats/run.mjs). Each entry measures seeds 100000, 42 and 7777 under the six presets, so the effect of every simulation change is recorded. Counts are deterministic; times are from one run on the machine that ran it, with the universes measured in parallel, and vary between runs.

"Life-bearing planets" includes prebiotic chemistry; "systems with organisms" counts systems with at least one microbial or more advanced world.
`;

/** Loads a TypeScript module of the project, without the app's Vite config (no React plugin needed). */
async function load(path) {
  return (await runnerImport(path, { configFile: false, logLevel: "error" })).module;
}

if (!isMainThread) {
  // A worker: measure each universe it is sent, until told to stop
  const { measureUniverse } = await load(UNIVERSE_MODULE);
  parentPort.on("message", (job) => {
    if (job === null) process.exit(0);
    parentPort.postMessage({ index: job.index, row: measureUniverse(job.preset, job.seed) });
  });
  parentPort.postMessage({ ready: true });
} else {
  const { universes, table, ordersReport } = await load(UNIVERSE_MODULE);
  const { SIMULATION_RULES_VERSION } = await load(VERSION_MODULE);
  const jobs = universes().map((u, index) => ({ ...u, index }));
  const rows = new Array(jobs.length);
  const size = Math.max(1, Math.min(jobs.length, availableParallelism() - 1));
  const started = Date.now();
  let next = 0;
  let finished = 0;

  await new Promise((resolve, reject) => {
    for (let w = 0; w < size; w++) {
      const worker = new Worker(fileURLToPath(import.meta.url));
      const give = () => worker.postMessage(next < jobs.length ? jobs[next++] : null);
      worker.on("message", (message) => {
        if (!message.ready) {
          rows[message.index] = message.row;
          finished++;
          const { preset, seed } = jobs[message.index];
          console.log(`${finished}/${jobs.length} ${preset} ${seed} (${((Date.now() - started) / 1000).toFixed(0)} s)`);
          if (finished === jobs.length) resolve();
        }
        give();
      });
      worker.on("error", reject);
    }
  });

  const report = `${table(rows)}\n\n${ordersReport(rows)}`;
  const entry = `\n## ${new Date().toISOString().slice(0, 10)} · commit ${commitId()} · rules v${SIMULATION_RULES_VERSION}\n\n${report}\n`;
  if (!existsSync(STATS_FILE)) writeFileSync(STATS_FILE, FILE_HEADER);
  appendFileSync(STATS_FILE, entry);
  console.log(`${report}\n\nMeasured ${jobs.length} universes on ${size} workers in ${((Date.now() - started) / 1000).toFixed(0)} s. Appended to ${STATS_FILE}`);
}

function commitId() {
  try {
    const sha = execSync("git rev-parse --short HEAD", { encoding: "utf8" }).trim();
    const dirty = execSync("git status --porcelain --untracked-files=no", { encoding: "utf8" }).trim() !== "";
    return dirty ? `${sha} + uncommitted changes` : sha;
  } catch {
    return "unknown";
  }
}
