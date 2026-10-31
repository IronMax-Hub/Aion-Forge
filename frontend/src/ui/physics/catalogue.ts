// The Physics page's catalogue (Documents/Physics-Page.md, PH1–PH4).
//
// Why it exists: the rules the simulation runs on are spread over thirty
// modules and their plans. The catalogue sets each one out as a card: what it
// says, why, its constants, its limits, which laboratory law reaches it, and
// what it did to the universe on screen.
//
// How: cards are data. Every constant a card shows is imported from the
// simulation, never typed here, so a card cannot drift from the code. Each
// card's effect is a function of the universe on screen (its laws, its stars,
// its index) returning sentences with the fields that filled them, as the
// encyclopedia's entries do. Presentation only: nothing here changes a rule.
//
// Limits: effects are measured, not counterfactual; they say what this
// universe holds, not what it would hold without the rule.

import type { UniverseConfig } from "../../simulation/config";
import { DEFAULT_CONFIG } from "../../simulation/config";
import type { GalaxyConfig } from "../../simulation/galaxy";
import type { Star } from "../../simulation/star";
import type { UniverseIndex } from "../../simulation/universeIndex";
import type { Sentence } from "../encyclopedia/entry";
import { MIND_BASE_THRESHOLD } from "../../simulation/evolution/minds";

/** What a card's effect reads: the universe on screen. */
export interface PhysicsContext {
  config: UniverseConfig;
  galaxy: GalaxyConfig;
  stars: readonly Star[];
  /** Every world's facts; null until the life survey finishes. */
  index: UniverseIndex | null;
  /** Planets engulfed by their stars (from the survey); null until it finishes. */
  engulfedPlanets: number | null;
  /** Bodies too small to be planets at their star's metallicity (MZ3, from the survey); null until it finishes. */
  tooSmallPlanets: number | null;
  /** Planets drawn where a companion allows no orbit (BS2, from the survey); null until it finishes. */
  unstablePlanets: number | null;
  /** Planets thrown out by a neighbour too close to share their orbits (RP1, from the survey); null until it finishes. */
  ejectedPlanets: number | null;
}

export type LawKey = keyof typeof DEFAULT_CONFIG;

/** A constant as the code holds it. */
export interface Constant {
  name: string;
  value: string;
  meaning: string;
}

export interface RuleCard {
  id: string;
  title: string;
  /** The rule in plain words. */
  statement: string;
  /** The rule as the code computes it. */
  rule?: string;
  constants: Constant[];
  /** Why it is this way. */
  why: string;
  source?: string;
  limits: string[];
  /** The laboratory laws that reach this rule, and how. */
  laws: { law: LawKey; how: string }[];
  /** Where it lives in the code. */
  code: string;
  /** Whether the effect needs the universe index (the life survey). */
  needsIndex?: boolean;
  /** What the rule did to the universe on screen; absent for rules with nothing to count. */
  effect?: (ctx: PhysicsContext) => Sentence[];
  /** Said instead of an effect when there is nothing to count. */
  noEffect?: string;
}

export interface Chapter {
  id: string;
  title: string;
  intro: string;
  cards: RuleCard[];
  /** What the model does not have yet, in this chapter's area. */
  missing: string[];
}

// ── Helpers for writing cards ────────────────────────────────────────────────

/** A sentence with its sources. */
export function said(text: string, ...sources: string[]): Sentence {
  return { text, sources };
}

/** A constant's value exactly as the code holds it, with its unit. */
export function exact(value: number, unit = ""): string {
  return `${value.toLocaleString("en-US", { maximumSignificantDigits: 15 })}${unit ? ` ${unit}` : ""}`;
}

/** The median of some values (NaN when there are none). */
export function median(values: readonly number[]): number {
  if (values.length === 0) return NaN;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/** The rows of the index for which `test` holds. */
export function rowsWhere(index: UniverseIndex, test: (row: number) => boolean): number[] {
  const rows: number[] = [];
  for (let i = 0; i < index.count; i++) if (test(i)) rows.push(i);
  return rows;
}

/** What each laboratory law does in the code, in one sentence (C7: some reach less than their names suggest). */
export const LAW_DOES: Record<LawKey, string> = {
  gravityStrength: "Moves every orbit in by √gravity (effectiveOrbitAU), so the climate feels a closer star. Surface gravity, escape velocity, orbital periods and tidal locking do not read it (issue C7).",
  expansionRate: "Scales the galaxy's size: where its stars lie. Nothing else reads it.",
  stellarIgnitionThreshold: "Reshapes the star mass draw smoothly (draw^threshold): above 1, fewer heavy stars and more small, long-lived ones.",
  entropyRate: "Divides every star's lifespan. A star's luminosity is unchanged, so it burns the same fuel faster (issue C7).",
  emergenceSensitivity: "Multiplies the rate at which life begins on liquid water.",
  intelligenceModifier: `Sets the information processing a mind needs: 1 − ${1 - MIND_BASE_THRESHOLD} × modifier.`,
};
