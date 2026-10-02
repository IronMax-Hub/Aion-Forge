// The ground's colours: what each material looks like, linear RGB.
//
// Copied from Aion Forge's globe shader (frontend/src/rendering/planet/shaders/
// globeBake.frag.glsl), so the ground matches the planet seen from orbit; sand
// is Planet Forge's own (the globe draws dry land as one soil colour).
// Presentation only: drawing never feeds the terrain.

import type { Materials } from "../terrain/materials";

type RGB = [number, number, number];

const DRY_SOIL: RGB = [0.42, 0.30, 0.17];
const MOIST_SOIL: RGB = [0.16, 0.11, 0.07];
const COLD_ROCK: RGB = [0.20, 0.19, 0.18];
const HOT_ROCK: RGB = [0.40, 0.17, 0.08];
const SCORCHED_ROCK: RGB = [0.08, 0.065, 0.06];
const HIGHLAND_ROCK: RGB = [0.30, 0.28, 0.26];
const SNOW: RGB = [0.85, 0.87, 0.90];
const BASALT: RGB = [0.035, 0.03, 0.028];
const SAND: RGB = [0.55, 0.44, 0.28];
export const SEA_ICE: RGB = [0.70, 0.78, 0.85];
export const SHALLOW_WATER: RGB = [0.02, 0.10, 0.14];
export const DEEP_WATER: RGB = [0.004, 0.018, 0.06];

/** Molten ground's glow: 1 at this temperature, falling as T⁴ below it (Aion Forge's A7). */
const GLOW_REFERENCE_K = 2000;
export const GLOW_COLOUR: RGB = [1.0, 0.35, 0.08];

function smoothstep(from: number, to: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - from) / (to - from)));
  return t * t * (3 - 2 * t);
}

function mix(a: RGB, b: RGB, t: number): RGB {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

export interface GroundLook {
  colour: RGB;
  /** How brightly the ground glows, 0–1. */
  glow: number;
}

/** The ground's colour and glow from its materials, temperature, moisture and height above the sea. */
export function groundLook(m: Materials, temperatureK: number, moisture: number, heightM: number, cover: RGB | null): GroundLook {
  // Rock as the globe draws it: grey when cold, red then dark in the heat, paler on highlands
  let rock = mix(COLD_ROCK, HOT_ROCK, smoothstep(330, 500, temperatureK));
  rock = mix(rock, SCORCHED_ROCK, smoothstep(600, 1000, temperatureK));
  rock = mix(rock, HIGHLAND_ROCK, smoothstep(1500, 5000, heightM));
  const soil = mix(DRY_SOIL, MOIST_SOIL, Math.min(1, moisture * 2));
  const coverColour = cover ?? soil;
  const colour: RGB = [0, 1, 2].map((k) =>
    m.rock * rock[k] + m.soil * soil[k] + m.sand * SAND[k] + m.snow * SNOW[k] + m.molten * BASALT[k] + m.cover * coverColour[k]) as RGB;
  const t = Math.min(1, temperatureK / GLOW_REFERENCE_K);
  return { colour, glow: m.molten * t * t * t * t };
}
