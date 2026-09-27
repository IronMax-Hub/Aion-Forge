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
// evolution measures) when the simulation produces them. Since C2.3b: worlds
// that ever had life, worlds living today, and the median time life began
// (after the loop's start, 0.5 Gyr after the star formed).

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
import type { Geography } from "../src/simulation/geography";
import { runWorldHistory, FORMATION_DELAY_GYR } from "../src/simulation/worldHistory";
import type { WorldHistory } from "../src/simulation/worldHistory";
import type { LifeSurvey } from "../src/simulation/lifeSurvey";
import { SIMULATION_RULES_VERSION } from "../src/simulation/version";

const SEEDS = [100000, 42, 7777];
// Since C2.3b each survey also evolves life on every planet where it begins (a minute or more here), so one timed run
const TIMING_RUNS = 1;
const STATS_FILE = fileURLToPath(new URL("../../Documents/stats.md", import.meta.url));

interface Geographies {
  solidPlanets: number;
  medianOcean: number;     // ocean cover at formation, median over solid planets
  oceanWorldShare: number; // solid planets more than 90% ocean
  dryShare: number;        // solid planets less than 3% ocean
  ms: number;              // one pass over every solid planet
}

interface Histories {
  frozeShare: number;          // froze over at least once
  runawayShare: number;
  oceansLostShare: number;
  oxidisedShare: number;       // oxygen from life (since C2.3b) or left by escaping water
  liquidTodayShare: number;    // more than 1% open water today
  noLandRunawayShare: number;  // of the worlds that formed with no land
  everLifeShare: number;       // life began at some time (C2.3b)
  livingShare: number;         // life lives today
  medianLifeStartGyr: number;  // after the loop's start, over worlds where life began
  ms: number;
}

interface Row {
  preset: string;
  seed: number;
  survey: LifeSurvey;
  lockedShare: number;   // tidally locked planets, share of all planets
  geography: Geographies;
  history: Histories;
  surveyMs: number;
}

function starsOf(seed: number, config: UniverseConfig): Star[] {
  return generateStarsFor(buildGalaxyConfig(seed, config), UNIVERSE_AGE_GYR, config).stars;
}

/** Tidal locking over all planets, and the geography and world history of every solid planet, each timed over one pass. */
function solidWorlds(stars: Star[], seed: number, config: UniverseConfig): { lockedShare: number; geography: Geographies; history: Histories } {
  const all = stars.flatMap((star) => generatePlanetsFor(star, seed, config).planets
    .map((planet) => ({ star, planet, physics: derivePhysics(planet, star, seed, config) })));
  const lockedShare = all.length === 0 ? 0 : all.filter((p) => p.physics.tidallyLocked).length / all.length;
  const solid = all.filter(({ planet }) => hasSolidSurface(planet));

  let start = performance.now();
  const geographies: Geography[] = solid.map(({ planet, physics }) => buildGeography(planet, physics, seed));
  const geographyMs = performance.now() - start;
  start = performance.now();
  const histories: WorldHistory[] = solid.map(({ star, planet, physics }, i) =>
    runWorldHistory(planet, physics, geographies[i], star, seed, config));
  const historyMs = performance.now() - start;

  const shareOf = <T>(items: T[], inClass: (item: T) => boolean) => items.filter(inClass).length / Math.max(1, items.length);
  const oceans = geographies.map((g) => g.oceanFraction).sort((a, b) => a - b);
  const had = (kind: string) => (h: WorldHistory) => h.events.some((e) => e.kind === kind);
  const noLand = histories.filter((_, i) => geographies[i].oceanFraction === 1);
  const lifeStarts = histories.filter((h) => h.life !== null)
    .map((h) => h.life!.startedGyr - FORMATION_DELAY_GYR).sort((a, b) => a - b);
  return {
    lockedShare,
    geography: {
      solidPlanets: solid.length,
      medianOcean: oceans.length === 0 ? 0 : oceans[Math.floor(oceans.length / 2)],
      oceanWorldShare: shareOf(oceans, (o) => o > 0.9),
      dryShare: shareOf(oceans, (o) => o < 0.03),
      ms: geographyMs,
    },
    history: {
      frozeShare: shareOf(histories, had("freezes-over")),
      runawayShare: shareOf(histories, had("runaway-greenhouse")),
      oceansLostShare: shareOf(histories, had("oceans-lost")),
      oxidisedShare: shareOf(histories, had("oxidation")),
      liquidTodayShare: shareOf(histories, (h) => h.present.oceanFraction > 0.01),
      noLandRunawayShare: shareOf(noLand, had("runaway-greenhouse")),
      everLifeShare: shareOf(histories, (h) => h.life !== null),
      livingShare: shareOf(histories, (h) => h.life !== null && h.life.endedGyr === null),
      medianLifeStartGyr: lifeStarts.length === 0 ? NaN : lifeStarts[Math.floor(lifeStarts.length / 2)],
      ms: historyMs,
    },
  };
}

/** The survey, and the median wall-clock time of the survey alone over TIMING_RUNS runs, in ms. */
function timedSurvey(stars: Star[], seed: number, config: UniverseConfig): { survey: LifeSurvey; surveyMs: number } {
  const times: number[] = [];
  let survey: LifeSurvey | undefined;
  for (let i = 0; i < TIMING_RUNS; i++) {
    const start = performance.now();
    survey = surveyLife(stars, seed, config);
    times.push(performance.now() - start);
  }
  return { survey: survey!, surveyMs: times.sort((a, b) => a - b)[Math.floor(TIMING_RUNS / 2)] };
}

function measure(): Row[] {
  const rows: Row[] = [];
  for (const preset of PRESETS) {
    for (const seed of SEEDS) {
      const config = makeConfig(seed, preset.values);
      const stars = starsOf(seed, config);
      rows.push({ preset: preset.name, seed, ...timedSurvey(stars, seed, config), ...solidWorlds(stars, seed, config) });
    }
  }
  return rows;
}

function stageMix(survey: LifeSurvey): string {
  return ORGANISM_STAGES.map((stage) => survey.systems.filter((s) => s.mostAdvancedStage === stage).length).join(" / ");
}

function table(rows: Row[]): string {
  const lines = [
    "| Preset | Seed | Planets | Tidally locked | Solid planets | Median ocean cover at formation | Ocean worlds (> 90%) | Dry (< 3%) | Ever froze over | Runaway greenhouse | Oceans lost | Oxidised (by life or water loss) | Liquid water today | Runaway, worlds formed with no land | Ever had life | Living today | Median life start (Gyr) | Life-bearing planets | Systems with organisms | Systems by most advanced stage (micro / multi / complex / dominant) | Civilizations | Survey (ms) | Geography (ms) | World history (ms) |",
    "|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|---:|---:|---:|---:|",
  ];
  const percent = (share: number) => `${(share * 100).toFixed(1)}%`;
  for (const { preset, seed, survey, lockedShare: locked, geography: g, history: h, surveyMs } of rows) {
    lines.push(`| ${preset} | ${seed} | ${survey.totalPlanets} | ${percent(locked)} | ${g.solidPlanets} | ${percent(g.medianOcean)} | ${percent(g.oceanWorldShare)} | ${percent(g.dryShare)} | ${percent(h.frozeShare)} | ${percent(h.runawayShare)} | ${percent(h.oceansLostShare)} | ${percent(h.oxidisedShare)} | ${percent(h.liquidTodayShare)} | ${percent(h.noLandRunawayShare)} | ${percent(h.everLifeShare)} | ${percent(h.livingShare)} | ${Number.isNaN(h.medianLifeStartGyr) ? "–" : h.medianLifeStartGyr.toFixed(1)} | ${survey.lifeBearingPlanets} | ${survey.systems.length} | ${stageMix(survey)} | ${survey.civilizationCount} | ${surveyMs.toFixed(1)} | ${g.ms.toFixed(0)} | ${h.ms.toFixed(0)} |`);
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
  // One run: a survey takes a minute or more since C2.3b
  bench(`seed ${seed}, default parameters`, () => { surveyLife(stars, seed, config); },
    { iterations: 1, time: 0, warmupIterations: 0, warmupTime: 0 });
});
