// Geography of a solid planet (Worlds Up Close, phase A2a).
//
// Why it exists: ocean cover, land for weathering and the coastline on the
// globe must follow from how much water a planet has and how its surface is
// shaped, not from a type roll. This draws that surface once: plates, relief
// and the sea level its water fills to. The world history loop (A2b) keeps
// the relief fixed and refills the oceans every step from the water it has then.
//
// How:
// - Grid. A level-3 icosphere: 642 cells, each a vertex of the subdivided
//   icosahedron, with its share of the sphere's area. Built once and shared.
// - Plates. 6–14 plate centres (more on larger planets) on jittered Fibonacci
//   points; each cell belongs to its nearest centre. A plate is continental
//   with probability CONTINENTAL_SHARE · τ(0), so planets with more tectonic
//   activity at formation build more continental crust. Each plate drifts in a
//   random direction.
// - Relief. Elevation = plate base height (continental or oceanic)
//   + uplift near converging boundaries − rift depth near separating ones,
//   fading over two cells, plus a little roughness. All of it is divided by
//   surface gravity, so small planets get taller mountains.
// - Water. The inventory W from A1 is water per unit of planet mass, so its
//   global layer depth is W · WATER_KM_PER_UNIT · g (mass over area). A median
//   inner planet of Earth's mass (W = 0.08) gets Earth's 2.7 km layer.
// - Sea level. The height at which the volume below it equals that layer. The
//   volume is piecewise linear in the level, so it is solved exactly over the
//   sorted elevations (the plan's bisection converges to the same answer).
//   Oceans fill the lowest cells first; a wet, flat planet is an ocean world.
// - Bands. 18 bands of 10° measured from an axis: the spin axis (latitude
//   bands) for a rotating planet, the substellar direction for a locked one.
//   Each band keeps its cells' sorted elevations (its hypsometry), so the loop
//   can refill it for any sea level without touching the grid.
//
// Assumptions and limits:
// - Continents do not move; the surface is drawn once for the planet's life.
// - Relief is per cell (about 1,100 km across on Earth): no single peaks.
// - Uplift is the same on both sides of a converging boundary; trenches,
//   island arcs and hotspots are not modelled.
// - Heights are in km relative to an arbitrary datum; only differences and the
//   sea level matter.
// - Water held in ice, rock or the atmosphere is not separated from the ocean.
//   A2b does that.
// Nothing in the simulation reads the geography yet; A2b and A3 will.

import { createRNG, mixSeed, SALT } from "./rng";
import { cos, sin } from "./detmath";
import type { Planet } from "./planet";
import { GIANT_PLANET_MASS } from "./planetBasics";
import type { PlanetPhysics } from "./planetPhysics";
import { tectonicActivity } from "./planetPhysics";

// ── Constants ─────────────────────────────────────────────────────────────────

const ICOSPHERE_LEVEL = 3;                 // 642 cells
export const BAND_COUNT = 18;              // 10° each

const PLATES = { min: 6, extra: 8 };       // 6–14 plates
const PLATE_SIZE_RANGE = { min: 0.3, max: 2.5 };   // Earth radii over which the count rises
const PLATE_JITTER_Z = 1;                  // in units of the Fibonacci spacing
const PLATE_JITTER_RAD = 0.5;
const PLATE_SPEED = { min: 0.3, max: 1 };  // relative; only ratios matter

// Share of plates that are continental on a planet with full tectonic activity at formation.
// Earth: continental crust covers about 40% of the surface; a quarter of it is flooded shelf.
const CONTINENTAL_SHARE = 0.4;

// Earth-like heights for g = 1, in km: mean continent, abyssal ocean floor
const CONTINENTAL_BASE_KM = 0.8;
const OCEANIC_BASE_KM = -4.5;
const PLATE_BASE_JITTER_KM = 0.4;          // ± around the base
const UPLIFT_KM = 3;                       // at a head-on collision
const RIFT_KM = 1.5;                       // at a head-on separation
const BOUNDARY_FALLOFF = [1, 0.5, 0.2];    // by distance from the boundary, in cells
const ROUGHNESS_KM = 0.25;                 // ± per cell

// Global water layer per unit of the A1 inventory at g = 1: Earth's 2.7 km at W = 0.08
export const WATER_KM_PER_UNIT = 2.7 / 0.08;

// ── Grid ──────────────────────────────────────────────────────────────────────

export interface Grid {
  /** Unit vectors, one per cell. */
  positions: [number, number, number][];
  /** Share of the sphere's area for each cell; sums to 1. */
  areas: number[];
  /** Indices of each cell's neighbours, ascending. */
  neighbours: number[][];
  /** Unit direction from each cell towards each of its neighbours, in the same order. */
  neighbourDirections: [number, number, number][][];
  /** Cosine of each cell's angle to the band axis: sin(latitude), or cos(angle from the substellar point). */
  axisCos: Float64Array;
  /** Band (0–17) of each cell, counted from the band axis. */
  bandOfCell: Uint8Array;
}

/** What the bands are measured from: latitude, or angle from the substellar point. */
export type BandAxis = "spin" | "substellar";

type Vec3 = [number, number, number];

function normalize([x, y, z]: Vec3): Vec3 {
  const length = Math.sqrt(x * x + y * y + z * z);
  return [x / length, y / length, z / length];
}

function dot(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

// cos of 10°, 20°, …, 170°: a cell whose cosine is below edge k lies beyond it
const BAND_EDGES_COS = Array.from({ length: BAND_COUNT - 1 }, (_, k) => cos(((k + 1) * Math.PI) / BAND_COUNT));

/** Band index (0–17) of a cell, from the cosine of its angle to the axis. */
function bandOf(cosAngle: number): number {
  let band = 0;
  while (band < BAND_EDGES_COS.length && cosAngle < BAND_EDGES_COS[band]) band++;
  return band;
}

// The axis bands are measured from: the spin axis of a rotating planet, or the
// direction of its star for a locked one. The grid's orientation on the planet
// is arbitrary, so one axis serves both. It is tilted off the icosahedron's
// symmetry axes: along them, whole rings of cells sit exactly on a band edge
// (the equator band came out 45% too large); here every band is within 4% of
// its true area.
const BAND_AXIS: Vec3 = normalize([0.21, 0.37, 1]);

function buildIcosphere(level: number): Grid {
  const phi = (1 + Math.sqrt(5)) / 2;
  const positions: Vec3[] = ([
    [-1, phi, 0], [1, phi, 0], [-1, -phi, 0], [1, -phi, 0],
    [0, -1, phi], [0, 1, phi], [0, -1, -phi], [0, 1, -phi],
    [phi, 0, -1], [phi, 0, 1], [-phi, 0, -1], [-phi, 0, 1],
  ] as Vec3[]).map(normalize);
  let faces: [number, number, number][] = [
    [0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11],
    [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8],
    [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9],
    [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1],
  ];

  for (let l = 0; l < level; l++) {
    const midpoints = new Map<string, number>();
    const midpoint = (a: number, b: number): number => {
      const key = a < b ? `${a},${b}` : `${b},${a}`;
      let index = midpoints.get(key);
      if (index === undefined) {
        const [pa, pb] = [positions[a], positions[b]];
        index = positions.push(normalize([pa[0] + pb[0], pa[1] + pb[1], pa[2] + pb[2]])) - 1;
        midpoints.set(key, index);
      }
      return index;
    };
    faces = faces.flatMap(([a, b, c]) => {
      const [ab, bc, ca] = [midpoint(a, b), midpoint(b, c), midpoint(c, a)];
      return [[a, ab, ca], [b, bc, ab], [c, ca, bc], [ab, bc, ca]] as [number, number, number][];
    });
  }

  // Each cell takes a third of the area of every triangle it touches
  const areas = positions.map(() => 0);
  const neighbourSets = positions.map(() => new Set<number>());
  let total = 0;
  for (const [a, b, c] of faces) {
    const [pa, pb, pc] = [positions[a], positions[b], positions[c]];
    const u: Vec3 = [pb[0] - pa[0], pb[1] - pa[1], pb[2] - pa[2]];
    const v: Vec3 = [pc[0] - pa[0], pc[1] - pa[1], pc[2] - pa[2]];
    const cross: Vec3 = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    const area = Math.sqrt(dot(cross, cross)) / 2;
    for (const i of [a, b, c]) areas[i] += area / 3;
    total += area;
    neighbourSets[a].add(b).add(c);
    neighbourSets[b].add(a).add(c);
    neighbourSets[c].add(a).add(b);
  }

  const neighbours = neighbourSets.map((set) => [...set].sort((x, y) => x - y));
  return {
    positions,
    areas: areas.map((area) => area / total),
    neighbours,
    neighbourDirections: neighbours.map((list, i) => list.map((j) => normalize([
      positions[j][0] - positions[i][0], positions[j][1] - positions[i][1], positions[j][2] - positions[i][2],
    ]))),
    axisCos: Float64Array.from(positions, (p) => dot(p, BAND_AXIS)),
    bandOfCell: Uint8Array.from(positions, (p) => bandOf(dot(p, BAND_AXIS))),
  };
}

let sharedGrid: Grid | undefined;

/** The level-3 icosphere every solid planet's surface is drawn on. */
export function surfaceGrid(): Grid {
  sharedGrid ??= buildIcosphere(ICOSPHERE_LEVEL);
  return sharedGrid;
}

// ── Hypsometry and sea level ──────────────────────────────────────────────────

/** Cell elevations in ascending order, with the area share of each. */
export interface Hypsometry {
  elevationsKm: Float64Array;
  areas: Float64Array;
}

/**
 * The sea level at which the water below it equals a global layer of the given
 * depth (km, as if spread over the whole planet). Water deeper than every cell
 * covers the whole planet.
 */
export function seaLevelFor(hypsometry: Hypsometry, waterDepthKm: number): number {
  const { elevationsKm: h, areas } = hypsometry;
  if (waterDepthKm <= 0) return h[0];
  // Between h[k] and h[k+1] the volume below level s is areaBelow · s − Σ area·h
  let areaBelow = 0;
  let areaHeightBelow = 0;
  for (let k = 0; k < h.length; k++) {
    areaBelow += areas[k];
    areaHeightBelow += areas[k] * h[k];
    const next = k + 1 < h.length ? h[k + 1] : Infinity;
    if (areaBelow * next - areaHeightBelow >= waterDepthKm) {
      return (waterDepthKm + areaHeightBelow) / areaBelow;
    }
  }
  return h[h.length - 1];   // unreachable: the last segment is unbounded
}

/** Area share of the cells lying below the sea level. */
export function areaBelow(hypsometry: Hypsometry, seaLevelKm: number): number {
  let area = 0;
  for (let k = 0; k < hypsometry.elevationsKm.length && hypsometry.elevationsKm[k] < seaLevelKm; k++) {
    area += hypsometry.areas[k];
  }
  return area;
}

// ── Geography ─────────────────────────────────────────────────────────────────

export interface GeographyBand {
  /** Share of the planet's area in this band. */
  area: number;
  /** Share of the band that is land at the formation sea level. */
  landFraction: number;
  /** The band's own cells; areas are shares of the whole planet. */
  hypsometry: Hypsometry;
}

export interface Geography {
  plateCount: number;
  continentalPlates: number;
  /** Plate index of each grid cell. */
  plateOfCell: Uint8Array;
  /** Elevation of each grid cell, km. */
  elevationKm: Float64Array;
  /** All cells, for global sea level. */
  hypsometry: Hypsometry;
  /** Global water layer the formation inventory makes, km. */
  waterDepthKm: number;
  seaLevelKm: number;
  oceanFraction: number;
  bandAxis: BandAxis;
  /** 18 bands of 10°, from the axis (north pole or substellar point) outwards. */
  bands: GeographyBand[];
}

/** Whether a planet has a surface: everything but the giants (R7). */
export function hasSolidSurface(planet: Planet): boolean {
  return planet.mass <= GIANT_PLANET_MASS;
}

/** Global water layer depth in km for a planet's water inventory. */
export function waterDepthKm(waterInventory: number, surfaceGravity: number): number {
  return waterInventory * WATER_KM_PER_UNIT * surfaceGravity;
}

function clamp01(x: number): number {
  return Math.min(1, Math.max(0, x));
}

interface Plate {
  centre: Vec3;
  velocity: Vec3;
  continental: boolean;
  baseKm: number;
}

function drawPlates(planet: Planet, rng: () => number): Plate[] {
  const sizeShare = clamp01((planet.size - PLATE_SIZE_RANGE.min) / (PLATE_SIZE_RANGE.max - PLATE_SIZE_RANGE.min));
  // The extra plates split between size (up to half) and chance
  const count = PLATES.min + Math.floor(sizeShare * PLATES.extra / 2 + rng() * (PLATES.extra / 2 + 1));
  const longitudeOffset = rng() * 2 * Math.PI;
  const continentalChance = CONTINENTAL_SHARE * tectonicActivity(planet, 0);
  const goldenAngle = Math.PI * (3 - Math.sqrt(5));

  const plates: Plate[] = [];
  for (let i = 0; i < count; i++) {
    // Every plate takes the same draws in the same order
    const zDraw = rng(), angleDraw = rng(), kindDraw = rng(), baseDraw = rng(), headingDraw = rng(), speedDraw = rng();

    const z = Math.min(1, Math.max(-1, 1 - (2 * (i + 0.5)) / count + ((zDraw - 0.5) * 2 * PLATE_JITTER_Z) / count));
    const ring = Math.sqrt(1 - z * z);
    const angle = i * goldenAngle + longitudeOffset + (angleDraw - 0.5) * 2 * PLATE_JITTER_RAD;
    const centre: Vec3 = [ring * cos(angle), ring * sin(angle), z];

    // A drift direction in the plane touching the sphere at the centre
    const east: Vec3 = ring > 1e-9 ? [-sin(angle), cos(angle), 0] : [1, 0, 0];
    const north: Vec3 = [
      centre[1] * east[2] - centre[2] * east[1],
      centre[2] * east[0] - centre[0] * east[2],
      centre[0] * east[1] - centre[1] * east[0],
    ];
    const heading = headingDraw * 2 * Math.PI;
    const speed = PLATE_SPEED.min + speedDraw * (PLATE_SPEED.max - PLATE_SPEED.min);
    const [c, s] = [cos(heading) * speed, sin(heading) * speed];
    const velocity: Vec3 = [east[0] * c + north[0] * s, east[1] * c + north[1] * s, east[2] * c + north[2] * s];

    const continental = kindDraw < continentalChance;
    const baseKm = (continental ? CONTINENTAL_BASE_KM : OCEANIC_BASE_KM) + (baseDraw - 0.5) * 2 * PLATE_BASE_JITTER_KM;
    plates.push({ centre, velocity, continental, baseKm });
  }
  return plates;
}

/** Each cell's nearest plate centre (ties to the lower plate index). */
function assignPlates(grid: Grid, plates: Plate[]): Uint8Array {
  const plateOfCell = new Uint8Array(grid.positions.length);
  for (let i = 0; i < grid.positions.length; i++) {
    const [x, y, z] = grid.positions[i];
    let bestDot = -Infinity;
    for (let p = 0; p < plates.length; p++) {
      const c = plates[p].centre;
      const d = x * c[0] + y * c[1] + z * c[2];
      if (d > bestDot) { bestDot = d; plateOfCell[i] = p; }
    }
  }
  return plateOfCell;
}

/**
 * Stress on each cell from the boundaries near it: positive where plates
 * converge, negative where they separate, fading with distance in cells.
 */
function boundaryStress(grid: Grid, plateOfCell: Uint8Array, plates: Plate[]): Float64Array {
  const cellCount = grid.positions.length;
  const stress = new Float64Array(cellCount);
  const hops = new Int8Array(cellCount).fill(-1);
  let frontier: number[] = [];

  // Boundary cells: the mean closing speed towards their foreign neighbours, from −1 to 1
  for (let i = 0; i < cellCount; i++) {
    const own = plates[plateOfCell[i]].velocity;
    let sum = 0;
    let count = 0;
    const neighbours = grid.neighbours[i];
    const directions = grid.neighbourDirections[i];
    for (let n = 0; n < neighbours.length; n++) {
      const j = neighbours[n];
      if (plateOfCell[j] === plateOfCell[i]) continue;
      const other = plates[plateOfCell[j]].velocity;
      const toward = directions[n];
      const closing = (own[0] - other[0]) * toward[0] + (own[1] - other[1]) * toward[1] + (own[2] - other[2]) * toward[2];
      sum += closing / (2 * PLATE_SPEED.max);
      count++;
    }
    if (count > 0) {
      stress[i] = sum / count;
      hops[i] = 0;
      frontier.push(i);
    }
  }

  // Spread each boundary's stress inwards, weaker with each cell; the first to arrive wins
  const source = Float64Array.from(stress);
  for (let h = 1; h < BOUNDARY_FALLOFF.length && frontier.length > 0; h++) {
    const next: number[] = [];
    for (const i of frontier) {
      for (const j of grid.neighbours[i]) {
        if (hops[j] !== -1) continue;
        hops[j] = h;
        source[j] = source[i];
        stress[j] = source[i] * BOUNDARY_FALLOFF[h];
        next.push(j);
      }
    }
    frontier = next;
  }
  return stress;
}

/**
 * Cell indices from the lowest to the highest. A bottom-up merge sort: it is
 * stable, so equal elevations keep index order, and it needs no comparator calls.
 */
function lowestFirst(elevationKm: Float64Array): Int32Array {
  const n = elevationKm.length;
  let from = new Int32Array(n);
  let to = new Int32Array(n);
  for (let i = 0; i < n; i++) from[i] = i;
  for (let width = 1; width < n; width *= 2) {
    for (let lo = 0; lo < n; lo += 2 * width) {
      const mid = Math.min(lo + width, n);
      const hi = Math.min(lo + 2 * width, n);
      let a = lo;
      let b = mid;
      let out = lo;
      while (a < mid && b < hi) to[out++] = elevationKm[from[b]] < elevationKm[from[a]] ? from[b++] : from[a++];
      while (a < mid) to[out++] = from[a++];
      while (b < hi) to[out++] = from[b++];
    }
    [from, to] = [to, from];
  }
  return from;
}

/**
 * Draws a solid planet's plates and relief, fills its oceans with the water it
 * formed with, and summarises the result in 18 bands.
 */
export function buildGeography(planet: Planet, physics: PlanetPhysics, galaxySeed: number): Geography {
  if (!hasSolidSurface(planet)) throw new RangeError(`Planet ${planet.key} is a giant and has no surface`);
  const grid = surfaceGrid();
  const rng = createRNG(mixSeed(galaxySeed, planet.hostStarId, planet.id, SALT.SURFACE));

  const plates = drawPlates(planet, rng);
  const cellCount = grid.positions.length;
  const plateOfCell = assignPlates(grid, plates);
  const stress = boundaryStress(grid, plateOfCell, plates);

  const reliefScale = 1 / physics.surfaceGravity;
  const elevationKm = new Float64Array(cellCount);
  for (let i = 0; i < cellCount; i++) {
    const tectonics = stress[i] > 0 ? UPLIFT_KM * stress[i] : RIFT_KM * stress[i];
    const roughness = (rng() - 0.5) * 2 * ROUGHNESS_KM;
    elevationKm[i] = (plates[plateOfCell[i]].baseKm + tectonics + roughness) * reliefScale;
  }

  const bandAxis: BandAxis = physics.tidallyLocked ? "substellar" : "spin";
  const bandOfCell = grid.bandOfCell;
  const cellsInBand = new Int32Array(BAND_COUNT);
  for (let i = 0; i < cellCount; i++) cellsInBand[bandOfCell[i]]++;

  // Walk the cells from lowest to highest, filling the global and band hypsometries in order
  const hypsometry: Hypsometry = { elevationsKm: new Float64Array(cellCount), areas: new Float64Array(cellCount) };
  const bandHypsometries: Hypsometry[] = Array.from(cellsInBand, (n) => ({ elevationsKm: new Float64Array(n), areas: new Float64Array(n) }));
  const filled = new Int32Array(BAND_COUNT);
  const order = lowestFirst(elevationKm);
  for (let k = 0; k < cellCount; k++) {
    const i = order[k];
    hypsometry.elevationsKm[k] = elevationKm[i];
    hypsometry.areas[k] = grid.areas[i];
    const band = bandHypsometries[bandOfCell[i]];
    const slot = filled[bandOfCell[i]]++;
    band.elevationsKm[slot] = elevationKm[i];
    band.areas[slot] = grid.areas[i];
  }

  const water = waterDepthKm(physics.waterInventory, physics.surfaceGravity);
  const seaLevelKm = seaLevelFor(hypsometry, water);
  const bands = bandHypsometries.map((bandHypsometry) => {
    const area = bandHypsometry.areas.reduce((sum, a) => sum + a, 0);
    const landFraction = area === 0 ? 0 : clamp01(1 - areaBelow(bandHypsometry, seaLevelKm) / area);
    return { area, landFraction, hypsometry: bandHypsometry };
  });

  return {
    plateCount: plates.length,
    continentalPlates: plates.filter((p) => p.continental).length,
    plateOfCell,
    elevationKm,
    hypsometry,
    waterDepthKm: water,
    seaLevelKm,
    oceanFraction: Math.min(1, areaBelow(hypsometry, seaLevelKm)),
    bandAxis,
    bands,
  };
}
