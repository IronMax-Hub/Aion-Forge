import { describe, it, expect } from "vitest";
import { generatePlanetsFor, GIANT_PLANET_MASS } from "../simulation/planet";
import type { Planet } from "../simulation/planet";
import { generateStarsFor, UNIVERSE_AGE_GYR } from "../simulation/star";
import type { Star } from "../simulation/star";
import { buildGalaxyConfig } from "../simulation/galaxy";
import { makeConfig } from "../simulation/config";
import { generateBiosphere } from "../simulation/biosphere";
import { generateCivilization, canSustainFire } from "../simulation/civilization";
import { derivePhysics, atmosphereClassOf } from "../simulation/planetPhysics";

// Worlds Up Close A3: planet type, temperature and habitability are read from
// the present day the world history leaves behind.

const seed = 100000;
const config = makeConfig(seed);
const stars = generateStarsFor(buildGalaxyConfig(seed, config), UNIVERSE_AGE_GYR, config).stars.slice(0, 400);
const all: { star: Star; planet: Planet }[] = stars.flatMap((star) =>
  generatePlanetsFor(star, seed, config).planets.map((planet) => ({ star, planet })));
const solid = all.filter(({ planet }) => planet.mass <= GIANT_PLANET_MASS);
const giants = all.filter(({ planet }) => planet.mass > GIANT_PLANET_MASS);

describe("planet types", () => {
  it("gives every solid planet a surface and no giant one", () => {
    expect(solid.length).toBeGreaterThan(1000);
    for (const { planet } of solid) expect(planet.surface).not.toBeNull();
    for (const { planet } of giants) expect(planet.surface).toBeNull();
  });

  it("names solid planets from today's surface: lava, ocean, ice, desert or rocky", () => {
    for (const { planet: { type, temperature, surface } } of solid) {
      const s = surface!;
      expect(s.oceanFraction + s.iceFraction + s.landFraction).toBeCloseTo(1, 9);
      if (temperature > 1000) { expect(type).toBe("lava"); continue; }
      if (s.oceanFraction > 0.9) { expect(type).toBe("ocean"); continue; }
      if (s.iceFraction > 0.85) { expect(type).toBe("ice"); continue; }
      if (s.oceanFraction < 0.03 && temperature > 273) { expect(type).toBe("desert"); continue; }
      expect(type).toBe("rocky");
    }
  });

  it("produces every solid type somewhere", () => {
    const types = new Set(solid.map(({ planet }) => planet.type));
    for (const t of ["lava", "ocean", "ice", "desert", "rocky"]) expect(types).toContain(t);
  });

  it("makes cold giants ice giants and warm ones gas giants", () => {
    for (const { planet } of giants) expect(planet.type).toBe(planet.temperature < 75 ? "ice-giant" : "gas-giant");
    expect(new Set(giants.map(({ planet }) => planet.type))).toEqual(new Set(["ice-giant", "gas-giant"]));
  });

  it("reports the surface temperature of solid planets and the cloud-top temperature of giants", () => {
    for (const { planet } of all) expect(Number.isFinite(planet.temperature) && planet.temperature > 0).toBe(true);
  });
});

describe("atmosphere class", () => {
  it("is today's, from the pressure the world history left; giants keep the class they formed with", () => {
    for (const { planet } of solid) expect(planet.atmosphere).toBe(atmosphereClassOf(planet.surface!.pressureBar));
    for (const { planet } of giants) expect(planet.atmosphere).toBe(planet.formationAtmosphere);
    // Histories do move planets between classes
    expect(solid.some(({ planet }) => planet.atmosphere !== planet.formationAtmosphere)).toBe(true);
  });
});

describe("habitability", () => {
  it("is zero for giants, lava worlds and worlds with no liquid water today", () => {
    for (const { planet } of all) {
      expect(planet.habitabilityScore).toBeGreaterThanOrEqual(0);
      expect(planet.habitabilityScore).toBeLessThanOrEqual(1);
      if (!planet.surface || planet.type === "lava" || planet.surface.habitableFraction === 0) {
        expect(planet.habitabilityScore).toBe(0);
      }
    }
  });

  it("follows the share of the surface that holds liquid water, full from half the surface up", () => {
    const moderate = solid.filter(({ planet }) => planet.atmosphere === "moderate" && planet.type !== "lava"
      && planet.surface!.surfaceGravity >= 0.4 && planet.surface!.surfaceGravity <= 2.5);
    expect(moderate.filter(({ planet }) => planet.surface!.habitableFraction > 0).length).toBeGreaterThan(20);
    for (const { planet } of moderate) {
      const area = Math.min(1, planet.surface!.habitableFraction / 0.5);
      // Resources move the score by at most 10%
      expect(planet.habitabilityScore).toBeLessThanOrEqual(area + 1e-12);
      expect(planet.habitabilityScore).toBeGreaterThanOrEqual(0.9 * area - 1e-12);
    }
  });

  it("fades below 0.4 g; with the Chen & Kipping radii no solid planet reaches the 2.5 g upper edge", () => {
    const light = solid.filter(({ planet }) => planet.surface!.surfaceGravity < 0.4 && planet.surface!.habitableFraction >= 0.5);
    expect(light.length).toBeGreaterThan(0);
    // Full credit at 0.4 g, none at 0.2 g
    for (const { planet } of light) expect(planet.habitabilityScore).toBeLessThanOrEqual(Math.max(0, (planet.surface!.surfaceGravity - 0.2) / 0.2) + 1e-12);
    for (const { planet } of solid) expect(planet.surface!.surfaceGravity).toBeLessThan(2.5);
  });

  it("agrees with the planet's physics", () => {
    for (const { star, planet } of solid.slice(0, 200)) {
      expect(planet.surface!.surfaceGravity).toBe(derivePhysics(planet, star, seed, config).surfaceGravity);
    }
  });
});

describe("fire", () => {
  it("needs exposed land, at least half a bar of air, and 0.16 bar of oxygen (C2.10)", () => {
    for (const { planet } of solid) {
      const s = planet.surface!;
      expect(canSustainFire(planet)).toBe(s.landFraction >= 0.01 && s.pressureBar >= 0.5 && s.o2Bar >= 0.16);
    }
    for (const { planet } of giants) expect(canSustainFire(planet)).toBe(false);
  });

  it("stops every civilization on a world without fire short of industry", () => {
    let fireless = 0;
    for (const { star, planet } of all) {
      const bio = generateBiosphere(planet, star);
      const civ = generateCivilization(bio, planet, seed).civilization;
      if (!civ || canSustainFire(planet)) continue;
      fireless++;
      expect(["collapsed", "primitive", "agricultural"]).toContain(civ.techStage);
    }
    expect(fireless).toBeGreaterThan(0);
  });
});
