// What the planet view needs to draw a solid planet's globe (Worlds Up Close, A5),
// and the cache that keeps the last few planets' surface maps on the GPU.
//
// Presentation only: it reads a planet's world and never writes it. The detail
// noise is placed by the planet's VISUAL stream, so the same planet always looks
// the same, and no draw from that stream ever reaches the simulation.

import * as THREE from "three";
import type { Planet, SolidWorld } from "../../simulation/planet";
import { createRNG, mixSeed, SALT } from "../../simulation/rng";
import { buildSurfaceMap, surfaceMapTexture } from "./surfaceMap";

/** A solid planet's surface as the globe shader draws it. */
export interface GlobeSurface {
  /** The surface map; owned by the cache, never disposed by the view. */
  map: THREE.DataTexture;
  /** 0–1: how much of frozen land is snow. */
  wetness: number;
  axialTiltDeg: number;
  tidallyLocked: boolean;
  /** Where the detail noise is sampled from. */
  noiseOffset: THREE.Vector3Tuple;
}

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

// How many planets' surface maps stay on the GPU (the plan's "last five planets")
export const GLOBE_CACHE_SIZE = 5;

/** Surface maps of the most recently visited planets, by planet key; the oldest is freed first. */
export class GlobeTextureCache {
  private readonly maps = new Map<string, THREE.DataTexture>();

  constructor(private readonly capacity = GLOBE_CACHE_SIZE) {}

  /** The planet's surface, building its map unless it is cached. */
  surfaceFor(planet: Planet, world: SolidWorld, galaxySeed: number): GlobeSurface {
    let map = this.maps.get(planet.key);
    if (map) {
      this.maps.delete(planet.key);   // re-inserted below as the newest
    } else {
      map = surfaceMapTexture(buildSurfaceMap(world.geography, world.history.present));
    }
    this.maps.set(planet.key, map);
    for (const [key, oldest] of this.maps) {
      if (this.maps.size <= this.capacity) break;
      oldest.dispose();
      this.maps.delete(key);
    }
    return {
      map,
      wetness: world.history.present.wetness,
      axialTiltDeg: world.physics.axialTiltDeg,
      tidallyLocked: world.physics.tidallyLocked,
      noiseOffset: noiseOffsetOf(planet, galaxySeed),
    };
  }

  get size(): number {
    return this.maps.size;
  }

  /** Frees every cached map: for a new universe, where planet keys name different planets. */
  clear(): void {
    for (const map of this.maps.values()) map.dispose();
    this.maps.clear();
  }
}
