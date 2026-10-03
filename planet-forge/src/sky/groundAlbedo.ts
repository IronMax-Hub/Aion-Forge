// The planet as the air sees it from above (PLAN, PF4): the mean colour of
// what lies below the air, which sends starlight back up into it and so
// brightens the sky (scattering.ts, light scattered more than once).
//
// How: the ground at each of the spec's cell centres (about evenly spread over
// the sphere), coloured as it is drawn: land and land ice by their materials
// on level ground (src/ground/palette.ts), open water by deep water's colour,
// sea ice by sea ice's; averaged. Large-scale terrain only: the mean colour
// does not need the fine detail. Then the clouds, which lie low in the air
// (clouds.ts): the spec's cover of them, at the albedo they are drawn with,
// over the rest. On the Earth-like world: 0.18 ground, 0.55 with its clouds.
// Presentation only.

import type { PlanetSpec } from "../spec/schema";
import type { Vec3 } from "../forge/icosphere";
import { createTerrain } from "../terrain/terrain";
import { createMaterials } from "../terrain/materials";
import { DEEP_WATER, groundLook, SEA_ICE } from "../ground/palette";
import { CLOUD_ALBEDO } from "./clouds";

/** Detail is worked out down to this wavelength, m: the continents' scale. */
const COARSE_WAVELENGTH_M = 100_000;

/** The mean colour (linear RGB albedo) of the planet's ground, seas and clouds. */
export function groundAlbedo(spec: PlanetSpec): Vec3 {
  const terrain = createTerrain(spec);
  const materials = createMaterials(spec);
  const groundCover = spec.groundCover?.colourLinear ?? null;
  const sum: Vec3 = [0, 0, 0];
  for (const [x, y, z] of spec.surface.cells) {
    const s = terrain.sample([x, y, z], COARSE_WAVELENGTH_M);
    const colour = s.surface === "water" ? DEEP_WATER
      : s.surface === "seaIce" ? SEA_ICE
      : groundLook(materials(s, 0), s.temperatureK, s.moisture, s.groundM, groundCover).colour;
    for (let k = 0; k < 3; k++) sum[k] += colour[k];
  }
  const cover = spec.air.cloudCover;
  return sum.map((c) => (1 - cover) * (c / spec.surface.cells.length) + cover * CLOUD_ALBEDO) as Vec3;
}
