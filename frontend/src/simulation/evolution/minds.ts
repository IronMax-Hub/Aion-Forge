// Minds (Worlds Up Close, phase C2.6).
//
// Why it exists: a civilization should arise from a real lineage at a real
// moment in its planet's history, not from a roll against a biosphere score.
// This finds that lineage and moment, and keeps what the civilization's
// species is read from.
//
// The rule: a mind appears in the first living lineage (lowest id) whose
// information processing reaches a threshold while its body is heavier than
// 1 g (owner decision, C2.6: the plan's information-only rule, measured, made
// microbes minds on nine worlds in ten; 1 g is the complex-life size of C2.5).
// It is checked after every evolution step, and only the first mind counts.
//
// The threshold is scaled by the Intelligence parameter by shrinking the
// headroom above the base (owner decision): 1 − (1 − 0.5) × modifier, so 1.0
// gives 0.5, 1.5 gives 0.25, 0.3 gives 0.85 and 0.05 gives 0.975. Low
// settings make minds very rare, not impossible.
//
// What is kept for the species (Revision 1, C2.6):
//   information processing  its intelligence
//   consumer ancestry       its aggression: the share of the lineage and its
//                           ancestors that ate other life
//   temperature span        its adaptability: how wide a range of habitat
//                           temperatures the lineage and its ancestors held
//                           biomass in (engine: coldestK, warmestK)
// Curiosity, cooperation and resilience have no trait to come from yet, so the
// civilization keeps seeded draws for them (Documents/evolution.md lists them
// as candidates for new traits).
//
// Assumptions and limits: the mind is read at the step it appears, not
// updated afterwards. Whether its lineage still lives is read at the end of
// the history (phylogeny.ts).

import type { EvolutionState, Lineage } from "./engine";

/** Information processing a mind needs at the default Intelligence setting. */
export const MIND_BASE_THRESHOLD = 0.5;
/** A mind's body is heavier than this, log10 kg (1 g). */
export const MIND_MIN_LOG10_KG = -3;

/** A mind as it appeared. */
export interface Mind {
  /** When it appeared, Gyr after the star formed. */
  tGyr: number;
  lineageId: number;
  informationProcessing: number;
  log10BodyMassKg: number;
  /** Share of the lineage and its ancestors that were consumers, 0–1. */
  consumerAncestry: number;
  /** Width of the habitat temperatures the lineage and its ancestors lived in, K. */
  temperatureSpanK: number;
}

/** The information processing a mind needs under an Intelligence setting. */
export function mindThreshold(intelligenceModifier: number): number {
  return Math.min(1, Math.max(0, 1 - (1 - MIND_BASE_THRESHOLD) * intelligenceModifier));
}

/** Share of a lineage and its ancestors that were consumers. Lineage ids are their places in the state's list. */
function consumerAncestryOf(lineage: Lineage, lineages: Lineage[]): number {
  let count = 0;
  let consumers = 0;
  for (let l: Lineage | null = lineage; l !== null; l = l.parentId === null ? null : lineages[l.parentId]) {
    count++;
    if (l.genome.energySource === "consumer") consumers++;
  }
  return consumers / count;
}

/** The first living lineage that qualifies as a mind now, or null. */
export function findMind(state: EvolutionState, threshold: number, tGyr: number): Mind | null {
  const mind = state.lineages.find((l) => l.diedGyr === null
    && l.genome.log10BodyMassKg > MIND_MIN_LOG10_KG && l.genome.informationProcessing >= threshold);
  if (!mind) return null;
  return {
    tGyr,
    lineageId: mind.id,
    informationProcessing: mind.genome.informationProcessing,
    log10BodyMassKg: mind.genome.log10BodyMassKg,
    consumerAncestry: consumerAncestryOf(mind, state.lineages),
    temperatureSpanK: Math.max(0, mind.warmestK - mind.coldestK),
  };
}
