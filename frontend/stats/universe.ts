// One universe's statistics, for the stats harness (run.mjs).
//
// Why it exists: every change to the simulation rules shifts what universes
// contain. The harness measures the shift, so drift is a recorded decision
// rather than a surprise.
//
// How: one pass per universe. The life survey makes every star's planets, and
// each solid planet's physics, geography and world history, exactly once; the
// harness wraps how those are made (lifeSurvey's planetsOf, planet's worldOf)
// to time them and read their histories as they go by. Before 2026-10-02 the
// harness ran each history three times per universe.
//
// Since C2.3b: worlds that ever had life, worlds living today, and the median
// time life began (after the loop's start, 0.5 Gyr after the star formed).

import { makeConfig, PRESETS } from "../src/simulation/config";
import { buildGalaxyConfig } from "../src/simulation/galaxy";
import { generateStarsFor, UNIVERSE_AGE_GYR } from "../src/simulation/star";
import type { Star } from "../src/simulation/star";
import { surveyLife, ORGANISM_STAGES } from "../src/simulation/lifeSurvey";
import type { LifeSurvey } from "../src/simulation/lifeSurvey";
import { generatePlanetsFor } from "../src/simulation/planet";
import type { Planet, SolidWorld } from "../src/simulation/planet";
import { derivePhysics } from "../src/simulation/planetPhysics";
import { buildGeography } from "../src/simulation/geography";
import { runWorldHistory, FORMATION_DELAY_GYR } from "../src/simulation/worldHistory";
import type { UniverseConfig } from "../src/simulation/config";
import { EARTH_PATH, firstsOrder } from "./earthPath";

export const SEEDS = [100000, 42, 7777];

export interface Geographies {
  solidPlanets: number;
  medianOcean: number;     // ocean cover at formation, median over solid planets
  oceanWorldShare: number; // solid planets more than 90% ocean
  dryShare: number;        // solid planets less than 3% ocean
  ms: number;              // summed over every solid planet
}

export interface Histories {
  frozeShare: number;          // froze over at least once
  runawayShare: number;
  oceansLostShare: number;
  oxidisedShare: number;       // oxygen from life (since C2.3b) or left by escaping water
  liquidTodayShare: number;    // more than 1% open water today
  noLandRunawayShare: number;  // of the worlds that formed with no land
  everLifeShare: number;       // life began at some time (C2.3b)
  livingShare: number;         // life lives today
  medianLifeStartGyr: number;  // after the loop's start, over worlds where life began
  /** Worlds with a mind, by the order of their firsts (earthPath.ts, C2.10). */
  mindOrders: Record<string, number>;
  ms: number;                  // summed over every solid planet
}

export interface Row {
  preset: string;
  seed: number;
  survey: LifeSurvey;
  lockedShare: number;   // tidally locked planets, share of all planets
  geography: Geographies;
  history: Histories;
  surveyMs: number;      // the whole pass: survey, geography and histories
}

const median = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted.length === 0 ? NaN : sorted[Math.floor(sorted.length / 2)];
};

/** Measures one universe: a preset (by name) and a seed. */
export function measureUniverse(presetName: string, seed: number): Row {
  const preset = PRESETS.find((p) => p.name === presetName);
  if (!preset) throw new Error(`no preset named ${presetName}`);
  const config: UniverseConfig = makeConfig(seed, preset.values);
  const stars = generateStarsFor(buildGalaxyConfig(seed, config), UNIVERSE_AGE_GYR, config).stars;

  // Counted as each solid planet's world is made
  const oceans: number[] = [];
  const lifeStarts: number[] = [];
  const mindOrders: Record<string, number> = {};
  const counts = { froze: 0, runaway: 0, oceansLost: 0, oxidised: 0, liquidToday: 0, noLand: 0, noLandRunaway: 0, everLife: 0, living: 0 };
  let geographyMs = 0;
  let historyMs = 0;
  // The same steps as solidWorldOf, timed, with each history read and let go
  const worldOf = (planet: Planet, star: Star, galaxySeed: number, cfg?: UniverseConfig): SolidWorld => {
    const physics = derivePhysics(planet, star, galaxySeed, cfg ?? config);
    let start = performance.now();
    const geography = buildGeography(planet, physics, galaxySeed);
    geographyMs += performance.now() - start;
    start = performance.now();
    const history = runWorldHistory(planet, physics, geography, star, galaxySeed, cfg ?? config);
    historyMs += performance.now() - start;

    const had = (kind: string) => history.events.some((e) => e.kind === kind);
    oceans.push(geography.oceanFraction);
    if (had("freezes-over")) counts.froze++;
    if (had("runaway-greenhouse")) counts.runaway++;
    if (had("oceans-lost")) counts.oceansLost++;
    if (had("oxidation")) counts.oxidised++;
    if (history.present.oceanFraction > 0.01) counts.liquidToday++;
    if (geography.oceanFraction === 1) {
      counts.noLand++;
      if (had("runaway-greenhouse")) counts.noLandRunaway++;
    }
    if (history.life !== null) {
      counts.everLife++;
      lifeStarts.push(history.life.startedGyr - FORMATION_DELAY_GYR);
      if (history.life.endedGyr === null) counts.living++;
    }
    const order = firstsOrder(history);
    if (order !== null) mindOrders[order] = (mindOrders[order] ?? 0) + 1;
    return { physics, geography, history };
  };

  let planets = 0;
  let locked = 0;
  const planetsOf = (star: Star) => {
    const system = generatePlanetsFor(star, seed, config, worldOf);
    for (const planet of system.planets) {
      planets++;
      if (derivePhysics(planet, star, seed, config).tidallyLocked) locked++;
    }
    return system;
  };

  const start = performance.now();
  const survey = surveyLife(stars, seed, config, undefined, planetsOf);
  const surveyMs = performance.now() - start;

  const solid = oceans.length;
  const share = (count: number, of = solid) => count / Math.max(1, of);
  return {
    preset: presetName,
    seed,
    survey,
    lockedShare: share(locked, planets),
    geography: {
      solidPlanets: solid,
      medianOcean: solid === 0 ? 0 : median(oceans),
      oceanWorldShare: share(oceans.filter((o) => o > 0.9).length),
      dryShare: share(oceans.filter((o) => o < 0.03).length),
      ms: geographyMs,
    },
    history: {
      frozeShare: share(counts.froze),
      runawayShare: share(counts.runaway),
      oceansLostShare: share(counts.oceansLost),
      oxidisedShare: share(counts.oxidised),
      liquidTodayShare: share(counts.liquidToday),
      noLandRunawayShare: share(counts.noLandRunaway, counts.noLand),
      everLifeShare: share(counts.everLife),
      livingShare: share(counts.living),
      medianLifeStartGyr: median(lifeStarts),
      mindOrders,
      ms: historyMs,
    },
    surveyMs,
  };
}

/** Every universe the harness measures, in table order. */
export function universes(): { preset: string; seed: number }[] {
  return PRESETS.flatMap((preset) => SEEDS.map((seed) => ({ preset: preset.name, seed })));
}

function stageMix(survey: LifeSurvey): string {
  return ORGANISM_STAGES.map((stage) => survey.systems.filter((s) => s.mostAdvancedStage === stage).length).join(" / ");
}

function earthPathCell(orders: Record<string, number>): string {
  const minds = Object.values(orders).reduce((a, b) => a + b, 0);
  return `${orders[EARTH_PATH] ?? 0} / ${minds}`;
}

/** For each preset, every order of firsts that occurred on its worlds with a mind (all seeds), most common first. */
export function ordersReport(rows: Row[]): string {
  const lines = [`Orders of firsts on worlds with a mind (oxygen in the air, life on land, a body over 1 kg, a mind; Earth's path is ${EARTH_PATH}). "+" joins firsts in the same 100 Myr step.`];
  for (const preset of [...new Set(rows.map((r) => r.preset))]) {
    const totals: Record<string, number> = {};
    for (const row of rows.filter((r) => r.preset === preset)) {
      for (const [order, n] of Object.entries(row.history.mindOrders)) totals[order] = (totals[order] ?? 0) + n;
    }
    const sorted = Object.entries(totals).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
    lines.push("", `**${preset}**${sorted.length === 0 ? ": no minds." : ""}`, "");
    for (const [order, n] of sorted) lines.push(`- ${n} × ${order}`);
  }
  return lines.join("\n");
}

/** The rows as a Markdown table. */
export function table(rows: Row[]): string {
  const lines = [
    "| Preset | Seed | Planets | Tidally locked | Solid planets | Median ocean cover at formation | Ocean worlds (> 90%) | Dry (< 3%) | Ever froze over | Runaway greenhouse | Oceans lost | Oxidised (by life or water loss) | Liquid water today | Runaway, worlds formed with no land | Ever had life | Living today | Median life start (Gyr) | Life-bearing planets | Systems with organisms | Systems by most advanced stage (micro / multi / complex / dominant) | Civilizations | Earth path (of worlds with a mind) | Survey (ms) | Geography (ms) | World history (ms) |",
    "|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|---:|---:|---:|---:|---:|",
  ];
  const percent = (share: number) => `${(share * 100).toFixed(1)}%`;
  for (const { preset, seed, survey, lockedShare: locked, geography: g, history: h, surveyMs } of rows) {
    lines.push(`| ${preset} | ${seed} | ${survey.totalPlanets} | ${percent(locked)} | ${g.solidPlanets} | ${percent(g.medianOcean)} | ${percent(g.oceanWorldShare)} | ${percent(g.dryShare)} | ${percent(h.frozeShare)} | ${percent(h.runawayShare)} | ${percent(h.oceansLostShare)} | ${percent(h.oxidisedShare)} | ${percent(h.liquidTodayShare)} | ${percent(h.noLandRunawayShare)} | ${percent(h.everLifeShare)} | ${percent(h.livingShare)} | ${Number.isNaN(h.medianLifeStartGyr) ? "–" : h.medianLifeStartGyr.toFixed(1)} | ${survey.lifeBearingPlanets} | ${survey.systems.length} | ${stageMix(survey)} | ${survey.civilizationCount} | ${earthPathCell(h.mindOrders)} | ${surveyMs.toFixed(1)} | ${g.ms.toFixed(0)} | ${h.ms.toFixed(0)} |`);
  }
  return lines.join("\n");
}
