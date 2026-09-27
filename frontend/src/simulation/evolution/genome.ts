// Genome of an evolving lineage (Worlds Up Close, phase C2.1).
//
// Why it exists: evolution (C2.3) steps lineages, populations that share one
// set of traits, through each planet's world history. This defines what can
// evolve: six traits, each with a physical meaning, a unit and a range, and
// each present only because a named rule of the engine reads it
// (Worlds-Up-Close-Revision-1.md, C2.1).
//
// The traits:
// - Energy source: chemical (vents and sediments), light, or consumer (eats
//   other lineages). Read by the energy intake. Changes only at speciation.
// - Absorption peak, nm (400–1,100): the wavelength a light user's pigment
//   absorbs best. Read by light capture against the star's spectrum, and by
//   the vegetation colour seen from orbit. Every lineage carries one, but only
//   a light user's is read; a lineage that turns to light at speciation starts
//   from its parent's value (owner decision).
// - Body mass, stored as log10 of kilograms (−15 to 5, a bacterium to a large
//   whale): mass spans twenty orders of magnitude, and drift acts on its
//   logarithm. Read by the maintenance, support and oxygen-yield costs, and by
//   the life stage.
// - Habitat: deep water, shallow water or land. Read by the energy intake
//   (light and chemical energy differ with depth) and by the UV and support
//   costs. Changes only at speciation.
// - Thermal optimum, K (250–400): the temperature a lineage does best at. Read
//   by the thermal-mismatch cost against its band's temperature. The range
//   spans known life on Earth, from brine microbes near 253 K to vent microbes
//   at 395 K (owner decision).
// - Information processing (0–1): read by the foraging and competition bonus,
//   by its energy cost, and by the rule for minds.
//
// A consumer's place in the food chain is not a trait: it follows from what it
// eats, and the engine records it for each lineage.
//
// Not in the genome, on purpose: organisation levels, symmetry, limbs,
// skeleton, eyes, sociality, manipulators, reproduction strategy, flight. A
// trait is added only when the stats harness shows a gap the six cannot
// express, and every addition is recorded in the Genome changelog of
// Documents/evolution.md. A trait no rule reads is never added.
//
// Assumptions and limits: the rules that read the traits arrive with the
// engine (C2.3). Until then TRAIT_READERS names them, and the engine's own
// module will be held to that list.

/** Where a lineage gets its energy. */
export type EnergySource = "chemical" | "light" | "consumer";
export const ENERGY_SOURCES: readonly EnergySource[] = ["chemical", "light", "consumer"];

/** Where a lineage lives. */
export type Habitat = "deep-water" | "shallow-water" | "land";
export const HABITATS: readonly Habitat[] = ["deep-water", "shallow-water", "land"];

/** The traits a lineage passes on, with drift, to its descendants. */
export interface Genome {
  energySource: EnergySource;
  /** Wavelength of best absorption, nm; only read while the lineage uses light. */
  absorptionPeakNm: number;
  /** log10 of body mass in kg. */
  log10BodyMassKg: number;
  habitat: Habitat;
  /** Temperature of best performance, K. */
  thermalOptimumK: number;
  /** 0–1. */
  informationProcessing: number;
}

/** The continuous traits: those that drift at every step. */
export type ContinuousTrait = "absorptionPeakNm" | "log10BodyMassKg" | "thermalOptimumK" | "informationProcessing";

/** Where each continuous trait may lie; drift is clamped to these. */
export const TRAIT_RANGES: Readonly<Record<ContinuousTrait, { min: number; max: number }>> = {
  absorptionPeakNm: { min: 400, max: 1100 },
  log10BodyMassKg: { min: -15, max: 5 },
  thermalOptimumK: { min: 250, max: 400 },
  informationProcessing: { min: 0, max: 1 },
};

/** The engine rules that read each trait (C2.3); a trait with no reader does not belong in the genome. */
export const TRAIT_READERS: Readonly<Record<keyof Genome, readonly string[]>> = {
  energySource: ["energy intake"],
  absorptionPeakNm: ["light capture", "vegetation colour"],
  log10BodyMassKg: ["maintenance cost", "support cost", "oxygen yield", "life stage"],
  habitat: ["energy intake", "UV cost", "support cost"],
  thermalOptimumK: ["thermal cost"],
  informationProcessing: ["competition share", "information cost", "minds"],
};

/** The genome with every continuous trait brought inside its range. */
export function clampGenome(genome: Genome): Genome {
  const clamped = { ...genome };
  for (const trait of Object.keys(TRAIT_RANGES) as ContinuousTrait[]) {
    const { min, max } = TRAIT_RANGES[trait];
    clamped[trait] = Math.min(max, Math.max(min, genome[trait]));
  }
  return clamped;
}
