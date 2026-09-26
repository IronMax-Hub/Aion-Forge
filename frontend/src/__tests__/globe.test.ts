import { describe, it, expect } from "vitest";
import * as THREE from "three";
import { cubeSphereGeometry } from "../rendering/planet/cubeSphere";
import {
  CUBE_FACES, CUBE_ATLAS_GLSL, ATLAS_WIDTH, ATLAS_HEIGHT, FACE_BORDER, FACE_SIZE,
  atlasCoordinates, atlasDirection, faceOf, faceTile,
} from "../rendering/planet/cubeFaces";
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

describe("baked globe atlas", () => {
  it("maps every face's texels back to the directions they were baked for", () => {
    for (let face = 0; face < 6; face++) {
      const [x0, y0] = faceTile(face);
      for (const [i, j] of [[0, 0], [FACE_SIZE - 1, 0], [FACE_SIZE / 2, FACE_SIZE / 3], [7, FACE_SIZE - 1]]) {
        const x = x0 + FACE_BORDER + i + 0.5;
        const y = y0 + FACE_BORDER + j + 0.5;
        const direction = atlasDirection(x, y);
        expect(faceOf(direction)).toBe(face);
        const [u, v] = atlasCoordinates(direction);
        expect(u * ATLAS_WIDTH).toBeCloseTo(x, 6);
        expect(v * ATLAS_HEIGHT).toBeCloseTo(y, 6);
      }
    }
  });

  it("bakes each face's border from just beyond its edge, so filtering across an edge reads the neighbour's surface", () => {
    const [x0, y0] = faceTile(0);
    const inside = atlasDirection(x0 + FACE_BORDER + 0.5, y0 + FACE_BORDER + FACE_SIZE / 2);
    const border = atlasDirection(x0 + 0.5, y0 + FACE_BORDER + FACE_SIZE / 2);
    expect(faceOf(inside)).toBe(0);
    expect(faceOf(border)).not.toBe(0);
    // Adjacent texels, about one texel apart on the sphere
    const angle = Math.acos(inside[0] * border[0] + inside[1] * border[1] + inside[2] * border[2]);
    expect(angle).toBeLessThan((FACE_BORDER + 1) * (2 / FACE_SIZE));
  });

  it("writes the same face table into the shaders", () => {
    CUBE_FACES.forEach(([n], face) => expect(CUBE_ATLAS_GLSL).toContain(`face == ${face}) { normal = vec3(${n[0]}.0, ${n[1]}.0, ${n[2]}.0)`));
  });
});

describe("which planets get a globe", () => {
  it("draws every solid planet's surface, lava worlds included; giants get bands instead", () => {
    for (const { planet } of all) {
      expect(drawsSurface(planet)).toBe(planet.mass <= GIANT_PLANET_MASS);
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
  it("keeps the last five planets' baked globes and frees older ones", () => {
    const cache = new GlobeTextureCache();
    const freed: string[] = [];
    const bakes = drawn.map(({ star, planet }) => {
      const world = solidWorldOf(planet, star, seed, config);
      const { bake } = cache.globeFor(planet, world, world.physics, seed);
      bake.target.addEventListener("dispose", () => freed.push(planet.key));
      return bake;
    });
    expect(cache.size).toBe(GLOBE_CACHE_SIZE);
    expect(freed).toEqual(drawn.slice(0, drawn.length - GLOBE_CACHE_SIZE).map(({ planet }) => planet.key));

    // A revisit reuses the bake it already has
    const last = drawn[drawn.length - 1];
    const lastWorld = solidWorldOf(last.planet, last.star, seed, config);
    expect(cache.globeFor(last.planet, lastWorld, lastWorld.physics, seed).bake).toBe(bakes[bakes.length - 1]);

    cache.clear();
    expect(cache.size).toBe(0);
    expect(freed.length).toBe(drawn.length);
  });
});

describe("globe view", () => {
  const { star, planet } = drawn[0];
  const world = solidWorldOf(planet, star, seed, config);
  const cache = new GlobeTextureCache();
  const surface = cache.globeFor(planet, world, world.physics, seed);
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

  it("leaves the cached bake alone when it is disposed", () => {
    let bakeFreed = false;
    surface.bake.target.addEventListener("dispose", () => { bakeFreed = true; });
    new PlanetView(planet, star, towardStar, false, 0, { surface }).dispose();
    expect(bakeFreed).toBe(false);
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
