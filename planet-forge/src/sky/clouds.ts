// Clouds by the spec's cover (PLAN, PF4): where the planet is clouded over,
// and at what height.
//
// How:
// - A map of the whole planet, latitude by longitude, of seeded gradient noise
//   in layers from weather systems (CLOUD_SYSTEM_RADII of the planet's radius
//   across) down to a few hundred km. It is cut at the level that clouds over
//   exactly the spec's share of the planet's area (each entry weighted by the
//   area it stands for); the map holds each point's margin above that level,
//   so clouds lie where the margin is positive.
// - The shader adds finer noise of zero average to the margin, so edges are
//   ragged down to about a kilometre while the share stays about the spec's.
// - One thin layer, CLOUD_HEIGHT_SHARE of the air's scale height up.
// The same seed always gives the same clouds: integer hashing, exact
// arithmetic and detmath. Presentation only: clouds never change the ground.

import type { PlanetSpec } from "../spec/schema";
import { cos, sin } from "../forge/detmath";
import { createRNG, seedHash } from "../forge/random";
import { gradientNoise } from "../terrain/gradientNoise";
import type { Air } from "./air";

/** The map's size: longitudes by latitudes. */
export const CLOUD_MAP_WIDTH = 512;
export const CLOUD_MAP_HEIGHT = 256;
/** The largest cloud systems' size, in the planet's radii, and how many halvings below it the map holds. */
const CLOUD_SYSTEM_RADII = 0.5;
const CLOUD_LAYERS = 5;
/** The layer's height as a share of the air's scale height (Earth: about 2 km, where low clouds lie). */
export const CLOUD_HEIGHT_SHARE = 0.25;
/** Margins are kept within ±1, so a fully clouded or clear planet stays so whatever the shader adds. */
const MARGIN_LIMIT = 1;
const CLOUD_SALT = 0x3c6ef372;

/** The cloud layer's height above sea level, m. */
export function cloudHeightM(air: Air): number {
  return CLOUD_HEIGHT_SHARE * air.rayleighHeightM;
}

/** The map entry's latitude and longitude at its centre, radians (row 0 at the south pole, column 0 at −180°). */
export function cloudMapPlace(column: number, row: number): { latitude: number; longitude: number } {
  return {
    latitude: ((row + 0.5) / CLOUD_MAP_HEIGHT - 0.5) * Math.PI,
    longitude: ((column + 0.5) / CLOUD_MAP_WIDTH - 0.5) * 2 * Math.PI,
  };
}

/** The share of the sphere's area an entry in this row stands for. */
export function cloudMapArea(row: number): number {
  const south = (row / CLOUD_MAP_HEIGHT - 0.5) * Math.PI, north = ((row + 1) / CLOUD_MAP_HEIGHT - 0.5) * Math.PI;
  return (sin(north) - sin(south)) / (2 * CLOUD_MAP_WIDTH);
}

/** The cloud map: each entry's margin above the clouds' level, row by row (CLOUD_MAP_WIDTH × CLOUD_MAP_HEIGHT). */
export function cloudMap(spec: PlanetSpec): Float32Array {
  const rng = createRNG((spec.seed ^ CLOUD_SALT) >>> 0);
  const seeds = Array.from({ length: CLOUD_LAYERS }, () => seedHash(Math.floor(rng() * 0x100000000) | 0));
  const values = new Float32Array(CLOUD_MAP_WIDTH * CLOUD_MAP_HEIGHT);
  for (let row = 0; row < CLOUD_MAP_HEIGHT; row++) {
    for (let column = 0; column < CLOUD_MAP_WIDTH; column++) {
      const { latitude, longitude } = cloudMapPlace(column, row);
      // directionOf's frame (contracts/planet-spec, Frame)
      const x = cos(latitude) * cos(longitude), y = sin(latitude), z = -cos(latitude) * sin(longitude);
      let sum = 0, amplitude = 1, total = 0, wavelength = CLOUD_SYSTEM_RADII;
      for (const seed of seeds) {
        sum += amplitude * gradientNoise(seed, x / wavelength, y / wavelength, z / wavelength);
        total += amplitude;
        amplitude /= 2;
        wavelength /= 2;
      }
      values[row * CLOUD_MAP_WIDTH + column] = sum / total;
    }
  }

  // The level that clouds over the cover's share of the area: walk down from the highest values
  const order = Array.from(values.keys()).sort((a, b) => values[b] - values[a] || a - b);
  const wanted = spec.air.cloudCover;
  let clouded = 0, level = Infinity;
  for (const k of order) {
    const area = cloudMapArea(Math.floor(k / CLOUD_MAP_WIDTH));
    if (clouded + area / 2 > wanted) { level = values[k]; break; }
    clouded += area;
  }
  if (level === Infinity && wanted > 0) level = -Infinity;
  if (wanted === 0) level = Infinity;

  const margins = new Float32Array(values.length);
  for (let k = 0; k < values.length; k++) {
    // Entries at the level itself are clear: clouds lie strictly above it
    margins[k] = Math.max(-MARGIN_LIMIT, Math.min(MARGIN_LIMIT, values[k] - level));
  }
  return margins;
}
