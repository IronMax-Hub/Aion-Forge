import { describe, it, expect } from "vitest";
import {
  binaryOrbitOf, CIRCULAR_BELOW_DAYS, COMPANION_CHANCE, companionChance, LOG_PERIOD_DAYS, MASS_RATIO, MAX_ECCENTRICITY,
  pTypeLimitAU, separationFromPeriod, sTypeLimitAU,
} from "../simulation/binary";
import type { Companion } from "../simulation/binary";
import { effectiveOrbitAU, generatePlanetsFor } from "../simulation/planet";
import { orbitAUAt } from "../simulation/planetBasics";
import {
  companionAsStar, companionLuminosityAt, generateStarsFor, irradianceAt, luminosityAt, mainSequenceEndGyr, receivedLuminosityAt,
  stellarRadiusAU, UNIVERSE_AGE_GYR, xuvFluence,
} from "../simulation/star";
import type { Star } from "../simulation/star";
import type { Planet } from "../simulation/planet";
import { planetKey } from "../simulation/planet";
import type { PlanetPhysics } from "../simulation/planetPhysics";
import { runWorldHistory } from "../simulation/worldHistory";
import { buildGeography } from "../simulation/geography";
import { environmentContext, environmentFor } from "../simulation/evolution/environment";
import { EARTH_XUV_FLUENCE, xuvDose } from "../simulation/atmosphericEscape";
import { buildGalaxyConfig } from "../simulation/galaxy";
import { makeConfig } from "../simulation/config";

const starsOf = (seed: number) => {
  const config = makeConfig(seed);
  return generateStarsFor(buildGalaxyConfig(seed, config), UNIVERSE_AGE_GYR, config).stars;
};
const stars = [100000, 42, 7777].flatMap(starsOf);
const binaries = stars.filter((s) => s.companion !== null);

describe("companions (BS1)", () => {
  it("puts Earth around the Sun at 1 AU by Kepler's law", () => {
    expect(separationFromPeriod(1, 365.25)).toBeCloseTo(1, 12);
  });

  it("gives each mass bin its share of companions, within sampling error", () => {
    let from = 0;
    for (const bin of COMPANION_CHANCE) {
      const inBin = stars.filter((s) => s.mass >= from && s.mass < bin.massBelow);
      from = bin.massBelow;
      expect(companionChance(inBin[0].mass)).toBe(bin.chance);
      const share = inBin.filter((s) => s.companion).length / inBin.length;
      const sigma = Math.sqrt(bin.chance * (1 - bin.chance) / inBin.length);
      expect(Math.abs(share - bin.chance)).toBeLessThan(4 * sigma);
    }
  });

  it("never makes a companion heavier than its primary", () => {
    for (const s of binaries) {
      const q = s.companion!.mass / s.mass;
      expect(q).toBeGreaterThanOrEqual(MASS_RATIO.min);
      expect(q).toBeLessThanOrEqual(MASS_RATIO.max);
    }
  });

  it("draws periods log-normally about 10^5.03 days, with separations from Kepler", () => {
    const logPeriods = binaries.map((s) => Math.log10(s.companion!.periodDays)).sort((a, b) => a - b);
    const median = logPeriods[Math.floor(logPeriods.length / 2)];
    // The median's standard error is about 1.25 σ / √n ≈ 0.04 dex here
    expect(Math.abs(median - LOG_PERIOD_DAYS.median)).toBeLessThan(0.2);
    for (const s of binaries) {
      const c = s.companion!;
      expect(c.separationAU).toBeCloseTo(separationFromPeriod(s.mass + c.mass, c.periodDays), 10);
    }
  });

  it("circularises close pairs and keeps wider ones below e = 0.8", () => {
    for (const s of binaries) {
      const c = s.companion!;
      if (c.periodDays < CIRCULAR_BELOW_DAYS) expect(c.eccentricity).toBe(0);
      expect(c.eccentricity).toBeGreaterThanOrEqual(0);
      expect(c.eccentricity).toBeLessThan(MAX_ECCENTRICITY);
    }
  });

  it("ages the companion with its primary, by the rules for any star", () => {
    for (const s of binaries) {
      const c = s.companion!;
      // Lighter or equal, so it lives at least as long and is never further along
      expect(c.lifespan).toBeGreaterThanOrEqual(s.lifespan);
      if (s.classification === "main-sequence") expect(["main-sequence", "protostar"]).toContain(c.classification);
      expect(c.luminosity).toBeGreaterThanOrEqual(0);
    }
  });

  it("is the same every time", () => {
    expect(starsOf(42).map((s) => s.companion)).toEqual(starsOf(42).map((s) => s.companion));
  });
});

describe("where planets can orbit (BS2)", () => {
  // μ = 0.3 and e = 0.5, at a separation of 10 AU; the values worked by hand from Holman & Wiegert's fits
  const companion: Companion = {
    mass: 0.3, periodDays: 10000, separationAU: 10, eccentricity: 0.5,
    lifespan: 200, temperature: 3400, luminosity: 0.01, classification: "main-sequence",
  };

  it("gives Holman & Wiegert's limits at reference values", () => {
    expect(sTypeLimitAU(0.7, companion)).toBeCloseTo(1.4505, 10);
    expect(pTypeLimitAU(0.7, companion)).toBeCloseTo(38.36125, 10);
    const circularTwin = { ...companion, mass: 1, eccentricity: 0 };
    expect(sTypeLimitAU(1, circularTwin)).toBeCloseTo(10 * (0.464 - 0.19), 10);
    expect(pTypeLimitAU(1, circularTwin)).toBeCloseTo(10 * (1.6 + 2.06 - 1.2725), 10);
  });

  it("allows orbits close to the star and far around both, never between", () => {
    expect(binaryOrbitOf(1, 0.7, companion)).toBe("around-primary");
    expect(binaryOrbitOf(10, 0.7, companion)).toBe("unstable");
    expect(binaryOrbitOf(40, 0.7, companion)).toBe("around-both");
  });

  const seed = 100000;
  const config = makeConfig(seed);
  const all = starsOf(seed);
  const systems = all.filter((s) => s.companion).slice(0, 250).map((star) => ({ star, system: generatePlanetsFor(star, seed, config) }));

  it("leaves no planet between the limits, and marks those around both stars", () => {
    let removed = 0;
    let aroundBoth = 0;
    for (const { star, system } of systems) {
      removed += system.unstable;
      for (const p of system.planets) {
        // Judged where the planet formed: a white dwarf's planets have since moved out (A3.3), and the
        // instability that can bring them is not modelled
        const where = binaryOrbitOf(orbitAUAt(p.orbitalRadius, config, star, 0), star.mass, star.companion!);
        expect(where).not.toBe("unstable");
        expect(p.orbitsBothStars === true).toBe(where === "around-both");
        if (p.orbitsBothStars) aroundBoth++;
      }
    }
    // The sample must exercise both outcomes
    expect(removed).toBeGreaterThan(0);
    expect(aroundBoth).toBeGreaterThan(0);
  });

  it("takes a removed planet's draws, so the others keep their orbits, masses and indices", () => {
    for (const { star, system } of systems) {
      const alone = generatePlanetsFor({ ...star, companion: null }, seed, config);
      expect(alone.unstable).toBe(0);
      // Every drawn planet is accounted for either way: kept, engulfed, too small, unstable or thrown out (RP1)
      const drawn = (s: typeof system) => s.planets.length + s.engulfed + s.tooSmall + s.unstable + s.ejected;
      expect(drawn(system)).toBe(drawn(alone));
      const byIndex = new Map(alone.planets.map((p) => [p.orbitalIndex, p]));
      for (const p of system.planets) {
        const twin = byIndex.get(p.orbitalIndex);
        // Without the companion, a neighbour it removed can throw this planet out instead (RP1)
        if (!twin) {
          expect(alone.ejected).toBeGreaterThan(0);
          continue;
        }
        expect([p.key, p.orbitalRadius, p.mass, p.size, p.resourceAbundance]).toEqual([twin.key, twin.orbitalRadius, twin.mass, twin.size, twin.resourceAbundance]);
      }
    }
  });

  it("leaves single stars' systems untouched", () => {
    for (const star of all.filter((s) => !s.companion).slice(0, 200)) {
      const system = generatePlanetsFor(star, seed, config);
      expect(system.unstable).toBe(0);
      expect(system.planets.some((p) => p.orbitsBothStars)).toBe(false);
    }
  });
});

describe("light from two stars (BS3)", () => {
  const sun: Star = {
    id: 1, position: [0, 0, 0], mass: 1, age: 4.6, lifespan: 10, temperature: 5772, luminosity: 1,
    classification: "main-sequence", isRare: false, metallicity: 0, companion: null,
  };
  const twin: Companion = {
    mass: 1, periodDays: 10, separationAU: 0.1, eccentricity: 0,
    lifespan: 10, temperature: 5772, luminosity: 1, classification: "main-sequence",
  };
  const earth = (overrides: Partial<Planet> = {}): Planet => ({
    id: 2, key: planetKey(1, 2), hostStarId: 1, orbitalRadius: 1, orbitalIndex: 2, type: "rocky", size: 1, mass: 1,
    temperature: 288, atmosphere: "moderate", formationAtmosphere: "moderate", resourceAbundance: 0.5, habitabilityScore: 0.8,
    isRare: false, surface: null, life: null, worldEvents: [], everLiquidWater: false, moons: [], ...overrides,
  });
  const earthPhysics: PlanetPhysics = {
    surfaceGravity: 1, escapeVelocityKms: 11.2, surfacePressureBar: 1, tidallyLocked: false, orbitalPeriodYears: 1,
    rotationPeriodHours: 24, axialTiltDeg: 23, snowLineAU: 2.3, waterInventory: 0.08,
  };
  const historyOf = (star: Star, world: Planet) =>
    runWorldHistory(world, earthPhysics, buildGeography(world, earthPhysics, 42), star, 42, undefined, { keepSnapshots: true });

  it("equals luminosityAt / a² exactly around a single star", () => {
    for (const star of stars.filter((s) => !s.companion).slice(0, 300)) {
      for (const t of [0, star.age / 2, star.age]) {
        expect(receivedLuminosityAt(star, 1.7, false, t)).toBe(luminosityAt(star, t));
        expect(irradianceAt(star, 1.7, false, t)).toBe(luminosityAt(star, t) / (1.7 * 1.7));
      }
      expect(xuvDose(star, 1.7, 0, star.age)).toBe(xuvFluence(star, 0, star.age) / (1.7 * 1.7 * EARTH_XUV_FLUENCE));
    }
  });

  it("adds the companion's orbit-averaged flux: L₂ / (a_b²√(1 − e²)) around the primary, L₂ / a² around both", () => {
    const star = { ...sun, companion: { ...twin, separationAU: 20, eccentricity: 0.6, luminosity: 0.5 } };
    const companion = companionAsStar(star)!;
    const l2 = luminosityAt(companion, 3);
    expect(irradianceAt(star, 1, false, 3)).toBeCloseTo(luminosityAt(sun, 3) + l2 / (400 * 0.8), 12);
    expect(irradianceAt(star, 50, true, 3)).toBeCloseTo((luminosityAt(sun, 3) + l2) / 2500, 12);
    expect(xuvDose(star, 1, 0, 3)).toBeGreaterThan(xuvDose(sun, 1, 0, 3));
  });

  it("warms a world around a pair of Suns with twice the light", () => {
    const pair = { ...sun, companion: twin };
    const single = historyOf(sun, earth());
    const both = historyOf(pair, earth({ orbitsBothStars: true }));
    expect(both.final.luminosity).toBeCloseTo(2 * single.final.luminosity, 12);
    expect(both.present.meanK).toBeGreaterThan(single.present.meanK);
  });

  it("records the companion leaving the main sequence, on its own clock", () => {
    // The primary is still on the main sequence; the companion's shorter life (by construction) has ended it
    const star: Star = { ...sun, age: 9, lifespan: 12, companion: { ...twin, separationAU: 30, lifespan: 10, classification: "red-giant", luminosity: 500, temperature: 4000 } };
    const h = historyOf(star, earth());
    expect(h.events.find((e) => e.kind === "companion-leaves-main-sequence")?.tGyr).toBe(mainSequenceEndGyr(companionAsStar(star)!));
    expect(h.events.some((e) => e.kind === "star-leaves-main-sequence")).toBe(false);
    expect(h.final.luminosity).toBeGreaterThan(luminosityAt(star, 9));
  });

  it("gives life each star's share of the light, and no companion around a single star", () => {
    const world = earth({ orbitsBothStars: true });
    const pair = { ...sun, companion: { ...twin, temperature: 3500, luminosity: 0.25 } };
    const snapshot = historyOf(pair, world).snapshots!.at(-1)!;
    const env = environmentFor(snapshot, environmentContext(world, earthPhysics, pair, makeConfig(42)));
    const own = luminosityAt(pair, snapshot.tGyr);
    const added = companionLuminosityAt(pair, 1, true, snapshot.tGyr);
    expect(env.companion!.temperatureK).toBe(3500);
    expect(env.companion!.lightShare).toBeCloseTo(added / (own + added), 12);
    const alone = historyOf(sun, earth()).snapshots!.at(-1)!;
    expect("companion" in environmentFor(alone, environmentContext(earth(), earthPhysics, sun, makeConfig(42)))).toBe(false);
  });

  it("lets a swollen companion engulf the worlds within its reach", () => {
    const config = makeConfig(100000);
    const host = starsOf(100000).find((s) => s.classification === "main-sequence" && s.mass > 0.8 && generatePlanetsFor({ ...s, companion: null }, 100000, config).planets.length >= 3)!;
    const close = { ...twin, mass: 0.9, separationAU: 0.05 };
    const dwarf = generatePlanetsFor({ ...host, companion: close }, 100000, config);
    const giantCompanion = { ...close, classification: "red-giant" as const, luminosity: 5000, temperature: 3000 };
    const swollen = generatePlanetsFor({ ...host, companion: giantCompanion }, 100000, config);
    const reachAU = stellarRadiusAU(companionAsStar({ ...host, companion: giantCompanion })!);
    expect(swollen.engulfed).toBeGreaterThan(dwarf.engulfed);
    for (const p of swollen.planets) expect(effectiveOrbitAU(p.orbitalRadius, config)).toBeGreaterThan(reachAU);
  });
});
