// The Great Filter, measured (Galaxy Through Time, GF1, GF2 and GF5).
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
// Where worlds stop (GF2): for the worlds that reached a gate and stopped
// there, the share that have each of a fixed set of conditions, beside the
// same share among the worlds that passed. These are shares, not causes. For
// the dated gates, how long the passing worlds waited, and how many stopped
// worlds have had less time than half of them needed: "not yet" rather than
// "perhaps never". At the fire gate, which of fire's three conditions fail.
//
// Many seeds (GF5): the median and range of each gate over several
// universes under the same laws, to tell a universe's luck from its laws.
//
// Assumptions and limits:
// - Gate 5 reads life's own oxygen against the volcanic and crust sinks
//   (lifeOxygenGyr, decision 3), not the real air's first oxidation, which
//   also counts oxygen from escaping water.
// - Fire is read from today's air and land (canSustainFire); until DT1 a
//   civilization's stages are those of its final tech level, so one that fell
//   reaches only what its ruined level allows (index limits).
// - Moons and rogue planets join after steps 5 and 7.
// - A host star's class is read from its temperature (M below 3,700 K, K to
//   5,200 K, G to 6,000 K), except a white dwarf, which is its own class.
// - A wait is measured from the gate before; a world that passed both in the
//   same step, or out of order, waited 0.

import { CIVILIZATION_STAGE_CODES, INDEX_FLAG } from "./universeIndex";
import type { UniverseIndex } from "./universeIndex";
import type { Star } from "./star";
import { FROZEN_ICE_SHARE } from "./worldHistory";
import { FIRE_MIN_LAND, FIRE_MIN_O2_BAR, FIRE_MIN_PRESSURE_BAR } from "./civilization";
import { atmosphereClassOf } from "./planetPhysics";

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

// ── Where worlds stop (GF2) ──────────────────────────────────────────────────

/** Rows of the worlds that reached a gate and did not pass it. */
export function stoppedAt(index: UniverseIndex, gate: GateId): number[] {
  const k = GATES.findIndex((g) => g.id === gate);
  const reached = gatesPassed(index);
  const rows: number[] = [];
  for (let i = 0; i < index.count; i++) if (reached[i] === k) rows.push(i);
  return rows;
}

/** A condition a world can share with others, read from its index row and its star. */
export interface Condition {
  id: string;
  label: string;
  holds: (index: UniverseIndex, row: number, star: Star) => boolean;
}

// Host star classes by temperature, K (the spectral classes of ui/format.ts)
const K_CLASS_MIN_K = 3700;
const G_CLASS_MIN_K = 5200;
const F_CLASS_MIN_K = 6000;
const HEAVY_GRAVITY_G = 1.5;
const YOUNG_STAR_GYR = 2;
const THICK_AIR = new Set(["thick", "crushing"]);

const isRemnant = (star: Star) => star.classification === "white-dwarf";

/** The conditions every gate's breakdown compares (GF2). */
export const CONDITIONS: readonly Condition[] = [
  { id: "star-m", label: "Host star class M", holds: (_, __, star) => !isRemnant(star) && star.temperature < K_CLASS_MIN_K },
  { id: "star-k", label: "Host star class K", holds: (_, __, star) => !isRemnant(star) && star.temperature >= K_CLASS_MIN_K && star.temperature < G_CLASS_MIN_K },
  { id: "star-g", label: "Host star class G", holds: (_, __, star) => !isRemnant(star) && star.temperature >= G_CLASS_MIN_K && star.temperature < F_CLASS_MIN_K },
  { id: "star-f", label: "Host star class F or hotter", holds: (_, __, star) => !isRemnant(star) && star.temperature >= F_CLASS_MIN_K },
  { id: "star-remnant", label: "Host star a white dwarf", holds: (_, __, star) => isRemnant(star) },
  { id: "frozen", label: "Frozen over today", holds: (ix, i) => ix.iceFraction[i] >= FROZEN_ICE_SHARE },
  { id: "no-land", label: "No exposed land (under 1%)", holds: (ix, i) => ix.landFraction[i] < FIRE_MIN_LAND },
  { id: "locked", label: "Tidally locked", holds: (ix, i) => (ix.flags[i] & INDEX_FLAG.TIDALLY_LOCKED) !== 0 },
  { id: "heavy", label: "Gravity above 1.5 g", holds: (ix, i) => ix.massEarths[i] / (ix.radiusEarths[i] * ix.radiusEarths[i]) > HEAVY_GRAVITY_G },
  { id: "thick-air", label: "Thick or crushing air", holds: (ix, i) => !Number.isNaN(ix.pressureBar[i]) && THICK_AIR.has(atmosphereClassOf(ix.pressureBar[i])) },
  { id: "young-star", label: "Star younger than 2 Gyr", holds: (_, __, star) => star.age < YOUNG_STAR_GYR },
  { id: "life-ended", label: "Life has ended", holds: (ix, i) => has(ix.lifeEndedGyr[i]) },
];

export interface ConditionShares {
  condition: Condition;
  /** Share of the stopped worlds that have it; NaN when none stopped. */
  stopped: number;
  /** Share of the passing worlds that have it; NaN when none passed. */
  passed: number;
}

/** When a world passed each dated gate, Gyr after its star formed. */
const GATE_DATE: Partial<Record<GateId, (ix: UniverseIndex, row: number) => number>> = {
  life: (ix, i) => ix.lifeBeganGyr[i],
  light: (ix, i) => ix.firstLightGyr[i],
  oxygen: (ix, i) => ix.lifeOxygenGyr[i],
  multicellular: (ix, i) => ix.firstMulticellularGyr[i],
  mind: (ix, i) => ix.mindGyr[i],
};

export interface Waiting {
  /** The gate the wait is measured from. */
  since: GateId;
  /** How long the passing worlds waited, Gyr, sorted. */
  passedWaitsGyr: number[];
  median: number;
  /** Share of the stopped worlds whose time since the gate before is under the median wait; NaN when none stopped. */
  stoppedUnderMedian: number;
}

export interface FireShortfalls {
  noLand: number;
  thinAir: number;
  lowOxygen: number;
}

export interface Breakdown {
  gate: Gate;
  arrived: number;
  passed: number;
  stopped: number;
  conditions: ConditionShares[];
  /** For the starlight, oxygen, multicellular and mind gates; null otherwise. */
  waiting: Waiting | null;
  /** For the fire gate: how many stopped worlds fail each of fire's conditions (a world can fail more than one). */
  fire: FireShortfalls | null;
}

/** The value at share q of sorted values, interpolated between neighbours. */
export function quantile(sorted: readonly number[], q: number): number {
  if (sorted.length === 0) return NaN;
  const at = q * (sorted.length - 1);
  const lo = Math.floor(at);
  const hi = Math.min(sorted.length - 1, lo + 1);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (at - lo);
}

/** What the worlds that stopped at a gate share, beside those that passed (GF2). `stars` are the galaxy's, in id order. */
export function breakdown(index: UniverseIndex, stars: readonly Star[], gate: GateId): Breakdown {
  const k = GATES.findIndex((g) => g.id === gate);
  const reached = gatesPassed(index);
  const stopped: number[] = [];
  const passed: number[] = [];
  for (let i = 0; i < index.count; i++) {
    if (reached[i] === k) stopped.push(i);
    else if (reached[i] > k) passed.push(i);
  }
  const starOf = (i: number) => stars[index.starId[i]];
  const shareOf = (rows: number[], c: Condition) =>
    rows.length === 0 ? NaN : rows.filter((i) => c.holds(index, i, starOf(i))).length / rows.length;

  let waiting: Waiting | null = null;
  const dateOf = GATE_DATE[gate];
  const previous = k > 0 ? GATES[k - 1].id : null;
  const previousDate = previous ? GATE_DATE[previous] : undefined;
  if (dateOf && previousDate && previous) {
    const waits = passed.map((i) => Math.max(0, dateOf(index, i) - previousDate(index, i))).sort((a, b) => a - b);
    const median = quantile(waits, 0.5);
    const short = stopped.filter((i) => starOf(i).age - previousDate(index, i) < median).length;
    waiting = { since: previous, passedWaitsGyr: waits, median, stoppedUnderMedian: stopped.length === 0 ? NaN : short / stopped.length };
  }

  const fire = gate === "fire" ? {
    noLand: stopped.filter((i) => index.landFraction[i] < FIRE_MIN_LAND).length,
    thinAir: stopped.filter((i) => index.pressureBar[i] < FIRE_MIN_PRESSURE_BAR).length,
    lowOxygen: stopped.filter((i) => index.o2Bar[i] < FIRE_MIN_O2_BAR).length,
  } : null;

  return {
    gate: GATES[k],
    arrived: stopped.length + passed.length,
    passed: passed.length,
    stopped: stopped.length,
    conditions: CONDITIONS.map((condition) => ({ condition, stopped: shareOf(stopped, condition), passed: shareOf(passed, condition) })),
    waiting,
    fire,
  };
}

// ── Many seeds (GF5) ─────────────────────────────────────────────────────────

/** One gate across many universes: the median and range of the worlds that passed it, and of its pass share. */
export interface GateSpread {
  gate: Gate;
  passed: { median: number; min: number; max: number };
  /** Over the universes where at least one world reached the gate; NaN where none did. */
  share: { median: number; min: number; max: number };
}

/** The spread of each gate over several funnels. Each gate's values are sorted first, so the order the funnels come in does not matter. */
export function spreadOf(funnels: readonly Funnel[]): GateSpread[] {
  const summary = (values: number[]) => {
    const sorted = values.filter((v) => !Number.isNaN(v)).sort((a, b) => a - b);
    return sorted.length === 0
      ? { median: NaN, min: NaN, max: NaN }
      : { median: quantile(sorted, 0.5), min: sorted[0], max: sorted[sorted.length - 1] };
  };
  return GATES.map((gate, g) => ({
    gate,
    passed: summary(funnels.map((f) => f.steps[g].passed)),
    share: summary(funnels.map((f) => f.steps[g].share)),
  }));
}
