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
