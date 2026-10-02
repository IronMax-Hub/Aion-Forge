// The terrain: the height and kind of ground at any point of a planet, from
// its continents down to about a metre (PLAN, PF2).
//
// Why it exists: it is what the ground is drawn from (PF3), and the one place
// that decides where land, water and ice are.
//
// How:
// - Large scale: the spec's cells, blended (cellField.ts).
// - Fine scale: the planet's detail noise (detail.ts), anchored: at each point
//   the blended value the detail has at the cell centres around it is taken
//   away, with the same weights. At every centre the detail is then exactly 0,
//   so each centre keeps the spec's height and therefore its kind (owner
//   decision). Between centres only a gentle large-scale offset changes; coasts
//   still wander with the detail.
// - Kind: below sea level, a dry seabed where the dry flag passes ½, sea ice
//   where the ice flag passes ½, else open water; above it, ice where the ice
//   flag passes ½, else land. A little noise moves the ½ mark by less than
//   EDGE_SHIFT (< ½), so ice edges are ragged but no centre changes kind.
// - Temperature follows local height: the blended temperature less the lapse
//   rate times the detail's height above the blended height, where there is
//   air, so peaks are colder than the land around them.
// - The landing site (landing.ts) pins the ground near it to what Aion Forge's
//   globe showed there.
//
// Deterministic in every browser: exact arithmetic, integer hashing and detmath.

import type { PlanetSpec } from "../spec/schema";
import type { Vec3 } from "../forge/icosphere";
import { createRNG, seedHash } from "../forge/random";
import { createCellField } from "./cellField";
import type { Blend } from "./cellField";
import { createDetail, FINEST_WAVELENGTH_M, MAX_LAYERS, sumLayers } from "./detail";
import { gradientNoise } from "./gradientNoise";
import { createLandingPin } from "./landing";

const EARTH_RADIUS_M = 6_371_000;
/** Earth's standard lapse rate, K per m. */
const LAPSE_K_PER_M = 0.0065;
/** Air thinner than this does not cool with height (as the sketcher). */
const MIN_AIR_FOR_LAPSE_BAR = 0.01;
const MIN_TEMPERATURE_K = 3;
/** The most the edge noise moves the ½ mark of the ice and dry flags: below ½, so no cell centre changes kind. */
const EDGE_SHIFT = 0.45;
/** Edge noise: its first wavelength in cell spacings, and its layers. */
const EDGE_SPACINGS = 0.25;
const EDGE_LAYERS = 4;
/** Stretches the edge noise (mostly within ±0.4) to about ±1 before clamping. */
const EDGE_CONTRAST = 2.5;

export type Surface = "land" | "ice" | "water" | "seaIce";

export interface GroundSample {
  /** Height of the solid ground above sea level, m (the seabed, under water). */
  groundM: number;
  /** What is on top: bare land, land ice, open water or sea ice (both at sea level). */
  surface: Surface;
  /** At the ground, or at the sea's surface. */
  temperatureK: number;
  moisture: number;
  /** How strongly the landing site pins this point, 0–1. */
  pin: number;
}

export interface Terrain {
  spec: PlanetSpec;
  radiusM: number;
  /** The ground at a unit direction in the body frame, with detail down to a wavelength. */
  sample(direction: Vec3, finestWavelengthM?: number): GroundSample;
  /** Just the ground's height above sea level, m. */
  heightM(direction: Vec3, finestWavelengthM?: number): number;
}

/** What the terrain works out at a point before deciding its kind. */
interface Raw {
  blend: Blend;
  baseM: number;
  heightM: number;
  pin: number;
}

export function createTerrain(spec: PlanetSpec): Terrain {
  const radiusM = spec.body.radiusEarth * EARTH_RADIUS_M;
  const field = createCellField(spec);
  const detail = createDetail(spec, radiusM);
  const lapse = spec.air.pressureBar >= MIN_AIR_FOR_LAPSE_BAR ? LAPSE_K_PER_M : 0;
  const toMetres = (d: Vec3): Vec3 => [d[0] * radiusM, d[1] * radiusM, d[2] * radiusM];

  // The anchoring table: each cell's detail, layer by layer, as the region scales it there
  const centreLayers = field.directions.map((d) => {
    const p = toMetres(d);
    const scale = detail.regionScale(p);
    return detail.layerValues(p, MAX_LAYERS).map((v) => v * scale);
  });

  // Edge noise for the ice and dry flags
  const rng = createRNG((spec.seed ^ 0x5bd1e995) >>> 0);
  const edgeSeeds = Array.from({ length: EDGE_LAYERS }, () => seedHash(Math.floor(rng() * 0x100000000) | 0));
  const edgeWavelength = detail.firstWavelengthM * EDGE_SPACINGS;
  const edgeNoise = (p: Vec3): number => {
    let sum = 0, amplitude = 1, total = 0, wavelength = edgeWavelength;
    for (const seed of edgeSeeds) {
      sum += amplitude * gradientNoise(seed, p[0] / wavelength, p[1] / wavelength, p[2] / wavelength);
      total += amplitude;
      amplitude /= 2;
      wavelength /= 2;
    }
    return Math.max(-1, Math.min(1, (EDGE_CONTRAST * sum) / total));
  };

  /** Height above sea level before the landing pin: blended cells plus anchored detail, m. */
  const unpinned = (direction: Vec3, layers: number, blend: Blend): { baseM: number; heightM: number } => {
    const p = toMetres(direction);
    const baseM = field.values(blend).heightKm * 1000;
    let anchor = 0;
    for (let k = 0; k < blend.cells.length; k++) anchor += blend.weights[k] * sumLayers(centreLayers[blend.cells[k]], layers);
    const here = detail.regionScale(p) * sumLayers(detail.layerValues(p, layers), layers);
    return { baseM, heightM: baseM + here - anchor };
  };

  const pin = createLandingPin(spec, radiusM, (direction, layers) => unpinned(direction, layers, field.blend(direction)).heightM);

  const raw = (direction: Vec3, finestWavelengthM: number): Raw => {
    const layers = detail.layersFor(Math.max(finestWavelengthM, FINEST_WAVELENGTH_M));
    const blend = field.blend(direction);
    const { baseM, heightM } = unpinned(direction, layers, blend);
    const w = pin.weight(direction);
    return { blend, baseM, heightM: w > 0 ? heightM + w * pin.offsetM(layers) : heightM, pin: w };
  };

  return {
    spec,
    radiusM,
    heightM: (direction, finestWavelengthM = FINEST_WAVELENGTH_M) => raw(direction, finestWavelengthM).heightM,
    sample(direction, finestWavelengthM = FINEST_WAVELENGTH_M) {
      const { blend, baseM, heightM, pin: w } = raw(direction, finestWavelengthM);
      const cells = field.values(blend);
      // Flags pulled to the observation near the site; the edge noise fades out there
      const shift = w < 1 ? EDGE_SHIFT * edgeNoise(toMetres(direction)) * (1 - w) : 0;
      const ice = cells.ice + w * (pin.iceTarget - cells.ice) + shift;
      const dry = cells.dry + w * (0 - cells.dry) + shift;

      let surface: Surface;
      if (heightM < 0) surface = dry >= 0.5 ? "land" : ice >= 0.5 ? "seaIce" : "water";
      else surface = ice >= 0.5 ? "ice" : "land";
      const underSea = surface === "water" || surface === "seaIce";
      const temperatureK = underSea ? cells.temperatureK : Math.max(MIN_TEMPERATURE_K, cells.temperatureK - lapse * (heightM - baseM));
      return { groundM: heightM, surface, temperatureK, moisture: cells.moisture, pin: w };
    },
  };
}
