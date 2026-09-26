import { describe, it, expect } from "vitest";
import * as THREE from "three";
import { generatePlanetsFor, solidWorldOf, GIANT_PLANET_MASS } from "../simulation/planet";
import type { Planet, SolidWorld } from "../simulation/planet";
import { generateStarsFor, UNIVERSE_AGE_GYR } from "../simulation/star";
import type { Star } from "../simulation/star";
import { buildGalaxyConfig } from "../simulation/galaxy";
import { makeConfig } from "../simulation/config";
import { surfaceGrid } from "../simulation/geography";
import { FREEZING_K, SURFACE_KIND } from "../simulation/climate";
import {
  buildSurfaceMap, sampleSurfaceMap, surfaceMapTexture, directionAt,
  SURFACE_MAP_CHANNELS, SURFACE_MAP_WIDTH, SURFACE_MAP_HEIGHT,
} from "../rendering/planet/surfaceMap";
import type { SurfaceMapData } from "../rendering/planet/surfaceMap";

// Worlds Up Close A5: the globe is drawn from the simulation's own cells.

const seed = 100000;
const config = makeConfig(seed);
const stars = generateStarsFor(buildGalaxyConfig(seed, config), UNIVERSE_AGE_GYR, config).stars.slice(0, 25);
const solid: { star: Star; planet: Planet }[] = stars.flatMap((star) =>
  generatePlanetsFor(star, seed, config).planets
    .filter((planet) => planet.mass <= GIANT_PLANET_MASS)
    .map((planet) => ({ star, planet })));

// A few planets with coastlines, ice and dry land between them
const worlds: { planet: Planet; world: SolidWorld; map: SurfaceMapData }[] = solid
  .filter(({ planet }) => planet.surface!.oceanFraction > 0.05 && planet.surface!.oceanFraction < 0.95)
  .slice(0, 6)
  .map(({ star, planet }) => {
    const world = solidWorldOf(planet, star, seed, config);
    return { planet, world, map: buildSurfaceMap(world.geography, world.history.present) };
  });

/** A map as the GPU holds it: every value rounded to half precision. */
function asUploaded(map: SurfaceMapData): SurfaceMapData {
  const texture = surfaceMapTexture(map);
  const half = texture.image.data as Uint16Array;
  texture.dispose();
  return { ...map, data: Float32Array.from(half, (h) => THREE.DataUtils.fromHalfFloat(h)) };
}

describe("solid worlds for the planet view", () => {
  it("rebuild exactly the surface the planet was generated with", () => {
    for (const { star, planet } of solid.slice(0, 25)) {
      const { history } = solidWorldOf(planet, star, seed, config);
      expect(history.present.oceanFraction).toBe(planet.surface!.oceanFraction);
      expect(history.present.meanK).toBe(planet.temperature);
      expect(history.final.pressureBar).toBe(planet.surface!.pressureBar);
    }
  });
});

describe("surface map", () => {
  it("is a 512 × 256 image with four channels", () => {
    expect(worlds.length).toBeGreaterThanOrEqual(3);
    const { map } = worlds[0];
    expect([map.width, map.height]).toEqual([SURFACE_MAP_WIDTH, SURFACE_MAP_HEIGHT]);
    expect(map.data.length).toBe(512 * 256 * 4);
    expect(map.data.every(Number.isFinite)).toBe(true);
  });

  it("reproduces the simulation's land/ocean flag at every cell centre", () => {
    const { positions } = surfaceGrid();
    for (const { world, map } of worlds) {
      const uploaded = asUploaded(map);
      let ocean = 0;
      positions.forEach((p, i) => {
        const submerged = sampleSurfaceMap(uploaded, p, SURFACE_MAP_CHANNELS.submerged) > 0.5;
        expect(submerged).toBe(world.history.present.cellSubmerged[i] === 1);
        if (submerged) ocean++;
      });
      expect(ocean).toBeGreaterThan(0);
      expect(ocean).toBeLessThan(positions.length);
    }
  });

  it("reproduces each cell's ice, open water and land from its temperature", () => {
    const { positions } = surfaceGrid();
    for (const { world, map } of worlds) {
      const { present } = world.history;
      const uploaded = asUploaded(map);
      positions.forEach((p, i) => {
        const t = sampleSurfaceMap(uploaded, p, SURFACE_MAP_CHANNELS.temperatureK);
        expect(t).toBeCloseTo(present.cellTemperatureK[i], -0.5);   // within ~1.5 K after filtering and half precision
        if (Math.abs(present.cellTemperatureK[i] - FREEZING_K) < 2) return;
        const submerged = sampleSurfaceMap(uploaded, p, SURFACE_MAP_CHANNELS.submerged) > 0.5;
        // The shader's rule: frozen water is ice, frozen land is snow as far as the planet is wet
        const kind = t < FREEZING_K
          ? (submerged || present.wetness >= 0.5 ? SURFACE_KIND.ice : SURFACE_KIND.land)
          : (submerged ? SURFACE_KIND.ocean : SURFACE_KIND.land);
        expect(kind).toBe(present.cellSurface[i]);
      });
    }
  });

  it("passes through each cell's elevation, and is smooth between cells", () => {
    const { positions } = surfaceGrid();
    const { world, map } = worlds[0];
    positions.forEach((p, i) => {
      const e = sampleSurfaceMap(map, p, SURFACE_MAP_CHANNELS.elevationKm);
      expect(e).toBeCloseTo(world.geography.elevationKm[i] - world.history.present.seaLevelKm, 0);
    });
    // Neighbouring texels (0.7° apart) change by a small share of the steepest step between neighbouring cells (~8°):
    // a gap in the weighting would jump by a whole step
    const { neighbours } = surfaceGrid();
    const relative = (i: number) => world.geography.elevationKm[i] - world.history.present.seaLevelKm;
    let steepest = 0;
    neighbours.forEach((list, i) => { for (const j of list) steepest = Math.max(steepest, Math.abs(relative(i) - relative(j))); });
    let jump = 0;
    for (let row = 20; row < map.height - 20; row++) {
      for (let column = 0; column < map.width; column++) {
        const here = map.data[(row * map.width + column) * 4];
        const next = map.data[(row * map.width + (column + 1) % map.width) * 4];
        jump = Math.max(jump, Math.abs(next - here));
      }
    }
    expect(jump).toBeLessThan(0.3 * steepest);
  });

  it("lays latitude along the band axis", () => {
    // The map's pole is the grid's band axis: the top row sees the cells nearest the axis
    const { axisCos } = surfaceGrid();
    const top = directionAt(0, Math.PI / 2 - 1e-9);
    const axisCell = axisCos.indexOf(Math.max(...axisCos));
    const { positions } = surfaceGrid();
    expect(top[0] * positions[axisCell][0] + top[1] * positions[axisCell][1] + top[2] * positions[axisCell][2]).toBeGreaterThan(0.98);
  });

  it("is quick enough to build on approach", () => {
    const { world } = worlds[0];
    buildSurfaceMap(world.geography, world.history.present);
    const start = performance.now();
    buildSurfaceMap(world.geography, world.history.present);
    expect(performance.now() - start).toBeLessThan(250);
  });
});
