import { describe, it, expect } from "vitest";
import { hostStarRadius, layoutReach, SYSTEM_UNITS_PER_AU, systemLayout } from "../rendering/systemLayout";
import { makeConfig } from "../simulation/config";
import { buildGalaxyConfig } from "../simulation/galaxy";
import { generatePlanetsFor } from "../simulation/planet";
import type { Planet } from "../simulation/planet";
import { generateStarsFor, UNIVERSE_AGE_GYR } from "../simulation/star";

// The system view's scale, as renderPlanetarySystem sets it
const USUAL_INNER_ORBIT_AU = 0.4;
const scaleOf = (planets: readonly Planet[]) => Math.max(1, Math.min(...planets.map((p) => p.orbitalRadius)) / USUAL_INNER_ORBIT_AU);

function systemsOf(seed: number, starCount: number): Planet[][] {
  const config = makeConfig(seed);
  const stars = generateStarsFor(buildGalaxyConfig(seed, config), UNIVERSE_AGE_GYR, config).stars.slice(0, starCount);
  return stars.map((star) => generatePlanetsFor(star, seed, config).planets).filter((planets) => planets.length > 0);
}

/** What overlaps on screen in a system: a planet or moon reaching into the star, or into a neighbour's planet and moons. */
function overlapsOf(planets: readonly Planet[]): string[] {
  const scale = scaleOf(planets);
  const layouts = systemLayout(planets, scale);
  const sorted = [...planets].sort((a, b) => a.orbitalRadius - b.orbitalRadius);
  const found: string[] = [];
  sorted.forEach((planet, i) => {
    const orbit = planet.orbitalRadius * SYSTEM_UNITS_PER_AU;
    const reach = layoutReach(layouts.get(planet.key)!);
    if (orbit - reach < hostStarRadius(planets, scale)) found.push(`${planet.key} reaches into the star`);
    const next = sorted[i + 1];
    if (next && orbit + reach > next.orbitalRadius * SYSTEM_UNITS_PER_AU - layoutReach(layouts.get(next.key)!)) {
      found.push(`${planet.key} reaches into ${next.key}`);
    }
  });
  return found;
}

describe("the system view's layout", () => {
  it("never draws a moon through the star or a planet's bodies into its neighbour's (seeds 100000, 42, 7777)", () => {
    for (const seed of [100000, 42, 7777]) {
      const systems = systemsOf(seed, 400);
      expect(systems.length).toBeGreaterThan(250);
      expect(systems.filter((planets) => planets.some((p) => p.moons.length > 0)).length).toBeGreaterThan(150);
      for (const planets of systems) expect(overlapsOf(planets)).toEqual([]);
    }
  });

  it("keeps Star 0039 b's moon of seed 100000 clear of its star and of planet c", () => {
    const system = systemsOf(100000, 40).find((planets) => planets[0].hostStarId === 39)!;
    const b = [...system].sort((x, y) => x.orbitalRadius - y.orbitalRadius)[0];
    expect(b.moons.length).toBe(1);
    expect(overlapsOf(system)).toEqual([]);
  });

  it("leaves a roomy planet at its usual size, and shrinks a crowded one with its moons in proportion", () => {
    const moon = (orbitPlanetRadii: number) => ({ orbitPlanetRadii, size: 0.3 }) as Planet["moons"][number];
    const giant = (key: string, orbitalRadius: number): Planet =>
      ({ key, orbitalRadius, size: 11, moons: [moon(5), moon(10), moon(20)] }) as Planet;
    const roomy = systemLayout([giant("a", 1), giant("b", 3)], 1).get("a")!;
    expect(roomy.planetRadius).toBeCloseTo(0.09, 9);
    const crowded = systemLayout([giant("a", 1), giant("b", 1.1)], 1).get("a")!;
    expect(crowded.planetRadius).toBeLessThan(roomy.planetRadius);
    crowded.moons.forEach((m, i) => {
      expect(m.distance / crowded.planetRadius).toBeCloseTo(roomy.moons[i].distance / roomy.planetRadius, 9);
      expect(m.radius / crowded.planetRadius).toBeCloseTo(roomy.moons[i].radius / roomy.planetRadius, 9);
    });
  });
});
