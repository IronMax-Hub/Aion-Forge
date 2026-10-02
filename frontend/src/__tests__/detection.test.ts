import { describe, it, expect } from "vitest";
import { detectGases, verdictFor, VERDICT_ORDER, DETECTION_SIGMA } from "../simulation/detection";
import type { Verdict } from "../simulation/detection";
import { observeTransits } from "../simulation/observation";
import { transitSpectrum } from "../simulation/spectrum";
import { atmosphereComposition } from "../simulation/atmosphereComposition";
import type { AtmosphereComposition, Gas } from "../simulation/atmosphereComposition";
import { generatePlanetsFor, planetKey } from "../simulation/planet";
import type { Planet, PlanetSurface } from "../simulation/planet";
import { generateStarsFor, UNIVERSE_AGE_GYR } from "../simulation/star";
import type { Star } from "../simulation/star";
import { buildGalaxyConfig } from "../simulation/galaxy";
import { makeConfig } from "../simulation/config";
import { OXIDATION_O2_BAR } from "../simulation/worldHistory";

// Worlds Up Close B4: detection significance per gas, and what it supports.

const seed = 100000;
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
  isRare: false, surface: earthSurface, life: null, worldEvents: [],
};
const hotJupiter: Planet = { ...earth, type: "gas-giant", mass: 318, size: 11.2, temperature: 1400, surface: null };

/** Observe a planet for n transits and read the result. */
function look(planet: Planet, star: Star, transits: number, air: AtmosphereComposition = atmosphereComposition(planet, null)) {
  const observation = observeTransits(transitSpectrum(planet, star, air), planet, star, seed, transits);
  return detectGases(observation, planet, star, air);
}
const sigmaOf = (gases: { gas: Gas; sigma: number }[], gas: Gas) => gases.find((g) => g.gas === gas)?.sigma ?? 0;
const rank = (v: Verdict) => VERDICT_ORDER.indexOf(v);

describe("the verdict table", () => {
  const set = (...gases: Gas[]) => new Set<Gas>(gases);
  const cold = { ...earth, temperature: 200 };

  it("reads oxygen with methane as a strong biosignature, oxygen alone as ambiguous", () => {
    expect(verdictFor(set("O2", "CH4"), earth)).toBe("strong-biosignature");
    expect(verdictFor(set("O3", "CH4", "H2O"), earth)).toBe("strong-biosignature");
    expect(verdictFor(set("O2"), earth)).toBe("ambiguous");
    expect(verdictFor(set("O3", "CO2", "H2O"), earth)).toBe("ambiguous");
  });

  it("reads methane alone as a possible biosignature only on a temperate solid world; N₂O anywhere", () => {
    expect(verdictFor(set("CH4"), earth)).toBe("possible-biosignature");
    expect(verdictFor(set("CH4"), cold)).toBe("atmosphere");
    expect(verdictFor(set("CH4", "H2O"), hotJupiter)).toBe("atmosphere");
    expect(verdictFor(set("N2O"), cold)).toBe("possible-biosignature");
    expect(verdictFor(set("O2", "N2O"), earth)).toBe("possible-biosignature");
  });

  it("puts CFCs above everything, and says so when nothing is detected", () => {
    expect(verdictFor(set("CFC12"), cold)).toBe("technosignature");
    expect(verdictFor(set("CFC11", "O2", "CH4"), earth)).toBe("technosignature");
    expect(verdictFor(set("CO2"), earth)).toBe("atmosphere");
    expect(verdictFor(set(), earth)).toBe("none");
  });
});

describe("significance", () => {
  it("is given for every gas with bands in the air, most significant first, and for no other", () => {
    const { gases } = look(earth, sun, 50);
    const air = atmosphereComposition(earth, null);
    for (const { gas, sigma } of gases) {
      expect(air.mixingRatios[gas]).toBeDefined();
      expect(sigma).toBeGreaterThanOrEqual(0);
    }
    expect(gases.map((g) => g.gas)).not.toContain("N2");
    for (let i = 1; i < gases.length; i++) expect(gases[i].sigma).toBeLessThanOrEqual(gases[i - 1].sigma);
  });

  it("grows with the square root of the transits on a clear signal", () => {
    const at = (n: number) => sigmaOf(look(hotJupiter, sun, n).gases, "H2O");
    expect(at(1)).toBeGreaterThan(DETECTION_SIGMA);
    expect(at(200) / at(50)).toBeGreaterThan(1.7);
    expect(at(200) / at(50)).toBeLessThan(2.3);
  });

  it("is the same every time", () => {
    expect(look(earth, redDwarf, 37)).toEqual(look(earth, redDwarf, 37));
  });
});

describe("what a long look supports", () => {
  // A light world around a small star: tall air against a small disk, the easiest case to read
  const light = (surface: Partial<PlanetSurface>): Planet =>
    ({ ...earth, mass: 0.3, surface: { ...earthSurface, surfaceGravity: 0.3, ...surface } });

  it("finds a strong biosignature where oxygen and methane last together", () => {
    const result = look(light({ ch4Bar: 1e-3 }), redDwarf, 200);
    expect(sigmaOf(result.gases, "O2")).toBeGreaterThanOrEqual(DETECTION_SIGMA);
    expect(sigmaOf(result.gases, "CH4")).toBeGreaterThanOrEqual(DETECTION_SIGMA);
    expect(result.verdict).toBe("strong-biosignature");
  });

  it("calls oxygen without methane ambiguous", () => {
    const result = look(light({ ch4Bar: 0 }), redDwarf, 200);
    expect(sigmaOf(result.gases, "O2")).toBeGreaterThanOrEqual(DETECTION_SIGMA);
    expect(result.verdict).toBe("ambiguous");
  });

  it("finds a technosignature where CFCs are strong enough", () => {
    // 20,000 times Earth's CFC-12: in the mid-infrared, where few photons arrive, Earth's own would not show
    const planet = light({});
    const air = atmosphereComposition(planet, null);
    const polluted: AtmosphereComposition = { ...air, mixingRatios: { ...air.mixingRatios, CFC12: 1e-5 } };
    expect(look(planet, redDwarf, 200, polluted).verdict).toBe("technosignature");
  });
});

describe("a galaxy's planets", () => {
  const config = makeConfig(seed);
  const stars = generateStarsFor(buildGalaxyConfig(seed, config), UNIVERSE_AGE_GYR, config).stars;

  it("never read a lifeless world's oxygen as more than ambiguous", () => {
    const falsePositives = stars.slice(0, 400).flatMap((star) => generatePlanetsFor(star, seed, config).planets
      .filter((planet) => planet.surface && planet.life === null && planet.surface.o2Bar >= OXIDATION_O2_BAR)
      .map((planet) => ({ star, planet })));
    expect(falsePositives.length).toBeGreaterThan(0);
    for (const { star, planet } of falsePositives) {
      const { verdict, gases } = look(planet, star, 200);
      expect(rank(verdict)).toBeLessThanOrEqual(rank("ambiguous"));
      expect(sigmaOf(gases, "CH4")).toBe(0);
    }
  });

  it("let the verdict improve or hold as transits are added, but for noise at the threshold", () => {
    let steps = 0;
    let setbacks = 0;
    for (const star of stars.slice(0, 80)) for (const planet of generatePlanetsFor(star, seed, config).planets) {
      let best = -1;
      for (const n of [1, 10, 50, 200]) {
        const r = rank(look(planet, star, n).verdict);
        if (best >= 0) { steps++; if (r < best) setbacks++; }
        best = Math.max(best, r);
      }
    }
    expect(steps).toBeGreaterThan(500);
    expect(setbacks / steps).toBeLessThan(0.01);
  });
});
