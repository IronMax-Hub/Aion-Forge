import { createRNG, SALT } from "./rng";
import { pow, log, sin, cos } from "./detmath";
import type { GalaxyConfig } from "./galaxy";
import { makeConfig } from "./config";
import type { UniverseConfig } from "./config";

// ── Data model (AF-018) ───────────────────────────────────────────────────────

export type StellarClass =
  | "protostar"
  | "main-sequence"
  | "red-giant"
  | "white-dwarf"
  | "neutron-star"
  | "black-hole";

export interface Star {
  id: number;
  position: [number, number, number];
  mass: number;        // solar masses
  age: number;         // billion yearss
  lifespan: number;    // billion years
  temperature: number; // Kelvin
  luminosity: number;  // solar luminosities
  classification: StellarClass;
  isRare: boolean;
}

// ── Mass distribution (AF-020) ────────────────────────────────────────────────
// IMF-inspired: heavily weighted toward low-mass stars

function generateMass(r: number): number {
  if (r < 0.60) return 0.1 + r * 1.5;
  if (r < 0.88) return 1.0 + (r - 0.60) * 14.3;
  if (r < 0.97) return 5.0 + (r - 0.88) * 166.7;
  return 20 + (r - 0.97) * 2667;
}

// ── Lifespan from mass (AF-021) ───────────────────────────────────────────────
// t ∝ M^-2.5

function calcLifespan(mass: number): number {
  return Math.max(0.003, 10 / pow(mass, 2.5));
}

// ── Classification (AF-023) ───────────────────────────────────────────────────

// Life phases as fractions of a star's lifespan. Shared with history.ts so the
// timeline dates transitions at the same moments the classification uses.
export const MAIN_SEQUENCE_END_FRACTION = 0.85;   // hydrogen exhausted → red giant
export const REMNANT_FRACTION          = 0.95;   // envelope lost / core collapse → remnant

// Pre-main-sequence contraction: a small share of the lifespan, but capped in
// absolute time — even the lightest red dwarfs settle onto the main sequence
// within a few hundred million years.
const PROTOSTAR_FRACTION = 0.01;
const PROTOSTAR_MAX_GYR  = 0.5;

/** How long a star spends as a protostar before reaching the main sequence, in Gyr. */
export function protostarDuration(lifespan: number): number {
  return Math.min(lifespan * PROTOSTAR_FRACTION, PROTOSTAR_MAX_GYR);
}

function classify(mass: number, age: number, lifespan: number): StellarClass {
  const maturity = age / lifespan;
  if (age < protostarDuration(lifespan)) return "protostar";
  if (maturity < MAIN_SEQUENCE_END_FRACTION) return "main-sequence";
  if (mass < 8) return maturity < REMNANT_FRACTION ? "red-giant" : "white-dwarf";
  return maturity < REMNANT_FRACTION ? "red-giant" : mass > 25 ? "black-hole" : "neutron-star";
}

// ── Temperature (AF-024) ──────────────────────────────────────────────────────

const TEMP_RANGE: Record<StellarClass, [number, number]> = {
  protostar: [2000, 4000],
  "main-sequence": [2300, 40000], // coolest red dwarfs to hottest O stars
  "red-giant": [3000, 5000],
  "white-dwarf": [8000, 80000],
  "neutron-star": [100000, 1000000],
  "black-hole": [0, 0],
};

const SOLAR_TEMPERATURE_K = 5772;

// Main-sequence radius in solar radii (approximate mass–radius relation).
function mainSequenceRadius(mass: number): number {
  return pow(mass, 0.8);
}

function calcTemperature(cls: StellarClass, mass: number, jitter: number): number {
  const [lo, hi] = TEMP_RANGE[cls];
  if (cls === "black-hole") return 0;
  if (cls === "main-sequence") {
    // Stefan–Boltzmann in solar units: L = R²·T⁴, so T = T☉·(L / R²)^¼.
    // Uses the same mass–luminosity relation as calcLuminosity, so colour and brightness agree.
    const radius = mainSequenceRadius(mass);
    const t = SOLAR_TEMPERATURE_K * pow(mainSequenceLuminosity(mass) / (radius * radius), 0.25);
    return Math.min(hi, Math.max(lo, t * (0.9 + jitter * 0.2)));
  }
  return lo + (hi - lo) * jitter;
}

// ── Luminosity (AF-025) ───────────────────────────────────────────────────────

/** Mass–luminosity relation for a main-sequence star, in solar luminosities. */
function mainSequenceLuminosity(mass: number): number {
  return pow(mass, 3.5);
}

function calcLuminosity(cls: StellarClass, mass: number, temp: number): number {
  if (cls === "black-hole") return 0;
  if (cls === "neutron-star") return 0.00001;
  if (cls === "white-dwarf") return 0.001 + (temp / 80000) * 0.05;
  if (cls === "red-giant") return mainSequenceLuminosity(mass) * 500;
  return mainSequenceLuminosity(mass);
}

// ── Luminosity through time (Worlds Up Close A1) ──────────────────────────────
//
// Stars brighten as they burn hydrogen: the Sun began at about 70% of today's
// output. A planet's climate history (A2b) reads the star's luminosity at each
// moment of its life from here.
//
//   main sequence:  L(t) = L_ref · (1 + k·t/t_ms) / (1 + k·t_ref/t_ms),  k = 0.8
//   afterwards:     today's luminosity (red giant, white dwarf or remnant)
//
// t_ms is when the main sequence ends (MAIN_SEQUENCE_END_FRACTION of the lifespan).
// A star still on the main sequence is anchored to today (t_ref = age,
// L_ref = its luminosity), so the present never changes. A star that has left it
// has no main-sequence "today", so its track is anchored at mid main sequence
// (t_ref = t_ms / 2, L_ref = mass–luminosity relation), the typical age at which
// main-sequence stars are seen, which matches its main-sequence siblings.
//
// Limits: the brightening is linear in time and the jump to the giant phase is
// instant; subgiant growth and the helium flash are not modelled.

/** Fractional brightening over the main sequence (the Sun: ~0.7 → 1.25 of today). */
export const MAIN_SEQUENCE_BRIGHTENING = 0.8;

/** Time after the star formed when it leaves the main sequence, in Gyr. */
export function mainSequenceEndGyr(star: Star): number {
  return star.lifespan * MAIN_SEQUENCE_END_FRACTION;
}

// Sun's radius in AU
const SOLAR_RADIUS_AU = 0.00465047;

/**
 * The star's radius today in AU, from its luminosity and temperature
 * (Stefan–Boltzmann: L ∝ R²·T⁴). A red giant swells to an AU or more.
 */
export function stellarRadiusAU(star: Star): number {
  const t = SOLAR_TEMPERATURE_K / star.temperature;
  return SOLAR_RADIUS_AU * Math.sqrt(star.luminosity) * t * t;
}

/** The star's luminosity t Gyr after it formed, in solar luminosities. */
export function luminosityAt(star: Star, tGyr: number): number {
  const msEnd = mainSequenceEndGyr(star);
  const leftMainSequence = star.age >= msEnd;
  if (leftMainSequence && tGyr >= msEnd) return star.luminosity;

  const [tRef, lRef] = leftMainSequence
    ? [msEnd / 2, mainSequenceLuminosity(star.mass)]
    : [star.age, star.luminosity];
  const k = MAIN_SEQUENCE_BRIGHTENING;
  // Ratio first: at t = t_ref it is exactly 1, so today's luminosity is returned unchanged
  return lRef * ((1 + k * tGyr / msEnd) / (1 + k * tRef / msEnd));
}

/**
 * The star's surface temperature t Gyr after it formed, in K. Like luminosityAt:
 * a star still on the main sequence keeps today's temperature throughout (its
 * slight warming as it brightens is not modelled); a star that has left it had
 * the main-sequence temperature for its mass until then, and today's since.
 */
export function temperatureAt(star: Star, tGyr: number): number {
  const msEnd = mainSequenceEndGyr(star);
  if (star.age < msEnd || tGyr >= msEnd) return star.temperature;
  const [lo, hi] = TEMP_RANGE["main-sequence"];
  const radius = mainSequenceRadius(star.mass);
  const t = SOLAR_TEMPERATURE_K * pow(mainSequenceLuminosity(star.mass) / (radius * radius), 0.25);
  return Math.min(hi, Math.max(lo, t));
}

// ── Temperature → RGB (AF-027) ────────────────────────────────────────────────

export function temperatureToColor(temp: number): [number, number, number] {
  if (temp <= 0) return [0.15, 0.08, 0.25];
  const t = Math.max(1000, Math.min(temp, 40000)) / 100;

  let r: number;
  if (t <= 66) {
    r = 1;
  } else {
    r = Math.max(0, Math.min(1, pow(t - 60, -0.1332) * 3.29));
  }

  let g: number;
  if (t <= 66) {
    g = Math.max(0, Math.min(1, log(t) * 0.3909 - 0.5516));
  } else {
    g = Math.max(0, Math.min(1, pow(t - 60, -0.0755) * 2.88));
  }

  let b: number;
  if (t >= 66) {
    b = 1;
  } else if (t <= 19) {
    b = 0;
  } else {
    b = Math.max(0, Math.min(1, log(t - 10) * 0.5432 - 1.196));
  }

  return [r, g, b];
}

// ── Star positions within galaxy morphology (AF-019) ──────────────────────────

function posSpiral(rng: () => number, scale: number): [number, number, number] {
  const arm = Math.floor(rng() * 2);
  const t = pow(rng(), 0.7);
  const radius = t * scale;
  const angle = (arm / 2) * Math.PI * 2 + t * Math.PI * 2 * 1.2;
  const scatter = (rng() - 0.5) * 0.25 * radius;
  return [
    cos(angle) * radius + scatter,
    (rng() - 0.5) * scale * 0.05 * (1 - t * 0.8),
    sin(angle) * radius + scatter,
  ];
}

function posElliptical(rng: () => number, scale: number): [number, number, number] {
  let x: number, y: number, z: number;
  do { x = (rng() - 0.5) * 2; y = (rng() - 0.5) * 2; z = (rng() - 0.5) * 2; }
  while (x * x + y * y + z * z > 1);
  const r = pow(rng(), 0.6) * scale;
  return [x * r, y * r * 0.5, z * r];
}

function posIrregular(rng: () => number, scale: number): [number, number, number] {
  const r = Math.sqrt(rng()) * scale;
  const theta = rng() * Math.PI * 2;
  // A uniform direction: cos φ uniform in [−1, 1], so sin φ = √(1 − cos²φ) needs no acos
  const cosPhi = 2 * rng() - 1;
  const sinPhi = Math.sqrt(1 - cosPhi * cosPhi);
  return [
    r * sinPhi * cos(theta),
    r * sinPhi * sin(theta) * 0.3,
    r * cosPhi,
  ];
}

// ── Public API (AF-017) ───────────────────────────────────────────────────────

export interface StellarPopulation {
  stars: Star[];
  galaxySeed: number;
}

export const STAR_COUNT = 2000;

/** Age of every universe, in billion years; no star is older. */
export const UNIVERSE_AGE_GYR = 13.7;

export function generateStarsFor(
  galaxy: GalaxyConfig,
  universeAgeBY = UNIVERSE_AGE_GYR,
  cfg?: UniverseConfig
): StellarPopulation {
  const config = cfg ?? makeConfig(galaxy.seed);
  // The salt keeps the star stream independent of the galaxy particle stream
  const rng = createRNG((galaxy.seed ^ SALT.STAR) >>> 0);
  const stars: Star[] = [];

  for (let i = 0; i < STAR_COUNT; i++) {
    // stellarIgnitionThreshold > 1 shrinks the mass roll: fewer heavy stars, more small long-lived ones
    const massRoll = Math.min(0.9999, rng() * (1 / config.stellarIgnitionThreshold));
    const mass = generateMass(Math.max(0, massRoll));
    // entropyRate > 1 = faster decay = shorter lifespans
    const lifespan = calcLifespan(mass) / config.entropyRate;
    const age = rng() * Math.min(lifespan, universeAgeBY);
    const cls = classify(mass, age, lifespan);
    const isRare =
      mass > 40 ||
      cls === "neutron-star" ||
      cls === "black-hole" ||
      (cls === "main-sequence" && age > lifespan * 0.9 && mass < 0.5);
    const temp = calcTemperature(cls, mass, rng());
    const luminosity = calcLuminosity(cls, mass, temp);

    let pos: [number, number, number];
    if (galaxy.type === "spiral") pos = posSpiral(rng, galaxy.scale);
    else if (galaxy.type === "elliptical") pos = posElliptical(rng, galaxy.scale);
    else pos = posIrregular(rng, galaxy.scale);

    stars.push({ id: i, position: pos, mass, age, lifespan, temperature: temp, luminosity, classification: cls, isRare });
  }

  return { stars, galaxySeed: galaxy.seed };
}
