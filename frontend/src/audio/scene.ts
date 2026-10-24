/**
 * Sound scene — what the universe on screen asks of the sound.
 *
 * Pure functions from a few plain facts about the universe to musical
 * settings. The audio layers read these settings; they never read the
 * simulation, so the universe exists without its sound and this mapping
 * can be tested on its own.
 *
 *   seed         → the key's tonic, one of 12 pitch classes, shared by every view
 *   galaxy shape → the scale every note is drawn to, and the pace of the swells
 */

import { mixSeed } from "../simulation/rng";

export type GalaxyShape = "spiral" | "elliptical" | "irregular";

export interface UniverseKey {
  /** The universe seed, so seeded sound streams differ between universes */
  seed:  number;
  /** Pitch class of the tonic, 0 = C … 11 = B */
  tonic: number;
  /** Semitones above the tonic that belong to the scale, within one octave */
  scale: readonly number[];
  /** Multiplies swell and rest lengths: above 1 is slower */
  pace:  number;
}

const KEY_SALT = 0x50D4C3;  // keeps the key independent of every other seeded stream

/** Each galaxy shape's scale and pace. */
const SHAPE_SOUND: Record<GalaxyShape, { scale: readonly number[]; pace: number }> = {
  // Lydian: the brightest diatonic mode, open and lifting — young, star-forming arms
  spiral:     { scale: [0, 2, 4, 6, 7, 9, 11], pace: 1.0 },
  // Aeolian (natural minor), slower — old, red, finished forming stars
  elliptical: { scale: [0, 2, 3, 5, 7, 8, 10], pace: 1.3 },
  // Whole-tone: no fifth to rest on, a little quicker — shapeless and disturbed
  irregular:  { scale: [0, 2, 4, 6, 8, 10],    pace: 0.85 },
};

/** Heard before any universe has been generated. */
export const DEFAULT_KEY: UniverseKey = { seed: 0, tonic: 2, ...SHAPE_SOUND.spiral };

/** The key a universe sounds in: tonic from its seed, scale and pace from its galaxy's shape. */
export function universeKey(seed: number, shape: GalaxyShape): UniverseKey {
  const tonic = mixSeed(seed >>> 0, KEY_SALT) % 12;
  return { seed: seed >>> 0, tonic, ...SHAPE_SOUND[shape] };
}

/**
 * Move an interval (semitones above the tonic, any octave) to the nearest
 * note of the scale; a tie goes down.
 */
export function snapToScale(semitones: number, scale: readonly number[]): number {
  const octave = Math.floor(semitones / 12);
  const within = semitones - octave * 12;
  let best = 0;
  let bestDistance = Infinity;
  // The next octave's tonic (12) is a candidate too, so 11 can round up.
  for (const note of [...scale, 12]) {
    const distance = Math.abs(note - within);
    if (distance < bestDistance) { best = note; bestDistance = distance; }
  }
  return octave * 12 + best;
}

/** The tonic's MIDI note in the octave starting at `registerMidi`. */
export function rootFor(registerMidi: number, tonic: number): number {
  return registerMidi + ((tonic - registerMidi) % 12 + 12) % 12;
}
