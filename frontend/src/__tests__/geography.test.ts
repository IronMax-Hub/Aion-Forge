import { describe, it, expect } from "vitest";
import {
  buildGeography, surfaceGrid, seaLevelFor, areaBelow, hasSolidSurface, waterDepthKm, BAND_COUNT,
} from "../simulation/geography";
import type { Geography } from "../simulation/geography";
import { derivePhysics } from "../simulation/planetPhysics";
import type { PlanetPhysics } from "../simulation/planetPhysics";
import { generatePlanetsFor, planetKey } from "../simulation/planet";
import type { Planet } from "../simulation/planet";
import { generateStarsFor, UNIVERSE_AGE_GYR } from "../simulation/star";
import { buildGalaxyConfig } from "../simulation/galaxy";
import { makeConfig } from "../simulation/config";

function planet(overrides: Partial<Planet> = {}): Planet {
  const hostStarId = overrides.hostStarId ?? 1;
  return {
    id: 2, key: planetKey(hostStarId, 2), hostStarId, orbitalRadius: 1, orbitalIndex: 2, type: "rocky",
    size: 1, mass: 1, temperature: 288, atmosphere: "moderate", formationAtmosphere: "moderate", resourceAbundance: 0.5,
    habitabilityScore: 0.8, isRare: false, surface: null, life: null, worldEvents: [], everLiquidWater: false, ...overrides,
  };
}

function physics(overrides: Partial<PlanetPhysics> = {}): PlanetPhysics {
  return {
    surfaceGravity: 1, escapeVelocityKms: 11.2, surfacePressureBar: 1, tidallyLocked: false,
    orbitalPeriodYears: 1, rotationPeriodHours: 24, axialTiltDeg: 23, snowLineAU: 2.3, waterInventory: 0.08,
    ...overrides,
  };
}

/** The same Earth-like planet around many different stars. */
function earths(count: number, overrides: Partial<PlanetPhysics> = {}, planetOverrides: Partial<Planet> = {}): Geography[] {
  return Array.from({ length: count }, (_, starId) =>
    buildGeography(planet({ hostStarId: starId, ...planetOverrides }), physics(overrides), 42));
}

const median = (values: number[]) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
const sum = (values: ArrayLike<number>) => Array.from(values).reduce((a, b) => a + b, 0);

describe("surface grid", () => {
  const grid = surfaceGrid();

  it("is a level-3 icosphere of 642 cells whose areas cover the sphere", () => {
    expect(grid.positions).toHaveLength(642);
    expect(sum(grid.areas)).toBeCloseTo(1, 12);
    for (const a of grid.areas) {
      expect(a * 642).toBeGreaterThan(0.7);
      expect(a * 642).toBeLessThan(1.3);
    }
  });

  it("gives twelve cells five neighbours and every other cell six, symmetrically", () => {
    const counts = grid.neighbours.map((n) => n.length);
    expect(counts.filter((c) => c === 5)).toHaveLength(12);
    expect(counts.filter((c) => c === 6)).toHaveLength(630);
    grid.neighbours.forEach((list, i) => { for (const j of list) expect(grid.neighbours[j]).toContain(i); });
  });

  it("splits the sphere into 18 bands of 10° with the areas spherical geometry predicts", () => {
    const bandArea = new Array(BAND_COUNT).fill(0);
    grid.bandOfCell.forEach((band, i) => { bandArea[band] += grid.areas[i]; });
    bandArea.forEach((area, k) => {
      const exact = (Math.cos((k * Math.PI) / 18) - Math.cos(((k + 1) * Math.PI) / 18)) / 2;
      expect(Math.abs(area / exact - 1)).toBeLessThan(0.1);
    });
  });
});

describe("sea level", () => {
  const hypsometry = { elevationsKm: Float64Array.from([-4, -2, 0, 1]), areas: Float64Array.from([0.25, 0.25, 0.25, 0.25]) };

  it("fills the lowest cells first, and holds exactly the water given", () => {
    expect(seaLevelFor(hypsometry, 0)).toBe(-4);
    expect(seaLevelFor(hypsometry, 0.25)).toBe(-3);   // a quarter of the planet, 1 km deep
    expect(seaLevelFor(hypsometry, 1.5)).toBe(0);     // −4→0 and −2→0: 0.25·4 + 0.25·2
    expect(areaBelow(hypsometry, seaLevelFor(hypsometry, 1.5))).toBe(0.5);
  });

  it("covers the whole planet when the water is deeper than every cell", () => {
    const level = seaLevelFor(hypsometry, 10);
    expect(level).toBeGreaterThan(1);
    expect(areaBelow(hypsometry, level)).toBe(1);
  });
});

describe("geography of a planet", () => {
  it("is deterministic and differs between planets", () => {
    const a = buildGeography(planet(), physics(), 42);
    expect(buildGeography(planet(), physics(), 42)).toEqual(a);
    expect(buildGeography(planet({ hostStarId: 2 }), physics(), 42).elevationKm).not.toEqual(a.elevationKm);
    expect(buildGeography(planet(), physics(), 43).elevationKm).not.toEqual(a.elevationKm);
  });

  it("has no surface for giant planets", () => {
    expect(hasSolidSurface(planet({ mass: 15 }))).toBe(true);
    expect(hasSolidSurface(planet({ mass: 16 }))).toBe(false);
    expect(() => buildGeography(planet({ mass: 16 }), physics(), 42)).toThrow(RangeError);
  });

  it("holds the planet's water below sea level", () => {
    for (const g of earths(20, { waterInventory: 0.2 })) {
      let volume = 0;
      g.hypsometry.elevationsKm.forEach((h, k) => { volume += g.hypsometry.areas[k] * Math.max(0, g.seaLevelKm - h); });
      expect(volume).toBeCloseTo(g.waterDepthKm, 9);
    }
  });

  it("has no ocean without water", () => {
    for (const g of earths(20, { waterInventory: 0 })) {
      expect(g.oceanFraction).toBe(0);
      for (const band of g.bands) expect(band.landFraction).toBe(1);
    }
  });

  it("never loses ocean as water rises", () => {
    for (let starId = 0; starId < 20; starId++) {
      let previous = 0;
      for (let w = 0; w <= 1; w += 0.02) {
        const ocean = buildGeography(planet({ hostStarId: starId }), physics({ waterInventory: w }), 42).oceanFraction;
        expect(ocean).toBeGreaterThanOrEqual(previous);
        previous = ocean;
      }
    }
  });

  it("drowns a wet planet into an ocean world", () => {
    for (const g of earths(20, { waterInventory: 1 })) expect(g.oceanFraction).toBe(1);
  });

  it("gives an Earth-like planet an Earth-like ocean", () => {
    const oceans = earths(200).map((g) => g.oceanFraction);
    expect(median(oceans)).toBeGreaterThan(0.6);
    expect(median(oceans)).toBeLessThan(0.85);
  });

  it("scales relief with 1 / g", () => {
    const one = buildGeography(planet(), physics(), 42);
    const two = buildGeography(planet(), physics({ surfaceGravity: 2 }), 42);
    two.elevationKm.forEach((h, i) => expect(h * 2).toBe(one.elevationKm[i]));
    expect(two.waterDepthKm).toBe(2 * one.waterDepthKm);   // the same water over a smaller area per unit mass
  });

  it("gives larger planets more plates, always 6 to 14", () => {
    const small = earths(100, {}, { size: 0.4, mass: 0.1 }).map((g) => g.plateCount);
    const large = earths(100, {}, { size: 2.2, mass: 10 }).map((g) => g.plateCount);
    for (const n of [...small, ...large]) { expect(n).toBeGreaterThanOrEqual(6); expect(n).toBeLessThanOrEqual(14); }
    expect(sum(large) / 100).toBeGreaterThan(sum(small) / 100 + 2);
  });

  it("builds more continental crust on planets that start with more tectonic activity", () => {
    const share = (gs: Geography[]) => sum(gs.map((g) => g.continentalPlates)) / sum(gs.map((g) => g.plateCount));
    const tiny = share(earths(200, {}, { mass: 0.05, size: 0.45 }));
    const earthMass = share(earths(200));
    expect(earthMass).toBeGreaterThan(0.3);
    expect(earthMass).toBeLessThan(0.5);
    expect(tiny).toBeLessThan(earthMass * 0.4);
  });

  it("measures bands from the spin axis, or from the substellar point when locked", () => {
    expect(buildGeography(planet(), physics(), 42).bandAxis).toBe("spin");
    expect(buildGeography(planet(), physics({ tidallyLocked: true }), 42).bandAxis).toBe("substellar");
  });
});

describe("band summary", () => {
  const seed = 100000;
  const config = makeConfig(seed);
  const stars = generateStarsFor(buildGalaxyConfig(seed, config), UNIVERSE_AGE_GYR, config).stars.slice(0, 300);
  const geographies = stars.flatMap((s) => generatePlanetsFor(s, seed, config).planets
    .filter(hasSolidSurface)
    .map((p) => buildGeography(p, derivePhysics(p, s, seed, config), seed)));

  it("has 18 bands whose areas cover the planet", () => {
    expect(geographies.length).toBeGreaterThan(500);
    for (const g of geographies) {
      expect(g.bands).toHaveLength(18);
      expect(sum(g.bands.map((b) => b.area))).toBeCloseTo(1, 12);
    }
  });

  it("gives band land fractions that, summed by area, equal the grid's land fraction", () => {
    for (const g of geographies) {
      const land = sum(g.bands.map((b) => b.area * b.landFraction));
      expect(land).toBeCloseTo(1 - g.oceanFraction, 12);
    }
  });

  it("keeps each band's elevations sorted, and together they are the whole grid", () => {
    for (const g of geographies.slice(0, 50)) {
      const all: number[] = [];
      for (const band of g.bands) {
        const h = band.hypsometry.elevationsKm;
        for (let k = 1; k < h.length; k++) expect(h[k]).toBeGreaterThanOrEqual(h[k - 1]);
        all.push(...h);
      }
      expect(Float64Array.from(all).sort()).toEqual(g.hypsometry.elevationsKm);
      expect(Array.from(g.elevationKm).sort((a, b) => a - b)).toEqual(Array.from(g.hypsometry.elevationsKm));
    }
  });

  it("refills each band from the global sea level for any amount of water", () => {
    const g = geographies[0];
    for (const depth of [0.5, 2, 8]) {
      const level = seaLevelFor(g.hypsometry, depth);
      const oceanByBands = sum(g.bands.map((b) => areaBelow(b.hypsometry, level)));
      expect(oceanByBands).toBeCloseTo(areaBelow(g.hypsometry, level), 12);
    }
  });

  it("converts water to depth through gravity", () => {
    expect(waterDepthKm(0.08, 1)).toBeCloseTo(2.7, 12);
    expect(waterDepthKm(0.08, 2)).toBeCloseTo(5.4, 12);
  });
});
