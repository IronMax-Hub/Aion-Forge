import { describe, it, expect } from "vitest";
import { HILL_SPACING, mutualHillRadiusAU, settleNeighbours, tooClose } from "../simulation/rogues";
import { generatePlanetsFor } from "../simulation/planet";
import { generateStarsFor, UNIVERSE_AGE_GYR } from "../simulation/star";
import { buildGalaxyConfig } from "../simulation/galaxy";
import { makeConfig } from "../simulation/config";

// Galaxy Through Time RP1: neighbours too close to share their orbits.

describe("the mutual Hill radius", () => {
  it("is ((m₁ + m₂) / 3M★)^⅓ times the mean orbit: two Earths at 1 AU around the Sun, 0.0126 AU", () => {
    const earth = { mass: 1, orbitalRadius: 1 };
    expect(mutualHillRadiusAU(earth, earth, 1)).toBeCloseTo(Math.cbrt((2 * 3.003e-6) / 3), 12);
    expect(mutualHillRadiusAU(earth, earth, 1)).toBeCloseTo(0.0126, 4);
    expect(HILL_SPACING).toBeCloseTo(2 * Math.sqrt(3), 15);
  });

  it("puts the limit at 2√3 mutual Hill radii", () => {
    const inner = { mass: 1, orbitalRadius: 1 };
    const limit = HILL_SPACING * mutualHillRadiusAU(inner, { mass: 1, orbitalRadius: 1.04 }, 1);
    expect(tooClose(inner, { mass: 1, orbitalRadius: 1.04 }, 1)).toBe(0.04 < limit);
    expect(tooClose(inner, { mass: 1, orbitalRadius: 1.2 }, 1)).toBe(false);
    // A Jupiter beside an Earth reaches far wider
    expect(tooClose(inner, { mass: 318, orbitalRadius: 1.2 }, 1)).toBe(true);
  });
});

describe("settling neighbours", () => {
  it("throws out the lighter of a pair, the outer one if they weigh the same", () => {
    const jupiter = { mass: 318, orbitalRadius: 1.2 };
    const earth = { mass: 1, orbitalRadius: 1 };
    expect(settleNeighbours([earth, jupiter], 1)).toEqual({ kept: [jupiter], ejected: [earth] });
    const a = { mass: 5, orbitalRadius: 1 };
    const b = { mass: 5, orbitalRadius: 1.01 };
    expect(settleNeighbours([a, b], 1)).toEqual({ kept: [a], ejected: [b] });
  });

  it("checks the survivor against its new neighbour after a removal", () => {
    // The middle planet leaves for its heavy outer neighbour; then the inner one is too close to that giant too
    const inner = { mass: 2, orbitalRadius: 1 };
    const middle = { mass: 1, orbitalRadius: 1.1 };
    const giant = { mass: 300, orbitalRadius: 1.25 };
    const { kept, ejected } = settleNeighbours([inner, middle, giant], 1);
    expect(kept).toEqual([giant]);
    expect(ejected).toEqual([middle, inner]);
  });

  it("uses both stars' mass for neighbours that both orbit both stars", () => {
    const inner = { mass: 10, orbitalRadius: 5, orbitsBothStars: true as const };
    const outer = { mass: 10, orbitalRadius: 5.42, orbitsBothStars: true as const };
    // Around one Sun the pair is too close; around a pair of Suns, whose pull is stronger, it is not
    expect(settleNeighbours([inner, outer], 1).ejected.length).toBe(1);
    expect(settleNeighbours([inner, outer], 1, 2).ejected.length).toBe(0);
  });
});

describe("unstable neighbours in a universe", () => {
  const seed = 100000;
  const config = makeConfig(seed);
  const stars = generateStarsFor(buildGalaxyConfig(seed, config), UNIVERSE_AGE_GYR, config).stars.slice(0, 500);
  const systems = stars.map((star) => ({ star, system: generatePlanetsFor(star, seed, config) }));

  it("leaves no neighbouring pair closer than the limit", () => {
    let ejected = 0;
    for (const { star, system } of systems) {
      ejected += system.ejected;
      const pairMass = star.mass + (star.companion?.mass ?? 0);
      const planets = system.planets;
      for (let i = 0; i + 1 < planets.length; i++) {
        const both = planets[i].orbitsBothStars && planets[i + 1].orbitsBothStars;
        expect(tooClose(planets[i], planets[i + 1], both ? pairMass : star.mass)).toBe(false);
      }
    }
    // The sample must exercise the rule
    expect(ejected).toBeGreaterThan(0);
  });

  it("is the same every time", () => {
    const again = stars.slice(0, 100).map((star) => generatePlanetsFor(star, seed, config).ejected);
    expect(again).toEqual(systems.slice(0, 100).map(({ system }) => system.ejected));
  });
});
