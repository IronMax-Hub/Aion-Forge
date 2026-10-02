// The large scale of the terrain: the spec's cells, blended smoothly over the
// sphere.
//
// Why it exists: the cells are points; the ground between them needs values.
//
// How: Aion Forge's own method (frontend/src/rendering/planet/surfaceMap.ts),
// so before any detail Planet Forge's coasts sit where Aion Forge's globe draws
// them. Each point takes a weighted mean of the cells within SMOOTHING_RADIUS
// (Franke–Little inverse-distance weighting): a weight grows without bound at a
// cell and falls to nothing at the radius, so the field passes exactly through
// every cell's value and is smooth between them.
// - Radius: Aion Forge's 0.2 rad for its 642 cells, scaled with the spacing,
//   √(642 / N), so specs with any number of cells blend alike.
// - Distance: the straight line through the sphere (the chord), not the arc,
//   so no inverse cosine is needed. Its weights differ from Aion Forge's very
//   slightly, far inside what Aion Forge's 512 × 256 surface map can show.
// - Lookup: cells are filed in buckets on the six faces of a cube, 16 × 16 per
//   face, each listing the cells that can reach any point in it.
// - A point no cell reaches (only possible with very uneven custom cells)
//   takes its nearest cell.
//
// Exact arithmetic and detmath only: the same weights in every browser.

import type { PlanetSpec } from "../spec/schema";
import { CELL_KIND } from "../spec/schema";
import type { Vec3 } from "../forge/icosphere";
import { sin } from "../forge/detmath";

/** Aion Forge's smoothing radius for its 642 cells, rad. */
const AION_FORGE_RADIUS = 0.2;
const AION_FORGE_CELLS = 642;
/** Buckets along each edge of a cube face. */
const BUCKETS_PER_EDGE = 16;
/** Closer than this (chord), a point is at the cell. */
const AT_CELL = 1e-12;

/** What the cells give a point: values blended from the cells around it. */
export interface CellValues {
  /** Height above sea level, km. */
  heightKm: number;
  temperatureK: number;
  moisture: number;
  /** 1 at ice cells, 0 elsewhere, smooth between. */
  ice: number;
  /** 1 at dry cells below sea level (seas boiled off), 0 elsewhere. */
  dry: number;
}

/** The cells a point draws on, and their weights, adding up to 1. */
export interface Blend {
  cells: number[];
  weights: number[];
}

export interface CellField {
  /** Unit directions of the cells. */
  directions: Vec3[];
  /** Chord within which a cell takes part. */
  radiusChord: number;
  blend(direction: Vec3): Blend;
  values(blend: Blend): CellValues;
}

function normalise([x, y, z]: readonly number[]): Vec3 {
  const length = Math.sqrt(x * x + y * y + z * z);
  return [x / length, y / length, z / length];
}

function chord(a: Vec3, b: Vec3): number {
  const dx = a[0] - b[0], dy = a[1] - b[1], dz = a[2] - b[2];
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

/** The cube face (0–5) and bucket a direction falls in. */
function bucketOf([x, y, z]: Vec3): number {
  const ax = Math.abs(x), ay = Math.abs(y), az = Math.abs(z);
  let face: number, u: number, v: number;
  if (ax >= ay && ax >= az) { face = x > 0 ? 0 : 1; u = y / ax; v = z / ax; }
  else if (ay >= az) { face = y > 0 ? 2 : 3; u = x / ay; v = z / ay; }
  else { face = z > 0 ? 4 : 5; u = x / az; v = y / az; }
  const i = Math.min(BUCKETS_PER_EDGE - 1, Math.floor((u + 1) / 2 * BUCKETS_PER_EDGE));
  const j = Math.min(BUCKETS_PER_EDGE - 1, Math.floor((v + 1) / 2 * BUCKETS_PER_EDGE));
  return (face * BUCKETS_PER_EDGE + i) * BUCKETS_PER_EDGE + j;
}

/** The direction at a face's (u, v), each in [−1, 1]. */
function faceDirection(face: number, u: number, v: number): Vec3 {
  const sign = face % 2 === 0 ? 1 : -1;
  if (face < 2) return normalise([sign, u, v]);
  if (face < 4) return normalise([u, sign, v]);
  return normalise([u, v, sign]);
}

/** Builds the blended field of a spec's cells. */
export function createCellField(spec: PlanetSpec): CellField {
  const cells = spec.surface.cells;
  const directions = cells.map((c) => normalise([c[0], c[1], c[2]]));
  const sea = spec.surface.seaLevelKm;
  const values = cells.map(([, , , heightKm, temperatureK, moisture, kind]) => ({
    heightKm: heightKm - sea,
    temperatureK,
    moisture,
    ice: kind === CELL_KIND.ice ? 1 : 0,
    dry: kind === CELL_KIND.land && heightKm < sea ? 1 : 0,
  }));

  const radius = AION_FORGE_RADIUS * Math.sqrt(AION_FORGE_CELLS / cells.length);
  const radiusChord = 2 * sin(Math.min(radius, Math.PI) / 2);

  // Each bucket lists the cells within reach of any point in it: of its centre, by the radius plus the bucket's own size
  const buckets: number[][] = [];
  for (let face = 0; face < 6; face++) {
    for (let i = 0; i < BUCKETS_PER_EDGE; i++) {
      for (let j = 0; j < BUCKETS_PER_EDGE; j++) {
        const at = (a: number, b: number) => faceDirection(face, (a / BUCKETS_PER_EDGE) * 2 - 1, (b / BUCKETS_PER_EDGE) * 2 - 1);
        const centre = at(i + 0.5, j + 0.5);
        const size = Math.max(chord(centre, at(i, j)), chord(centre, at(i + 1, j)), chord(centre, at(i, j + 1)), chord(centre, at(i + 1, j + 1)));
        const reach = radiusChord + size;
        buckets.push(directions.flatMap((d, c) => (chord(d, centre) <= reach ? [c] : [])));
      }
    }
  }

  const nearest = (direction: Vec3): number => {
    let best = 0, bestChord = Infinity;
    directions.forEach((d, c) => { const k = chord(d, direction); if (k < bestChord) { bestChord = k; best = c; } });
    return best;
  };

  return {
    directions,
    radiusChord,
    blend(direction) {
      const candidates = buckets[bucketOf(direction)];
      const within: number[] = [];
      const raw: number[] = [];
      let total = 0;
      for (const c of candidates) {
        const d = chord(directions[c], direction);
        if (d < AT_CELL) return { cells: [c], weights: [1] };
        if (d >= radiusChord) continue;
        const w = (radiusChord - d) / (radiusChord * d);
        within.push(c);
        raw.push(w * w);
        total += w * w;
      }
      if (within.length === 0) return { cells: [nearest(direction)], weights: [1] };
      return { cells: within, weights: raw.map((w) => w / total) };
    },
    values({ cells: at, weights }) {
      const out: CellValues = { heightKm: 0, temperatureK: 0, moisture: 0, ice: 0, dry: 0 };
      for (let k = 0; k < at.length; k++) {
        const v = values[at[k]], w = weights[k];
        out.heightKm += w * v.heightKm;
        out.temperatureK += w * v.temperatureK;
        out.moisture += w * v.moisture;
        out.ice += w * v.ice;
        out.dry += w * v.dry;
      }
      return out;
    },
  };
}
