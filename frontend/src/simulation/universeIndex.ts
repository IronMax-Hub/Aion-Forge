// The universe index: the facts of every world, one row each, gathered while
// the life survey makes them (EN0).
//
// Why it exists: the Great Filter, the atlas, the encyclopedia's comparisons
// and Deep Time ask questions of every world at once. The survey already makes
// every planet, its biosphere and its civilization in the workers; the index
// keeps what those questions need, so the main thread never makes the planets
// again.
//
// How: one typed array per column and one row per world, in star order and
// then planet index order. The survey reads each system's rows (indexRowsFor)
// and packs a chunk's rows once (packIndex); the chunk's buffers move from its
// worker without copying, and the pool joins the chunks in star order
// (mergeIndices), which gives exactly the index of the whole universe made in
// one pass.
//
// Every value is read from what generatePlanetsFor, generateBiosphere,
// generateCivilization and atmosphereComposition return; nothing is drawn or
// decided here. Dates are Gyr after the world's star formed. A measure a world
// does not have (a giant's surface, a date that never came) is NaN.
//
// Limits: until Deep Time's civilization chronicle (DT1), a civilization's
// highest stage is the stage of its final tech level, so one that fell
// keeps only what its ruined level reaches (Issue 2 in the plan).

import type { Star } from "./star";
import type { UniverseConfig } from "./config";
import type { PlanetarySystem, PlanetType } from "./planet";
import { effectiveOrbitAU } from "./planetBasics";
import { derivePhysics } from "./planetPhysics";
import { generateBiosphere } from "./biosphere";
import type { LifeStage } from "./biosphere";
import { canSustainFire, generateCivilization, techLevelToStage } from "./civilization";
import type { TechStage } from "./civilization";
import { atmosphereComposition } from "./atmosphereComposition";
import { MASS_EXTINCTION_SHARE } from "./history";
import type { FirstKind } from "./evolution/engine";

// ── Codes ─────────────────────────────────────────────────────────────────────

/** What a row describes. Moons (step 5) and rogue planets (step 7) will join the planets. */
export const WORLD_KIND = { PLANET: 0 } as const;

/** A row's `parentIndex` when it orbits no planet. */
export const NO_PARENT = -1;

/** `type` codes: a planet's type is its position here. */
export const PLANET_TYPE_CODES: readonly PlanetType[] = [
  "rocky", "ocean", "ice", "desert", "gas-giant", "ice-giant", "lava", "rogue",
];

/** `lifeStage` codes; 0 is no life today. */
export const LIFE_STAGE_CODES: readonly LifeStage[] = [
  "none", "prebiotic", "microbial", "multicellular", "complex", "dominant",
];

/** `civilizationStage` and `highestStage` codes; 0 is no civilization. */
export const CIVILIZATION_STAGE_CODES: readonly (TechStage | "none")[] = [
  "none", "primitive", "agricultural", "industrial", "information", "space-age", "collapsed",
];

/** Bits of a row's `flags`. */
export const INDEX_FLAG = {
  RARE: 1 << 0,
  TIDALLY_LOCKED: 1 << 1,
  EVER_LIQUID_WATER: 1 << 2,
  /** Open fire is possible today (canSustainFire). */
  FIRE_POSSIBLE: 1 << 3,
  /** The air holds O₂ and CH₄ together, the pair the spectrum reads as a strong biosignature. */
  O2_WITH_CH4: 1 << 4,
  /** The air holds CFCs: a technosignature. */
  CFCS: 1 << 5,
} as const;

// The biosignature pair, as mixing ratios: O₂ at least 1%, CH₄ at least 1 ppm
const BIOSIGNATURE_O2_SHARE = 0.01;
const BIOSIGNATURE_CH4_SHARE = 1e-6;

// ── The index ─────────────────────────────────────────────────────────────────

const COLUMNS = {
  // Identity
  starId: Uint16Array,
  planetIndex: Uint8Array,
  kind: Uint8Array,                 // WORLD_KIND
  parentIndex: Int8Array,           // the planet a moon orbits; NO_PARENT for a planet
  // The body
  type: Uint8Array,                 // PLANET_TYPE_CODES
  massEarths: Float32Array,
  radiusEarths: Float32Array,
  orbitAU: Float32Array,            // effective, as the climate reads it
  temperatureK: Float32Array,
  // Today's surface; NaN for giants
  oceanFraction: Float32Array,
  iceFraction: Float32Array,
  landFraction: Float32Array,
  pressureBar: Float32Array,
  o2Bar: Float32Array,
  flags: Uint16Array,               // INDEX_FLAG bits
  // Life
  lifeBeganGyr: Float32Array,
  lifeEndedGyr: Float32Array,       // NaN while life lasts, or if it never began
  lifeStage: Uint8Array,            // LIFE_STAGE_CODES, today
  livingLineages: Uint8Array,
  massExtinctions: Uint8Array,      // ended at least MASS_EXTINCTION_SHARE of living lineages, and life went on
  largestLog10Kg: Float32Array,     // the largest living body today
  firstLightGyr: Float32Array,
  firstMulticellularGyr: Float32Array,
  firstLandGyr: Float32Array,
  firstKilogramGyr: Float32Array,
  oxidationGyr: Float32Array,       // the air first oxidised, by life or by escaping water
  lifeOxygenGyr: Float32Array,      // life's own oxygen could first hold the air oxidised
  mindGyr: Float32Array,
  mindLog10Kg: Float32Array,
  // Civilization
  civilizationStage: Uint8Array,    // CIVILIZATION_STAGE_CODES, today
  highestStage: Uint8Array,         // CIVILIZATION_STAGE_CODES; see Limits above
  industryGyr: Float32Array,
  collapses: Uint8Array,
  speciesEndedAgoGyr: Float32Array, // Gyr before today; NaN while the species lives
} as const;

export type IndexColumn = keyof typeof COLUMNS;

/** The index's columns, in a fixed order. */
export const INDEX_COLUMNS = Object.keys(COLUMNS) as IndexColumn[];

/** One world's facts: every column's value as a number. */
export type IndexRow = Record<IndexColumn, number>;

/** Every world's facts: one typed array per column, each `count` long. */
export type UniverseIndex = { count: number } & { [C in IndexColumn]: InstanceType<(typeof COLUMNS)[C]> };

type ColumnArray = UniverseIndex[IndexColumn];

/** A system's rows, one per planet in planet index order, read from the generators. */
export function indexRowsFor(system: PlanetarySystem, star: Star, galaxySeed: number, config: UniverseConfig): IndexRow[] {
  return system.planets.map((planet) => {
    const surface = planet.surface;
    const life = planet.life;
    const phylogeny = life?.phylogeny ?? null;
    const biosphere = generateBiosphere(planet, star);
    const civilization = generateCivilization(biosphere, planet, galaxySeed).civilization;
    const air = atmosphereComposition(planet, civilization).mixingRatios;

    const firstGyr = (kind: FirstKind) => phylogeny?.firsts.find((f) => f.kind === kind)?.tGyr ?? NaN;
    const industry = civilization?.milestones.find((m) => m.type === "industry");

    let flags = 0;
    if (planet.isRare) flags |= INDEX_FLAG.RARE;
    if (derivePhysics(planet, star, galaxySeed, config).tidallyLocked) flags |= INDEX_FLAG.TIDALLY_LOCKED;
    if (planet.everLiquidWater) flags |= INDEX_FLAG.EVER_LIQUID_WATER;
    if (canSustainFire(planet)) flags |= INDEX_FLAG.FIRE_POSSIBLE;
    if ((air.O2 ?? 0) >= BIOSIGNATURE_O2_SHARE && (air.CH4 ?? 0) >= BIOSIGNATURE_CH4_SHARE) flags |= INDEX_FLAG.O2_WITH_CH4;
    if ((air.CFC11 ?? 0) > 0 || (air.CFC12 ?? 0) > 0) flags |= INDEX_FLAG.CFCS;

    return {
      starId: star.id,
      planetIndex: planet.id,
      kind: WORLD_KIND.PLANET,
      parentIndex: NO_PARENT,
      type: PLANET_TYPE_CODES.indexOf(planet.type),
      massEarths: planet.mass,
      radiusEarths: planet.size,
      orbitAU: effectiveOrbitAU(planet.orbitalRadius, config),
      temperatureK: planet.temperature,
      oceanFraction: surface?.oceanFraction ?? NaN,
      iceFraction: surface?.iceFraction ?? NaN,
      landFraction: surface?.landFraction ?? NaN,
      pressureBar: surface?.pressureBar ?? NaN,
      o2Bar: surface?.o2Bar ?? NaN,
      flags,
      lifeBeganGyr: life?.startedGyr ?? NaN,
      lifeEndedGyr: life?.endedGyr ?? NaN,
      lifeStage: LIFE_STAGE_CODES.indexOf(biosphere.stage),
      livingLineages: phylogeny?.livingLineages ?? 0,
      massExtinctions: biosphere.extinctions
        .filter((e) => e.severityLoss >= MASS_EXTINCTION_SHARE && e.severityLoss < 1).length,
      largestLog10Kg: phylogeny?.largestLog10BodyMassKg ?? NaN,
      firstLightGyr: firstGyr("light"),
      firstMulticellularGyr: firstGyr("multicellular"),
      firstLandGyr: firstGyr("land"),
      firstKilogramGyr: firstGyr("kilogram"),
      oxidationGyr: planet.worldEvents.find((e) => e.kind === "oxidation")?.tGyr ?? NaN,
      lifeOxygenGyr: life?.oxygenGyr ?? NaN,
      mindGyr: phylogeny?.mind?.tGyr ?? NaN,
      mindLog10Kg: phylogeny?.mind?.log10BodyMassKg ?? NaN,
      civilizationStage: CIVILIZATION_STAGE_CODES.indexOf(civilization?.techStage ?? "none"),
      highestStage: CIVILIZATION_STAGE_CODES.indexOf(civilization ? techLevelToStage(civilization.techLevel, false) : "none"),
      industryGyr: industry ? star.age - industry.timeAgo : NaN,
      collapses: civilization?.collapsesCount ?? 0,
      speciesEndedAgoGyr: civilization?.extinctAgoGyr ?? NaN,
    };
  });
}

/** An index of a run of worlds, from their rows in order. */
export function packIndex(rows: readonly IndexRow[]): UniverseIndex {
  const index = { count: rows.length } as UniverseIndex;
  for (const column of INDEX_COLUMNS) {
    const array: ColumnArray = new COLUMNS[column](rows.length);
    rows.forEach((row, i) => { array[i] = row[column]; });
    (index as Record<IndexColumn, ColumnArray>)[column] = array;
  }
  return index;
}

/** The index of a universe from the indices of its chunks, given in star order. */
export function mergeIndices(parts: readonly UniverseIndex[]): UniverseIndex {
  const count = parts.reduce((sum, part) => sum + part.count, 0);
  const index = { count } as UniverseIndex;
  for (const column of INDEX_COLUMNS) {
    const array: ColumnArray = new COLUMNS[column](count);
    let offset = 0;
    for (const part of parts) {
      array.set(part[column], offset);
      offset += part.count;
    }
    (index as Record<IndexColumn, ColumnArray>)[column] = array;
  }
  return index;
}

/** An index's buffers, to move it from a worker without copying (postMessage's transfer list). */
export function indexBuffers(index: UniverseIndex): ArrayBuffer[] {
  return INDEX_COLUMNS.map((column) => index[column].buffer as ArrayBuffer);
}
