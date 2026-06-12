import { createRNG } from "./rng";
import type { Biosphere } from "./biosphere";
import type { Planet } from "./planet";
import { makeConfig } from "./config";
import type { UniverseConfig } from "./config";

// ── Species data model (AF-073) ───────────────────────────────────────────────

export interface Species {
  id: number;
  planetId: number;
  population: number;       // billions
  intelligence: number;     // 0–1
  curiosity: number;        // 0–1 — drives exploration & technology
  cooperation: number;      // 0–1 — drives cohesion & recovery
  aggression: number;       // 0–1 — drives conflict & collapse risk
  adaptability: number;     // 0–1 — survival under pressure
  resilience: number;       // 0–1 — resistance to catastrophe
}

// ── Civilization tech stages (AF-079) ─────────────────────────────────────────

export type TechStage =
  | "primitive"
  | "agricultural"
  | "industrial"
  | "information"
  | "space-age"
  | "collapsed";

export const TECH_STAGE_LABEL: Record<TechStage, string> = {
  primitive:     "Primitive",
  agricultural:  "Agricultural",
  industrial:    "Industrial",
  information:   "Information Age",
  "space-age":   "Early Space Age",
  collapsed:     "Collapsed",
};

// ── Civilization milestone (AF-084) ───────────────────────────────────────────

export type MilestoneType =
  | "first-cities"
  | "agriculture"
  | "writing"
  | "industry"
  | "global-communication"
  | "spaceflight"
  | "collapse"
  | "recovery"
  | "golden-age"
  | "dark-age";

export const MILESTONE_LABEL: Record<MilestoneType, string> = {
  "first-cities":         "First Cities",
  agriculture:            "Discovery of Agriculture",
  writing:                "Development of Writing",
  industry:               "Industrial Revolution",
  "global-communication": "Global Communication Networks",
  spaceflight:            "First Spaceflight",
  collapse:               "Civilizational Collapse",
  recovery:               "Recovery & Reinvention",
  "golden-age":           "Golden Age",
  "dark-age":             "Dark Age",
};

export interface Milestone {
  type: MilestoneType;
  timeAgo: number;   // billion years ago
  note: string;
}

// ── Civilization data model (AF-078) ──────────────────────────────────────────

export interface Civilization {
  id: number;
  speciesId: number;
  planetId: number;
  ageGyr: number;
  population: number;           // billions at peak
  techStage: TechStage;
  techLevel: number;            // 0–1 within current stage
  socialCohesion: number;       // 0–1
  resourceEfficiency: number;   // 0–1
  expansionTendency: number;    // 0–1
  collapseRisk: number;         // 0–1
  hasCollapsed: boolean;
  collapsesCount: number;
  isRare: boolean;
  milestones: Milestone[];
}

export interface CivilizationResult {
  species: Species | null;
  civilization: Civilization | null;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const CIV_SALT = 0xC1A35A2E;

// ── Intelligence emergence (AF-074) ───────────────────────────────────────────
// Requires: complex biosphere, sufficient time, some luck

function intelligenceEmerges(bio: Biosphere, rng: () => number): boolean {
  if (bio.stage !== "complex" && bio.stage !== "dominant") return false;
  if (bio.ageGyr < 0.8) return false;

  // Base probability from complexity + adaptability
  const base = Math.pow(bio.complexity, 1.5) * bio.adaptability * 0.55;
  return rng() < base;
}

// ── Species traits (AF-075) ───────────────────────────────────────────────────

function generateSpecies(bio: Biosphere, planet: Planet, rng: () => number): Species {
  // Traits loosely shaped by environment and biosphere
  const intelligence  = 0.4 + rng() * 0.6;
  const curiosity     = 0.2 + rng() * 0.8;
  // High-pressure environments tend to produce more cooperative species
  const cooperationBase = planet.habitabilityScore < 0.5 ? 0.4 : 0.2;
  const cooperation   = cooperationBase + rng() * 0.7;
  // Aggression inversely correlated with cooperation (loosely)
  const aggression    = Math.max(0, Math.min(1, (1 - cooperation * 0.5) * rng() * 1.2));
  const adaptability  = bio.adaptability * 0.5 + rng() * 0.5;
  const resilience    = bio.stability    * 0.4 + rng() * 0.6;

  // Initial population: small
  const population    = 0.001 + rng() * 0.01;

  return {
    id: 0, planetId: planet.id,
    population, intelligence,
    curiosity, cooperation, aggression, adaptability, resilience,
  };
}

// ── Population dynamics (AF-076) ─────────────────────────────────────────────

function peakPopulation(species: Species, planet: Planet, techLevel: number): number {
  // Carrying capacity shaped by planet resources and tech
  const capacity = planet.resourceAbundance * 50 * (1 + techLevel * 8);
  return Math.min(capacity, (0.5 + species.cooperation * 0.5) * capacity);
}

// ── Tech stage from level (AF-079) ───────────────────────────────────────────

function techLevelToStage(level: number, collapsed: boolean): TechStage {
  if (collapsed) return "collapsed";
  if (level < 0.20) return "primitive";
  if (level < 0.42) return "agricultural";
  if (level < 0.64) return "industrial";
  if (level < 0.85) return "information";
  return "space-age";
}

// ── Milestone generation (AF-084) ─────────────────────────────────────────────

function buildMilestones(
  civ: Partial<Civilization>,
  species: Species,
  ageGyr: number,
  collapsesCount: number,
  finallyCollapsed: boolean,
  rng: () => number
): Milestone[] {
  const milestones: Milestone[] = [];
  const techLevel = civ.techLevel ?? 0;

  const push = (type: MilestoneType, minTech: number, note: string) => {
    if (techLevel >= minTech) {
      const timeAgo = ageGyr * (1 - minTech / 1.1) * (0.8 + rng() * 0.4);
      milestones.push({ type, timeAgo: Math.max(0, timeAgo), note });
    }
  };

  push("first-cities",         0.05, "Permanent settlements established");
  push("agriculture",          0.12, "Systematic food cultivation begins");
  push("writing",              0.22, "Knowledge preserved across generations");
  push("industry",             0.42, "Mechanized production transforms society");
  push("global-communication", 0.64, "Instantaneous worldwide information exchange");
  push("spaceflight",          0.85, "First vessels leave the atmosphere");

  if (collapsesCount > 0) {
    const collapseTime = ageGyr * (0.3 + rng() * 0.5);
    milestones.push({ type: "collapse", timeAgo: collapseTime, note: collapseNote(species, rng) });
    if (!finallyCollapsed) {
      milestones.push({ type: "recovery", timeAgo: collapseTime * 0.5, note: "Society rebuilt from remnants" });
    }
  }

  if (species.cooperation > 0.7 && techLevel > 0.4) {
    milestones.push({ type: "golden-age", timeAgo: ageGyr * 0.2, note: "An era of prosperity and discovery" });
  }

  if (species.aggression > 0.65 && techLevel > 0.3) {
    milestones.push({ type: "dark-age", timeAgo: ageGyr * 0.45, note: "Conflict and contraction" });
  }

  return milestones.sort((a, b) => b.timeAgo - a.timeAgo);
}

function collapseNote(species: Species, rng: () => number): string {
  const causes = [
    "Resource depletion triggered societal breakdown",
    "Internal conflict fractured the civilization",
    "Environmental crisis overwhelmed adaptive capacity",
    "Technological disruption outpaced social cohesion",
    "Pandemic destabilized population centers",
    "Agricultural failure caused widespread famine",
  ];
  return causes[Math.floor(rng() * causes.length)];
}

// ── Main generator (AF-077 + AF-078 + AF-080–083) ────────────────────────────

export function generateCivilization(
  bio: Biosphere,
  planet: Planet,
  galaxySeed: number,
  cfg?: UniverseConfig
): CivilizationResult {
  const config = cfg ?? makeConfig(galaxySeed);
  const rng = createRNG(((galaxySeed ^ bio.planetId ^ bio.hostStarId) ^ CIV_SALT) >>> 0);

  // intelligenceModifier scales the emergence probability
  const originalRng = rng;
  const scaledRng = () => {
    const v = originalRng();
    // Higher modifier = higher effective probability = lower roll needed
    return v / Math.max(0.01, config.intelligenceModifier);
  };
  if (!intelligenceEmerges(bio, scaledRng)) return { species: null, civilization: null };

  const species = generateSpecies(bio, planet, rng);

  // How long has the civilization had to develop?
  // Civ emerges roughly mid-to-late in life's history
  const civAgeGyr = bio.ageGyr * (0.1 + rng() * 0.6);
  if (civAgeGyr < 0.001) return { species, civilization: null };

  // ── Technology ───────────────────────────────────────────────────────────
  // Growth driven by curiosity and cooperation; slowed by aggression
  const growthDriver = species.curiosity * 0.6 + species.cooperation * 0.3 - species.aggression * 0.15;
  const rawTech = 1 - Math.exp(-growthDriver * civAgeGyr * 3.5);
  let techLevel = rawTech * (0.7 + rng() * 0.3);

  // ── Social cohesion (AF-080) ──────────────────────────────────────────────
  const cohesionBase = species.cooperation * 0.6 + species.resilience * 0.3 + rng() * 0.2;
  let socialCohesion = Math.min(1, cohesionBase);

  // ── Resource efficiency (AF-081) ──────────────────────────────────────────
  const resourceEfficiency = 0.2 + species.adaptability * 0.4 + techLevel * 0.3 + rng() * 0.1;

  // ── Collapse risk ─────────────────────────────────────────────────────────
  const collapseRisk = Math.min(1,
    species.aggression * 0.35 +
    (1 - socialCohesion) * 0.3 +
    (1 - resourceEfficiency) * 0.25 +
    rng() * 0.1
  );

  // ── Collapse events (AF-082 + AF-083) ─────────────────────────────────────
  let collapsesCount = 0;
  let hasCollapsed   = false;
  const collapseThreshold = 0.55;
  const maxCollapseChecks = Math.floor(civAgeGyr * 4);

  for (let i = 0; i < maxCollapseChecks; i++) {
    if (rng() < collapseRisk * 0.18) {
      collapsesCount++;
      hasCollapsed = true;
      const severity = 0.2 + rng() * 0.6;
      techLevel      *= (1 - severity * 0.5);
      socialCohesion *= (1 - severity * 0.4);
      // Recovery (AF-083)
      const recoveryTime  = civAgeGyr - (i / maxCollapseChecks) * civAgeGyr;
      const recoveryFactor = species.resilience * 0.7 + species.cooperation * 0.3;
      const recovery = 1 - Math.exp(-recoveryFactor * recoveryTime * 2);
      techLevel      += severity * 0.4 * recovery;
      socialCohesion += severity * 0.3 * recovery;
    }
  }

  // Final collapse check
  const finallyCollapsed = collapseRisk > collapseThreshold && rng() < (collapseRisk - collapseThreshold);
  if (finallyCollapsed) {
    techLevel     *= 0.3;
    hasCollapsed   = true;
    collapsesCount++;
  }

  techLevel      = Math.min(1, Math.max(0, techLevel));
  socialCohesion = Math.min(1, Math.max(0, socialCohesion));
  const techStage = techLevelToStage(techLevel, finallyCollapsed);

  // ── Population ────────────────────────────────────────────────────────────
  const peak = peakPopulation(species, planet, techLevel);
  const pop  = finallyCollapsed
    ? peak * (0.01 + rng() * 0.1)
    : peak * (0.4 + rng() * 0.6);

  // ── Rare outcomes (AF-087) ────────────────────────────────────────────────
  const isRare =
    (techStage === "space-age") ||
    (collapsesCount >= 3 && !finallyCollapsed) ||
    (species.cooperation > 0.88 && socialCohesion > 0.85) ||
    (species.aggression > 0.85 && !finallyCollapsed && techLevel > 0.6);

  const expansionTendency = species.curiosity * 0.5 + species.aggression * 0.3 + techLevel * 0.2;

  const civ: Civilization = {
    id: 0, speciesId: 0, planetId: planet.id,
    ageGyr: civAgeGyr,
    population: pop,
    techStage, techLevel,
    socialCohesion,
    resourceEfficiency: Math.min(1, resourceEfficiency),
    expansionTendency: Math.min(1, expansionTendency),
    collapseRisk,
    hasCollapsed, collapsesCount,
    isRare, milestones: [],
  };

  civ.milestones = buildMilestones(civ, species, civAgeGyr, collapsesCount, finallyCollapsed, rng);

  return { species, civilization: civ };
}

// ── Civilization narrative ─────────────────────────────────────────────────────

export function describeCivilization(civ: Civilization, species: Species): string {
  const parts: string[] = [];

  // Character
  const dominant = species.curiosity > species.cooperation && species.curiosity > species.aggression
    ? "curious"
    : species.cooperation > species.aggression
    ? "cooperative"
    : "aggressive";

  const characterLine =
    dominant === "curious"
      ? "Driven by an insatiable need to understand, this species directed its energy outward — into science, exploration, and the unknown."
      : dominant === "cooperative"
      ? "This species built its civilization on shared effort, favoring collective survival over individual ambition."
      : "Shaped by competition, this species rose through conflict — its history marked by the tension between destruction and renewal.";

  parts.push(characterLine);

  // Trajectory
  if (civ.techStage === "collapsed") {
    parts.push(
      civ.collapsesCount > 1
        ? `Having collapsed ${civ.collapsesCount} times, its survivors carry the weight of what was lost.`
        : "A single collapse ended its trajectory. The remnants endure."
    );
  } else if (civ.techStage === "space-age") {
    parts.push("It has crossed the threshold — the stars are no longer beyond reach.");
  } else if (civ.collapsesCount > 0) {
    parts.push(
      `After ${civ.collapsesCount === 1 ? "a collapse" : `${civ.collapsesCount} collapses`}, it rebuilt. What survives is harder than what came before.`
    );
  } else {
    parts.push("It has grown without catastrophic interruption — a rare continuity.");
  }

  // Rarity note
  if (civ.isRare) {
    parts.push("By any measure, this civilization is remarkable.");
  }

  return parts.join(" ");
}
