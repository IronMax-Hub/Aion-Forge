// Statistics harness: `npm run stats`.
//
// Why it exists: every change to the simulation rules shifts what universes
// contain. This measures the shift, so drift is a recorded decision rather
// than a surprise. It is a vitest bench file, so `npm test` never runs it.
//
// What it does: generates seeds 100000, 42 and 7777 under each of the six
// presets, surveys life in each universe, prints a table and appends it to
// Documents/stats.md with the commit it was measured at. The counts are
// deterministic; only the timings vary between runs.
//
// Later phases add their own columns (ocean fraction, climate history and
// evolution measures) when the simulation produces them.

import { execSync } from "node:child_process";
import { appendFileSync, existsSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { bench, describe } from "vitest";
import { makeConfig, PRESETS } from "../src/simulation/config";
import type { UniverseConfig } from "../src/simulation/config";
import { buildGalaxyConfig } from "../src/simulation/galaxy";
import { generateStarsFor, UNIVERSE_AGE_GYR } from "../src/simulation/star";
import type { Star } from "../src/simulation/star";
import { surveyLife, ORGANISM_STAGES } from "../src/simulation/lifeSurvey";
import { generatePlanetsFor } from "../src/simulation/planet";
import { derivePhysics } from "../src/simulation/planetPhysics";
import { buildGeography, hasSolidSurface } from "../src/simulation/geography";
import type { LifeSurvey } from "../src/simulation/lifeSurvey";
import { SIMULATION_RULES_VERSION } from "../src/simulation/version";

const SEEDS = [100000, 42, 7777];
const TIMING_RUNS = 5;
const STATS_FILE = fileURLToPath(new URL("../../Documents/stats.md", import.meta.url));

interface Geographies {
  solidPlanets: number;
  medianOcean: number;     // ocean cover at formation, median over solid planets
  oceanWorldShare: number; // solid planets more than 90% ocean
  dryShare: number;        // solid planets less than 3% ocean
  ms: number;              // one pass over every solid planet
}

interface Row {
  preset: string;
  seed: number;
  survey: LifeSurvey;
  lockedShare: number;   // tidally locked planets, share of all planets
  geography: Geographies;
  surveyMs: number;
}

function starsOf(seed: number, config: UniverseConfig): Star[] {
  return generateStarsFor(buildGalaxyConfig(seed, config), UNIVERSE_AGE_GYR, config).stars;
}

function lockedShare(stars: Star[], seed: number, config: UniverseConfig): number {
  let planets = 0;
  let locked = 0;
  for (const star of stars) {
    for (const planet of generatePlanetsFor(star, seed, config).planets) {
      planets++;
      if (derivePhysics(planet, star, seed, config).tidallyLocked) locked++;
    }
  }
  return planets === 0 ? 0 : locked / planets;
}

function geographies(stars: Star[], seed: number, config: UniverseConfig): Geographies {
  const solid = stars.flatMap((star) => generatePlanetsFor(star, seed, config).planets
    .filter(hasSolidSurface)
    .map((planet) => ({ planet, physics: derivePhysics(planet, star, seed, config) })));
  const start = performance.now();
  const oceans = solid.map(({ planet, physics }) => buildGeography(planet, physics, seed).oceanFraction);
  const ms = performance.now() - start;
  oceans.sort((a, b) => a - b);
  const share = (inClass: (ocean: number) => boolean) => oceans.filter(inClass).length / Math.max(1, oceans.length);
  return {
    solidPlanets: solid.length,
    medianOcean: oceans.length === 0 ? 0 : oceans[Math.floor(oceans.length / 2)],
    oceanWorldShare: share((o) => o > 0.9),
    dryShare: share((o) => o < 0.03),
    ms,
  };
}

/** Median wall-clock time of the survey alone, in ms. */
function medianSurveyMs(stars: Star[], seed: number, config: UniverseConfig): number {
  const times: number[] = [];
  for (let i = 0; i < TIMING_RUNS; i++) {
    const start = performance.now();
    surveyLife(stars, seed, config);
    times.push(performance.now() - start);
  }
  return times.sort((a, b) => a - b)[Math.floor(TIMING_RUNS / 2)];
}

function measure(): Row[] {
  const rows: Row[] = [];
  for (const preset of PRESETS) {
    for (const seed of SEEDS) {
      const config = makeConfig(seed, preset.values);
      const stars = starsOf(seed, config);
      rows.push({
        preset: preset.name, seed, survey: surveyLife(stars, seed, config),
        lockedShare: lockedShare(stars, seed, config), geography: geographies(stars, seed, config),
        surveyMs: medianSurveyMs(stars, seed, config),
      });
    }
  }
  return rows;
}

function stageMix(survey: LifeSurvey): string {
  return ORGANISM_STAGES.map((stage) => survey.systems.filter((s) => s.mostAdvancedStage === stage).length).join(" / ");
}

function table(rows: Row[]): string {
  const lines = [
    "| Preset | Seed | Planets | Tidally locked | Solid planets | Median ocean cover at formation | Ocean worlds (> 90%) | Dry (< 3%) | Life-bearing planets | Systems with organisms | Systems by most advanced stage (micro / multi / complex / dominant) | Civilizations | Survey (ms) | Geography (ms) |",
    "|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|---:|---:|---:|",
  ];
  const percent = (share: number) => `${(share * 100).toFixed(1)}%`;
  for (const { preset, seed, survey, lockedShare: locked, geography: g, surveyMs } of rows) {
    lines.push(`| ${preset} | ${seed} | ${survey.totalPlanets} | ${percent(locked)} | ${g.solidPlanets} | ${percent(g.medianOcean)} | ${percent(g.oceanWorldShare)} | ${percent(g.dryShare)} | ${survey.lifeBearingPlanets} | ${survey.systems.length} | ${stageMix(survey)} | ${survey.civilizationCount} | ${surveyMs.toFixed(1)} | ${g.ms.toFixed(0)} |`);
  }
  return lines.join("\n");
}

function commitId(): string {
  try {
    const sha = execSync("git rev-parse --short HEAD", { encoding: "utf8" }).trim();
    const dirty = execSync("git status --porcelain --untracked-files=no", { encoding: "utf8" }).trim() !== "";
    return dirty ? `${sha} + uncommitted changes` : sha;
  } catch {
    return "unknown";
  }
}

const FILE_HEADER = `# Universe statistics

Appended by \`npm run stats\` (frontend/stats/universeStats.bench.ts). Each entry measures seeds 100000, 42 and 7777 under the six presets, so the effect of every simulation change is recorded. Counts are deterministic; survey times are medians of ${TIMING_RUNS} runs on the machine that ran it and vary between runs.

"Life-bearing planets" includes prebiotic chemistry; "systems with organisms" counts systems with at least one microbial or more advanced world.
`;

const rows = measure();
const report = table(rows);
const entry = `\n## ${new Date().toISOString().slice(0, 10)} · commit ${commitId()} · rules v${SIMULATION_RULES_VERSION}\n\n${report}\n`;
if (!existsSync(STATS_FILE)) writeFileSync(STATS_FILE, FILE_HEADER);
appendFileSync(STATS_FILE, entry);
console.log(`${report}\n\nAppended to ${STATS_FILE}`);

// Statistically sound timing for the reference universe, from vitest's own benchmark runner
describe("life survey", () => {
  const seed = SEEDS[0];
  const config = makeConfig(seed);
  const stars = starsOf(seed, config);
  bench(`seed ${seed}, default parameters`, () => { surveyLife(stars, seed, config); });
});
