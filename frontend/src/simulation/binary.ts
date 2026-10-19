import { createRNG, gaussian, mixSeed, SALT } from "./rng";
import { pow } from "./detmath";
import type { StellarClass } from "./star";

// ── Binary stars (Galaxy Through Time BS1) ────────────────────────────────────
//
// Why it exists: about half of Sun-like stars have a companion. A companion
// adds light that brightens and fades on its own clock (BS3), and it limits
// where planets can orbit (BS2). BS1 only decides which stars have one, and
// what it is; nothing reads it yet.
//
// Each star's companion is drawn from its own stream, mixSeed(galaxySeed,
// starId, SALT.COMPANION), so the star stream and everything drawn from it are
// unchanged. Companions belong to their system: the population stays
// STAR_COUNT systems.
//
//   chance       by the primary's mass (Duchêne & Kraus 2013; Raghavan et al. 2010)
//   mass         q · primary, q uniform in 0.1–1, so no companion is heavier
//   period       log-normal, median 10^5.03 days, σ 2.28 dex (Raghavan et al. 2010)
//   separation   the orbit's semi-major axis, by Kepler: a³ = (M₁ + M₂) · P²  (AU, M☉, years)
//   eccentricity 0 below a 12-day period (tides circularise it), else uniform 0–0.8
//
// The companion shares its primary's age and metallicity (one birth cloud);
// its lifespan, class, temperature and luminosity follow the rules for any
// star (star.ts).
//
// Limits: companions of their own have no planets (decision 15); triples and
// higher multiples are not modelled; the period distribution is not truncated
// below, so a few pairs are closer than their stars' radii would allow;
// separations are not scaled by the laboratory's gravity (decision 45).

/** The chance a star has a companion, by its mass: below each bound, M☉. */
export const COMPANION_CHANCE = [
  { massBelow: 0.5,      chance: 0.26 },
  { massBelow: 1.3,      chance: 0.46 },
  { massBelow: 5,        chance: 0.6 },
  { massBelow: Infinity, chance: 0.75 },
] as const;

/** The companion's mass as a share of its primary's: uniform in [min, max). */
export const MASS_RATIO = { min: 0.1, max: 1 } as const;
/** log₁₀ of the orbital period in days: normal, with this median and spread (Raghavan et al. 2010). */
export const LOG_PERIOD_DAYS = { median: 5.03, sigma: 2.28 } as const;
/** Pairs closer than this period, days, are tidally circularised. */
export const CIRCULAR_BELOW_DAYS = 12;
/** Wider pairs' eccentricity is uniform in 0 to this. */
export const MAX_ECCENTRICITY = 0.8;
export const DAYS_PER_YEAR = 365.25;

/** What the companion's stream decides; star.ts adds what follows from mass and age. */
export interface CompanionDraw {
  mass: number;            // M☉
  periodDays: number;
  separationAU: number;    // semi-major axis of the pair's relative orbit
  eccentricity: number;
  temperatureDraw: number; // 0–1, the temperature jitter any star takes
}

export interface Companion {
  mass: number;            // M☉
  periodDays: number;
  separationAU: number;
  eccentricity: number;
  lifespan: number;        // Gyr; the age is the primary's
  temperature: number;     // K
  luminosity: number;      // L☉, today
  classification: StellarClass;
}

/** The chance that a star of this mass has a companion. */
export function companionChance(primaryMass: number): number {
  return (COMPANION_CHANCE.find((bin) => primaryMass < bin.massBelow) ?? COMPANION_CHANCE[COMPANION_CHANCE.length - 1]).chance;
}

/** The semi-major axis of a pair's relative orbit, AU, from Kepler's third law. */
export function separationFromPeriod(totalMass: number, periodDays: number): number {
  const years = periodDays / DAYS_PER_YEAR;
  return pow(totalMass * years * years, 1 / 3);
}

/** Whether star `starId` has a companion, and its mass and orbit; null for a single star. */
export function drawCompanion(galaxySeed: number, starId: number, primaryMass: number): CompanionDraw | null {
  const rng = createRNG(mixSeed(galaxySeed, starId, SALT.COMPANION));
  if (rng() >= companionChance(primaryMass)) return null;

  const mass = primaryMass * (MASS_RATIO.min + (MASS_RATIO.max - MASS_RATIO.min) * rng());
  const periodDays = pow(10, LOG_PERIOD_DAYS.median + LOG_PERIOD_DAYS.sigma * gaussian(rng));
  const eccentricityDraw = rng();
  const eccentricity = periodDays < CIRCULAR_BELOW_DAYS ? 0 : MAX_ECCENTRICITY * eccentricityDraw;
  return {
    mass,
    periodDays,
    separationAU: separationFromPeriod(primaryMass + mass, periodDays),
    eccentricity,
    temperatureDraw: rng(),
  };
}

// ── Where planets can orbit (BS2) ─────────────────────────────────────────────
//
// A companion's pull leaves two places where a planet's orbit survives: close
// to the primary (S-type), or far out around both stars (P-type). Between the
// two limits no orbit lasts. The limits are Holman & Wiegert's (1999) fits to
// numerical integrations, in units of the pair's separation a_b, with
// μ = m₂ / (m₁ + m₂) and e the pair's eccentricity:
//
//   S-type  a < a_b · (0.464 − 0.380μ − 0.631e + 0.586μe + 0.150e² − 0.198μe²)
//   P-type  a > a_b · (1.60 + 5.10e − 2.22e² + 4.12μ − 4.27eμ − 5.09μ² + 4.61e²μ²)
//
// A planet drawn between them cannot stay. It is removed with its draws taken
// and its index left as a gap; from step 7 it becomes a rogue planet. In
// nature the companion also truncates the disk, so many such planets would
// never have formed: counting them as thrown out is a simplification
// (decision 17). Planets beyond the P-type limit orbit both stars.
//
// Limits: the fits cover e up to 0.7–0.8 and μ 0.1–0.9; companions here reach
// e 0.8 and μ down to 0.09, slightly outside. The limits are sharp lines where
// nature has a fuzzy band with islands of stability. Planets are tested by
// their distance as the climate reads it (effectiveOrbitAU), and the pair's
// separation is not scaled by the laboratory's gravity (decision 45).

/** S-type limit coefficients (Holman & Wiegert 1999): 1, μ, e, μe, e², μe². */
export const S_TYPE_LIMIT = { c: 0.464, mu: -0.380, e: -0.631, muE: 0.586, e2: 0.150, muE2: -0.198 } as const;
/** P-type limit coefficients (Holman & Wiegert 1999): 1, e, e², μ, eμ, μ², e²μ². */
export const P_TYPE_LIMIT = { c: 1.60, e: 5.10, e2: -2.22, mu: 4.12, eMu: -4.27, mu2: -5.09, e2Mu2: 4.61 } as const;

/** Where a planet's orbit can last in a binary: around the primary, around both stars, or nowhere. */
export type BinaryOrbit = "around-primary" | "around-both" | "unstable";

/** The companion's share of the pair's mass, μ = m₂ / (m₁ + m₂). */
export function massShare(primaryMass: number, companion: Companion): number {
  return companion.mass / (primaryMass + companion.mass);
}

/** The widest orbit around the primary that lasts, AU. */
export function sTypeLimitAU(primaryMass: number, companion: Companion): number {
  const mu = massShare(primaryMass, companion);
  const e = companion.eccentricity;
  const k = S_TYPE_LIMIT;
  return companion.separationAU * (k.c + k.mu * mu + k.e * e + k.muE * mu * e + k.e2 * e * e + k.muE2 * mu * e * e);
}

/** The closest orbit around both stars that lasts, AU. */
export function pTypeLimitAU(primaryMass: number, companion: Companion): number {
  const mu = massShare(primaryMass, companion);
  const e = companion.eccentricity;
  const k = P_TYPE_LIMIT;
  return companion.separationAU * (k.c + k.e * e + k.e2 * e * e + k.mu * mu + k.eMu * e * mu + k.mu2 * mu * mu + k.e2Mu2 * e * e * mu * mu);
}

/** Where a planet at `orbitAU` from the primary (or the pair's centre) can orbit. */
export function binaryOrbitOf(orbitAU: number, primaryMass: number, companion: Companion): BinaryOrbit {
  if (orbitAU < sTypeLimitAU(primaryMass, companion)) return "around-primary";
  if (orbitAU > pTypeLimitAU(primaryMass, companion)) return "around-both";
  return "unstable";
}

// ── The pair as one point of light (BS4) ──────────────────────────────────────

/**
 * A binary seen from afar, where the two stars are one point: their combined
 * luminosity, and the luminosity-weighted temperature (each star's colour in
 * proportion to its light). A single star is itself.
 */
export function pairLight(star: { temperature: number; luminosity: number; companion: Companion | null }): { temperature: number; luminosity: number } {
  const c = star.companion;
  const luminosity = star.luminosity + (c ? c.luminosity : 0);
  if (!c || luminosity <= 0) return { temperature: star.temperature, luminosity: star.luminosity };
  return { temperature: (star.luminosity * star.temperature + c.luminosity * c.temperature) / luminosity, luminosity };
}
