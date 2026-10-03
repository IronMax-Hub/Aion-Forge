// The world sketcher: turns a few inputs (SketchInputs) into a Planet Spec,
// for the presets and the form. Planets from Aion Forge never pass through it.
//
// Why it exists: Planet Forge must run on its own, and the spec's surface is a
// set of cells, which nobody types in by hand.
//
// It is authored, not simulated. It places continents, water, temperature and
// moisture by the rules below so that the planet looks like a plausible whole;
// it does not evolve one, and it has no history or feedback. Anything more
// belongs in Aion Forge.
//
// How, cell by cell on a level-3 icosphere (642 cells, icosphere.ts):
// - Heights. Seeded fBm over the sphere, stretched so the lowest to the highest
//   cell spans the relief input divided by gravity: lower gravity, taller
//   mountains, as in Aion Forge's geography.
// - Sea level. The height that puts exactly the ocean share of the cells under
//   water (the cells are almost equal in area, so a share of cells is close to
//   a share of the surface).
// - Temperature. The mean, times one plus a pattern that averages to zero over
//   the sphere: warmer at the equator and colder at the poles (1/3 − y²) on a
//   spinning world; hot under the star and cold on the far side (x) on a locked
//   one. Its strength is a share of the mean, shrinking as the air thickens,
//   since thick air carries heat around: an Earth-like world gets about 40 K
//   from equator to pole, Venus's 90 bar almost none, an airless locked lava
//   world 280 K on its night side to 2,500 K under its star. Above sea level it
//   is 6.5 K colder per km where there is air. Axial tilt is not used: this is
//   the yearly mean.
// - Kind. Under the sea: water; ice below freezing; dry land above boiling.
//   Above the sea: ice below freezing if the planet has water at all; else land.
// - Moisture. 1 on open water; on land and ice it halves with each cell from
//   open water (0.5 on a coast), and fades to 0 from 20 K above freezing down to
//   freezing. 0 everywhere without open water.
//
// Deterministic in every browser: icosphere and noise use exact arithmetic;
// logarithms and powers come from detmath.ts.

import type { PlanetSpec, SpecCell } from "../spec/schema";
import { CELL_KIND } from "../spec/schema";
import type { SketchInputs } from "./inputs";
import { boilingK, freezingK, orbitalPeriodYears, starMassSolar, starRadiusSolar, surfaceGravityG } from "./inputs";
import { icosphere, SKETCH_LEVEL } from "./icosphere";
import { fbm } from "./noise";

// Continents: the noise's lowest frequency (features per unit of the sphere's radius) and its octaves
const CONTINENT_FREQUENCY = 1.2;
const CONTINENT_OCTAVES = 4;
// Temperature contrast, as a share of the mean, for airless worlds; halved at 2 bar
const SPINNING_CONTRAST = 0.2;
const LOCKED_CONTRAST = 0.8;
const CONTRAST_HALVING_PER_BAR = 0.5;
/** Earth's standard lapse rate, K per km. */
const LAPSE_K_PER_KM = 6.5;
/** Air thinner than this does not cool with height. */
const MIN_AIR_FOR_LAPSE_BAR = 0.01;
/** No cell is colder than this, K. */
const MIN_TEMPERATURE_K = 30;
/** Moisture fades out over this many K above freezing. */
const MOISTURE_WARMTH_K = 20;
const HOURS_PER_YEAR = 8766;
/** Gas shares below this are left out. */
const TRACE_SHARE = 1e-6;

/** Rounds to `places` decimals (Math.round is exact). */
function round(value: number, places: number): number {
  const scale = places === 1 ? 10 : places === 2 ? 100 : places === 3 ? 1_000 : 10_000;
  return Math.round(value * scale) / scale;
}

function clamp01(x: number): number {
  return Math.min(1, Math.max(0, x));
}

/** Gas shares from the inputs' relative amounts, with ozone's share from its ppm, adding up to 1; none if the planet has no air. */
function gasShares(inputs: SketchInputs): PlanetSpec["air"]["gases"] {
  const entries = Object.entries(inputs.air.gases).filter(([, amount]) => amount > 0);
  const total = entries.reduce((sum, [, amount]) => sum + amount, 0);
  if (inputs.air.pressureBar <= 0 || total <= 0) return {};
  // Ozone to the part per billion (it is far below the others' 4-decimal shares); the rest share what is left
  const ozone = Math.round(inputs.air.ozonePpm * 1000) / 1e9;
  const shares = entries.map(([gas, amount]) => [gas, (amount / total) * (1 - ozone)] as const).filter(([, share]) => share >= TRACE_SHARE);
  const gases: PlanetSpec["air"]["gases"] = Object.fromEntries(shares.map(([gas, share]) => [gas, round(share, 4)]));
  if (ozone > 0) gases.O3 = ozone;
  return gases;
}

/** The sea level that puts `share` of these heights under water: halfway between the last cell under and the first above (cells of equal height stay on one side, so the share can be off by those). */
export function seaLevelFor(heights: readonly number[], share: number): number {
  const sorted = [...heights].sort((a, b) => a - b);
  const under = Math.round(clamp01(share) * sorted.length);
  if (under === 0) return sorted[0] - 1;
  if (under === sorted.length) return sorted[sorted.length - 1] + 1;
  return (sorted[under - 1] + sorted[under]) / 2;
}

/** Sketches a Planet Spec from inputs. `source` says whether they are a preset's, unchanged, or your own. */
export function sketchPlanet(inputs: SketchInputs, source: "preset" | "custom"): PlanetSpec {
  const { points, neighbours } = icosphere(SKETCH_LEVEL);
  const gravity = surfaceGravityG(inputs.body.massEarth, inputs.body.radiusEarth);
  const freezing = freezingK();
  const boiling = boilingK(inputs.air.pressureBar);

  // Heights: the noise stretched to the relief, divided by gravity
  const noise = points.map((p) => fbm(inputs.seed | 0, p, CONTINENT_FREQUENCY, CONTINENT_OCTAVES));
  const low = Math.min(...noise);
  const span = Math.max(...noise) - low;
  const reliefKm = inputs.surface.reliefKm / gravity;
  // Rounded as the spec stores them before the sea fills them, so stored heights and kinds always agree
  // To the metre: coarser rounding ties neighbouring heights and moves cells across the sea level
  const heights = noise.map((n) => round(span > 0 ? ((n - low) / span - 0.5) * reliefKm : 0, 3));
  const seaLevel = round(seaLevelFor(heights, inputs.surface.oceanShare), 4);

  // Temperatures
  const locked = inputs.body.tidallyLocked;
  const contrast = (locked ? LOCKED_CONTRAST : SPINNING_CONTRAST) / (1 + CONTRAST_HALVING_PER_BAR * inputs.air.pressureBar);
  const lapse = inputs.air.pressureBar >= MIN_AIR_FOR_LAPSE_BAR ? LAPSE_K_PER_KM : 0;
  const temperatures = points.map(([x, y], i) => {
    const pattern = locked ? x : 1 / 3 - y * y;
    const aboveSea = Math.max(0, heights[i] - seaLevel);
    return Math.max(MIN_TEMPERATURE_K, inputs.surface.meanTemperatureK * (1 + contrast * pattern) - lapse * aboveSea);
  });

  // Kinds
  const hasWater = inputs.surface.oceanShare > 0;
  const kinds = heights.map((h, i) => {
    const t = temperatures[i];
    if (h < seaLevel) return t < freezing ? CELL_KIND.ice : t > boiling ? CELL_KIND.land : CELL_KIND.water;
    return hasWater && t < freezing ? CELL_KIND.ice : CELL_KIND.land;
  });
  const steam = hasWater && heights.every((h, i) => h >= seaLevel || temperatures[i] > boiling);

  // Moisture: cells from open water, breadth first
  const distance = kinds.map((k) => (k === CELL_KIND.water ? 0 : Infinity));
  const queue = distance.flatMap((d, i) => (d === 0 ? [i] : []));
  for (let q = 0; q < queue.length; q++) {
    for (const n of neighbours[queue[q]]) {
      if (distance[n] === Infinity) {
        distance[n] = distance[queue[q]] + 1;
        queue.push(n);
      }
    }
  }
  const moisture = distance.map((d, i) => {
    if (d === 0) return 1;
    if (d === Infinity) return 0;
    let m = 1;
    for (let s = 0; s < d; s++) m /= 2;
    return m * clamp01((temperatures[i] - freezing) / MOISTURE_WARMTH_K);
  });

  const cells: SpecCell[] = points.map(([x, y, z], i) => [
    round(x, 4), round(y, 4), round(z, 4),
    heights[i], round(temperatures[i], 1), round(moisture[i], 2), kinds[i],
  ]);

  const starMass = starMassSolar(inputs.star.luminositySolar);
  const year = orbitalPeriodYears(inputs.orbit.distanceAU, starMass);
  const spec: PlanetSpec = {
    specVersion: 1,
    source,
    name: inputs.name,
    seed: inputs.seed >>> 0,
    star: {
      temperatureK: inputs.star.temperatureK,
      luminositySolar: inputs.star.luminositySolar,
      radiusSolar: round(starRadiusSolar(inputs.star.temperatureK, inputs.star.luminositySolar), 4),
    },
    orbit: { distanceAU: inputs.orbit.distanceAU, periodYears: round(year, 4) },
    body: {
      radiusEarth: inputs.body.radiusEarth,
      massEarth: inputs.body.massEarth,
      gravityG: round(gravity, 4),
      // A locked world turns once a year
      rotationHours: locked ? round(year * HOURS_PER_YEAR, 1) : inputs.body.rotationHours,
      tidallyLocked: locked,
      axialTiltDeg: inputs.body.axialTiltDeg,
    },
    air: { pressureBar: inputs.air.pressureBar, gases: gasShares(inputs), cloudCover: inputs.air.cloudCover },
    surface: { cells, seaLevelKm: seaLevel, freezingK: freezing, boilingK: round(boiling, 2), steam },
  };
  if (inputs.groundCover && inputs.groundCover.cover > 0) {
    spec.groundCover = {
      cover: inputs.groundCover.cover,
      colourLinear: inputs.groundCover.colourLinear.map((c) => round(c, 4)) as [number, number, number],
    };
  }
  return spec;
}
