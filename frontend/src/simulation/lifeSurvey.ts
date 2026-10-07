// Life survey: walks every star system once and records what life each one holds.
// It only reads the planet, biosphere and civilization generators, so a seed always
// yields the same survey. The totals feed universe snapshots; the per-system entries
// feed the galaxy's life markers; the index keeps every world's facts (EN0).

import type { Star } from "./star";
import type { UniverseConfig } from "./config";
import { generatePlanetsFor } from "./planet";
import type { PlanetarySystem } from "./planet";
import { generateBiosphere } from "./biosphere";
import type { LifeStage } from "./biosphere";
import { generateCivilization } from "./civilization";
import type { TechStage } from "./civilization";
import { indexRowsFor, packIndex } from "./universeIndex";
import type { IndexRow, UniverseIndex } from "./universeIndex";

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
  lifeBearingPlanets: number;   // every planet with life today
  everLifePlanets: number;      // every planet where life began, living or not (R8)
  civilizationCount: number;
  systems: SystemLife[];        // only systems with organisms, in star order
  index: UniverseIndex;         // every world, in star and planet order (EN0)
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
  let everLifePlanets = 0;
  let civilizationCount = 0;
  const systems: SystemLife[] = [];
  const rows: IndexRow[] = [];

  for (const [index, star] of stars.entries()) {
    if (onProgress && index > 0 && index % SURVEY_PROGRESS_INTERVAL === 0) onProgress(index, stars.length);
    const system = planetsOf(star);
    totalPlanets += system.planets.length;
    rows.push(...indexRowsFor(system, star, seed, cfg));

    let mostAdvanced = -1;
    let lifePlanetCount = 0;
    let civRank = -1;

    for (const planet of system.planets) {
      if (!planet.life) continue;
      everLifePlanets++;
      const bio = generateBiosphere(planet, star);

      // A civilization whose species has died out still counts, as ruins (R8)
      const civ = generateCivilization(bio, planet, seed).civilization;
      if (civ) {
        civilizationCount++;
        civRank = Math.max(civRank, TECH_STAGE_RANK.indexOf(civ.techStage));
      }
      if (!bio.hasLife) continue;
      lifeBearingPlanets++;

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

  return { totalPlanets, lifeBearingPlanets, everLifePlanets, civilizationCount, systems, index: packIndex(rows) };
}
