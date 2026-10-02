// The star's light on the ground, for PF3: its colour and direction. PF4
// replaces the direction with the real time of day and adds the sky.

import type { PlanetSpec } from "../spec/schema";
import type { Vec3 } from "../forge/icosphere";
import { directionOf } from "../terrain/landing";

const PLANCK_C2 = 1.4388e-2; // m·K
/** Wavelengths standing for red, green and blue, m. */
const RGB_WAVELENGTHS = [610e-9, 550e-9, 465e-9];

/** A star's colour, linear RGB with its brightest channel 1: Planck's law sampled at red, green and blue. */
export function starColour(temperatureK: number): Vec3 {
  const radiance = RGB_WAVELENGTHS.map((l) => 1 / (Math.pow(l, 5) * (Math.exp(PLANCK_C2 / (l * temperatureK)) - 1)));
  // White-balanced to the Sun, so a Sun-like star is white
  const sun = RGB_WAVELENGTHS.map((l) => 1 / (Math.pow(l, 5) * (Math.exp(PLANCK_C2 / (l * 5772)) - 1)));
  const balanced = radiance.map((r, k) => r / sun[k]);
  const brightest = Math.max(...balanced);
  return balanced.map((c) => c / brightest) as Vec3;
}

/** The direction to the star in the body frame: over the spec's subsolar point, or over longitude 0 on the equator. */
export function starDirection(spec: PlanetSpec): Vec3 {
  const subsolar = spec.landing?.subsolar;
  return subsolar ? directionOf(subsolar.latitudeDeg, subsolar.longitudeDeg) : [1, 0, 0];
}
