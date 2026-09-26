// What the planet view needs to draw a planet's globe (Worlds Up Close A5, A7),
// and the cache that keeps the last few planets' baked globes on the GPU.
//
// Solid planets are drawn from their surface map (lava included: molten ground
// follows local temperature in the surface bake). Giants are drawn as banded
// cloud tops: the faster one spins, the more bands; storms and rings are
// placed by its VISUAL stream.
//
// Presentation only: it reads a planet and its world and never writes them.
// Every visual choice is drawn from the planet's VISUAL stream, so the same
// planet always looks the same, and no draw from that stream reaches the simulation.
//
// VISUAL stream order, per planet: detail noise (3 draws), cloud pattern (3);
// giants then: rings (4: chance, inner edge, width, pattern), storm count (1),
// and each of up to three storms (3: latitude, longitude, size).

import type * as THREE from "three";
import type { Planet, SolidWorld } from "../../simulation/planet";
import type { PlanetPhysics } from "../../simulation/planetPhysics";
import { createRNG, mixSeed, SALT } from "../../simulation/rng";
import { buildSurfaceMap } from "./surfaceMap";
import { GlobeBake } from "./globeBake";
import type { GiantStorm } from "./globeBake";
import { EARTH_RADIUS_KM } from "./PlanetView";
import { overcastShare } from "./atmosphere";

/** A giant's rings, in planet radii. */
export interface RingLook {
  inner: number;
  outer: number;
  /** Where the ring pattern is sampled from. */
  patternOffset: number;
}

/** A planet as the globe shader draws it. */
export interface GlobeSurface {
  /** The baked atlas; owned by the cache, never disposed by the view. Finish it before drawing. */
  bake: GlobeBake;
  axialTiltDeg: number;
  /** Whether the atlas's pole faces the star (a locked solid planet) rather than being the spin axis. */
  tidallyLocked: boolean;
  /** Whether a cloud sphere belongs over it (solid planets). */
  hasClouds: boolean;
  rings: RingLook | null;
}

/** The look of a giant: bands, storms and rings. */
export interface GiantLook {
  bandCount: number;
  storms: GiantStorm[];
  rings: RingLook | null;
}

// Relief is drawn this many times steeper than it is, or mountains would not show from orbit
const RELIEF_EXAGGERATION = 150;

// Noise offsets are drawn in 0–NOISE_OFFSET_RANGE along each axis
const NOISE_OFFSET_RANGE = 100;

// Bands: Jupiter, turning in 10 h, shows about 14; slower giants fewer (∝ 1/√period)
const BANDS_AT_TEN_HOURS = 14;
const BAND_COUNT = { min: 4, max: 24 };

// Rings and storms (presentation choices; the plan leaves the odds open)
const RING_CHANCE = 0.35;
const RING_INNER = { min: 1.25, spread: 0.3 };     // planet radii
const RING_WIDTH = { min: 0.4, spread: 0.8 };
const STORM_COUNT_ODDS = [0.4, 0.75, 0.9];          // cumulative: no storm, one, two; else three
const STORM_LATITUDE = { min: 0.15, spread: 0.5 };  // radians, either hemisphere
const STORM_SIZE = { min: 0.06, spread: 0.1 };      // radians of latitude

/** Whether the planet view draws a planet's own surface: every solid planet, lava worlds included. */
export function drawsSurface(planet: Planet): boolean {
  return planet.surface !== null;
}

function visualStream(planet: Planet, galaxySeed: number): () => number {
  return createRNG(mixSeed(galaxySeed, planet.hostStarId, planet.id, SALT.VISUAL));
}

/** The offsets of a planet's detail noise and cloud pattern, the first six VISUAL draws. */
function visualOffsets(rng: () => number): { detail: THREE.Vector3Tuple; clouds: THREE.Vector3Tuple } {
  const draw = (): THREE.Vector3Tuple => [rng() * NOISE_OFFSET_RANGE, rng() * NOISE_OFFSET_RANGE, rng() * NOISE_OFFSET_RANGE];
  const detail = draw();
  return { detail, clouds: draw() };
}

/** The offset of a planet's detail noise, from its VISUAL stream. */
export function noiseOffsetOf(planet: Planet, galaxySeed: number): THREE.Vector3Tuple {
  return visualOffsets(visualStream(planet, galaxySeed)).detail;
}

/** The offset of a planet's cloud pattern, from its VISUAL stream (the three draws after the detail's). */
export function cloudOffsetOf(planet: Planet, galaxySeed: number): THREE.Vector3Tuple {
  return visualOffsets(visualStream(planet, galaxySeed)).clouds;
}

/** Zones and belts a giant shows, from how fast it turns. */
export function bandCountFor(rotationPeriodHours: number): number {
  const bands = Math.round(BANDS_AT_TEN_HOURS * Math.sqrt(10 / rotationPeriodHours));
  return Math.min(BAND_COUNT.max, Math.max(BAND_COUNT.min, bands));
}

/** A giant's bands, storms and rings: bands from its spin, the rest from its VISUAL stream. */
export function giantLookOf(planet: Planet, galaxySeed: number, rotationPeriodHours: number): GiantLook {
  const rng = visualStream(planet, galaxySeed);
  visualOffsets(rng);   // the detail and cloud draws come first

  const ringDraw = rng();
  const inner = RING_INNER.min + RING_INNER.spread * rng();
  const width = RING_WIDTH.min + RING_WIDTH.spread * rng();
  const patternOffset = rng() * NOISE_OFFSET_RANGE;
  const rings = ringDraw < RING_CHANCE ? { inner, outer: inner + width, patternOffset } : null;

  const countDraw = rng();
  const count = STORM_COUNT_ODDS.filter((odds) => countDraw >= odds).length;
  const storms: GiantStorm[] = [];
  for (let i = 0; i < count; i++) {
    const latitudeDraw = rng();
    const longitude = (rng() * 2 - 1) * Math.PI;
    const size = STORM_SIZE.min + STORM_SIZE.spread * rng();
    // Lower half of the draw: southern hemisphere; upper half: northern
    const hemisphere = latitudeDraw < 0.5 ? -1 : 1;
    const latitude = hemisphere * (STORM_LATITUDE.min + STORM_LATITUDE.spread * ((latitudeDraw * 2) % 1));
    storms.push({ latitude, longitude, size });
  }
  return { bandCount: bandCountFor(rotationPeriodHours), storms, rings };
}

// How many planets' baked globes stay on the GPU (the plan's "last five planets")
export const GLOBE_CACHE_SIZE = 5;

/**
 * Baked globes of the most recently visited planets, by planet key; the oldest
 * is freed first. A new planet's bake starts unbaked: step it a strip per frame,
 * and finish it before drawing.
 */
export class GlobeTextureCache {
  private readonly bakes = new Map<string, GlobeBake>();
  private readonly capacity: number;

  constructor(capacity = GLOBE_CACHE_SIZE) {
    this.capacity = capacity;
  }

  /**
   * The planet's globe, reusing its bake if it is cached. `world` is a solid
   * planet's world (solidWorldOf); null for a giant, drawn from its physics alone.
   */
  globeFor(planet: Planet, world: SolidWorld | null, physics: PlanetPhysics, galaxySeed: number): GlobeSurface {
    const giant = world === null ? giantLookOf(planet, galaxySeed, physics.rotationPeriodHours) : null;
    let bake = this.bakes.get(planet.key);
    if (bake) {
      this.bakes.delete(planet.key);   // re-inserted below as the newest
    } else if (world) {
      bake = GlobeBake.surface(buildSurfaceMap(world.geography, world.history.present), {
        wetness: world.history.present.wetness,
        noiseOffset: noiseOffsetOf(planet, galaxySeed),
        bumpScale: RELIEF_EXAGGERATION / (planet.size * EARTH_RADIUS_KM),
        cloudOffset: cloudOffsetOf(planet, galaxySeed),
        overcast: overcastShare(planet.surface?.pressureBar ?? 0),
      });
    } else {
      bake = GlobeBake.giant({
        temperatureK: planet.temperature,
        bandCount: giant!.bandCount,
        noiseOffset: noiseOffsetOf(planet, galaxySeed),
        storms: giant!.storms,
      });
    }
    this.bakes.set(planet.key, bake);
    for (const [key, oldest] of this.bakes) {
      if (this.bakes.size <= this.capacity) break;
      oldest.dispose();
      this.bakes.delete(key);
    }
    return {
      bake,
      axialTiltDeg: physics.axialTiltDeg,
      // A giant's bands always run round its spin axis, locked or not
      tidallyLocked: world !== null && physics.tidallyLocked,
      hasClouds: world !== null,
      rings: giant?.rings ?? null,
    };
  }

  get size(): number {
    return this.bakes.size;
  }

  /** Frees every cached bake: for a new universe, where planet keys name different planets. */
  clear(): void {
    for (const bake of this.bakes.values()) bake.dispose();
    this.bakes.clear();
  }
}
