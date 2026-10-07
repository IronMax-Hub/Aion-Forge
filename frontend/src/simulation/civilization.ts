import { createRNG, mixSeed, SALT } from "./rng";
import { exp } from "./detmath";
import type { Biosphere } from "./biosphere";
import type { Planet } from "./planet";
import type { MindSummary } from "./evolution/phylogeny";
import { TRAIT_RANGES } from "./evolution/genome";

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
  /** Gyr since its species died out, leaving ruins (C2.6, R8); null while it lives. */
  extinctAgoGyr: number | null;
}

export interface CivilizationResult {
  species: Species | null;
  civilization: Civilization | null;
}

// ── Species traits (AF-075, C2.6) ─────────────────────────────────────────────
//
// A civilization's species is the lineage in which its planet's first mind
// appeared (evolution/minds.ts). Three traits come from that lineage:
//   intelligence  its information processing when the mind appeared
//   aggression    the share of it and its ancestors that ate other life
//   adaptability  the width of habitat temperatures it and its ancestors lived
//                 in, as a share of the genome's thermal range (150 K)
// Curiosity, cooperation and resilience have no trait to come from yet, so
// they keep seeded draws until one exists (Documents/evolution.md lists them
// as candidates).

/** Width of the genome's thermal-optimum range, K: a lineage that has lived across all of it is fully adaptable. */
const FULL_TEMPERATURE_SPAN_K = TRAIT_RANGES.thermalOptimumK.max - TRAIT_RANGES.thermalOptimumK.min;

function generateSpecies(mind: MindSummary, planet: Planet, rng: () => number): Species {
  const intelligence  = mind.informationProcessing;
  const curiosity     = 0.2 + rng() * 0.8;
  // High-pressure environments tend to produce more cooperative species
  const cooperationBase = planet.habitabilityScore < 0.5 ? 0.4 : 0.2;
  const cooperation   = cooperationBase + rng() * 0.7;
  const aggression    = mind.consumerAncestry;
  const adaptability  = Math.min(1, mind.temperatureSpanK / FULL_TEMPERATURE_SPAN_K);
  const resilience    = 0.2 + rng() * 0.8;

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

// Tech levels from here up are industrial or beyond
const INDUSTRIAL_TECH_LEVEL = 0.42;

/** The stage a tech level reaches; any level of a civilization that has finally collapsed is "collapsed". */
export function techLevelToStage(level: number, collapsed: boolean): TechStage {
  if (collapsed) return "collapsed";
  if (level < 0.20) return "primitive";
  if (level < INDUSTRIAL_TECH_LEVEL) return "agricultural";
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
      // Never before the civilization began
      milestones.push({ type, timeAgo: Math.min(ageGyr, Math.max(0, timeAgo)), note });
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

function collapseNote(_species: Species, rng: () => number): string {
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

// ── Fire (Worlds Up Close A3, R6) ─────────────────────────────────────────────
//
// Smelting and industry need open fire, and open fire needs exposed land, air
// thick enough to burn in, and oxygen: at least 0.16 bar of it, read from
// today's air as the world history left it (C2.6). R6 first set an 18% share
// of the air; owner decision in C2.10: a partial pressure instead, since most
// minds live under thick air that dilutes Earth-like oxygen to a few percent,
// and a share rule left almost none of them able to smelt.
// A mind on a world without them can farm, but cannot go further. The limit
// comes from the world, not from who evolved: an aquatic mind is capped
// because it has no fire, and so is a land mind under thin or oxygen-poor air.

const FIRE_MIN_LAND = 0.01;          // share of the surface that is exposed, ice-free land
const FIRE_MIN_PRESSURE_BAR = 0.5;
const FIRE_MIN_O2_BAR = 0.16;        // oxygen partial pressure (Earth: 0.21)
// Without fire, technology stops just short of industry
const FIRELESS_TECH_CEILING = INDUSTRIAL_TECH_LEVEL - 1e-9;

/** Whether the planet today has what open fire needs. */
export function canSustainFire(planet: Planet): boolean {
  const surface = planet.surface;
  return surface !== null && surface.landFraction >= FIRE_MIN_LAND && surface.pressureBar >= FIRE_MIN_PRESSURE_BAR
    && surface.o2Bar >= FIRE_MIN_O2_BAR;
}

// ── Main generator (AF-077 + AF-078 + AF-080–083) ────────────────────────────

export function generateCivilization(
  bio: Biosphere,
  planet: Planet,
  galaxySeed: number,
): CivilizationResult {
  // A civilization needs a mind, found in its planet's history (C2.6); the
  // Intelligence parameter set the threshold the mind had to reach there
  const mind = planet.life?.phylogeny.mind ?? null;
  if (!mind) return { species: null, civilization: null };
  const rng = createRNG(mixSeed(galaxySeed, bio.hostStarId, bio.planetId, SALT.CIV));
  const species = generateSpecies(mind, planet, rng);

  // Its age is the time since the mind appeared. If its species (the mind's
  // lineage and every lineage descended from it) has since died out, with the
  // rest of life or alone, it developed only until then and remains as a
  // collapsed civilization (R8; owner decisions for a species that dies alone).
  const civAgeGyr = mind.ageGyr;
  if (civAgeGyr < 0.001) return { species, civilization: null };
  const extinctAgoGyr = mind.speciesEndedAgoGyr;
  const activeGyr = civAgeGyr - (extinctAgoGyr ?? 0);

  // ── Technology ───────────────────────────────────────────────────────────
  // Growth driven by curiosity and cooperation; slowed by aggression
  const growthDriver = species.curiosity * 0.6 + species.cooperation * 0.3 - species.aggression * 0.15;
  const rawTech = 1 - exp(-growthDriver * activeGyr * 3.5);
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
  const maxCollapseChecks = Math.floor(activeGyr * 4);

  for (let i = 0; i < maxCollapseChecks; i++) {
    if (rng() < collapseRisk * 0.18) {
      collapsesCount++;
      hasCollapsed = true;
      const severity = 0.2 + rng() * 0.6;
      techLevel      *= (1 - severity * 0.5);
      socialCohesion *= (1 - severity * 0.4);
      // Recovery (AF-083)
      const recoveryTime  = activeGyr - (i / maxCollapseChecks) * activeGyr;
      const recoveryFactor = species.resilience * 0.7 + species.cooperation * 0.3;
      const recovery = 1 - exp(-recoveryFactor * recoveryTime * 2);
      techLevel      += severity * 0.4 * recovery;
      socialCohesion += severity * 0.3 * recovery;
    }
  }

  // Final collapse check
  const fellApart = collapseRisk > collapseThreshold && rng() < (collapseRisk - collapseThreshold);
  if (fellApart) {
    techLevel     *= 0.3;
    hasCollapsed   = true;
    collapsesCount++;
  }
  // A species that died out ends its civilization too
  const finallyCollapsed = fellApart || extinctAgoGyr !== null;

  techLevel      = Math.min(1, Math.max(0, techLevel));
  if (!canSustainFire(planet)) techLevel = Math.min(techLevel, FIRELESS_TECH_CEILING);
  socialCohesion = Math.min(1, Math.max(0, socialCohesion));
  const techStage = techLevelToStage(techLevel, finallyCollapsed);

  // ── Population ────────────────────────────────────────────────────────────
  const peak = peakPopulation(species, planet, techLevel);
  const survivors = finallyCollapsed
    ? peak * (0.01 + rng() * 0.1)
    : peak * (0.4 + rng() * 0.6);
  // A species that died out is remembered at its height
  const pop = extinctAgoGyr === null ? survivors : peak;

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
    extinctAgoGyr,
  };

  // Milestones fall within the time it was active, which ended when its species died out
  civ.milestones = buildMilestones(civ, species, activeGyr, collapsesCount, fellApart, rng)
    .map((m) => ({ ...m, timeAgo: m.timeAgo + (extinctAgoGyr ?? 0) }));
  if (extinctAgoGyr !== null) {
    civ.hasCollapsed = true;
    civ.collapsesCount++;
    civ.milestones.push({ type: "collapse", timeAgo: extinctAgoGyr, note: "Its species died out" });
    civ.milestones.sort((a, b) => b.timeAgo - a.timeAgo);
  }

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
  if (civ.extinctAgoGyr !== null) {
    parts.push("Its species has died out. Only its ruins remain.");
  } else if (civ.techStage === "collapsed") {
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
