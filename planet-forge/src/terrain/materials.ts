// What the ground is made of at a point: shares of rock, soil, sand, snow,
// molten rock and ground cover, adding up to 1. PF3 colours the ground from
// them.
//
// Slope comes from the caller, which has the drawn surface's normals.
//
// The rules, each taking its share of what the ones before it left:
// - Molten rock: from 900 K, fully molten at 1,300 K (Aion Forge's A7 values).
// - Snow and ice: all of land ice and sea ice; on bare land, below freezing
//   (fully 3 K below) on a planet that has water.
// - Rock: steep ground, from 30° to fully at 45°; part of cold bare ground,
//   from 15 K above freezing, where little grows or weathers; and all bare
//   ground on an airless world, where no wind or water breaks it into soil or sand.
// - Sand: beaches, the first few metres above the sea; and dry, warm ground
//   where there is air to drive dunes (deserts), fading out on slopes.
// - Ground cover: the spec's cover, by moisture between Aion Forge's
//   vegetation thresholds (0.02 to 0.25), only between freezing and boiling.
// - Soil: what is left; how wet it looks is the moisture.
// Under open water the shares describe the seabed: rock on slopes, sand elsewhere.

import type { PlanetSpec } from "../spec/schema";
import { CELL_KIND } from "../spec/schema";
import type { GroundSample } from "./terrain";

export interface Materials {
  molten: number;
  snow: number;
  rock: number;
  sand: number;
  cover: number;
  soil: number;
}

const MOLTEN_K: [number, number] = [900, 1300];
const SNOW_BELOW_FREEZING_K = 3;
const STEEP_DEG: [number, number] = [30, 45];
const COLD_ROCK_ABOVE_FREEZING_K = 15;
/** At most this share of cold bare ground is rock. */
const COLD_ROCK_SHARE = 0.5;
const BEACH_M = 3;
/** Moisture below the first value is desert, gone by the second. */
const DESERT_MOISTURE: [number, number] = [0.02, 0.08];
/** Deserts need this much warmth above freezing. */
const DESERT_WARMTH_K = 10;
const VEGETATION_MOISTURE: [number, number] = [0.02, 0.25];
/** Air thinner than this moves no sand and weathers no soil (as the terrain's lapse rate). */
const MIN_AIR_BAR = 0.01;
/** Cover fades in and out over this many K inside freezing and boiling. */
const LIVING_EDGE_K = 5;

/** 0 at `from`, 1 at `to`, smooth between; `from` may be above `to`. */
function smoothstep(from: number, to: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - from) / (to - from)));
  return t * t * (3 - 2 * t);
}

/** The shares of what a planet's ground is made of, at a sample on a slope of this many degrees. */
export function createMaterials(spec: PlanetSpec): (sample: GroundSample, slopeDeg: number) => Materials {
  const hasWater = spec.surface.cells.some((c) => c[6] !== CELL_KIND.land);
  const hasAir = spec.air.pressureBar >= MIN_AIR_BAR;
  return (sample, slopeDeg) => materialsAt(spec, hasWater, hasAir, sample, slopeDeg);
}

function materialsAt(spec: PlanetSpec, hasWater: boolean, hasAir: boolean, sample: GroundSample, slopeDeg: number): Materials {
  const out: Materials = { molten: 0, snow: 0, rock: 0, sand: 0, cover: 0, soil: 0 };
  const { freezingK, boilingK } = spec.surface;
  const t = sample.temperatureK;
  const steep = smoothstep(STEEP_DEG[0], STEEP_DEG[1], slopeDeg);
  let left = 1;
  const take = (key: keyof Materials, share: number) => {
    const amount = left * share;
    out[key] += amount;
    left -= amount;
  };

  if (sample.surface === "ice" || sample.surface === "seaIce") {
    out.snow = 1;
    return out;
  }
  if (sample.surface === "water") {
    take("rock", steep);
    out.sand += left;
    return out;
  }

  take("molten", smoothstep(MOLTEN_K[0], MOLTEN_K[1], t));
  if (hasWater) take("snow", smoothstep(freezingK, freezingK - SNOW_BELOW_FREEZING_K, t));
  if (!hasAir) {
    out.rock += left;
    return out;
  }
  take("rock", Math.max(steep, COLD_ROCK_SHARE * smoothstep(freezingK + COLD_ROCK_ABOVE_FREEZING_K, freezingK, t)));
  const beach = sample.groundM >= 0 ? smoothstep(BEACH_M, 0, sample.groundM) : 0;
  const desert = smoothstep(DESERT_MOISTURE[1], DESERT_MOISTURE[0], sample.moisture) * smoothstep(freezingK, freezingK + DESERT_WARMTH_K, t);
  take("sand", Math.max(beach * (hasWater ? 1 : 0), desert) * (1 - steep));
  const cover = spec.groundCover;
  if (cover) {
    const living = smoothstep(freezingK, freezingK + LIVING_EDGE_K, t) * smoothstep(boilingK, boilingK - LIVING_EDGE_K, t);
    take("cover", cover.cover * smoothstep(VEGETATION_MOISTURE[0], VEGETATION_MOISTURE[1], sample.moisture) * living);
  }
  out.soil += left;
  return out;
}
