// The star as seen from the ground (PLAN, PF4): its colour, how much light
// reaches the planet, its disc's size and where it is.
//
// - Colour: Planck's law at the same red, green and blue wavelengths as the
//   air's scattering (air.ts, Aion Forge's A6), white-balanced to the Sun, so a
//   Sun-like star is white and a red dwarf orange.
// - Light: the star's flux at the planet, L★ / a², 1 at Earth.
// - Disc: angular radius atan(R★ / a).
// Presentation only.

import type { PlanetSpec } from "../spec/schema";
import type { Vec3 } from "../forge/icosphere";
import { directionOf } from "../terrain/landing";

const PLANCK_C2 = 1.4388e-2; // m·K
/** Wavelengths standing for red, green and blue, m (air.ts). */
const RGB_WAVELENGTHS = [612e-9, 549e-9, 465e-9];
const SUN_TEMPERATURE_K = 5772;
const SUN_RADIUS_M = 6.957e8;
const AU_M = 1.495978707e11;

function planck(temperatureK: number): number[] {
  return RGB_WAVELENGTHS.map((l) => 1 / (Math.pow(l, 5) * Math.expm1(PLANCK_C2 / (l * temperatureK))));
}

/** A star's colour, linear RGB with its brightest channel 1: Planck's law sampled at red, green and blue. */
export function starColour(temperatureK: number): Vec3 {
  const sun = planck(SUN_TEMPERATURE_K);
  const balanced = planck(temperatureK).map((r, k) => r / sun[k]);
  const brightest = Math.max(...balanced);
  return balanced.map((c) => c / brightest) as Vec3;
}

/** The star's light at the planet, against the Sun's at Earth: L★ / a². */
export function starFlux(spec: PlanetSpec): number {
  return spec.star.luminositySolar / (spec.orbit.distanceAU * spec.orbit.distanceAU);
}

/** The star disc's angular radius seen from the planet, radians: atan(R★ / a). */
export function discAngularRadius(spec: PlanetSpec): number {
  return Math.atan((spec.star.radiusSolar * SUN_RADIUS_M) / (spec.orbit.distanceAU * AU_M));
}

/** The direction to the star in the body frame: over the spec's subsolar point, or over longitude 0 on the equator. */
export function starDirection(spec: PlanetSpec): Vec3 {
  const subsolar = spec.landing?.subsolar;
  return subsolar ? directionOf(subsolar.latitudeDeg, subsolar.longitudeDeg) : [1, 0, 0];
}
