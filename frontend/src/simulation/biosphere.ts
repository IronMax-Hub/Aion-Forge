import { createRNG } from "./rng";
import type { Planet } from "./planet";
import type { Star } from "./star";
import { makeConfig } from "./config";
import type { UniverseConfig } from "./config";

// ── Data model ────────────────────────────────────────────────────────────────

export type LifeStage =
  | "none"           // no life
  | "prebiotic"      // chemistry approaching life
  | "microbial"      // simple single-celled life
  | "multicellular"  // complex cell structures
  | "complex"        // animals, plants, ecosystems
  | "dominant";      // life thoroughly shapes the planet

export interface ExtinctionEvent {
  cause: string;
  severityLoss: number; // how much complexity was lost (0–1)
  timeAgo: number;      // billion years ago (relative to star age)
}

export interface Biosphere {
  planetId: number;
  hostStarId: number;
  hasLife: boolean;
  stage: LifeStage;
  complexity: number;    // 0–1: sophistication of organisms
  diversity: number;     // 0–1: variety of life forms
  stability: number;     // 0–1: resistance to collapse
  adaptability: number;  // 0–1: evolutionary flexibility
  biomass: number;       // 0–1: relative abundance of life
  extinctions: ExtinctionEvent[];
  ageGyr: number;        // how long life has existed
}

// ── Stage thresholds on complexity ───────────────────────────────────────────

function complexityToStage(c: number): LifeStage {
  if (c <= 0)    return "none";
  if (c < 0.08)  return "prebiotic";
  if (c < 0.25)  return "microbial";
  if (c < 0.50)  return "multicellular";
  if (c < 0.78)  return "complex";
  return "dominant";
}

// ── Extinction causes ─────────────────────────────────────────────────────────

const EXTINCTION_CAUSES = [
  "asteroid impact",
  "volcanic winter",
  "gamma-ray burst",
  "glaciation event",
  "ocean anoxia",
  "stellar flare cascade",
  "atmospheric collapse",
  "runaway greenhouse shift",
];

// ── Main generator ────────────────────────────────────────────────────────────

const BIO_SALT = 0xB105F33D;

export function generateBiosphere(
  planet: Planet,
  star: Star,
  galaxySeed: number,
  cfg?: UniverseConfig
): Biosphere {
  const config = cfg ?? makeConfig(galaxySeed);
  const rng = createRNG(((galaxySeed ^ planet.hostStarId ^ planet.id) ^ BIO_SALT) >>> 0);

  const empty: Biosphere = {
    planetId: planet.id, hostStarId: planet.hostStarId,
    hasLife: false, stage: "none",
    complexity: 0, diversity: 0, stability: 0, adaptability: 0, biomass: 0,
    extinctions: [], ageGyr: 0,
  };

  // Life cannot emerge on gas giants, lava worlds, or with no/crushing atmosphere
  if (
    planet.type === "gas-giant" ||
    planet.type === "lava" ||
    planet.atmosphere === "none" ||
    planet.atmosphere === "crushing"
  ) return empty;

  // emergenceSensitivity scales life probability — higher = more likely
  const lifeProbability = Math.min(0.99, Math.pow(planet.habitabilityScore, 0.6) * 0.85 * config.emergenceSensitivity);
  if (rng() > lifeProbability) return empty;

  // Life has emerged. How long has it had to evolve?
  // Life needs time: star must be old enough, and life needs at least ~0.5 Gyr to get started
  const availableTimeGyr = Math.max(0, star.age - 0.5);
  if (availableTimeGyr <= 0) return { ...empty, hasLife: false };

  const lifeAgeGyr = rng() * availableTimeGyr;

  // Base complexity grows with time (logistic-like) and habitability
  const growthRate    = 0.4 + planet.habitabilityScore * 0.5 + rng() * 0.2;
  const timeSignal    = 1 - Math.exp(-growthRate * lifeAgeGyr);
  let complexity      = timeSignal * (0.5 + planet.habitabilityScore * 0.5);

  // Diversity, stability, adaptability — correlated but with individual variation
  let diversity    = complexity * (0.6 + rng() * 0.4);
  let stability    = (planet.habitabilityScore * 0.5 + rng() * 0.5) * 0.9;
  let adaptability = 0.3 + rng() * 0.5 + complexity * 0.2;

  // Generate extinction events — more common on less stable worlds
  const extinctions: ExtinctionEvent[] = [];
  const extinctionChance = 0.15 + (1 - stability) * 0.4;
  const maxExtinctions   = Math.floor(lifeAgeGyr * 1.5);

  for (let i = 0; i < maxExtinctions; i++) {
    if (rng() < extinctionChance) {
      const severity = 0.1 + rng() * 0.7;
      const cause    = EXTINCTION_CAUSES[Math.floor(rng() * EXTINCTION_CAUSES.length)];
      const timeAgo  = rng() * lifeAgeGyr;
      extinctions.push({ cause, severityLoss: severity, timeAgo });
      // Each extinction knocks back complexity
      complexity   *= (1 - severity * 0.6);
      diversity    *= (1 - severity * 0.5);
      stability    *= (1 - severity * 0.3);
    }
  }

  // Sort extinctions by recency
  extinctions.sort((a, b) => a.timeAgo - b.timeAgo);

  // Recovery: life rebounds after each extinction given enough time
  for (const evt of extinctions) {
    const recoveryTime = lifeAgeGyr - evt.timeAgo;
    const recovery     = 1 - Math.exp(-growthRate * recoveryTime * 0.5);
    complexity   += (evt.severityLoss * 0.6) * recovery * planet.habitabilityScore;
    diversity    += (evt.severityLoss * 0.4) * recovery * planet.habitabilityScore;
  }

  // Ocean worlds are exceptionally biodiverse
  if (planet.type === "ocean") diversity = Math.min(1, diversity * 1.3);

  // Clamp all values
  complexity   = Math.min(1, Math.max(0, complexity));
  diversity    = Math.min(1, Math.max(0, diversity));
  stability    = Math.min(1, Math.max(0, stability));
  adaptability = Math.min(1, Math.max(0, adaptability));
  const biomass = Math.min(1, complexity * 0.7 + planet.resourceAbundance * 0.3);

  return {
    planetId: planet.id,
    hostStarId: planet.hostStarId,
    hasLife: true,
    stage: complexityToStage(complexity),
    complexity,
    diversity,
    stability,
    adaptability,
    biomass,
    extinctions,
    ageGyr: lifeAgeGyr,
  };
}

// ── Descriptive label helpers ─────────────────────────────────────────────────

export const STAGE_LABEL: Record<LifeStage, string> = {
  none:          "No Life Detected",
  prebiotic:     "Prebiotic Chemistry",
  microbial:     "Microbial Life",
  multicellular: "Multicellular Organisms",
  complex:       "Complex Ecosystems",
  dominant:      "Dominant Biosphere",
};

export const STAGE_COLOR: Record<LifeStage, string> = {
  none:          "rgba(100, 100, 120, 0.4)",
  prebiotic:     "rgba(160, 180, 100, 0.6)",
  microbial:     "rgba(100, 200, 120, 0.7)",
  multicellular: "rgba(60,  210, 160, 0.8)",
  complex:       "rgba(80,  230, 100, 0.9)",
  dominant:      "rgba(140, 255, 80,  1.0)",
};
