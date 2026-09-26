// Facts about planets that both planet generation and the planet's physics
// need. They live here so planet.ts can run the physics modules without the
// modules importing planet.ts back.

import type { UniverseConfig } from "./config";

/** Above this mass (Earth masses) a planet is a gas or ice giant with no solid surface. */
export const GIANT_PLANET_MASS = 15;

/**
 * The physical distance of an orbit from its star, in AU. gravityStrength > 1
 * compresses orbits slightly; temperature and physics both use this distance.
 */
export function effectiveOrbitAU(orbitalRadius: number, config: UniverseConfig): number {
  return orbitalRadius / Math.sqrt(config.gravityStrength);
}
