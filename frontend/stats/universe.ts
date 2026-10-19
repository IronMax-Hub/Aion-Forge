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
//
// Since MZ5: metallicity, from the index and the stars: the median [Fe/H] by
// star age, and by [Fe/H] the planets per star, the giant and solid shares, the
// median solid planet's mass and the worlds living today.
//
// Since MO7: moons. Moon worlds run histories through the same worldOf, so they
// are counted apart and kept out of every planet column: moons, moon worlds,
// those with liquid water today (open or under ice), living moons, moon
// civilizations, moon worlds above 373 K and moons with Io's tidal heat or more
// (decision 29), and planets whose tilt wanders (MO5).
//
// Since BS5: binary stars: the share of stars with a companion in each of
// binary.ts's mass bins, the binaries, the planets removed where a companion
// allows no orbit (BS2), the planets orbiting both stars and those of them
// living today, and the worlds living today per single star and per binary.
//
// Since IH4: heat from inside, from each history as it goes by: worlds living
// today that are frozen over, worlds frozen solid today (water, none of it
// liquid), and worlds whose life ended when their oceans froze solid.

import { makeConfig, PRESETS } from "../src/simulation/config";
import { buildGalaxyConfig } from "../src/simulation/galaxy";
import { generateStarsFor, UNIVERSE_AGE_GYR } from "../src/simulation/star";
import type { Star } from "../src/simulation/star";
import { surveyLife, ORGANISM_STAGES } from "../src/simulation/lifeSurvey";
import type { LifeSurvey } from "../src/simulation/lifeSurvey";
import { generatePlanetsFor, GIANT_PLANET_MASS } from "../src/simulation/planet";
import type { Planet, SolidWorld } from "../src/simulation/planet";
import { derivePhysics } from "../src/simulation/planetPhysics";
import { buildGeography } from "../src/simulation/geography";
import { runWorldHistory, FORMATION_DELAY_GYR, FROZEN_ICE_SHARE, STEP_GYR } from "../src/simulation/worldHistory";
import type { UniverseConfig } from "../src/simulation/config";
import { EARTH_PATH, firstsOrder } from "./earthPath";
import { CONDITIONS, funnelOf, GATES } from "../src/simulation/greatFilter";
import { ATMOSPHERE_CODES, INDEX_FLAG } from "../src/simulation/universeIndex";
import { tidalHeatFlow } from "../src/simulation/interiorHeat";
import { COMPANION_CHANCE } from "../src/simulation/binary";
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
  livingFrozenOver: number;    // living today and frozen over (IH4)
  frozenSolidToday: number;    // water today, none of it liquid (IH4)
  lifeEndedFrozenSolid: number; // life ended within a step of its oceans freezing solid (IH4)
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
  /** Metallicity (MZ5), from the index and the stars. */
  metals: Metals;
  /** Moons (MO7). */
  moons: Moons;
  /** Binary stars (BS5). */
  binaries: Binaries;
}

export interface Binaries {
  shareByMass: number[];      // stars with a companion, in COMPANION_CHANCE's mass bins; NaN where a bin is empty
  binaries: number;           // stars with a companion
  removed: number;            // planets drawn where a companion allows no orbit (BS2)
  aroundBoth: number;         // planets orbiting both stars
  livingAroundBoth: number;   // of those, living today
  livingPerSingle: number;    // worlds living today per single star
  livingPerBinary: number;    // worlds living today per binary
}

export interface Moons {
  moons: number;              // every moon, worlds or not
  worlds: number;             // moon worlds: those with histories
  liquidToday: number;        // moon worlds with open water or water under ice today
  living: number;             // moon worlds with life today
  civilizations: number;      // moon worlds with a civilization, living or in ruins
  hot: number;                // moon worlds above 373 K today
  ioHeated: number;           // moons with Io's tidal heat or more (decision 29)
  tiltFree: number;           // planets whose tilt wanders (MO5)
}

/** Io's tidal heat, W/m²: moons at or above it are counted (decision 29). */
const IO_TIDAL_HEAT_W_M2 = 2.2;

/** Star ages, Gyr, and [Fe/H] bins, dex, for the metallicity table. */
const AGE_BINS = [[0, 2], [2, 6], [6, 10], [10, Infinity]] as const;
const FEH_BINS = [[-Infinity, -0.5], [-0.5, -0.2], [-0.2, 0.1], [0.1, Infinity]] as const;

export interface Metals {
  medianFeHByAge: number[];      // AGE_BINS order; NaN where a bin is empty
  byFeH: { stars: number; planetsPerStar: number; giantShare: number; solidShare: number; medianSolidMass: number; living: number }[];
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
  const counts = {
    froze: 0, runaway: 0, oceansLost: 0, oxidised: 0, liquidToday: 0, noLand: 0, noLandRunaway: 0, everLife: 0, living: 0,
    livingFrozenOver: 0, frozenSolidToday: 0, lifeEndedFrozenSolid: 0,
  };
  let geographyMs = 0;
  let historyMs = 0;
  // The same steps as solidWorldOf, timed, with each history read and let go
  const moonCounts = { moons: 0, worlds: 0, liquidToday: 0, hot: 0, ioHeated: 0, tiltFree: 0 };
  const worldOf = (planet: Planet, star: Star, galaxySeed: number, cfg?: UniverseConfig): SolidWorld => {
    const physics = derivePhysics(planet, star, galaxySeed, cfg ?? config);
    let start = performance.now();
    const geography = buildGeography(planet, physics, galaxySeed);
    geographyMs += performance.now() - start;
    start = performance.now();
    const history = runWorldHistory(planet, physics, geography, star, galaxySeed, cfg ?? config);
    historyMs += performance.now() - start;

    // A moon world (MO7): counted apart, and kept out of every planet column
    if (planet.moonOrbit) {
      moonCounts.worlds++;
      if (history.present.oceanFraction > 0.01 || history.present.liquidUnderIceFraction > 0) moonCounts.liquidToday++;
      if (history.present.meanK > 373) moonCounts.hot++;
      return { physics, geography, history };
    }

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
    const hasWater = history.final.bandOcean.some((share) => share > 0);
    if (hasWater && !history.final.steam && history.final.bandLiquid.every((share) => share === 0)) counts.frozenSolidToday++;
    if (history.life !== null) {
      counts.everLife++;
      lifeStarts.push(history.life.startedGyr - FORMATION_DELAY_GYR);
      const ended = history.life.endedGyr;
      if (ended === null) {
        counts.living++;
        if (history.present.iceFraction >= FROZEN_ICE_SHARE) counts.livingFrozenOver++;
      } else if (history.events.some((e) => e.kind === "frozen-solid" && e.tGyr <= ended && ended <= e.tGyr + STEP_GYR + 1e-9)) {
        counts.lifeEndedFrozenSolid++;
      }
    }
    const order = firstsOrder(history);
    if (order !== null) mindOrders[order] = (mindOrders[order] ?? 0) + 1;
    return { physics, geography, history };
  };

  let planets = 0;
  let locked = 0;
  const aroundBoth = { planets: 0, living: 0 };
  const planetsOf = (star: Star) => {
    const system = generatePlanetsFor(star, seed, config, worldOf);
    for (const planet of system.planets) {
      planets++;
      if (planet.tiltFree) moonCounts.tiltFree++;
      if (planet.orbitsBothStars) {
        aroundBoth.planets++;
        if (planet.life && planet.life.endedGyr === null) aroundBoth.living++;
      }
      for (const moon of planet.moons) {
        moonCounts.moons++;
        if (tidalHeatFlow(moon, planet) >= IO_TIDAL_HEAT_W_M2) moonCounts.ioHeated++;
      }
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
      livingFrozenOver: counts.livingFrozenOver,
      frozenSolidToday: counts.frozenSolidToday,
      lifeEndedFrozenSolid: counts.lifeEndedFrozenSolid,
      ms: historyMs,
    },
    surveyMs,
    funnel: funnelOf(survey.index).steps.map((step) => step.passed),
    escape: escapeOf(survey, stars),
    metals: metalsOf(survey, stars),
    moons: {
      ...moonCounts,
      living: survey.lifeBearingMoons,
      civilizations: [...Array(survey.moonIndex.count).keys()].filter((i) => survey.moonIndex.highestStage[i] > 0).length,
    },
    binaries: binariesOf(survey, stars, aroundBoth),
  };
}

/** What binaries did (BS5), from the stars, the survey and the planets orbiting both stars. */
function binariesOf(survey: LifeSurvey, stars: Star[], aroundBoth: { planets: number; living: number }): Binaries {
  let from = 0;
  const shareByMass = COMPANION_CHANCE.map((bin) => {
    const inBin = stars.filter((s) => s.mass >= from && s.mass < bin.massBelow);
    from = bin.massBelow;
    return inBin.length === 0 ? NaN : inBin.filter((s) => s.companion).length / inBin.length;
  });
  const binary = new Set(stars.filter((s) => s.companion).map((s) => s.id));
  const ix = survey.index;
  let livingInBinaries = 0;
  let livingInSingles = 0;
  for (let i = 0; i < ix.count; i++) {
    if (ix.lifeStage[i] === 0) continue;
    if (binary.has(ix.starId[i])) livingInBinaries++;
    else livingInSingles++;
  }
  return {
    shareByMass,
    binaries: binary.size,
    removed: survey.unstablePlanets,
    aroundBoth: aroundBoth.planets,
    livingAroundBoth: aroundBoth.living,
    livingPerSingle: livingInSingles / Math.max(1, stars.length - binary.size),
    livingPerBinary: livingInBinaries / Math.max(1, binary.size),
  };
}

/** What metallicity did, read from the survey's index and the stars (MZ5). */
function metalsOf(survey: LifeSurvey, stars: Star[]): Metals {
  const ix = survey.index;
  const rows = [...Array(ix.count).keys()];
  const within = (value: number, [from, to]: readonly [number, number]) => value >= from && value < to;
  // Stars that can hold planets: neutron stars and black holes are left out
  const hosts = stars.filter((s) => s.classification !== "neutron-star" && s.classification !== "black-hole");
  return {
    medianFeHByAge: AGE_BINS.map((bin) => median(stars.filter((s) => within(s.age, bin)).map((s) => s.metallicity))),
    byFeH: FEH_BINS.map((bin) => {
      const ids = new Set(hosts.filter((s) => within(s.metallicity, bin)).map((s) => s.id));
      const planets = rows.filter((i) => ids.has(ix.starId[i]));
      const solid = planets.filter((i) => !Number.isNaN(ix.oceanFraction[i]));
      return {
        stars: ids.size,
        planetsPerStar: planets.length / Math.max(1, ids.size),
        giantShare: planets.filter((i) => ix.massEarths[i] > GIANT_PLANET_MASS).length / Math.max(1, planets.length),
        solidShare: solid.length / Math.max(1, planets.length),
        medianSolidMass: median(solid.map((i) => ix.massEarths[i])),
        living: planets.filter((i) => !Number.isNaN(ix.lifeBeganGyr[i]) && Number.isNaN(ix.lifeEndedGyr[i])).length,
      };
    }),
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

/** Metallicity in every universe, as two Markdown tables (MZ5). */
export function metalsTable(rows: Row[]): string {
  const bin = ([from, to]: readonly [number, number], unit: string) =>
    from === -Infinity ? `below ${to}${unit}` : to === Infinity ? `${from}${unit} and above` : `${from} to ${to}${unit}`;
  const dex = (v: number) => (Number.isNaN(v) ? "–" : `${v < 0 ? "−" : "+"}${Math.abs(v).toFixed(2)}`);
  const lines = [
    "Metallicity: the median star's [Fe/H] by star age.",
    "",
    `| Preset | Seed | ${AGE_BINS.map((b) => bin(b, " Gyr")).join(" | ")} |`,
    `|---|---:|${AGE_BINS.map(() => "---:").join("|")}|`,
  ];
  for (const { preset, seed, metals } of rows) lines.push(`| ${preset} | ${seed} | ${metals.medianFeHByAge.map(dex).join(" | ")} |`);
  lines.push(
    "",
    "By the host star's [Fe/H] (stars that can hold planets): stars; planets per star; giant share and solid share of their planets; the median solid planet's mass (M⊕); worlds living today.",
    "",
    `| Preset | Seed | ${FEH_BINS.map((b) => bin(b, "")).join(" | ")} |`,
    `|---|---:|${FEH_BINS.map(() => "---").join("|")}|`,
  );
  for (const { preset, seed, metals } of rows) {
    lines.push(`| ${preset} | ${seed} | ${metals.byFeH.map((b) =>
      `${b.stars} · ${b.planetsPerStar.toFixed(2)} · ${(b.giantShare * 100).toFixed(0)}% / ${(b.solidShare * 100).toFixed(0)}% · ${Number.isNaN(b.medianSolidMass) ? "–" : b.medianSolidMass.toFixed(2)} · ${b.living}`).join(" | ")} |`);
  }
  return lines.join("\n");
}

/** Heat from inside in every universe, as a Markdown table (IH4). */
export function heatTable(rows: Row[]): string {
  const lines = [
    "Heat from inside: solid planets with open water today; worlds living today, and those frozen over; worlds frozen solid today; worlds whose life ended when their oceans froze solid; systems with organisms.",
    "",
    "| Preset | Seed | Solid planets | Open water today | Living today | Living, frozen over | Frozen solid today | Life ended frozen solid | Systems with organisms |",
    "|---|---:|---:|---:|---:|---:|---:|---:|---:|",
  ];
  for (const { preset, seed, survey, geography: g, history: h } of rows) {
    const living = Math.round(h.livingShare * g.solidPlanets);
    lines.push(`| ${preset} | ${seed} | ${g.solidPlanets} | ${(h.liquidTodayShare * 100).toFixed(1)}% | ${living} | ${h.livingFrozenOver} | ${h.frozenSolidToday} | ${h.lifeEndedFrozenSolid} | ${survey.systems.length} |`);
  }
  return lines.join("\n");
}

/** Moons in every universe, as a Markdown table (MO7). */
export function moonsTable(rows: Row[]): string {
  const lines = [
    "Moons: every moon; moon worlds (with histories); moon worlds with liquid water today (open or under ice); living moons; moon civilizations (living or in ruins); moon worlds above 373 K; moons with Io's tidal heat or more; planets whose tilt wanders.",
    "",
    "| Preset | Seed | Moons | Moon worlds | Liquid water today | Living | Civilizations | Above 373 K | Io's tidal heat or more | Wandering tilts |",
    "|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|",
  ];
  for (const { preset, seed, moons: m } of rows) {
    lines.push(`| ${preset} | ${seed} | ${m.moons} | ${m.worlds} | ${m.liquidToday} | ${m.living} | ${m.civilizations} | ${m.hot} | ${m.ioHeated} | ${m.tiltFree} |`);
  }
  return lines.join("\n");
}

/** Binary stars in every universe, as a Markdown table (BS5). */
export function binariesTable(rows: Row[]): string {
  let from = 0;
  const bins = COMPANION_CHANCE.map((bin) => {
    const label = bin.massBelow === Infinity ? `≥ ${from} M☉` : `${from}–${bin.massBelow} M☉`;
    from = bin.massBelow;
    return `${label} (${(bin.chance * 100).toFixed(0)}%)`;
  });
  const lines = [
    "Binary stars: the share of stars with a companion by mass (the rule's chance in brackets); binaries; planets removed where a companion allows no orbit; planets orbiting both stars, and those of them living today; worlds living today per single star and per binary.",
    "",
    `| Preset | Seed | ${bins.join(" | ")} | Binaries | Planets removed | Around both stars | Living around both | Living per single star | Living per binary |`,
    `|---|---:|${bins.map(() => "---:").join("|")}|---:|---:|---:|---:|---:|---:|`,
  ];
  const percent = (x: number) => (Number.isNaN(x) ? "–" : `${(x * 100).toFixed(0)}%`);
  for (const { preset, seed, binaries: b } of rows) {
    lines.push(`| ${preset} | ${seed} | ${b.shareByMass.map(percent).join(" | ")} | ${b.binaries} | ${b.removed} | ${b.aroundBoth} | ${b.livingAroundBoth} | ${b.livingPerSingle.toFixed(3)} | ${b.livingPerBinary.toFixed(3)} |`);
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
