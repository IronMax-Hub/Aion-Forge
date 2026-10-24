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
 *
 * and, per view, a colour for what is being looked at:
 *
 *   star temperature → register and brightness (red dwarfs low and dark, blue stars high and bright)
 *   planet count     → voices (one per two planets, 1–4)
 *   air pressure     → wind (none without air; thick air dense and dark)
 *   ocean share      → the wind rises and falls like waves
 *   life stage       → how many voices, how many notes (none: near silence;
 *                      microbial: sparse and high; complex: full); extinct life thin and minor
 *   tech stage       → a slow pulse instead of a held tone, its rhythm the civilization's
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

/** How the thing being looked at colours its view's bed. Every field is optional. */
export interface ViewColour {
  /** Seeds the bed's stream with the subject, so the same star always unfolds the same way */
  subject?:       number;
  /** Semitones the view's register window moves (the root stays the tonic) */
  registerShift?: number;
  /** Multiplies how far a swell's filter opens */
  brightness?:    number;
  /** Voices that may sound at once */
  voices?:        number;
  /** Multiplies the wind level: 0 is still air */
  wind?:          number;
  /** Multiplies the wind band's frequencies: below 1 is darker */
  windShade?:     number;
  /** 0–1: how deeply the wind rises and falls, like waves */
  waves?:         number;
  /** How many of the view's notes voices may choose, from the lowest up */
  noteCount?:     number;
  /** Multiplies the rests between swells: above 1 is sparser */
  space?:         number;
  /** Replaces the universe's scale for this view */
  scale?:         readonly number[];
  /** A repeating pulse over the bed */
  pulse?:         PulsePattern;
}

/** A rhythm of soft struck notes, repeating. */
export interface PulsePattern {
  /** Seconds per step */
  stepSeconds: number;
  /** Strength of each step, 0 = rest; the pattern repeats */
  steps:       readonly number[];
  /** Semitones above the tonic that sounding steps walk through, moved to the scale */
  notes:       readonly number[];
  /** How far a pulse's filter opens, as a multiple of its pitch */
  brightness:  number;
  /** 0–1: the chance a beat is dropped, and how far beats drift (share of a step) */
  falter:      number;
  /** Each cycle's level relative to the last: below 1 fades (to a floor) */
  fade:        number;
}

const SUN_K               = 5800;
const REGISTER_PER_OCTAVE_OF_T = 8;   // semitones per doubling of star temperature
const REGISTER_SHIFT_RANGE: [number, number] = [-7, 10];
const BRIGHTNESS_EXPONENT = 0.35;     // brightness ∝ (T / Sun)^this
const BRIGHTNESS_RANGE: [number, number] = [0.6, 1.8];
const PLANETS_PER_VOICE   = 2;
const MAX_VOICES          = 4;
const NO_AIR_BAR          = 0.01;     // below this there is no wind (the planet view's rim uses the same edge)
const FULL_WIND_BAR       = 100;      // wind at its fullest from here up; giants count as this
const SHADE_EXPONENT      = 0.25;     // band × (1 / (1 + P))^this
const DARKEST_SHADE       = 0.5;      // thick air darkens the band to half, not into mud

const clamp = (x: number, [lo, hi]: readonly [number, number]) => Math.min(hi, Math.max(lo, x));

/** A stable number for a subject's key, e.g. a star id or a planet key "12-3". */
export function subjectSeed(key: string): number {
  let h = 0x811C9DC5;  // FNV-1a
  for (let i = 0; i < key.length; i++) h = Math.imul(h ^ key.charCodeAt(i), 0x01000193);
  return h >>> 0;
}

/** A planetary system: its star sets register and brightness, its planets the voices. */
export function systemColour(starKey: string, temperatureK: number, planetCount: number): ViewColour {
  const octavesFromSun = Math.log2(temperatureK / SUN_K);
  return {
    subject:       subjectSeed(starKey),
    registerShift: clamp(Math.round(REGISTER_PER_OCTAVE_OF_T * octavesFromSun), REGISTER_SHIFT_RANGE),
    brightness:    clamp((temperatureK / SUN_K) ** BRIGHTNESS_EXPONENT, BRIGHTNESS_RANGE),
    voices:        clamp(Math.ceil(planetCount / PLANETS_PER_VOICE), [1, MAX_VOICES]),
  };
}

/**
 * A planet in orbit: its air sets the wind, its oceans make the wind rise and fall.
 * `pressureBar` is null for a giant, which counts as the thickest air.
 */
export function planetColour(planetKey: string, pressureBar: number | null, oceanFraction: number): ViewColour {
  const pressure = pressureBar ?? FULL_WIND_BAR;
  const wind = pressure < NO_AIR_BAR ? 0
    : clamp(Math.log10(pressure / NO_AIR_BAR) / Math.log10(FULL_WIND_BAR / NO_AIR_BAR), [0, 1]);
  return {
    subject:   subjectSeed(planetKey),
    wind,
    windShade: Math.max(DARKEST_SHADE, (1 / (1 + pressure)) ** SHADE_EXPONENT),
    waves:     clamp(oceanFraction, [0, 1]),
  };
}

const NATURAL_MINOR = [0, 2, 3, 5, 7, 8, 10] as const;
const DIVERSITY_NOTES = 2;  // the most diverse life adds this many notes

export type LifeStageName = "none" | "prebiotic" | "microbial" | "multicellular" | "complex" | "dominant";

const LIFE_SOUND: Record<LifeStageName, ViewColour> = {
  none:          { voices: 1, noteCount: 2, space: 2.5, brightness: 0.8 },
  prebiotic:     { voices: 1, noteCount: 2, space: 2.5, brightness: 0.8 },
  microbial:     { voices: 2, noteCount: 3, space: 1.5, registerShift: 12 },
  multicellular: { voices: 3, noteCount: 4 },
  complex:       { voices: 4, noteCount: 5 },
  dominant:      { voices: 4, noteCount: 6 },
};

/**
 * A biosphere: more voices and notes as life grows, more notes with diversity;
 * life that has ended is a single, sparse, darker voice in a minor scale.
 */
export function biosphereColour(planetKey: string, stage: LifeStageName, diversity: number, extinct: boolean): ViewColour {
  const subject = subjectSeed(planetKey);
  if (extinct) return { subject, voices: 1, noteCount: 3, space: 2, brightness: 0.7, scale: NATURAL_MINOR };
  const base = LIFE_SOUND[stage];
  const living = stage !== "none" && stage !== "prebiotic";
  const extra = living ? Math.round(clamp(diversity, [0, 1]) * DIVERSITY_NOTES) : 0;
  return { subject, ...base, noteCount: base.noteCount! + extra };
}

export type TechStageName = "primitive" | "agricultural" | "industrial" | "information" | "space-age" | "collapsed";

const TECH_PULSE: Record<TechStageName, PulsePattern> = {
  // A heartbeat: two close beats, then a long rest
  primitive:    { stepSeconds: 0.3,  steps: [1, 0.6, 0, 0, 0, 0, 0, 0], notes: [0],
                  brightness: 2, falter: 0, fade: 1 },
  // Two slow beats, the second softer
  agricultural: { stepSeconds: 0.5,  steps: [1, 0, 0.5, 0], notes: [0, 7],
                  brightness: 2.5, falter: 0, fade: 1 },
  // Steady and even
  industrial:   { stepSeconds: 0.4,  steps: [1, 0.5, 0.7, 0.5], notes: [0, 0, 7, 0],
                  brightness: 3, falter: 0, fade: 1 },
  // Quicker and brighter
  information:  { stepSeconds: 0.25, steps: [1, 0.4, 0.6, 0.4, 0.8, 0.4, 0.6, 0.4], notes: [0, 7, 12, 7],
                  brightness: 4, falter: 0, fade: 1 },
  // A gentle rising arpeggio
  "space-age":  { stepSeconds: 0.3,  steps: [0.8, 0.6, 0.7, 0.6, 0, 0], notes: [0, 4, 7, 12],
                  brightness: 4.5, falter: 0, fade: 1 },
  // Faltering, drifting and fading
  collapsed:    { stepSeconds: 0.6,  steps: [1, 0, 0, 0.4, 0, 0, 0, 0], notes: [0],
                  brightness: 1.5, falter: 0.35, fade: 0.97 },
};

/** A civilization: a pulse whose rhythm follows its technology. */
export function civilizationColour(planetKey: string, techStage: TechStageName): ViewColour {
  return { subject: subjectSeed(planetKey), pulse: TECH_PULSE[techStage] };
}
