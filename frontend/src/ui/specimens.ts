// Field guide (Worlds Up Close, phase C2.9): which of a planet's lineages get a
// specimen plate, and what each plate says about them.
//
// Why it exists: a planet's history can hold hundreds of lineages. The field
// guide shows a handful, as a natural-history survey would, with plain facts in
// real units, so a reader meets the organisms the simulation evolved.
//
// How:
// - Up to MAX_SPECIMENS living lineages: the mind's species first (the lineage
//   a mind arose in and all its descendants, C2.6), its most abundant living
//   member, if any lives; then the largest body; then the most abundant of each kind present
//   (animals, producers, microbes), so no kind is left out; then the rest by
//   biomass. Where life has died out, the last lineages to die instead (owner
//   decision), marked extinct.
// - Names are designations (planet · L-number), with a description put
//   together from the body plan and traits ("small six-eyed finned hunter,
//   shallow seas"), never invented species names (the plan's decision).
// - Facts: mass, length, habitat, how it gets energy, and when the lineage
//   arose (and, for the extinct, when and how it ended).
//
// Presentation only: it reads lineages and body plans and never writes them.

import type { DeathCause, Lineage } from "../simulation/evolution/engine";
import type { Habitat } from "../simulation/evolution/genome";
import type { BodyPlan } from "../rendering/life/morphology";
import { formatGyr, formatSig } from "./format";
import { STEP_GYR } from "../simulation/worldHistory";

/** The most plates a planet's field guide shows (the plan's number). */
export const MAX_SPECIMENS = 12;

/** One plate: the lineage, its body, and what the plate says. */
export interface Specimen {
  lineage: Lineage;
  plan: BodyPlan;
  designation: string;
  description: string;
  facts: { label: string; value: string }[];
  /** Whether it belongs to the mind's species: the lineage a mind arose in, or a descendant. */
  mind: boolean;
  extinct: boolean;
}

/** What a planet's field guide is built from. */
export interface FieldGuideSource {
  /** Every lineage that ever lived on the planet (the world history's). */
  lineages: Lineage[];
  plans: Map<number, BodyPlan>;
  /** The planet's name, e.g. "0861 d". */
  planetName: string;
  /** The star's age today, Gyr: lineage times are counted from the star's formation. */
  starAgeGyr: number;
  mindLineageId: number | null;
}

// The order kinds are made sure of
const KIND_ORDER: BodyPlan["kind"][] = ["animal", "producer", "microbe"];

/** The lineage a mind arose in and every lineage descended from it (C2.6: its species), by id. */
export function mindSpecies(lineages: readonly Lineage[], mindLineageId: number | null): Set<number> {
  const species = new Set<number>();
  if (mindLineageId === null) return species;
  // Lineages are in birth order, so a parent is always met before its children
  for (const l of lineages) {
    if (l.id === mindLineageId || (l.parentId !== null && species.has(l.parentId))) species.add(l.id);
  }
  return species;
}

/** The lineages that get plates, in the order they are shown. */
export function chooseSpecimens(
  lineages: readonly Lineage[], plans: ReadonlyMap<number, BodyPlan>, mindLineageId: number | null, max = MAX_SPECIMENS,
): Lineage[] {
  const species = mindSpecies(lineages, mindLineageId);
  const living = lineages.filter((l) => l.diedGyr === null);
  // Where life has ended: the last to die, most recent first
  if (living.length === 0) return [...lineages].sort((a, b) => b.diedGyr! - a.diedGyr! || a.id - b.id).slice(0, max);
  const byBiomass = [...living].sort((a, b) => b.biomass - a.biomass || a.id - b.id);
  const chosen: Lineage[] = [];
  const add = (l: Lineage | undefined) => {
    if (l && !chosen.includes(l) && chosen.length < max) chosen.push(l);
  };
  add(byBiomass.find((l) => species.has(l.id)));
  add([...living].sort((a, b) => b.genome.log10BodyMassKg - a.genome.log10BodyMassKg || a.id - b.id)[0]);
  for (const kind of KIND_ORDER) add(byBiomass.find((l) => plans.get(l.id)?.kind === kind));
  for (const l of byBiomass) add(l);
  return chosen;
}

// ── Words ────────────────────────────────────────────────────────────────────

const HABITAT_PHRASE: Record<Habitat, string> = {
  "deep-water": "deep water",
  "shallow-water": "shallow seas",
  land: "on land",
};
export const HABITAT_LABEL: Record<Habitat, string> = {
  "deep-water": "Deep water",
  "shallow-water": "Shallow water",
  land: "Land",
};
const COUNT_WORD = ["no", "one", "two", "three", "four", "five", "six", "seven", "eight"];
const COLONY_PHRASE = {
  mound: "microbe building stromatolite mounds",
  mat: "mat-forming microbe",
  filaments: "filament-forming microbe",
  crust: "crust-forming microbe",
  plankton: "drifting single cell",
  "single-cells": "free-living hunting cell",
} as const;
const DEATH_CAUSE: Record<DeathCause, string> = {
  unviable: "could no longer make a living",
  outcompeted: "outcompeted",
  impact: "asteroid impact",
  volcanism: "volcanic pulse",
  climate: "change of climate",
  crowded: "crowded out",
};

/** A body's size in a word, from its length. */
export function sizeWord(lengthM: number): string {
  return lengthM < 1e-4 ? "microscopic" : lengthM < 1e-2 ? "tiny" : lengthM < 0.3 ? "small" : lengthM < 3 ? "large" : "giant";
}

/** A plain description: size, body and way of life, and where it lives. */
export function describeSpecimen(lineage: Lineage, plan: BodyPlan): string {
  const where = HABITAT_PHRASE[lineage.genome.habitat];
  const size = sizeWord(plan.lengthM);
  if (plan.kind === "microbe") return `${size} ${COLONY_PHRASE[plan.colony]}, ${where}`;
  if (plan.kind === "producer") {
    const body = plan.form === "branching" ? "branching producer" : plan.form === "frond" ? "frond" : "encrusting colony";
    return `${size} ${body}, ${where}`;
  }
  const eyes = plan.eyes === 0 ? "eyeless" : `${COUNT_WORD[plan.eyes]}-eyed`;
  const limbs = plan.locomotion === "walker" ? `${COUNT_WORD[plan.limbPairs * 2]}-legged` : "finned";
  const diet = lineage.level <= 1 ? "grazer" : "hunter";
  return `${size} ${eyes} ${limbs} ${diet}, ${where}`;
}

/** A mass in the unit that suits it, from log10 kg. */
export function formatMass(log10Kg: number): string {
  const kg = Math.pow(10, log10Kg);
  if (kg >= 1000) return `${formatSig(kg / 1000, 2)} t`;
  if (kg >= 1) return `${formatSig(kg, 2)} kg`;
  if (kg >= 1e-3) return `${formatSig(kg * 1e3, 2)} g`;
  if (kg >= 1e-6) return `${formatSig(kg * 1e6, 2)} mg`;
  if (kg >= 1e-9) return `${formatSig(kg * 1e9, 2)} µg`;
  if (kg >= 1e-12) return `${formatSig(kg * 1e12, 2)} ng`;
  return `${formatSig(kg * 1e15, 2)} pg`;
}

/** A length in the unit that suits it. */
export function formatLength(m: number): string {
  if (m >= 1) return `${formatSig(m, 2)} m`;
  if (m >= 1e-2) return `${formatSig(m * 100, 2)} cm`;
  if (m >= 1e-3) return `${formatSig(m * 1e3, 2)} mm`;
  return `${formatSig(m * 1e6, 2)} µm`;
}

/** How a lineage gets its energy, in words. */
export function energyText(lineage: Lineage): string {
  const { energySource, absorptionPeakNm } = lineage.genome;
  if (energySource === "light") return `Light, absorbs at ${Math.round(absorptionPeakNm)} nm`;
  if (energySource === "chemical") return "Chemical energy";
  return lineage.level <= 1 ? "Eats producers" : "Eats other consumers";
}

/** How long ago, to the history's own resolution: it moves in steps of STEP_GYR. */
export function agoText(gyr: number): string {
  return gyr < STEP_GYR / 2 ? `within the last ${formatGyr(STEP_GYR)}` : `${formatGyr(gyr)} ago`;
}

/** The facts on a plate. */
export function specimenFacts(lineage: Lineage, plan: BodyPlan, starAgeGyr: number): { label: string; value: string }[] {
  const facts = [
    { label: "Mass", value: formatMass(lineage.genome.log10BodyMassKg) },
    { label: plan.kind === "producer" && plan.form === "encrusting" ? "Spread" : "Length", value: formatLength(plan.lengthM) },
    { label: "Habitat", value: HABITAT_LABEL[lineage.genome.habitat] },
    { label: "Energy", value: energyText(lineage) },
    { label: "Arose", value: agoText(starAgeGyr - lineage.bornGyr) },
  ];
  if (lineage.diedGyr !== null) {
    const cause = lineage.deathCause ? `, ${DEATH_CAUSE[lineage.deathCause]}` : "";
    facts.push({ label: "Died out", value: `${agoText(starAgeGyr - lineage.diedGyr)}${cause}` });
  }
  return facts;
}

/** The plates of a planet's field guide, in the order they are shown. */
export function fieldGuideSpecimens(source: FieldGuideSource): Specimen[] {
  const species = mindSpecies(source.lineages, source.mindLineageId);
  return chooseSpecimens(source.lineages, source.plans, source.mindLineageId).map((lineage) => {
    const plan = source.plans.get(lineage.id)!;
    return {
      lineage,
      plan,
      designation: `${source.planetName} · L-${lineage.id}`,
      description: describeSpecimen(lineage, plan),
      facts: specimenFacts(lineage, plan, source.starAgeGyr),
      mind: species.has(lineage.id),
      extinct: lineage.diedGyr !== null,
    };
  });
}
