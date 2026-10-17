import { describe, it, expect } from "vitest";
import { makeConfig } from "../simulation/config";
import { buildGalaxyConfig } from "../simulation/galaxy";
import { generateStarsFor, UNIVERSE_AGE_GYR } from "../simulation/star";
import type { Star } from "../simulation/star";
import { generatePlanetsFor } from "../simulation/planet";
import { generateBiosphere } from "../simulation/biosphere";
import { canSustainFire, generateCivilization, techLevelToStage } from "../simulation/civilization";
import { surveyLife } from "../simulation/lifeSurvey";
import { FILTER_MIN_ARRIVING, funnelOf, GATES } from "../simulation/greatFilter";

function starsOf(seed: number): Star[] {
  const config = makeConfig(seed);
  return generateStarsFor(buildGalaxyConfig(seed, config), UNIVERSE_AGE_GYR, config).stars;
}

/** How many gates a planet passes in a row, counted from the generators rather than the index. */
function directGates(seed: number, stars: Star[]): number[] {
  const config = makeConfig(seed);
  const out: number[] = [];
  for (const star of stars) {
    for (const planet of generatePlanetsFor(star, seed, config).planets) {
      const bio = generateBiosphere(planet, star);
      const civ = generateCivilization(bio, planet, seed).civilization;
      const phylogeny = planet.life?.phylogeny;
      const first = (kind: string) => phylogeny?.firsts.some((f) => f.kind === kind) ?? false;
      const highest = civ ? techLevelToStage(civ.techLevel, false) : null;
      const checks = [
        planet.surface !== null,
        planet.everLiquidWater,
        planet.life !== null,
        first("light"),
        planet.life?.oxygenGyr != null,
        first("multicellular"),
        phylogeny?.mind != null,
        canSustainFire(planet),
        highest === "industrial" || highest === "information" || highest === "space-age",
        highest === "information" || highest === "space-age",
        highest === "space-age",
        civ !== null && civ.techStage !== "collapsed",
      ];
      const k = checks.indexOf(false);
      out.push(k === -1 ? checks.length : k);
    }
  }
  return out;
}

describe("the Great Filter funnel", () => {
  it("reproduces the plan's funnel for seed 100000, and never rises", () => {
    const seed = 100000;
    const funnel = funnelOf(surveyLife(starsOf(seed), seed, makeConfig(seed)).index);
    expect(funnel.worlds).toBe(8537);
    expect(funnel.steps.map((s) => s.passed)).toEqual([7134, 4730, 4167, 1706, 334, 271, 86, 37, 22, 13, 3, 3]);
    for (let g = 1; g < funnel.steps.length; g++) {
      expect(funnel.steps[g].arrived).toBe(funnel.steps[g - 1].passed);
      expect(funnel.steps[g].passed).toBeLessThanOrEqual(funnel.steps[g].arrived);
    }
    // The steepest gate that at least ten worlds reach: light-using life to an oxygenated sky (20%)
    expect(funnel.filter).toBe("oxygen");
  });

  it("equals counts made directly from the generators", () => {
    for (const seed of [42, 7777]) {
      const stars = starsOf(seed).slice(0, 250);
      const funnel = funnelOf(surveyLife(stars, seed, makeConfig(seed)).index);
      const reached = directGates(seed, stars);
      GATES.forEach((_, g) => expect(funnel.steps[g].passed, `${seed} gate ${g + 1}`).toBe(reached.filter((k) => k > g).length));
      const named = funnel.steps.find((s) => s.gate.id === funnel.filter);
      if (named) expect(named.arrived).toBeGreaterThanOrEqual(FILTER_MIN_ARRIVING);
    }
  });
});
