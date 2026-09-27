import { describe, it, expect } from "vitest";
import * as THREE from "three";
import {
  CITY_RADIUS, cityCountOf, cityWeights, civilizationLightsOf, pigmentColourOf, vegetationOf,
} from "../rendering/planet/life";
import { GlobeTextureCache, drawsSurface } from "../rendering/planet/globe";
import { PlanetView } from "../rendering/planet/PlanetView";
import { axisFrame } from "../rendering/planet/surfaceMap";
import { generatePlanetsFor, solidWorldOf } from "../simulation/planet";
import type { Planet } from "../simulation/planet";
import { generateStarsFor, UNIVERSE_AGE_GYR } from "../simulation/star";
import type { Star } from "../simulation/star";
import { buildGalaxyConfig } from "../simulation/galaxy";
import { makeConfig } from "../simulation/config";
import { generateBiosphere } from "../simulation/biosphere";
import type { Biosphere, LifeStage } from "../simulation/biosphere";
import type { Civilization, TechStage } from "../simulation/civilization";
import { surfaceGrid } from "../simulation/geography";
import { FREEZING_K } from "../simulation/climate";

// Worlds Up Close A9: life and civilization seen from orbit.

const seed = 100000;
const config = makeConfig(seed);
const stars = generateStarsFor(buildGalaxyConfig(seed, config), UNIVERSE_AGE_GYR, config).stars.slice(0, 30);
const all: { star: Star; planet: Planet }[] = stars.flatMap((star) =>
  generatePlanetsFor(star, seed, config).planets.map((planet) => ({ star, planet })));
const solids = all.filter(({ planet }) => drawsSurface(planet));

// A world with temperate coastal land for cities
const { star, planet } = solids.find(({ star, planet }) => {
  const { cellTemperatureK } = solidWorldOf(planet, star, seed, config).history.present;
  return cityWeights(solidWorldOf(planet, star, seed, config)).some((w, i) => w === 1 && cellTemperatureK[i] >= FREEZING_K);
})!;
const world = solidWorldOf(planet, star, seed, config);

const biosphere = (stage: LifeStage, biomass: number): Biosphere => ({
  planetId: planet.id, hostStarId: star.id, hasLife: stage !== "none", stage,
  complexity: 0.5, diversity: 0.5, stability: 0.5, adaptability: 0.5, biomass, extinctions: [], ageGyr: 2,
});
const civilization = (techStage: TechStage, population: number): Civilization => ({
  id: 0, speciesId: 0, planetId: planet.id, ageGyr: 0.01, population, techStage, techLevel: 0.5,
  socialCohesion: 0.5, resourceEfficiency: 0.5, expansionTendency: 0.5, collapseRisk: 0.2,
  hasCollapsed: techStage === "collapsed", collapsesCount: 0, isRare: false, milestones: [],
});

// The pigment as it would be displayed
function srgb(temperatureK: number): { r: number; g: number; b: number } {
  const c = pigmentColourOf(temperatureK).clone().convertLinearToSRGB();
  return { r: c.r, g: c.g, b: c.b };
}

describe("vegetation", () => {
  it("is green under a G star, yellow-orange under a K star, and dark red to near-black under M dwarfs", () => {
    const g = srgb(5772);
    expect(g.g).toBeGreaterThan(g.r);
    expect(g.g).toBeGreaterThan(g.b);
    const k = srgb(4500);
    expect(k.r).toBeGreaterThan(k.g);
    expect(k.g).toBeGreaterThan(k.b * 2);
    const m = srgb(3300);
    expect(m.r).toBeGreaterThan(2 * m.g);
    expect(m.r).toBeLessThan(0.4);
    const late = srgb(2500);
    expect(Math.max(late.r, late.g, late.b)).toBeLessThan(0.12);
  });

  it("turns blue-green under F stars and blue under hotter ones, following the star's temperature (owner decision)", () => {
    const f = srgb(6800);
    expect(Math.min(f.g, f.b)).toBeGreaterThan(2 * f.r);
    const a = srgb(9500);
    expect(a.b).toBeGreaterThan(a.g);
    expect(a.b).toBeGreaterThan(a.r);
    // Held at the ramp's ends, and continuous between its points
    expect(pigmentColourOf(40000).equals(pigmentColourOf(9000))).toBe(true);
    expect(pigmentColourOf(1000).equals(pigmentColourOf(2500))).toBe(true);
    const near = pigmentColourOf(5799.9), at = pigmentColourOf(5800);
    expect(Math.abs(near.g - at.g)).toBeLessThan(1e-3);
  });

  it("covers by biomass, faint for microbial life and nothing before it (owner decision)", () => {
    expect(vegetationOf(null, 5772)).toBeNull();
    expect(vegetationOf(biosphere("none", 0), 5772)).toBeNull();
    expect(vegetationOf(biosphere("prebiotic", 0.5), 5772)).toBeNull();
    const microbial = vegetationOf(biosphere("microbial", 0.5), 5772)!.cover;
    const multicellular = vegetationOf(biosphere("multicellular", 0.5), 5772)!.cover;
    const complex = vegetationOf(biosphere("complex", 0.5), 5772)!.cover;
    expect(microbial).toBeGreaterThan(0);
    expect(microbial).toBeLessThan(multicellular / 2);
    expect(complex).toBeCloseTo(0.5, 12);
    expect(vegetationOf(biosphere("dominant", 1), 5772)!.cover).toBe(1);
  });

  it("shows no tint on any lifeless planet", () => {
    let lifeless = 0;
    for (const { star, planet } of solids) {
      const bio = generateBiosphere(planet, star, seed);
      if (bio.hasLife) continue;
      lifeless++;
      expect(vegetationOf(bio, star.temperature)).toBeNull();
    }
    expect(lifeless).toBeGreaterThan(0);
  });
});

describe("city lights", () => {
  it("show nothing without a civilization, or before industry", () => {
    expect(civilizationLightsOf(planet, world, null, seed)).toBeNull();
    expect(civilizationLightsOf(planet, null, civilization("space-age", 10), seed)).toBeNull();
    for (const stage of ["primitive", "agricultural"] as const) {
      expect(cityCountOf(civilization(stage, 10))).toBe(0);
      expect(civilizationLightsOf(planet, world, civilization(stage, 10), seed)).toBeNull();
    }
  });

  it("grow in number with population from the industrial stage on", () => {
    for (const stage of ["industrial", "information", "space-age"] as const) {
      expect(cityCountOf(civilization(stage, 8))).toBeGreaterThan(cityCountOf(civilization(stage, 1)));
    }
    expect(cityCountOf(civilization("industrial", 8))).toBe(Math.round(250 * Math.sqrt(8)));
    expect(cityCountOf(civilization("industrial", 1e6))).toBe(4000);
  });

  it("sit on the planet's land, near cells that draw them, the same every time", () => {
    const lights = civilizationLightsOf(planet, world, civilization("industrial", 8), seed)!;
    const again = civilizationLightsOf(planet, world, civilization("industrial", 8), seed)!;
    expect(lights.cities!.positions).toEqual(again.cities!.positions);
    expect(lights.orbital).toBeNull();

    const weights = cityWeights(world);
    const { positions } = surfaceGrid();
    const { east, axis, third } = axisFrame();
    const cells = positions.map((p) => {
      const d = (v: readonly number[]) => v[0] * p[0] + v[1] * p[1] + v[2] * p[2];
      return new THREE.Vector3(d(east), d(axis), d(third));
    });
    const city = lights.cities!;
    for (let n = 0; n < city.brightness.length; n++) {
      const point = new THREE.Vector3().fromArray(city.positions, n * 3);
      expect(point.length()).toBeCloseTo(CITY_RADIUS, 5);
      // Within the spread of some drawing cell's centre
      const nearest = Math.min(...cells.map((c, i) => (weights[i] > 0 ? c.angleTo(point) : Infinity)));
      expect(nearest).toBeLessThan(0.1);
    }
  });

  it("are few and dim after a collapse; a space age adds an orbital shell", () => {
    const collapsed = civilizationLightsOf(planet, world, civilization("collapsed", 20), seed)!;
    expect(collapsed.cities!.brightness.length).toBeLessThanOrEqual(30);
    expect(Math.max(...collapsed.cities!.brightness)).toBeLessThanOrEqual(0.3);
    expect(collapsed.orbital).toBeNull();

    const space = civilizationLightsOf(planet, world, civilization("space-age", 20), seed)!;
    expect(space.orbital!.brightness.length).toBeGreaterThan(0);
    for (let n = 0; n < space.orbital!.brightness.length; n++) {
      const r = new THREE.Vector3().fromArray(space.orbital!.positions, n * 3).length();
      expect(r).toBeGreaterThan(1.04);
      expect(r).toBeLessThan(1.26);
    }
  });

  it("are drawn by the planet view only on planets with a civilization", () => {
    const surface = new GlobeTextureCache().globeFor(planet, world, world.physics, seed);
    const toward = new THREE.Vector3(1, 0, 0);
    const none = new PlanetView(planet, star, toward, false, 0, { surface });
    expect(none.cityLightCount).toBe(0);
    expect(none.hasOrbitalShell).toBe(false);

    const lights = civilizationLightsOf(planet, world, civilization("space-age", 8), seed)!;
    const lit = new PlanetView(planet, star, toward, false, 0, { surface, lights });
    expect(lit.cityLightCount).toBe(lights.cities!.brightness.length);
    expect(lit.hasOrbitalShell).toBe(true);
    // Lights stay on the globe as it turns
    const globe = lit.scene.children.find((c) => c instanceof THREE.Mesh && c.children.some((k) => k instanceof THREE.Points));
    expect(globe).toBeDefined();
  });
});
