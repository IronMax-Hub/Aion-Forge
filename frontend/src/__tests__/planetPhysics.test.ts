import { describe, it, expect } from "vitest";
import { derivePhysics, tectonicActivity, tidalLockingDistanceAU, SURFACE_PRESSURE_BAR, atmosphereClassOf } from "../simulation/planetPhysics";
import type { PlanetPhysics } from "../simulation/planetPhysics";
import { luminosityAt, mainSequenceEndGyr, generateStarsFor, UNIVERSE_AGE_GYR } from "../simulation/star";
import type { Star } from "../simulation/star";
import { generatePlanetsFor, planetKey, GIANT_PLANET_MASS } from "../simulation/planet";
import type { Planet } from "../simulation/planet";
import { buildGalaxyConfig } from "../simulation/galaxy";
import { makeConfig } from "../simulation/config";

function star(overrides: Partial<Star> = {}): Star {
  return {
    id: 1, position: [0, 0, 0], mass: 1, age: 4.6, lifespan: 10, temperature: 5772,
    luminosity: 1, classification: "main-sequence", isRare: false, ...overrides,
  };
}

function planet(overrides: Partial<Planet> = {}): Planet {
  return {
    id: 2, key: planetKey(1, 2), hostStarId: 1, orbitalRadius: 1, orbitalIndex: 2, type: "rocky",
    size: 1, mass: 1, temperature: 288, atmosphere: "moderate", formationAtmosphere: "moderate", resourceAbundance: 0.5,
    habitabilityScore: 0.8, isRare: false, surface: null, life: null, ...overrides,
  };
}

function starsOf(seed: number) {
  const config = makeConfig(seed);
  return generateStarsFor(buildGalaxyConfig(seed, config), UNIVERSE_AGE_GYR, config).stars;
}

// The planets of a universe's first 600 stars: a sample large enough for the statistics below
function universe(seed: number) {
  const config = makeConfig(seed);
  return starsOf(seed).slice(0, 600).flatMap((s) => generatePlanetsFor(s, seed, config).planets.map((p) => ({
    star: s, planet: p, physics: derivePhysics(p, s, seed, config),
  })));
}

const median = (values: number[]) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];

describe("stellar luminosity through time", () => {
  it("returns today's luminosity today, for any kind of star", () => {
    for (const s of starsOf(42)) {
      expect(luminosityAt(s, s.age)).toBe(s.luminosity);
    }
  });

  it("starts the Sun at about 70% of today's brightness", () => {
    expect(luminosityAt(star(), 0)).toBeCloseTo(0.698, 3);
  });

  it("only brightens while the star is on the main sequence", () => {
    const s = star();
    let previous = 0;
    for (let t = 0; t < mainSequenceEndGyr(s); t += 0.1) {
      expect(luminosityAt(s, t)).toBeGreaterThan(previous);
      previous = luminosityAt(s, t);
    }
  });

  it("gives a red giant a main-sequence past anchored at mid main sequence, then today's luminosity", () => {
    const giant = star({ mass: 1.2, lifespan: 10 / 1.2 ** 2.5, age: 10, classification: "red-giant", luminosity: 1.2 ** 3.5 * 500 });
    const msEnd = mainSequenceEndGyr(giant);
    expect(luminosityAt(giant, msEnd / 2)).toBeCloseTo(1.2 ** 3.5, 12);
    expect(luminosityAt(giant, msEnd * 0.99)).toBeLessThan(giant.luminosity / 100);
    expect(luminosityAt(giant, msEnd)).toBe(giant.luminosity);
  });
});

describe("planet physics: reference cases", () => {
  it("gives Earth around the Sun Earth's gravity, escape velocity and year, and no locking", () => {
    const earth = derivePhysics(planet(), star(), 42);
    expect(earth.surfaceGravity).toBe(1);
    expect(earth.escapeVelocityKms).toBeCloseTo(11.2, 10);
    expect(earth.orbitalPeriodYears).toBeCloseTo(1, 10);
    expect(earth.surfacePressureBar).toBe(1);
    expect(earth.tidallyLocked).toBe(false);
    expect(earth.rotationPeriodHours).toBeGreaterThanOrEqual(8);
    expect(earth.rotationPeriodHours).toBeLessThanOrEqual(60);
  });

  it("puts Mercury near the Sun's locking distance and Earth far outside it", () => {
    const aLock = tidalLockingDistanceAU(star());
    expect(aLock).toBeGreaterThan(0.35);
    expect(aLock).toBeLessThan(0.45);
  });

  it("locks a planet 0.05 AU from an M dwarf, spinning once per orbit", () => {
    const mDwarf = star({ mass: 0.3, age: 5, lifespan: 10 / 0.3 ** 2.5, luminosity: 0.3 ** 3.5, temperature: 3400 });
    const p = derivePhysics(planet({ orbitalRadius: 0.05 }), mDwarf, 42);
    expect(p.tidallyLocked).toBe(true);
    expect(p.rotationPeriodHours).toBeCloseTo(p.orbitalPeriodYears * 8766, 6);
  });

  it("takes background pressure from the class the planet formed with, not today's", () => {
    for (const atmosphere of ["none", "thin", "moderate", "thick", "crushing"] as const) {
      expect(derivePhysics(planet({ formationAtmosphere: atmosphere, atmosphere: "crushing" }), star(), 42).surfacePressureBar)
        .toBe(SURFACE_PRESSURE_BAR[atmosphere]);
    }
  });

  it("classes today's air by pressure, splitting neighbouring classes at their geometric mean", () => {
    // A planet whose air never changed keeps its class
    for (const atmosphere of ["none", "thin", "moderate", "thick", "crushing"] as const) {
      expect(atmosphereClassOf(SURFACE_PRESSURE_BAR[atmosphere])).toBe(atmosphere);
    }
    expect(atmosphereClassOf(0.04)).toBe("none");
    expect(atmosphereClassOf(0.05)).toBe("thin");
    expect(atmosphereClassOf(0.5)).toBe("thin");
    expect(atmosphereClassOf(0.6)).toBe("moderate");
    expect(atmosphereClassOf(2.2)).toBe("moderate");
    expect(atmosphereClassOf(2.3)).toBe("thick");
    expect(atmosphereClassOf(21)).toBe("thick");
    expect(atmosphereClassOf(22)).toBe("crushing");
    expect(atmosphereClassOf(10_000)).toBe("crushing");
    expect(atmosphereClassOf(0)).toBe("none");
  });

  it("puts the snow line where the star shone when the planet formed", () => {
    const giant = star({ age: 9.5, classification: "red-giant", luminosity: 500 });
    expect(derivePhysics(planet(), giant, 42).snowLineAU).toBeCloseTo(2.7 * Math.sqrt(luminosityAt(giant, 0)), 10);
    expect(derivePhysics(planet(), giant, 42).snowLineAU).toBeLessThan(5);   // not 2.7·√500 ≈ 60 AU
  });
});

describe("planet physics across a universe", () => {
  const all = universe(100000);
  const physics = all.map((e) => e.physics);

  it("is deterministic and draws from its own stream", () => {
    expect(universe(100000).map((e) => e.physics)).toEqual(physics);
    const e = all[5];
    const nextDoor = { ...e.planet, id: e.planet.id + 1 };
    expect(derivePhysics(nextDoor, e.star, 100000).axialTiltDeg).not.toBe(e.physics.axialTiltDeg);
  });

  it("locks about a quarter of all planets", () => {
    const share = physics.filter((p) => p.tidallyLocked).length / physics.length;
    expect(share).toBeGreaterThan(0.15);
    expect(share).toBeLessThan(0.35);
  });

  it("locks habitable-zone planets of red dwarfs far more often than those of Sun-like stars", () => {
    const lockedShare = (inClass: (s: Star) => boolean) => {
      const hz = all.filter((e) => inClass(e.star) && e.planet.mass < GIANT_PLANET_MASS && e.planet.temperature > 200 && e.planet.temperature < 330);
      return hz.filter((e) => e.physics.tidallyLocked).length / hz.length;
    };
    expect(lockedShare((s) => s.mass < 0.6)).toBeGreaterThan(5 * lockedShare((s) => s.mass > 0.8 && s.mass < 1.2));
  });

  it("tilts most planets under 35°, some up to 90°", () => {
    const tilts = physics.map((p) => p.axialTiltDeg);
    const lowShare = tilts.filter((t) => t < 35).length / tilts.length;
    expect(lowShare).toBeGreaterThan(0.75);
    expect(lowShare).toBeLessThan(0.85);
    for (const t of tilts) { expect(t).toBeGreaterThanOrEqual(0); expect(t).toBeLessThanOrEqual(90); }
  });

  it("spins free planets once every 8 to 60 hours", () => {
    for (const p of physics.filter((q) => !q.tidallyLocked)) {
      expect(p.rotationPeriodHours).toBeGreaterThanOrEqual(8);
      expect(p.rotationPeriodHours).toBeLessThanOrEqual(60);
    }
  });

  it("gives planets beyond the snow line far more water, and small planets less", () => {
    const retained = all.filter((e) => e.planet.mass >= 0.1);
    const wet = (inside: boolean) => retained.filter((e) => (e.planet.orbitalRadius < e.physics.snowLineAU) === inside).map((e) => e.physics.waterInventory);
    expect(median(wet(true))).toBeCloseTo(0.08, 1);
    expect(median(wet(false))).toBeCloseTo(0.5, 1);
    for (const p of physics) { expect(p.waterInventory).toBeGreaterThanOrEqual(0); expect(p.waterInventory).toBeLessThanOrEqual(1); }
    const tiny = all.filter((e) => e.planet.mass < 0.1);
    for (const e of tiny) expect(e.physics.waterInventory).toBeLessThanOrEqual(e.planet.mass / 0.1);
  });

  it("gives heavier worlds of the same size stronger gravity", () => {
    const light: PlanetPhysics = derivePhysics(planet({ mass: 0.5 }), star(), 42);
    const heavy: PlanetPhysics = derivePhysics(planet({ mass: 2 }), star(), 42);
    expect(heavy.surfaceGravity).toBeGreaterThan(light.surfaceGravity);
    expect(heavy.escapeVelocityKms).toBeGreaterThan(light.escapeVelocityKms);
  });
});

describe("tectonic activity through time", () => {
  it("never increases as a planet ages, and stays between 0 and 1", () => {
    for (const mass of [0.05, 0.3, 1, 4, 12]) {
      let previous = Infinity;
      for (let t = 0; t <= 13.7; t += 0.1) {
        const tau = tectonicActivity(planet({ mass }), t);
        expect(tau).toBeLessThanOrEqual(previous);
        expect(tau).toBeGreaterThanOrEqual(0);
        expect(tau).toBeLessThanOrEqual(1);
        previous = tau;
      }
    }
  });

  it("keeps larger planets active for longer", () => {
    expect(tectonicActivity(planet({ mass: 0.1 }), 4.6)).toBeLessThan(tectonicActivity(planet({ mass: 1 }), 4.6));
    expect(tectonicActivity(planet({ mass: 1 }), 4.6)).toBeCloseTo(Math.exp(-4.6 / 8), 12);
  });
});
