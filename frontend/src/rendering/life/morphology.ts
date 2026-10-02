// Body plans from evolved traits (Worlds Up Close, phase C2.8).
//
// Why it exists: the world history evolves lineages that are six numbers each
// (simulation/evolution/genome.ts). To show them as organisms, the field guide
// (C2.9) and the surface view (D5, D6) need a body that can be drawn. This turns
// a lineage into one, deterministically, as plain data; drawing it is separate.
//
// How:
// - The kind of body follows the traits, never chance: a body of 10⁻⁹ kg or
//   less is a microbe (the simulation's own multicellular line); a larger one
//   that makes its own food from light or chemicals is a producer; a larger one
//   that eats others is an animal.
// - The shape follows the traits and the planet:
//   · Size: the real length in metres, from body mass at water's density.
//   · Microbes: the colony a cell forms, from habitat and energy source.
//   · Producers on land stand against gravity: the same mass grows less tall
//     and stouter on a heavier world (height-to-width ∝ 1/g). In water, buoyancy
//     carries them and gravity hardly matters. Leaves are larger where the
//     starlight is dim (∝ 1/flux). Their colour is the light their pigment does
//     not absorb, from the lineage's own absorption peak against its star's
//     spectrum (owner decision), as an eye adapted to that star would see it.
//   · Animals on land carry their weight on legs: leg length ∝ g^−½ and body
//     girth ∝ g^½ (the plan), so heavy worlds give squat bodies. Swimmers are
//     streamlined, with fins, and gravity hardly matters. The head grows with
//     information processing, the trait minds come from.
// - Details the genome does not hold (cell shape, how branches split, leg and
//   fin pairs, eyes, small changes of proportion and tone) come from the
//   lineage's VISUAL sub-stream. A lineage inherits its parent's details and
//   changes them a little (owner decision), so relatives look related: family
//   resemblance emerges down the tree of life.
//
// Assumptions and limits: a body is drawn as one standing or swimming adult,
// not a life cycle; colours are display approximations (a Gaussian absorption
// band, the CIE 1931 observer by the Wyman–Sloan–Shirley fit, sRGB). The rules
// that are presentation choices, not physics, are named as such beside them.
//
// Presentation only: it reads lineages and never writes them, and nothing here
// feeds back into the simulation.

import type { Lineage } from "../../simulation/evolution/engine";
import { MULTICELLULAR_LOG10_KG } from "../../simulation/evolution/engine";
import type { Habitat } from "../../simulation/evolution/genome";
import { createRNG, mixSeed, SALT } from "../../simulation/rng";

// ── Inputs ───────────────────────────────────────────────────────────────────

/** The planet a lineage lives on, as far as its body is concerned. */
export interface MorphologyEnvironment {
  /** Surface gravity, in Earth gravities. */
  gravityG: number;
  /** Starlight at the planet, relative to Earth's. */
  starFlux: number;
  starTemperatureK: number;
}

/** Identifies a planet's VISUAL streams (as globe.ts and life.ts key them). */
export interface MorphologyKeys {
  galaxySeed: number;
  starId: number;
  planetId: number;
}

// ── Outputs ──────────────────────────────────────────────────────────────────

/** Linear RGB, 0–1 per channel. */
export type LinearRGB = [number, number, number];

export type CellShape = "sphere" | "rod" | "spiral";
export type ColonyForm = "single-cells" | "mat" | "mound" | "filaments" | "crust" | "plankton";

export interface MicrobePlan {
  kind: "microbe";
  /** One cell's length, m. */
  lengthM: number;
  cellShape: CellShape;
  colony: ColonyForm;
  colour: LinearRGB;
}

export type ProducerForm = "branching" | "frond" | "encrusting";

export interface ProducerPlan {
  kind: "producer";
  form: ProducerForm;
  /** Height (branching, frond) or spread (encrusting), m. */
  lengthM: number;
  /** Height over width of the whole body. */
  slenderness: number;
  /** How many times the branches split, tip to base. */
  branchDepth: number;
  /** Branches each split into. */
  branchSplit: 2 | 3;
  /** Angle between a branch and its parent, radians. */
  branchAngle: number;
  /** Leaf size relative to Earth's sunlight: larger in dim light. */
  leafScale: number;
  /** The colour of its pigment. */
  colour: LinearRGB;
}

export type Locomotion = "walker" | "swimmer";

export interface AnimalPlan {
  kind: "animal";
  locomotion: Locomotion;
  /** Body length, m. */
  lengthM: number;
  /** Body segments, head to tail. */
  segments: number;
  /** Width over length of the body. */
  girth: number;
  /** Pairs of legs (walkers) or fins (swimmers). */
  limbPairs: number;
  /** Leg length over body length; 0 for swimmers. */
  legLength: number;
  /** Head length over body length. */
  headSize: number;
  eyes: number;
  /** Where the eyes sit: facing forward, or on the sides of the head. */
  eyePlacement: "front" | "side";
  /** Eye size over head length: small where little light reaches. */
  eyeSize: number;
  /** Back and belly colours. */
  colour: LinearRGB;
  bellyColour: LinearRGB;
}

export type BodyPlan = MicrobePlan | ProducerPlan | AnimalPlan;

// ── Size ─────────────────────────────────────────────────────────────────────

// Life is mostly water: bodies are taken at its density
const BODY_DENSITY_KG_M3 = 1000;
// Bodies drawn as a box of this length over width (a cell, a frond, an animal are all longer than wide)
const MICROBE_SLENDERNESS = { sphere: 1, rod: 3, spiral: 6 } as const;
const ANIMAL_SLENDERNESS = 4;

/** Length, m, of a body of this mass and length-to-width ratio, at water's density. */
export function lengthOf(log10MassKg: number, slenderness: number): number {
  const volume = Math.pow(10, log10MassKg) / BODY_DENSITY_KG_M3;
  return Math.cbrt(volume * slenderness * slenderness);
}

// ── Inherited details (VISUAL stream) ────────────────────────────────────────

// The VISUAL sub-stream each lineage draws its details from, beside the planet's
// own sub-streams (life.ts: 1, 2; systemView.ts: 3); the lineage id is a further part
const LINEAGE_STREAM = 4;

/** What a lineage passes on that the genome does not hold. */
export interface Heritage {
  cellShape: CellShape;
  branchSplit: 2 | 3;
  /** Radians. */
  branchAngle: number;
  limbPairs: number;
  eyes: number;
  eyePlacement: "front" | "side";
  /** −1…1: small changes of proportion and tone. */
  build: number;
  tone: number;
}

// Presentation choices: the ranges details take, and how much a birth changes them
const CELL_SHAPES: CellShape[] = ["sphere", "rod", "spiral"];
const BRANCH_ANGLE = { min: 0.25, max: 0.9 };
const LIMB_PAIRS = { min: 1, max: 4 };
const EYE_COUNTS = [0, 2, 2, 2, 4, 6];
const CHANGE_CHANCE = 0.15;          // a discrete detail changes at a birth this often
const DRIFT = 0.12;                  // how far a continuous detail may move at a birth (share of its range)

/**
 * The details a lineage is drawn with, inherited from its parent with small
 * changes. `byId` holds its ancestors; `memo` keeps what is worked out, so a
 * planet's lineages share their ancestors' details.
 */
export function heritageOf(
  lineage: Lineage, byId: ReadonlyMap<number, Lineage>, keys: MorphologyKeys, memo = new Map<number, Heritage>(),
): Heritage {
  // Up the line to the first ancestor already known (or the first lineage), then down again
  const line: Lineage[] = [];
  for (let at: Lineage | undefined = lineage; at && !memo.has(at.id);
    at = at.parentId !== null ? byId.get(at.parentId) : undefined) line.push(at);
  for (let i = line.length - 1; i >= 0; i--) {
    const parentId = line[i].parentId;
    memo.set(line[i].id, heritageFrom(line[i], parentId !== null ? memo.get(parentId) : undefined, keys));
  }
  return memo.get(lineage.id)!;
}

/** A lineage's details from its parent's (none for the first lineage), and its own eight draws. */
function heritageFrom(lineage: Lineage, from: Heritage | undefined, keys: MorphologyKeys): Heritage {
  // Always the same eight draws, in this order, whether or not each is used
  const rng = createRNG(mixSeed(keys.galaxySeed, keys.starId, keys.planetId, SALT.VISUAL, LINEAGE_STREAM, lineage.id));
  const draws = Array.from({ length: 8 }, () => rng());
  if (!from) {
    return {
      cellShape: CELL_SHAPES[Math.floor(draws[0] * CELL_SHAPES.length)],
      branchSplit: draws[1] < 0.7 ? 2 : 3,
      branchAngle: BRANCH_ANGLE.min + draws[2] * (BRANCH_ANGLE.max - BRANCH_ANGLE.min),
      limbPairs: LIMB_PAIRS.min + Math.floor(draws[3] * (LIMB_PAIRS.max - LIMB_PAIRS.min + 1)),
      eyes: EYE_COUNTS[Math.floor(draws[4] * EYE_COUNTS.length)],
      eyePlacement: draws[5] < 0.5 ? "front" : "side",
      build: draws[6] * 2 - 1,
      tone: draws[7] * 2 - 1,
    };
  }
  const step = (draw: number) => draw * 2 - 1;          // −1…1
  const changes = (draw: number) => draw < CHANGE_CHANCE;
  const within = (draw: number) => draw / CHANGE_CHANCE; // 0…1 when it changes
  return {
    cellShape: changes(draws[0]) ? CELL_SHAPES[Math.floor(within(draws[0]) * CELL_SHAPES.length)] : from.cellShape,
    branchSplit: changes(draws[1]) ? (from.branchSplit === 2 ? 3 : 2) : from.branchSplit,
    branchAngle: clamp(from.branchAngle + step(draws[2]) * DRIFT * (BRANCH_ANGLE.max - BRANCH_ANGLE.min), BRANCH_ANGLE.min, BRANCH_ANGLE.max),
    limbPairs: changes(draws[3]) ? clamp(from.limbPairs + (within(draws[3]) < 0.5 ? -1 : 1), LIMB_PAIRS.min, LIMB_PAIRS.max) : from.limbPairs,
    eyes: changes(draws[4]) ? EYE_COUNTS[Math.floor(within(draws[4]) * EYE_COUNTS.length)] : from.eyes,
    eyePlacement: changes(draws[5]) ? (from.eyePlacement === "front" ? "side" : "front") : from.eyePlacement,
    build: clamp(from.build + step(draws[6]) * DRIFT * 2, -1, 1),
    tone: clamp(from.tone + step(draws[7]) * DRIFT * 2, -1, 1),
  };
}

function clamp(x: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, x));
}

// ── Pigment colour ───────────────────────────────────────────────────────────

// A pigment absorbs a band this wide (1/e half-width, nm) around its peak, this deeply,
// over a leaf that reflects this much where the pigment does not absorb
const PIGMENT_BAND_NM = 45;
const PIGMENT_DEPTH = 0.9;
const LEAF_REFLECTANCE = 0.35;

// CIE 1931 2° observer, multi-lobe fit (Wyman, Sloan & Shirley 2013)
function lobe(nm: number, mean: number, below: number, above: number): number {
  const t = (nm - mean) / (nm < mean ? below : above);
  return Math.exp(-0.5 * t * t);
}
function cieXYZ(nm: number): [number, number, number] {
  return [
    1.056 * lobe(nm, 599.8, 37.9, 31.0) + 0.362 * lobe(nm, 442.0, 16.0, 26.7) - 0.065 * lobe(nm, 501.1, 20.4, 26.2),
    0.821 * lobe(nm, 568.8, 46.9, 40.5) + 0.286 * lobe(nm, 530.9, 16.3, 31.1),
    1.217 * lobe(nm, 437.0, 11.8, 36.0) + 0.681 * lobe(nm, 459.0, 26.0, 13.8),
  ];
}
// hc / k, nm·K
const PLANCK_NM_K = 1.4388e7;
function planck(nm: number, temperatureK: number): number {
  return 1 / (Math.pow(nm, 5) * Math.expm1(PLANCK_NM_K / (nm * temperatureK)));
}
function xyzToLinearSRGB([x, y, z]: [number, number, number]): LinearRGB {
  return [
    3.2406 * x - 1.5372 * y - 0.4986 * z,
    -0.9689 * x + 1.8758 * y + 0.0415 * z,
    0.0557 * x - 0.2040 * y + 1.0570 * z,
  ];
}

/**
 * The colour of a surface with this reflectance, lit by a star at this
 * temperature, as an eye adapted to that star sees it: a white surface looks white.
 */
function colourUnder(reflectance: (nm: number) => number, starTemperatureK: number): LinearRGB {
  const lit: [number, number, number] = [0, 0, 0];
  const white: [number, number, number] = [0, 0, 0];
  for (let nm = 380; nm <= 720; nm += 5) {
    const light = planck(nm, starTemperatureK);
    const [x, y, z] = cieXYZ(nm);
    const r = reflectance(nm);
    lit[0] += light * r * x; lit[1] += light * r * y; lit[2] += light * r * z;
    white[0] += light * x; white[1] += light * y; white[2] += light * z;
  }
  const litRGB = xyzToLinearSRGB(lit);
  const whiteRGB = xyzToLinearSRGB(white);
  return litRGB.map((c, i) => clamp(c / whiteRGB[i], 0, 1)) as LinearRGB;
}

/** A pigment's colour: the light it does not absorb, from its absorption peak, under its star. */
export function pigmentColour(absorptionPeakNm: number, starTemperatureK: number): LinearRGB {
  return colourUnder((nm) => {
    const t = (nm - absorptionPeakNm) / PIGMENT_BAND_NM;
    return LEAF_REFLECTANCE * (1 - PIGMENT_DEPTH * Math.exp(-t * t));
  }, starTemperatureK);
}

// ── Animal and microbe colours (presentation choices) ────────────────────────

// Linear RGB. Deep water: pale and translucent; shallow water: dark above, light below;
// land: earthy. `tone` moves each a little towards the second colour.
const ANIMAL_TONES: Record<Habitat, { back: [LinearRGB, LinearRGB]; belly: LinearRGB }> = {
  "deep-water":    { back: [[0.55, 0.45, 0.48], [0.62, 0.30, 0.28]], belly: [0.70, 0.62, 0.64] },
  "shallow-water": { back: [[0.10, 0.16, 0.20], [0.16, 0.20, 0.12]], belly: [0.62, 0.64, 0.60] },
  land:            { back: [[0.22, 0.15, 0.08], [0.32, 0.27, 0.14]], belly: [0.45, 0.38, 0.28] },
};
// Microbes without pigment for light: pale, a little yellow
const PALE_CELL: LinearRGB = [0.62, 0.58, 0.45];

function mix(a: LinearRGB, b: LinearRGB, t: number): LinearRGB {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

// ── Body plans ───────────────────────────────────────────────────────────────

// Producers on land: height-to-width at 1 g (a tree is about this slender), and its limits
const PRODUCER_SLENDERNESS_AT_1G = 6;
const PRODUCER_SLENDERNESS = { min: 1, max: 20 };
const FROND_SLENDERNESS = 8;
const ENCRUSTING_SLENDERNESS = 0.3;   // wider than tall
// Leaf size follows 1/flux within these limits
const LEAF_SCALE = { min: 0.5, max: 3 };
// Branch splits: one more for every this many orders of magnitude of mass above a gram (a presentation choice)
const BRANCH_DEPTH = { atGram: 2, perDecade: 0.6, max: 7 };

// Animals: body girth and leg length at 1 g, over body length
const ANIMAL_GIRTH_AT_1G = 0.25;
const LEG_LENGTH_AT_1G = 0.45;
const SWIMMER_GIRTH = 0.2;
// Segments: small bodies show more of them (as worms and arthropods do); a presentation choice
const SEGMENTS = { atKilogram: 5, perDecade: -0.5, min: 3, max: 11 };
// Head: from an eighth of the body (no information processing) to a third (most)
const HEAD_SIZE = { min: 0.12, max: 0.32 };
// Eyes: their size over head length, in light and in the dark of deep water
const EYE_SIZE = { lit: 0.22, dark: 0.08 };
// How far `build` moves a proportion
const BUILD_SPREAD = 0.15;

/** Whether a lineage is multicellular, by the simulation's own line (engine.ts). */
export function isMulticellular(lineage: Lineage): boolean {
  return lineage.genome.log10BodyMassKg > MULTICELLULAR_LOG10_KG;
}

function microbePlan(lineage: Lineage, heritage: Heritage, env: MorphologyEnvironment): MicrobePlan {
  const { energySource, habitat, absorptionPeakNm, log10BodyMassKg } = lineage.genome;
  // Colony form (a presentation choice): light users in shallow water build mounds
  // (stromatolites), chemical ones mats; deep chemical users hang in filaments by
  // vents; on land, crusts; light users in deep water drift as plankton; consumers hunt alone.
  const colony: ColonyForm = energySource === "consumer" ? "single-cells"
    : habitat === "land" ? "crust"
    : habitat === "deep-water" ? (energySource === "light" ? "plankton" : "filaments")
    : energySource === "light" ? "mound" : "mat";
  return {
    kind: "microbe",
    lengthM: lengthOf(log10BodyMassKg, MICROBE_SLENDERNESS[heritage.cellShape]),
    cellShape: heritage.cellShape,
    colony,
    colour: energySource === "light" ? pigmentColour(absorptionPeakNm, env.starTemperatureK) : PALE_CELL,
  };
}

function producerPlan(lineage: Lineage, heritage: Heritage, env: MorphologyEnvironment): ProducerPlan {
  const { energySource, habitat, absorptionPeakNm, log10BodyMassKg } = lineage.genome;
  const form: ProducerForm = energySource === "chemical" ? "encrusting" : habitat === "land" ? "branching" : "frond";
  const slenderness = form === "encrusting" ? ENCRUSTING_SLENDERNESS
    : form === "frond" ? FROND_SLENDERNESS * (1 + BUILD_SPREAD * heritage.build)
    : clamp(PRODUCER_SLENDERNESS_AT_1G / env.gravityG * (1 + BUILD_SPREAD * heritage.build),
      PRODUCER_SLENDERNESS.min, PRODUCER_SLENDERNESS.max);
  const decadesAboveGram = log10BodyMassKg + 3;
  return {
    kind: "producer",
    form,
    lengthM: lengthOf(log10BodyMassKg, slenderness),
    slenderness,
    branchDepth: Math.round(clamp(BRANCH_DEPTH.atGram + BRANCH_DEPTH.perDecade * decadesAboveGram, 1, BRANCH_DEPTH.max)),
    branchSplit: heritage.branchSplit,
    branchAngle: heritage.branchAngle,
    leafScale: clamp(1 / env.starFlux, LEAF_SCALE.min, LEAF_SCALE.max),
    colour: energySource === "light" ? pigmentColour(absorptionPeakNm, env.starTemperatureK) : PALE_CELL,
  };
}

function animalPlan(lineage: Lineage, heritage: Heritage, env: MorphologyEnvironment): AnimalPlan {
  const { habitat, log10BodyMassKg, informationProcessing } = lineage.genome;
  const walker = habitat === "land";
  const build = 1 + BUILD_SPREAD * heritage.build;
  // On land the body carries its weight: stouter and shorter-legged on a heavier world
  const girth = walker ? ANIMAL_GIRTH_AT_1G * Math.sqrt(env.gravityG) * build : SWIMMER_GIRTH * build;
  const tones = ANIMAL_TONES[habitat];
  const tone = (heritage.tone + 1) / 2;
  return {
    kind: "animal",
    locomotion: walker ? "walker" : "swimmer",
    lengthM: lengthOf(log10BodyMassKg, ANIMAL_SLENDERNESS),
    segments: Math.round(clamp(SEGMENTS.atKilogram + SEGMENTS.perDecade * log10BodyMassKg, SEGMENTS.min, SEGMENTS.max)),
    girth,
    limbPairs: heritage.limbPairs,
    legLength: walker ? LEG_LENGTH_AT_1G / Math.sqrt(env.gravityG) / build : 0,
    headSize: HEAD_SIZE.min + (HEAD_SIZE.max - HEAD_SIZE.min) * informationProcessing,
    eyes: heritage.eyes,
    eyePlacement: heritage.eyePlacement,
    eyeSize: habitat === "deep-water" ? EYE_SIZE.dark : EYE_SIZE.lit,
    colour: mix(tones.back[0], tones.back[1], tone),
    bellyColour: tones.belly,
  };
}

/**
 * A lineage's body plan on its planet. `byId` holds its ancestors (every lineage
 * of the planet, by id), for the details it inherits; `memo` may be shared
 * between calls for one planet so each ancestor is worked out once.
 */
export function bodyPlan(
  lineage: Lineage, byId: ReadonlyMap<number, Lineage>, env: MorphologyEnvironment, keys: MorphologyKeys,
  memo = new Map<number, Heritage>(),
): BodyPlan {
  const heritage = heritageOf(lineage, byId, keys, memo);
  if (!isMulticellular(lineage)) return microbePlan(lineage, heritage, env);
  return lineage.genome.energySource === "consumer"
    ? animalPlan(lineage, heritage, env)
    : producerPlan(lineage, heritage, env);
}

/** Body plans of all of a planet's lineages, by id. */
export function bodyPlans(lineages: readonly Lineage[], env: MorphologyEnvironment, keys: MorphologyKeys): Map<number, BodyPlan> {
  const byId = new Map(lineages.map((l) => [l.id, l]));
  const memo = new Map<number, Heritage>();
  return new Map(lineages.map((l) => [l.id, bodyPlan(l, byId, env, keys, memo)]));
}
