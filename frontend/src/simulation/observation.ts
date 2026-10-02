// Observation time and noise (Worlds Up Close, phase B3).
//
// Why it exists: a transit spectrum is never seen clean. Each transit gathers
// a limited number of the star's photons, and their count scatters, so the
// faint fingerprints of an atmosphere hide in noise until enough transits are
// added together. Detection becomes a question of patience, as it is for real
// telescopes.
//
// How:
// - Photon noise. Bin k collects photons in proportion to the star's
//   luminosity and to the share of its photons falling in that bin (Planck at
//   the star's temperature: photons per bin ∝ L · λ⁻³ / (T⁴ · (e^(hc/λkT) − 1))
//   on log-spaced bins). Noise per bin = σ₀ · √(N₀ / (n · N_k)), with n the number
//   of transits and N₀ the photons a Sun-like star gives a bin at 1 µm, so it
//   falls as 1/√n and rises towards the wavelengths a star is faint in: a red
//   dwarf's spectrum is noisy in the blue, a hot star's in the infrared.
// - The data. Each bin is the model depth plus Gaussian noise of that size.
//   The draws come from the SPECTRUM stream, keyed by the planet and the number
//   of transits, so the same observation always shows the same data, and a
//   longer one is a new look, not the old one with noise scaled down.
//
// Assumptions and limits:
// - One fixed instrument for every star, as if all were seen from the same
//   distance; a dim star gives fewer photons only because it emits fewer.
// - Photon noise only: no instrument systematics, no stellar activity or
//   starspots, no correlated noise between bins.
// - Every transit counts the same, whatever its length: a planet on a wide
//   orbit, whose transits last longer, is not favoured.
// - A smaller planet gives a weaker signal only at the same gravity. At the
//   same density its gravity falls with its size, its air stands taller in
//   proportion, and its features come out about as strong (signal ∝ R_p·H).
// - Presentation of simulation data: nothing here changes the universe.

import { createRNG, mixSeed, SALT } from "./rng";
import { cos, exp, log } from "./detmath";
import type { Planet } from "./planet";
import type { Star } from "./star";
import type { Spectrum } from "./spectrum";

export const MIN_TRANSITS = 1;
export const MAX_TRANSITS = 200;

/**
 * Noise per bin in one transit of a Sun-like star, at 1 µm, ppm: the
 * instrument. About what a large space telescope reaches on a bright star at
 * this resolution; with it an Earth twin around a Sun-like star is at the edge
 * of detection after the longest observation, and a world around a small star
 * comes out sooner.
 */
export const REFERENCE_NOISE_PPM = 30;
const REFERENCE_WAVELENGTH_UM = 1;
const SUN_TEMPERATURE_K = 5772;
/** hc / k, µm·K. */
const PLANCK_MICRON_KELVIN = 14388;

export interface Observation {
  transits: number;
  wavelengthUm: readonly number[];
  /** Measured transit depth per bin, ppm: the model with noise. */
  depthPpm: number[];
  /** One-sigma uncertainty per bin, ppm. */
  uncertaintyPpm: number[];
}

/** Photons a star sends into a bin at this wavelength, relative to its share of luminosity (log-spaced bins). */
function photonsPerBin(luminosity: number, temperatureK: number, wavelengthUm: number): number {
  const x = PLANCK_MICRON_KELVIN / (wavelengthUm * temperatureK);
  const t2 = temperatureK * temperatureK;
  // e^(−x) / (1 − e^(−x)) = 1 / (e^x − 1), written so it cannot overflow
  const occupation = exp(-x) / (1 - exp(-x));
  return (luminosity * occupation) / (wavelengthUm * wavelengthUm * wavelengthUm * t2 * t2);
}

const REFERENCE_PHOTONS = photonsPerBin(1, SUN_TEMPERATURE_K, REFERENCE_WAVELENGTH_UM);

/** One-sigma noise per bin, ppm, after this many transits of this star. */
export function noisePerBin(star: Star, transits: number, wavelengthUm: number): number {
  return REFERENCE_NOISE_PPM * Math.sqrt(REFERENCE_PHOTONS / (transits * photonsPerBin(star.luminosity, star.temperature, wavelengthUm)));
}

/** A standard normal draw (Box–Muller). */
function gaussian(rng: () => number): number {
  const u = 1 - rng();   // (0, 1]: never log(0)
  return Math.sqrt(-2 * log(u)) * cos(2 * Math.PI * rng());
}

/**
 * What a telescope records of a planet's transit spectrum over `transits`
 * transits (an integer from 1 to 200): the same data every time.
 */
export function observeTransits(spectrum: Spectrum, planet: Planet, star: Star, galaxySeed: number, transits: number): Observation {
  if (!Number.isInteger(transits) || transits < MIN_TRANSITS || transits > MAX_TRANSITS) {
    throw new RangeError(`transits must be an integer from ${MIN_TRANSITS} to ${MAX_TRANSITS}, got ${transits}`);
  }
  const rng = createRNG(mixSeed(galaxySeed, planet.hostStarId, planet.id, SALT.SPECTRUM, transits));
  const uncertaintyPpm = spectrum.wavelengthUm.map((wavelength) => noisePerBin(star, transits, wavelength));
  const depthPpm = spectrum.depthPpm.map((depth, k) => depth + uncertaintyPpm[k] * gaussian(rng));
  return { transits, wavelengthUm: spectrum.wavelengthUm, depthPpm, uncertaintyPpm };
}
