import { pow } from "./detmath";
import { EARTH_MASS_IN_SUNS } from "./moons";

// ── Unstable neighbours (Galaxy Through Time RP1) ─────────────────────────────
//
// Why it exists: two planets drawn on neighbouring orbits too close together
// cannot both keep them; their mutual pull scatters one of them. The model
// draws orbits without asking whether they last, so it keeps pairs that could
// not exist. This rule removes one planet of each such pair; from RP2 the
// removed planets become rogue planets.
//
// How: the mutual Hill radius of two neighbours,
//   R_H = ((m₁ + m₂) / (3 M★))^(1/3) · (a₁ + a₂) / 2,
// and two neighbours closer than 2√3 R_H cannot both stay (Gladman 1993; the
// limit for two planets alone, decision 31). The lighter is thrown out (the
// outer one if they weigh the same). Pairs are checked from the innermost
// outward; after a removal the planet left behind is checked against its new
// neighbour, until no pair is too close. M★ is the star's mass, or both stars'
// when both planets orbit both stars of a binary (BS2).
//
// Limits: systems with many planets are unstable over billions of years at
// about 8–10 mutual Hill radii (Chambers et al. 1996), so many kept systems
// would in nature not last; the survivor keeps its orbit, where real scattering
// would make it eccentric or move it; and pairs are never merged, though a few
// close-in ones would more likely collide than eject (their heavier planet's
// escape velocity below √2 times the orbital velocity). The limit says only
// that a pair is unstable; that the lighter planet leaves is this model's
// choice. Distances cancel out of the test, so the laboratory's gravity, which
// scales every orbit alike, does not change it (decision 45).

/** Neighbours closer than this many mutual Hill radii cannot both stay (Gladman 1993). */
export const HILL_SPACING = 2 * Math.sqrt(3);

/** What the rule reads of a planet: its mass (M⊕), orbit (AU) and whether it orbits both stars of a binary. */
export interface Orbiter {
  mass: number;
  orbitalRadius: number;
  orbitsBothStars?: true;
}

/** The mutual Hill radius of two neighbours, AU, around a star (or pair) of `starMass` M☉. */
export function mutualHillRadiusAU(inner: Orbiter, outer: Orbiter, starMass: number): number {
  const massShare = ((inner.mass + outer.mass) * EARTH_MASS_IN_SUNS) / (3 * starMass);
  return pow(massShare, 1 / 3) * (inner.orbitalRadius + outer.orbitalRadius) / 2;
}

/** Whether two neighbours are too close to share their orbits. */
export function tooClose(inner: Orbiter, outer: Orbiter, starMass: number): boolean {
  return outer.orbitalRadius - inner.orbitalRadius < HILL_SPACING * mutualHillRadiusAU(inner, outer, starMass);
}

/**
 * The planets that keep their orbits, and those thrown out, from planets in orbit order.
 * `starMass` is the star's mass, M☉; `pairMass` the star's and its companion's, used for
 * neighbours that both orbit both stars.
 */
export function settleNeighbours<P extends Orbiter>(planets: readonly P[], starMass: number, pairMass = starMass): { kept: P[]; ejected: P[] } {
  const kept = [...planets];
  const ejected: P[] = [];
  let i = 0;
  while (i < kept.length - 1) {
    const inner = kept[i];
    const outer = kept[i + 1];
    const mass = inner.orbitsBothStars && outer.orbitsBothStars ? pairMass : starMass;
    if (!tooClose(inner, outer, mass)) {
      i++;
      continue;
    }
    // The lighter leaves; the outer one when they weigh the same
    const leaving = inner.mass < outer.mass ? i : i + 1;
    ejected.push(kept[leaving]);
    kept.splice(leaving, 1);
    // The planet left behind now has a new inner neighbour: check that pair again
    i = Math.max(0, i - 1);
  }
  return { kept, ejected };
}
