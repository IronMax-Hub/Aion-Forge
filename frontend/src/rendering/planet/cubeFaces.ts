// The six faces of a cube around a planet, and the atlas that holds a baked
// globe's faces side by side (Worlds Up Close A5).
//
// Why it exists: the globe is shaded once per planet into an atlas (globeBake.ts)
// and read back every frame (globe.frag.glsl). Both sides, and the cube-sphere
// mesh, must agree on which face is which and how a direction maps into a face,
// so the table lives here once and is written into the shaders as GLSL.
//
// How: face f covers the directions normal + a·u + b·v, with a and b in −1…1
// (a plain cube map). In the atlas, faces sit in 3 columns × 2 rows of tiles.
// Each tile carries a border of FACE_BORDER texels baked from just beyond its
// edge, so filtering near an edge reads the right neighbouring surface, never
// the next tile.

import type * as THREE from "three";

// Each face: the axis it faces, and two axes across it with u × v = normal
export const CUBE_FACES: [THREE.Vector3Tuple, THREE.Vector3Tuple, THREE.Vector3Tuple][] = [
  [[1, 0, 0], [0, 0, -1], [0, 1, 0]],
  [[-1, 0, 0], [0, 0, 1], [0, 1, 0]],
  [[0, 1, 0], [1, 0, 0], [0, 0, -1]],
  [[0, -1, 0], [1, 0, 0], [0, 0, 1]],
  [[0, 0, 1], [1, 0, 0], [0, 1, 0]],
  [[0, 0, -1], [-1, 0, 0], [0, 1, 0]],
];

/** Texels across one face in the atlas, not counting its border. */
export const FACE_SIZE = 512;
/** Texels baked beyond each face edge. */
export const FACE_BORDER = 4;
export const ATLAS_COLUMNS = 3;
export const ATLAS_ROWS = 2;
const TILE = FACE_SIZE + 2 * FACE_BORDER;
export const ATLAS_WIDTH = ATLAS_COLUMNS * TILE;
export const ATLAS_HEIGHT = ATLAS_ROWS * TILE;

/** The face a direction falls on: the axis it points along most. */
export function faceOf([x, y, z]: THREE.Vector3Tuple): number {
  const [ax, ay, az] = [Math.abs(x), Math.abs(y), Math.abs(z)];
  if (ax >= ay && ax >= az) return x > 0 ? 0 : 1;
  if (ay >= az) return y > 0 ? 2 : 3;
  return z > 0 ? 4 : 5;
}

/** Where a direction lands in the atlas, 0–1 in each axis. */
export function atlasCoordinates(direction: THREE.Vector3Tuple): [number, number] {
  const face = faceOf(direction);
  const [normal, u, v] = CUBE_FACES[face];
  const dot = (w: THREE.Vector3Tuple) => w[0] * direction[0] + w[1] * direction[1] + w[2] * direction[2];
  const along = dot(normal);
  const a = dot(u) / along;
  const b = dot(v) / along;
  const column = face % ATLAS_COLUMNS;
  const row = Math.floor(face / ATLAS_COLUMNS);
  return [
    (column * TILE + FACE_BORDER + ((a + 1) / 2) * FACE_SIZE) / ATLAS_WIDTH,
    (row * TILE + FACE_BORDER + ((b + 1) / 2) * FACE_SIZE) / ATLAS_HEIGHT,
  ];
}

/** The unit direction an atlas texel is baked for, from its pixel coordinates (texel centres at +0.5). */
export function atlasDirection(x: number, y: number): THREE.Vector3Tuple {
  const column = Math.min(ATLAS_COLUMNS - 1, Math.floor(x / TILE));
  const row = Math.min(ATLAS_ROWS - 1, Math.floor(y / TILE));
  const [normal, u, v] = CUBE_FACES[row * ATLAS_COLUMNS + column];
  const a = ((x - column * TILE - FACE_BORDER) / FACE_SIZE) * 2 - 1;
  const b = ((y - row * TILE - FACE_BORDER) / FACE_SIZE) * 2 - 1;
  const d: THREE.Vector3Tuple = [0, 1, 2].map((k) => normal[k] + a * u[k] + b * v[k]) as THREE.Vector3Tuple;
  const length = Math.hypot(...d);
  return [d[0] / length, d[1] / length, d[2] / length];
}

/** The pixel rectangle of a face's tile, border included: x, y, width, height. */
export function faceTile(face: number): [number, number, number, number] {
  return [(face % ATLAS_COLUMNS) * TILE, Math.floor(face / ATLAS_COLUMNS) * TILE, TILE, TILE];
}

const vec3 = ([x, y, z]: THREE.Vector3Tuple) => `vec3(${x}.0, ${y}.0, ${z}.0)`;

/**
 * The same table and mappings in GLSL: atlasCoordinates(direction[, u]) and
 * atlasDirection(pixel, u), where u is the face's first axis; plus the relief
 * tilt encoding, for the shaders to include.
 */
export const CUBE_ATLAS_GLSL = `
const float FACE_SIZE = ${FACE_SIZE}.0;
const float FACE_BORDER = ${FACE_BORDER}.0;
const float TILE = FACE_SIZE + 2.0 * FACE_BORDER;
const vec2 ATLAS_SIZE = vec2(${ATLAS_WIDTH}.0, ${ATLAS_HEIGHT}.0);

void cubeFace(int face, out vec3 normal, out vec3 u, out vec3 v) {
${CUBE_FACES.map(([n, u, v], f) =>
  `  ${f === 0 ? "if" : "else if"} (face == ${f}) { normal = ${vec3(n)}; u = ${vec3(u)}; v = ${vec3(v)}; }`).join("\n")}
}

vec2 atlasCoordinates(vec3 d, out vec3 u) {
  vec3 m = abs(d);
  int face = m.x >= m.y && m.x >= m.z ? (d.x > 0.0 ? 0 : 1) : (m.y >= m.z ? (d.y > 0.0 ? 2 : 3) : (d.z > 0.0 ? 4 : 5));
  vec3 normal, v;
  cubeFace(face, normal, u, v);
  float along = dot(d, normal);
  vec2 ab = vec2(dot(d, u), dot(d, v)) / along;
  vec2 tile = vec2(float(face - (face / ${ATLAS_COLUMNS}) * ${ATLAS_COLUMNS}), float(face / ${ATLAS_COLUMNS}));
  return (tile * TILE + FACE_BORDER + (ab + 1.0) * 0.5 * FACE_SIZE) / ATLAS_SIZE;
}

vec2 atlasCoordinates(vec3 d) {
  vec3 u;
  return atlasCoordinates(d, u);
}

vec3 atlasDirection(vec2 pixel, out vec3 u) {
  vec2 tile = min(floor(pixel / TILE), vec2(${ATLAS_COLUMNS - 1}.0, ${ATLAS_ROWS - 1}.0));
  vec3 normal, v;
  cubeFace(int(tile.y) * ${ATLAS_COLUMNS} + int(tile.x), normal, u, v);
  vec2 ab = (pixel - tile * TILE - FACE_BORDER) / FACE_SIZE * 2.0 - 1.0;
  return normalize(normal + ab.x * u + ab.y * v);
}

// Relief is stored as the tilt of the surface normal along two tangent axes
// built from the tile's own u axis, the same for every texel of a tile, border
// included, so filtering never mixes two frames.
void tiltAxes(vec3 p, vec3 u, out vec3 first, out vec3 second) {
  first = normalize(u - dot(u, p) * p);
  second = cross(p, first);
}

// Largest tilt the relief texture holds (the bake caps its tilt below this)
const float TILT_RANGE = 0.75;

vec2 encodeTilt(vec3 p, vec3 u, vec3 tilt) {
  vec3 first, second;
  tiltAxes(p, u, first, second);
  return clamp(vec2(dot(tilt, first), dot(tilt, second)) / TILT_RANGE, -1.0, 1.0) * 0.5 + 0.5;
}

/** The surface normal for a stored tilt: p tipped by the tilt. */
vec3 decodeNormal(vec3 p, vec3 u, vec2 stored) {
  vec3 first, second;
  tiltAxes(p, u, first, second);
  vec2 tilt = (stored * 2.0 - 1.0) * TILT_RANGE;
  return normalize(p - tilt.x * first - tilt.y * second);
}
`;
