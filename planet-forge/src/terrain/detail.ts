// The terrain's fine scale: the planet's own detail, from the cells' spacing
// down to about a metre.
//
// How:
// - Layers of gradient noise (fBm), the first at the cells' spacing (about
//   900 km on an Earth-sized world), each half the wavelength of the last and
//   2^−ROUGHNESS as strong, a common roughness for real terrain. The first
//   layer's amplitude is AMPLITUDE_M at REFERENCE_WAVELENGTH_M, scaled to the
//   first wavelength and divided by gravity: lower gravity, rougher ground.
// - Regions: a slow seeded field scales the detail between 1 − REGION_SPREAD
//   and 1 + REGION_SPREAD, so some regions are plains and others rugged.
// - Levels of detail: the caller names the finest wavelength it needs; layers
//   finer than that are left out, and the last one fades in by the fraction of
//   it the wavelength reaches, so heights never jump between levels.
// - Each layer has its own seed and offset from the spec's seed.
//
// Starting values (owner decision, 3 Oct 2026), to tune once the ground is drawn.

import type { PlanetSpec } from "../spec/schema";
import type { Vec3 } from "../forge/icosphere";
import { createRNG, seedHash } from "../forge/random";
import { log, pow } from "../forge/detmath";
import { gradientNoise } from "./gradientNoise";

/** Detail amplitude at the reference wavelength, at 1 g, m. */
const AMPLITUDE_M = 1000;
const REFERENCE_WAVELENGTH_M = 1_000_000;
/** Each layer is 2^−ROUGHNESS as strong as the one twice its wavelength. */
const ROUGHNESS = 0.8;
/** Most layers ever summed: from ~900 km to well below a metre. */
export const MAX_LAYERS = 24;
/** Regions are this many cell spacings across. */
const REGION_SPACINGS = 3;
const REGION_SPREAD = 0.6;
/** Stretches the region noise (mostly within ±0.4) to about ±1 before clamping. */
const REGION_CONTRAST = 2.5;
/** The finest wavelength anyone asks for, m. */
export const FINEST_WAVELENGTH_M = 1;
const LN2 = log(2);

export interface Detail {
  /** Wavelength of the first layer, m: the cells' spacing. */
  firstWavelengthM: number;
  /** How many layers (with a fraction for the last) reach down to a wavelength. */
  layersFor(finestWavelengthM: number): number;
  /** Each layer's noise times its amplitude at a point (metres from the planet's centre), the first `count` of them. */
  layerValues(pointM: Vec3, count: number): number[];
  /** The detail's strength in the region around a point: 1 ± REGION_SPREAD. */
  regionScale(pointM: Vec3): number;
}

/** Sums layer values up to a layer count with a fraction: the last whole layer is faded in by the fraction. */
export function sumLayers(values: readonly number[], count: number): number {
  const whole = Math.floor(count);
  let sum = 0;
  for (let k = 0; k < whole && k < values.length; k++) sum += values[k];
  if (whole < values.length) sum += (count - whole) * values[whole];
  return sum;
}

export function createDetail(spec: PlanetSpec, radiusM: number): Detail {
  const spacing = Math.sqrt((4 * Math.PI) / spec.surface.cells.length);
  const firstWavelengthM = spacing * radiusM;
  const firstAmplitude = (AMPLITUDE_M * pow(firstWavelengthM / REFERENCE_WAVELENGTH_M, ROUGHNESS)) / spec.body.gravityG;
  const ratio = pow(2, -ROUGHNESS);

  const rng = createRNG(spec.seed);
  // Seeds as the noise takes them (seedHash)
  const draw = () => seedHash(Math.floor(rng() * 0x100000000) | 0);
  const layers = Array.from({ length: MAX_LAYERS }, (_, k) => ({
    seed: draw(),
    offset: [rng() * 256, rng() * 256, rng() * 256] as Vec3,
    wavelength: firstWavelengthM / pow(2, k),
    amplitude: firstAmplitude * pow(ratio, k),
  }));
  const region = { seed: draw(), offset: [rng() * 256, rng() * 256, rng() * 256] as Vec3, wavelength: firstWavelengthM * REGION_SPACINGS };

  return {
    firstWavelengthM,
    layersFor(finestWavelengthM) {
      const ratioToFinest = firstWavelengthM / Math.max(finestWavelengthM, Number.MIN_VALUE);
      if (ratioToFinest < 1) return Math.max(0, ratioToFinest);
      return Math.min(MAX_LAYERS, log(ratioToFinest) / LN2 + 1);
    },
    layerValues(p, count) {
      const out: number[] = [];
      const n = Math.min(MAX_LAYERS, Math.ceil(count));
      for (let k = 0; k < n; k++) {
        const { seed, offset, wavelength, amplitude } = layers[k];
        out.push(amplitude * gradientNoise(seed, p[0] / wavelength + offset[0], p[1] / wavelength + offset[1], p[2] / wavelength + offset[2]));
      }
      return out;
    },
    regionScale(p) {
      const { seed, offset, wavelength } = region;
      const n = gradientNoise(seed, p[0] / wavelength + offset[0], p[1] / wavelength + offset[1], p[2] / wavelength + offset[2]);
      return 1 + REGION_SPREAD * Math.max(-1, Math.min(1, REGION_CONTRAST * n));
    },
  };
}
