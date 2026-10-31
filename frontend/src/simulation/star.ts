import { createRNG, gaussian, mixSeed, SALT } from "./rng";
import { feH, gasMetallicity } from "./metallicity";
import { pow, log, sin, cos, exp } from "./detmath";
import type { GalaxyConfig } from "./galaxy";
import { makeConfig } from "./config";
import { drawCompanion } from "./binary";
import type { Companion, CompanionDraw } from "./binary";
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
  metallicity: number; // [Fe/H], dex: the gas it formed from (MZ2)
  companion: Companion | null; // its binary companion (BS1)
}

// ── Mass distribution (AF-020, A2.1) ──────────────────────────────────────────
//
// The Kroupa (2001) initial mass function: the number of stars per unit mass
// falls as m^−1.3 from 0.08 M☉ (hydrogen burning's lower limit) to 0.5 M☉, and
// as m^−2.3 above, to 100 M☉. About 73% of stars are lighter than 0.5 M☉ and
// about 0.4% heavier than 8 M☉. A star's mass is drawn by the function's exact
// inverse: the draw u is the share of stars lighter than it.
//
// The ignition threshold (a universe law) reshapes the draw smoothly, u → u^threshold:
// above 1 the draws crowd towards 0, so fewer heavy stars and more small,
// long-lived ones; below 1 the opposite. At 1 the IMF is Kroupa's.

/** The Kroupa IMF's pieces: dN/dm ∝ m^−slope from each piece's lower mass to the next's, M☉. */
export const KROUPA_IMF = {
  pieces: [
    { fromSolar: 0.08, slope: 1.3 },
    { fromSolar: 0.5, slope: 2.3 },
  ],
  maxSolar: 100,
} as const;

/** ∫ m^−slope dm from a to b. */
function powerIntegral(a: number, b: number, slope: number): number {
  const k = 1 - slope;
  return (pow(b, k) - pow(a, k)) / k;
}

// Each piece's weight (continuous at its lower edge) and its share of all stars, computed once
const IMF_PIECES = (() => {
  const bounds = KROUPA_IMF.pieces.map((piece, i) => ({
    ...piece, toSolar: KROUPA_IMF.pieces[i + 1]?.fromSolar ?? KROUPA_IMF.maxSolar,
  }));
  let weight = 1;
  const weighted = bounds.map((piece, i) => {
    if (i > 0) weight *= pow(piece.fromSolar, piece.slope - bounds[i - 1].slope);   // continuous at the joint
    return { ...piece, weight, count: weight * powerIntegral(piece.fromSolar, piece.toSolar, piece.slope) };
  });
  const total = weighted.reduce((sum, piece) => sum + piece.count, 0);
  let below = 0;
  return weighted.map((piece) => {
    const shareFrom = below / total;
    below += piece.count;
    return { ...piece, shareFrom, share: piece.count / total, total };
  });
})();

/** The mass, M☉, of which a share u (0–1) of stars are lighter: the Kroupa IMF's inverse. */
export function kroupaMass(u: number): number {
  const piece = IMF_PIECES.find((p) => u < p.shareFrom + p.share) ?? IMF_PIECES[IMF_PIECES.length - 1];
  const k = 1 - piece.slope;
  // Solve weight · ∫ from fromSolar to m = (u − shareFrom) · total for m
  const inner = pow(piece.fromSolar, k) + (k * (u - piece.shareFrom) * piece.total) / piece.weight;
  return Math.min(piece.toSolar, pow(inner, 1 / k));
}

// ── Lifespan from mass (AF-021) ───────────────────────────────────────────────
// t ∝ M^-2.5

/** Lifespan = solarGyr / M^massExponent, never below minGyr. */
export const LIFESPAN = { solarGyr: 10, massExponent: 2.5, minGyr: 0.003 } as const;

function calcLifespan(mass: number): number {
  return Math.max(LIFESPAN.minGyr, LIFESPAN.solarGyr / pow(mass, LIFESPAN.massExponent));
}

// ── Classification (AF-023) ───────────────────────────────────────────────────

// Life phases as fractions of a star's lifespan. Shared with history.ts so the
// timeline dates transitions at the same moments the classification uses.
export const MAIN_SEQUENCE_END_FRACTION = 0.85;   // hydrogen exhausted → red giant
export const REMNANT_FRACTION          = 0.95;   // envelope lost / core collapse → remnant

// Pre-main-sequence contraction: a small share of the lifespan, but capped in
// absolute time — even the lightest red dwarfs settle onto the main sequence
// within a few hundred million years.
export const PROTOSTAR_FRACTION = 0.01;
export const PROTOSTAR_MAX_GYR  = 0.5;
/** Remnants by mass: below 8 M☉ a white dwarf; up to 25 M☉ a neutron star; above, a black hole. */
export const REMNANT_MASS = { neutronStarFrom: 8, blackHoleAbove: 25 } as const;

/** How long a star spends as a protostar before reaching the main sequence, in Gyr. */
export function protostarDuration(lifespan: number): number {
  return Math.min(lifespan * PROTOSTAR_FRACTION, PROTOSTAR_MAX_GYR);
}

function classify(mass: number, age: number, lifespan: number): StellarClass {
  const maturity = age / lifespan;
  if (age < protostarDuration(lifespan)) return "protostar";
  if (maturity < MAIN_SEQUENCE_END_FRACTION) return "main-sequence";
  if (mass < REMNANT_MASS.neutronStarFrom) return maturity < REMNANT_FRACTION ? "red-giant" : "white-dwarf";
  return maturity < REMNANT_FRACTION ? "red-giant" : mass > REMNANT_MASS.blackHoleAbove ? "black-hole" : "neutron-star";
}

// ── Temperature (AF-024) ──────────────────────────────────────────────────────

export const TEMP_RANGE: Record<StellarClass, [number, number]> = {
  protostar: [2000, 4000],
  "main-sequence": [2300, 40000], // coolest red dwarfs to hottest O stars
  "red-giant": [3000, 5000],
  "white-dwarf": [8000, 80000],
  "neutron-star": [100000, 1000000],
  "black-hole": [0, 0],
};

export const SOLAR_TEMPERATURE_K = 5772;
/** Main-sequence radius ∝ M^0.8 (solar radii). */
export const MS_RADIUS_EXPONENT = 0.8;
/** A main-sequence star's temperature is jittered: × (low + draw · span), ±10%. */
export const TEMPERATURE_JITTER = { low: 0.9, span: 0.2 } as const;

// Main-sequence radius in solar radii (approximate mass–radius relation).
function mainSequenceRadius(mass: number): number {
  return pow(mass, MS_RADIUS_EXPONENT);
}

function calcTemperature(cls: StellarClass, mass: number, jitter: number): number {
  const [lo, hi] = TEMP_RANGE[cls];
  if (cls === "black-hole") return 0;
  if (cls === "main-sequence") {
    // Stefan–Boltzmann in solar units: L = R²·T⁴, so T = T☉·(L / R²)^¼.
    // Uses the same mass–luminosity relation as calcLuminosity, so colour and brightness agree.
    const radius = mainSequenceRadius(mass);
    const t = SOLAR_TEMPERATURE_K * pow(mainSequenceLuminosity(mass) / (radius * radius), 0.25);
    return Math.min(hi, Math.max(lo, t * (TEMPERATURE_JITTER.low + jitter * TEMPERATURE_JITTER.span)));
  }
  return lo + (hi - lo) * jitter;
}

// ── Luminosity (AF-025) ───────────────────────────────────────────────────────

/** L = M^3.5 on the main sequence (solar units). */
export const MASS_LUMINOSITY_EXPONENT = 3.5;
/** A red giant shines this many times its main-sequence luminosity. */
export const GIANT_LUMINOSITY_FACTOR = 500;
/** A neutron star's luminosity, L☉; a white dwarf's is base + (T / hottestK) · range. */
export const NEUTRON_STAR_LUMINOSITY = 0.00001;
export const WHITE_DWARF_LUMINOSITY = { base: 0.001, hottestK: 80000, range: 0.05 } as const;

/** Mass–luminosity relation for a main-sequence star, in solar luminosities. */
function mainSequenceLuminosity(mass: number): number {
  return pow(mass, MASS_LUMINOSITY_EXPONENT);
}

function calcLuminosity(cls: StellarClass, mass: number, temp: number): number {
  if (cls === "black-hole") return 0;
  if (cls === "neutron-star") return NEUTRON_STAR_LUMINOSITY;
  if (cls === "white-dwarf") return WHITE_DWARF_LUMINOSITY.base + (temp / WHITE_DWARF_LUMINOSITY.hottestK) * WHITE_DWARF_LUMINOSITY.range;
  if (cls === "red-giant") return mainSequenceLuminosity(mass) * GIANT_LUMINOSITY_FACTOR;
  return mainSequenceLuminosity(mass);
}

// ── Luminosity through time (Worlds Up Close A1) ──────────────────────────────
//
// Stars brighten as they burn hydrogen: the Sun began at about 70% of today's
// output. A planet's climate history (A2b) reads the star's luminosity at each
// moment of its life from here.
//
//   main sequence:  L(t) = L_ref · (1 + k·t/t_ms) / (1 + k·t_ref/t_ms),  k = 0.8
//   afterwards:     today's luminosity (red giant, white dwarf or remnant); a
//                   remnant was first a giant until REMNANT_FRACTION of its life
//                   (decision 44, below)
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
export const SOLAR_RADIUS_AU = 0.00465047;

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
  if (star.age >= msEnd && tGyr >= msEnd) {
    // A remnant was a giant from the main sequence's end until it became one (decision 44)
    if (isRemnant(star) && tGyr < remnantFromGyr(star)) return pastGiantLuminosity(star);
    return star.luminosity;
  }
  return mainSequenceTrack(star, tGyr);
}

// ── The past giant phase of today's remnants (Galaxy Through Time AE2, decision 44) ──
//
// A star that is a white dwarf, neutron star or black hole today was a giant
// between the end of its main sequence and REMNANT_FRACTION of its life. Its
// planets felt that light, and planets inside the giant were engulfed. A past
// giant's temperature is not stored, so it is taken as the middle of the
// giant range (owner decision): 4,000 K.

/** A past giant's temperature, K: the middle of the model's giant range. */
export const PAST_GIANT_TEMPERATURE_K = (TEMP_RANGE["red-giant"][0] + TEMP_RANGE["red-giant"][1]) / 2;

const REMNANTS: readonly StellarClass[] = ["white-dwarf", "neutron-star", "black-hole"];

function isRemnant(star: Star): boolean {
  return REMNANTS.includes(star.classification);
}

/** When the star became a remnant, Gyr after it formed. */
export function remnantFromGyr(star: Star): number {
  return star.lifespan * REMNANT_FRACTION;
}

function pastGiantLuminosity(star: Star): number {
  return mainSequenceLuminosity(star.mass) * GIANT_LUMINOSITY_FACTOR;
}

/** The radius a remnant reached as a giant, AU (Stefan–Boltzmann at PAST_GIANT_TEMPERATURE_K); 0 for other stars. */
export function pastGiantRadiusAU(star: Star): number {
  if (!isRemnant(star)) return 0;
  const t = SOLAR_TEMPERATURE_K / PAST_GIANT_TEMPERATURE_K;
  return SOLAR_RADIUS_AU * Math.sqrt(pastGiantLuminosity(star)) * t * t;
}

/** The main-sequence luminosity track, L☉, linear in time; for a star that has left it, extended to any t. */
function mainSequenceTrack(star: Star, tGyr: number): number {
  const msEnd = mainSequenceEndGyr(star);
  const leftMainSequence = star.age >= msEnd;
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
  if (star.age >= msEnd && tGyr >= msEnd && isRemnant(star) && tGyr < remnantFromGyr(star)) return PAST_GIANT_TEMPERATURE_K;
  if (star.age < msEnd || tGyr >= msEnd) return star.temperature;
  const [lo, hi] = TEMP_RANGE["main-sequence"];
  const radius = mainSequenceRadius(star.mass);
  const t = SOLAR_TEMPERATURE_K * pow(mainSequenceLuminosity(star.mass) / (radius * radius), 0.25);
  return Math.min(hi, Math.max(lo, t));
}

// ── Light from two stars (Galaxy Through Time BS3) ────────────────────────────
//
// A world in a binary receives the light of both stars, each on its own clock:
// the companion is a star like any other, with its primary's age, so
// luminosityAt, temperatureAt and xuvFluence read it unchanged.
//
// The companion's flux, orbit-averaged over the pair's eccentric orbit:
//   around the primary (S-type)   L₂ / (a_b² · √(1 − e²))
//   around both (P-type)          L₂ / a²
// Readers take starlight as a luminosity and a distance, so the companion's
// light is given as the luminosity that, from the primary's place at the
// world's distance a, gives the same flux: L₂ · (a² / (a_b² √(1 − e²))) for
// S-type, L₂ for P-type. A single star adds nothing, so its worlds see exactly
// what they did before.
//
// Limits: changes within one orbit (the companion approaching and receding,
// eclipses) average out within a 100 Myr step. An S-type world is taken to be
// at the primary's place as the companion sees it (a ≪ a_b).

/** The companion as a star of its own, with its primary's id, place, age and metallicity; null for a single star. */
export function companionAsStar(star: Star): Star | null {
  const c = star.companion;
  if (!c) return null;
  return {
    id: star.id, position: star.position, mass: c.mass, age: star.age, lifespan: c.lifespan,
    temperature: c.temperature, luminosity: c.luminosity, classification: c.classification,
    isRare: false, metallicity: star.metallicity, companion: null,
  };
}

/** The companion's flux at a world over the flux it would give from the primary's place at the world's distance. */
export function companionFluxFactor(star: Star, orbitAU: number, aroundBoth: boolean): number {
  const c = star.companion;
  if (!c) return 0;
  if (aroundBoth) return 1;
  return (orbitAU * orbitAU) / (c.separationAU * c.separationAU * Math.sqrt(1 - c.eccentricity * c.eccentricity));
}

/** The companion's light at a world t Gyr after the pair formed, as a luminosity at the world's distance, L☉; 0 for a single star. */
export function companionLuminosityAt(star: Star, orbitAU: number, aroundBoth: boolean, tGyr: number): number {
  const companion = companionAsStar(star);
  return companion ? luminosityAt(companion, tGyr) * companionFluxFactor(star, orbitAU, aroundBoth) : 0;
}

/** Both stars' light at a world, as one luminosity at the world's distance, L☉; luminosityAt for a single star. */
export function receivedLuminosityAt(star: Star, orbitAU: number, aroundBoth: boolean, tGyr: number): number {
  const own = luminosityAt(star, tGyr);
  return star.companion ? own + companionLuminosityAt(star, orbitAU, aroundBoth, tGyr) : own;
}

/** The flux of both stars at a world, L☉ / AU²: luminosityAt / a² for a single star. */
export function irradianceAt(star: Star, orbitAU: number, aroundBoth: boolean, tGyr: number): number {
  return receivedLuminosityAt(star, orbitAU, aroundBoth, tGyr) / (orbitAU * orbitAU);
}

// ── Magnetic activity and extreme ultraviolet (Galaxy Through Time AE1) ──────
//
// Why it exists: a young star's extreme ultraviolet (XUV: X-rays and EUV,
// below 100 nm) heats its planets' upper air, and a world whose gravity is
// weak for the dose it receives loses that air to space (AE2). Red dwarfs'
// flares (evolution/environment.ts) come from the same magnetic activity, so
// both read one activity curve here (decision 42).
//
// The activity curve: saturated (1) until the saturation time t_sat, then a
// power law, (t / t_sat)^(−1.23) (Ribas et al. 2005). t_sat is continuous in
// the star's main-sequence temperature (decision 36): 0.1 Gyr for G stars and
// hotter (5,200 K and above), rising linearly to 0.8 Gyr at 3,900 K, then to
// 8 Gyr at 2,700 K and below (West et al. 2008's activity lifetimes, which set
// the red-dwarf flares before AE1).
//
// XUV luminosity, L☉:
//   L_XUV(t) = L_bol(t) · (s · f_sat · activity(t) · envelope(T) + photosphere(T))
//   f_sat = 10^(−3.13), the saturated share (Wright et al. 2011)
//   envelope(T): 1 up to 6,500 K, falling linearly to 0 at 7,500 K. Stars above
//     about 7,000 K have no convective envelope and are X-ray faint, so the
//     activity law fades out across that range rather than at one temperature
//     (decision 37).
//   photosphere(T): the blackbody's own share below 100 nm (decision 37),
//     negligible for cool stars, dominant for hot ones.
//   s scales the activity law so today's Sun (5,772 K, 4.6 Gyr, 1 L☉) gives its
//     measured XUV, 3.4 × 10⁻⁶ L☉; unscaled, the law gives it about twice that.
// After the main sequence the XUV is held at its value at the main sequence's
// end: cool giants are X-ray faint, and the law would otherwise give a giant
// 500 times the main-sequence XUV (a modelling choice). A white dwarf's own
// photospheric ultraviolet is not included.
//
// The fluence over an interval is integrated exactly: on the main sequence
// luminosityAt is linear in time, and a linear function times a power law has
// a closed-form integral, so the total never depends on how a history is
// divided into steps.
//
// Limits: one law for every convective star; no rotation spread (stars of
// one temperature and age give the same XUV); no flares in the XUV beyond the
// time-averaged law.

/** The saturated share of a star's light emitted as XUV (Wright et al. 2011). */
export const XUV_SATURATED_SHARE = pow(10, -3.13);
/** How fast activity decays after saturation: (t / t_sat)^(−1.23) (Ribas et al. 2005). */
export const ACTIVITY_DECAY_EXPONENT = 1.23;
// Saturation time against main-sequence temperature, K → Gyr (decision 36)
export const SATURATION = { gK: 5200, gGyr: 0.1, earlyMK: 3900, earlyMGyr: 0.8, lateMK: 2700, lateMGyr: 8 };
// The convective-envelope law fades out across this range, K (decision 37)
export const ENVELOPE_FADE_K = { from: 6500, to: 7500 };
// The Sun's measured XUV today (L☉), and the age at which it is measured (Gyr)
export const SOLAR_XUV_TODAY = 3.4e-6;
export const SOLAR_AGE_GYR = 4.6;
/** The XUV band's long-wavelength edge, nm. */
export const XUV_MAX_NM = 100;
/** Second radiation constant hc/k, nm·K. */
export const PLANCK_C2_NM_K = 1.4388e7;

/** How long a star's activity stays saturated, Gyr, from its main-sequence temperature. */
export function saturationTimeGyr(temperatureK: number): number {
  const { gK, gGyr, earlyMK, earlyMGyr, lateMK, lateMGyr } = SATURATION;
  if (temperatureK >= gK) return gGyr;
  if (temperatureK >= earlyMK) return earlyMGyr + (gGyr - earlyMGyr) * (temperatureK - earlyMK) / (gK - earlyMK);
  if (temperatureK > lateMK) return lateMGyr + (earlyMGyr - lateMGyr) * (temperatureK - lateMK) / (earlyMK - lateMK);
  return lateMGyr;
}

/** Magnetic activity, 0–1: saturated until t_sat, then falling as a power law. Flares and XUV read it. */
export function activityAt(saturationGyr: number, tGyr: number): number {
  return tGyr <= saturationGyr ? 1 : pow(tGyr / saturationGyr, -ACTIVITY_DECAY_EXPONENT);
}

/** How much of the convective-envelope law a star of this temperature follows, 0–1. */
function envelopeShare(temperatureK: number): number {
  return Math.min(1, Math.max(0, (ENVELOPE_FADE_K.to - temperatureK) / (ENVELOPE_FADE_K.to - ENVELOPE_FADE_K.from)));
}

/**
 * A blackbody's share of its output below 100 nm: ∫ from x₀ to ∞ of x³/(eˣ − 1),
 * over π⁴/15, with x₀ = hc/λkT, summed as Σ e^(−kx₀)(x₀³/k + 3x₀²/k² + 6x₀/k³ + 6/k⁴).
 */
export function photosphericXuvShare(temperatureK: number): number {
  if (temperatureK <= 0) return 0;
  const x0 = PLANCK_C2_NM_K / (XUV_MAX_NM * temperatureK);
  let sum = 0;
  for (let k = 1; k <= 40; k++) {
    const term = exp(-k * x0) * (x0 * x0 * x0 / k + 3 * x0 * x0 / (k * k) + 6 * x0 / (k * k * k) + 6 / (k * k * k * k));
    sum += term;
    if (term < sum * 1e-15) break;
  }
  return (sum * 15) / (Math.PI * Math.PI * Math.PI * Math.PI);
}

// The activity law's scale, so today's Sun gives its measured XUV (decision 37)
export const ACTIVITY_SCALE = (SOLAR_XUV_TODAY - photosphericXuvShare(SOLAR_TEMPERATURE_K))
  / (XUV_SATURATED_SHARE * activityAt(saturationTimeGyr(SOLAR_TEMPERATURE_K), SOLAR_AGE_GYR));

/** What the XUV of a star depends on besides its luminosity: the two shares, and t_sat. */
function xuvTerms(star: Star) {
  // Its main-sequence temperature: temperatureAt gives it for any moment before the main sequence ends
  const temperatureK = temperatureAt(star, 0);
  return {
    saturationGyr: saturationTimeGyr(temperatureK),
    activeShare: ACTIVITY_SCALE * XUV_SATURATED_SHARE * envelopeShare(temperatureK),
    photosphereShare: photosphericXuvShare(temperatureK),
  };
}

/** The star's XUV luminosity t Gyr after it formed, L☉. */
export function xuvLuminosityAt(star: Star, tGyr: number): number {
  const msEnd = mainSequenceEndGyr(star);
  // Held at its main-sequence-end value once the main sequence is over
  const t = star.age >= msEnd ? Math.min(tGyr, msEnd) : tGyr;
  const { saturationGyr, activeShare, photosphereShare } = xuvTerms(star);
  return mainSequenceTrack(star, t) * (activeShare * activityAt(saturationGyr, t) + photosphereShare);
}

/**
 * The star's XUV output between t0 and t1 Gyr after it formed, L☉ · Gyr,
 * integrated exactly. Divided by a planet's orbit squared (AU²) it is the
 * planet's XUV fluence in units of 1 L☉ at 1 AU for 1 Gyr.
 */
export function xuvFluence(star: Star, t0: number, t1: number): number {
  if (t1 <= t0) return 0;
  const msEnd = mainSequenceEndGyr(star);
  const leftMainSequence = star.age >= msEnd;
  // After the main sequence the XUV is constant
  if (leftMainSequence && t0 >= msEnd) return xuvLuminosityAt(star, msEnd) * (t1 - t0);
  if (leftMainSequence && t1 > msEnd) return xuvFluence(star, t0, msEnd) + xuvLuminosityAt(star, msEnd) * (t1 - msEnd);

  // On the main sequence L_bol(t) = a + b·t exactly (luminosityAt is linear there)
  const a = mainSequenceTrack(star, 0);
  const half = msEnd / 2;
  const b = (mainSequenceTrack(star, half) - a) / half;
  const { saturationGyr: ts, activeShare, photosphereShare } = xuvTerms(star);
  // ∫ (a + b·t) dt, and ∫ (a + b·t)·(t / ts)^(−p) dt
  const linear = (u0: number, u1: number) => a * (u1 - u0) + (b / 2) * (u1 * u1 - u0 * u0);
  const p = ACTIVITY_DECAY_EXPONENT;
  const decaying = (u0: number, u1: number) => {
    const scale = pow(ts, p);
    const antiderivative = (u: number) => a * pow(u, 1 - p) / (1 - p) + b * pow(u, 2 - p) / (2 - p);
    return scale * (antiderivative(u1) - antiderivative(u0));
  };
  const saturatedEnd = Math.min(t1, Math.max(t0, ts));
  const activity = linear(t0, saturatedEnd) + (t1 > saturatedEnd ? decaying(saturatedEnd, t1) : 0);
  return activeShare * activity + photosphereShare * linear(t0, t1);
}

// ── Temperature → RGB (AF-027) ────────────────────────────────────────────────
//
// A blackbody's colour, 0–1 per channel, from Tanner Helland's fit (in 0–255
// units: red 329.70 · (T/100 − 60)^−0.1332 and green 288.12 · (T/100 − 60)^−0.0755
// above 6,600 K). Display only: nothing the simulation decides reads it.
// Until 19 Oct 2026 the red and green factors were 3.29 and 2.88 rather than
// 329.70 / 255 and 288.12 / 255, which turned every star above 6,600 K white.

/** The red and green factors of the fit above 6,600 K, as shares of 255. */
const HOT_RED = 329.698727446 / 255;
const HOT_GREEN = 288.1221695283 / 255;

/** A blackbody's display colour at this temperature, sRGB 0–1. */
export function temperatureToColor(temp: number): [number, number, number] {
  if (temp <= 0) return [0.15, 0.08, 0.25];
  const t = Math.max(1000, Math.min(temp, 40000)) / 100;

  let r: number;
  if (t <= 66) {
    r = 1;
  } else {
    r = Math.max(0, Math.min(1, pow(t - 60, -0.1332) * HOT_RED));
  }

  let g: number;
  if (t <= 66) {
    g = Math.max(0, Math.min(1, log(t) * 0.3909 - 0.5516));
  } else {
    g = Math.max(0, Math.min(1, pow(t - 60, -0.0755) * HOT_GREEN));
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

/** A star is rare above 40 M☉, as a neutron star or black hole, or as a dwarf below 0.5 M☉ past 90% of its life. */
export const RARE_STAR = { massAbove: 40, oldShareAbove: 0.9, oldDwarfMassBelow: 0.5 } as const;

/** Age of every universe, in billion years; no star is older. */
export const UNIVERSE_AGE_GYR = 13.7;

// ── Metallicity (MZ2) ─────────────────────────────────────────────────────────
//
// A star's [Fe/H] is that of the gas where and when it formed (metallicity.ts),
// plus a normal scatter from its own stream, so the star stream's draws stay
// where they were. Observed near the Sun the scatter at fixed age is about
// 0.2 dex, much of it from stars migrating radially, which is not modelled.
// Metallicity does not change the star itself (metal-poor stars are slightly
// hotter and shorter-lived).

/** The standard deviation of a star's [Fe/H] about its gas's, dex. */
export const METALLICITY_SCATTER_DEX = 0.1;

/** A star's [Fe/H]: the gas at its distance from the centre in the disc plane when it formed, plus its scatter. */
function starMetallicity(galaxy: GalaxyConfig, id: number, [x, , z]: [number, number, number], bornGyr: number): number {
  const rFraction = Math.sqrt(x * x + z * z) / galaxy.scale;
  const scatter = gaussian(createRNG(mixSeed(galaxy.seed, id, SALT.METALLICITY)));
  return feH(gasMetallicity(galaxy.type, rFraction, bornGyr)) + METALLICITY_SCATTER_DEX * scatter;
}

// ── Companions (BS1) ──────────────────────────────────────────────────────────

/** A companion at its primary's age: lifespan, class, temperature and luminosity by the rules for any star. */
function companionFrom(draw: CompanionDraw, age: number, entropyRate: number): Companion {
  const lifespan = calcLifespan(draw.mass) / entropyRate;
  const classification = classify(draw.mass, age, lifespan);
  const temperature = calcTemperature(classification, draw.mass, draw.temperatureDraw);
  return {
    mass: draw.mass,
    periodDays: draw.periodDays,
    separationAU: draw.separationAU,
    eccentricity: draw.eccentricity,
    lifespan,
    temperature,
    luminosity: calcLuminosity(classification, draw.mass, temperature),
    classification,
  };
}

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
    // stellarIgnitionThreshold > 1 crowds the draw towards light stars: fewer heavy ones, more small long-lived ones
    const mass = kroupaMass(pow(rng(), config.stellarIgnitionThreshold));
    // entropyRate > 1 = faster decay = shorter lifespans
    const lifespan = calcLifespan(mass) / config.entropyRate;
    const age = rng() * Math.min(lifespan, universeAgeBY);
    const cls = classify(mass, age, lifespan);
    const isRare =
      mass > RARE_STAR.massAbove ||
      cls === "neutron-star" ||
      cls === "black-hole" ||
      (cls === "main-sequence" && age > lifespan * RARE_STAR.oldShareAbove && mass < RARE_STAR.oldDwarfMassBelow);
    const temp = calcTemperature(cls, mass, rng());
    const luminosity = calcLuminosity(cls, mass, temp);

    let pos: [number, number, number];
    if (galaxy.type === "spiral") pos = posSpiral(rng, galaxy.scale);
    else if (galaxy.type === "elliptical") pos = posElliptical(rng, galaxy.scale);
    else pos = posIrregular(rng, galaxy.scale);

    const metallicity = starMetallicity(galaxy, i, pos, universeAgeBY - age);

    const draw = drawCompanion(galaxy.seed, i, mass);
    const companion = draw && companionFrom(draw, age, config.entropyRate);

    stars.push({ id: i, position: pos, mass, age, lifespan, temperature: temp, luminosity, classification: cls, isRare, metallicity, companion });
  }

  return { stars, galaxySeed: galaxy.seed };
}
