import { createRNG } from "./rng";
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
  return Math.max(0.003, 10 / Math.pow(mass, 2.5));
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
  return Math.pow(mass, 0.8);
}

function calcTemperature(cls: StellarClass, mass: number, jitter: number): number {
  const [lo, hi] = TEMP_RANGE[cls];
  if (cls === "black-hole") return 0;
  if (cls === "main-sequence") {
    // Stefan–Boltzmann in solar units: L = R²·T⁴, so T = T☉·(L / R²)^¼.
    // Uses the same mass–luminosity relation as calcLuminosity, so colour and brightness agree.
    const radius = mainSequenceRadius(mass);
    const t = SOLAR_TEMPERATURE_K * Math.pow(Math.pow(mass, 3.5) / (radius * radius), 0.25);
    return Math.min(hi, Math.max(lo, t * (0.9 + jitter * 0.2)));
  }
  return lo + (hi - lo) * jitter;
}

// ── Luminosity (AF-025) ───────────────────────────────────────────────────────

function calcLuminosity(cls: StellarClass, mass: number, temp: number): number {
  if (cls === "black-hole") return 0;
  if (cls === "neutron-star") return 0.00001;
  if (cls === "white-dwarf") return 0.001 + (temp / 80000) * 0.05;
  if (cls === "red-giant") return Math.pow(mass, 3.5) * 500;
  return Math.pow(mass, 3.5);
}

// ── Temperature → RGB (AF-027) ────────────────────────────────────────────────

export function temperatureToColor(temp: number): [number, number, number] {
  if (temp <= 0) return [0.15, 0.08, 0.25];
  const t = Math.max(1000, Math.min(temp, 40000)) / 100;

  let r: number;
  if (t <= 66) {
    r = 1;
  } else {
    r = Math.max(0, Math.min(1, Math.pow(t - 60, -0.1332) * 3.29));
  }

  let g: number;
  if (t <= 66) {
    g = Math.max(0, Math.min(1, Math.log(t) * 0.3909 - 0.5516));
  } else {
    g = Math.max(0, Math.min(1, Math.pow(t - 60, -0.0755) * 2.88));
  }

  let b: number;
  if (t >= 66) {
    b = 1;
  } else if (t <= 19) {
    b = 0;
  } else {
    b = Math.max(0, Math.min(1, Math.log(t - 10) * 0.5432 - 1.196));
  }

  return [r, g, b];
}

// ── Star positions within galaxy morphology (AF-019) ──────────────────────────

function posSpiral(rng: () => number, scale: number): [number, number, number] {
  const arm = Math.floor(rng() * 2);
  const t = Math.pow(rng(), 0.7);
  const radius = t * scale;
  const angle = (arm / 2) * Math.PI * 2 + t * Math.PI * 2 * 1.2;
  const scatter = (rng() - 0.5) * 0.25 * radius;
  return [
    Math.cos(angle) * radius + scatter,
    (rng() - 0.5) * scale * 0.05 * (1 - t * 0.8),
    Math.sin(angle) * radius + scatter,
  ];
}

function posElliptical(rng: () => number, scale: number): [number, number, number] {
  let x: number, y: number, z: number;
  do { x = (rng() - 0.5) * 2; y = (rng() - 0.5) * 2; z = (rng() - 0.5) * 2; }
  while (x * x + y * y + z * z > 1);
  const r = Math.pow(rng(), 0.6) * scale;
  return [x * r, y * r * 0.5, z * r];
}

function posIrregular(rng: () => number, scale: number): [number, number, number] {
  const r = Math.pow(rng(), 0.5) * scale;
  const theta = rng() * Math.PI * 2;
  const phi = Math.acos(2 * rng() - 1);
  return [
    r * Math.sin(phi) * Math.cos(theta),
    r * Math.sin(phi) * Math.sin(theta) * 0.3,
    r * Math.cos(phi),
  ];
}

// ── Public API (AF-017) ───────────────────────────────────────────────────────

export interface StellarPopulation {
  stars: Star[];
  galaxySeed: number;
}

// Salt keeps star RNG independent from galaxy particle RNG
const STAR_SALT = 0x5E3D57A2;
const STAR_COUNT = 2000;

/** Age of every universe, in billion years; no star is older. */
export const UNIVERSE_AGE_GYR = 13.7;

export function generateStarsFor(
  galaxy: GalaxyConfig,
  universeAgeBY = UNIVERSE_AGE_GYR,
  cfg?: UniverseConfig
): StellarPopulation {
  const config = cfg ?? makeConfig(galaxy.seed);
  const rng = createRNG((galaxy.seed ^ STAR_SALT) >>> 0);
  const stars: Star[] = [];

  for (let i = 0; i < STAR_COUNT; i++) {
    // stellarIgnitionThreshold > 1 shifts distribution toward heavier stars
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
