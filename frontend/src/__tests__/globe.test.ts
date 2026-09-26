import { describe, it, expect } from "vitest";
import * as THREE from "three";
import { cubeSphereGeometry } from "../rendering/planet/cubeSphere";
import { GlobeTextureCache, GLOBE_CACHE_SIZE, drawsSurface, noiseOffsetOf } from "../rendering/planet/globe";
import { PlanetView, globeOrientation, starlightIntensity } from "../rendering/planet/PlanetView";
import { generatePlanetsFor, solidWorldOf, GIANT_PLANET_MASS } from "../simulation/planet";
import type { Planet } from "../simulation/planet";
import { generateStarsFor, UNIVERSE_AGE_GYR } from "../simulation/star";
import type { Star } from "../simulation/star";
import { buildGalaxyConfig } from "../simulation/galaxy";
import { makeConfig } from "../simulation/config";

// Worlds Up Close A5: the globe mesh, its texture cache and the view that draws it.

const seed = 100000;
const config = makeConfig(seed);
const stars = generateStarsFor(buildGalaxyConfig(seed, config), UNIVERSE_AGE_GYR, config).stars.slice(0, 15);
const all: { star: Star; planet: Planet }[] = stars.flatMap((star) =>
  generatePlanetsFor(star, seed, config).planets.map((planet) => ({ star, planet })));
const drawn = all.filter(({ planet }) => drawsSurface(planet)).slice(0, 7);

describe("cube-sphere mesh", () => {
  const geometry = cubeSphereGeometry(8);
  const position = geometry.getAttribute("position");
  const index = geometry.getIndex()!;

  it("has 6 × n² quads on the unit sphere", () => {
    expect(index.count).toBe(6 * 8 * 8 * 6);
    for (let i = 0; i < position.count; i++) {
      expect(Math.hypot(position.getX(i), position.getY(i), position.getZ(i))).toBeCloseTo(1, 6);
    }
    expect(cubeSphereGeometry(128).getIndex()!.count).toBe(6 * 128 * 128 * 6);
  });

  it("faces every triangle outwards", () => {
    const [a, b, c] = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
    for (let t = 0; t < index.count; t += 3) {
      a.fromBufferAttribute(position, index.getX(t));
      b.fromBufferAttribute(position, index.getX(t + 1));
      c.fromBufferAttribute(position, index.getX(t + 2));
      const normal = b.clone().sub(a).cross(c.clone().sub(a));
      expect(normal.dot(a.clone().add(b).add(c))).toBeGreaterThan(0);
    }
  });
});

describe("which planets get a globe", () => {
  it("draws solid planets except lava worlds; giants stay plain", () => {
    for (const { planet } of all) {
      expect(drawsSurface(planet)).toBe(planet.mass <= GIANT_PLANET_MASS && planet.type !== "lava");
    }
    expect(drawn.length).toBeGreaterThan(GLOBE_CACHE_SIZE);
  });

  it("places each planet's detail noise from its own VISUAL stream", () => {
    const [p, q] = drawn;
    expect(noiseOffsetOf(p.planet, seed)).toEqual(noiseOffsetOf(p.planet, seed));
    expect(noiseOffsetOf(p.planet, seed)).not.toEqual(noiseOffsetOf(q.planet, seed));
    expect(noiseOffsetOf(p.planet, seed)).not.toEqual(noiseOffsetOf(p.planet, seed + 1));
  });
});

describe("globe texture cache", () => {
  it("keeps the last five planets' maps and frees older ones", () => {
    const cache = new GlobeTextureCache();
    const freed: string[] = [];
    const maps = drawn.map(({ star, planet }) => {
      const { map } = cache.surfaceFor(planet, solidWorldOf(planet, star, seed, config), seed);
      map.addEventListener("dispose", () => freed.push(planet.key));
      return map;
    });
    expect(cache.size).toBe(GLOBE_CACHE_SIZE);
    expect(freed).toEqual(drawn.slice(0, drawn.length - GLOBE_CACHE_SIZE).map(({ planet }) => planet.key));

    // A revisit reuses the map it already has
    const last = drawn[drawn.length - 1];
    expect(cache.surfaceFor(last.planet, solidWorldOf(last.planet, last.star, seed, config), seed).map).toBe(maps[maps.length - 1]);

    cache.clear();
    expect(cache.size).toBe(0);
    expect(freed.length).toBe(drawn.length);
  });
});

describe("globe view", () => {
  const { star, planet } = drawn[0];
  const world = solidWorldOf(planet, star, seed, config);
  const cache = new GlobeTextureCache();
  const surface = cache.surfaceFor(planet, world, seed);
  const towardStar = new THREE.Vector3(0, 0, 1);

  it("draws a solid planet with the globe shader and a plain sphere without a surface", () => {
    expect(new PlanetView(planet, star, towardStar, false, 0, { surface }).drawsSurface).toBe(true);
    expect(new PlanetView(planet, star, towardStar, false, 0).drawsSurface).toBe(false);
  });

  it("fades the globe in like the plain sphere", () => {
    const view = new PlanetView(planet, star, towardStar, true, 0, { surface });
    expect(view.opacity).toBe(0);
    view.update(200);
    expect(view.opacity).toBeCloseTo(0.5, 12);
    view.update(400);
    expect(view.opacity).toBe(1);
  });

  it("leaves the cached surface map alone when it is disposed", () => {
    let mapFreed = false;
    surface.map.addEventListener("dispose", () => { mapFreed = true; });
    new PlanetView(planet, star, towardStar, false, 0, { surface }).dispose();
    expect(mapFreed).toBe(false);
  });

  it("turns a locked planet's substellar point to its star, and tilts a free planet's spin axis", () => {
    const pole = (s: typeof surface, toward: THREE.Vector3) => new THREE.Vector3(0, 1, 0).applyQuaternion(globeOrientation(s, toward));
    const toward = new THREE.Vector3(3, 0, -4).normalize();
    expect(pole({ ...surface, tidallyLocked: true }, toward).distanceTo(toward)).toBeLessThan(1e-9);
    const spin = pole({ ...surface, tidallyLocked: false, axialTiltDeg: 23.5 }, toward);
    expect(THREE.MathUtils.radToDeg(spin.angleTo(new THREE.Vector3(0, 1, 0)))).toBeCloseTo(23.5, 9);
  });

  it("lights a planet by the fourth root of its starlight, within limits", () => {
    expect(starlightIntensity(1)).toBeCloseTo(2.6, 12);
    expect(starlightIntensity(16)).toBeCloseTo(2.6 * 1.6, 12);   // 16^¼ = 2, held at 1.6
    expect(starlightIntensity(0.5)).toBeCloseTo(2.6 * Math.pow(0.5, 0.25), 12);
    expect(starlightIntensity(1e-4)).toBeCloseTo(2.6 * 0.35, 12);
  });
});
