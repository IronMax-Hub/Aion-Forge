// What you describe a planet with, when it does not come from Aion Forge: the
// inputs of the form and of each preset, and the figures that follow from them.
//
// Planet Forge describes; it does not simulate. The mean temperature is an
// input, not the result of a greenhouse model; the star's equilibrium
// temperature is shown beside it only as a guide.

import { log, pow } from "./detmath";

export interface SketchInputs {
  name: string;
  seed: number;
  star: { temperatureK: number; luminositySolar: number };
  orbit: { distanceAU: number };
  body: { radiusEarth: number; massEarth: number; rotationHours: number; tidallyLocked: boolean; axialTiltDeg: number };
  air: {
    pressureBar: number;
    /** Relative amounts; rescaled to add up to 1. */
    gases: { N2: number; O2: number; CO2: number; CH4: number; H2O: number };
    cloudCover: number;
  };
  surface: {
    /** Share of the cells under the sea, 0–1. */
    oceanShare: number;
    meanTemperatureK: number;
    /** Height range from the lowest to the highest cell at 1 g, km; lower gravity stretches it. */
    reliefKm: number;
  };
  /** Absent for a lifeless planet. */
  groundCover?: { cover: number; colourLinear: [number, number, number] };
}

const SUN_TEMPERATURE_K = 5772;
/** An airless, black body at 1 AU from the Sun: 278.6 K. */
const EQUILIBRIUM_AT_1AU_K = 278.6;
/** The share of starlight a typical planet reflects, for the equilibrium-temperature guide (Earth's: 0.3). */
export const GUIDE_ALBEDO = 0.3;

/** Star radius, R☉, from Stefan–Boltzmann: L ∝ R²T⁴. */
export function starRadiusSolar(temperatureK: number, luminositySolar: number): number {
  const t = temperatureK / SUN_TEMPERATURE_K;
  return Math.sqrt(luminositySolar) / (t * t);
}

/** Star mass, M☉, from the main-sequence rule L ∝ M⁴: approximate, and wrong for giants. */
export function starMassSolar(luminositySolar: number): number {
  return pow(luminositySolar, 0.25);
}

/** The year, years, from Kepler's third law: P² = a³ / M. */
export function orbitalPeriodYears(distanceAU: number, starMassSolar: number): number {
  return Math.sqrt((distanceAU * distanceAU * distanceAU) / starMassSolar);
}

/** Surface gravity, g: M / R² in Earth units. */
export function surfaceGravityG(massEarth: number, radiusEarth: number): number {
  return massEarth / (radiusEarth * radiusEarth);
}

/** The planet's temperature with no greenhouse, reflecting GUIDE_ALBEDO of its starlight, K. */
export function equilibriumTemperatureK(luminositySolar: number, distanceAU: number): number {
  return EQUILIBRIUM_AT_1AU_K * pow((1 - GUIDE_ALBEDO) * luminositySolar, 0.25) / Math.sqrt(distanceAU);
}

const FREEZING_K = 273.15;
const TRIPLE_POINT_K = 273.16;
const TRIPLE_POINT_BAR = 0.006117;
const BOILING_AT_1ATM_K = 373.15;
const ONE_ATM_BAR = 1.01325;
const GAS_CONSTANT = 8.314;                 // J/(mol·K)
const WATER_VAPORIZATION_J_PER_MOL = 40_650;

/** Water's freezing point, K (pressure barely moves it). */
export function freezingK(): number {
  return FREEZING_K;
}

/** Water's boiling point under this pressure, K (Clausius–Clapeyron); at the triple point below its pressure, where water cannot be liquid. */
export function boilingK(pressureBar: number): number {
  if (pressureBar <= TRIPLE_POINT_BAR) return TRIPLE_POINT_K;
  // Clausius–Clapeyron runs below the triple point near its pressure; liquid water needs at least that
  return Math.max(TRIPLE_POINT_K,
    1 / (1 / BOILING_AT_1ATM_K - (GAS_CONSTANT / WATER_VAPORIZATION_J_PER_MOL) * log(pressureBar / ONE_ATM_BAR)));
}

/** The figures that follow from the inputs, shown beside the form. */
export function derivedFigures(inputs: SketchInputs) {
  const mass = starMassSolar(inputs.star.luminositySolar);
  return {
    starRadiusSolar: starRadiusSolar(inputs.star.temperatureK, inputs.star.luminositySolar),
    starMassSolar: mass,
    periodYears: orbitalPeriodYears(inputs.orbit.distanceAU, mass),
    gravityG: surfaceGravityG(inputs.body.massEarth, inputs.body.radiusEarth),
    equilibriumK: equilibriumTemperatureK(inputs.star.luminositySolar, inputs.orbit.distanceAU),
    boilingK: boilingK(inputs.air.pressureBar),
  };
}

/** What is wrong with the inputs, in the form's words; empty when they can be sketched. */
export function inputProblems(inputs: SketchInputs): string[] {
  const problems: string[] = [];
  const positive = (value: number, label: string) => { if (!(value > 0)) problems.push(`${label} must be above 0`); };
  const share = (value: number, label: string) => { if (!(value >= 0 && value <= 1)) problems.push(`${label} must be from 0 to 1`); };
  if (inputs.name.trim() === "") problems.push("the planet needs a name");
  positive(inputs.star.temperatureK, "the star's temperature");
  positive(inputs.star.luminositySolar, "the star's luminosity");
  positive(inputs.orbit.distanceAU, "the distance");
  positive(inputs.body.radiusEarth, "the radius");
  positive(inputs.body.massEarth, "the mass");
  if (!inputs.body.tidallyLocked) positive(inputs.body.rotationHours, "the day length");
  if (!(inputs.body.axialTiltDeg >= 0 && inputs.body.axialTiltDeg <= 180)) problems.push("the axial tilt must be from 0° to 180°");
  if (!(inputs.air.pressureBar >= 0)) problems.push("the pressure must be 0 or more");
  if (Object.values(inputs.air.gases).some((amount) => !(amount >= 0))) problems.push("gas amounts must be 0 or more");
  if (inputs.air.pressureBar > 0 && !Object.values(inputs.air.gases).some((amount) => amount > 0)) problems.push("air needs at least one gas");
  share(inputs.air.cloudCover, "cloud cover");
  share(inputs.surface.oceanShare, "the ocean share");
  positive(inputs.surface.meanTemperatureK, "the mean temperature");
  if (!(inputs.surface.reliefKm >= 0)) problems.push("the relief must be 0 or more");
  if (inputs.groundCover) share(inputs.groundCover.cover, "the ground cover");
  return problems;
}
