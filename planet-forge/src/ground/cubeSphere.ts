// The planet's surface as six cube faces bent onto the sphere, each split into
// a quadtree of square patches, the units the ground is built and drawn in.
//
// Mapping: a face point (u, v) in [−1, 1]² goes to the cube point
// N + tan(u·π/4)·U + tan(v·π/4)·V, then onto the sphere. The tangent (equal
// angle) spreads points far more evenly than the plain cube projection, whose
// squares shrink several times towards a face's corners. detmath's sin and
// cos, so the same mesh in every browser.
//
// Grid: a patch at level L has PATCH_QUADS × PATCH_QUADS squares. Its vertices
// are addressed by a face-wide integer index g = x·PATCH_QUADS + i at that
// level, and u = 2g / (PATCH_QUADS · 2^L) − 1. Neighbouring patches compute
// their shared edge from the same integers, so on one face it is identical;
// across faces it agrees to rounding, which the skirts hide.
//
// Faces wind the same way: N = U × V, so triangles (i, j), (i+1, j), (i, j+1)
// face outwards on every face.

import type { Vec3 } from "../forge/icosphere";
import { cos, sin } from "../forge/detmath";

/** Squares along a patch's edge; vertices are one more. */
export const PATCH_QUADS = 32;
export const PATCH_VERTICES = PATCH_QUADS + 1;

interface Face { n: Vec3; u: Vec3; v: Vec3 }

const FACES: Face[] = [
  { n: [1, 0, 0], u: [0, 0, -1], v: [0, 1, 0] },
  { n: [-1, 0, 0], u: [0, 0, 1], v: [0, 1, 0] },
  { n: [0, 1, 0], u: [1, 0, 0], v: [0, 0, -1] },
  { n: [0, -1, 0], u: [1, 0, 0], v: [0, 0, 1] },
  { n: [0, 0, 1], u: [1, 0, 0], v: [0, 1, 0] },
  { n: [0, 0, -1], u: [-1, 0, 0], v: [0, 1, 0] },
];

export interface PatchKey {
  face: number;
  level: number;
  x: number;
  y: number;
}

export function keyText({ face, level, x, y }: PatchKey): string {
  return `${face}/${level}/${x}/${y}`;
}

export function keyFromText(text: string): PatchKey {
  const [face, level, x, y] = text.split("/").map(Number);
  return { face, level, x, y };
}

/** The unit direction at a face point (u, v); u and v may go a little past ±1 (a patch's outer ring). */
export function faceDirection(face: number, u: number, v: number): Vec3 {
  const { n, u: U, v: V } = FACES[face];
  const a = u * (Math.PI / 4), b = v * (Math.PI / 4);
  const ta = sin(a) / cos(a), tb = sin(b) / cos(b);
  const x = n[0] + ta * U[0] + tb * V[0];
  const y = n[1] + ta * U[1] + tb * V[1];
  const z = n[2] + ta * U[2] + tb * V[2];
  const length = Math.sqrt(x * x + y * y + z * z);
  return [x / length, y / length, z / length];
}

/** The face coordinate of a face-wide vertex index at a level. */
export function faceCoordinate(index: number, level: number): number {
  return (2 * index) / (PATCH_QUADS * 2 ** level) - 1;
}

/** The unit direction of a patch's vertex (i, j), which may be −1 or PATCH_VERTICES (the outer ring, for normals). */
export function patchVertexDirection(key: PatchKey, i: number, j: number): Vec3 {
  return faceDirection(key.face, faceCoordinate(key.x * PATCH_QUADS + i, key.level), faceCoordinate(key.y * PATCH_QUADS + j, key.level));
}

/** A patch's centre direction. */
export function patchCentre(key: PatchKey): Vec3 {
  return patchVertexDirection(key, PATCH_QUADS / 2, PATCH_QUADS / 2);
}

/** About how long a patch's edge is on a sphere of this radius, m (its longest, at a face's centre). */
export function patchEdgeM(level: number, radiusM: number): number {
  return (radiusM * (Math.PI / 2)) / 2 ** level;
}

/** The four patches a patch splits into. */
export function children({ face, level, x, y }: PatchKey): PatchKey[] {
  const l = level + 1;
  return [
    { face, level: l, x: 2 * x, y: 2 * y }, { face, level: l, x: 2 * x + 1, y: 2 * y },
    { face, level: l, x: 2 * x, y: 2 * y + 1 }, { face, level: l, x: 2 * x + 1, y: 2 * y + 1 },
  ];
}

/** The patches a patch lies in, from its parent up to its face's top patch. */
export function ancestors({ face, level, x, y }: PatchKey): PatchKey[] {
  const out: PatchKey[] = [];
  for (let up = 1; up <= level; up++) out.push({ face, level: level - up, x: x >> up, y: y >> up });
  return out;
}

/** The six top-level patches. */
export function roots(): PatchKey[] {
  return FACES.map((_, face) => ({ face, level: 0, x: 0, y: 0 }));
}

/** The deepest level whose vertices are still at least `spacingM` apart. */
export function deepestLevel(radiusM: number, spacingM: number): number {
  let level = 0;
  while (patchEdgeM(level + 1, radiusM) / PATCH_QUADS >= spacingM) level++;
  return level;
}
