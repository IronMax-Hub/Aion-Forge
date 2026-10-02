// The sketcher's grid: points spread almost evenly over the sphere, with each
// point's neighbours.
//
// A level-3 icosphere: an icosahedron whose triangles are split into four,
// three times, with every new point pushed out onto the sphere. 642 points,
// the resolution of Aion Forge's own surface grid, so sketched and exported
// planets look comparable. 12 points (the icosahedron's corners) have five
// neighbours; the rest have six. Cells are almost equal in area (within about
// 20%), so a share of cells is close to a share of the surface.
//
// Built from +, −, ×, ÷ and square roots only, which IEEE 754 fixes exactly:
// the same grid in every browser.

export type Vec3 = [number, number, number];

export interface Icosphere {
  points: Vec3[];
  /** Indices of each point's neighbours. */
  neighbours: number[][];
}

const PHI = (1 + Math.sqrt(5)) / 2;

const CORNERS: Vec3[] = [
  [-1, PHI, 0], [1, PHI, 0], [-1, -PHI, 0], [1, -PHI, 0],
  [0, -1, PHI], [0, 1, PHI], [0, -1, -PHI], [0, 1, -PHI],
  [PHI, 0, -1], [PHI, 0, 1], [-PHI, 0, -1], [-PHI, 0, 1],
];

const FACES: [number, number, number][] = [
  [0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11],
  [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8],
  [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9],
  [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1],
];

function onSphere([x, y, z]: Vec3): Vec3 {
  const length = Math.sqrt(x * x + y * y + z * z);
  return [x / length, y / length, z / length];
}

/** An icosphere split `level` times: 10·4^level + 2 points. */
export function icosphere(level: number): Icosphere {
  const points = CORNERS.map(onSphere);
  let faces = FACES;
  for (let l = 0; l < level; l++) {
    const midpoints = new Map<string, number>();
    const midpoint = (a: number, b: number) => {
      const key = a < b ? `${a},${b}` : `${b},${a}`;
      let index = midpoints.get(key);
      if (index === undefined) {
        const [pa, pb] = [points[a], points[b]];
        index = points.push(onSphere([(pa[0] + pb[0]) / 2, (pa[1] + pb[1]) / 2, (pa[2] + pb[2]) / 2])) - 1;
        midpoints.set(key, index);
      }
      return index;
    };
    faces = faces.flatMap(([a, b, c]) => {
      const [ab, bc, ca] = [midpoint(a, b), midpoint(b, c), midpoint(c, a)];
      return [[a, ab, ca], [b, bc, ab], [c, ca, bc], [ab, bc, ca]] as [number, number, number][];
    });
  }
  const sets = points.map(() => new Set<number>());
  for (const [a, b, c] of faces) {
    sets[a].add(b).add(c);
    sets[b].add(a).add(c);
    sets[c].add(a).add(b);
  }
  return { points, neighbours: sets.map((s) => [...s].sort((p, q) => p - q)) };
}

/** The sketcher's grid level: 642 points. */
export const SKETCH_LEVEL = 3;
