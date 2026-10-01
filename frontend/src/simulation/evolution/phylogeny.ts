// Phylogeny summary (Worlds Up Close, phase C2.5).
//
// Why it exists: the biosphere a player inspects (biosphere.ts) should be read
// from the lineages a planet's history actually produced, not rolled. The full
// evolution state holds every lineage that ever lived, which is too much to
// keep on every planet of a universe; this reduces it, once, at the end of the
// world history, to the few numbers the biosphere is read from.
//
// What it reads (Revision 1, C2.5):
// - Largest body mass and food-chain depth among the living lineages: the life
//   stage reads these instead of an organisation ladder.
// - Producer cover: the share of the habitable area (land and liquid water, in
//   the last step's environment) where producers hold biomass. Shallow water is
//   the sunlit top of the water, so a producer there covers that water's area.
// - Trait spread: how widely the living lineages differ in the three continuous
//   traits every lineage's rules read (body mass, thermal optimum, information
//   processing), each as a share of its range, relative to the spread of traits
//   drawn evenly across the range. The absorption peak is left out: only light
//   users read it.
// - Survival through the last catastrophes: the share of lineages alive before
//   each of the last RECENT_CATASTROPHES that came through it.
// - The catastrophes that killed at least one lineage (owner decision: every
//   lethal catastrophe, not only the large ones).
// - The first mind (minds.ts, C2.6), if one appeared: how long ago, and
//   whether its species still lives: the mind's lineage or any lineage
//   descended from it (owner decision: a lineage keeps splitting, and its
//   daughters carry the species on). If none lives, when the last one died.
//
// Assumptions and limits:
// - Body mass stands in for multicellularity (a stated simplification of the
//   revision, reconsidered only if the stats show it misclassifies worlds).
// - Read from the present only, except the catastrophe log; a world whose life
//   has ended keeps its dates and catastrophes, and nothing living.

import { LINEAGE_CAP, livingLineages } from "./engine";
import type { CatastropheRecord, EvolutionState } from "./engine";
import type { Environment } from "./environment";
import type { Mind } from "./minds";
import { TRAIT_RANGES } from "./genome";
import type { ContinuousTrait } from "./genome";

/** How many of the latest catastrophes the survival share is read over. */
export const RECENT_CATASTROPHES = 5;

/** Traits whose spread is read: those every lineage's rules read. */
const SPREAD_TRAITS: readonly ContinuousTrait[] = ["log10BodyMassKg", "thermalOptimumK", "informationProcessing"];
/** Standard deviation of a value spread evenly over a unit range, 1/√12. */
const EVEN_SPREAD = 1 / Math.sqrt(12);

export interface PhylogenySummary {
  /** Living lineages today. */
  livingLineages: number;
  /** Their share of the lineage cap. */
  diversity: number;
  /** Largest living body mass, log10 kg; null when nothing lives. */
  largestLog10BodyMassKg: number | null;
  /** Distinct food-chain levels among the living (1 = producers only). */
  foodChainLevels: number;
  /** Share of the habitable area where producers hold biomass, 0–1. */
  producerCover: number;
  /** Biomass of all living lineages, in the engine's unit (Earth's mean sunlight on the whole planet). */
  totalBiomass: number;
  /** Spread of the living lineages' traits, 0–1. */
  traitSpread: number;
  /** Share of lineages that came through the last catastrophes; 1 if none has struck. */
  recentSurvival: number;
  /** Every catastrophe that killed at least one lineage, oldest first. */
  lethalCatastrophes: CatastropheRecord[];
  /** The first mind, if one appeared (C2.6). */
  mind: MindSummary | null;
}

/** A mind as the history left it. */
export interface MindSummary extends Mind {
  /** Gyr since it appeared. */
  ageGyr: number;
  /** Gyr since its lineage and every lineage descended from it died out; null while any lives. */
  speciesEndedAgoGyr: number | null;
}

/** Share of the habitable area (land and liquid water) where producers hold biomass. */
function producerCoverOf(state: EvolutionState, env: Environment): number {
  const producers = livingLineages(state).filter((l) => l.level === 0);
  let habitable = 0;
  let covered = 0;
  env.bands.forEach((band, b) => {
    habitable += band.landArea + band.deepWaterArea;
    const living = producers.filter((l) => l.bandBiomass[b] > 0);
    if (living.some((l) => l.genome.habitat === "land")) covered += band.landArea;
    if (living.some((l) => l.genome.habitat !== "land")) covered += band.deepWaterArea;
  });
  return habitable > 0 ? covered / habitable : 0;
}

/** When a lineage and all its descendants had died out, or null while any lives. Lineages are listed in birth order, parents first. */
function speciesEndGyr(state: EvolutionState, lineageId: number): number | null {
  const species = new Set([lineageId]);
  let endGyr = -Infinity;
  for (const l of state.lineages.slice(lineageId)) {
    if (l.id !== lineageId && (l.parentId === null || !species.has(l.parentId))) continue;
    species.add(l.id);
    if (l.diedGyr === null) return null;
    endGyr = Math.max(endGyr, l.diedGyr);
  }
  return endGyr;
}

/** Mean standard deviation of the living lineages' read traits, each as a share of its range, relative to an even spread. */
function traitSpreadOf(state: EvolutionState): number {
  const alive = livingLineages(state);
  if (alive.length < 2) return 0;
  let total = 0;
  for (const trait of SPREAD_TRAITS) {
    const { min, max } = TRAIT_RANGES[trait];
    const values = alive.map((l) => (l.genome[trait] - min) / (max - min));
    const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
    const variance = values.reduce((sum, v) => sum + (v - mean) * (v - mean), 0) / values.length;
    total += Math.sqrt(variance);
  }
  return Math.min(1, total / SPREAD_TRAITS.length / EVEN_SPREAD);
}

/** Share of the lineages alive before each of the last catastrophes that survived it. */
function recentSurvivalOf(state: EvolutionState): number {
  const recent = state.catastrophes.filter((c) => c.aliveBefore > 0).slice(-RECENT_CATASTROPHES);
  const before = recent.reduce((sum, c) => sum + c.aliveBefore, 0);
  const lost = recent.reduce((sum, c) => sum + c.lineagesLost, 0);
  return before > 0 ? (before - lost) / before : 1;
}

/**
 * Reduces a planet's evolution, at the end of its history, to what its
 * biosphere and civilization are read from. `presentGyr` is the end of the
 * history, Gyr after the star formed.
 */
export function summarizePhylogeny(state: EvolutionState, env: Environment, mind: Mind | null, presentGyr: number): PhylogenySummary {
  const mindDiedGyr = mind && speciesEndGyr(state, mind.lineageId);
  const alive = livingLineages(state);
  return {
    livingLineages: alive.length,
    diversity: Math.min(1, alive.length / LINEAGE_CAP),
    largestLog10BodyMassKg: alive.length > 0 ? Math.max(...alive.map((l) => l.genome.log10BodyMassKg)) : null,
    foodChainLevels: new Set(alive.map((l) => l.level)).size,
    producerCover: alive.length > 0 ? producerCoverOf(state, env) : 0,
    totalBiomass: alive.reduce((sum, l) => sum + l.biomass, 0),
    traitSpread: traitSpreadOf(state),
    recentSurvival: recentSurvivalOf(state),
    lethalCatastrophes: state.catastrophes.filter((c) => c.lineagesLost > 0),
    mind: mind && {
      ...mind,
      ageGyr: presentGyr - mind.tGyr,
      speciesEndedAgoGyr: mindDiedGyr === null ? null : presentGyr - mindDiedGyr,
    },
  };
}
