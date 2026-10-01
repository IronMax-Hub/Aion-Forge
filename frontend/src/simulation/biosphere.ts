// Biosphere summary (Worlds Up Close, phase C2.5).
//
// Why it exists: the biosphere panel, the life markers, the survey and the
// civilization rules all read one summary of a planet's life. Since C2.5 it is
// read from the lineages the planet's world history produced (its phylogeny
// summary, evolution/phylogeny.ts), not rolled, so what a world holds today
// follows from what happened to it. It draws nothing.
//
// The stage, from the living lineages (Revision 1, C2.5):
//   microbial      largest body below 10⁻⁹ kg
//   multicellular  largest body 10⁻⁹ to 10⁻³ kg (or larger, with fewer than
//                  three food-chain levels)
//   complex        largest body above 10⁻³ kg and at least three food-chain levels
//   dominant       complex, and living biomass of at least one unit (Earth's mean
//                  sunlight on the whole planet; C2.10, owner decision)
// "prebiotic" is no longer produced (life either exists or not) and stays only
// in the type (R9). Body mass stands in for multicellularity.
//
// The measures, each 0–1:
//   complexity    largest living body mass, as a share of the genome's mass range
//   diversity     living lineages over the lineage cap
//   stability     share of lineages that came through the last catastrophes
//   adaptability  spread of the living lineages' traits
//   biomass       living biomass on a log scale, from vent life (10⁻⁵ of
//                 Earth's mean sunlight) to all of it (1)
// Extinctions are every catastrophe that killed a lineage (owner decision), with
// the share of lineages it killed as its severity.
//
// Life that has ended (R8): no stage, `extinctAt` says how long ago, and
// `ageGyr` how long it lasted. Its extinctions stay on record.

import { log } from "./detmath";
import type { Planet } from "./planet";
import type { Star } from "./star";
import { MULTICELLULAR_LOG10_KG } from "./evolution/engine";
import type { CatastropheRecord } from "./evolution/engine";
import { TRAIT_RANGES } from "./evolution/genome";
import type { PhylogenySummary } from "./evolution/phylogeny";

// ── Data model ────────────────────────────────────────────────────────────────

export type LifeStage =
  | "none"           // no life
  | "prebiotic"      // chemistry approaching life (kept in the type only, R9)
  | "microbial"      // simple single-celled life
  | "multicellular"  // complex cell structures
  | "complex"        // animals, plants, ecosystems
  | "dominant";      // life thoroughly shapes the planet

export interface ExtinctionEvent {
  cause: string;
  severityLoss: number; // share of living lineages lost (0–1)
  timeAgo: number;      // billion years ago (relative to star age)
}

export interface Biosphere {
  planetId: number;
  hostStarId: number;
  hasLife: boolean;
  stage: LifeStage;
  complexity: number;    // 0–1: sophistication of organisms
  diversity: number;     // 0–1: variety of life forms
  stability: number;     // 0–1: resistance to collapse
  adaptability: number;  // 0–1: evolutionary flexibility
  biomass: number;       // 0–1: relative abundance of life
  extinctions: ExtinctionEvent[];
  ageGyr: number;        // how long life has existed (or, if it has ended, lasted)
  /** Gyr ago that life ended, or null if it lives or never began (C2.5). */
  extinctAt: number | null;
}

// ── Stage thresholds (Revision 1, C2.5) ───────────────────────────────────────

/** Above this largest body mass (log10 kg), life can be complex. */
const COMPLEX_LOG10_KG = -3;
/** Food-chain levels complex life needs: producers and two levels of consumers. */
const COMPLEX_FOOD_CHAIN_LEVELS = 3;
/**
 * Living biomass, in the engine's unit (Earth's mean sunlight on the whole
 * planet), at which complex life is dominant. C2.10 (owner decision): the
 * plan's producer cover over 60% of the habitable area made nearly every
 * complex world dominant, since producers live almost everywhere.
 */
const DOMINANT_BIOMASS = 1;

// Biomass scale, log10 of the engine's unit: vent life to all of Earth's mean sunlight
const BIOMASS_LOG10 = { floor: -5, full: 0 };
const LN10 = log(10);

const CATASTROPHE_CAUSE: Record<CatastropheRecord["cause"], string> = {
  impact: "asteroid impact",
  volcanism: "volcanic pulse",
  climate: "climate shift",
};

function stageOf(life: PhylogenySummary): LifeStage {
  const largest = life.largestLog10BodyMassKg;
  if (largest === null) return "none";
  if (largest <= MULTICELLULAR_LOG10_KG) return "microbial";
  if (largest <= COMPLEX_LOG10_KG || life.foodChainLevels < COMPLEX_FOOD_CHAIN_LEVELS) return "multicellular";
  return life.totalBiomass >= DOMINANT_BIOMASS ? "dominant" : "complex";
}

function share(value: number, from: number, to: number): number {
  return Math.min(1, Math.max(0, (value - from) / (to - from)));
}

// ── Main generator ────────────────────────────────────────────────────────────

/** The planet's biosphere today, read from the phylogeny its world history left. */
export function generateBiosphere(planet: Planet, star: Star): Biosphere {
  const empty: Biosphere = {
    planetId: planet.id, hostStarId: planet.hostStarId,
    hasLife: false, stage: "none",
    complexity: 0, diversity: 0, stability: 0, adaptability: 0, biomass: 0,
    extinctions: [], ageGyr: 0, extinctAt: null,
  };
  // Whether there is life, and since when, is the world history's (R4, C2.3b)
  if (!planet.life) return empty;
  const { startedGyr, endedGyr, phylogeny } = planet.life;

  const extinctions: ExtinctionEvent[] = phylogeny.lethalCatastrophes
    .map((c) => ({ cause: CATASTROPHE_CAUSE[c.cause], severityLoss: c.lineagesLost / c.aliveBefore, timeAgo: star.age - c.tGyr }))
    .sort((a, b) => a.timeAgo - b.timeAgo);

  if (endedGyr !== null) {
    return { ...empty, extinctions, ageGyr: endedGyr - startedGyr, extinctAt: star.age - endedGyr };
  }

  const { min, max } = TRAIT_RANGES.log10BodyMassKg;
  return {
    planetId: planet.id,
    hostStarId: planet.hostStarId,
    hasLife: true,
    stage: stageOf(phylogeny),
    complexity: share(phylogeny.largestLog10BodyMassKg!, min, max),
    diversity: phylogeny.diversity,
    stability: phylogeny.recentSurvival,
    adaptability: phylogeny.traitSpread,
    biomass: phylogeny.totalBiomass > 0 ? share(log(phylogeny.totalBiomass) / LN10, BIOMASS_LOG10.floor, BIOMASS_LOG10.full) : 0,
    extinctions,
    ageGyr: star.age - startedGyr,
    extinctAt: null,
  };
}

// ── Descriptive label helpers ─────────────────────────────────────────────────

export const STAGE_LABEL: Record<LifeStage, string> = {
  none:          "No Life Detected",
  prebiotic:     "Prebiotic Chemistry",
  microbial:     "Microbial Life",
  multicellular: "Multicellular Organisms",
  complex:       "Complex Ecosystems",
  dominant:      "Dominant Biosphere",
};

export const STAGE_COLOR: Record<LifeStage, string> = {
  none:          "rgba(100, 100, 120, 0.4)",
  prebiotic:     "rgba(160, 180, 100, 0.6)",
  microbial:     "rgba(100, 200, 120, 0.7)",
  multicellular: "rgba(60,  210, 160, 0.8)",
  complex:       "rgba(80,  230, 100, 0.9)",
  dominant:      "rgba(140, 255, 80,  1.0)",
};
