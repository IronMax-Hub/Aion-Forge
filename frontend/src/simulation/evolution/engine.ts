// Evolution engine (Worlds Up Close, phase C2.3a).
//
// Why it exists: life should branch, adapt and die out under the conditions
// of its own planet's history, so that what a world holds today is the result
// of that history rather than a roll. This steps a planet's lineages through
// one step of its environment (environment.ts). The world history loop will
// call it once per step (C2.3b); until then nothing calls it, and no outcome
// changes.
//
// Units. Energy and biomass share one unit: 1 = Earth's present mean sunlight
// falling on the whole planet, per step. A lineage's biomass is the energy it
// captures net of its costs, so light users on a sunlit Earth-like world can
// reach order 0.1–1, and chemical users, living on a trickle of vent energy,
// far less.
//
// A lineage is a population sharing one genome (genome.ts) and a place in the
// food chain: producers (chemical or light) at level 0, consumers one level
// above what they eat, up to MAX_LEVEL. Its niche is habitat × level.
//
// One step: the six stages of Revision 1 (C2.3), with speciation first, so the
// children drift and compete within the step and one sharing pass serves all.
//   1. Speciate. A lineage splits at SPECIATION_PER_GYR, faster when
//      neighbouring niches are empty and when the world holds fewer lineages
//      than the cap (after a mass extinction, survivors radiate). The child
//      drifts further, and may switch energy source, move to a neighbouring
//      habitat, or eat a level up or down.
//   2. Mutate. Each lineage proposes a drifted genome (seeded normal steps) and
//      keeps it unless its potential biomass (what it could hold alone, less
//      what predators able to eat it would take) falls by more than
//      DRIFT_TOLERANCE: a lineage stands for a population, in which better
//      variants spread, and nearly neutral ones can spread by drift.
//   3. Score and compete. Per band, a lineage's surplus is its intake minus
//      its costs, as fractions of the energy reaching it:
//        intake = match × yield(O₂, M) × uptake(O₂, M)
//          match: light users, the star's Planck spectrum at the absorption
//                 peak relative to its maximum; others 1.
//          yield: anaerobic 1/18 of aerobic, rising smoothly with O₂. The O₂
//                 at which half the gain is reached rises with the body's
//                 linear size, (M / 10⁻⁹ kg)^⅓, since oxygen must diffuse
//                 further into a bigger body (owner decision).
//          uptake: need grows as M^¾ (Kleiber) but uptake through surfaces
//                 as M^⅔, so a body relying on its surfaces takes in
//                 relatively less, (M / M_cell)^(−1/12); oxygen-powered
//                 transport lifts that limit in proportion to the aerobic
//                 share. Without oxygen, bodies stop near 10⁻⁶ kg.
//        costs  = maintenance + information · info² + thermal · (ΔT / 10 K)²
//                 + on land: support · g · M^(7/12) (the plan's g · M^(4/3)
//                   per individual, per unit of Kleiber metabolism M^¾)
//                   and UV · surfaceUV
//                 + in shallow water: UV · surfaceUV · SHALLOW_UV_SHARE
//      Energy reaching a niche in a band is shared among its lineages by
//      weight, surplus⁺ × (1 + INFO_SHARE_BONUS · info) for light users and
//      consumers. Producers draw on the band's light (sunlit water, land) or
//      chemical energy (deep water, ∝ tectonic activity). A consumer draws
//      TROPHIC_EFFICIENCY of the biomass one level down in its habitat, can
//      eat only lineages no heavier than itself (owner decision), and what it
//      takes the prey loses (PREDATION_LOSS), so large prey escape and
//      predators gain by being large. A lineage with no surplus anywhere, or
//      below MIN_NICHE_SHARE of its niche, dies out.
//   4. Catastrophes. The step's impact, volcanic pulse and climate transitions
//      come in with the environment. Each kills each lineage with a
//      probability that rises with body mass and food-chain level.
//   5. Cap. Above LINEAGE_CAP living lineages, the weakest in the most crowded
//      niche dies out.
// Every draw comes from its own stream, mixSeed(galaxySeed, starId,
// planetIndex, EVOLUTION, lineageId, step, purpose), so changing one rule
// changes only the draws that rule touches.
//
// Assumptions and limits:
// - Biomass is at equilibrium with each step's energy: no population lags.
// - Light capture uses the spectrum's shape only; photon counts per watt and
//   absorption bandwidth are not modelled.
// - All constants are starting values, to be tuned in C2.10 with their reasons
//   recorded in Documents/evolution.md.

import { cos, log, exp, pow } from "../detmath";
import { createRNG, mixSeed, SALT } from "../rng";
import type { Environment, EnvironmentBand } from "./environment";
import { clampGenome, ENERGY_SOURCES, TRAIT_RANGES } from "./genome";
import type { ContinuousTrait, EnergySource, Genome, Habitat } from "./genome";

// ── Constants ─────────────────────────────────────────────────────────────────

/** Most lineages alive at once. */
export const LINEAGE_CAP = 32;
/** Highest food-chain level: consumers of consumers of consumers. */
export const MAX_LEVEL = 3;
/** Above this body mass (log10 kg) a lineage counts as multicellular (R9). */
export const MULTICELLULAR_LOG10_KG = -9;

// Energy
const CHEMICAL_SUPPLY = 0.01;          // vent and sediment energy per unit of deep water at full tectonic activity
const TROPHIC_EFFICIENCY = 0.1;        // share of prey biomass a consumer level can draw on
const AEROBIC_YIELD = 18;              // aerobic over anaerobic energy per unit of food
const O2_HALF_BAR_AT_REFERENCE = 1e-5; // O₂ giving half the aerobic gain to a 10⁻⁹ kg body
const O2_REFERENCE_LOG10_KG = -9;

// Costs, as fractions of the energy reaching a lineage
const COST = {
  maintenance: 0.01,
  information: 0.3,          // × info²
  thermal: 0.005,            // × (ΔT / THERMAL_SCALE_K)²
  support: 0.005,            // × g × (M / 1 kg)^(7/12), on land
  uv: 0.02,                  // × surface UV, on land
};
const THERMAL_SCALE_K = 10;
const SHALLOW_UV_SHARE = 0.1;  // share of surface UV that reaches the sunlit water layer's life
const SUPPORT_EXPONENT = 7 / 12;

// Competition
const INFO_SHARE_BONUS = 3;
const MIN_NICHE_SHARE = 0.005;
// Share of a prey's production lost for each unit of its eaters' surplus-weighted share
const PREDATION_LOSS = 0.5;

// Mutation: normal step per step of the history, and larger at speciation
const MUTATION_SIGMA: Record<ContinuousTrait, number> = {
  absorptionPeakNm: 10,
  log10BodyMassKg: 0.3,
  thermalOptimumK: 2,
  informationProcessing: 0.02,
};
const SPECIATION_MUTATION_FACTOR = 3;
// A drifted genome spreads unless it costs more than this share of the lineage's potential (drift fixes nearly neutral variants)
const DRIFT_TOLERANCE = 0.01;

// Speciation
const SPECIATION_PER_GYR = 2;
const EMPTY_NICHE_BONUS = 0.5;   // per empty neighbouring niche
const ROOM_BONUS = 2;            // at an empty world; falls to 0 as living lineages reach the cap
const SWITCH_CHANCE = { source: 0.15, habitat: 0.15, level: 0.2 };

// Catastrophes: chance each kills a lineage of the smallest size at level 0
const KILL_CHANCE = { impact: 0.15, volcanicPulse: 0.05, transition: 0.1 };
const KILL_SIZE_WEIGHT = 1;      // added per 20 orders of magnitude of body mass
const KILL_LEVEL_WEIGHT = 0.5;   // added per food-chain level
const KILL_CHANCE_MAX = 0.95;

// Light capture: Planck's second radiation constant, nm·K; Wien's constant, nm·K
const PLANCK_C2_NM_K = 1.4388e7;
const WIEN_NM_K = 2.8978e6;

/** Draw purposes within a lineage's stream. */
const PURPOSE = { MUTATE: 1, SPECIATE: 2, CHILD: 3, SURVIVE: 16 } as const;

const HABITAT_NEIGHBOURS: Record<Habitat, Habitat[]> = {
  "deep-water": ["shallow-water"],
  "shallow-water": ["deep-water", "land"],
  land: ["shallow-water"],
};

// ── Types ─────────────────────────────────────────────────────────────────────

export type DeathCause = "unviable" | "outcompeted" | "impact" | "volcanism" | "climate" | "crowded";

export interface Lineage {
  /** Assigned in birth order. */
  id: number;
  parentId: number | null;
  bornGyr: number;
  diedGyr: number | null;
  deathCause: DeathCause | null;
  genome: Genome;
  /** Food-chain level: 0 for producers, one above what a consumer eats. */
  level: number;
  /** Biomass at the end of the last step (unit in the header). */
  biomass: number;
  /** Biomass per climate band. */
  bandBiomass: Float64Array;
  /**
   * The coldest and warmest habitat temperatures, K, the lineage and its
   * ancestors have held biomass in (C2.6: a mind's adaptability). A record
   * only: no rule of the engine reads it. ±Infinity until it first holds any.
   */
  coldestK: number;
  warmestK: number;
}

/** Life's firsts; "kilogram" is the first body heavier than 1 kg (C2.10: the Earth-path measurement). */
export type FirstKind = "light" | "consumer" | "multicellular" | "land" | "kilogram";

export interface EvolutionFirst {
  kind: FirstKind;
  tGyr: number;
  lineageId: number;
}

export interface CatastropheRecord {
  tGyr: number;
  cause: "impact" | "volcanism" | "climate";
  aliveBefore: number;
  lineagesLost: number;
}

export interface EvolutionState {
  /** Every lineage that ever lived, in birth order. */
  lineages: Lineage[];
  nextId: number;
  startedGyr: number;
  /** When the last lineage died out, or null while life lasts. */
  endedGyr: number | null;
  firsts: EvolutionFirst[];
  catastrophes: CatastropheRecord[];
  /** Biomass of light users, of chemical users, and of all life, after the last step. */
  lightBiomass: number;
  chemicalBiomass: number;
  totalBiomass: number;
}

/** Identifies a planet's evolution streams. */
export interface EvolutionKeys {
  galaxySeed: number;
  starId: number;
  planetIndex: number;
}

// ── Draws ─────────────────────────────────────────────────────────────────────

function streamFor(keys: EvolutionKeys, lineageId: number, step: number, purpose: number): () => number {
  return createRNG(mixSeed(keys.galaxySeed, keys.starId, keys.planetIndex, SALT.EVOLUTION, lineageId, step, purpose));
}

/** A standard normal draw (Box–Muller). */
function normal(rng: () => number): number {
  const u = Math.max(1e-12, rng());
  return Math.sqrt(-2 * log(u)) * cos(2 * Math.PI * rng());
}

function drift(genome: Genome, rng: () => number, factor: number): Genome {
  const next = { ...genome };
  for (const trait of Object.keys(MUTATION_SIGMA) as ContinuousTrait[]) {
    next[trait] = genome[trait] + MUTATION_SIGMA[trait] * factor * normal(rng);
  }
  return clampGenome(next);
}

// ── Energy budget ─────────────────────────────────────────────────────────────

/** Share of a star's light a pigment absorbing at `peakNm` catches, relative to one at the spectrum's peak. */
export function lightMatch(peakNm: number, starTemperatureK: number): number {
  if (starTemperatureK <= 0) return 0;
  const spectralPeakNm = WIEN_NM_K / starTemperatureK;
  const planck = (nm: number) => 1 / (pow(nm, 5) * (exp(PLANCK_C2_NM_K / (nm * starTemperatureK)) - 1));
  return planck(peakNm) / planck(spectralPeakNm);
}

/** Share of a body's metabolism that can run aerobically in this much O₂: half at an O₂ level rising with its linear size. */
export function aerobicShare(o2Bar: number, log10BodyMassKg: number): number {
  const halfBar = O2_HALF_BAR_AT_REFERENCE * pow(10, (log10BodyMassKg - O2_REFERENCE_LOG10_KG) / 3);
  return o2Bar / (o2Bar + halfBar);
}

/** Energy yield of food relative to full aerobic respiration, for a body of this mass in this much O₂. */
export function oxygenYield(o2Bar: number, log10BodyMassKg: number): number {
  return yieldAt(aerobicShare(o2Bar, log10BodyMassKg));
}

function yieldAt(aerobic: number): number {
  return (1 + (AEROBIC_YIELD - 1) * aerobic) / AEROBIC_YIELD;
}

/**
 * Uptake per unit of metabolic need, relative to a single cell. Need grows as
 * M^¾ (Kleiber) and uptake through the body's surfaces as M^⅔, so a body that
 * relies on its surfaces takes in relatively less, as M^(−1/12). Oxygen-powered
 * transport lifts that limit in proportion to the aerobic share.
 */
export function uptakePerNeed(o2Bar: number, log10BodyMassKg: number): number {
  return uptakeAt(aerobicShare(o2Bar, log10BodyMassKg), log10BodyMassKg);
}

function uptakeAt(aerobic: number, log10BodyMassKg: number): number {
  const surfaceLimited = pow(10, -(log10BodyMassKg - TRAIT_RANGES.log10BodyMassKg.min) / 12);
  return aerobic + (1 - aerobic) * surfaceLimited;
}

function habitatArea(band: EnvironmentBand, habitat: Habitat): number {
  if (habitat === "land") return band.landArea;
  return habitat === "shallow-water" ? band.shallowWaterArea : band.deepWaterArea;
}

function habitatK(band: EnvironmentBand, habitat: Habitat): number {
  return habitat === "land" ? band.landK : band.waterK;
}

/** The parts of a lineage's energy budget that are the same in every band. */
interface Budget {
  intake: number;
  fixedCosts: number;
}

/** Budgets already worked out in one step's environment, by genome (a genome is never changed in place). */
type BudgetCache = Map<Genome, Budget>;

function budgetOf(genome: Genome, env: Environment, cache?: BudgetCache): Budget {
  const cached = cache?.get(genome);
  if (cached) return cached;
  const match = genome.energySource === "light" ? lightMatch(genome.absorptionPeakNm, env.starTemperatureK) : 1;
  // oxygenYield × uptakePerNeed, with the aerobic share they both read worked out once
  const aerobic = aerobicShare(env.o2Bar, genome.log10BodyMassKg);
  const intake = match * yieldAt(aerobic) * uptakeAt(aerobic, genome.log10BodyMassKg);
  let fixedCosts = COST.maintenance + COST.information * genome.informationProcessing * genome.informationProcessing;
  if (genome.habitat === "land") {
    fixedCosts += COST.support * env.gravity * pow(10, genome.log10BodyMassKg * SUPPORT_EXPONENT) + COST.uv * env.surfaceUV;
  } else if (genome.habitat === "shallow-water") {
    fixedCosts += COST.uv * env.surfaceUV * SHALLOW_UV_SHARE;
  }
  const budget = { intake, fixedCosts };
  cache?.set(genome, budget);
  return budget;
}

function bandSurplus(genome: Genome, budget: Budget, band: EnvironmentBand): number {
  const mismatch = (habitatK(band, genome.habitat) - genome.thermalOptimumK) / THERMAL_SCALE_K;
  return budget.intake - budget.fixedCosts - COST.thermal * mismatch * mismatch;
}

/** A lineage's surplus in one band: intake minus costs, as fractions of the energy reaching it. */
export function surplusIn(genome: Genome, band: EnvironmentBand, env: Environment): number {
  return bandSurplus(genome, budgetOf(genome, env), band);
}

/** Energy a producer's source offers in one band (before sharing). */
function producerSupply(source: EnergySource, habitat: Habitat, band: EnvironmentBand, env: Environment): number {
  const area = habitatArea(band, habitat);
  if (source === "light") return habitat === "deep-water" ? 0 : band.light * area;
  if (source === "chemical") return habitat === "deep-water" ? CHEMICAL_SUPPLY * env.tectonicActivity * area : 0;
  return 0;
}

/** Whether a consumer can eat a lineage: one level down, in its habitat, and no heavier than itself. */
export function canEat(consumer: Lineage, prey: Lineage): boolean {
  return prey.level === consumer.level - 1 && prey.genome.habitat === consumer.genome.habitat
    && prey.genome.log10BodyMassKg <= consumer.genome.log10BodyMassKg;
}

function shareWeight(genome: Genome, surplus: number): number {
  const bonus = genome.energySource === "chemical" ? 0 : INFO_SHARE_BONUS * genome.informationProcessing;
  return Math.max(0, surplus) * (1 + bonus);
}

/** A niche's key: habitat and food-chain level as one number (room for a level above the top, which is looked up but never filled). */
const nicheKey = (habitat: Habitat, level: number) => HABITAT_INDEX[habitat] * (MAX_LEVEL + 2) + level;
const nicheOf = (lineage: Lineage) => nicheKey(lineage.genome.habitat, lineage.level);

/**
 * The food and the predators each niche offers, fixed at the start of the
 * mutation stage: per habitat and level, lineages sorted by body mass with
 * running sums, so a body's edible supply and its exposure to predators are
 * lookups rather than scans.
 */
interface FoodWeb {
  /**
   * Sorted masses of the lineages in a niche, and per band the running sum of
   * their biomass (lightest first): row k, the sum over the k + 1 lightest, at
   * [k · bands, (k + 1) · bands).
   */
  masses: Map<number, number[]>;
  cumulative: Map<number, Float64Array>;
  /** Total biomass of a niche. */
  totals: Map<number, number>;
}

function foodWebOf(alive: Lineage[], bandCount: number): FoodWeb {
  const groups = new Map<number, Lineage[]>();
  for (const l of alive) {
    const key = nicheOf(l);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(l);
  }
  const web: FoodWeb = { masses: new Map(), cumulative: new Map(), totals: new Map() };
  for (const [key, group] of groups) {
    group.sort((x, y) => x.genome.log10BodyMassKg - y.genome.log10BodyMassKg || x.id - y.id);
    web.masses.set(key, group.map((l) => l.genome.log10BodyMassKg));
    const running = new Float64Array(group.length * bandCount);
    group.forEach((l, k) => {
      const row = k * bandCount;
      for (let b = 0; b < bandCount; b++) running[row + b] = (k === 0 ? 0 : running[row - bandCount + b]) + l.bandBiomass[b];
    });
    web.cumulative.set(key, running);
    web.totals.set(key, group.reduce((sum, l) => sum + l.biomass, 0));
  }
  return web;
}

/** Number of sorted masses no heavier than a mass. */
function countAtMost(masses: number[], mass: number): number {
  let lo = 0;
  let hi = masses.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (masses[mid] <= mass) lo = mid + 1; else hi = mid;
  }
  return lo;
}

/** Share of the consumer biomass one level up in a habitat that is heavy enough to eat a body of this mass. */
function predationExposure(habitat: Habitat, level: number, log10BodyMassKg: number, web: FoodWeb): number {
  const key = nicheKey(habitat, level + 1);
  const masses = web.masses.get(key);
  const total = web.totals.get(key) ?? 0;
  if (!masses || total <= 0) return 0;
  // Predators lighter than the body cannot eat it
  let lighter = 0;
  let lo = 0;
  let hi = masses.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (masses[mid] < log10BodyMassKg) lo = mid + 1; else hi = mid;
  }
  if (lo > 0) {
    const running = web.cumulative.get(key)!;
    const bandCount = running.length / masses.length;
    for (let b = (lo - 1) * bandCount; b < lo * bandCount; b++) lighter += running[b];
  }
  return Math.max(0, (total - lighter) / total);
}

/**
 * What a lineage could hold alone in its environment: the energy reaching it
 * in each band times its surplus there, less what predators able to eat it take.
 */
function potentialBiomass(genome: Genome, level: number, env: Environment, web: FoodWeb, budgets: BudgetCache): number {
  const budget = budgetOf(genome, env, budgets);
  let edible: Float64Array | null = null;
  let edibleRow = 0;
  if (level > 0) {
    const key = nicheKey(genome.habitat, level - 1);
    const masses = web.masses.get(key);
    const count = masses ? countAtMost(masses, genome.log10BodyMassKg) : 0;
    if (count === 0) return 0;
    edible = web.cumulative.get(key)!;
    edibleRow = (count - 1) * env.bands.length;
  }
  let total = 0;
  for (let b = 0; b < env.bands.length; b++) {
    const band = env.bands[b];
    const surplus = bandSurplus(genome, budget, band);
    if (surplus <= 0) continue;
    const supply = edible === null
      ? producerSupply(genome.energySource, genome.habitat, band, env)
      : TROPHIC_EFFICIENCY * edible[edibleRow + b];
    total += supply * surplus;
  }
  if (total <= 0) return 0;
  return total * (1 - PREDATION_LOSS * predationExposure(genome.habitat, level, genome.log10BodyMassKg, web));
}

// ── The step ──────────────────────────────────────────────────────────────────


const SOURCE_INDEX: Record<EnergySource, number> = { chemical: 0, light: 1, consumer: 2 };
const HABITAT_INDEX: Record<Habitat, number> = { "deep-water": 0, "shallow-water": 1, land: 2 };

// Scratch buffers the competition step reuses from step to step, so it does
// not allocate them each time; each is fully written before it is read.
const scratchBuffers: Float64Array[] = [new Float64Array(0), new Float64Array(0)];
function scratch(index: number, length: number): Float64Array {
  if (scratchBuffers[index].length < length) scratchBuffers[index] = new Float64Array(length * 2);
  return scratchBuffers[index];
}

/**
 * Sets every living lineage's biomass from this step's environment: producers
 * first, then each consumer level, which takes its share of the level below
 * and so lowers that level's biomass.
 */
function compete(alive: Lineage[], env: Environment, budgets: BudgetCache = new Map()): void {
  const bandCount = env.bands.length;
  const n = alive.length;
  // Each lineage's surplus and share weight in every band, once: lineage i, band b at i · bands + b
  const surplus = scratch(0, n * bandCount);
  const weight = scratch(1, n * bandCount);
  alive.forEach((lineage, i) => {
    lineage.bandBiomass = new Float64Array(bandCount);
    lineage.biomass = 0;
    const budget = budgetOf(lineage.genome, env, budgets);
    for (let b = 0; b < bandCount; b++) {
      const at = i * bandCount + b;
      surplus[at] = bandSurplus(lineage.genome, budget, env.bands[b]);
      weight[at] = shareWeight(lineage.genome, surplus[at]);
    }
  });
  const sumBands = (l: Lineage) => { let t = 0; for (let b = 0; b < bandCount; b++) t += l.bandBiomass[b]; l.biomass = t; };

  // Producers share each source's energy in each habitat
  const pool = new Float64Array(9);
  const poolOf = alive.map((l) => SOURCE_INDEX[l.genome.energySource] * 3 + HABITAT_INDEX[l.genome.habitat]);
  for (let b = 0; b < bandCount; b++) {
    pool.fill(0);
    for (let i = 0; i < n; i++) if (alive[i].level === 0) pool[poolOf[i]] += weight[i * bandCount + b];
    for (let i = 0; i < n; i++) {
      const l = alive[i];
      if (l.level !== 0 || weight[i * bandCount + b] <= 0) continue;
      l.bandBiomass[b] = producerSupply(l.genome.energySource, l.genome.habitat, env.bands[b], env)
        * (weight[i * bandCount + b] / pool[poolOf[i]]) * surplus[i * bandCount + b];
    }
  }
  for (let i = 0; i < n; i++) if (alive[i].level === 0) sumBands(alive[i]);

  // Consumers share each prey's production among those able to eat it; what they take, the prey loses
  for (let level = 1; level <= MAX_LEVEL; level++) {
    const eaters: number[] = [];
    for (let i = 0; i < n; i++) if (alive[i].level === level) eaters.push(i);
    if (eaters.length === 0) continue;
    const prey: number[] = [];
    for (let i = 0; i < n; i++) if (alive[i].level === level - 1 && alive[i].biomass > 0) prey.push(i);
    for (const p of prey) {
      const able = eaters.filter((i) => canEat(alive[i], alive[p]));
      if (able.length === 0) continue;
      const preyBands = alive[p].bandBiomass;
      for (let b = 0; b < bandCount; b++) {
        const production = preyBands[b];
        if (production <= 0) continue;
        let totalWeight = 0;
        for (const i of able) totalWeight += weight[i * bandCount + b];
        if (totalWeight <= 0) continue;
        let grazed = 0;
        for (const i of able) {
          if (weight[i * bandCount + b] <= 0) continue;
          const share = (weight[i * bandCount + b] / totalWeight) * surplus[i * bandCount + b];
          alive[i].bandBiomass[b] += TROPHIC_EFFICIENCY * production * share;
          grazed += share;
        }
        preyBands[b] = production * (1 - PREDATION_LOSS * Math.min(1, grazed));
      }
      sumBands(alive[p]);
    }
    for (const i of eaters) sumBands(alive[i]);
  }
}

/** Widens each lineage's record of the temperatures it has lived in to the bands where it now holds biomass. */
function recordTemperatures(alive: Lineage[], env: Environment): void {
  for (const lineage of alive) {
    env.bands.forEach((band, b) => {
      if (lineage.bandBiomass[b] <= 0) return;
      const k = habitatK(band, lineage.genome.habitat);
      lineage.coldestK = Math.min(lineage.coldestK, k);
      lineage.warmestK = Math.max(lineage.warmestK, k);
    });
  }
}

function kill(lineage: Lineage, tGyr: number, cause: DeathCause): void {
  lineage.diedGyr = tGyr;
  lineage.deathCause = cause;
  lineage.biomass = 0;
}

/** Empty niches next to a lineage's: neighbouring habitats at its level, and a level up or down in its habitat. */
function emptyNeighbours(lineage: Lineage, occupied: Set<number>): number {
  const candidates = HABITAT_NEIGHBOURS[lineage.genome.habitat].map((h) => nicheKey(h, lineage.level));
  if (lineage.level < MAX_LEVEL) candidates.push(nicheKey(lineage.genome.habitat, lineage.level + 1));
  if (lineage.level > 0) candidates.push(nicheKey(lineage.genome.habitat, lineage.level - 1));
  return candidates.filter((n) => !occupied.has(n)).length;
}

function childOf(parent: Lineage, id: number, tGyr: number, rng: () => number): Lineage {
  let genome = drift(parent.genome, rng, SPECIATION_MUTATION_FACTOR);
  let level = parent.level;
  if (rng() < SWITCH_CHANCE.source) {
    const others = ENERGY_SOURCES.filter((s) => s !== genome.energySource);
    genome = { ...genome, energySource: others[Math.floor(rng() * others.length)] };
  }
  if (rng() < SWITCH_CHANCE.habitat) {
    const neighbours = HABITAT_NEIGHBOURS[genome.habitat];
    genome = { ...genome, habitat: neighbours[Math.floor(rng() * neighbours.length)] };
  }
  if (genome.energySource !== "consumer") level = 0;
  else if (level === 0) level = 1;
  else if (rng() < SWITCH_CHANCE.level) level = Math.min(MAX_LEVEL, Math.max(1, level + (rng() < 0.5 ? -1 : 1)));
  return {
    id, parentId: parent.id, bornGyr: tGyr, diedGyr: null, deathCause: null, genome, level,
    biomass: 0, bandBiomass: new Float64Array(parent.bandBiomass.length),
    coldestK: parent.coldestK, warmestK: parent.warmestK,
  };
}

function killChance(base: number, lineage: Lineage): number {
  const size = (lineage.genome.log10BodyMassKg - TRAIT_RANGES.log10BodyMassKg.min) / 20;
  return Math.min(KILL_CHANCE_MAX, base * (1 + KILL_SIZE_WEIGHT * size) * (1 + KILL_LEVEL_WEIGHT * lineage.level));
}

const FIRST_TESTS: [FirstKind, (l: Lineage) => boolean][] = [
  ["light", (l) => l.genome.energySource === "light"],
  ["consumer", (l) => l.genome.energySource === "consumer"],
  ["multicellular", (l) => l.genome.log10BodyMassKg > MULTICELLULAR_LOG10_KG],
  ["land", (l) => l.genome.habitat === "land"],
  ["kilogram", (l) => l.genome.log10BodyMassKg > 0],
];

/**
 * Life's first lineage: a single chemical-energy cell in deep water, suited
 * to the water's temperature there. It draws nothing: its traits follow from
 * where it starts. Null where there is no liquid water.
 */
export function startLife(env: Environment): EvolutionState | null {
  let area = 0;
  let warmth = 0;
  for (const band of env.bands) {
    area += band.deepWaterArea;
    warmth += band.deepWaterArea * band.waterK;
  }
  if (area <= 0) return null;
  const genome = clampGenome({
    energySource: "chemical",
    absorptionPeakNm: WIEN_NM_K / env.starTemperatureK,
    log10BodyMassKg: TRAIT_RANGES.log10BodyMassKg.min,
    habitat: "deep-water",
    thermalOptimumK: warmth / area,
    informationProcessing: 0,
  });
  const ancestor: Lineage = {
    id: 0, parentId: null, bornGyr: env.tGyr, diedGyr: null, deathCause: null, genome, level: 0,
    biomass: 0, bandBiomass: new Float64Array(env.bands.length),
    coldestK: Infinity, warmestK: -Infinity,
  };
  compete([ancestor], env);
  recordTemperatures([ancestor], env);
  return {
    lineages: [ancestor], nextId: 1, startedGyr: env.tGyr, endedGyr: null, firsts: [], catastrophes: [],
    lightBiomass: 0, chemicalBiomass: ancestor.biomass, totalBiomass: ancestor.biomass,
  };
}

/** Steps a planet's lineages through one step of its history. Returns a new state; the old one is not changed. */
export function stepEvolution(previous: EvolutionState, env: Environment, keys: EvolutionKeys, step: number): EvolutionState {
  if (previous.endedGyr !== null) return previous;
  const t = env.tGyr;
  // Copy the living; the dead are kept as they were. Genomes and band arrays are
  // replaced, never changed in place, so the copies can share them.
  const lineages = previous.lineages.map((l) => (l.diedGyr === null ? { ...l } : l));
  let alive = lineages.filter((l) => l.diedGyr === null);

  // 1. Speciate, in birth order, from last step's standing: children then drift and compete with the rest
  let nextId = previous.nextId;
  const occupied = new Set(alive.map(nicheOf));
  const room = 1 + ROOM_BONUS * Math.max(0, 1 - alive.length / LINEAGE_CAP);
  const children: Lineage[] = [];
  for (const parent of alive) {
    const rng = streamFor(keys, parent.id, step, PURPOSE.SPECIATE);
    const rate = SPECIATION_PER_GYR * (1 + EMPTY_NICHE_BONUS * emptyNeighbours(parent, occupied)) * room;
    if (rng() < 1 - exp(-rate * env.dtGyr)) {
      children.push(childOf(parent, nextId, t, streamFor(keys, parent.id, step, PURPOSE.CHILD)));
      nextId++;
    }
  }
  lineages.push(...children);
  alive.push(...children);

  // 2. Mutate: keep a drifted genome unless it costs the lineage more than the drift tolerance,
  // judged against the food web as the step began
  const web = foodWebOf(alive, env.bands.length);
  const budgets: BudgetCache = new Map();
  for (const lineage of alive) {
    const proposal = drift(lineage.genome, streamFor(keys, lineage.id, step, PURPOSE.MUTATE), 1);
    const current = potentialBiomass(lineage.genome, lineage.level, env, web, budgets);
    if (potentialBiomass(proposal, lineage.level, env, web, budgets) >= current * (1 - DRIFT_TOLERANCE)) {
      lineage.genome = proposal;
    }
  }

  // 3. Score and compete; the unviable and the squeezed-out die
  compete(alive, env, budgets);
  recordTemperatures(alive, env);
  const nicheTotals = new Map<number, number>();
  for (const l of alive) nicheTotals.set(nicheOf(l), (nicheTotals.get(nicheOf(l)) ?? 0) + l.biomass);
  for (const l of alive) {
    if (l.biomass <= 0) kill(l, t, "unviable");
    else if (l.biomass < MIN_NICHE_SHARE * nicheTotals.get(nicheOf(l))!) kill(l, t, "outcompeted");
  }
  alive = alive.filter((l) => l.diedGyr === null);

  // 4. Catastrophes, each drawn per lineage from its own stream
  const catastrophes = [...previous.catastrophes];
  const events: { cause: CatastropheRecord["cause"]; chance: number }[] = [];
  if (env.catastrophes.impact) events.push({ cause: "impact", chance: KILL_CHANCE.impact });
  if (env.catastrophes.volcanicPulse) events.push({ cause: "volcanism", chance: KILL_CHANCE.volcanicPulse });
  for (let i = 0; i < env.catastrophes.transitions.length; i++) events.push({ cause: "climate", chance: KILL_CHANCE.transition });
  events.forEach((event, e) => {
    const before = alive.length;
    for (const l of alive) {
      if (streamFor(keys, l.id, step, PURPOSE.SURVIVE + e)() < killChance(event.chance, l)) kill(l, t, event.cause);
    }
    alive = alive.filter((l) => l.diedGyr === null);
    catastrophes.push({ tGyr: t, cause: event.cause, aliveBefore: before, lineagesLost: before - alive.length });
  });

  // 5. Cap: the weakest in the most crowded niche goes first
  while (alive.length > LINEAGE_CAP) {
    const counts = new Map<number, number>();
    for (const l of alive) counts.set(nicheOf(l), (counts.get(nicheOf(l)) ?? 0) + 1);
    let crowded = -1;
    let most = 0;
    for (const [niche, count] of counts) if (count > most) { most = count; crowded = niche; }
    const weakest = alive.filter((l) => nicheOf(l) === crowded).reduce((a, b) => (b.biomass < a.biomass ? b : a));
    kill(weakest, t, "crowded");
    alive = alive.filter((l) => l.diedGyr === null);
  }

  // Firsts, by the lowest id that qualifies
  const firsts = [...previous.firsts];
  for (const [kind, test] of FIRST_TESTS) {
    if (firsts.some((f) => f.kind === kind)) continue;
    const first = alive.find(test);
    if (first) firsts.push({ kind, tGyr: t, lineageId: first.id });
  }

  let lightBiomass = 0;
  let chemicalBiomass = 0;
  let totalBiomass = 0;
  for (const l of alive) {
    totalBiomass += l.biomass;
    if (l.genome.energySource === "light") lightBiomass += l.biomass;
    if (l.genome.energySource === "chemical") chemicalBiomass += l.biomass;
  }

  return {
    lineages, nextId, startedGyr: previous.startedGyr, endedGyr: alive.length === 0 ? t : null,
    firsts, catastrophes, lightBiomass, chemicalBiomass, totalBiomass,
  };
}

/** The lineages alive in a state. */
export function livingLineages(state: EvolutionState): Lineage[] {
  return state.lineages.filter((l) => l.diedGyr === null);
}
