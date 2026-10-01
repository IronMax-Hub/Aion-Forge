import { describe, it, expect } from "vitest";
import * as THREE from "three";
import {
  hasVisibleAtmosphere, zenithOpticalDepth, starSpectrumRGB, overcastShare, cloudDriftAngle,
  MIN_VISIBLE_PRESSURE_BAR, OVERCAST_BAR,
} from "../rendering/planet/atmosphere";
import { PlanetView } from "../rendering/planet/PlanetView";
import { GlobeTextureCache, noiseOffsetOf, cloudOffsetOf, drawsSurface } from "../rendering/planet/globe";
import { generatePlanetsFor, solidWorldOf, planetKey } from "../simulation/planet";
import type { Planet, PlanetSurface } from "../simulation/planet";
import { generateStarsFor, UNIVERSE_AGE_GYR } from "../simulation/star";
import type { Star } from "../simulation/star";
import { buildGalaxyConfig } from "../simulation/galaxy";
import { makeConfig } from "../simulation/config";
import { createRNG, mixSeed, SALT } from "../simulation/rng";

// Worlds Up Close A6: air and clouds, in proportion to each planet's actual pressure.

const seed = 100000;
const config = makeConfig(seed);
const stars = generateStarsFor(buildGalaxyConfig(seed, config), UNIVERSE_AGE_GYR, config).stars.slice(0, 15);
const drawn = stars.flatMap((star) => generatePlanetsFor(star, seed, config).planets
  .filter((planet) => drawsSurface(planet)).map((planet) => ({ star, planet })));

const sun: Star = {
  id: 1, position: [0, 0, 0], mass: 1, age: 4.6, lifespan: 10, temperature: 5772, luminosity: 1,
  classification: "main-sequence", isRare: false,
};
function planetWith(pressureBar: number | null): Planet {
  const surface: PlanetSurface | null = pressureBar === null ? null : {
    oceanFraction: 0.7, iceFraction: 0.1, landFraction: 0.2, habitableFraction: 0.7, surfaceGravity: 1, pressureBar, o2Bar: 0,
  };
  return {
    id: 2, key: planetKey(1, 2), hostStarId: 1, orbitalRadius: 1, orbitalIndex: 2, type: surface ? "rocky" : "gas-giant",
    size: 1, mass: surface ? 1 : 100, temperature: 288, atmosphere: "moderate", formationAtmosphere: "moderate", resourceAbundance: 0.5,
    habitabilityScore: 0.5, isRare: false, surface, life: null,
  };
}
const towardStar = new THREE.Vector3(1, 0, 0);

describe("which planets show air", () => {
  it("shows a rim from 0.01 bar of actual pressure, on solid planets only", () => {
    expect(hasVisibleAtmosphere(planetWith(0.006))).toBe(false);   // Mars-thin: no rim
    expect(hasVisibleAtmosphere(planetWith(MIN_VISIBLE_PRESSURE_BAR))).toBe(true);
    expect(hasVisibleAtmosphere(planetWith(1))).toBe(true);
    expect(hasVisibleAtmosphere(planetWith(null))).toBe(false);     // giants: A7
  });

  it("follows the pressure the world history left, not the atmosphere class", () => {
    const planet = { ...planetWith(10), atmosphere: "none" as const };
    expect(hasVisibleAtmosphere(planet)).toBe(true);
  });

  it("gives the view a shell only when there is air to see", () => {
    expect(new PlanetView(planetWith(1), sun, towardStar, false, 0).hasAtmosphere).toBe(true);
    expect(new PlanetView(planetWith(0.006), sun, towardStar, false, 0).hasAtmosphere).toBe(false);
    expect(new PlanetView(planetWith(null), sun, towardStar, false, 0).hasAtmosphere).toBe(false);
  });
});

describe("rim colour", () => {
  it("scatters in proportion to pressure, blue most (Rayleigh)", () => {
    const [r, g, b] = zenithOpticalDepth(1);
    expect(b).toBeGreaterThan(g);
    expect(g).toBeGreaterThan(r);
    // λ⁻⁴ between the blue and red channels' wavelengths (465 and 612 nm): ~3 times
    expect(b / r).toBeCloseTo((0.612 / 0.465) ** 4, 0);
    expect(zenithOpticalDepth(90)[0]).toBeCloseTo(90 * r, 12);
  });

  it("lights the air with the star's own spectrum: white for the Sun, little blue for a red dwarf", () => {
    const [sr, sg, sb] = starSpectrumRGB(5772);
    expect(Math.min(sr, sg, sb)).toBeGreaterThan(0.75);
    const [rr, , rb] = starSpectrumRGB(3500);
    expect(rr).toBe(1);
    expect(rb).toBeLessThan(0.55);
    const [hr, , hb] = starSpectrumRGB(20000);
    expect(hb).toBe(1);
    expect(hr).toBeLessThan(0.6);
  });

  it("so a red dwarf's thin sky is not Earth blue", () => {
    const skyColour = (t: number) => {
      const spectrum = starSpectrumRGB(t);
      return zenithOpticalDepth(1).map((depth, k) => (1 - Math.exp(-depth)) * spectrum[k]);
    };
    const earth = skyColour(5772);
    const red = skyColour(3500);
    expect(earth[2] / earth[0]).toBeGreaterThan(2.5);
    expect(red[2] / red[0]).toBeLessThan(1.6);
  });
});

describe("clouds", () => {
  it("cover the whole sky from 90 bar, none of it below 10, smoothly between", () => {
    expect(overcastShare(1)).toBe(0);
    expect(overcastShare(OVERCAST_BAR.from)).toBe(0);
    expect(overcastShare(50)).toBeCloseTo(0.5, 12);
    expect(overcastShare(OVERCAST_BAR.full)).toBe(1);
    expect(overcastShare(9000)).toBe(1);
    let previous = 0;
    for (let p = 0; p <= 100; p += 1) {
      expect(overcastShare(p)).toBeGreaterThanOrEqual(previous);
      previous = overcastShare(p);
    }
  });

  it("drift once round the pole in fifteen minutes on screen", () => {
    expect(cloudDriftAngle(0)).toBe(0);
    expect(cloudDriftAngle(15 * 60 * 1000)).toBeCloseTo(2 * Math.PI, 12);
  });

  it("place their pattern from the VISUAL stream, after the detail noise's draws", () => {
    const { planet } = drawn[0];
    const rng = createRNG(mixSeed(seed, planet.hostStarId, planet.id, SALT.VISUAL));
    const draws = Array.from({ length: 6 }, () => rng() * 100);
    expect(noiseOffsetOf(planet, seed)).toEqual(draws.slice(0, 3));
    expect(cloudOffsetOf(planet, seed)).toEqual(draws.slice(3, 6));
  });

  const { star, planet } = drawn[0];
  const world = solidWorldOf(planet, star, seed, config);
  const surface = new GlobeTextureCache().globeFor(planet, world, world.physics, seed);

  it("turn with time, unless the viewer prefers reduced motion", () => {
    const moving = new PlanetView(planet, star, towardStar, true, 0, { surface });
    moving.update(60_000);
    expect(moving.cloudTurn).toBeCloseTo(cloudDriftAngle(60_000), 6);
    const still = new PlanetView(planet, star, towardStar, false, 0, { surface });
    still.update(60_000);
    expect(still.cloudTurn).toBeCloseTo(0, 6);
  });

  it("fade in with the planet, and are freed with the view while the baked atlas stays", () => {
    const view = new PlanetView(planet, star, towardStar, true, 0, { surface });
    const layers = view.scene.children.filter((c): c is THREE.Mesh => c instanceof THREE.Mesh && c.renderOrder > 0);
    expect(layers.length).toBe(2);   // clouds and shell
    const opacities = () => layers.map((m) => (m.material as THREE.ShaderMaterial).uniforms.opacity.value);
    expect(opacities()).toEqual([0, 0]);
    view.update(200);
    for (const o of opacities()) expect(o).toBeCloseTo(0.5, 12);

    const freed: string[] = [];
    for (const m of layers) (m.material as THREE.Material).addEventListener("dispose", () => freed.push("layer"));
    surface.bake.target.addEventListener("dispose", () => freed.push("atlas"));
    view.dispose();
    expect(freed).toEqual(["layer", "layer"]);
  });
});
