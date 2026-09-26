import { describe, it, expect } from "vitest";
import * as THREE from "three";
import { bandCountFor, giantLookOf, GlobeTextureCache, noiseOffsetOf, cloudOffsetOf } from "../rendering/planet/globe";
import { ringIciness } from "../rendering/planet/rings";
import { PlanetView, glowColourOf, shimmerOf } from "../rendering/planet/PlanetView";
import { generatePlanetsFor, solidWorldOf, GIANT_PLANET_MASS } from "../simulation/planet";
import type { Planet } from "../simulation/planet";
import { generateStarsFor, UNIVERSE_AGE_GYR } from "../simulation/star";
import type { Star } from "../simulation/star";
import { buildGalaxyConfig } from "../simulation/galaxy";
import { makeConfig } from "../simulation/config";
import { derivePhysics } from "../simulation/planetPhysics";
import { createRNG, mixSeed, SALT } from "../simulation/rng";

// Worlds Up Close A7: giants and molten ground.

const seed = 100000;
const config = makeConfig(seed);
const stars = generateStarsFor(buildGalaxyConfig(seed, config), UNIVERSE_AGE_GYR, config).stars.slice(0, 120);
const all: { star: Star; planet: Planet }[] = stars.flatMap((star) =>
  generatePlanetsFor(star, seed, config).planets.map((planet) => ({ star, planet })));
const giants = all.filter(({ planet }) => planet.mass > GIANT_PLANET_MASS);
const lava = all.filter(({ planet }) => planet.type === "lava");
const towardStar = new THREE.Vector3(1, 0, 0);

describe("giant bands", () => {
  it("grow with spin: about 14 for Jupiter's 10 hours, fewer for slower giants", () => {
    expect(bandCountFor(10)).toBe(14);
    expect(bandCountFor(8)).toBeGreaterThan(bandCountFor(10));
    let previous = Infinity;
    for (let hours = 2; hours < 5000; hours *= 1.5) {
      expect(bandCountFor(hours)).toBeLessThanOrEqual(previous);
      previous = bandCountFor(hours);
    }
    expect(bandCountFor(1)).toBe(24);
    expect(bandCountFor(24 * 365)).toBe(4);
  });
});

describe("giant storms and rings", () => {
  it("are drawn from the VISUAL stream after the detail and cloud draws, the same every time", () => {
    for (const { star, planet } of giants.slice(0, 20)) {
      const hours = derivePhysics(planet, star, seed, config).rotationPeriodHours;
      expect(giantLookOf(planet, seed, hours)).toEqual(giantLookOf(planet, seed, hours));
      // The ring chance is the seventh draw
      const rng = createRNG(mixSeed(seed, planet.hostStarId, planet.id, SALT.VISUAL));
      for (let i = 0; i < 6; i++) rng();
      expect(giantLookOf(planet, seed, hours).rings !== null).toBe(rng() < 0.35);
    }
  });

  it("give some giants rings and storms, and keep storms off the poles and rings clear of the planet", () => {
    const looks = giants.map(({ star, planet }) => giantLookOf(planet, seed, derivePhysics(planet, star, seed, config).rotationPeriodHours));
    expect(giants.length).toBeGreaterThan(30);
    const ringed = looks.filter((look) => look.rings).length / looks.length;
    expect(ringed).toBeGreaterThan(0.15);
    expect(ringed).toBeLessThan(0.55);
    expect(looks.some((look) => look.storms.length === 0)).toBe(true);
    expect(looks.some((look) => look.storms.length >= 2)).toBe(true);
    for (const look of looks) {
      expect(look.storms.length).toBeLessThanOrEqual(3);
      for (const storm of look.storms) expect(Math.abs(storm.latitude)).toBeLessThan(0.7);
      if (look.rings) {
        expect(look.rings.inner).toBeGreaterThan(1.2);
        expect(look.rings.outer).toBeGreaterThan(look.rings.inner);
      }
    }
  });

  it("have icy rings when cold and dusty ones when warm", () => {
    expect(ringIciness(60)).toBe(1);
    expect(ringIciness(200)).toBeCloseTo(0.5, 12);
    expect(ringIciness(400)).toBe(0);
  });
});

describe("giant view", () => {
  const ringedGiant = giants.find(({ star, planet }) =>
    giantLookOf(planet, seed, derivePhysics(planet, star, seed, config).rotationPeriodHours).rings)!;
  const plainGiant = giants.find(({ star, planet }) =>
    !giantLookOf(planet, seed, derivePhysics(planet, star, seed, config).rotationPeriodHours).rings)!;

  it("draws bands with rings where the look has them, and no clouds or rim (giants have no surface pressure)", () => {
    const cache = new GlobeTextureCache();
    for (const [{ star, planet }, rings] of [[ringedGiant, true], [plainGiant, false]] as const) {
      const physics = derivePhysics(planet, star, seed, config);
      const view = new PlanetView(planet, star, towardStar, false, 0, { surface: cache.globeFor(planet, null, physics, seed) });
      expect(view.drawsSurface).toBe(true);
      expect(view.hasRings).toBe(rings);
      expect(view.hasClouds).toBe(false);
      expect(view.hasAtmosphere).toBe(false);
      view.dispose();
    }
  });

  it("runs a giant's bands round its spin axis even when it is locked", () => {
    const { star, planet } = giants.find(({ star, planet }) => derivePhysics(planet, star, seed, config).tidallyLocked)!;
    const physics = derivePhysics(planet, star, seed, config);
    expect(new GlobeTextureCache().globeFor(planet, null, physics, seed).tidallyLocked).toBe(false);
  });
});

describe("molten ground", () => {
  it("is drawn from the solid planet's surface, with clouds allowed where it is cool enough", () => {
    expect(lava.length).toBeGreaterThan(0);
    const { star, planet } = lava[0];
    const world = solidWorldOf(planet, star, seed, config);
    const view = new PlanetView(planet, star, towardStar, false, 0, { surface: new GlobeTextureCache().globeFor(planet, world, world.physics, seed) });
    expect(view.drawsSurface).toBe(true);
    expect(view.hasClouds).toBe(true);
  });

  it("shimmers when the planet is hot enough to melt, never under reduced motion", () => {
    const hot = lava.find(({ planet }) => planet.temperature > 1300)!;
    expect(shimmerOf(hot.planet)).toBe(1);
    const temperate = all.find(({ planet }) => planet.surface && planet.temperature < 400)!;
    expect(shimmerOf(temperate.planet)).toBe(0);
    expect(shimmerOf(giants[0].planet)).toBe(0);

    const world = solidWorldOf(hot.planet, hot.star, seed, config);
    const surface = new GlobeTextureCache().globeFor(hot.planet, world, world.physics, seed);
    const shimmer = (fade: boolean) => {
      const view = new PlanetView(hot.planet, hot.star, towardStar, fade, 0, { surface });
      const globe = view.scene.children.find((c) => c instanceof THREE.Mesh && c.renderOrder === 0) as THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial>;
      view.update(2000);
      return [globe.material.uniforms.shimmer.value, globe.material.uniforms.timeSeconds.value];
    };
    expect(shimmer(true)).toEqual([1, 2]);
    expect(shimmer(false)).toEqual([0, 0]);
  });

  it("glows in its blackbody colour: red-orange when barely molten, whiter when hotter", () => {
    const warm = glowColourOf(1200);
    const hot = glowColourOf(2800);
    expect(warm.r).toBeGreaterThan(warm.g);
    expect(warm.g).toBeGreaterThan(warm.b);
    expect(hot.b / hot.r).toBeGreaterThan(warm.b / Math.max(warm.r, 1e-9));
    expect(glowColourOf(500)).toEqual(glowColourOf(1000));   // held at the ramp's start
  });
});

describe("visual offsets", () => {
  it("are unchanged by A7: detail then clouds, the first six draws", () => {
    const { planet } = all[0];
    const rng = createRNG(mixSeed(seed, planet.hostStarId, planet.id, SALT.VISUAL));
    const draws = Array.from({ length: 6 }, () => rng() * 100);
    expect(noiseOffsetOf(planet, seed)).toEqual(draws.slice(0, 3));
    expect(cloudOffsetOf(planet, seed)).toEqual(draws.slice(3));
  });
});
