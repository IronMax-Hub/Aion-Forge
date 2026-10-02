// Surface map (Worlds Up Close, phase A5): a solid planet's 642-cell present
// day, resampled into an equirectangular image the globe shader can read.
//
// Why it exists: the globe must show the simulation's own surface, not an
// invented picture. The GPU cannot read the icosphere grid directly, so the CPU
// spreads the cells over a 512 × 256 longitude–latitude image once per planet.
//
// How: each texel takes a weighted mean of the cells near it (Franke–Little
// inverse-distance weighting). A weight grows without bound as a texel nears a
// cell centre and falls to nothing at SMOOTHING_RADIUS, so the image passes
// exactly through every cell's value and is smooth between them. Four channels:
//   R  elevation above sea level, km (negative under water)
//   G  temperature, K
//   B  moisture, 0–1
//   A  submerged: 1 where the cell holds water (open or frozen), 0 on land
// The coastline is where A crosses 0.5, so at every cell centre it matches the
// simulation's land/ocean flag, and between cells it follows the smooth field.
//
// Frame: the image's poles are the grid's band axis, so its latitude lines run
// along the climate bands. Longitude 0 is along axisFrame().east, and a
// direction's coordinates in the frame are (east, axis, north-of-east) → (x, y, z).
//
// Presentation only: it reads a planet's present-day climate and never writes it.

import * as THREE from "three";
import type { Geography } from "../../simulation/geography";
import { BAND_AXIS, surfaceGrid } from "../../simulation/geography";
import type { PresentClimate } from "../../simulation/climate";

export const SURFACE_MAP_WIDTH = 512;
export const SURFACE_MAP_HEIGHT = 256;
export const SURFACE_MAP_CHANNELS = { elevationKm: 0, temperatureK: 1, moisture: 2, submerged: 3 } as const;

// Cells farther than this from a texel (radians on the unit sphere) take no part in it.
// Level-3 cells are ~0.14 rad apart, so every texel draws on its nearest 5–8 cells.
const SMOOTHING_RADIUS = 0.2;

type Vec3 = [number, number, number];

export interface SurfaceMapData {
  width: number;
  height: number;
  /** RGBA per texel, row 0 at the south (latitude −90°). */
  data: Float32Array;
}

function dot(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function cross(a: Vec3, b: Vec3): Vec3 {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

function normalize([x, y, z]: Vec3): Vec3 {
  const length = Math.sqrt(x * x + y * y + z * z);
  return [x / length, y / length, z / length];
}

/** Right-handed frame with the band axis as its pole: east × axis = north-of-east. */
export function axisFrame(): { east: Vec3; axis: Vec3; third: Vec3 } {
  const axis = BAND_AXIS;
  const east = normalize(cross(axis, [1, 0, 0]));
  return { east, axis, third: cross(east, axis) };
}

/** The grid direction at a longitude and latitude of the map, radians. */
export function directionAt(longitude: number, latitude: number): Vec3 {
  const { east, axis, third } = axisFrame();
  const c = Math.cos(latitude);
  const x = c * Math.cos(longitude);
  const z = c * Math.sin(longitude);
  const y = Math.sin(latitude);
  return [
    x * east[0] + y * axis[0] + z * third[0],
    x * east[1] + y * axis[1] + z * third[1],
    x * east[2] + y * axis[2] + z * third[2],
  ];
}

/** Cells close enough to each cell to matter to a texel that cell is nearest to. */
function candidateCells(): number[][] {
  const { positions, neighbours } = surfaceGrid();
  // A texel is never farther from its nearest cell than that cell's farthest neighbour
  let reach = 0;
  positions.forEach((p, i) => { for (const j of neighbours[i]) reach = Math.max(reach, Math.acos(Math.min(1, dot(p, positions[j])))); });
  const within = Math.cos(SMOOTHING_RADIUS + reach);
  return positions.map((p) => positions.flatMap((q, j) => (dot(p, q) >= within ? [j] : [])));
}

let sharedCandidates: number[][] | undefined;

/** Resamples a planet's present-day cells into the globe's surface map, of this size (the system view's is smaller). */
export function buildSurfaceMap(
  geography: Geography, present: PresentClimate, width = SURFACE_MAP_WIDTH, height = SURFACE_MAP_HEIGHT,
): SurfaceMapData {
  const { positions, neighbours } = surfaceGrid();
  sharedCandidates ??= candidateCells();
  const candidates = sharedCandidates;
  const cellValues: number[][] = positions.map((_, i) => [
    geography.elevationKm[i] - present.seaLevelKm,
    present.cellTemperatureK[i],
    present.cellMoisture[i],
    present.cellSubmerged[i],
  ]);

  const data = new Float32Array(width * height * 4);
  const cosRadius = Math.cos(SMOOTHING_RADIUS);
  let nearest = 0;
  for (let row = 0; row < height; row++) {
    const latitude = ((row + 0.5) / height - 0.5) * Math.PI;
    for (let column = 0; column < width; column++) {
      const direction = directionAt(((column + 0.5) / width - 0.5) * 2 * Math.PI, latitude);

      // Walk downhill in distance to the nearest cell, starting from the last texel's
      let closest = dot(direction, positions[nearest]);
      for (let moved = true; moved;) {
        moved = false;
        for (const j of neighbours[nearest]) {
          const d = dot(direction, positions[j]);
          if (d > closest) { closest = d; nearest = j; moved = true; }
        }
      }

      const out = (row * width + column) * 4;
      let total = 0;
      const sum = [0, 0, 0, 0];
      let exact = -1;
      for (const j of candidates[nearest]) {
        const c = dot(direction, positions[j]);
        if (c < cosRadius) continue;
        const distance = Math.acos(Math.min(1, c));
        if (distance < 1e-9) { exact = j; break; }
        const w = ((SMOOTHING_RADIUS - distance) / (SMOOTHING_RADIUS * distance)) ** 2;
        total += w;
        for (let k = 0; k < 4; k++) sum[k] += w * cellValues[j][k];
      }
      for (let k = 0; k < 4; k++) data[out + k] = exact >= 0 ? cellValues[exact][k] : sum[k] / total;
    }
  }
  return { width, height, data };
}

/** The map's value in one channel for a grid direction, filtered bilinearly as the GPU samples it. */
export function sampleSurfaceMap(map: SurfaceMapData, direction: Vec3, channel: number): number {
  const { east, axis, third } = axisFrame();
  const latitude = Math.asin(Math.max(-1, Math.min(1, dot(direction, axis))));
  const longitude = Math.atan2(dot(direction, third), dot(direction, east));
  const x = (longitude / (2 * Math.PI) + 0.5) * map.width - 0.5;
  const y = Math.max(0, Math.min(map.height - 1, (latitude / Math.PI + 0.5) * map.height - 0.5));
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const y1 = Math.min(map.height - 1, y0 + 1);
  const fx = x - x0;
  const fy = y - y0;
  const at = (column: number, row: number) =>
    map.data[(row * map.width + ((column % map.width) + map.width) % map.width) * 4 + channel];
  return (at(x0, y0) * (1 - fx) + at(x0 + 1, y0) * fx) * (1 - fy) + (at(x0, y1) * (1 - fx) + at(x0 + 1, y1) * fx) * fy;
}

/** Uploads a surface map as a half-float texture, filtered linearly and wrapping in longitude. */
export function surfaceMapTexture(map: SurfaceMapData): THREE.DataTexture {
  const half = new Uint16Array(map.data.length);
  for (let i = 0; i < map.data.length; i++) half[i] = THREE.DataUtils.toHalfFloat(map.data[i]);
  const texture = new THREE.DataTexture(half, map.width, map.height, THREE.RGBAFormat, THREE.HalfFloatType);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearFilter;
  texture.colorSpace = THREE.NoColorSpace;
  texture.needsUpdate = true;
  return texture;
}
