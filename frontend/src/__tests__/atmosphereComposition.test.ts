import { describe, it, expect } from "vitest";
import { atmosphereComposition, waterSaturationBar } from "../simulation/atmosphereComposition";
import type { Gas } from "../simulation/atmosphereComposition";
import { generatePlanetsFor, GIANT_PLANET_MASS, planetKey } from "../simulation/planet";
import type { Planet, PlanetSurface } from "../simulation/planet";
import { generateStarsFor, UNIVERSE_AGE_GYR } from "../simulation/star";
import type { Star } from "../simulation/star";
import { buildGalaxyConfig } from "../simulation/galaxy";
import { makeConfig } from "../simulation/config";
import { derivePhysics } from "../simulation/planetPhysics";
import { generateBiosphere } from "../simulation/biosphere";
import { generateCivilization } from "../simulation/civilization";
import type { Civilization, TechStage } from "../simulation/civilization";
import { OXIDATION_O2_BAR } from "../simulation/worldHistory";

// Worlds Up Close B1: what gases each atmosphere holds, from geology, life and technology.

const seed = 100000;
const config = makeConfig(seed);
const stars = generateStarsFor(buildGalaxyConfig(seed, config), UNIVERSE_AGE_GYR, config).stars.slice(0, 400);
const all: { star: Star; planet: Planet }[] = stars.flatMap((star) =>
  generatePlanetsFor(star, seed, config).planets.map((planet) => ({ star, planet })));
const solid = all.filter(({ planet }) => planet.mass <= GIANT_PLANET_MASS);
const giants = all.filter(({ planet }) => planet.mass > GIANT_PLANET_MASS);
const civilizationOf = (planet: Planet, star: Star) =>
  generateCivilization(generateBiosphere(planet, star), planet, seed).civilization;

const TECH_GASES: Gas[] = ["NO2", "CFC11", "CFC12"];

const earthSurface: PlanetSurface = {
  oceanFraction: 0.7, iceFraction: 0.03, landFraction: 0.27, habitableFraction: 0.8, surfaceGravity: 1, pressureBar: 1, o2Bar: 0.21,
  backgroundBar: 0.79, co2Bar: 2.8e-4, ch4Bar: 1.8e-6, ozone: 1, water: 0.5, steam: false,
};
const earth: Planet = {
  id: 2, key: planetKey(1, 2), hostStarId: 1, orbitalRadius: 1, orbitalIndex: 2, type: "rocky", size: 1, mass: 1,
  temperature: 288, atmosphere: "moderate", formationAtmosphere: "moderate", resourceAbundance: 0.5, habitabilityScore: 0.8,
  isRare: false, surface: earthSurface, life: null, worldEvents: [], everLiquidWater: false,
};
const civ = (techStage: TechStage, population = 8): Civilization => ({
  id: 0, speciesId: 0, planetId: 2, ageGyr: 0.1, population, techStage, techLevel: 0.5, socialCohesion: 0.5,
  resourceEfficiency: 0.5, expansionTendency: 0.5, collapseRisk: 0.1, hasCollapsed: techStage === "collapsed",
  collapsesCount: 0, isRare: false, milestones: [], extinctAgoGyr: null,
});

describe("every atmosphere", () => {
  it("gives mixing ratios that are positive and sum to 1", () => {
    for (const { star, planet } of all) {
      const { mixingRatios, pressureBar } = atmosphereComposition(planet, civilizationOf(planet, star));
      const ratios = Object.values(mixingRatios);
      expect(ratios.length).toBeGreaterThan(0);
      for (const x of ratios) expect(x).toBeGreaterThan(0);
      expect(ratios.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 12);
      expect(pressureBar).toBeGreaterThan(0);
    }
  });

  it("is the same every time it is read", () => {
    for (const { star, planet } of all.slice(0, 200)) {
      const c = civilizationOf(planet, star);
      expect(atmosphereComposition(planet, c)).toEqual(atmosphereComposition(planet, c));
    }
  });
});

describe("solid planets", () => {
  it("read N₂, CO₂, O₂ and CH₄ from the air their world history left", () => {
    for (const { planet } of solid) {
      const s = planet.surface!;
      const { mixingRatios: x, pressureBar } = atmosphereComposition(planet, null);
      expect((x.N2 ?? 0) * pressureBar).toBeCloseTo(s.backgroundBar, 9);
      expect((x.CO2 ?? 0) * pressureBar).toBeCloseTo(s.co2Bar, 9);
      expect((x.O2 ?? 0) * pressureBar).toBeCloseTo(s.o2Bar, 9);
      expect((x.CH4 ?? 0) * pressureBar).toBeCloseTo(s.ch4Bar, 9);
      // The total is the surface pressure, with vapour added where the oceans are not boiled
      expect(pressureBar).toBeGreaterThanOrEqual(s.pressureBar * (1 - 1e-12));
      if (s.steam) expect(pressureBar).toBeCloseTo(s.pressureBar, 6);
    }
  });

  it("gives an Earth-like air Earth's proportions", () => {
    const { mixingRatios: x } = atmosphereComposition(earth, null);
    expect(x.N2).toBeGreaterThan(0.75);
    expect(x.O2).toBeCloseTo(0.21, 2);
    expect(x.H2O).toBeGreaterThan(0.005);
    expect(x.H2O).toBeLessThan(0.02);
    expect(x.O3).toBeGreaterThan(2e-7);
    expect(x.O3).toBeLessThan(5e-7);
    for (const gas of TECH_GASES) expect(x[gas]).toBeUndefined();
  });

  it("follows Clausius–Clapeyron for water vapour, and never holds more water than the planet has", () => {
    expect(waterSaturationBar(273.16)).toBeCloseTo(0.006117, 6);
    expect(waterSaturationBar(373)).toBeGreaterThan(0.85);
    expect(waterSaturationBar(373)).toBeLessThan(1.15);
    const warm = atmosphereComposition({ ...earth, temperature: 300 }, null).mixingRatios.H2O!;
    const cold = atmosphereComposition({ ...earth, temperature: 250 }, null).mixingRatios.H2O!;
    expect(warm).toBeGreaterThan(cold * 10);
    const dry = atmosphereComposition({ ...earth, temperature: 700, surface: { ...earthSurface, water: 1e-6 } }, null);
    expect(dry.mixingRatios.H2O! * dry.pressureBar).toBeLessThanOrEqual(3311 * 1e-6 + 1e-12);
  });

  it("carries no methane, N₂O or technology gases where life never began", () => {
    const lifeless = solid.filter(({ planet }) => planet.life === null);
    expect(lifeless.length).toBeGreaterThan(500);
    for (const { star, planet } of lifeless) {
      const { mixingRatios: x } = atmosphereComposition(planet, civilizationOf(planet, star));
      expect(x.CH4).toBeUndefined();
      expect(x.N2O).toBeUndefined();
      for (const gas of TECH_GASES) expect(x[gas]).toBeUndefined();
    }
  });

  it("finds oxygen without life: lifeless worlds whose water was split by starlight", () => {
    const falsePositives = solid.filter(({ planet }) => planet.life === null && planet.surface!.o2Bar >= OXIDATION_O2_BAR);
    expect(falsePositives.length).toBeGreaterThan(0);
    for (const { star, planet } of falsePositives) {
      expect(atmosphereComposition(planet, null).mixingRatios.O2).toBeGreaterThan(0);
      // Their oxygen came from water lost to space: they hold less than they formed with
      expect(planet.surface!.water).toBeLessThan(derivePhysics(planet, star, seed, config).waterInventory);
    }
  });
});

describe("nitrous oxide", () => {
  const living = (totalBiomass: number, endedGyr: number | null = null): Planet["life"] => ({
    startedGyr: 0.6, endedGyr,
    phylogeny: {
      livingLineages: 20, diversity: 0.6, largestLog10BodyMassKg: 1, foodChainLevels: 3, totalBiomass, traitSpread: 0.4,
      recentSurvival: 0.9, lethalCatastrophes: [], mind: null, firsts: [],
    },
    oxygenGyr: null,
  });
  const n2oBar = (planet: Planet) => {
    const c = atmosphereComposition(planet, null);
    return (c.mixingRatios.N2O ?? 0) * c.pressureBar;
  };

  it("is Earth's pre-industrial amount on an Earth-like living world", () => {
    expect(n2oBar({ ...earth, life: living(0.55) })).toBeCloseTo(2.7e-7, 9);
  });

  it("rises with living biomass, and is gone when life has died out", () => {
    expect(n2oBar({ ...earth, life: living(1.1) })).toBeCloseTo(2 * n2oBar({ ...earth, life: living(0.55) }), 15);
    expect(n2oBar({ ...earth, life: living(0.55, 3) })).toBe(0);
  });

  it("needs oxygen: anoxic life makes almost none", () => {
    const anoxic = { ...earth, surface: { ...earthSurface, o2Bar: 0 }, life: living(0.55) };
    expect(n2oBar(anoxic)).toBe(0);
    const trace = { ...earth, surface: { ...earthSurface, o2Bar: 1e-9 }, life: living(0.55) };
    expect(n2oBar(trace)).toBeLessThan(2.7e-8);
  });

  it("occurs on living oxidised worlds in the sample", () => {
    const withN2O = solid.filter(({ planet }) => atmosphereComposition(planet, null).mixingRatios.N2O !== undefined);
    expect(withN2O.length).toBeGreaterThan(0);
    for (const { planet } of withN2O) expect(planet.life?.endedGyr).toBeNull();
  });
});

describe("technology", () => {
  it("adds CO₂ and NO₂ from the industrial stage, and CFCs from the information age", () => {
    const base = atmosphereComposition(earth, null);
    const partial = (stage: TechStage, gas: Gas) => {
      const c = atmosphereComposition(earth, civ(stage));
      return (c.mixingRatios[gas] ?? 0) * c.pressureBar;
    };
    const baseCO2 = base.mixingRatios.CO2! * base.pressureBar;
    for (const stage of ["primitive", "agricultural"] as TechStage[]) {
      expect(partial(stage, "CO2")).toBeCloseTo(baseCO2, 12);
      for (const gas of TECH_GASES) expect(partial(stage, gas)).toBe(0);
    }
    expect(partial("industrial", "CO2")).toBeCloseTo(baseCO2 + 1.4e-4, 9);
    expect(partial("industrial", "NO2")).toBeGreaterThan(0);
    expect(partial("industrial", "CFC11")).toBe(0);
    for (const stage of ["information", "space-age"] as TechStage[]) {
      expect(partial(stage, "CFC11")).toBeGreaterThan(0);
      expect(partial(stage, "CFC12")).toBeGreaterThan(0);
    }
  });

  it("leaves nothing behind once a civilization has collapsed", () => {
    expect(atmosphereComposition(earth, civ("collapsed"))).toEqual(atmosphereComposition(earth, null));
  });

  it("scales with population", () => {
    const at = (population: number) => {
      const c = atmosphereComposition(earth, civ("information", population));
      return c.mixingRatios.CFC12! * c.pressureBar;
    };
    expect(at(16)).toBeCloseTo(2 * at(8), 15);
  });
});

describe("giants", () => {
  it("are hydrogen and helium with methane", () => {
    expect(giants.length).toBeGreaterThan(50);
    for (const { planet } of giants) {
      const { mixingRatios: x } = atmosphereComposition(planet, null);
      expect(x.H2).toBeGreaterThan(0.8);
      expect(x.He).toBeGreaterThan(0.1);
      expect(x.CH4).toBeGreaterThan(0);
      expect(x.O2).toBeUndefined();
      expect(x.N2).toBeUndefined();
    }
  });

  it("freeze ammonia and water out of their cold upper air, and keep them when hot", () => {
    const jupiter: Planet = { ...earth, type: "gas-giant", mass: 318, size: 11, temperature: 122, surface: null };
    const cold = atmosphereComposition(jupiter, null).mixingRatios;
    expect(cold.NH3).toBeLessThan(1e-5);
    expect(cold.H2O ?? 0).toBeLessThan(1e-12);
    const hot = atmosphereComposition({ ...jupiter, temperature: 600 }, null).mixingRatios;
    expect(hot.NH3).toBeCloseTo(3.3e-4, 9);
    expect(hot.H2O).toBeCloseTo(2.5e-3, 9);
    const neptune = atmosphereComposition({ ...jupiter, type: "ice-giant", temperature: 51 }, null).mixingRatios;
    expect(neptune.CH4).toBeGreaterThan(cold.CH4! * 5);
  });

  it("hold carbon as methane when cool and as carbon monoxide when hot, as real hot Jupiters do", () => {
    const jupiter: Planet = { ...earth, type: "gas-giant", mass: 318, size: 11, temperature: 122, surface: null };
    const at = (temperature: number) => atmosphereComposition({ ...jupiter, temperature }, null).mixingRatios;
    expect(at(122).CO ?? 0).toBeLessThan(1e-30);
    expect(at(800).CO ?? 0).toBeLessThan(at(800).CH4! * 0.01);
    expect(at(1000).CH4).toBeGreaterThan(at(1000).CO!);
    expect(at(1300).CO).toBeGreaterThan(at(1300).CH4! * 10);
    expect(at(1500).CO).toBeGreaterThan(at(1500).CH4! * 100);
    // Carbon is shared, not made or lost; the water that made CO is gone
    for (const t of [700, 1000, 1100, 1300, 2000]) {
      const x = at(t);
      expect((x.CH4 ?? 0) + (x.CO ?? 0)).toBeCloseTo(1.8e-3, 9);
      expect((x.H2O ?? 0) + (x.CO ?? 0)).toBeCloseTo(2.5e-3, 9);
    }
  });
});
