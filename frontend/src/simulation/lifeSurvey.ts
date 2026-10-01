// Life survey: walks every star system once and records what life each one holds.
// It only reads the planet, biosphere and civilization generators, so a seed always
// yields the same survey. The totals feed universe snapshots; the per-system entries
// feed the galaxy's life markers.

import type { Star } from "./star";
import type { UniverseConfig } from "./config";
import { generatePlanetsFor } from "./planet";
import type { PlanetarySystem } from "./planet";
import { generateBiosphere } from "./biosphere";
import type { LifeStage } from "./biosphere";
import { generateCivilization } from "./civilization";
import type { TechStage } from "./civilization";

/** Life stages that count as organisms. Prebiotic chemistry is not yet life. */
export const ORGANISM_STAGES: readonly LifeStage[] = ["microbial", "multicellular", "complex", "dominant"];

/** Civilization stages from least to most notable; a living civilization outranks a collapsed one. */
const TECH_STAGE_RANK: readonly TechStage[] = [
  "collapsed", "primitive", "agricultural", "industrial", "information", "space-age",
];

export interface SystemLife {
  starId: number;
  mostAdvancedStage: LifeStage;         // highest organism stage among the system's planets
  lifePlanetCount: number;              // planets with organisms (prebiotic excluded)
  civilizationStage: TechStage | null;  // most notable civilization in the system, if any
}

export interface LifeSurvey {
  totalPlanets: number;
  lifeBearingPlanets: number;   // every planet with a biosphere, prebiotic included
  civilizationCount: number;
  systems: SystemLife[];        // only systems with organisms, in star order
}

/** How often, in stars, the survey reports its progress. */
export const SURVEY_PROGRESS_INTERVAL = 100;

export function surveyLife(
  stars: Star[],
  seed: number,
  cfg: UniverseConfig,
  onProgress?: (starsSurveyed: number, starsTotal: number) => void,
  // How each star's planets are made; the stats harness wraps it to measure them as they are made
  planetsOf: (star: Star) => PlanetarySystem = (star) => generatePlanetsFor(star, seed, cfg),
): LifeSurvey {
  let totalPlanets = 0;
  let lifeBearingPlanets = 0;
  let civilizationCount = 0;
  const systems: SystemLife[] = [];

  for (const [index, star] of stars.entries()) {
    if (onProgress && index > 0 && index % SURVEY_PROGRESS_INTERVAL === 0) onProgress(index, stars.length);
    const system = planetsOf(star);
    totalPlanets += system.planets.length;

    let mostAdvanced = -1;
    let lifePlanetCount = 0;
    let civRank = -1;

    for (const planet of system.planets) {
      const bio = generateBiosphere(planet, star);
      if (!bio.hasLife) continue;
      lifeBearingPlanets++;

      const civ = generateCivilization(bio, planet, seed, cfg).civilization;
      if (civ) {
        civilizationCount++;
        civRank = Math.max(civRank, TECH_STAGE_RANK.indexOf(civ.techStage));
      }

      const stageRank = ORGANISM_STAGES.indexOf(bio.stage);
      if (stageRank >= 0) {
        lifePlanetCount++;
        mostAdvanced = Math.max(mostAdvanced, stageRank);
      }
    }

    if (lifePlanetCount > 0) {
      systems.push({
        starId: star.id,
        mostAdvancedStage: ORGANISM_STAGES[mostAdvanced],
        lifePlanetCount,
        civilizationStage: civRank >= 0 ? TECH_STAGE_RANK[civRank] : null,
      });
    }
  }

  return { totalPlanets, lifeBearingPlanets, civilizationCount, systems };
}
