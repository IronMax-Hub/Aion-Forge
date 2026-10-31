// Where the system view puts its bodies and how large it draws them.
//
// Why it exists: orbits are drawn to scale, but at true scale every planet,
// moon and the star itself would be far smaller than a pixel, so bodies are
// drawn enlarged and moon distances are drawn as multiples of the enlarged
// planet. Left alone, the two scales collide: a close-in planet's moons would
// circle through the star, and crowded neighbours' moons through each other.
//
// How: each planet and its moons are laid out at the usual sizes and
// distances, then shrunk as one unit, keeping their proportions, until the
// unit fits its room: the distance to the star's surface, and half the gap to
// each neighbouring planet (each neighbour has the other half). A unit that
// already fits is left as it was, so only crowded systems change.
//
// Assumptions and limits: every orbit is a circle round the drawn star. In a
// binary the stars move round their centre of mass; the room to the star is
// measured from the host star at the system's centre, as drawn when planets
// circle one star (the host star is drawn no larger than HOST_STAR_RADIUS, nor
// a third of the way to its innermost planet, hostStarRadius).
//
// Presentation only: it reads planets and moons and never writes to the simulation.

import type { Planet } from "../simulation/planet";

/** Planetary-system view draws orbits at this many scene units per AU. */
export const SYSTEM_UNITS_PER_AU = 2.5;
/** The host star's drawn radius at the usual scale (far larger than true scale, as the planets are). */
export const HOST_STAR_RADIUS = 0.12;
/** The drawn star reaches at most this share of the way to its innermost planet, so a hot Jupiter's orbit stays outside it. */
const STAR_SHARE_OF_INNERMOST = 1 / 3;

/** The host star's drawn radius: the usual size, but no more than a third of the way to its innermost planet. */
export function hostStarRadius(planets: readonly Planet[], scale: number): number {
  const innermost = Math.min(...planets.map((p) => p.orbitalRadius * SYSTEM_UNITS_PER_AU));
  return Math.min(HOST_STAR_RADIUS * scale, STAR_SHARE_OF_INNERMOST * innermost);
}
// A planet's sphere: its radius in Earth radii times this, kept between these, in scene units
const PLANET_SIZE = { perEarthRadius: 0.035, min: 0.025, max: 0.09 };
// Moons on screen (MO6): the innermost sits this many planet-marker radii out, each doubling of distance adds this many more
const MOON_DISTANCE = { base: 2, perDoubling: 1.2 };
// A moon's sphere: its radius in Earth radii times this, kept between these, in scene units
const MOON_SIZE = { perEarthRadius: 0.035, min: 0.008, max: 0.03 };
// A planet with its moons fills at most this share of its room, so a hairline of space stays between neighbours
const ROOM_SHARE = 0.9;

/** How one planet is drawn: its sphere's radius, and each moon's distance from it and sphere radius, in scene units. */
export interface PlanetLayout {
  planetRadius: number;
  moons: { distance: number; radius: number }[];
}

/** A planet's drawn size and its moons' drawn distances and sizes at the usual scale, before fitting. */
function usualLayout(planet: Planet, scale: number): PlanetLayout {
  const planetRadius = Math.max(PLANET_SIZE.min, Math.min(PLANET_SIZE.max, planet.size * PLANET_SIZE.perEarthRadius)) * scale;
  const innermost = planet.moons[0];
  const moons = planet.moons.map((moon) => ({
    distance: planetRadius * (MOON_DISTANCE.base + MOON_DISTANCE.perDoubling * Math.log2(moon.orbitPlanetRadii / innermost.orbitPlanetRadii + 1)),
    radius: Math.max(MOON_SIZE.min, Math.min(MOON_SIZE.max, moon.size * MOON_SIZE.perEarthRadius)) * scale,
  }));
  return { planetRadius, moons };
}

/** How far a planet's drawn unit reaches from its centre: its sphere, or its farthest moon's sphere. */
export function layoutReach(layout: PlanetLayout): number {
  return Math.max(layout.planetRadius, ...layout.moons.map((m) => m.distance + m.radius));
}

/**
 * Each planet's layout, by planet key: the usual sizes, with each planet and its moons shrunk as one
 * until they fit between the star's surface and halfway to each neighbour.
 */
export function systemLayout(planets: readonly Planet[], scale: number): Map<string, PlanetLayout> {
  const starRadius = hostStarRadius(planets, scale);
  const sorted = [...planets].sort((a, b) => a.orbitalRadius - b.orbitalRadius);
  const layouts = new Map<string, PlanetLayout>();
  sorted.forEach((planet, i) => {
    const orbit = planet.orbitalRadius * SYSTEM_UNITS_PER_AU;
    const inner = i > 0 ? (orbit - sorted[i - 1].orbitalRadius * SYSTEM_UNITS_PER_AU) / 2 : Infinity;
    const outer = i + 1 < sorted.length ? (sorted[i + 1].orbitalRadius * SYSTEM_UNITS_PER_AU - orbit) / 2 : Infinity;
    const room = ROOM_SHARE * Math.min(orbit - starRadius, inner, outer);
    const usual = usualLayout(planet, scale);
    const shrink = Math.min(1, room / layoutReach(usual));
    layouts.set(planet.key, {
      planetRadius: usual.planetRadius * shrink,
      moons: usual.moons.map((m) => ({ distance: m.distance * shrink, radius: m.radius * shrink })),
    });
  });
  return layouts;
}
