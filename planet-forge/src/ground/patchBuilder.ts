// Building one patch of ground: its vertices, normals, colours and skirts,
// and its water, as typed arrays ready for the GPU. Runs in a worker
// (patch.worker.ts); pure, so it is tested in Node.
//
// - Vertices: PATCH_VERTICES² from terrain.sample, with detail down to twice
//   the vertex spacing (finer detail would only alias).
// - Normals: from the neighbours, using one extra ring of heights outside the
//   patch, so lighting is continuous across patch edges.
// - Precision: positions relative to the patch's centre at sea level, in
//   metres; the renderer places each patch relative to the camera.
// - Skirts: each edge vertex is repeated below itself, closing the cracks
//   where patches of different detail meet. Deep enough for the sag of the
//   coarser neighbour's straight edges over the curved sphere and a few
//   vertex spacings of relief.
// - Colours: the terrain's materials (slope from the normal) in Aion Forge's
//   palette (palette.ts), and molten ground's glow.
// - Water: if any vertex is below sea level, a second grid at sea level, with
//   skirts of its own (a coarser neighbour's flat edge sags below the sphere
//   too), whose vertices carry the water's depth: positive under water,
//   negative on land and dry seabed, so the shoreline falls where it crosses 0.

import type { Vec3 } from "../forge/icosphere";
import type { Terrain } from "../terrain/terrain";
import type { Materials } from "../terrain/materials";
import type { GroundSample } from "../terrain/terrain";
import type { PatchKey } from "./cubeSphere";
import { PATCH_QUADS, PATCH_VERTICES, patchCentre, patchEdgeM, patchVertexDirection } from "./cubeSphere";
import { groundLook } from "./palette";

/** Vertices along a patch's four edges, each repeated as a skirt. */
export const SKIRT_VERTICES = 4 * PATCH_QUADS;
/** A dry seabed's depth: below 0, so no water is drawn there. */
const DRY_DEPTH_M = -1;
const DEGREE = Math.PI / 180;

export interface PatchData {
  key: PatchKey;
  /** The patch's origin: its centre at sea level, m from the planet's centre. */
  origin: [number, number, number];
  /** PATCH_VERTICES² grid vertices, then SKIRT_VERTICES skirt vertices; xyz relative to the origin. */
  positions: Float32Array;
  normals: Float32Array;
  colours: Float32Array;
  glow: Float32Array;
  /** Lowest and highest ground, m above sea level. */
  lowestM: number;
  highestM: number;
  /** Null when no ground is below sea level; laid out as the ground, skirts included. */
  water: {
    positions: Float32Array;
    depth: Float32Array;
    seaIce: Float32Array;
  } | null;
}

/** The order of a patch's edge vertices for its skirts: bottom, right, top, left, each PATCH_QUADS long. */
export function edgeVertices(): number[] {
  const n = PATCH_VERTICES, last = PATCH_QUADS;
  const edge: number[] = [];
  for (let i = 0; i < last; i++) edge.push(i);                    // j = 0
  for (let j = 0; j < last; j++) edge.push(j * n + last);         // i = last
  for (let i = last; i > 0; i--) edge.push(last * n + i);         // j = last
  for (let j = last; j > 0; j--) edge.push(j * n);                // i = 0
  return edge;
}

const EDGE = edgeVertices();

/** Triangle indices shared by every patch: the grid, facing outwards, then the skirts. */
export function patchIndices(): Uint32Array {
  const n = PATCH_VERTICES;
  const indices: number[] = [];
  for (let j = 0; j < PATCH_QUADS; j++) {
    for (let i = 0; i < PATCH_QUADS; i++) {
      const a = j * n + i, b = a + 1, c = a + n, d = c + 1;
      indices.push(a, b, c, b, d, c);
    }
  }
  // Skirts: each edge segment and the segment below it, facing outwards from the patch (the edges run
  // anticlockwise seen from outside), the side a crack between patches shows them from
  const grid = n * n;
  for (let k = 0; k < SKIRT_VERTICES; k++) {
    const top0 = EDGE[k], top1 = EDGE[(k + 1) % SKIRT_VERTICES];
    const low0 = grid + k, low1 = grid + ((k + 1) % SKIRT_VERTICES);
    indices.push(top0, low0, top1, top1, low0, low1);
  }
  return new Uint32Array(indices);
}

function sub(a: number[], b: number[]): Vec3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

/** Builds one patch. `materials` and `cover` are the planet's (createMaterials, its ground-cover colour). */
export function buildPatch(
  terrain: Terrain, materials: (sample: GroundSample, slopeDeg: number) => Materials, cover: Vec3 | null, key: PatchKey,
): PatchData {
  const R = terrain.radiusM;
  const n = PATCH_VERTICES;
  const spacing = patchEdgeM(key.level, R) / PATCH_QUADS;
  const finest = 2 * spacing;
  const centre = patchCentre(key);
  const origin: [number, number, number] = [centre[0] * R, centre[1] * R, centre[2] * R];

  // Positions of the grid and its outer ring, in doubles: (n + 2)² from index −1 to n
  const ring = n + 2;
  const world = new Float64Array(ring * ring * 3);
  const samples: GroundSample[] = new Array(n * n);
  const directions: Vec3[] = new Array(n * n);
  for (let j = -1; j <= n; j++) {
    for (let i = -1; i <= n; i++) {
      const d = patchVertexDirection(key, i, j);
      const inside = i >= 0 && j >= 0 && i < n && j < n;
      let h: number;
      if (inside) {
        const s = terrain.sample(d, finest);
        samples[j * n + i] = s;
        directions[j * n + i] = d;
        h = s.groundM;
      } else {
        h = terrain.heightM(d, finest);
      }
      const at = ((j + 1) * ring + (i + 1)) * 3;
      world[at] = d[0] * (R + h);
      world[at + 1] = d[1] * (R + h);
      world[at + 2] = d[2] * (R + h);
    }
  }
  const worldAt = (i: number, j: number) => {
    const at = ((j + 1) * ring + (i + 1)) * 3;
    return [world[at], world[at + 1], world[at + 2]];
  };

  const vertexCount = n * n + SKIRT_VERTICES;
  const positions = new Float32Array(vertexCount * 3);
  const normals = new Float32Array(vertexCount * 3);
  const colours = new Float32Array(vertexCount * 3);
  const glow = new Float32Array(vertexCount);
  let lowestM = Infinity, highestM = -Infinity, anyBelowSea = false;

  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const v = j * n + i;
      const p = worldAt(i, j);
      positions[v * 3] = p[0] - origin[0];
      positions[v * 3 + 1] = p[1] - origin[1];
      positions[v * 3 + 2] = p[2] - origin[2];

      const du = sub(worldAt(i + 1, j), worldAt(i - 1, j));
      const dv = sub(worldAt(i, j + 1), worldAt(i, j - 1));
      let nx = du[1] * dv[2] - du[2] * dv[1], ny = du[2] * dv[0] - du[0] * dv[2], nz = du[0] * dv[1] - du[1] * dv[0];
      const length = Math.sqrt(nx * nx + ny * ny + nz * nz);
      nx /= length; ny /= length; nz /= length;
      normals[v * 3] = nx; normals[v * 3 + 1] = ny; normals[v * 3 + 2] = nz;

      const s = samples[v], d = directions[v];
      const up = Math.max(-1, Math.min(1, nx * d[0] + ny * d[1] + nz * d[2]));
      const slopeDeg = Math.acos(up) / DEGREE;
      const look = groundLook(materials(s, slopeDeg), s.temperatureK, s.moisture, s.groundM, cover);
      colours[v * 3] = look.colour[0]; colours[v * 3 + 1] = look.colour[1]; colours[v * 3 + 2] = look.colour[2];
      glow[v] = look.glow;

      lowestM = Math.min(lowestM, s.groundM);
      highestM = Math.max(highestM, s.groundM);
      if (s.groundM < 0) anyBelowSea = true;
    }
  }

  // Skirts: the sag of a coarser neighbour's edge (spacing twice this one's) plus a few spacings of relief
  const skirtM = (2 * spacing) * (2 * spacing) / (8 * R) * 2 + 4 * spacing;
  EDGE.forEach((v, k) => {
    const s = n * n + k, d = directions[v];
    positions[s * 3] = positions[v * 3] - d[0] * skirtM;
    positions[s * 3 + 1] = positions[v * 3 + 1] - d[1] * skirtM;
    positions[s * 3 + 2] = positions[v * 3 + 2] - d[2] * skirtM;
    normals.copyWithin(s * 3, v * 3, v * 3 + 3);
    colours.copyWithin(s * 3, v * 3, v * 3 + 3);
    glow[s] = glow[v];
  });

  let water: PatchData["water"] = null;
  if (anyBelowSea) {
    const wp = new Float32Array(vertexCount * 3), depth = new Float32Array(vertexCount), seaIce = new Float32Array(vertexCount);
    for (let v = 0; v < n * n; v++) {
      const d = directions[v], s = samples[v];
      wp[v * 3] = d[0] * R - origin[0];
      wp[v * 3 + 1] = d[1] * R - origin[1];
      wp[v * 3 + 2] = d[2] * R - origin[2];
      const wet = s.surface === "water" || s.surface === "seaIce";
      depth[v] = wet ? -s.groundM : s.groundM < 0 ? DRY_DEPTH_M : -s.groundM;
      seaIce[v] = s.surface === "seaIce" ? 1 : 0;
    }
    const sagM = (2 * spacing) * (2 * spacing) / (8 * R) * 2;
    EDGE.forEach((v, k) => {
      const w = n * n + k, d = directions[v];
      wp[w * 3] = wp[v * 3] - d[0] * sagM;
      wp[w * 3 + 1] = wp[v * 3 + 1] - d[1] * sagM;
      wp[w * 3 + 2] = wp[v * 3 + 2] - d[2] * sagM;
      depth[w] = depth[v];
      seaIce[w] = seaIce[v];
    });
    water = { positions: wp, depth, seaIce };
  }

  return { key, origin, positions, normals, colours, glow, lowestM, highestM, water };
}
