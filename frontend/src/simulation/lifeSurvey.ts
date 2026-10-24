// Life survey: walks every star system once and records what life each one holds.
// It only reads the planet, biosphere and civilization generators, so a seed always
// yields the same survey. The totals feed universe snapshots; the per-system entries
// feed the galaxy's life and civilization markers; the index keeps every world's facts (EN0).

import type { Star } from "./star";
import type { UniverseConfig } from "./config";
import { generatePlanetsFor } from "./planet";
import type { PlanetarySystem } from "./planet";
import { generateBiosphere } from "./biosphere";
import type { LifeStage } from "./biosphere";
import { generateCivilization } from "./civilization";
import type { Civilization, TechStage } from "./civilization";
import { indexRowsFor, moonRowsFor, packIndex } from "./universeIndex";
import type { IndexRow, UniverseIndex } from "./universeIndex";

/** Life stages that count as organisms. Prebiotic chemistry is not yet life. */
export const ORGANISM_STAGES: readonly LifeStage[] = ["microbial", "multicellular", "complex", "dominant"];

/** Civilization stages from least to most notable; a living civilization outranks a collapsed one. */
const TECH_STAGE_RANK: readonly TechStage[] = [
  "collapsed", "primitive", "agricultural", "industrial", "information", "space-age",
];

export interface SystemLife {
  starId: number;
  mostAdvancedStage: LifeStage;         // highest organism stage among the system's planets and moons
  lifePlanetCount: number;              // planets with organisms (prebiotic excluded)
  lifeMoonCount: number;                // moon worlds with organisms (MO6; decision 13 keeps them apart)
  civilizationStage: TechStage | null;  // most notable civilization in the system, if any
}

/** A star system where a civilization arose, living or in ruins (R8), as the civilization markers show it. */
export interface SystemCivilization {
  starId: number;
  stage: TechStage;   // most notable living civilization's stage; with none alive, the most notable ruins'
  living: number;     // civilizations whose species still lives, on planets and moons
  ruins: number;      // civilizations whose species has died out
}

export interface LifeSurvey {
  totalPlanets: number;
  lifeBearingPlanets: number;   // every planet with life today
  everLifePlanets: number;      // every planet where life began, living or not (R8)
  engulfedPlanets: number;      // planets that formed and were engulfed by their swelling star (not in the index)
  tooSmallPlanets: number;      // bodies too small to be planets at their star's metallicity (MZ3; not in the index)
  unstablePlanets: number;      // planets drawn where a companion allows no orbit (BS2; not in the index)
  ejectedPlanets: number;       // planets thrown out by a neighbour too close to share their orbits (RP1; not in the index)
  /** Moon worlds with life today (MO4): counted beside planets, not in lifeBearingPlanets (decision 13). */
  lifeBearingMoons: number;
  civilizationCount: number;    // on planets and moons (decision 13)
  systems: SystemLife[];        // only systems with organisms, in star order
  civilizations: SystemCivilization[];   // every system where a civilization arose, in star order, with or without organisms today
  index: UniverseIndex;         // every planet, in star and planet order (EN0)
  moonIndex: UniverseIndex;     // every moon world, in star, planet and moon order (MO7)
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
  let engulfedPlanets = 0;
  let tooSmallPlanets = 0;
  let unstablePlanets = 0;
  let ejectedPlanets = 0;
  let lifeBearingMoons = 0;
  let civilizationCount = 0;
  const systems: SystemLife[] = [];
  const civilizations: SystemCivilization[] = [];
  const rows: IndexRow[] = [];
  const moonRows: IndexRow[] = [];

  for (const [index, star] of stars.entries()) {
    if (onProgress && index > 0 && index % SURVEY_PROGRESS_INTERVAL === 0) onProgress(index, stars.length);
    const system = planetsOf(star);
    totalPlanets += system.planets.length;
    engulfedPlanets += system.engulfed;
    tooSmallPlanets += system.tooSmall;
    unstablePlanets += system.unstable;
    ejectedPlanets += system.ejected;
    rows.push(...indexRowsFor(system, star, seed, cfg));
    moonRows.push(...moonRowsFor(system, star, seed, cfg));

    let mostAdvanced = -1;
    let lifePlanetCount = 0;
    let civRank = -1;
    // The civilization markers rank living civilizations and ruins apart: a living one always outranks ruins
    const civTally = { living: 0, ruins: 0, livingRank: -1, ruinsRank: -1 };
    const tallyCivilization = (civ: Civilization) => {
      const rank = TECH_STAGE_RANK.indexOf(civ.techStage);
      if (civ.extinctAgoGyr === null) { civTally.living++; civTally.livingRank = Math.max(civTally.livingRank, rank); }
      else                            { civTally.ruins++;  civTally.ruinsRank  = Math.max(civTally.ruinsRank, rank); }
    };

    for (const planet of system.planets) {
      if (!planet.life) continue;
      everLifePlanets++;
      const bio = generateBiosphere(planet, star);

      // A civilization whose species has died out still counts, as ruins (R8)
      const civ = generateCivilization(bio, planet, seed).civilization;
      if (civ) {
        civilizationCount++;
        civRank = Math.max(civRank, TECH_STAGE_RANK.indexOf(civ.techStage));
        tallyCivilization(civ);
      }
      if (!bio.hasLife) continue;
      lifeBearingPlanets++;

      const stageRank = ORGANISM_STAGES.indexOf(bio.stage);
      if (stageRank >= 0) {
        lifePlanetCount++;
        mostAdvanced = Math.max(mostAdvanced, stageRank);
      }
    }

    // Moon worlds (MO4): their civilizations count with the planets'; their life is counted apart (decision 13)
    let lifeMoonCount = 0;
    for (const planet of system.planets) {
      for (const moon of planet.moons) {
        if (!moon.world?.life) continue;
        const bio = generateBiosphere(moon.world, star);
        const civ = generateCivilization(bio, moon.world, seed).civilization;
        if (civ) {
          civilizationCount++;
          civRank = Math.max(civRank, TECH_STAGE_RANK.indexOf(civ.techStage));
          tallyCivilization(civ);
        }
        if (!bio.hasLife) continue;
        lifeBearingMoons++;
        const stageRank = ORGANISM_STAGES.indexOf(bio.stage);
        if (stageRank >= 0) {
          lifeMoonCount++;
          mostAdvanced = Math.max(mostAdvanced, stageRank);
        }
      }
    }

    // A system with organisms on a planet or a moon (MO6): its life marker counts both
    if (lifePlanetCount > 0 || lifeMoonCount > 0) {
      systems.push({
        starId: star.id,
        mostAdvancedStage: ORGANISM_STAGES[mostAdvanced],
        lifePlanetCount,
        lifeMoonCount,
        civilizationStage: civRank >= 0 ? TECH_STAGE_RANK[civRank] : null,
      });
    }

    // A system where a civilization arose, even one whose life has all died out (R8)
    if (civTally.living > 0 || civTally.ruins > 0) {
      civilizations.push({
        starId: star.id,
        stage: TECH_STAGE_RANK[civTally.living > 0 ? civTally.livingRank : civTally.ruinsRank],
        living: civTally.living,
        ruins: civTally.ruins,
      });
    }
  }

  return { totalPlanets, lifeBearingPlanets, everLifePlanets, engulfedPlanets, tooSmallPlanets, unstablePlanets, ejectedPlanets, lifeBearingMoons, civilizationCount, systems, civilizations, index: packIndex(rows), moonIndex: packIndex(moonRows) };
}
