// Body keys (Galaxy Through Time, MO1).
//
// Why it exists: every world draws from streams keyed by where it is, so one
// world's draws never move another's. Planets were keyed by their star and
// their index; moons need keys of their own that leave every planet's stream
// exactly where it was.
//
// How: a planet's key parts are [starId, planetIndex], exactly as before. A
// moon's are [starId, planetIndex, MOON_TAG, moonIndex]: the tag keeps a moon's
// streams apart from any planet stream that adds further parts (a step, a
// purpose) after its salt. Every stream is mixSeed(galaxySeed, ...bodyKey(body),
// SALT.X, ...). The text key of a planet is "<starId>-<index>", of a moon
// "<starId>-<index>-m<moonIndex>".

/** A world in the galaxy: a planet (no moonIndex), or a moon of one. */
export interface BodyRef {
  hostStarId: number;
  /** The planet's index in its system; for a moon, its planet's. */
  id: number;
  moonIndex?: number;
}

/** Marks a moon's key parts, so they never match a planet's ("MOON" in ASCII). */
export const MOON_TAG = 0x4d4f4f4e;

/** The stream-key parts of a world: [starId, planetIndex], and for a moon [starId, planetIndex, MOON_TAG, moonIndex]. */
export function bodyKey(body: BodyRef): number[] {
  return body.moonIndex === undefined
    ? [body.hostStarId, body.id]
    : [body.hostStarId, body.id, MOON_TAG, body.moonIndex];
}

/** A planet's identity in the galaxy, for caches, timeline subjects and discoveries. */
export function planetKey(starId: number, index: number): string {
  return `${starId}-${index}`;
}

/** A moon's identity in the galaxy: its planet's key and its index. */
export function moonKey(starId: number, planetIndex: number, moonIndex: number): string {
  return `${planetKey(starId, planetIndex)}-m${moonIndex}`;
}
