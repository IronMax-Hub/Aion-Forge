import { describe, it, expect } from "vitest";
import * as THREE from "three";
import { cubeSphereGeometry } from "../rendering/planet/cubeSphere";
import {
  CUBE_FACES, CUBE_ATLAS_GLSL, ATLAS_WIDTH, ATLAS_HEIGHT, FACE_BORDER, FACE_SIZE,
  atlasCoordinates, atlasDirection, faceOf, faceTile, cubeAtlas, PLANET_ATLAS,
} from "../rendering/planet/cubeFaces";
import { PLANET_DETAIL, SYSTEM_DETAIL } from "../rendering/planet/globeBake";
import { GlobeTextureCache, GLOBE_CACHE_SIZE, drawsSurface, noiseOffsetOf } from "../rendering/planet/globe";
import { PlanetView, SECONDS_PER_ROTATION, globeMaterial, globeOrientation, spinAngle, starlightIntensity } from "../rendering/planet/PlanetView";
import { axisFrame } from "../rendering/planet/surfaceMap";
import { derivePhysics } from "../simulation/planetPhysics";
import { surfaceGrid } from "../simulation/geography";
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

  it("lays out a smaller atlas the same way, for the system view", () => {
    expect([PLANET_ATLAS.width, PLANET_ATLAS.height]).toEqual([ATLAS_WIDTH, ATLAS_HEIGHT]);
    expect(PLANET_ATLAS.faceTile(4)).toEqual(faceTile(4));
    const small = cubeAtlas(256);
    const tile = 256 + 2 * FACE_BORDER;
    expect([small.width, small.height]).toEqual([3 * tile, 2 * tile]);
    expect(small.faceTile(5)).toEqual([2 * tile, tile, tile, tile]);
    expect(small.glsl).toContain("const float FACE_SIZE = 256.0;");
    expect(small.glsl).toContain(`const vec2 ATLAS_SIZE = vec2(${3 * tile}.0, ${2 * tile}.0);`);
  });

  it("bakes the system view's globes at a quarter of the planet view's texels, one octave of detail fewer", () => {
    expect(SYSTEM_DETAIL.atlas.faceSize ** 2 * 4).toBe(PLANET_DETAIL.atlas.faceSize ** 2);
    expect(SYSTEM_DETAIL.mapWidth * SYSTEM_DETAIL.mapHeight * 4).toBe(PLANET_DETAIL.mapWidth * PLANET_DETAIL.mapHeight);
    expect(SYSTEM_DETAIL.detailOctaves).toBe(PLANET_DETAIL.detailOctaves - 1);
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

// Worlds Up Close A8: free planets turn, locked planets keep one face to their star.
describe("rotation", () => {
  const withPhysics = all.filter(({ planet }) => drawsSurface(planet))
    .map((entry) => ({ ...entry, physics: derivePhysics(entry.planet, entry.star, seed, config) }));
  const free = withPhysics.find(({ physics }) => !physics.tidallyLocked)!;
  const locked = withPhysics.find(({ physics }) => physics.tidallyLocked)!;
  const cache = new GlobeTextureCache();
  const surfaceOf = ({ star, planet }: { star: Star; planet: Planet }) => {
    const world = solidWorldOf(planet, star, seed, config);
    return { world, surface: cache.globeFor(planet, world, world.physics, seed) };
  };

  it("compresses one rotation into a minute on screen", () => {
    expect(SECONDS_PER_ROTATION).toBe(60);
    expect(spinAngle(60_000)).toBeCloseTo(2 * Math.PI, 12);
    expect(spinAngle(15_000)).toBeCloseTo(Math.PI / 2, 12);
  });

  it("turns a free planet about its pole, and holds it still under reduced motion", () => {
    const { surface } = surfaceOf(free);
    expect(surface.spins).toBe(true);
    const toward = new THREE.Vector3(1, 0, 0);
    const turning = new PlanetView(free.planet, free.star, toward, true, 0, { surface });
    turning.update(15_000);
    expect(turning.globeTurn).toBeCloseTo(Math.PI / 2, 6);
    // The spin axis itself stays put
    const pole = new THREE.Vector3(0, 1, 0).applyQuaternion(globeOrientation(surface, toward));
    expect(turning.worldDirectionOf(new THREE.Vector3(0, 1, 0)).distanceTo(pole)).toBeLessThan(1e-9);
    // The clouds turn with the ground: only their slow drift separates them
    expect(turning.cloudTurn).toBeLessThan(0.2);

    const still = new PlanetView(free.planet, free.star, toward, false, 0, { surface });
    still.update(15_000);
    expect(still.globeTurn).toBeCloseTo(0, 6);
  });

  it("keeps a locked planet's warmest cell facing its star from every direction and at every moment", () => {
    const { world, surface } = surfaceOf(locked);
    expect(surface.spins).toBe(false);
    const temperatures = world.history.present.cellTemperatureK;
    let warmest = 0;
    for (let i = 1; i < temperatures.length; i++) if (temperatures[i] > temperatures[warmest]) warmest = i;
    // The cell's direction in the globe's own frame: (east, axis, third) → (x, y, z)
    const cell = surfaceGrid().positions[warmest];
    const { east, axis, third } = axisFrame();
    const d = (v: number[]) => v[0] * cell[0] + v[1] * cell[1] + v[2] * cell[2];
    const local = new THREE.Vector3(d(east), d(axis), d(third));

    for (const toward of [[1, 0, 0], [0, 0, -1], [-3, 1, 4], [0.2, -1, 0.5]].map(([x, y, z]) => new THREE.Vector3(x, y, z).normalize())) {
      const view = new PlanetView(locked.planet, locked.star, toward, true, 0, { surface });
      for (const nowMs of [0, 15_000, 40_000]) {
        view.update(nowMs);
        expect(view.globeTurn).toBeCloseTo(0, 6);
        // Within 20°: the substellar band is 10° wide, and land and sea shift the warmest cell within it
        expect(THREE.MathUtils.radToDeg(view.worldDirectionOf(local).angleTo(toward))).toBeLessThan(20);
      }
    }
  });
});

describe("system-view globes", () => {
  const { star, planet } = drawn[0];
  const world = solidWorldOf(planet, star, seed, config);
  const look = {
    toStar: new THREE.Vector3(1, 0, 0), starColor: new THREE.Color(1, 1, 1), starIntensity: 2.6,
    opacity: 1, glowColour: new THREE.Color(1, 0.5, 0), shimmer: 0,
  };

  it("are baked into their own, smaller atlas and drawn with that atlas's mappings", () => {
    const surface = new GlobeTextureCache(4, SYSTEM_DETAIL).globeFor(planet, world, world.physics, seed);
    expect(surface.bake.atlas).toBe(SYSTEM_DETAIL.atlas);
    const material = globeMaterial(surface, { ...look, cloudsOnGround: true });
    expect(material.fragmentShader).toContain("const float FACE_SIZE = 256.0;");
    expect(material.uniforms.cloudsOnGround.value).toBe(1);
    surface.bake.dispose();
  });

  it("leave the planet view's globe and its cloud sphere as they were", () => {
    const surface = new GlobeTextureCache().globeFor(planet, world, world.physics, seed);
    const material = globeMaterial(surface, { ...look, cloudsOnGround: false });
    expect(material.fragmentShader.startsWith(CUBE_ATLAS_GLSL)).toBe(true);
    expect(material.uniforms.cloudsOnGround.value).toBe(0);
    surface.bake.dispose();
  });
});
