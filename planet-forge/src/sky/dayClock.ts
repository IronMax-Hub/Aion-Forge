// The time of day (PLAN, PF4): where the star stands over the planet as time
// passes after arrival.
//
// - A spinning world: the point under the star keeps its latitude (the season
//   is taken as fixed while you watch; a year is long) and moves west once
//   per solar day. The solar day follows from the sidereal day and the year:
//   1 / (1/day − 1/year), or 1 / (1/day + 1/year) for a world spinning against
//   its orbit (axial tilt over 90°), as Venus does.
// - A locked world: the star stands still, over the substellar point.
// - The start: the spec's subsolar point at arrival, or (presets, which have
//   no landing) over latitude 0, longitude 0, as before.
// - On screen a solar day passes in SECONDS_PER_DAY, as Aion Forge turns a
//   planet once a minute, whatever its real day.
// Pure; presentation only.

import type { PlanetSpec } from "../spec/schema";
import type { Vec3 } from "../forge/icosphere";
import { directionOf } from "../terrain/landing";

/** One solar day on screen, seconds (Aion Forge's planet view turns a planet once in 60 s). */
export const SECONDS_PER_DAY = 60;
const HOURS_PER_YEAR = 365.25 * 24;

export interface Subsolar {
  latitudeDeg: number;
  longitudeDeg: number;
}

/** The point under the star at arrival. */
export function arrivalSubsolar(spec: PlanetSpec): Subsolar {
  return spec.landing?.subsolar ?? { latitudeDeg: 0, longitudeDeg: 0 };
}

/** Whether the star moves across the sky at all. */
export function starMoves(spec: PlanetSpec): boolean {
  return Number.isFinite(solarDayHours(spec));
}

/** The solar day, hours: Infinity on a locked world, or where spin and orbit cancel. */
export function solarDayHours(spec: PlanetSpec): number {
  if (spec.body.tidallyLocked) return Infinity;
  const spin = 1 / spec.body.rotationHours;
  const orbit = 1 / (spec.orbit.periodYears * HOURS_PER_YEAR);
  const rate = spec.body.axialTiltDeg > 90 ? spin + orbit : spin - orbit;
  return rate === 0 ? Infinity : 1 / Math.abs(rate);
}

/** Wraps a longitude to −180°…180°. */
function wrapDeg(longitudeDeg: number): number {
  return ((((longitudeDeg + 180) % 360) + 360) % 360) - 180;
}

/** The point under the star this many solar days after arrival. */
export function subsolarAt(spec: PlanetSpec, days: number): Subsolar {
  const start = arrivalSubsolar(spec);
  if (!starMoves(spec)) return start;
  // A day turns the planet east under the star, so the star's point moves west
  return { latitudeDeg: start.latitudeDeg, longitudeDeg: wrapDeg(start.longitudeDeg - 360 * days) };
}

/** The direction to the star in the body frame this many solar days after arrival. */
export function sunDirectionAt(spec: PlanetSpec, days: number): Vec3 {
  const { latitudeDeg, longitudeDeg } = subsolarAt(spec, days);
  return directionOf(latitudeDeg, longitudeDeg);
}

/** Local solar time at a longitude, as a share of the day: 0 midnight, ½ noon (the star at its highest). */
export function localTime(subsolar: Subsolar, siteLongitudeDeg: number): number {
  return ((((wrapDeg(siteLongitudeDeg - subsolar.longitudeDeg) / 360 + 0.5) % 1) + 1) % 1);
}

/** The solar days after arrival at which a site's local time is `time` (0–1), the first at or after arrival. */
export function daysUntilLocalTime(spec: PlanetSpec, siteLongitudeDeg: number, time: number): number {
  const now = localTime(arrivalSubsolar(spec), siteLongitudeDeg);
  return (((time - now) % 1) + 1) % 1;
}

/** The star's height above a site's horizon, degrees, with the star over `subsolar`. */
export function starElevationDeg(site: Subsolar, subsolar: Subsolar): number {
  const a = directionOf(site.latitudeDeg, site.longitudeDeg), b = directionOf(subsolar.latitudeDeg, subsolar.longitudeDeg);
  const c = Math.max(-1, Math.min(1, a[0] * b[0] + a[1] * b[1] + a[2] * b[2]));
  return 90 - Math.acos(c) * (180 / Math.PI);
}
