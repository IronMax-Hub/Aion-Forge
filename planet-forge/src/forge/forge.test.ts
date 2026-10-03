import { describe, expect, it } from "vitest";
import { checkSpec } from "../spec/check";
import type { PlanetSpec } from "../spec/schema";
import { CELL_KIND } from "../spec/schema";
import { specFileText } from "../spec/specFile";
import { icosphere, SKETCH_LEVEL } from "./icosphere";
import type { SketchInputs } from "./inputs";
import { boilingK, derivedFigures, equilibriumTemperatureK, inputProblems } from "./inputs";
import { fbm } from "./noise";
import { latticeValue } from "./random";
import { PRESETS } from "./presets";
import { seaLevelFor, sketchPlanet } from "./sketch";

// The committed preset files, as text
const exampleFiles = import.meta.glob("../../../contracts/planet-spec/examples/*.json", {
  query: "?raw", import: "default", eager: true,
}) as Record<string, string>;

const earth = (): SketchInputs => structuredClone(PRESETS.find((p) => p.id === "earth-like")!.inputs);
const cellsOf = (spec: PlanetSpec, kind: number) => spec.surface.cells.filter((c) => c[6] === kind);
const temperatures = (spec: PlanetSpec) => spec.surface.cells.map((c) => c[4]);
const contrast = (spec: PlanetSpec) => Math.max(...temperatures(spec)) - Math.min(...temperatures(spec));

describe("the icosphere", () => {
  const { points, neighbours } = icosphere(SKETCH_LEVEL);

  it("has 642 points on the unit sphere", () => {
    expect(points).toHaveLength(642);
    for (const [x, y, z] of points) expect(Math.abs(Math.sqrt(x * x + y * y + z * z) - 1)).toBeLessThan(1e-12);
  });

  it("gives 12 points five neighbours and the rest six, both ways", () => {
    const counts = neighbours.map((n) => n.length);
    expect(counts.filter((c) => c === 5)).toHaveLength(12);
    expect(counts.filter((c) => c === 6)).toHaveLength(630);
    neighbours.forEach((list, i) => list.forEach((n) => expect(neighbours[n]).toContain(i)));
  });

  it("spaces its points almost evenly: nearest neighbours within 25% of each other", () => {
    const nearest = points.map((p, i) => Math.min(...neighbours[i].map((n) => Math.hypot(p[0] - points[n][0], p[1] - points[n][1], p[2] - points[n][2]))));
    expect(Math.max(...nearest) / Math.min(...nearest)).toBeLessThan(1.25);
  });
});

describe("the noise", () => {
  it("gives every point of a small lattice its own value", () => {
    const values = new Set<number>();
    for (let x = -4; x < 4; x++) for (let y = -4; y < 4; y++) for (let z = -4; z < 4; z++) values.add(latticeValue(1001, x, y, z));
    expect(values.size).toBe(512);
  });

  it("stays within [−1, 1] and depends on the seed", () => {
    const { points } = icosphere(2);
    const a = points.map((p) => fbm(7, p, 1.2, 4));
    const b = points.map((p) => fbm(8, p, 1.2, 4));
    for (const v of a) expect(Math.abs(v)).toBeLessThanOrEqual(1);
    expect(a).not.toEqual(b);
    expect(points.map((p) => fbm(7, p, 1.2, 4))).toEqual(a);
  });
});

describe("the inputs' figures", () => {
  it("give an Earth-like world 1 g, a year of 1 and a Sun-sized star", () => {
    const f = derivedFigures(earth());
    expect(f.gravityG).toBeCloseTo(1, 10);
    expect(f.periodYears).toBeCloseTo(1, 10);
    expect(f.starRadiusSolar).toBeCloseTo(1, 10);
    expect(f.starMassSolar).toBeCloseTo(1, 10);
  });

  it("give Earth's equilibrium temperature, about 255 K", () => {
    expect(equilibriumTemperatureK(1, 1)).toBeGreaterThan(250);
    expect(equilibriumTemperatureK(1, 1)).toBeLessThan(258);
  });

  it("boil water at 373 K at one atmosphere, higher under more air, never below the triple point", () => {
    expect(boilingK(1.01325)).toBeCloseTo(373.15, 6);
    expect(boilingK(2)).toBeGreaterThan(boilingK(1));
    expect(boilingK(0)).toBe(273.16);
    expect(boilingK(0.007)).toBeGreaterThanOrEqual(273.16);
  });
});

describe("the inputs' problems", () => {
  it("are none for every preset", () => {
    for (const preset of PRESETS) expect(inputProblems(preset.inputs), preset.id).toEqual([]);
  });

  it("name each input that cannot be sketched", () => {
    const bad = earth();
    bad.body.radiusEarth = 0;
    bad.surface.oceanShare = 1.2;
    bad.air.gases = { N2: 0, O2: 0, CO2: 0, CH4: 0, H2O: 0 };
    expect(inputProblems(bad)).toEqual(["the radius must be above 0", "air needs at least one gas", "the ocean share must be from 0 to 1"]);
  });

  it("ignore the day length of a locked world", () => {
    const locked = earth();
    locked.body.tidallyLocked = true;
    locked.body.rotationHours = 0;
    expect(inputProblems(locked)).toEqual([]);
  });
});

describe("the sketcher", () => {
  it("makes the same spec from the same inputs, and a different planet from another seed", () => {
    expect(sketchPlanet(earth(), "custom")).toEqual(sketchPlanet(earth(), "custom"));
    const other = { ...earth(), seed: 2002 };
    expect(sketchPlanet(other, "custom").surface.cells).not.toEqual(sketchPlanet(earth(), "custom").surface.cells);
  });

  it("puts the ocean share of the cells under the sea, to within a cell and any cells of equal height there", () => {
    for (const share of [0, 0.05, 0.3, 0.7, 0.97, 1]) {
      const spec = sketchPlanet({ ...earth(), surface: { ...earth().surface, oceanShare: share } }, "custom");
      const heights = spec.surface.cells.map((c) => c[3]).sort((a, b) => a - b);
      const wanted = Math.round(share * 642);
      const under = heights.filter((h) => h < spec.surface.seaLevelKm).length;
      // Cells of the same height (heights are stored to the metre) stay on one side of the sea level
      const tied = wanted > 0 && wanted < 642 ? heights.filter((h) => h === heights[wanted - 1] || h === heights[wanted]).length - 2 : 0;
      expect(Math.abs(under - wanted)).toBeLessThanOrEqual(tied);
      expect(Math.abs(wanted - share * 642)).toBeLessThan(1);
    }
  });

  it("never gives fewer ocean cells for more water", () => {
    let last = -1;
    for (let share = 0; share <= 1; share += 0.05) {
      const spec = sketchPlanet({ ...earth(), surface: { ...earth().surface, oceanShare: share } }, "custom");
      const under = spec.surface.cells.filter((c) => c[3] < spec.surface.seaLevelKm).length;
      expect(under).toBeGreaterThanOrEqual(last);
      last = under;
    }
  });

  it("stores heights and kinds that agree: water and sea ice only under the sea", () => {
    for (const preset of PRESETS) {
      const spec = sketchPlanet(preset.inputs, "preset");
      for (const [, , , h, , , kind] of spec.surface.cells) {
        if (kind === CELL_KIND.water) expect(h).toBeLessThan(spec.surface.seaLevelKm);
      }
    }
  });

  it("stretches the relief as gravity falls", () => {
    const range = (spec: PlanetSpec) => Math.max(...spec.surface.cells.map((c) => c[3])) - Math.min(...spec.surface.cells.map((c) => c[3]));
    const heavy = sketchPlanet(earth(), "custom");
    const light = sketchPlanet({ ...earth(), body: { ...earth().body, massEarth: 0.25 } }, "custom");
    expect(range(heavy)).toBeCloseTo(4, 1);
    expect(range(light)).toBeCloseTo(16, 1);
  });

  it("never makes the temperature contrast larger with thicker air", () => {
    let last = Infinity;
    for (const pressureBar of [0, 0.1, 1, 10, 90]) {
      const spec = sketchPlanet({ ...earth(), surface: { ...earth().surface, reliefKm: 0 }, air: { ...earth().air, pressureBar } }, "custom");
      expect(contrast(spec)).toBeLessThanOrEqual(last);
      last = contrast(spec);
    }
    expect(last).toBeLessThan(5);
  });

  it("gives an Earth-like world about 40 K from equator to pole", () => {
    const spec = sketchPlanet({ ...earth(), surface: { ...earth().surface, reliefKm: 0 } }, "custom");
    expect(contrast(spec)).toBeGreaterThan(30);
    expect(contrast(spec)).toBeLessThan(50);
  });

  it("warms a locked world most under its star, at longitude 0", () => {
    const spec = sketchPlanet({ ...earth(), body: { ...earth().body, tidallyLocked: true } }, "custom");
    const warmest = spec.surface.cells.reduce((a, b) => (b[4] > a[4] ? b : a));
    expect(warmest[0]).toBeGreaterThan(0.9);
    expect(spec.body.rotationHours).toBeCloseTo(8766, 0);
  });

  it("keeps every temperature positive, however cold", () => {
    const spec = sketchPlanet({ ...earth(), surface: { ...earth().surface, meanTemperatureK: 20 } }, "custom");
    expect(Math.min(...temperatures(spec))).toBeGreaterThanOrEqual(30);
  });

  it("boils the sea away above boiling, and freezes it below freezing", () => {
    const hot = sketchPlanet({ ...earth(), surface: { ...earth().surface, meanTemperatureK: 700 } }, "custom");
    expect(cellsOf(hot, CELL_KIND.water)).toHaveLength(0);
    expect(hot.surface.steam).toBe(true);
    const cold = sketchPlanet({ ...earth(), surface: { ...earth().surface, meanTemperatureK: 200 } }, "custom");
    expect(cellsOf(cold, CELL_KIND.water)).toHaveLength(0);
    expect(cold.surface.steam).toBe(false);
    expect(cellsOf(cold, CELL_KIND.ice).length).toBeGreaterThan(400);
  });

  it("dries the land inland, and everywhere without open water", () => {
    const spec = sketchPlanet({ ...earth(), surface: { ...earth().surface, oceanShare: 0.3 } }, "custom");
    const land = cellsOf(spec, CELL_KIND.land).map((c) => c[5]);
    expect(Math.max(...land)).toBeLessThanOrEqual(0.5);
    expect(Math.min(...land)).toBeLessThan(0.1);
    const dry = sketchPlanet({ ...earth(), surface: { ...earth().surface, oceanShare: 0 } }, "custom");
    for (const c of dry.surface.cells) expect(c[5]).toBe(0);
    expect(cellsOf(dry, CELL_KIND.ice)).toHaveLength(0);
  });

  it("rescales gas amounts to shares and leaves out the air of an airless world", () => {
    expect(sketchPlanet(earth(), "custom").air.gases).toEqual({ N2: 0.78, O2: 0.21, H2O: 0.01, O3: 3.8e-7 });
    expect(sketchPlanet({ ...earth(), air: { ...earth().air, ozonePpm: 0 } }, "custom").air.gases).toEqual({ N2: 0.78, O2: 0.21, H2O: 0.01 });
    expect(sketchPlanet({ ...earth(), air: { ...earth().air, pressureBar: 0 } }, "custom").air.gases).toEqual({});
  });

  it("writes ozone to the part per billion, and names a negative or impossible amount", () => {
    expect(sketchPlanet({ ...earth(), air: { ...earth().air, ozonePpm: 12.3456 } }, "custom").air.gases.O3).toBe(1.2346e-5);
    expect(inputProblems({ ...earth(), air: { ...earth().air, ozonePpm: -1 } })).toContain("ozone must be from 0 to under 1,000,000 ppm");
    expect(inputProblems({ ...earth(), air: { ...earth().air, ozonePpm: 1e6 } })).toHaveLength(1);
  });

  it("finds the sea level between the last cell under and the first above", () => {
    expect(seaLevelFor([3, 1, 2, 4], 0.5)).toBe(2.5);
    expect(seaLevelFor([3, 1, 2, 4], 0)).toBeLessThan(1);
    expect(seaLevelFor([3, 1, 2, 4], 1)).toBeGreaterThan(4);
  });
});

describe("the presets", () => {
  it("are five, each passing the spec check with no warnings", () => {
    expect(PRESETS.map((p) => p.id)).toEqual(["earth-like", "lava", "ice", "ocean", "desert"]);
    for (const preset of PRESETS) {
      expect(checkSpec(JSON.parse(JSON.stringify(sketchPlanet(preset.inputs, "preset"))))).toMatchObject({ ok: true, warnings: [] });
    }
  });

  it("are committed as what the sketcher makes now (run `npm run presets` after changing them)", () => {
    for (const preset of PRESETS) {
      const file = exampleFiles[`../../../contracts/planet-spec/examples/${preset.id}.json`];
      expect(file, preset.id).toBe(specFileText(sketchPlanet(preset.inputs, "preset")));
    }
  });

  it("every committed example passes the spec check", () => {
    expect(Object.keys(exampleFiles).length).toBeGreaterThanOrEqual(6);
    for (const [path, text] of Object.entries(exampleFiles)) {
      expect(checkSpec(JSON.parse(text)), path).toMatchObject({ ok: true, warnings: [] });
    }
  });
});
