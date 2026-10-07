import { describe, it, expect } from "vitest";
import {
  bandGeometry, boilingPointK, contrastK, equilibriumTemperatureK, greenhouseK, relativeInsolation,
  solveBands, solvePresentClimate, CO2_REFERENCE_BAR, FREEZING_K,
} from "../simulation/climate";
import type { ClimateInputs } from "../simulation/climate";
import { buildGeography, surfaceGrid, BAND_COUNT } from "../simulation/geography";
import { planetKey } from "../simulation/planet";
import type { Planet } from "../simulation/planet";
import type { PlanetPhysics } from "../simulation/planetPhysics";

const earthAir: ClimateInputs = { luminosity: 1, orbitAU: 1, pressureBar: 1, co2Bar: CO2_REFERENCE_BAR, ch4Bar: 0, wetness: 1 };
const sum = (values: ArrayLike<number>) => Array.from(values).reduce((a, b) => a + b, 0);
const weightedMean = (values: ArrayLike<number>, weights: ArrayLike<number>) =>
  Array.from(values).reduce((total, v, i) => total + v * weights[i], 0);

describe("energy balance building blocks", () => {
  it("gives Earth 255 K without air and 33 K of greenhouse warming", () => {
    expect(equilibriumTemperatureK(1, 1, 0.3)).toBeCloseTo(254.3, 1);
    expect(greenhouseK(1, CO2_REFERENCE_BAR, 0, 1)).toBeCloseTo(33, 6);
  });

  it("warms a wet planet by 3 K per doubling of CO₂, and a dry one by half that", () => {
    expect(greenhouseK(1, 2 * CO2_REFERENCE_BAR, 0, 1) - greenhouseK(1, CO2_REFERENCE_BAR, 0, 1)).toBeCloseTo(3, 9);
    expect(greenhouseK(1, 2 * CO2_REFERENCE_BAR, 0, 0) - greenhouseK(1, CO2_REFERENCE_BAR, 0, 0)).toBeCloseTo(1.5, 9);
  });

  it("warms more under thicker air and never cools", () => {
    expect(greenhouseK(5, CO2_REFERENCE_BAR, 0, 1)).toBeGreaterThan(greenhouseK(1, CO2_REFERENCE_BAR, 0, 1));
    expect(greenhouseK(0.006, 0, 0, 0)).toBe(0);
  });

  it("evens out temperature contrasts under thicker air", () => {
    expect(contrastK(0.006)).toBeGreaterThan(contrastK(1));
    expect(contrastK(1)).toBeGreaterThan(contrastK(90));
    expect(contrastK(90)).toBeLessThan(1);
  });

  it("boils water at 373 K at one atmosphere, lower in thin air and higher under thick air", () => {
    expect(boilingPointK(1.01325)).toBeCloseTo(373.15, 9);
    expect(boilingPointK(0.006)).toBeGreaterThan(260);
    expect(boilingPointK(0.006)).toBeLessThan(280);
    expect(boilingPointK(90)).toBeGreaterThan(500);
    expect(boilingPointK(1e4)).toBe(647);
  });
});

describe("insolation and bands", () => {
  it("gives 18 bands that cover the sphere with a mean insolation of 1", () => {
    for (const [tilt, locked] of [[0, false], [23, false], [60, false], [90, false], [0, true]] as const) {
      const geometry = bandGeometry(tilt, locked);
      expect(sum(geometry.areas)).toBeCloseTo(1, 12);
      expect(weightedMean(geometry.insolation, geometry.areas)).toBeCloseTo(1, 12);
    }
  });

  it("leaves the poles of an upright planet cold, and warms them on a planet lying on its side", () => {
    expect(relativeInsolation(1, 0, false)).toBeLessThan(relativeInsolation(0, 0, false));
    expect(relativeInsolation(1, 90, false)).toBeGreaterThan(relativeInsolation(0, 90, false));
  });

  it("lights only the day side of a locked planet, most at the substellar point", () => {
    const geometry = bandGeometry(0, true);
    expect(geometry.insolation[0]).toBe(Math.max(...geometry.insolation));
    expect(geometry.insolation[BAND_COUNT - 1]).toBe(0);
  });
});

describe("band climate", () => {
  const geometry = bandGeometry(23, false);
  const ocean = new Float64Array(BAND_COUNT).fill(0.7);

  it("gives Earth an Earth-like climate from an ice-free start", () => {
    const climate = solveBands(geometry, ocean, earthAir, new Uint8Array(BAND_COUNT));
    expect(climate.meanK).toBeGreaterThan(283);
    expect(climate.meanK).toBeLessThan(293);
    expect(climate.bandK[9]).toBeGreaterThan(climate.bandK[0]);   // equator warmer than pole
    expect(climate.iceFraction + climate.openOceanFraction + climate.openLandFraction).toBeCloseTo(1, 12);
  });

  it("has two stable states for some star and air: a warm start stays open, a frozen start stays frozen", () => {
    const hysteresis = [0.8, 0.85, 0.9, 0.95, 1].some((luminosity) => {
      const inputs = { ...earthAir, luminosity };
      const warm = solveBands(geometry, ocean, inputs, new Uint8Array(BAND_COUNT));
      const frozen = solveBands(geometry, ocean, inputs, new Uint8Array(BAND_COUNT).fill(1));
      return frozen.iceFraction > 0.9 && warm.iceFraction < 0.5;
    });
    expect(hysteresis).toBe(true);
  });

  it("does not freeze a planet that has no water", () => {
    const dry = solveBands(geometry, new Float64Array(BAND_COUNT), { ...earthAir, luminosity: 0.2, wetness: 0 }, new Uint8Array(BAND_COUNT));
    expect(dry.meanK).toBeLessThan(FREEZING_K);
    expect(dry.iceFraction).toBe(0);
  });
});

describe("present-day climate on all cells", () => {
  const planet: Planet = {
    id: 2, key: planetKey(1, 2), hostStarId: 1, orbitalRadius: 1, orbitalIndex: 2, type: "rocky", size: 1, mass: 1,
    temperature: 288, atmosphere: "moderate", formationAtmosphere: "moderate", resourceAbundance: 0.5, habitabilityScore: 0.8, isRare: false, surface: null, life: null, worldEvents: [], everLiquidWater: false,
  };
  const physics: PlanetPhysics = {
    surfaceGravity: 1, escapeVelocityKms: 11.2, surfacePressureBar: 1, tidallyLocked: false, orbitalPeriodYears: 1,
    rotationPeriodHours: 24, axialTiltDeg: 23, snowLineAU: 2.3, waterInventory: 0.08,
  };
  const geography = buildGeography(planet, physics, 42);
  const grid = surfaceGrid();
  const solve = (inputs: ClimateInputs, tilt: number, locked: boolean) =>
    solvePresentClimate(geography, inputs, geography.seaLevelKm, false, tilt, locked, new Uint8Array(BAND_COUNT));

  it("splits the surface into open water, ice and land, and keeps the geography's coastline when warm", () => {
    const present = solve(earthAir, 23, false);
    expect(present.oceanFraction + present.iceFraction + present.landFraction).toBeCloseTo(1, 12);
    expect(present.oceanFraction + present.iceFraction).toBeGreaterThanOrEqual(geography.oceanFraction - 1e-12);   // every sea cell is open or frozen
    expect(present.minK).toBeLessThan(present.meanK);
    expect(present.maxK).toBeGreaterThan(present.meanK);
    expect(present.habitableFraction).toBeGreaterThan(0.5);
    expect(present.temperateRingDeg).toBeNull();
  });

  it("gives an upright planet cold poles", () => {
    const present = solve(earthAir, 0, false);
    const polar = present.cellTemperatureK.filter((_, i) => Math.abs(grid.axisCos[i]) > 0.95);
    const equatorial = present.cellTemperatureK.filter((_, i) => Math.abs(grid.axisCos[i]) < 0.1);
    expect(Math.max(...polar)).toBeLessThan(Math.min(...equatorial));
  });

  it("makes the substellar point the warmest cell of a locked planet", () => {
    const present = solve(earthAir, 0, true);
    let warmest = 0;
    present.cellTemperatureK.forEach((t, i) => { if (t > present.cellTemperatureK[warmest]) warmest = i; });
    expect(grid.axisCos[warmest]).toBe(Math.max(...grid.axisCos));
  });

  it("keeps a narrow temperate ring on a locked planet under thin air, and a wider one under thick air", () => {
    const thin = solve({ ...earthAir, luminosity: 0.6, pressureBar: 0.1 }, 0, true);
    const thick = solve({ ...earthAir, luminosity: 0.6, pressureBar: 3 }, 0, true);
    expect(thin.temperateRingDeg).not.toBeNull();
    expect(thick.temperateRingDeg!).toBeGreaterThan(thin.temperateRingDeg!);
  });

  it("keeps moisture between 0 and 1", () => {
    const present = solve(earthAir, 23, false);
    for (let i = 0; i < present.cellMoisture.length; i++) {
      expect(present.cellMoisture[i]).toBeGreaterThanOrEqual(0);
      expect(present.cellMoisture[i]).toBeLessThanOrEqual(1);
    }
  });
});
