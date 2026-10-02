// The terrain's fine scale: the planet's own detail, from the cells' spacing
// down to about a metre.
//
// How:
// - Layers of gradient noise (fBm), the first at the cells' spacing (about
//   900 km on an Earth-sized world), each half the wavelength of the last.
// - Strength by wavelength, a split spectrum (owner decision, 3 Oct 2026):
//   AMPLITUDE_M at REFERENCE_WAVELENGTH_M, falling as wavelength^ROUGH_ABOVE
//   down to CROSSOVER_M, then as wavelength^SMOOTH_BELOW. Rough above the
//   crossover, so hills show from altitude; smoother below, so the ground
//   underfoot stays walkable. One roughness for all scales could not do both:
//   0.8 left the land flat from 3 km up (0.1° median slope over 1 km); 0.5
//   made 14% of the ground steeper than 35° over a metre, rock that would
//   vanish where the ground is built coarser. As built, the Earth-like
//   preset's land has median slopes of about 0.9° over 1 km and 4° over 1 m.
//   Divided by gravity: lower gravity, rougher ground.
// - Regions: a slow seeded field scales the detail between 1 − REGION_SPREAD
//   and 1 + REGION_SPREAD, so some regions are plains and others rugged.
// - Levels of detail: the caller names the finest wavelength it needs; layers
//   finer than that are left out, and the last one fades in by the fraction of
//   it the wavelength reaches, so heights never jump between levels.
// - Each layer has its own seed and offset from the spec's seed.
//
// Mountain ranges (ridges on high ground) are not modelled yet.

import type { PlanetSpec } from "../spec/schema";
import type { Vec3 } from "../forge/icosphere";
import { createRNG, seedHash } from "../forge/random";
import { log, pow } from "../forge/detmath";
import { gradientNoise } from "./gradientNoise";

/** Detail amplitude at the reference wavelength, at 1 g, m. */
const AMPLITUDE_M = 2000;
const REFERENCE_WAVELENGTH_M = 1_000_000;
/** Above the crossover, amplitude falls as wavelength^ROUGH_ABOVE; below it, as wavelength^SMOOTH_BELOW. */
const ROUGH_ABOVE = 0.5;
const SMOOTH_BELOW = 0.9;
const CROSSOVER_M = 1000;
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

/** A layer's amplitude at a wavelength, on a planet of this gravity, m: the split spectrum. */
export function layerAmplitudeM(wavelengthM: number, gravityG: number): number {
  const above = (w: number) => AMPLITUDE_M * pow(w / REFERENCE_WAVELENGTH_M, ROUGH_ABOVE);
  const amplitude = wavelengthM >= CROSSOVER_M ? above(wavelengthM) : above(CROSSOVER_M) * pow(wavelengthM / CROSSOVER_M, SMOOTH_BELOW);
  return amplitude / gravityG;
}

export function createDetail(spec: PlanetSpec, radiusM: number): Detail {
  const spacing = Math.sqrt((4 * Math.PI) / spec.surface.cells.length);
  const firstWavelengthM = spacing * radiusM;

  const rng = createRNG(spec.seed);
  // Seeds as the noise takes them (seedHash)
  const draw = () => seedHash(Math.floor(rng() * 0x100000000) | 0);
  const layers = Array.from({ length: MAX_LAYERS }, (_, k) => ({
    seed: draw(),
    offset: [rng() * 256, rng() * 256, rng() * 256] as Vec3,
    wavelength: firstWavelengthM / pow(2, k),
    amplitude: layerAmplitudeM(firstWavelengthM / pow(2, k), spec.body.gravityG),
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
