import { createRNG, mixSeed, SALT } from "./rng";
import { pow } from "./detmath";
import type { Star } from "./star";
import { luminosityAt, pastGiantRadiusAU, stellarRadiusAU } from "./star";
import { makeConfig } from "./config";
import type { UniverseConfig } from "./config";
import { effectiveOrbitAU, GIANT_PLANET_MASS, planetMassFromDraw, typicalRadiusForMass } from "./planetBasics";
import { derivePhysics, atmosphereClassOf } from "./planetPhysics";
import type { PlanetPhysics } from "./planetPhysics";
import { buildGeography } from "./geography";
import type { Geography } from "./geography";
import { runWorldHistory } from "./worldHistory";
import type { WorldEvent, WorldHistory, WorldState } from "./worldHistory";
import type { PresentClimate } from "./climate";
import { EQUILIBRIUM_K_AT_1_AU } from "./climate";
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
  /** What happened to the planet over its world history, dated (C2.7); empty for giants, which have none. */
  worldEvents: WorldEvent[];
  /** Whether liquid water ever lay on its surface, open or under ice (WorldHistory.everLiquidWater); false for giants. */
  everLiquidWater: boolean;
}

/** A planet's life: its dates, Gyr after its star formed, and what its lineages became (C2.5). */
export interface PlanetLife {
  startedGyr: number;
  /** Null while life lasts. */
  endedGyr: number | null;
  phylogeny: PhylogenySummary;
  /** When the oxygen life makes would on its own first have oxidised the air (WorldHistory.lifeOxygenGyr); null if never. */
  oxygenGyr: number | null;
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
  o2Bar: number;            // oxygen's share of that pressure, bar (C2.6: fire)
  // The rest of today's air, as the world history left it (read by atmosphereComposition.ts, B1)
  backgroundBar: number;    // the fixed background gas (R6)
  co2Bar: number;
  ch4Bar: number;
  ozone: number;            // ozone column, as a share of Earth's (0–1)
  water: number;            // water inventory, A1 scale
  steam: boolean;           // the oceans are boiled into the air
}

export interface PlanetarySystem {
  hostStarId: number;
  galaxySeed: number;
  planets: Planet[];
  /** Planets that formed but were engulfed by their star as it swelled (they are not in `planets`). */
  engulfed: number;
}

// ── Orbital architecture (AF-038 + AF-039 + AF-040) ──────────────────────────

type OrbitalArch = "compact" | "distributed" | "resonant" | "chaotic";

/** A system's architecture from one draw: compact, distributed and resonant below these bounds, otherwise chaotic. */
export const ARCHITECTURE_ROLL = { compactBelow: 0.35, distributedBelow: 0.65, resonantBelow: 0.82 } as const;
/** The innermost orbit, AU (base + draw · spread), and each next orbit's ratio to the one before, by architecture. */
export const FIRST_ORBIT_AU = { base: 0.1, spread: 0.3 } as const;
export const ORBIT_SPACING: Record<OrbitalArch, { base: number; spread: number }> = {
  compact:     { base: 1.3, spread: 0.3 },
  distributed: { base: 1.6, spread: 0.8 },
  resonant:    { base: 1.5, spread: 0.2 },   // ~1.5–1.7× with low scatter
  chaotic:     { base: 1.1, spread: 2.0 },
};

function pickArchitecture(r: number): OrbitalArch {
  if (r < ARCHITECTURE_ROLL.compactBelow) return "compact";
  if (r < ARCHITECTURE_ROLL.distributedBelow) return "distributed";
  if (r < ARCHITECTURE_ROLL.resonantBelow) return "resonant";
  return "chaotic";
}

// Planets form beyond the dust-sublimation line of their young star: where the
// star's light would heat bare dust past DUST_SUBLIMATION_K. At zero albedo that
// distance is (278 / T_sub)² · √L AU, so a star a hundred times as bright forms
// its planets ten times as far out, at the same temperatures.
export const DUST_SUBLIMATION_K = 1500;

/** The inner edge of a star's planet-forming disk, AU: its dust-sublimation line at formation. */
export function dustSublimationAU(star: Star): number {
  const ratio = EQUILIBRIUM_K_AT_1_AU / DUST_SUBLIMATION_K;
  return ratio * ratio * Math.sqrt(luminosityAt(star, 0));
}

function generateOrbits(arch: OrbitalArch, count: number, rng: () => number): number[] {
  const radii: number[] = [];
  let inner = FIRST_ORBIT_AU.base + rng() * FIRST_ORBIT_AU.spread;
  const { base, spread } = ORBIT_SPACING[arch];

  for (let i = 0; i < count; i++) {
    radii.push(inner);
    inner *= base + rng() * spread;
  }
  return radii;
}

// ── Planet count (AF-038) ─────────────────────────────────────────────────────

/**
 * How many planets a star forms: none (barren) below the first roll bound; 1–2 (sparse) below the
 * second; otherwise its base count plus 0–4, the base falling with star mass.
 */
export const PLANET_COUNT = {
  barrenBelow: 0.1,
  sparseBelow: 0.25, sparse: { min: 1, range: 2 },
  base: { belowMass: [1.5, 5], counts: [4, 3, 2] }, extraRange: 5,
} as const;

function planetCount(starMass: number, rng: () => number): number {
  // More massive stars tend to have fewer planets (hotter, shorter-lived)
  const { base: b } = PLANET_COUNT;
  const base = starMass < b.belowMass[0] ? b.counts[0] : starMass < b.belowMass[1] ? b.counts[1] : b.counts[2];
  const roll = rng();
  if (roll < PLANET_COUNT.barrenBelow) return 0;                                                      // barren
  if (roll < PLANET_COUNT.sparseBelow) return PLANET_COUNT.sparse.min + Math.floor(rng() * PLANET_COUNT.sparse.range); // sparse
  return base + Math.floor(rng() * PLANET_COUNT.extraRange);                                           // normal–crowded
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
export const ICE_GIANT_MAX_K = 75;
// A solid planet this hot at its surface today is a lava world
export const LAVA_MIN_K = 1000;
// Surface shares that name a world: mostly ocean, mostly ice, or a warm world with almost no water
export const OCEAN_WORLD_MIN_OCEAN = 0.9;
export const ICE_WORLD_MIN_ICE = 0.85;
export const DESERT_MAX_OCEAN = 0.03;
export const DESERT_MIN_K = 273;

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
  return EQUILIBRIUM_K_AT_1_AU * pow(Math.max(0.0001, stellarLuminosity), 0.25) / Math.sqrt(orbitalAU);
}

// ── Atmosphere (AF-043; one draw for every planet since AE2, decision 43) ─────
//
// Every solid planet draws its formation class from the same distribution,
// whatever its mass or heat: escape in its history (atmosphericEscape.ts)
// alone decides what it keeps. Before AE2, planets below 0.05 M⊕ were
// airless and planets hotter than 700 K thin or airless, without the draw.
// The hot ones took one draw from the system's stream, and keep it; the small
// ones took none, so theirs comes from their own stream (SALT.AIR), and every
// other draw in the system stays where it was.

/** The atmosphere draw: none, thin, moderate and thick below these bounds of one draw, else crushing. */
export const ATMOSPHERE_DRAW = { noneBelow: 0.15, thinBelow: 0.35, moderateBelow: 0.70, thickBelow: 0.90 } as const;
/** Planets below this mass draw their atmosphere from their own stream (they took no draw before AE2). */
export const OWN_AIR_STREAM_BELOW_MASS = 0.05;

function atmosphereFromDraw(r: number): AtmosphereType {
  const d = ATMOSPHERE_DRAW;
  if (r < d.noneBelow) return "none";
  if (r < d.thinBelow) return "thin";
  if (r < d.moderateBelow) return "moderate";
  if (r < d.thickBelow) return "thick";
  return "crushing";
}

function pickAtmosphere(mass: number, rng: () => number, ownDraw: () => number): AtmosphereType {
  if (mass > GIANT_PLANET_MASS) return "crushing";
  if (mass < OWN_AIR_STREAM_BELOW_MASS) return atmosphereFromDraw(ownDraw());
  return atmosphereFromDraw(rng());
}

// ── Habitability (AF-043, rewritten for A3) ───────────────────────────────────
//
// How much of the planet can hold liquid water today, weighed by a gravity
// window, the atmosphere and resources. Giants and lava worlds score 0. Until
// life lives inside the world history (C2.3), this score is what the single
// emergence roll in biosphere.ts reads (R4).

// A planet with this share of liquid-water surface or more gets full credit.
// Earth's present-day solve gives 0.7–0.9.
export const FULL_HABITABLE_AREA = 0.5;
// Gravity window: full credit inside, fading to nothing at half the lower edge and twice the upper one
export const GRAVITY_WINDOW = { min: 0.4, max: 2.5 };
export const ATMOSPHERE_FACTOR: Record<AtmosphereType, number> = {
  none: 0.05, thin: 0.8, moderate: 1, thick: 0.9, crushing: 0.1,
};
export const RESOURCE_WEIGHT = 0.1;

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
function presentSurface(present: PresentClimate, physics: PlanetPhysics, final: WorldState): PlanetSurface {
  return {
    oceanFraction: present.oceanFraction,
    iceFraction: present.iceFraction,
    landFraction: present.landFraction,
    habitableFraction: present.habitableFraction,
    surfaceGravity: physics.surfaceGravity,
    pressureBar: final.pressureBar,
    o2Bar: final.o2Bar,
    backgroundBar: final.backgroundBar,
    co2Bar: final.co2Bar,
    ch4Bar: final.ch4Bar,
    ozone: final.ozone,
    water: final.water,
    steam: final.steam,
  };
}

// ── Rarity ────────────────────────────────────────────────────────────────────

/**
 * Why a planet is rare, in words, or null if it is not: the one rule behind
 * `isRare`, kept here so the encyclopedia (EN2) can say why without repeating it.
 */
/** The rarity rules' bounds: temperate ocean worlds, small lava worlds, temperate rocky worlds under moderate air. */
export const RARE_PLANET = {
  oceanK: { above: 240, below: 310 },
  lavaMassBelow: 0.5,
  rockyK: { above: 220, below: 320 },
} as const;

export function rareReasonOf(planet: Planet): string | null {
  const tempK = planet.temperature;
  const { oceanK, lavaMassBelow, rockyK } = RARE_PLANET;
  if (planet.type === "ocean" && tempK > oceanK.above && tempK < oceanK.below) return `a temperate ocean world, ${oceanK.above}–${oceanK.below} K`;
  if (planet.type === "lava" && planet.mass < lavaMassBelow) return "a lava world under half an Earth mass";
  if (planet.type === "rocky" && tempK > rockyK.above && tempK < rockyK.below && planet.atmosphere === "moderate") {
    return `a temperate rocky world, ${rockyK.above}–${rockyK.below} K, under moderate air`;
  }
  return null;
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

/**
 * A star's planetary system. `worldOf` builds each solid planet's physics,
 * geography and history; it is solidWorldOf unless a caller (the stats
 * harness) wraps it to time or keep those, so it must compute the same.
 */
export function generatePlanetsFor(
  star: Star, galaxySeed: number, cfg?: UniverseConfig, worldOf: typeof solidWorldOf = solidWorldOf,
): PlanetarySystem {
  const config = cfg ?? makeConfig(galaxySeed);
  const rng = createRNG(((galaxySeed ^ star.id) ^ SALT.PLANET) >>> 0);

  // Dead stars don't have planets
  if (star.classification === "neutron-star" || star.classification === "black-hole") {
    return { hostStarId: star.id, galaxySeed, planets: [], engulfed: 0 };
  }

  const count = planetCount(star.mass, rng);
  if (count === 0) return { hostStarId: star.id, galaxySeed, planets: [], engulfed: 0 };

  const arch = pickArchitecture(rng());
  // The drawn system, moved out as a whole when the innermost orbit lies inside the
  // young star's dust-sublimation line (owner decision); a dim star's system is unchanged
  const drawn = generateOrbits(arch, count, rng);
  const spread = Math.max(1, dustSublimationAU(star) / effectiveOrbitAU(drawn[0], config));
  const orbits = drawn.map((radius) => radius * spread);
  // A star that has since swollen past a planet's orbit has engulfed it
  // or did, as a giant, before it became a remnant (decision 44)
  const starRadiusAU = Math.max(stellarRadiusAU(star), pastGiantRadiusAU(star));

  const planets: (Planet | null)[] = orbits.map((orbitalRadius, idx) => {
    const mass = planetMassFromDraw(rng());
    // Stellar heating decides what atmosphere a planet can keep
    const equilibriumK = equilibriumTemp(star.luminosity, effectiveOrbitAU(orbitalRadius, config));
    const atmosphere = pickAtmosphere(mass, rng, () => createRNG(mixSeed(galaxySeed, star.id, idx, SALT.AIR))());
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
      worldEvents: [],
      everLiquidWater: false,
    };

    if (mass > GIANT_PLANET_MASS) {
      planet.type = giantType(equilibriumK);
    } else {
      // A solid planet's surface is the end of its history
      const { physics, history } = worldOf(planet, star, galaxySeed, config);
      planet.surface = presentSurface(history.present, physics, history.final);
      planet.worldEvents = history.events;
      planet.everLiquidWater = history.everLiquidWater;
      planet.life = history.life && {
        startedGyr: history.life.startedGyr, endedGyr: history.life.endedGyr, phylogeny: history.phylogeny!,
        oxygenGyr: history.lifeOxygenGyr,
      };
      planet.temperature = history.present.meanK;
      planet.atmosphere = atmosphereClassOf(history.final.pressureBar);
      planet.type = solidType(planet.temperature, planet.surface);
    }
    planet.habitabilityScore = calcHabitability(planet.type, planet.atmosphere, resourceAbundance, planet.surface);

    planet.isRare = rareReasonOf(planet) !== null;
    return planet;
  });

  // Survivors keep their index, id and key: an engulfed planet leaves a gap, as it would in a catalogue
  const survivors = planets.filter((planet): planet is Planet => planet !== null);
  return { hostStarId: star.id, galaxySeed, planets: survivors, engulfed: planets.length - survivors.length };
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
