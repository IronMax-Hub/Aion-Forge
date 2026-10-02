import { describe, it, expect } from "vitest";
import {
  transitSpectrum, meanMolarMass, BANDS, SPECTRUM_BINS, SPECTRUM_MIN_UM, SPECTRUM_MAX_UM, SPECTRUM_WAVELENGTHS_UM,
} from "../simulation/spectrum";
import type { Spectrum } from "../simulation/spectrum";
import { atmosphereComposition } from "../simulation/atmosphereComposition";
import type { AtmosphereComposition, Gas } from "../simulation/atmosphereComposition";
import { cloudDeckOf, overcastShare } from "../simulation/clouds";
import { generatePlanetsFor, planetKey } from "../simulation/planet";
import type { Planet, PlanetSurface } from "../simulation/planet";
import { generateStarsFor, UNIVERSE_AGE_GYR } from "../simulation/star";
import type { Star } from "../simulation/star";
import { buildGalaxyConfig } from "../simulation/galaxy";
import { makeConfig } from "../simulation/config";

// Worlds Up Close B2: the transit spectrum, from composition, temperature and gravity.

const sun: Star = {
  id: 1, position: [0, 0, 0], mass: 1, age: 4.6, lifespan: 10, temperature: 5772, luminosity: 1,
  classification: "main-sequence", isRare: false,
};
const earthSurface: PlanetSurface = {
  oceanFraction: 0.7, iceFraction: 0.03, landFraction: 0.27, habitableFraction: 0.8, surfaceGravity: 1, pressureBar: 1, o2Bar: 0.21,
  backgroundBar: 0.79, co2Bar: 4e-4, ch4Bar: 1.8e-6, ozone: 1, water: 0.5, steam: false,
};
const earth: Planet = {
  id: 2, key: planetKey(1, 2), hostStarId: 1, orbitalRadius: 1, orbitalIndex: 2, type: "rocky", size: 1, mass: 1,
  temperature: 288, atmosphere: "moderate", formationAtmosphere: "moderate", resourceAbundance: 0.5, habitabilityScore: 0.8,
  isRare: false, surface: earthSurface, life: null, worldEvents: [],
};
const CLEAR = { cover: 0, topBar: 0.1 };
const OVERCAST = { cover: 1, topBar: 0.1 };
const binIndex = (um: number) => SPECTRUM_WAVELENGTHS_UM.findIndex((w) => w >= um);
const amplitude = (s: Spectrum) => Math.max(...s.depthPpm) - Math.min(...s.depthPpm);
/** A test air: nitrogen with one other gas, at 1 bar. */
const airWith = (gas: Gas, x: number): AtmosphereComposition => ({ mixingRatios: { N2: 1 - x, [gas]: x }, pressureBar: 1 });

describe("the grid", () => {
  it("has 600 log-spaced bins from 0.3 to 20 µm", () => {
    expect(SPECTRUM_WAVELENGTHS_UM.length).toBe(SPECTRUM_BINS);
    expect(SPECTRUM_WAVELENGTHS_UM[0]).toBeGreaterThan(SPECTRUM_MIN_UM);
    expect(SPECTRUM_WAVELENGTHS_UM.at(-1)).toBeLessThan(SPECTRUM_MAX_UM);
    const ratio = SPECTRUM_WAVELENGTHS_UM[1] / SPECTRUM_WAVELENGTHS_UM[0];
    for (let k = 1; k < SPECTRUM_BINS; k++) expect(SPECTRUM_WAVELENGTHS_UM[k] / SPECTRUM_WAVELENGTHS_UM[k - 1]).toBeCloseTo(ratio, 12);
  });
});

describe("band positions", () => {
  const onGrid = BANDS.filter((band) => band.centreUm > SPECTRUM_MIN_UM);

  it("puts each band's peak at its centre", () => {
    for (const band of onGrid) {
      const s = transitSpectrum(earth, sun, airWith(band.gas, 1e-3), CLEAR);
      const lo = binIndex(band.centreUm * 0.97);
      const hi = binIndex(band.centreUm * 1.03);
      let peak = lo;
      for (let k = lo; k <= hi; k++) if (s.depthPpm[k] > s.depthPpm[peak]) peak = k;
      const ratio = SPECTRUM_WAVELENGTHS_UM[1] / SPECTRUM_WAVELENGTHS_UM[0];
      expect(Math.abs(Math.log(SPECTRUM_WAVELENGTHS_UM[peak] / band.centreUm))).toBeLessThan(Math.log(ratio) * 1.01);
    }
  });

  it("shows a band only when its gas is present", () => {
    const nitrogen = transitSpectrum(earth, sun, { mixingRatios: { N2: 1 }, pressureBar: 1 }, CLEAR);
    // Pure nitrogen: Rayleigh scattering only, falling with wavelength until the air turns transparent
    for (let k = 1; k < SPECTRUM_BINS; k++) expect(nitrogen.depthPpm[k]).toBeLessThanOrEqual(nitrogen.depthPpm[k - 1]);
    for (const band of onGrid) {
      const k = binIndex(band.centreUm);
      expect(transitSpectrum(earth, sun, airWith(band.gas, 1e-3), CLEAR).depthPpm[k]).toBeGreaterThan(nitrogen.depthPpm[k]);
    }
  });

  it("finds Earth's bands in Earth's air", () => {
    const s = transitSpectrum(earth, sun, atmosphereComposition(earth, null), CLEAR);
    const above = (band: number, continuum: number) => expect(s.depthPpm[binIndex(band)]).toBeGreaterThan(s.depthPpm[binIndex(continuum)]);
    above(0.76, 0.8);    // O₂
    above(1.4, 1.25);    // H₂O
    above(4.3, 4.0);     // CO₂
    above(9.6, 11);      // O₃
    above(15, 12);       // CO₂
  });
});

describe("depth", () => {
  it("is (R_p / R★)² at the reference level: 84 ppm for Earth and the Sun, with a few ppm of air above it", () => {
    const s = transitSpectrum(earth, sun, atmosphereComposition(earth, null));
    expect(s.baselinePpm).toBeCloseTo(83.8, 0);
    expect(s.scaleHeightKm).toBeGreaterThan(8);
    expect(s.scaleHeightKm).toBeLessThan(9);
    for (const d of s.depthPpm) {
      expect(d).toBeGreaterThanOrEqual(s.baselinePpm);
      expect(d).toBeLessThan(s.baselinePpm + 10);
    }
  });

  it("gives a lower-gravity world deeper features, in proportion to its scale height", () => {
    const air = atmosphereComposition(earth, null);
    const light = { ...earth, surface: { ...earthSurface, surfaceGravity: 0.5 } };
    const ratio = amplitude(transitSpectrum(light, sun, air, CLEAR)) / amplitude(transitSpectrum(earth, sun, air, CLEAR));
    expect(ratio).toBeGreaterThan(1.8);
    expect(ratio).toBeLessThan(2.4);
  });

  it("gives heavier air shallower features", () => {
    expect(meanMolarMass(atmosphereComposition(earth, null))).toBeCloseTo(28.8, 0);
    const co2World = transitSpectrum(earth, sun, airWith("CO2", 0.96), CLEAR);
    expect(co2World.scaleHeightKm).toBeLessThan(transitSpectrum(earth, sun, airWith("CO2", 1e-3), CLEAR).scaleHeightKm * 0.7);
  });

  it("is deeper around a smaller star", () => {
    const dwarf: Star = { ...sun, temperature: 3000, luminosity: 0.005 };   // ~0.26 R☉
    const air = atmosphereComposition(earth, null);
    expect(transitSpectrum(earth, dwarf, air).baselinePpm).toBeGreaterThan(transitSpectrum(earth, sun, air).baselinePpm * 10);
  });
});

describe("clouds", () => {
  it("flatten the spectrum below their tops", () => {
    const air = atmosphereComposition(earth, null);
    const clear = transitSpectrum(earth, sun, air, CLEAR);
    const overcast = transitSpectrum(earth, sun, air, OVERCAST);
    expect(amplitude(overcast)).toBeLessThan(amplitude(clear));
    expect(Math.min(...overcast.depthPpm)).toBeGreaterThan(Math.min(...clear.depthPpm));
    // Under full cover nothing shows below the deck: H · ln(1 bar / 0.1 bar) above the ground
    const deck = ((earth.size * 6.371e6 + overcast.scaleHeightKm * 1000 * Math.log(10)) / (0.00465047 * 1.495978707e11)) ** 2 * 1e6;
    for (const d of overcast.depthPpm) expect(d).toBeGreaterThanOrEqual(deck * (1 - 1e-9));
    const partial = transitSpectrum(earth, sun, air, { cover: 0.5, topBar: 0.1 });
    for (let k = 0; k < SPECTRUM_BINS; k++) expect(partial.depthPpm[k]).toBeCloseTo((clear.depthPpm[k] + overcast.depthPpm[k]) / 2, 9);
  });

  it("cover thick air fully, humid air partly, dry air not at all", () => {
    const venus = { ...earth, surface: { ...earthSurface, pressureBar: 92 } };
    expect(cloudDeckOf(venus, atmosphereComposition(venus, null)).cover).toBe(1);
    expect(cloudDeckOf(earth, atmosphereComposition(earth, null)).cover).toBeCloseTo(0.65, 2);
    const dry = { ...earth, surface: { ...earthSurface, water: 0 } };
    expect(cloudDeckOf(dry, atmosphereComposition(dry, null)).cover).toBe(0);
    expect(overcastShare(1)).toBe(0);
  });

  it("hide nothing on a planet whose surface lies above the cloud tops", () => {
    const mars = { ...earth, surface: { ...earthSurface, pressureBar: 0.006, backgroundBar: 0.006, co2Bar: 0, o2Bar: 0 } };
    const air = atmosphereComposition(mars, null);
    expect(transitSpectrum(mars, sun, air, OVERCAST).depthPpm).toEqual(transitSpectrum(mars, sun, air, CLEAR).depthPpm);
  });

  it("cover cold giants, where water condenses, and leave hot ones clear", () => {
    const giant: Planet = { ...earth, type: "gas-giant", mass: 318, size: 11.2, temperature: 122, surface: null };
    expect(cloudDeckOf(giant, atmosphereComposition(giant, null)).cover).toBe(1);
    const hot = { ...giant, temperature: 1400 };
    expect(cloudDeckOf(hot, atmosphereComposition(hot, null)).cover).toBe(0);
  });
});

describe("giants", () => {
  it("show hot Jupiters' features hundreds of ppm deep, from their tall, light air", () => {
    const hot: Planet = { ...earth, type: "gas-giant", mass: 318, size: 11.2, temperature: 1400, surface: null };
    const s = transitSpectrum(hot, sun, atmosphereComposition(hot, null));
    expect(s.scaleHeightKm).toBeGreaterThan(150);
    expect(amplitude(s)).toBeGreaterThan(200);
    expect(s.depthPpm[binIndex(1.4)]).toBeGreaterThan(s.depthPpm[binIndex(1.25)]);   // water
    expect(s.depthPpm[binIndex(4.7)]).toBeGreaterThan(s.depthPpm[binIndex(4.0)]);    // carbon monoxide
  });
});

describe("every planet", () => {
  const seed = 100000;
  const config = makeConfig(seed);
  const stars = generateStarsFor(buildGalaxyConfig(seed, config), UNIVERSE_AGE_GYR, config).stars.slice(0, 100);
  const all = stars.flatMap((star) => generatePlanetsFor(star, seed, config).planets.map((planet) => ({ star, planet })));

  it("has a finite spectrum no shallower than its reference level, the same each time", () => {
    expect(all.length).toBeGreaterThan(200);
    for (const { star, planet } of all) {
      const air = atmosphereComposition(planet, null);
      const s = transitSpectrum(planet, star, air);
      expect(s.depthPpm.length).toBe(SPECTRUM_BINS);
      for (const d of s.depthPpm) {
        expect(Number.isFinite(d)).toBe(true);
        expect(d).toBeGreaterThanOrEqual(s.baselinePpm);
      }
      expect(transitSpectrum(planet, star, air)).toEqual(s);
    }
  });
});
