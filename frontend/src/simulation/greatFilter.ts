// The Great Filter, measured (Galaxy Through Time, GF1).
//
// Why it exists: the Great Filter (Hanson 1998) asks which step from dead
// matter to a lasting civilization is the hard one. Here it is counted rather
// than argued: every world of a universe is put through twelve gates, and the
// gate that lets the smallest share through is the universe's filter.
//
// How: each gate is a predicate on a row of the universe index (EN0). A world
// reaches gate k when it passes gates 1 to k, so counts never rise down the
// funnel. Pure: it reads the index and decides nothing.
//
// Assumptions and limits:
// - Gate 5 reads life's own oxygen against the volcanic and crust sinks
//   (lifeOxygenGyr, decision 3), not the real air's first oxidation, which
//   also counts oxygen from escaping water.
// - Fire is read from today's air and land (canSustainFire); until DT1 a
//   civilization's stages are those of its final tech level, so one that fell
//   reaches only what its ruined level allows (index limits).
// - Moons and rogue planets join after steps 5 and 7.

import { CIVILIZATION_STAGE_CODES, INDEX_FLAG } from "./universeIndex";
import type { UniverseIndex } from "./universeIndex";

export type GateId =
  | "solid" | "water" | "life" | "light" | "oxygen" | "multicellular"
  | "mind" | "fire" | "industry" | "communication" | "spaceflight" | "endures";

export interface Gate {
  id: GateId;
  /** What a world that passes has, as the funnel names it. */
  label: string;
  passes: (index: UniverseIndex, row: number) => boolean;
}

const has = (value: number) => !Number.isNaN(value);
const STAGE = (stage: (typeof CIVILIZATION_STAGE_CODES)[number]) => CIVILIZATION_STAGE_CODES.indexOf(stage);

/** The twelve gates, in order (GF1). */
export const GATES: readonly Gate[] = [
  { id: "solid", label: "Solid surface", passes: (ix, i) => has(ix.oceanFraction[i]) },
  { id: "water", label: "Liquid water at some time", passes: (ix, i) => (ix.flags[i] & INDEX_FLAG.EVER_LIQUID_WATER) !== 0 },
  { id: "life", label: "Life began", passes: (ix, i) => has(ix.lifeBeganGyr[i]) },
  { id: "light", label: "Life used starlight", passes: (ix, i) => has(ix.firstLightGyr[i]) },
  { id: "oxygen", label: "Life's oxygen filled the air", passes: (ix, i) => has(ix.lifeOxygenGyr[i]) },
  { id: "multicellular", label: "A multicellular body", passes: (ix, i) => has(ix.firstMulticellularGyr[i]) },
  { id: "mind", label: "A mind", passes: (ix, i) => has(ix.mindGyr[i]) },
  { id: "fire", label: "Open fire possible today", passes: (ix, i) => (ix.flags[i] & INDEX_FLAG.FIRE_POSSIBLE) !== 0 },
  { id: "industry", label: "Industry reached", passes: (ix, i) => ix.highestStage[i] >= STAGE("industrial") && ix.highestStage[i] !== STAGE("collapsed") },
  { id: "communication", label: "Global communication reached", passes: (ix, i) => ix.highestStage[i] >= STAGE("information") && ix.highestStage[i] !== STAGE("collapsed") },
  { id: "spaceflight", label: "Spaceflight reached", passes: (ix, i) => ix.highestStage[i] === STAGE("space-age") },
  {
    id: "endures", label: "Still active today",
    passes: (ix, i) => ix.civilizationStage[i] !== STAGE("none") && ix.civilizationStage[i] !== STAGE("collapsed"),
  },
];

/** The universe's filter needs at least this many worlds arriving at it, so a handful cannot name it. */
export const FILTER_MIN_ARRIVING = 10;

export interface FunnelStep {
  gate: Gate;
  /** Worlds that reached the gate: passed every gate before it. */
  arrived: number;
  /** Worlds that also passed it. */
  passed: number;
  /** passed / arrived; NaN when none arrived. */
  share: number;
}

export interface Funnel {
  /** Every world in the index. */
  worlds: number;
  steps: FunnelStep[];
  /** The gate with the lowest pass share among those at least FILTER_MIN_ARRIVING worlds reach; null if none. */
  filter: GateId | null;
}

/** How far each world gets: the number of gates it passes in a row, 0–12, by row. */
export function gatesPassed(index: UniverseIndex): Uint8Array {
  const reached = new Uint8Array(index.count);
  for (let i = 0; i < index.count; i++) {
    let k = 0;
    while (k < GATES.length && GATES[k].passes(index, i)) k++;
    reached[i] = k;
  }
  return reached;
}

/** Counts the worlds that pass each gate (GF1). */
export function funnelOf(index: UniverseIndex): Funnel {
  const reached = gatesPassed(index);
  const passedCounts = GATES.map(() => 0);
  for (const k of reached) for (let g = 0; g < k; g++) passedCounts[g]++;

  const steps = GATES.map((gate, g) => {
    const arrived = g === 0 ? index.count : passedCounts[g - 1];
    const passed = passedCounts[g];
    return { gate, arrived, passed, share: arrived > 0 ? passed / arrived : NaN };
  });
  const candidates = steps.filter((s) => s.arrived >= FILTER_MIN_ARRIVING);
  const steepest = candidates.reduce<FunnelStep | null>((a, s) => (a === null || s.share < a.share ? s : a), null);
  return { worlds: index.count, steps, filter: steepest?.gate.id ?? null };
}
