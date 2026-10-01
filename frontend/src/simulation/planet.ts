import { createRNG, SALT } from "./rng";
import { pow } from "./detmath";
import type { Star } from "./star";
import { luminosityAt, stellarRadiusAU } from "./star";
import { makeConfig } from "./config";
import type { UniverseConfig } from "./config";
import { effectiveOrbitAU, GIANT_PLANET_MASS, planetMassFromDraw, typicalRadiusForMass } from "./planetBasics";
import { derivePhysics, atmosphereClassOf } from "./planetPhysics";
import type { PlanetPhysics } from "./planetPhysics";
import { buildGeography } from "./geography";
import type { Geography } from "./geography";
import { runWorldHistory } from "./worldHistory";
import type { WorldHistory } from "./worldHistory";
import type { PresentClimate } from "./climate";
import type { PhylogenySummary } from "./evolution/phylogeny";

export { effectiveOrbitAU, GIANT_PLANET_MASS };

// ── Data model (AF-037) ───────────────────────────────────────────────────────

export type PlanetType =
  | "rocky"
  | "ocean"
  | "ice"
  | "desert"
  | "gas-giant"
  | "ice-giant"
  | "lava"
  | "rogue";

export type AtmosphereType =
  | "none"
  | "thin"
  | "moderate"
  | "thick"
  | "crushing";

export interface Planet {
  id: number;             // index within its system; unique only together with hostStarId
  key: string;            // unique in the galaxy: "<starId>-<index>" (planetKey)
  hostStarId: number;
  orbitalRadius: number;  // AU
  orbitalIndex: number;   // position in system (0 = innermost)
  type: PlanetType;
  size: number;           // Earth radii
  mass: number;           // Earth masses
  temperature: number;    // Kelvin surface average
  /** Today's class, from the surface pressure the world history left (giants: as formed). */
  atmosphere: AtmosphereType;
  /** The class the planet formed with: sets its world history's background air. */
  formationAtmosphere: AtmosphereType;
  resourceAbundance: number; // 0–1
  habitabilityScore: number; // 0–1
  isRare: boolean;
  /** Today's surface, from the planet's world history; null for giants, which have none. */
  surface: PlanetSurface | null;
  /** Life on the planet, from its world history (C2.3b, C2.5); null if it never began. */
  life: PlanetLife | null;
}

/** A planet's life: its dates, Gyr after its star formed, and what its lineages became (C2.5). */
export interface PlanetLife {
  startedGyr: number;
  /** Null while life lasts. */
  endedGyr: number | null;
  phylogeny: PhylogenySummary;
}

/** The present-day surface of a solid planet, as the world history left it (A3). */
export interface PlanetSurface {
  /** Shares of the planet's area: open water, ice, and ice-free land. They sum to 1. */
  oceanFraction: number;
  iceFraction: number;
  landFraction: number;
  /** Share with liquid-water temperatures: open water, and land by its moisture. */
  habitableFraction: number;
  surfaceGravity: number;   // g
  pressureBar: number;      // total surface pressure today
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

// Planets form beyond the dust-sublimation line of their young star: where the
// star's light would heat bare dust past DUST_SUBLIMATION_K. At zero albedo that
// distance is (278 / T_sub)² · √L AU, so a star a hundred times as bright forms
// its planets ten times as far out, at the same temperatures.
const DUST_SUBLIMATION_K = 1500;

/** The inner edge of a star's planet-forming disk, AU: its dust-sublimation line at formation. */
export function dustSublimationAU(star: Star): number {
  const ratio = 278 / DUST_SUBLIMATION_K;
  return ratio * ratio * Math.sqrt(luminosityAt(star, 0));
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

// ── Planet type (Worlds Up Close A3) ──────────────────────────────────────────
//
// A type is a result, not a roll. A solid planet's type is read from its
// present-day surface (R5, R7); a giant's from its temperature (owner decision:
// ice giants are the cold ones). The single draw the old type roll took is
// still taken, so every later draw in the system is unchanged.

// Giants colder than this are ice giants. With this model's equilibrium
// temperatures the Sun's giants split as they should: Jupiter 122 K and Saturn
// 90 K are gas giants, Uranus 64 K and Neptune 51 K ice giants.
const ICE_GIANT_MAX_K = 75;
// A solid planet this hot at its surface today is a lava world
const LAVA_MIN_K = 1000;
// Surface shares that name a world: mostly ocean, mostly ice, or a warm world with almost no water
const OCEAN_WORLD_MIN_OCEAN = 0.9;
const ICE_WORLD_MIN_ICE = 0.85;
const DESERT_MAX_OCEAN = 0.03;
const DESERT_MIN_K = 273;

function giantType(temperatureK: number): PlanetType {
  return temperatureK < ICE_GIANT_MAX_K ? "ice-giant" : "gas-giant";
}

function solidType(temperatureK: number, surface: PlanetSurface): PlanetType {
  if (temperatureK > LAVA_MIN_K) return "lava";
  if (surface.oceanFraction > OCEAN_WORLD_MIN_OCEAN) return "ocean";
  if (surface.iceFraction > ICE_WORLD_MIN_ICE) return "ice";
  if (surface.oceanFraction < DESERT_MAX_OCEAN && temperatureK > DESERT_MIN_K) return "desert";
  return "rocky";
}

// ── Equilibrium temperature (AF-042) ──────────────────────────────────────────
// Blackbody temperature from the star's light alone. It decides which
// atmosphere a planet can keep, and it is a giant's (cloud-top) temperature.
// A solid planet's surface temperature comes from its world history.

function equilibriumTemp(stellarLuminosity: number, orbitalAU: number): number {
  return 278 * pow(Math.max(0.0001, stellarLuminosity), 0.25) / Math.sqrt(orbitalAU);
}

// ── Atmosphere (AF-043) ───────────────────────────────────────────────────────

// Above this equilibrium temperature, stellar heating strips most of an atmosphere away.
const ATMOSPHERE_LOSS_TEMP_K = 700;

function pickAtmosphere(mass: number, tempK: number, rng: () => number): AtmosphereType {
  if (mass > GIANT_PLANET_MASS) return "crushing";
  if (mass < 0.05) return "none";
  if (tempK > ATMOSPHERE_LOSS_TEMP_K) return rng() < 0.5 ? "thin" : "none";
  const r = rng();
  if (r < 0.15) return "none";
  if (r < 0.35) return "thin";
  if (r < 0.70) return "moderate";
  if (r < 0.90) return "thick";
  return "crushing";
}

// ── Habitability (AF-043, rewritten for A3) ───────────────────────────────────
//
// How much of the planet can hold liquid water today, weighed by a gravity
// window, the atmosphere and resources. Giants and lava worlds score 0. Until
// life lives inside the world history (C2.3), this score is what the single
// emergence roll in biosphere.ts reads (R4).

// A planet with this share of liquid-water surface or more gets full credit.
// Earth's present-day solve gives 0.7–0.9.
const FULL_HABITABLE_AREA = 0.5;
// Gravity window: full credit inside, fading to nothing at half the lower edge and twice the upper one
const GRAVITY_WINDOW = { min: 0.4, max: 2.5 };
const ATMOSPHERE_FACTOR: Record<AtmosphereType, number> = {
  none: 0.05, thin: 0.8, moderate: 1, thick: 0.9, crushing: 0.1,
};
const RESOURCE_WEIGHT = 0.1;

function gravityFactor(g: number): number {
  if (g < GRAVITY_WINDOW.min) return Math.max(0, (g - GRAVITY_WINDOW.min / 2) / (GRAVITY_WINDOW.min / 2));
  if (g > GRAVITY_WINDOW.max) return Math.max(0, (2 * GRAVITY_WINDOW.max - g) / GRAVITY_WINDOW.max);
  return 1;
}

function calcHabitability(type: PlanetType, atmosphere: AtmosphereType, resourceAbundance: number, surface: PlanetSurface | null): number {
  if (!surface || type === "lava") return 0;
  const area = Math.min(1, surface.habitableFraction / FULL_HABITABLE_AREA);
  return area * gravityFactor(surface.surfaceGravity) * ATMOSPHERE_FACTOR[atmosphere]
    * (1 - RESOURCE_WEIGHT + RESOURCE_WEIGHT * resourceAbundance);
}

/** A solid planet's present-day surface, from its geography and world history. */
function presentSurface(present: PresentClimate, physics: PlanetPhysics, pressureBar: number): PlanetSurface {
  return {
    oceanFraction: present.oceanFraction,
    iceFraction: present.iceFraction,
    landFraction: present.landFraction,
    habitableFraction: present.habitableFraction,
    surfaceGravity: physics.surfaceGravity,
    pressureBar,
  };
}

// ── Public API (AF-036) ───────────────────────────────────────────────────────

/** What a solid planet's surface is made from: its physics, its geography and its history. */
export interface SolidWorld {
  physics: PlanetPhysics;
  geography: Geography;
  history: WorldHistory;
}

/**
 * A solid planet's physics, geography and world history. Reads only the
 * planet's orbit, mass, size and atmosphere, so it gives the same world for a
 * planet before and after generatePlanetsFor fills in its type and surface;
 * the planet view uses it to draw the surface the simulation made.
 */
export function solidWorldOf(planet: Planet, star: Star, galaxySeed: number, cfg?: UniverseConfig): SolidWorld {
  const config = cfg ?? makeConfig(galaxySeed);
  const physics = derivePhysics(planet, star, galaxySeed, config);
  const geography = buildGeography(planet, physics, galaxySeed);
  return { physics, geography, history: runWorldHistory(planet, physics, geography, star, galaxySeed, config) };
}

/** A planet's identity in the galaxy, for caches, timeline subjects and discoveries. */
export function planetKey(starId: number, index: number): string {
  return `${starId}-${index}`;
}

export function generatePlanetsFor(star: Star, galaxySeed: number, cfg?: UniverseConfig): PlanetarySystem {
  const config = cfg ?? makeConfig(galaxySeed);
  const rng = createRNG(((galaxySeed ^ star.id) ^ SALT.PLANET) >>> 0);

  // Dead stars don't have planets
  if (star.classification === "neutron-star" || star.classification === "black-hole") {
    return { hostStarId: star.id, galaxySeed, planets: [] };
  }

  const count = planetCount(star.mass, rng);
  if (count === 0) return { hostStarId: star.id, galaxySeed, planets: [] };

  const arch = pickArchitecture(rng());
  // The drawn system, moved out as a whole when the innermost orbit lies inside the
  // young star's dust-sublimation line (owner decision); a dim star's system is unchanged
  const drawn = generateOrbits(arch, count, rng);
  const spread = Math.max(1, dustSublimationAU(star) / effectiveOrbitAU(drawn[0], config));
  const orbits = drawn.map((radius) => radius * spread);
  // A star that has since swollen past a planet's orbit has engulfed it
  const starRadiusAU = stellarRadiusAU(star);

  const planets: (Planet | null)[] = orbits.map((orbitalRadius, idx) => {
    const mass = planetMassFromDraw(rng());
    // Stellar heating decides what atmosphere a planet can keep
    const equilibriumK = equilibriumTemp(star.luminosity, effectiveOrbitAU(orbitalRadius, config));
    const atmosphere = pickAtmosphere(mass, equilibriumK, rng);
    rng(); // the old type roll: still taken so the draws below stay aligned
    // Planets of the same mass differ in make-up, so in size: ±20% around the typical radius
    const size = typicalRadiusForMass(mass) * (0.8 + rng() * 0.4);
    const resourceAbundance = rng();
    // Engulfed planets are gone; their draws are taken all the same, so later planets keep theirs
    if (effectiveOrbitAU(orbitalRadius, config) <= starRadiusAU) return null;

    const planet: Planet = {
      id: idx,
      key: planetKey(star.id, idx),
      hostStarId: star.id,
      orbitalRadius,
      orbitalIndex: idx,
      type: "gas-giant",
      size,
      mass,
      temperature: equilibriumK,
      atmosphere,
      formationAtmosphere: atmosphere,
      resourceAbundance,
      habitabilityScore: 0,
      isRare: false,
      surface: null,
      life: null,
    };

    if (mass > GIANT_PLANET_MASS) {
      planet.type = giantType(equilibriumK);
    } else {
      // A solid planet's surface is the end of its history
      const { physics, history } = solidWorldOf(planet, star, galaxySeed, config);
      planet.surface = presentSurface(history.present, physics, history.final.pressureBar);
      planet.life = history.life && {
        startedGyr: history.life.startedGyr, endedGyr: history.life.endedGyr, phylogeny: history.phylogeny!,
      };
      planet.temperature = history.present.meanK;
      planet.atmosphere = atmosphereClassOf(history.final.pressureBar);
      planet.type = solidType(planet.temperature, planet.surface);
    }
    planet.habitabilityScore = calcHabitability(planet.type, planet.atmosphere, resourceAbundance, planet.surface);

    const tempK = planet.temperature;
    planet.isRare =
      planet.type === "ocean" && tempK > 240 && tempK < 310 ||
      planet.type === "lava"  && mass < 0.5 ||
      (planet.type === "rocky" && tempK > 220 && tempK < 320 && planet.atmosphere === "moderate");
    return planet;
  });

  // Survivors keep their index, id and key: an engulfed planet leaves a gap, as it would in a catalogue
  return { hostStarId: star.id, galaxySeed, planets: planets.filter((planet): planet is Planet => planet !== null) };
}

// ── Color palette for rendering (AF-044) ──────────────────────────────────────

export const PLANET_COLORS: Record<PlanetType, [number, number, number]> = {
  rocky:       [0.55, 0.42, 0.30],
  ocean:       [0.15, 0.45, 0.80],
  ice:         [0.75, 0.88, 0.95],
  desert:      [0.82, 0.65, 0.30],
  "gas-giant": [0.70, 0.55, 0.35],
  "ice-giant": [0.45, 0.65, 0.85],
  lava:        [0.90, 0.25, 0.05],
  rogue:       [0.20, 0.18, 0.22],
};
