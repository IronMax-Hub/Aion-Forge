import { describe, it, expect } from "vitest";
import { createRNG } from "../simulation/rng";
import { pickGalaxyType } from "../simulation/galaxy";
import { generateStarsFor } from "../simulation/star";
import { generatePlanetsFor } from "../simulation/planet";
import type { Planet } from "../simulation/planet";
import type { Star } from "../simulation/star";
import { generateBiosphere } from "../simulation/biosphere";
import { makeConfig } from "../simulation/config";
import { surveyLife, ORGANISM_STAGES } from "../simulation/lifeSurvey";
import type { SystemLife } from "../simulation/lifeSurvey";
import { lifeMarkerLabel } from "../ui/format";

const SEED = 100000;
const config = makeConfig(SEED);
const stars = generateStarsFor(
  { type: pickGalaxyType(createRNG(SEED)), particleCount: 500, seed: SEED, scale: 120 }, 13.7, config,
).stars.slice(0, 300);   // a sample: the survey reads each star the same way
const survey = surveyLife(stars, SEED, config);

describe("life survey", () => {
  it("gives the same result for the same seed", () => {
    expect(surveyLife(stars, SEED, config)).toEqual(survey);
  });

  it("marks exactly the systems whose planets or moons carry organisms, at their most advanced stage", () => {
    const expected: { starId: number; stage: string; planets: number; moons: number }[] = [];
    const organisms = (bodies: Planet[], star: Star) => bodies
      .map(p => generateBiosphere(p, star))
      .filter(b => b.hasLife && b.stage !== "prebiotic")
      .map(b => ORGANISM_STAGES.indexOf(b.stage));
    for (const star of stars) {
      const planets = generatePlanetsFor(star, SEED, config).planets;
      const onPlanets = organisms(planets, star);
      const onMoons = organisms(planets.flatMap(p => p.moons.flatMap(m => (m.world ? [m.world] : []))), star);
      const stages = [...onPlanets, ...onMoons];
      if (stages.length > 0) {
        expected.push({ starId: star.id, stage: ORGANISM_STAGES[Math.max(...stages)], planets: onPlanets.length, moons: onMoons.length });
      }
    }
    expect(expected.length).toBeGreaterThan(0);
    expect(survey.systems.map(s => ({ starId: s.starId, stage: s.mostAdvancedStage, planets: s.lifePlanetCount, moons: s.lifeMoonCount })))
      .toEqual(expected);
  });

  it("keeps universe totals consistent with the systems it marks", () => {
    const organismPlanets = survey.systems.reduce((n, s) => n + s.lifePlanetCount, 0);
    expect(survey.lifeBearingPlanets).toBeGreaterThanOrEqual(organismPlanets);
    expect(survey.systems.filter(s => s.civilizationStage).length).toBeLessThanOrEqual(survey.civilizationCount);
  });
});

describe("life marker label", () => {
  const base: SystemLife = { starId: 1, mostAdvancedStage: "complex", lifePlanetCount: 1, lifeMoonCount: 0, civilizationStage: null };

  it("names the most advanced life, and counts other living planets", () => {
    expect(lifeMarkerLabel(base)).toBe("Complex ecosystems");
    expect(lifeMarkerLabel({ ...base, mostAdvancedStage: "microbial", lifePlanetCount: 3 })).toBe("Microbial +2");
  });

  it("counts living moons apart from planets (MO6)", () => {
    expect(lifeMarkerLabel({ ...base, lifePlanetCount: 2, lifeMoonCount: 1 })).toBe("Complex ecosystems +1 · 1 moon");
    expect(lifeMarkerLabel({ ...base, lifePlanetCount: 0, lifeMoonCount: 1, mostAdvancedStage: "microbial" })).toBe("Microbial · on a moon");
    expect(lifeMarkerLabel({ ...base, lifePlanetCount: 0, lifeMoonCount: 3, mostAdvancedStage: "microbial" })).toBe("Microbial · on 3 moons");
  });

  it("prefers a civilization over the life stage", () => {
    expect(lifeMarkerLabel({ ...base, civilizationStage: "industrial" })).toBe("Civilization · Industrial");
  });
});
