import { describe, expect, it } from "vitest";
import type { Vec3 } from "../forge/icosphere";
import { presetSpec } from "../spec/presetFiles";
import { createMaterials } from "../terrain/materials";
import { createTerrain } from "../terrain/terrain";
import { directionOf } from "../terrain/landing";
import {
  children, deepestLevel, faceDirection, keyFromText, keyText, PATCH_QUADS, PATCH_VERTICES, patchEdgeM, patchVertexDirection, roots,
} from "./cubeSphere";
import type { PatchKey } from "./cubeSphere";
import { buildPatch, edgeVertices, patchIndices, SKIRT_VERTICES } from "./patchBuilder";
import { aboveHorizon, selectPatches } from "./quadtree";
import type { SelectionInput } from "./quadtree";

const length = ([x, y, z]: readonly number[]) => Math.sqrt(x * x + y * y + z * z);
const close = (a: Vec3, b: Vec3, tolerance: number) => a.every((v, k) => Math.abs(v - b[k]) <= tolerance);

describe("the cube sphere", () => {
  it("maps every face point to a unit direction, face centres to the axes", () => {
    for (let face = 0; face < 6; face++) {
      for (const [u, v] of [[0, 0], [1, 1], [-1, 0.3], [0.7, -1], [1.02, -1.02]]) {
        expect(length(faceDirection(face, u, v))).toBeCloseTo(1, 14);
      }
    }
    expect(faceDirection(0, 0, 0)).toEqual([1, 0, 0]);
    expect(faceDirection(3, 0, 0)).toEqual([0, -1, 0]);
  });

  it("gives neighbouring patches on one face identical edge vertices", () => {
    const a: PatchKey = { face: 2, level: 3, x: 4, y: 5 }, b: PatchKey = { face: 2, level: 3, x: 5, y: 5 }, c: PatchKey = { face: 2, level: 3, x: 4, y: 6 };
    for (let k = 0; k <= PATCH_QUADS; k++) {
      expect(patchVertexDirection(a, PATCH_QUADS, k)).toEqual(patchVertexDirection(b, 0, k));
      expect(patchVertexDirection(a, k, PATCH_QUADS)).toEqual(patchVertexDirection(c, k, 0));
    }
  });

  it("joins faces at their edges, to rounding", () => {
    // +X at u = 1 meets −Z at u = −1; +Y at v = −1 meets +Z at v = 1
    for (const v of [-1, -0.4, 0, 0.8, 1]) {
      expect(close(faceDirection(0, 1, v), faceDirection(5, -1, v), 1e-12)).toBe(true);
      expect(close(faceDirection(2, v, -1), faceDirection(4, v, 1), 1e-12)).toBe(true);
    }
  });

  it("splits a patch into four children covering it", () => {
    const parent: PatchKey = { face: 4, level: 2, x: 1, y: 3 };
    const kids = children(parent);
    expect(patchVertexDirection(kids[0], 0, 0)).toEqual(patchVertexDirection(parent, 0, 0));
    expect(patchVertexDirection(kids[3], PATCH_QUADS, PATCH_QUADS)).toEqual(patchVertexDirection(parent, PATCH_QUADS, PATCH_QUADS));
    expect(patchVertexDirection(kids[1], 0, 0)).toEqual(patchVertexDirection(parent, PATCH_QUADS / 2, 0));
    expect(keyFromText(keyText(parent))).toEqual(parent);
  });

  it("stops splitting where vertices would come closer than asked", () => {
    const R = 6_371_000;
    const level = deepestLevel(R, 1);
    expect(patchEdgeM(level, R) / PATCH_QUADS).toBeGreaterThanOrEqual(1);
    expect(patchEdgeM(level + 1, R) / PATCH_QUADS).toBeLessThan(1);
  });
});

describe("choosing patches", () => {
  const R = 6_371_000;
  const site = directionOf(10, 20);
  const input = (heightM: number, isBuilt: (key: string) => boolean): SelectionInput => ({
    camera: [site[0] * (R + heightM), site[1] * (R + heightM), site[2] * (R + heightM)],
    radiusM: R, highestM: 3000, lowestM: -4000, splitFactor: 2, deepestLevel: deepestLevel(R, 1), isBuilt,
  });

  it("draws finer patches near the camera, down to the deepest level", () => {
    const { draw, build } = selectPatches(input(2, () => true));
    expect(build).toEqual([]);
    const deepest = Math.max(...draw.map((k) => k.level));
    expect(deepest).toBe(deepestLevel(R, 1));
    expect(draw.length).toBeLessThan(2000);
    // The finest patch contains the site
    const finest = draw.filter((k) => k.level === deepest);
    expect(finest.some((k) => {
      const c = patchVertexDirection(k, PATCH_QUADS / 2, PATCH_QUADS / 2);
      return length([c[0] - site[0], c[1] - site[1], c[2] - site[2]]) * R < patchEdgeM(k.level, R);
    })).toBe(true);
  });

  it("skips what is behind the horizon", () => {
    const low = input(2, () => true);
    expect(aboveHorizon(low, { face: 0, level: 0, x: 0, y: 0 })).toBe(true);
    const opposite = roots().find((k) => {
      const c = patchVertexDirection(k, PATCH_QUADS / 2, PATCH_QUADS / 2);
      return c[0] * site[0] + c[1] * site[1] + c[2] * site[2] < -0.8;
    })!;
    expect(aboveHorizon(low, opposite)).toBe(false);
  });

  it("keeps a parent on screen until all its children are built, and asks for them nearest first", () => {
    const built = new Set(roots().map(keyText));
    const { draw, build } = selectPatches(input(2, (k) => built.has(k)));
    expect(draw.every((k) => k.level === 0)).toBe(true);
    expect(build.length).toBeGreaterThan(0);
    expect(build.every((k) => k.level === 1)).toBe(true);
  });
});

describe("building a patch", () => {
  const spec = presetSpec("earth-like");
  const terrain = createTerrain(spec);
  const materials = createMaterials(spec);
  const cover: Vec3 = [0.05, 0.12, 0.03];
  // A coastal patch at level 6: some ground below the sea, some above
  const key = (() => {
    // Level 6 has 64 patches along a face's edge
    for (let x = 0; x < 64; x += 3) {
      for (let y = 0; y < 64; y += 3) {
        const k: PatchKey = { face: 4, level: 6, x, y };
        const q = PATCH_QUADS;
        const h = [[0, 0], [q, q], [0, q], [q, 0]].map(([i, j]) => terrain.heightM(patchVertexDirection(k, i, j), 1e5));
        if (Math.min(...h) < -50 && Math.max(...h) > 50) return k;
      }
    }
    throw new Error("no coastal patch found");
  })();
  const patch = buildPatch(terrain, materials, cover, key);
  const n = PATCH_VERTICES;

  it("has its grid and skirt vertices, and indices within them", () => {
    expect(patch.positions.length).toBe((n * n + SKIRT_VERTICES) * 3);
    const indices = patchIndices();
    expect(indices.length).toBe(PATCH_QUADS * PATCH_QUADS * 6 + SKIRT_VERTICES * 6);
    expect(Math.max(...indices)).toBe(n * n + SKIRT_VERTICES - 1);
    expect(new Set(edgeVertices()).size).toBe(SKIRT_VERTICES);
  });

  it("puts each vertex at the terrain's height, at the patch's level of detail", () => {
    const spacing = patchEdgeM(key.level, terrain.radiusM) / PATCH_QUADS;
    for (const [i, j] of [[0, 0], [5, PATCH_QUADS - 3], [PATCH_QUADS, PATCH_QUADS], [PATCH_QUADS / 2, 7]]) {
      const v = j * n + i;
      const world = [0, 1, 2].map((k) => patch.origin[k] + patch.positions[v * 3 + k]);
      const expected = terrain.heightM(patchVertexDirection(key, i, j), 2 * spacing);
      // Float32 positions relative to the origin: within a few centimetres on a 150 km patch
      expect(Math.abs(length(world) - terrain.radiusM - expected)).toBeLessThan(0.05);
    }
  });

  it("gives unit normals facing outwards, and colours within range", () => {
    for (let v = 0; v < n * n; v++) {
      const normal = [patch.normals[v * 3], patch.normals[v * 3 + 1], patch.normals[v * 3 + 2]];
      expect(length(normal)).toBeCloseTo(1, 5);
      const d = patchVertexDirection(key, v % n, Math.floor(v / n));
      expect(normal[0] * d[0] + normal[1] * d[1] + normal[2] * d[2]).toBeGreaterThan(0);
    }
    for (const c of patch.colours) expect(c >= 0 && c <= 1).toBe(true);
  });

  it("faces its skirts outwards from the patch, the side a crack shows them from", () => {
    const indices = patchIndices();
    const grid = PATCH_QUADS * PATCH_QUADS * 6;
    const at = (v: number) => [0, 1, 2].map((k) => patch.positions[v * 3 + k]);
    const centre = at(Math.floor(n * n / 2));
    for (let t = grid; t < indices.length; t += 3) {
      const [a, b, c] = [at(indices[t]), at(indices[t + 1]), at(indices[t + 2])];
      const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], ac = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
      const normal = [ab[1] * ac[2] - ab[2] * ac[1], ab[2] * ac[0] - ab[0] * ac[2], ab[0] * ac[1] - ab[1] * ac[0]];
      const outwards = [a[0] - centre[0], a[1] - centre[1], a[2] - centre[2]];
      expect(normal[0] * outwards[0] + normal[1] * outwards[1] + normal[2] * outwards[2]).toBeGreaterThan(0);
    }
  });

  it("hangs skirts below the edge", () => {
    edgeVertices().forEach((v, k) => {
      const s = n * n + k;
      const top = length([0, 1, 2].map((a) => patch.origin[a] + patch.positions[v * 3 + a]));
      const low = length([0, 1, 2].map((a) => patch.origin[a] + patch.positions[s * 3 + a]));
      expect(low).toBeLessThan(top);
    });
  });

  it("adds water where the ground dips below the sea, with the shoreline where the depth crosses 0", () => {
    expect(patch.water).not.toBeNull();
    expect(patch.lowestM).toBeLessThan(0);
    const depths = [...patch.water!.depth.slice(0, n * n)];
    expect(depths.some((d) => d > 0) && depths.some((d) => d < 0)).toBe(true);
    // A dry inland patch has none
    const dry = buildPatch(createTerrain(presetSpec("lava")), createMaterials(presetSpec("lava")), null, { face: 0, level: 5, x: 3, y: 4 });
    expect(dry.water).toBeNull();
  });

  it("builds the same patch from the same spec", () => {
    expect(buildPatch(terrain, materials, cover, key)).toEqual(patch);
  });

  it("matches its neighbour's shared edge", () => {
    const right = buildPatch(terrain, materials, cover, { ...key, x: key.x + 1 });
    for (let j = 0; j < n; j += 4) {
      const a = [0, 1, 2].map((k) => patch.origin[k] + patch.positions[(j * n + PATCH_QUADS) * 3 + k]);
      const b = [0, 1, 2].map((k) => right.origin[k] + right.positions[(j * n) * 3 + k]);
      // The same direction and height in doubles; Float32 around each patch's own origin differs by under a few centimetres
      expect(length([a[0] - b[0], a[1] - b[1], a[2] - b[2]])).toBeLessThan(0.1);
    }
  });
});
