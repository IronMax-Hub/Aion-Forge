import { describe, it, expect } from "vitest";
import { observeTransits, noisePerBin, MAX_TRANSITS, REFERENCE_NOISE_PPM } from "../simulation/observation";
import { transitSpectrum, SPECTRUM_WAVELENGTHS_UM } from "../simulation/spectrum";
import type { Spectrum } from "../simulation/spectrum";
import { atmosphereComposition } from "../simulation/atmosphereComposition";
import { generatePlanetsFor, planetKey } from "../simulation/planet";
import type { Planet, PlanetSurface } from "../simulation/planet";
import { generateStarsFor, UNIVERSE_AGE_GYR } from "../simulation/star";
import type { Star } from "../simulation/star";
import { buildGalaxyConfig } from "../simulation/galaxy";
import { makeConfig } from "../simulation/config";

// Worlds Up Close B3: observation time and noise.

const seed = 42;
const sun: Star = {
  id: 1, position: [0, 0, 0], mass: 1, age: 4.6, lifespan: 10, temperature: 5772, luminosity: 1,
  classification: "main-sequence", isRare: false,
};
const redDwarf: Star = { ...sun, temperature: 3000, luminosity: 0.005 };
const earthSurface: PlanetSurface = {
  oceanFraction: 0.7, iceFraction: 0.03, landFraction: 0.27, habitableFraction: 0.8, surfaceGravity: 1, pressureBar: 1, o2Bar: 0.21,
  backgroundBar: 0.79, co2Bar: 4e-4, ch4Bar: 1.8e-6, ozone: 1, water: 0.5, steam: false,
};
const earth: Planet = {
  id: 2, key: planetKey(1, 2), hostStarId: 1, orbitalRadius: 1, orbitalIndex: 2, type: "rocky", size: 1, mass: 1,
  temperature: 288, atmosphere: "moderate", formationAtmosphere: "moderate", resourceAbundance: 0.5, habitabilityScore: 0.8,
  isRare: false, surface: earthSurface, life: null, worldEvents: [], everLiquidWater: false,
};
const binOf = (um: number) => SPECTRUM_WAVELENGTHS_UM.findIndex((w) => w >= um);
const spectrumOf = (planet: Planet, star: Star) => transitSpectrum(planet, star, atmosphereComposition(planet, null));
const earthSpectrum = spectrumOf(earth, sun);

/** Signal-to-noise of the air's features against a bare planet, after n transits. */
function atmosphereSnr(spectrum: Spectrum, star: Star, transits: number): number {
  let chi2 = 0;
  spectrum.depthPpm.forEach((depth, k) => {
    const sigma = noisePerBin(star, transits, spectrum.wavelengthUm[k]);
    chi2 += ((depth - spectrum.baselinePpm) / sigma) ** 2;
  });
  return Math.sqrt(chi2);
}

describe("the same observation", () => {
  it("always shows the same data", () => {
    expect(observeTransits(earthSpectrum, earth, sun, seed, 12)).toEqual(observeTransits(earthSpectrum, earth, sun, seed, 12));
  });

  it("adds transits to a shorter observation: n + 1 transits are the first n and one more", () => {
    // n · (data_n − model) / one transit's noise is the sum of the first n transits' draws;
    // consecutive sums differ by one standard-normal draw only if the transits are shared
    const k = binOf(1.5);
    const sums: number[] = [];
    for (let n = 1; n <= 60; n++) {
      const o = observeTransits(earthSpectrum, earth, sun, seed, n);
      const sigmaOne = o.uncertaintyPpm[k] * Math.sqrt(n);
      sums.push((n * (o.depthPpm[k] - earthSpectrum.depthPpm[k])) / sigmaOne);
    }
    const steps = sums.slice(1).map((sum, i) => sum - sums[i]);
    const sd = Math.sqrt(steps.reduce((a, b) => a + b * b, 0) / steps.length);
    expect(sd).toBeGreaterThan(0.7);
    expect(sd).toBeLessThan(1.3);
  });

  it("is a new look with another number of transits, another planet or another universe", () => {
    const base = observeTransits(earthSpectrum, earth, sun, seed, 12).depthPpm;
    expect(observeTransits(earthSpectrum, earth, sun, seed, 13).depthPpm).not.toEqual(base);
    expect(observeTransits(earthSpectrum, { ...earth, id: 3 }, sun, seed, 12).depthPpm).not.toEqual(base);
    expect(observeTransits(earthSpectrum, earth, sun, seed + 1, 12).depthPpm).not.toEqual(base);
  });

  it("takes 1 to 200 whole transits", () => {
    for (const bad of [0, MAX_TRANSITS + 1, 1.5, NaN]) expect(() => observeTransits(earthSpectrum, earth, sun, seed, bad)).toThrow(RangeError);
    expect(observeTransits(earthSpectrum, earth, sun, seed, MAX_TRANSITS).transits).toBe(MAX_TRANSITS);
  });
});

describe("noise", () => {
  it("is the reference noise for one transit of a Sun-like star at 1 µm", () => {
    expect(noisePerBin(sun, 1, 1)).toBeCloseTo(REFERENCE_NOISE_PPM, 9);
  });

  it("falls as the square root of the number of transits", () => {
    const one = observeTransits(earthSpectrum, earth, sun, seed, 1).uncertaintyPpm;
    const hundred = observeTransits(earthSpectrum, earth, sun, seed, 100).uncertaintyPpm;
    one.forEach((sigma, k) => expect(sigma / hundred[k]).toBeCloseTo(10, 9));
  });

  it("scatters the data around the model by its stated size", () => {
    const o = observeTransits(earthSpectrum, earth, sun, seed, 5);
    const pulls = o.depthPpm.map((d, k) => (d - earthSpectrum.depthPpm[k]) / o.uncertaintyPpm[k]);
    const mean = pulls.reduce((a, b) => a + b, 0) / pulls.length;
    const sd = Math.sqrt(pulls.reduce((a, b) => a + (b - mean) ** 2, 0) / pulls.length);
    expect(Math.abs(mean)).toBeLessThan(0.15);
    expect(sd).toBeGreaterThan(0.9);
    expect(sd).toBeLessThan(1.1);
  });

  it("is larger for a dimmer star, as 1/√L", () => {
    const dim = { ...sun, luminosity: 0.25 };
    expect(noisePerBin(dim, 1, 1) / noisePerBin(sun, 1, 1)).toBeCloseTo(2, 9);
  });

  it("follows the star's light: a red dwarf is noisiest in the blue, a hot star in the infrared", () => {
    const hot = { ...sun, temperature: 10000, luminosity: 30 };
    const blueOverRed = (star: Star) => noisePerBin(star, 1, 0.4) / noisePerBin(star, 1, 2);
    expect(blueOverRed(redDwarf)).toBeGreaterThan(blueOverRed(sun) * 5);
    expect(blueOverRed(hot)).toBeLessThan(blueOverRed(sun));
  });
});

describe("patience", () => {
  it("lets an Earth twin around the Sun emerge only from a long observation", () => {
    expect(atmosphereSnr(earthSpectrum, sun, 1)).toBeLessThan(3);
    expect(atmosphereSnr(earthSpectrum, sun, MAX_TRANSITS)).toBeGreaterThan(5);
  });

  it("asks far more transits of a dim star for the same signal", () => {
    const dim = { ...sun, luminosity: 0.01 };
    // The same spectrum seen against a star 100 times fainter takes 100 times the transits
    expect(atmosphereSnr(earthSpectrum, dim, 100)).toBeCloseTo(atmosphereSnr(earthSpectrum, sun, 1), 9);
  });

  it("asks more transits of a smaller planet with the same gravity", () => {
    const small = { ...earth, size: 0.5, mass: 0.25 };
    expect(atmosphereSnr(spectrumOf(small, sun), sun, 50)).toBeLessThan(atmosphereSnr(earthSpectrum, sun, 50) * 0.6);
  });

  it("but not of a smaller planet of the same density: its weaker gravity makes its air taller in proportion", () => {
    // Signal ∝ R_p · H ∝ R_p / g, and g ∝ R_p at fixed density (a kept surprise)
    const small = { ...earth, size: 0.5, mass: 0.125, surface: { ...earthSurface, surfaceGravity: 0.5 } };
    const ratio = atmosphereSnr(spectrumOf(small, sun), sun, 50) / atmosphereSnr(earthSpectrum, sun, 50);
    expect(ratio).toBeGreaterThan(0.8);
    expect(ratio).toBeLessThan(1.25);
  });
});

describe("every planet", () => {
  it("gives finite data and uncertainties around every star", () => {
    const config = makeConfig(seed);
    const stars = generateStarsFor(buildGalaxyConfig(seed, config), UNIVERSE_AGE_GYR, config).stars.slice(0, 60);
    let count = 0;
    for (const star of stars) for (const planet of generatePlanetsFor(star, seed, config).planets) {
      const o = observeTransits(spectrumOf(planet, star), planet, star, seed, 7);
      for (let k = 0; k < o.depthPpm.length; k++) {
        expect(Number.isFinite(o.depthPpm[k])).toBe(true);
        expect(o.uncertaintyPpm[k]).toBeGreaterThan(0);
        expect(Number.isFinite(o.uncertaintyPpm[k])).toBe(true);
      }
      count++;
    }
    expect(count).toBeGreaterThan(100);
  });
});
