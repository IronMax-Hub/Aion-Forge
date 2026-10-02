// The flat map's Terrain view: the terrain (src/terrain/) sampled once per
// texel, coloured by what the ground is made of and shaded by its slopes, to
// check coasts and relief beyond the cells. A reading aid: PF3 draws the ground.

import type { PlanetSpec } from "../spec/schema";
import { createTerrain } from "../terrain/terrain";
import type { GroundSample } from "../terrain/terrain";
import { createMaterials } from "../terrain/materials";
import { linearToBytes } from "./colour";

type RGB = [number, number, number];

const PALETTE: Record<"rock" | "dry" | "wet" | "sand" | "snow" | "molten" | "shallow" | "deep" | "seaIce", RGB> = {
  rock: [120, 116, 110],
  dry: [150, 116, 76],
  wet: [86, 70, 52],
  sand: [196, 170, 120],
  snow: [236, 240, 245],
  molten: [230, 96, 30],
  shallow: [48, 104, 146],
  deep: [12, 33, 62],
  seaIce: [176, 200, 222],
};
/** Water this deep, m, is drawn at its darkest. */
const DEEP_M = 4000;
/** Hill shading: light from the north-west and above; how much slopes darken or lighten. */
const LIGHT: [number, number, number] = [-0.5, 0.5, 0.707];
const SHADE_STRENGTH = 0.6;
/** Relief is exaggerated this much for shading, so continents' slopes show at a degree per texel. */
const SHADE_EXAGGERATION = 20;
const DEGREE = Math.PI / 180;

function mix(a: RGB, b: RGB, t: number): RGB {
  const s = Math.min(1, Math.max(0, t));
  return [a[0] + (b[0] - a[0]) * s, a[1] + (b[1] - a[1]) * s, a[2] + (b[2] - a[2]) * s];
}

/** RGBA texels of the terrain, `width` × `height`, longitude −180° to 180° across, latitude 90° to −90° down. */
export function terrainMapPixels(spec: PlanetSpec, width: number, height: number): Uint8ClampedArray {
  const terrain = createTerrain(spec);
  const materials = createMaterials(spec);
  const texelM = (2 * Math.PI * terrain.radiusM) / width;
  const cover = spec.groundCover ? linearToBytes(spec.groundCover.colourLinear) : null;

  const samples: GroundSample[] = [];
  for (let row = 0; row < height; row++) {
    const lat = (90 - (row + 0.5) * (180 / height)) * DEGREE;
    for (let col = 0; col < width; col++) {
      const lon = (-180 + (col + 0.5) * (360 / width)) * DEGREE;
      samples.push(terrain.sample([Math.cos(lat) * Math.cos(lon), Math.sin(lat), -Math.cos(lat) * Math.sin(lon)], texelM));
    }
  }

  const pixels = new Uint8ClampedArray(width * height * 4);
  for (let row = 0; row < height; row++) {
    const lat = (90 - (row + 0.5) * (180 / height)) * DEGREE;
    const eastM = texelM * Math.max(Math.cos(lat), 0.01);
    for (let col = 0; col < width; col++) {
      const s = samples[row * width + col];
      const at = (r: number, c: number) => samples[Math.min(height - 1, Math.max(0, r)) * width + ((c + width) % width)].groundM;
      // Slope from the neighbouring texels; above water only (the sea's surface is flat)
      const dEast = (at(row, col + 1) - at(row, col - 1)) / (2 * eastM);
      const dNorth = (at(row - 1, col) - at(row + 1, col)) / (2 * texelM);
      const slopeDeg = Math.atan(Math.hypot(dEast, dNorth)) / DEGREE;

      let colour: RGB;
      if (s.surface === "water") colour = mix(PALETTE.shallow, PALETTE.deep, -s.groundM / DEEP_M);
      else if (s.surface === "seaIce") colour = PALETTE.seaIce;
      else {
        const m = materials(s, slopeDeg);
        const soil = mix(PALETTE.dry, PALETTE.wet, s.moisture * 2);
        colour = [0, 1, 2].map((k) =>
          m.rock * PALETTE.rock[k] + m.soil * soil[k] + m.sand * PALETTE.sand[k] + m.snow * PALETTE.snow[k]
          + m.molten * PALETTE.molten[k] + m.cover * (cover ? cover[k] : soil[k])) as RGB;
        const nx = -dEast * SHADE_EXAGGERATION, ny = dNorth * SHADE_EXAGGERATION;
        const length = Math.hypot(nx, ny, 1);
        const light = (nx * LIGHT[0] + ny * LIGHT[1] + LIGHT[2]) / length;
        const shade = 1 + SHADE_STRENGTH * (light - LIGHT[2]);
        colour = colour.map((c) => c * shade) as RGB;
      }
      const out = (row * width + col) * 4;
      pixels[out] = colour[0]; pixels[out + 1] = colour[1]; pixels[out + 2] = colour[2]; pixels[out + 3] = 255;
    }
  }
  return pixels;
}
