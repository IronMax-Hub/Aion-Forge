import { describe, it, expect } from "vitest";
import { atmosphereComposition } from "../simulation/atmosphereComposition";
import { transitSpectrum } from "../simulation/spectrum";
import { observeTransits } from "../simulation/observation";
import { detectGases, verdictFor, DETECTION_SIGMA } from "../simulation/detection";
import { generatePlanetsFor } from "../simulation/planet";
import type { Planet } from "../simulation/planet";
import { generateStarsFor, UNIVERSE_AGE_GYR } from "../simulation/star";
import type { Star } from "../simulation/star";
import { buildGalaxyConfig } from "../simulation/galaxy";
import { makeConfig } from "../simulation/config";
import { generateBiosphere } from "../simulation/biosphere";
import { generateCivilization } from "../simulation/civilization";

// Worlds Up Close B6: the whole chain, from a planet's air to the verdict, locked down on real universes.

function universe(seed: number, starCount: number) {
  const config = makeConfig(seed);
  return generateStarsFor(buildGalaxyConfig(seed, config), UNIVERSE_AGE_GYR, config).stars.slice(0, starCount)
    .flatMap((star) => generatePlanetsFor(star, seed, config).planets.map((planet) => ({ star, planet })));
}

/** Composition, spectrum, observation and detection for one planet. */
function readPlanet(planet: Planet, star: Star, seed: number, transits: number) {
  const civilization = generateCivilization(generateBiosphere(planet, star), planet, seed).civilization;
  const composition = atmosphereComposition(planet, civilization);
  const spectrum = transitSpectrum(planet, star, composition);
  const observation = observeTransits(spectrum, planet, star, seed, transits);
  return { composition, spectrum, observation, detection: detectGases(observation, planet, star, composition) };
}

describe("the spectrum pipeline", () => {
  const seed = 42;
  const planets = universe(seed, 40);

  it("gives the same reading every time it is run", () => {
    expect(planets.length).toBeGreaterThan(80);
    for (const { star, planet } of planets) expect(readPlanet(planet, star, seed, 25)).toEqual(readPlanet(planet, star, seed, 25));
  });

  it("gives another universe's planet with the same ids other data", () => {
    const other = universe(seed + 1, 40);
    const pairs = planets.flatMap((first) => other
      .filter(({ star, planet }) => star.id === first.star.id && planet.id === first.planet.id)
      .map((twin) => ({ first, twin })));
    expect(pairs.length).toBeGreaterThan(0);
    for (const { first, twin } of pairs.slice(0, 10)) {
      expect(readPlanet(twin.planet, twin.star, seed + 1, 25).observation.depthPpm)
        .not.toEqual(readPlanet(first.planet, first.star, seed, 25).observation.depthPpm);
    }
  });

  it("states a verdict that follows from its own detections", () => {
    for (const { star, planet } of planets) {
      const { detection } = readPlanet(planet, star, seed, 200);
      const detected = new Set(detection.gases.filter((g) => g.sigma >= DETECTION_SIGMA).map((g) => g.gas));
      expect(detection.verdict).toBe(verdictFor(detected, planet));
    }
  });

  it("tests only gases the air holds, and finds nothing on a planet that hides its whole star", () => {
    for (const { star, planet } of planets) {
      const { composition, spectrum, detection } = readPlanet(planet, star, seed, 200);
      for (const { gas } of detection.gases) expect(composition.mixingRatios[gas]).toBeDefined();
      if (spectrum.baselinePpm >= 1e6) {
        for (const { sigma } of detection.gases) expect(sigma).toBe(0);
        expect(detection.verdict).toBe("none");
      }
    }
  });
});
