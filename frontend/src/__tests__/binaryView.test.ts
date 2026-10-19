import { describe, it, expect } from "vitest";
import { pairLight } from "../simulation/binary";
import type { Companion } from "../simulation/binary";
import { transitDilution, transitSpectrum } from "../simulation/spectrum";
import { noisePerBin } from "../simulation/observation";
import { planetKey } from "../simulation/planet";
import type { Planet, PlanetSurface } from "../simulation/planet";
import type { Star } from "../simulation/star";
import { formatCompanion } from "../ui/format";

// Galaxy Through Time BS4: two stars on screen and in the telescope's beam.

const sun: Star = {
  id: 1, position: [0, 0, 0], mass: 1, age: 4.6, lifespan: 10, temperature: 5772, luminosity: 1,
  classification: "main-sequence", isRare: false, metallicity: 0, companion: null,
};
const kDwarf: Companion = {
  mass: 0.62, periodDays: 100000, separationAU: 42, eccentricity: 0.31,
  lifespan: 33, temperature: 4600, luminosity: 0.25, classification: "main-sequence",
};
const earthSurface: PlanetSurface = {
  oceanFraction: 0.7, iceFraction: 0.03, landFraction: 0.27, habitableFraction: 0.8, liquidUnderIce: 0, surfaceGravity: 1, pressureBar: 1, o2Bar: 0.21,
  backgroundBar: 0.79, co2Bar: 4e-4, ch4Bar: 1.8e-6, ozone: 1, water: 0.5, steam: false,
};
const earth: Planet = {
  id: 2, key: planetKey(1, 2), hostStarId: 1, orbitalRadius: 1, orbitalIndex: 2, type: "rocky", size: 1, mass: 1,
  temperature: 288, atmosphere: "moderate", formationAtmosphere: "moderate", resourceAbundance: 0.5, habitabilityScore: 0.8,
  isRare: false, surface: earthSurface, life: null, worldEvents: [], everLiquidWater: false, moons: [],
};
const air = { mixingRatios: { N2: 0.78, O2: 0.21, H2O: 0.01 }, pressureBar: 1 };
const CLEAR = { cover: 0, topBar: 0.1 };

describe("a binary seen from afar", () => {
  it("is one point: the sum of the light, coloured by each star's share of it", () => {
    const seen = pairLight({ ...sun, companion: kDwarf });
    expect(seen.luminosity).toBeCloseTo(1.25, 12);
    expect(seen.temperature).toBeCloseTo((5772 + 0.25 * 4600) / 1.25, 9);
    expect(pairLight(sun)).toEqual({ temperature: 5772, luminosity: 1 });
  });

  it("names its companion in one line", () => {
    expect(formatCompanion(kDwarf)).toBe("K4 V, 0.62 M☉, 42 AU, e 0.31");
  });
});

describe("a transit in a binary", () => {
  const pair = { ...sun, companion: kDwarf };

  it("is diluted by the companion's light: L₁ / (L₁ + L₂)", () => {
    expect(transitDilution(sun)).toBe(1);
    expect(transitDilution(pair)).toBeCloseTo(0.8, 12);
    const single = transitSpectrum(earth, sun, air, CLEAR);
    const diluted = transitSpectrum(earth, pair, air, CLEAR);
    expect(diluted.baselinePpm).toBeCloseTo(single.baselinePpm * 0.8, 9);
    diluted.depthPpm.forEach((depth, k) => expect(depth).toBeCloseTo(single.depthPpm[k] * 0.8, 9));
  });

  it("gathers both stars' photons, so its noise is lower than the primary's alone", () => {
    for (const um of [0.5, 1, 5]) expect(noisePerBin(pair, 10, um)).toBeLessThan(noisePerBin(sun, 10, um));
    // A dark companion adds nothing
    const dark = { ...sun, companion: { ...kDwarf, temperature: 0, luminosity: 0, classification: "black-hole" as const } };
    expect(noisePerBin(dark, 10, 1)).toBe(noisePerBin(sun, 10, 1));
  });
});
