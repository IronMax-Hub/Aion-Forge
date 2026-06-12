import { createRNG } from "./rng";
import type { Star } from "./star";

// ── Data model (AF-037) ───────────────────────────────────────────────────────

export type PlanetType =
  | "rocky"
  | "ocean"
  | "ice"
  | "desert"
  | "gas-giant"
  | "lava"
  | "rogue";

export type AtmosphereType =
  | "none"
  | "thin"
  | "moderate"
  | "thick"
  | "crushing";

export interface Planet {
  id: number;
  hostStarId: number;
  orbitalRadius: number;  // AU
  orbitalIndex: number;   // position in system (0 = innermost)
  type: PlanetType;
  size: number;           // Earth radii
  mass: number;           // Earth masses
  temperature: number;    // Kelvin surface average
  atmosphere: AtmosphereType;
  resourceAbundance: number; // 0–1
  habitabilityScore: number; // 0–1
  isRare: boolean;
}

export interface PlanetarySystem {
  hostStarId: number;
  galaxySeed: number;
  planets: Planet[];
}

// ── Orbital architecture (AF-038 + AF-039 + AF-040) ──────────────────────────

type OrbitalArch = "compact" | "distributed" | "resonant" | "chaotic";

function pickArchitecture(r: number): OrbitalArch {
  if (r < 0.35) return "compact";
  if (r < 0.65) return "distributed";
  if (r < 0.82) return "resonant";
  return "chaotic";
}

function generateOrbits(arch: OrbitalArch, count: number, rng: () => number): number[] {
  const radii: number[] = [];
  let inner = 0.1 + rng() * 0.3;

  for (let i = 0; i < count; i++) {
    radii.push(inner);
    switch (arch) {
      case "compact":
        inner *= 1.3 + rng() * 0.3;
        break;
      case "distributed":
        inner *= 1.6 + rng() * 0.8;
        break;
      case "resonant":
        // Resonant spacing: ~1.5–2× with low scatter
        inner *= 1.5 + rng() * 0.2;
        break;
      case "chaotic":
        inner *= 1.1 + rng() * 2.0;
        break;
    }
  }
  return radii;
}

// ── Planet count (AF-038) ─────────────────────────────────────────────────────

function planetCount(starMass: number, rng: () => number): number {
  // More massive stars tend to have fewer planets (hotter, shorter-lived)
  const base = starMass < 1.5 ? 4 : starMass < 5 ? 3 : 2;
  const roll = rng();
  if (roll < 0.1) return 0;                          // barren
  if (roll < 0.25) return 1 + Math.floor(rng() * 2); // sparse
  return base + Math.floor(rng() * 5);               // normal–crowded
}

// ── Planet type from orbital position (AF-041) ────────────────────────────────
// Temperature-driven: close → lava/desert, habitable zone → rocky/ocean, far → ice/gas

function pickType(tempK: number, mass: number, rng: () => number): PlanetType {
  if (mass > 15) return rng() < 0.8 ? "gas-giant" : "ice";
  if (tempK > 700) return rng() < 0.7 ? "lava" : "desert";
  if (tempK > 400) return rng() < 0.6 ? "desert" : "rocky";
  if (tempK > 200) {
    const r = rng();
    if (r < 0.35) return "ocean";
    if (r < 0.65) return "rocky";
    return "desert";
  }
  return rng() < 0.6 ? "ice" : "rocky";
}

// ── Surface temperature (AF-042) ──────────────────────────────────────────────
// Simplified: stellar luminosity + orbital radius + greenhouse

function surfaceTemp(
  stellarLuminosity: number,
  orbitalAU: number,
  atmosphere: AtmosphereType
): number {
  const L = Math.max(0.0001, stellarLuminosity);
  // Effective temperature from inverse-square law (in K, rough)
  const tEff = 278 * Math.pow(L, 0.25) / Math.sqrt(orbitalAU);
  const greenhouse: Record<AtmosphereType, number> = {
    none: 0, thin: 10, moderate: 40, thick: 100, crushing: 400,
  };
  return tEff + greenhouse[atmosphere];
}

// ── Atmosphere (AF-043) ───────────────────────────────────────────────────────

function pickAtmosphere(mass: number, tempK: number, rng: () => number): AtmosphereType {
  if (mass > 15) return "crushing";
  if (mass < 0.05) return "none";
  if (tempK > 700) return rng() < 0.5 ? "thin" : "none";
  const r = rng();
  if (r < 0.15) return "none";
  if (r < 0.35) return "thin";
  if (r < 0.70) return "moderate";
  if (r < 0.90) return "thick";
  return "crushing";
}

// ── Habitability (AF-043) ─────────────────────────────────────────────────────

function calcHabitability(p: {
  type: PlanetType;
  temperature: number;
  atmosphere: AtmosphereType;
  mass: number;
  resourceAbundance: number;
}): number {
  if (p.type === "gas-giant" || p.type === "lava") return 0;
  if (p.atmosphere === "none" || p.atmosphere === "crushing") return 0.02;

  let score = 0;

  // Temperature sweet spot 200–350 K
  const tScore = p.temperature >= 200 && p.temperature <= 350
    ? 1 - Math.abs(p.temperature - 275) / 75
    : 0;
  score += tScore * 0.45;

  // Liquid water proxy
  if (p.type === "ocean") score += 0.25;
  if (p.type === "rocky") score += 0.15;

  // Atmosphere
  if (p.atmosphere === "moderate") score += 0.2;
  if (p.atmosphere === "thin")     score += 0.1;

  // Size / gravity proxy
  if (p.mass > 0.4 && p.mass < 4) score += 0.1;

  // Resources
  score += p.resourceAbundance * 0.05;

  return Math.min(1, Math.max(0, score));
}

// ── Public API (AF-036) ───────────────────────────────────────────────────────

const PLANET_SALT = 0x914E7A3C;

export function generatePlanetsFor(star: Star, galaxySeed: number): PlanetarySystem {
  const rng = createRNG(((galaxySeed ^ star.id) ^ PLANET_SALT) >>> 0);

  // Dead stars don't have planets
  if (star.classification === "neutron-star" || star.classification === "black-hole") {
    return { hostStarId: star.id, galaxySeed, planets: [] };
  }

  const count = planetCount(star.mass, rng);
  if (count === 0) return { hostStarId: star.id, galaxySeed, planets: [] };

  const arch = pickArchitecture(rng());
  const orbits = generateOrbits(arch, count, rng);

  const planets: Planet[] = orbits.map((orbitalRadius, idx) => {
    const mass = Math.pow(10, (rng() - 0.5) * 3.5); // 0.03–32 Earth masses (log spread)
    const atmosphere = pickAtmosphere(mass, 0, rng);  // rough pass, temp recalculated below
    const tempK = surfaceTemp(star.luminosity, orbitalRadius, atmosphere);
    const type = pickType(tempK, mass, rng);
    const size = Math.pow(mass, 0.27) * (0.8 + rng() * 0.4);
    const resourceAbundance = rng();

    const isRare =
      type === "ocean" && tempK > 240 && tempK < 310 ||
      type === "lava"  && mass < 0.5 ||
      (type === "rocky" && tempK > 220 && tempK < 320 && atmosphere === "moderate");

    const planet: Planet = {
      id: idx,
      hostStarId: star.id,
      orbitalRadius,
      orbitalIndex: idx,
      type,
      size,
      mass,
      temperature: tempK,
      atmosphere,
      resourceAbundance,
      habitabilityScore: 0,
      isRare,
    };
    planet.habitabilityScore = calcHabitability(planet);
    return planet;
  });

  return { hostStarId: star.id, galaxySeed, planets };
}

// ── Color palette for rendering (AF-044) ──────────────────────────────────────

export const PLANET_COLORS: Record<PlanetType, [number, number, number]> = {
  rocky:       [0.55, 0.42, 0.30],
  ocean:       [0.15, 0.45, 0.80],
  ice:         [0.75, 0.88, 0.95],
  desert:      [0.82, 0.65, 0.30],
  "gas-giant": [0.70, 0.55, 0.35],
  lava:        [0.90, 0.25, 0.05],
  rogue:       [0.20, 0.18, 0.22],
};
