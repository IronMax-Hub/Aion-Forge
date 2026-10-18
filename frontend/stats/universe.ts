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
//
// Since GF6: the Great Filter funnel, the worlds passing each of the twelve
// gates (simulation/greatFilter.ts), read from the survey's index, so every
// later physics step records how it moves the filter.
//
// Since AE4: what atmospheric escape did, from the index: the share of solid
// planets stripped of their air, today's mix of air classes, and the worlds
// living today by their host star's class (greatFilter.ts's star conditions).

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
import { CONDITIONS, funnelOf, GATES } from "../src/simulation/greatFilter";
import { ATMOSPHERE_CODES, INDEX_FLAG } from "../src/simulation/universeIndex";
import { atmosphereClassOf } from "../src/simulation/planetPhysics";

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
  /** Worlds passing each Great Filter gate, in GATES order (GF6). */
  funnel: number[];
  /** Atmospheric escape (AE4), from the index. */
  escape: Escape;
}

export interface Escape {
  strippedShare: number;    // solid planets that lost all their air to space
  classMix: number[];       // solid planets by today's air class, ATMOSPHERE_CODES order
  livingByHost: number[];   // worlds living today by host class, HOST_CLASSES order
}

/** Host star classes for the living-worlds column: greatFilter.ts's star conditions. */
const HOST_CLASSES = CONDITIONS.filter((c) => c.id.startsWith("star-"));

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
    funnel: funnelOf(survey.index).steps.map((step) => step.passed),
    escape: escapeOf(survey, stars),
  };
}

/** What escape did, read from the survey's index (AE4). */
function escapeOf(survey: LifeSurvey, stars: Star[]): Escape {
  const ix = survey.index;
  const rows = [...Array(ix.count).keys()];
  const solid = rows.filter((i) => !Number.isNaN(ix.pressureBar[i]));
  const living = rows.filter((i) => !Number.isNaN(ix.lifeBeganGyr[i]) && Number.isNaN(ix.lifeEndedGyr[i]));
  return {
    strippedShare: solid.filter((i) => (ix.flags[i] & INDEX_FLAG.AIR_LOST) !== 0).length / Math.max(1, solid.length),
    classMix: ATMOSPHERE_CODES.map((cls) => solid.filter((i) => atmosphereClassOf(ix.pressureBar[i]) === cls).length),
    livingByHost: HOST_CLASSES.map((c) => living.filter((i) => c.holds(ix, i, stars[ix.starId[i]])).length),
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

/** What atmospheric escape did in every universe, as a Markdown table (AE4). */
export function escapeTable(rows: Row[]): string {
  const lines = [
    "Atmospheric escape: solid planets stripped of their air, solid planets by today's air class, and worlds living today by host star class.",
    "",
    `| Preset | Seed | Solid planets | Stripped | Air today (${ATMOSPHERE_CODES.join(" / ")}) | Runaway greenhouse | Living today (${HOST_CLASSES.map((c) => c.label.replace(/^Host star (class |a )/, "")).join(" / ")}) |`,
    "|---|---:|---:|---:|---|---:|---|",
  ];
  for (const { preset, seed, geography: g, history: h, escape: e } of rows) {
    lines.push(`| ${preset} | ${seed} | ${g.solidPlanets} | ${(e.strippedShare * 100).toFixed(1)}% | ${e.classMix.join(" / ")} | ${(h.runawayShare * 100).toFixed(1)}% | ${e.livingByHost.join(" / ")} |`);
  }
  return lines.join("\n");
}

/** The Great Filter funnel of every universe, as a Markdown table (GF6). */
export function funnelTable(rows: Row[]): string {
  const lines = [
    "Great Filter: worlds passing each gate (and every gate above it).",
    "",
    `| Preset | Seed | Planets | ${GATES.map((g) => g.label).join(" | ")} |`,
    `|---|---:|---:|${GATES.map(() => "---:").join("|")}|`,
  ];
  for (const { preset, seed, survey, funnel } of rows) {
    lines.push(`| ${preset} | ${seed} | ${survey.totalPlanets} | ${funnel.join(" | ")} |`);
  }
  return lines.join("\n");
}
