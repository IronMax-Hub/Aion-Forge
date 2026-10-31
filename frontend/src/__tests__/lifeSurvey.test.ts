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
import type { SystemCivilization, SystemLife } from "../simulation/lifeSurvey";
import { generateCivilization } from "../simulation/civilization";
import { civilizationMarkerLabel, lifeMarkerLabel } from "../ui/format";

const SEED = 100000;
const config = makeConfig(SEED);
const allStars = generateStarsFor(
  { type: pickGalaxyType(createRNG(SEED)), particleCount: 500, seed: SEED, scale: 120 }, 13.7, config,
).stars;
// The first 300, and star 1660, the one with a civilization under rules v19
const stars = [...allStars.slice(0, 300), allStars[1660]];   // a sample: the survey reads each star the same way
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

describe("civilization survey", () => {
  // Every civilization around a star, living or in ruins
  const civsOf = (star: Star) => generatePlanetsFor(star, SEED, config).planets
    .flatMap(p => [p, ...p.moons.flatMap(m => (m.world ? [m.world] : []))])
    .filter(body => body.life)
    .flatMap(body => generateCivilization(generateBiosphere(body, star), body, SEED).civilization ?? []);
  const civSystems = stars.flatMap(star => {
    const civs = civsOf(star);
    return civs.length > 0 ? [{ star, civs }] : [];
  });
  const marked = survey;

  it("marks every system where a civilization arose, with its living civilizations and ruins", () => {
    expect(civSystems.length).toBeGreaterThan(0);
    expect(marked.civilizations.map(c => ({ starId: c.starId, living: c.living, ruins: c.ruins }))).toEqual(
      civSystems.map(({ star, civs }) => ({
        starId: star.id,
        living: civs.filter(c => c.extinctAgoGyr === null).length,
        ruins: civs.filter(c => c.extinctAgoGyr !== null).length,
      })));
    expect(marked.civilizations.reduce((n, c) => n + c.living + c.ruins, 0)).toBe(marked.civilizationCount);
  });

  it("marks ruins even where no organisms remain", () => {
    const withLife = new Set(marked.systems.map(s => s.starId));
    for (const c of marked.civilizations.filter(c => !withLife.has(c.starId))) expect(c.living).toBe(0);
  });
});

describe("civilization marker label", () => {
  const base: SystemCivilization = { starId: 0, stage: "industrial", living: 1, ruins: 0 };
  it("names the most notable living civilization, then the others and the ruins", () => {
    expect(civilizationMarkerLabel(base)).toBe("Civilization · Industrial");
    expect(civilizationMarkerLabel({ ...base, living: 2 })).toBe("Civilization · Industrial +1");
    expect(civilizationMarkerLabel({ ...base, ruins: 1 })).toBe("Civilization · Industrial · 1 ruin");
    expect(civilizationMarkerLabel({ ...base, living: 2, ruins: 3 })).toBe("Civilization · Industrial +1 · 3 ruins");
  });
  it("calls a system with no living civilization ruins", () => {
    expect(civilizationMarkerLabel({ ...base, stage: "collapsed", living: 0, ruins: 1 })).toBe("Ruins");
    expect(civilizationMarkerLabel({ ...base, stage: "collapsed", living: 0, ruins: 2 })).toBe("Ruins · 2 worlds");
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
