// Climate of a solid planet (Worlds Up Close, phase A2b).
//
// Why it exists: a planet's temperature, ice and open water must follow from
// its star, its air and its surface, and must be able to change as those
// change. This is the energy balance the world history loop solves at every
// step on 18 bands, and once more on all 642 cells for the present day (R5).
//
// How:
// - Equilibrium temperature. T_eq = 278 K · (L / a²)^¼ · (1 − albedo)^¼: the
//   physical form, so Earth (albedo 0.3) gets 255 K and its greenhouse must
//   supply 33 K (owner decision; the plan's formula normalised 278 K to albedo 0.3).
// - Greenhouse. A dry part, base(pressure) + S_CO₂ · log₂(CO₂ / CO₂_ref)
//   + S_CH₄ · √CH₄, amplified by water vapour: warmer air holds more vapour,
//   which warms it further. Taken as linear in the warming, the vapour term
//   solves to dry / (1 − γ · wetness). With γ = 0.5 a doubling of CO₂ warms a
//   wet planet by 3 K, Earth's climate sensitivity. A dry planet gets no vapour.
//   The vapour reads the water inventory, not the temperature: reading it from
//   the mean temperature (decision 39) made Earth-like worlds cycle between
//   snowballs and moist greenhouses, so it is deferred (owner, 18 Oct 2026).
// - Energy balance (IH2). Starlight and heat from inside together:
//   T_eff⁴ = T_eq⁴ + T_int⁴, and T_mean = T_eff · (1 + G / 255 K): the
//   greenhouse multiplies the energy the air holds (a grey atmosphere's surface
//   is proportional to its effective temperature), anchored on Earth. The same
//   90 bar keeps a world at 1 AU hot and leaves one at 25 AU frozen.
// - Albedo. Effective (cloud-including) albedos for open ocean, bare land and
//   ice, mixed by area. Ice raises the albedo, which cools, which makes more ice.
// - Heat transport (the original A2 rule). T = T_mean + ΔT · (S / S_mean − 1)
//   · T_eq⁴ / T_eff⁴, ΔT = ΔT_max · (1 − redistribution(pressure)): thin air
//   keeps sharp contrasts, thick air evens them out; only starlight is uneven.
// - Insolation. Annual mean with axial tilt for a rotating planet, in the
//   standard two-term form S = 1 + s₂(ε) · P₂(sin latitude); or 4 · cos(angle
//   from the substellar point) on the day side of a locked planet, 0 at night.
//   Both average to 1 over the sphere.
// - Ice. A region is ice below 263 K. Each solve starts from the previous ice
//   cover and repeats until the cover stops changing, so a planet can have two
//   stable states (open and frozen) for the same star and air.
// - Water phase. Liquid up to the boiling point set by total pressure
//   (Clausius–Clapeyron, capped at water's critical point). Below 1 atm the
//   curve passes through water's triple point; below the triple point's
//   pressure there is no liquid at all: water is ice, or vapour above 273.16 K
//   (decision 27, with escape, AE2).
// - Runaway greenhouse. A wet planet's air can radiate at most about 282 W/m²
//   (the Simpson–Nakajima limit; Goldblatt et al. 2013): water vapour blocks
//   more as it warms. A planet that absorbs more than that, starlight and
//   interior heat together, cannot balance with liquid oceans, whatever its
//   mean temperature: its oceans boil into the air. In this model's terms that
//   is an effective temperature above RUNAWAY_EFFECTIVE_K, about 266 K (Earth's
//   is 255 K), which puts an Earth twin's inner edge near 0.92 AU.
//
// Assumptions and limits:
// - One mean temperature per region; no seasons, no day–night cycle on a
//   rotating planet, no ocean currents beyond the redistribution rule.
// - The linear heat-transport rule can push a dark night side below absolute
//   zero on an airless world; temperatures are floored at the interior's own
//   temperature, the heat from inside that is left there (IH2).
// - Saturation pressures (water, CO₂) follow Clausius–Clapeyron from each
//   gas's triple point with one latent heat per phase; CO₂ above its triple
//   point reads about 15% below measured values.
// - Clouds are folded into the effective albedos and do not respond to climate.
// - The two-term insolation profile is approximate: at zero tilt the poles get
//   0.375 of the mean, where the exact value is 0.

import { cos, exp, log, pow } from "./detmath";
import type { Geography } from "./geography";
import { BAND_COUNT, surfaceGrid } from "./geography";
import { heatFlowAt, ICE_SHELL_BASE_K, iceShellKm } from "./interiorHeat";

// ── Constants ─────────────────────────────────────────────────────────────────

/** Water freezes below this (K); sea ice and snow form. */
export const FREEZING_K = 263;

// Effective albedos, including clouds, chosen so Earth's mix comes out near 0.3
export const ALBEDO = { ocean: 0.28, land: 0.32, ice: 0.62 };

// Greenhouse: Earth (1 bar, CO₂ at reference, wet) gets 33 K
export const GREENHOUSE_BASE_K = 16.5;           // dry, per √bar of total pressure
export const CO2_REFERENCE_BAR = 2.8e-4;  // pre-industrial Earth
const CO2_FLOOR_BAR = 1e-7;               // below this the log term stops falling
export const GREENHOUSE_PER_CO2_DOUBLING_K = 1.5; // dry; 3 K with water vapour
export const GREENHOUSE_PER_SQRT_CH4_K = 150;    // dry; 1,000 ppm of methane gives ~9 K with vapour
export const VAPOUR_FEEDBACK = 0.5;
/** Earth's equilibrium temperature: the greenhouse warms by G at this effective temperature and in proportion elsewhere (IH2), K. */
export const GREENHOUSE_REFERENCE_K = 255;

// Heat transport: airless contrast, and the pressure that halves it
export const CONTRAST_MAX_K = 150;
export const REDISTRIBUTION_HALF_BAR = 0.5;

// Boiling point: Clausius–Clapeyron for water, L/R ≈ 4,895 K above 1 atm; below it,
// L/R = 5,209 K, so the curve passes through the triple point (decision 27)
const BOILING_K_AT_1_ATM = 373.15;
const ONE_ATM_BAR = 1.01325;
const WATER_LATENT_OVER_R_K = 4895;
export const WATER_LATENT_OVER_R_BELOW_1_ATM_K = 5209;
/** Water's triple point: below this pressure no liquid water can exist. */
export const WATER_TRIPLE_POINT = { K: 273.16, bar: 0.006117 } as const;
export const WATER_CRITICAL_K = 647;

// Saturation (Clausius–Clapeyron): the gas constant, and each gas's latent heats
/** The gas constant, J/(mol·K). */
export const GAS_CONSTANT = 8.314;
const WATER_VAPORIZATION_J_PER_MOL = 44_000; // over liquid
const WATER_SUBLIMATION_J_PER_MOL = 51_100;  // over ice
/** CO₂'s triple point; above its critical temperature it cannot condense (decision 28). */
export const CO2_TRIPLE_POINT = { K: 216.58, bar: 5.185 } as const;
export const CO2_CRITICAL_K = 304.13;
const CO2_SUBLIMATION_J_PER_MOL = 26_100;   // over ice: 1 atm at 195 K
const CO2_VAPORIZATION_J_PER_MOL = 15_300;  // over liquid

/** The most a moist atmosphere can radiate, W/m² (Goldblatt et al. 2013). */
export const RUNAWAY_LIMIT_W_PER_M2 = 282;
/** The Stefan–Boltzmann constant, W/(m²·K⁴). */
const STEFAN_BOLTZMANN = 5.670e-8;
/** The effective temperature at which a planet absorbs RUNAWAY_LIMIT_W_PER_M2: above it, oceans cannot stay liquid, K. */
export const RUNAWAY_EFFECTIVE_K = pow(RUNAWAY_LIMIT_W_PER_M2 / STEFAN_BOLTZMANN, 0.25);

const MAX_ICE_ITERATIONS = 30;
const LN2 = 0.6931471805599453;

// ── Building blocks ───────────────────────────────────────────────────────────

/** Blackbody temperature of a planet absorbing (1 − albedo) of its star's light, K. */
/** A zero-albedo blackbody's temperature at 1 AU from 1 L☉, K. */
export const EQUILIBRIUM_K_AT_1_AU = 278;

export function equilibriumTemperatureK(luminosity: number, orbitAU: number, albedo: number): number {
  return EQUILIBRIUM_K_AT_1_AU * pow((Math.max(1e-4, luminosity) * (1 - albedo)) / (orbitAU * orbitAU), 0.25);
}

/** Warming by the atmosphere at Earth's effective temperature, K. `wetness` (0–1) is how much surface water can feed vapour. */
export function greenhouseK(pressureBar: number, co2Bar: number, ch4Bar: number, wetness: number): number {
  const co2Doublings = log(Math.max(CO2_FLOOR_BAR, co2Bar) / CO2_REFERENCE_BAR) / LN2;
  const dry = GREENHOUSE_BASE_K * Math.sqrt(pressureBar)
    + GREENHOUSE_PER_CO2_DOUBLING_K * co2Doublings
    + GREENHOUSE_PER_SQRT_CH4_K * Math.sqrt(ch4Bar);
  return Math.max(0, dry) / (1 - VAPOUR_FEEDBACK * wetness);
}

/** Saturation vapour pressure, bar, from one anchor point and a latent heat (Clausius–Clapeyron). */
export function saturationBar(temperatureK: number, anchorK: number, anchorBar: number, latentJPerMol: number): number {
  return anchorBar * exp((latentJPerMol / GAS_CONSTANT) * (1 / anchorK - 1 / temperatureK));
}

/** Water's saturation vapour pressure, bar: over liquid above the triple point, over ice below. */
export function waterSaturationBar(temperatureK: number): number {
  const latent = temperatureK >= WATER_TRIPLE_POINT.K ? WATER_VAPORIZATION_J_PER_MOL : WATER_SUBLIMATION_J_PER_MOL;
  return saturationBar(temperatureK, WATER_TRIPLE_POINT.K, WATER_TRIPLE_POINT.bar, latent);
}

/** CO₂'s saturation pressure, bar: over ice below its triple point, over liquid above; none above its critical point. */
export function co2SaturationBar(temperatureK: number): number {
  if (temperatureK >= CO2_CRITICAL_K) return Infinity;
  const latent = temperatureK >= CO2_TRIPLE_POINT.K ? CO2_VAPORIZATION_J_PER_MOL : CO2_SUBLIMATION_J_PER_MOL;
  return saturationBar(temperatureK, CO2_TRIPLE_POINT.K, CO2_TRIPLE_POINT.bar, latent);
}

/** The effective temperature of starlight plus heat from inside, K: (T_eq⁴ + T_int⁴)^¼. */
export function effectiveTemperatureK(eqK: number, intK: number): number {
  return pow(eqK * eqK * eqK * eqK + intK * intK * intK * intK, 0.25);
}

/** Mean surface temperature from starlight, heat from inside and a greenhouse warming, K (IH2). */
export function surfaceMeanK(eqK: number, intK: number, warmingK: number): number {
  return effectiveTemperatureK(eqK, intK) * (1 + warmingK / GREENHOUSE_REFERENCE_K);
}



/** Temperature difference between the most and least lit regions per unit of insolation, K. */
export function contrastK(pressureBar: number): number {
  return CONTRAST_MAX_K * (REDISTRIBUTION_HALF_BAR / (pressureBar + REDISTRIBUTION_HALF_BAR));
}

/** Boiling point of water at a total surface pressure, K. */
export function boilingPointK(pressureBar: number): number {
  // Below the triple point's pressure no liquid exists: water above its temperature is vapour
  if (pressureBar < WATER_TRIPLE_POINT.bar) return WATER_TRIPLE_POINT.K;
  const latent = pressureBar < ONE_ATM_BAR ? WATER_LATENT_OVER_R_BELOW_1_ATM_K : WATER_LATENT_OVER_R_K;
  const t = 1 / (1 / BOILING_K_AT_1_ATM - log(pressureBar / ONE_ATM_BAR) / latent);
  return t > 0 ? Math.min(WATER_CRITICAL_K, t) : WATER_CRITICAL_K;
}

/** Below this temperature water is ice, K: the freezing point, or, below the triple point's pressure, always (decision 27). */
export function freezingKAt(pressureBar: number): number {
  return pressureBar < WATER_TRIPLE_POINT.bar ? Infinity : FREEZING_K;
}

/** P₂ coefficient of annual-mean insolation for an axial tilt (−0.625 upright, +0.3125 on its side). */
function tiltCoefficient(axialTiltDeg: number): number {
  const c = cos((axialTiltDeg * Math.PI) / 180);
  return -(5 / 16) * (3 * c * c - 1);
}

/** Relative insolation (mean 1 over the sphere) at a point whose cosine to the band axis is x. */
export function relativeInsolation(x: number, axialTiltDeg: number, tidallyLocked: boolean): number {
  if (tidallyLocked) return 4 * Math.max(0, x);
  return 1 + tiltCoefficient(axialTiltDeg) * (3 * x * x - 1) / 2;
}

// ── Bands ─────────────────────────────────────────────────────────────────────

/** Fixed per planet: each band's exact share of the sphere and mean insolation. */
export interface BandGeometry {
  areas: Float64Array;
  insolation: Float64Array;
}

/**
 * Exact band areas and band-averaged insolation. Area is uniform in x = cos θ,
 * so each band's mean is the integral of the profile over its x range.
 */
export function bandGeometry(axialTiltDeg: number, tidallyLocked: boolean): BandGeometry {
  const areas = new Float64Array(BAND_COUNT);
  const insolation = new Float64Array(BAND_COUNT);
  const s2 = tiltCoefficient(axialTiltDeg);
  for (let k = 0; k < BAND_COUNT; k++) {
    const x2 = cos((k * Math.PI) / BAND_COUNT);
    const x1 = cos(((k + 1) * Math.PI) / BAND_COUNT);
    const width = x2 - x1;
    areas[k] = width / 2;
    if (tidallyLocked) {
      const p1 = Math.max(0, x1);
      const p2 = Math.max(0, x2);
      insolation[k] = (4 * (p2 * p2 - p1 * p1)) / (2 * width);
    } else {
      // ∫ P₂ dx = (x³ − x) / 2
      insolation[k] = 1 + s2 * ((x2 * x2 * x2 - x2) - (x1 * x1 * x1 - x1)) / (2 * width);
    }
  }
  return { areas, insolation };
}

/** What the climate is solved for: the star, the air and how wet the planet is. */
export interface ClimateInputs {
  luminosity: number;
  orbitAU: number;
  pressureBar: number;
  co2Bar: number;
  ch4Bar: number;
  /** 0–1: how much surface water there is to evaporate, freeze and weather rock. */
  wetness: number;
  /** The temperature the interior's heat alone would give the surface, K (IH1). */
  interiorK: number;
}

export interface BandClimate {
  meanK: number;
  /** The effective temperature of the starlight it absorbs and its interior heat, K: above RUNAWAY_EFFECTIVE_K, oceans boil. */
  effectiveK: number;
  bandK: Float64Array;
  iced: Uint8Array;
  albedo: number;
  /** Shares of the planet's area. */
  iceFraction: number;
  openOceanFraction: number;
  openLandFraction: number;
}

/** Share of a region that is white when it is frozen: its water, and its land as far as snow can cover it. */
function icedShare(ocean: number, wetness: number): number {
  return ocean + (1 - ocean) * wetness;
}

function albedoOf(ocean: number, iced: boolean, wetness: number): number {
  if (!iced) return ocean * ALBEDO.ocean + (1 - ocean) * ALBEDO.land;
  const white = icedShare(ocean, wetness);
  return white * ALBEDO.ice + (1 - white) * ALBEDO.land;
}

/** Global albedo of the bands for an ice cover. */
export function bandAlbedo(geometry: BandGeometry, bandOcean: Float64Array, iced: Uint8Array, wetness: number): number {
  let albedo = 0;
  for (let k = 0; k < BAND_COUNT; k++) albedo += geometry.areas[k] * albedoOf(bandOcean[k], iced[k] === 1, wetness);
  return albedo;
}

/** The mean temperature of a climate's inputs over a given equilibrium temperature, K. */
function meanKOf(eqK: number, inputs: ClimateInputs): number {
  return surfaceMeanK(eqK, inputs.interiorK, greenhouseK(inputs.pressureBar, inputs.co2Bar, inputs.ch4Bar, inputs.wetness));
}

/** The share of the energy that is starlight, T_eq⁴ / T_eff⁴: only starlight is uneven. */
function starlightShare(eqK: number, intK: number): number {
  const eq4 = eqK * eqK * eqK * eqK;
  return eq4 / (eq4 + intK * intK * intK * intK);
}

/**
 * Solves the band temperatures, starting from an ice cover and repeating until
 * it stops changing. `bandOcean` is each band's share of liquid-water surface.
 */
export function solveBands(
  geometry: BandGeometry, bandOcean: Float64Array, inputs: ClimateInputs, icedStart: Uint8Array,
): BandClimate {
  const iced = Uint8Array.from(icedStart);
  const bandK = new Float64Array(BAND_COUNT);
  const contrast = contrastK(inputs.pressureBar);
  const freezingK = freezingKAt(inputs.pressureBar);
  let albedo = 0;
  let meanK = 0;
  let effectiveK = 0;
  for (let iteration = 0; iteration < MAX_ICE_ITERATIONS; iteration++) {
    albedo = bandAlbedo(geometry, bandOcean, iced, inputs.wetness);
    const eqK = equilibriumTemperatureK(inputs.luminosity, inputs.orbitAU, albedo);
    effectiveK = effectiveTemperatureK(eqK, inputs.interiorK);
    meanK = meanKOf(eqK, inputs);
    const uneven = contrast * starlightShare(eqK, inputs.interiorK);
    let changed = false;
    for (let k = 0; k < BAND_COUNT; k++) {
      bandK[k] = Math.max(inputs.interiorK, meanK + uneven * (geometry.insolation[k] - 1));
      const frozen = bandK[k] < freezingK ? 1 : 0;
      if (frozen !== iced[k]) { iced[k] = frozen; changed = true; }
    }
    if (!changed) break;
  }

  let iceFraction = 0;
  let openOceanFraction = 0;
  let openLandFraction = 0;
  for (let k = 0; k < BAND_COUNT; k++) {
    const area = geometry.areas[k];
    if (iced[k]) {
      const white = icedShare(bandOcean[k], inputs.wetness);
      iceFraction += area * white;
      openLandFraction += area * (1 - white);
    } else {
      openOceanFraction += area * bandOcean[k];
      openLandFraction += area * (1 - bandOcean[k]);
    }
  }
  return { meanK, effectiveK, bandK, iced, albedo, iceFraction, openOceanFraction, openLandFraction };
}

// ── Present day: all 642 cells ────────────────────────────────────────────────

export const SURFACE_KIND = { land: 0, ocean: 1, ice: 2 } as const;

export interface PresentClimate {
  meanK: number;
  minK: number;
  maxK: number;
  /** Shares of the planet's area: open water, ice, and ice-free land. They sum to 1. */
  oceanFraction: number;
  iceFraction: number;
  landFraction: number;
  /** Share of the planet's area with liquid water under its ice: deeper than the shell its heat flow allows (IH3). */
  liquidUnderIceFraction: number;
  /** Share of the planet with liquid-water temperatures: open water, and land by its moisture. */
  habitableFraction: number;
  /** Locked planets: width of the ring with liquid-water temperatures, degrees; null when rotating. */
  temperateRingDeg: number | null;
  cellTemperatureK: Float64Array;
  /** SURFACE_KIND of each cell. */
  cellSurface: Uint8Array;
  /** 0–1: falls with distance from open water, rises with warmth. */
  cellMoisture: Float64Array;
  /** Cells that hold water, open or frozen: below sea level, unless the water is steam. */
  cellSubmerged: Uint8Array;
  /** The sea level the oceans were filled to, km. */
  seaLevelKm: number;
  /** The wetness the climate was solved for: how much of frozen land is snow. */
  wetness: number;
}

// Moisture halves with every cell (~1,100 km on Earth) from open water
const MOISTURE_FALLOFF_PER_CELL = 0.5;
const MOISTURE_WARMTH_RANGE_K = 40;

/** Moisture of each cell: distance in cells to the nearest open water, and warmth. */
function moistureOf(isOpenWater: Uint8Array, temperatureK: Float64Array): Float64Array {
  const grid = surfaceGrid();
  const n = grid.positions.length;
  const hops = new Int32Array(n).fill(-1);
  let frontier: number[] = [];
  for (let i = 0; i < n; i++) if (isOpenWater[i]) { hops[i] = 0; frontier.push(i); }
  for (let h = 1; frontier.length > 0; h++) {
    const next: number[] = [];
    for (const i of frontier) for (const j of grid.neighbours[i]) if (hops[j] === -1) { hops[j] = h; next.push(j); }
    frontier = next;
  }
  // falloff^h by repeated multiplication, exact and without pow
  const proximity = [1];
  const moisture = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    if (hops[i] === -1) continue;
    while (proximity.length <= hops[i]) proximity.push(proximity[proximity.length - 1] * MOISTURE_FALLOFF_PER_CELL);
    const warmth = Math.min(1, Math.max(0, (temperatureK[i] - FREEZING_K) / MOISTURE_WARMTH_RANGE_K));
    moisture[i] = proximity[hops[i]] * warmth;
  }
  return moisture;
}

/**
 * The full climate on every cell: the present-day truth that planet type,
 * panels and the globe all read (R5). Oceans fill the cells below `seaLevelKm`
 * unless the water is steam; ice starts from `icedByBand`.
 */
export function solvePresentClimate(
  geography: Geography, inputs: ClimateInputs, seaLevelKm: number, steam: boolean,
  axialTiltDeg: number, tidallyLocked: boolean, icedByBand: Uint8Array,
): PresentClimate {
  const grid = surfaceGrid();
  const n = grid.positions.length;
  const ocean = new Uint8Array(n);
  const insolation = new Float64Array(n);
  const iced = new Uint8Array(n);
  let insolationMean = 0;
  for (let i = 0; i < n; i++) {
    ocean[i] = !steam && geography.elevationKm[i] < seaLevelKm ? 1 : 0;
    insolation[i] = relativeInsolation(grid.axisCos[i], axialTiltDeg, tidallyLocked);
    insolationMean += grid.areas[i] * insolation[i];
    iced[i] = icedByBand[grid.bandOfCell[i]];
  }

  const contrast = contrastK(inputs.pressureBar);
  const temperatureK = new Float64Array(n);
  for (let iteration = 0; iteration < MAX_ICE_ITERATIONS; iteration++) {
    let albedo = 0;
    for (let i = 0; i < n; i++) albedo += grid.areas[i] * albedoOf(ocean[i], iced[i] === 1, inputs.wetness);
    const eqK = equilibriumTemperatureK(inputs.luminosity, inputs.orbitAU, albedo);
    const meanK = meanKOf(eqK, inputs);
    const uneven = contrast * starlightShare(eqK, inputs.interiorK);
    let changed = false;
    for (let i = 0; i < n; i++) {
      temperatureK[i] = Math.max(inputs.interiorK, meanK + uneven * (insolation[i] / insolationMean - 1));
      const frozen = temperatureK[i] < freezingKAt(inputs.pressureBar) ? 1 : 0;
      if (frozen !== iced[i]) { iced[i] = frozen; changed = true; }
    }
    if (!changed) break;
  }

  // A frozen cell is ice where it holds water, and snow-covered land as far as the planet is wet
  const surface = new Uint8Array(n);
  const openWater = new Uint8Array(n);
  let oceanFraction = 0;
  let iceFraction = 0;
  let meanK = 0;
  let minK = Infinity;
  let maxK = -Infinity;
  for (let i = 0; i < n; i++) {
    const area = grid.areas[i];
    meanK += area * temperatureK[i];
    minK = Math.min(minK, temperatureK[i]);
    maxK = Math.max(maxK, temperatureK[i]);
    if (iced[i]) {
      const white = icedShare(ocean[i], inputs.wetness);
      iceFraction += area * white;
      surface[i] = white >= 0.5 ? SURFACE_KIND.ice : SURFACE_KIND.land;
    } else if (ocean[i]) {
      oceanFraction += area;
      surface[i] = SURFACE_KIND.ocean;
      openWater[i] = 1;
    }
  }

  // Liquid under the ice (IH3): frozen cells whose water is deeper than the shell the heat flow allows.
  // Below water's triple point the shell's weight still keeps the water under it liquid; a cell too
  // warm for a shell there has none (fixed in MO4)
  let liquidUnderIceFraction = 0;
  if (!steam) {
    const heatFlow = heatFlowAt(inputs.interiorK);
    const noOpenWater = freezingKAt(inputs.pressureBar) === Infinity;
    for (let i = 0; i < n; i++) {
      if (noOpenWater && temperatureK[i] >= ICE_SHELL_BASE_K) continue;
      if (iced[i] && ocean[i] && seaLevelKm - geography.elevationKm[i] > iceShellKm(heatFlow, temperatureK[i])) {
        liquidUnderIceFraction += grid.areas[i];
      }
    }
  }

  const moisture = moistureOf(openWater, temperatureK);
  const boilingK = boilingPointK(inputs.pressureBar);
  const liquid = (t: number) => !steam && inputs.wetness > 0 && t >= freezingKAt(inputs.pressureBar) && t < boilingK;
  let habitableFraction = 0;
  const liquidAreaByBand = new Float64Array(BAND_COUNT);
  const areaByBand = new Float64Array(BAND_COUNT);
  for (let i = 0; i < n; i++) {
    const band = grid.bandOfCell[i];
    areaByBand[band] += grid.areas[i];
    if (!liquid(temperatureK[i])) continue;
    liquidAreaByBand[band] += grid.areas[i];
    habitableFraction += grid.areas[i] * (openWater[i] ? 1 : moisture[i]);
  }

  let temperateRingDeg: number | null = null;
  if (tidallyLocked) {
    temperateRingDeg = 0;
    for (let k = 0; k < BAND_COUNT; k++) if (liquidAreaByBand[k] >= areaByBand[k] / 2) temperateRingDeg += 180 / BAND_COUNT;
  }

  return {
    meanK, minK, maxK,
    oceanFraction,
    iceFraction,
    landFraction: Math.max(0, 1 - oceanFraction - iceFraction),
    liquidUnderIceFraction,
    habitableFraction,
    temperateRingDeg,
    cellTemperatureK: temperatureK,
    cellSurface: surface,
    cellMoisture: moisture,
    cellSubmerged: ocean,
    seaLevelKm,
    wetness: inputs.wetness,
  };
}
