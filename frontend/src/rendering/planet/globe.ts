// What the planet view needs to draw a solid planet's globe (Worlds Up Close, A5),
// and the cache that keeps the last few planets' baked globes on the GPU.
//
// Presentation only: it reads a planet's world and never writes it. The detail
// noise is placed by the planet's VISUAL stream, so the same planet always looks
// the same, and no draw from that stream ever reaches the simulation.

import * as THREE from "three";
import type { Planet, SolidWorld } from "../../simulation/planet";
import { createRNG, mixSeed, SALT } from "../../simulation/rng";
import { buildSurfaceMap } from "./surfaceMap";
import { GlobeBake } from "./globeBake";
import { EARTH_RADIUS_KM } from "./PlanetView";

/** A solid planet's surface as the globe shader draws it. */
export interface GlobeSurface {
  /** The baked atlas; owned by the cache, never disposed by the view. Finish it before drawing. */
  bake: GlobeBake;
  axialTiltDeg: number;
  tidallyLocked: boolean;
}

// Relief is drawn this many times steeper than it is, or mountains would not show from orbit
const RELIEF_EXAGGERATION = 150;

// Noise offsets are drawn in 0–NOISE_OFFSET_RANGE along each axis
const NOISE_OFFSET_RANGE = 100;

/**
 * Whether the planet view draws a planet's surface. Giants have none, and
 * lava worlds get their own shader in A7; until then both stay plain spheres.
 */
export function drawsSurface(planet: Planet): boolean {
  return planet.surface !== null && planet.type !== "lava";
}

/** The offset of a planet's detail noise, from its VISUAL stream. */
export function noiseOffsetOf(planet: Planet, galaxySeed: number): THREE.Vector3Tuple {
  const rng = createRNG(mixSeed(galaxySeed, planet.hostStarId, planet.id, SALT.VISUAL));
  return [rng() * NOISE_OFFSET_RANGE, rng() * NOISE_OFFSET_RANGE, rng() * NOISE_OFFSET_RANGE];
}

// How many planets' baked globes stay on the GPU (the plan's "last five planets")
export const GLOBE_CACHE_SIZE = 5;

/**
 * Baked globes of the most recently visited planets, by planet key; the oldest
 * is freed first. A new planet's bake starts unbaked: step it a face per frame,
 * and finish it before drawing.
 */
export class GlobeTextureCache {
  private readonly bakes = new Map<string, GlobeBake>();

  constructor(private readonly capacity = GLOBE_CACHE_SIZE) {}

  /** The planet's surface, reusing its bake if it is cached. */
  surfaceFor(planet: Planet, world: SolidWorld, galaxySeed: number): GlobeSurface {
    let bake = this.bakes.get(planet.key);
    if (bake) {
      this.bakes.delete(planet.key);   // re-inserted below as the newest
    } else {
      bake = new GlobeBake(buildSurfaceMap(world.geography, world.history.present), {
        wetness: world.history.present.wetness,
        noiseOffset: noiseOffsetOf(planet, galaxySeed),
        bumpScale: RELIEF_EXAGGERATION / (planet.size * EARTH_RADIUS_KM),
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
      axialTiltDeg: world.physics.axialTiltDeg,
      tidallyLocked: world.physics.tidallyLocked,
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
