import { describe, expect, it } from "vitest";
import type { Vec3 } from "../forge/icosphere";
import { icosphere } from "../forge/icosphere";
import { PRESETS } from "../forge/presets";
import { presetSpec } from "../spec/presetFiles";
import type { PlanetSpec } from "../spec/schema";
import example from "../../../contracts/planet-spec/examples/minimal.json";
import { createCellField } from "./cellField";
import { createDetail, sumLayers } from "./detail";
import { directionOf } from "./landing";
import { createMaterials } from "./materials";
import type { GroundSample, Surface } from "./terrain";
import { createTerrain } from "./terrain";

const SPECS: [string, PlanetSpec][] = [
  ...PRESETS.map((p) => [p.id, presetSpec(p.id)] as [string, PlanetSpec]),
  ["minimal", example as PlanetSpec],
];
const KIND_OF_SURFACE: Record<Surface, number> = { land: 0, water: 1, ice: 2, seaIce: 2 };
const POINTS = icosphere(4).points;

function normalise([x, y, z]: number[]): Vec3 {
  const l = Math.sqrt(x * x + y * y + z * z);
  return [x / l, y / l, z / l];
}

/** A direction `metres` east of another, on a planet of this radius. */
function moved(d: Vec3, metres: number, radiusM: number): Vec3 {
  const east = normalise([-d[2], 0, d[0]].every((v) => v === 0) ? [1, 0, 0] : [-d[2], 0, d[0]]);
  const a = metres / radiusM;
  return normalise([d[0] + east[0] * a, d[1] + east[1] * a, d[2] + east[2] * a]);
}

/** A spec with a landing observation at a site. */
function landingOn(spec: PlanetSpec, latitudeDeg: number, longitudeDeg: number, kind: "land" | "water" | "ice", heightKm: number): PlanetSpec {
  return {
    ...spec,
    landing: {
      latitudeDeg, longitudeDeg, subsolar: { latitudeDeg: 0, longitudeDeg: 0 },
      observed: { kind, heightKm, vegetated: false, colourLinear: [0.1, 0.1, 0.1] },
    },
  };
}

describe("the cell field", () => {
  it("passes exactly through every cell and blends with weights adding up to 1", () => {
    for (const [, spec] of SPECS) {
      const field = createCellField(spec);
      spec.surface.cells.forEach((c, i) => {
        const v = field.values(field.blend(field.directions[i]));
        expect(v.heightKm).toBe(c[3] - spec.surface.seaLevelKm);
        expect(v.temperatureK).toBe(c[4]);
      });
      for (const p of POINTS.slice(0, 200)) {
        const { weights } = field.blend(p);
        expect(weights.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 12);
      }
    }
  });
});

describe("the terrain", () => {
  it("gives the same ground from the same spec, and other ground from another seed", () => {
    const spec = presetSpec("earth-like");
    const a = createTerrain(spec), b = createTerrain(structuredClone(spec)), c = createTerrain({ ...spec, seed: spec.seed + 1 });
    const samples = (t: ReturnType<typeof createTerrain>) => POINTS.slice(0, 300).map((p) => t.sample(p));
    expect(samples(a)).toEqual(samples(b));
    expect(samples(c).map((s) => s.groundM)).not.toEqual(samples(a).map((s) => s.groundM));
  });

  it("keeps every cell centre's height and kind, at every level of detail", () => {
    for (const [name, spec] of SPECS) {
      const terrain = createTerrain(spec);
      const field = createCellField(spec);
      for (const finest of [1, 100, 10_000, 1_000_000]) {
        spec.surface.cells.forEach((c, i) => {
          const s = terrain.sample(field.directions[i], finest);
          expect(s.groundM, `${name} cell ${i}`).toBeCloseTo((c[3] - spec.surface.seaLevelKm) * 1000, 6);
          expect(KIND_OF_SURFACE[s.surface], `${name} cell ${i}`).toBe(c[6]);
        });
      }
    }
  });

  it("puts open water and sea ice only below sea level, land and land ice only above", () => {
    for (const [, spec] of SPECS) {
      const terrain = createTerrain(spec);
      for (const p of POINTS) {
        const s = terrain.sample(p, 1000);
        if (s.surface === "water" || s.surface === "seaIce") expect(s.groundM).toBeLessThan(0);
        if (s.surface === "ice") expect(s.groundM).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it("changes height smoothly, across buckets and cube faces", () => {
    const terrain = createTerrain(presetSpec("earth-like"));
    // A path along the equator crosses four cube faces and many buckets
    let last = terrain.heightM([1, 0, 0], 1000);
    for (let i = 1; i <= 4000; i++) {
      const a = (i / 4000) * 2 * Math.PI;
      const h = terrain.heightM([Math.cos(a), 0, -Math.sin(a)], 1000);
      // 10 km steps; no seam would show as a jump far beyond the terrain's slopes
      expect(Math.abs(h - last)).toBeLessThan(400);
      last = h;
    }
  });

  it("changes heights, when fine layers are left out, by no more than those layers can", () => {
    const spec = presetSpec("earth-like");
    const terrain = createTerrain(spec);
    const detail = createDetail(spec, terrain.radiusM);
    const coarse = detail.layersFor(1000);
    // The left-out layers' amplitudes, twice over (the point's and the anchor's), at the strongest region
    const firstLeftOut = Math.floor(coarse);
    const amplitudes = Array.from({ length: 24 }, (_, k) => 1000 * Math.pow(detail.firstWavelengthM / 1e6, 0.8) * Math.pow(2, -0.8 * k));
    const bound = 2 * 1.6 * 1.2 * amplitudes.slice(firstLeftOut).reduce((a, b) => a + b, 0);
    for (const p of POINTS.slice(0, 500)) {
      expect(Math.abs(terrain.heightM(p, 1) - terrain.heightM(p, 1000))).toBeLessThan(bound);
    }
  });

  it("is rougher on lighter planets", () => {
    const spec = presetSpec("earth-like");
    const roughness = (s: PlanetSpec) => {
      const t = createTerrain(s);
      return POINTS.slice(0, 300).reduce((sum, p) => sum + Math.abs(t.heightM(p) - t.heightM(moved(p, 2000, t.radiusM))), 0);
    };
    expect(roughness({ ...spec, body: { ...spec.body, gravityG: 0.4 } })).toBeGreaterThan(2 * roughness(spec));
  });

  it("makes ground colder where the detail raises it, where there is air", () => {
    const terrain = createTerrain(presetSpec("earth-like"));
    const field = createCellField(presetSpec("earth-like"));
    let checked = 0;
    for (const p of POINTS) {
      const s = terrain.sample(p);
      if (s.surface !== "land") continue;
      const blended = field.values(field.blend(p));
      const raise = s.groundM - blended.heightKm * 1000;
      if (Math.abs(raise) < 50) continue;
      expect(Math.sign(blended.temperatureK - s.temperatureK)).toBe(Math.sign(raise));
      checked++;
    }
    expect(checked).toBeGreaterThan(50);
  });

  it("samples a height in about 5 µs at 1 m detail", () => {
    const terrain = createTerrain(presetSpec("earth-like"));
    for (let i = 0; i < 2000; i++) terrain.heightM(POINTS[i % POINTS.length]);
    const start = performance.now();
    for (let i = 0; i < 10_000; i++) terrain.heightM(POINTS[i % POINTS.length]);
    const microseconds = ((performance.now() - start) * 1000) / 10_000;
    // Measured about 4.5 µs in Node; the bound only catches large regressions on slow machines and test runners
    expect(microseconds).toBeLessThan(40);
  });
});

describe("the landing site", () => {
  const earth = presetSpec("earth-like");

  it("comes out the kind it was seen, on the right side of sea level, wherever it is", () => {
    const sites = [[10, 20], [-35, 100], [60, -150], [0, 0], [-70, 45], [25, -60]];
    for (const [preset, kinds] of [["earth-like", ["land", "water", "ice"]], ["desert", ["land", "water"]], ["ocean", ["land", "water"]]] as const) {
      const spec = presetSpec(preset);
      for (const [lat, lon] of sites) {
        for (const kind of kinds) {
          // Seen at 300 m above sea level for land, 300 m below for water: contrary to the cells half the time
          const seenKm = spec.surface.seaLevelKm + (kind === "water" ? -0.3 : 0.3);
          const terrain = createTerrain(landingOn(spec, lat, lon, kind, seenKm));
          for (const finest of [1, 100, 5000]) {
            const s = terrain.sample(directionOf(lat, lon), finest);
            const surface = KIND_OF_SURFACE[s.surface];
            expect(surface, `${preset} ${lat},${lon} seen ${kind}`).toBe(kind === "land" ? 0 : kind === "water" ? 1 : 2);
            if (kind === "water") expect(s.groundM).toBeLessThanOrEqual(-5);
            if (kind === "land") expect(s.groundM).toBeGreaterThanOrEqual(5);
            expect(s.pin).toBe(1);
          }
        }
      }
    }
  });

  it("stands at the observed height, and changes nothing beyond 10 km", () => {
    const spec = landingOn(earth, 12.4, -71, "land", earth.surface.seaLevelKm + 0.4);
    const pinned = createTerrain(spec), free = createTerrain(earth);
    const site = directionOf(12.4, -71);
    expect(pinned.heightM(site)).toBeCloseTo(400, 6);
    for (const metres of [10_001, 15_000, 50_000]) {
      const p = moved(site, metres, pinned.radiusM);
      expect(pinned.sample(p)).toEqual(free.sample(p));
    }
    // Within 1 km the whole ground moves by one offset: its shape is kept
    const near = moved(site, 600, pinned.radiusM);
    expect(pinned.heightM(near) - free.heightM(near)).toBeCloseTo(pinned.heightM(site) - free.heightM(site), 6);
  });

  it("does nothing without an observation", () => {
    const spec = { ...earth, landing: { latitudeDeg: 5, longitudeDeg: 5, subsolar: { latitudeDeg: 0, longitudeDeg: 0 } } };
    const p = directionOf(5, 5);
    expect(createTerrain(spec).sample(p)).toEqual(createTerrain(earth).sample(p));
  });
});

describe("the materials", () => {
  const sample = (over: Partial<GroundSample>): GroundSample => ({ groundM: 200, surface: "land", temperatureK: 290, moisture: 0.3, pin: 0, ...over });
  const total = (m: object) => (Object.values(m) as number[]).reduce((a, b) => a + b, 0);

  it("add up to 1, everywhere on every preset", () => {
    for (const [, spec] of SPECS) {
      const terrain = createTerrain(spec), materials = createMaterials(spec);
      for (const p of POINTS.slice(0, 400)) {
        for (const slope of [0, 20, 50]) expect(total(materials(terrain.sample(p, 1000), slope))).toBeCloseTo(1, 12);
      }
    }
  });

  it("melt only above 900 K", () => {
    const lava = createMaterials(presetSpec("lava"));
    expect(lava(sample({ temperatureK: 899 }), 0).molten).toBe(0);
    expect(lava(sample({ temperatureK: 1100 }), 0).molten).toBeGreaterThan(0);
    expect(lava(sample({ temperatureK: 1400 }), 0).molten).toBe(1);
  });

  it("grow ground cover only on living planets, between freezing and boiling, where it is moist", () => {
    const earthMaterials = createMaterials(presetSpec("earth-like"));
    expect(earthMaterials(sample({}), 0).cover).toBeGreaterThan(0.3);
    expect(earthMaterials(sample({ temperatureK: 250 }), 0).cover).toBe(0);
    expect(earthMaterials(sample({ moisture: 0.01 }), 0).cover).toBe(0);
    expect(createMaterials(presetSpec("desert"))(sample({}), 0).cover).toBe(0);
  });

  it("bare cliffs, and cover ice with snow", () => {
    const m = createMaterials(presetSpec("earth-like"));
    expect(m(sample({}), 60).rock).toBe(1);
    expect(m(sample({ surface: "ice" }), 0).snow).toBe(1);
    expect(m(sample({ temperatureK: 260 }), 0).snow).toBe(1);
    expect(createMaterials(presetSpec("lava"))(sample({ temperatureK: 260 }), 0).snow).toBe(0);
  });

  it("leave airless worlds' bare ground as rock", () => {
    const lava = createMaterials(presetSpec("lava"));
    expect(lava(sample({ temperatureK: 400, moisture: 0 }), 0).rock).toBe(1);
  });

  it("lay sand on beaches and in deserts", () => {
    const m = createMaterials(presetSpec("earth-like"));
    expect(m(sample({ groundM: 1 }), 0).sand).toBeGreaterThan(0.5);
    expect(m(sample({ moisture: 0 }), 0).sand).toBe(1);
  });
});

describe("the detail's layers", () => {
  it("fade the last layer in by its fraction", () => {
    expect(sumLayers([1, 2, 4], 2)).toBe(3);
    expect(sumLayers([1, 2, 4], 2.5)).toBe(5);
    expect(sumLayers([1, 2, 4], 3)).toBe(7);
    expect(sumLayers([1, 2, 4], 0.25)).toBe(0.25);
  });
});
