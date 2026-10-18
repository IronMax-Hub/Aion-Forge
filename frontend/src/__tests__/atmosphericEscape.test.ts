import { describe, it, expect } from "vitest";
import {
  airRetained, criticalDose, EARTH_OCEANS_LOST_PER_GYR, EARTH_XUV_FLUENCE, moistThresholdK, REFERENCE_SUN, WATER_LOST_PER_DOSE, waterLost,
  xuvDose,
} from "../simulation/atmosphericEscape";
import { boilingPointK, freezingKAt, WATER_TRIPLE_POINT } from "../simulation/climate";
import {
  generateStarsFor, GIANT_LUMINOSITY_FACTOR, luminosityAt, mainSequenceEndGyr, MASS_LUMINOSITY_EXPONENT, pastGiantRadiusAU,
  remnantFromGyr, temperatureAt, PAST_GIANT_TEMPERATURE_K, UNIVERSE_AGE_GYR, xuvLuminosityAt,
} from "../simulation/star";
import type { Star } from "../simulation/star";
import { makeConfig } from "../simulation/config";
import { buildGalaxyConfig } from "../simulation/galaxy";
import { effectiveOrbitAU, generatePlanetsFor, solidWorldOf } from "../simulation/planet";
import { WATER_INSIDE_SNOW_LINE } from "../simulation/planetPhysics";
import { runWorldHistory } from "../simulation/worldHistory";
import { buildGeography } from "../simulation/geography";

const keeps = (escapeVelocityKms: number, orbitAU: number) =>
  airRetained(xuvDose(REFERENCE_SUN, orbitAU, 0, REFERENCE_SUN.age), escapeVelocityKms);

describe("air escape: the cosmic shoreline", () => {
  it("reproduces the plan's reference table around a Sun-like star at 4.6 Gyr", () => {
    expect(keeps(11.2, 1)).toBeCloseTo(0.99, 2);     // Earth
    expect(keeps(10.4, 0.72)).toBeCloseTo(0.93, 2);  // Venus
    expect(keeps(2.64, 9.5)).toBeCloseTo(0.87, 2);   // Titan-like, as a planet
    expect(keeps(2.7, 5.2)).toBeLessThan(0.05);      // Ganymede-like
    expect(keeps(5.0, 1.52)).toBe(0);                // Mars
    expect(keeps(4.3, 0.39)).toBe(0);                // Mercury
    expect(keeps(2.4, 1)).toBe(0);                   // Moon-like
  });

  it("strips more with more dose and less with more gravity, and the dose adds up over any division", () => {
    let previous = 1;
    for (let dose = 0; dose <= 20; dose += 0.5) {
      const r = airRetained(dose, 11.2);
      expect(r).toBeLessThanOrEqual(previous);
      previous = r;
    }
    expect(airRetained(5, 15)).toBeGreaterThan(airRetained(5, 11.2));
    expect(criticalDose(11.2)).toBe(10);
    const whole = xuvDose(REFERENCE_SUN, 1, 0, 4.6);
    expect(whole).toBeCloseTo(1, 12);   // one Earth dose by definition
    let parts = 0;
    for (let i = 0; i < 46; i++) parts += xuvDose(REFERENCE_SUN, 1, i * 0.1, (i + 1) * 0.1);
    expect(parts).toBeCloseTo(whole, 10);
  });
});

describe("water escape (decision 40)", () => {
  it("is calibrated so a fully moist Earth loses 0.29 oceans per Gyr to today's Sun", () => {
    // Earth's dose over 1 Gyr at today's rate, in Earth doses
    const doseRate = xuvLuminosityAt(REFERENCE_SUN, REFERENCE_SUN.age) / EARTH_XUV_FLUENCE;
    const lostPerGyr = waterLost(1, doseRate, 1, 11.2, 340 + 25, 1);
    expect(lostPerGyr / WATER_INSIDE_SNOW_LINE.median).toBeCloseTo(EARTH_OCEANS_LOST_PER_GYR, 2);
    expect(WATER_LOST_PER_DOSE).toBeGreaterThan(0);
  });

  it("starts at a threshold that falls with thinner background air, and ramps over 20 K", () => {
    expect(moistThresholdK(1)).toBe(340);
    expect(moistThresholdK(10)).toBe(340);
    expect(moistThresholdK(0.1)).toBeCloseTo(297.5, 9);
    expect(moistThresholdK(0.01)).toBe(255);
    expect(moistThresholdK(0.0001)).toBe(255);
    expect(waterLost(1, 1, 1, 11.2, 339, 1)).toBe(0);
    expect(waterLost(1, 1, 1, 11.2, 350, 1)).toBeCloseTo(waterLost(1, 1, 1, 11.2, 360, 1) / 2, 12);
    expect(waterLost(1, 1, 1, 11.2, 400, 1)).toBe(waterLost(1, 1, 1, 11.2, 360, 1));
  });

  it("removes an amount, never more than there is, and less on heavier worlds", () => {
    expect(waterLost(1e-6, 100, 1, 2, 400, 1)).toBe(1e-6);
    expect(waterLost(1, 1, 1, 15, 400, 1)).toBeLessThan(waterLost(1, 1, 1, 11.2, 400, 1));
    // The amount does not depend on how much water remains (while it lasts)
    expect(waterLost(1, 0.1, 1, 11.2, 400, 1)).toBe(waterLost(0.5, 0.1, 1, 11.2, 400, 1));
  });
});

describe("water's triple point (decision 27)", () => {
  it("boils along a curve through the triple point below 1 atm, unchanged above", () => {
    expect(boilingPointK(WATER_TRIPLE_POINT.bar)).toBeCloseTo(WATER_TRIPLE_POINT.K, 0);
    expect(boilingPointK(1.01325)).toBeCloseTo(373.15, 9);
    expect(Math.abs(boilingPointK(1.01325 * (1 - 1e-9)) - boilingPointK(1.01325 * (1 + 1e-9)))).toBeLessThan(1e-4);
    expect(boilingPointK(0.001)).toBe(WATER_TRIPLE_POINT.K);
  });

  it("holds no liquid water below the triple point's pressure", () => {
    expect(freezingKAt(0.001)).toBe(Infinity);
    expect(freezingKAt(1)).toBe(263);
  });
});

describe("the past giant phase of today's remnants (decision 44)", () => {
  const config = makeConfig(100000);
  const stars = generateStarsFor(buildGalaxyConfig(100000, config), UNIVERSE_AGE_GYR, config).stars;
  const whiteDwarfs = stars.filter((s) => s.classification === "white-dwarf");

  it("shines as a giant from the main sequence's end until it became a remnant", () => {
    expect(whiteDwarfs.length).toBeGreaterThan(5);
    for (const star of whiteDwarfs) {
      const msEnd = mainSequenceEndGyr(star);
      const middle = (msEnd + remnantFromGyr(star)) / 2;
      expect(luminosityAt(star, middle)).toBeCloseTo(Math.pow(star.mass, MASS_LUMINOSITY_EXPONENT) * GIANT_LUMINOSITY_FACTOR, 6);
      expect(temperatureAt(star, middle)).toBe(PAST_GIANT_TEMPERATURE_K);
      expect(luminosityAt(star, star.age)).toBe(star.luminosity);
    }
  });

  it("engulfed the planets inside the giant it was", () => {
    for (const star of whiteDwarfs) {
      const radius = pastGiantRadiusAU(star);
      expect(radius).toBeGreaterThan(0);
      for (const planet of generatePlanetsFor(star, 100000, config).planets) {
        expect(effectiveOrbitAU(planet.orbitalRadius, config)).toBeGreaterThan(radius);
      }
    }
    const mainSequence = stars.find((s) => s.classification === "main-sequence")!;
    expect(pastGiantRadiusAU(mainSequence)).toBe(0);
  });
});

describe("escape in world histories", () => {
  const seed = 42;
  const config = makeConfig(seed);
  const stars = generateStarsFor(buildGalaxyConfig(seed, config), UNIVERSE_AGE_GYR, config).stars.slice(0, 60);
  const worlds = stars.flatMap((star: Star) => generatePlanetsFor(star, seed, config).planets
    .filter((p) => p.surface)
    .map((planet) => ({ planet, star, world: solidWorldOf(planet, star, seed, config) })));

  it("never gives air back over a history", () => {
    for (const { planet, star, world } of worlds.slice(0, 40)) {
      const h = runWorldHistory(planet, world.physics, buildGeography(planet, world.physics, seed), star, seed, config, { keepSnapshots: true });
      let previous = 1;
      for (const s of h.snapshots!) {
        expect(s.airRetained).toBeLessThanOrEqual(previous);
        previous = s.airRetained;
      }
      expect(h.final.airRetained).toBe(world.history.final.airRetained);   // deterministic
    }
  });

  it("thins every gas with the background", () => {
    for (const { world, planet } of worlds) {
      const r = world.history.final.airRetained;
      expect(r).toBeGreaterThanOrEqual(0);
      expect(r).toBeLessThanOrEqual(1);
      expect(world.history.final.backgroundBar).toBeCloseTo(world.physics.surfacePressureBar * r, 12);
      expect(planet.surface!.backgroundBar).toBe(world.history.final.backgroundBar);
      if (r === 0) {
        expect(world.history.final.co2Bar + world.history.final.o2Bar + world.history.final.ch4Bar).toBe(0);
        if (world.physics.surfacePressureBar > 0 && world.history.steps > 0) {
          expect(world.history.events.some((e) => e.kind === "air-lost")).toBe(true);
        }
      }
    }
  });

  it("records the air lost at most once, after the history begins", () => {
    for (const { world } of worlds) {
      const lost = world.history.events.filter((e) => e.kind === "air-lost");
      expect(lost.length).toBeLessThanOrEqual(1);
    }
    expect(worlds.some(({ world }) => world.history.events.some((e) => e.kind === "air-lost"))).toBe(true);
    expect(worlds.some(({ world }) => world.history.final.airRetained > 0.9)).toBe(true);
  });
});
