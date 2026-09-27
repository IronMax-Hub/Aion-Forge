// The environment life meets at one step of a planet's history (Worlds Up
// Close, phase C2.2).
//
// Why it exists: evolution (C2.3) responds to pressures, not to a planet
// record. This turns one step of the world history loop into those pressures:
// light, gravity, habitats and their temperatures, UV, the chemistry of the
// air, and the step's catastrophes. It is read once per step, by the engine,
// in the step's own conditions (Revision 1, C2.2), so a brightening star, a
// freezing planet or a rising ozone layer change what life meets.
//
// How, for each of the 18 climate bands:
// - Light. Starlight at the top of the air, L(t) / a² (Earth today = 1) times
//   the band's mean insolation, dimmed by the air: transmission
//   e^(−k · pressure), with k set so Venus's 92 bar lets ~2.5% through, as
//   measured (owner decision). Earth's air passes 96%.
// - Habitats (owner decision). The grid cannot resolve continental shelves, so
//   the water habitats are layers, not places: shallow water is the sunlit top
//   layer of open water; deep water is the dark water beneath, including under
//   ice, where chemical energy from vents and sediments is. Every ocean has
//   both. Land is the band's area above the sea. While the oceans are steam,
//   there is no water habitat.
// - Temperatures. Land takes the band's temperature. Liquid water is never
//   colder than seawater's freezing point (271 K), even under ice.
// And for the planet:
// - Star. Its temperature at the step (temperatureAt) and the peak of its
//   spectrum by Wien's law.
// - UV at the surface (owner decision), relative to the Sun's at 1 AU with no
//   air or ozone: the star's steady UV, its blackbody share at 200–315 nm
//   relative to the Sun's, times its flux; plus, for red dwarfs (below
//   3,900 K on the main sequence), flare UV that fades with age, over an
//   activity lifetime from ~0.8 Gyr for early M dwarfs to ~8 Gyr for late ones
//   (West et al. 2008). Then dimmed by the air, like light, and by ozone:
//   × (1 − ozone).
// - Gravity, tectonic activity (the engine's chemical energy follows it), and
//   the air's CO₂, O₂, CH₄ and ozone.
// - Catastrophes: the step's impact and volcanic pulse, and the climate
//   transitions it recorded, taken from the loop as they are (Revision 1,
//   C2.3 point 4): the environment draws nothing of its own.
//
// Assumptions and limits:
// - One transmission for all wavelengths; Rayleigh scattering's stronger
//   effect on UV is not separated out.
// - The sunlit layer's light is the surface light; attenuation with depth is
//   the engine's business if it needs it.
// - Flare UV per unit of starlight is a starting value (FLARE_UV_AT_FULL_ACTIVITY),
//   to be tuned in C2.10 with the reason recorded in Documents/evolution.md.
// - Pure: it reads a snapshot and never changes it.

import { exp, log } from "../detmath";
import type { Star } from "../star";
import { mainSequenceEndGyr, temperatureAt } from "../star";
import type { BandGeometry } from "../climate";
import { bandGeometry } from "../climate";
import { BAND_COUNT } from "../geography";
import type { Planet } from "../planet";
import { effectiveOrbitAU } from "../planetBasics";
import type { PlanetPhysics } from "../planetPhysics";
import type { UniverseConfig } from "../config";
import type { WorldEventKind, WorldSnapshot } from "../worldHistory";

// ── Constants ─────────────────────────────────────────────────────────────────

// Air dimming: Venus's 92 bar lets about 2.5% of sunlight reach the ground
const VENUS_PRESSURE_BAR = 92;
const VENUS_SURFACE_TRANSMISSION = 0.025;
const AIR_DIMMING_PER_BAR = -log(VENUS_SURFACE_TRANSMISSION) / VENUS_PRESSURE_BAR;

/** Liquid water is never colder than this (seawater's freezing point), K. */
export const SEAWATER_FREEZING_K = 271;

// Wien's displacement constant, nm·K
const WIEN_NM_K = 2.8978e6;

// UV band that harms life (UV-B and UV-C reaching the ground), nm
const UV_BAND_NM = { from: 200, to: 315 };
// Second radiation constant hc/k, nm·K
const PLANCK_C2_NM_K = 1.4388e7;
const SOLAR_TEMPERATURE_K = 5772;
const UV_INTEGRATION_STEPS = 64;   // Simpson intervals; even

// Red-dwarf flares (West et al. 2008): active lifetime from M0 to M7
const FLARING_BELOW_K = 3900;
const FLARE_LIFETIME = { hotK: 3900, hotGyr: 0.8, coolK: 2700, coolGyr: 8 };
/** Time-averaged flare UV per unit of starlight at full activity, relative to the Sun's steady UV per unit of starlight. */
const FLARE_UV_AT_FULL_ACTIVITY = 1;

// ── Types ─────────────────────────────────────────────────────────────────────

/** One climate band, as life meets it. Areas are shares of the whole planet. */
export interface EnvironmentBand {
  area: number;
  /** Starlight at the surface, relative to Earth's mean top-of-air flux today. */
  light: number;
  landArea: number;
  /** The sunlit top layer of open (ice-free) water. */
  shallowWaterArea: number;
  /** All liquid water, open or under ice. */
  deepWaterArea: number;
  landK: number;
  waterK: number;
}

/** The step's catastrophes, as the world history loop recorded them. */
export interface Catastrophes {
  impact: boolean;
  volcanicPulse: boolean;
  transitions: WorldEventKind[];
}

/** What life meets during one step of its planet's history. */
export interface Environment {
  /** End of the step, Gyr after the star formed. */
  tGyr: number;
  dtGyr: number;
  gravity: number;
  starTemperatureK: number;
  /** Peak of the star's spectrum (Wien), nm. */
  starPeakNm: number;
  /** Share of starlight (and UV) the air lets through. */
  airTransmission: number;
  /** UV at the surface, relative to the Sun's at 1 AU with no air or ozone. */
  surfaceUV: number;
  tectonicActivity: number;
  co2Bar: number;
  o2Bar: number;
  ch4Bar: number;
  ozone: number;
  bands: EnvironmentBand[];
  catastrophes: Catastrophes;
}

/** What stays fixed for a planet over its whole history. */
export interface EnvironmentContext {
  star: Star;
  orbitAU: number;
  gravity: number;
  geometry: BandGeometry;
}

// ── Star ──────────────────────────────────────────────────────────────────────

/** Peak wavelength of a blackbody, nm. */
export function peakWavelengthNm(temperatureK: number): number {
  return WIEN_NM_K / temperatureK;
}

/** Share of a blackbody's output between 200 and 315 nm (Planck, integrated by Simpson's rule in x = hc/λkT). */
export function uvShare(temperatureK: number): number {
  if (temperatureK <= 0) return 0;
  const xFrom = PLANCK_C2_NM_K / (UV_BAND_NM.to * temperatureK);
  const xTo = PLANCK_C2_NM_K / (UV_BAND_NM.from * temperatureK);
  const f = (x: number) => (x * x * x) / (exp(x) - 1);
  const h = (xTo - xFrom) / UV_INTEGRATION_STEPS;
  let sum = f(xFrom) + f(xTo);
  for (let i = 1; i < UV_INTEGRATION_STEPS; i++) sum += (i % 2 === 1 ? 4 : 2) * f(xFrom + i * h);
  // ∫ x³/(eˣ − 1) over all x is π⁴/15
  return (sum * h / 3) * 15 / (Math.PI * Math.PI * Math.PI * Math.PI);
}

const SOLAR_UV_SHARE = uvShare(SOLAR_TEMPERATURE_K);

/** How active a red dwarf's flaring is, 0–1: full at birth, fading over its activity lifetime; 0 for other stars. */
export function flareActivity(temperatureK: number, onMainSequence: boolean, tGyr: number): number {
  if (!onMainSequence || temperatureK >= FLARING_BELOW_K) return 0;
  const { hotK, hotGyr, coolK, coolGyr } = FLARE_LIFETIME;
  const share = Math.min(1, Math.max(0, (hotK - temperatureK) / (hotK - coolK)));
  const lifetimeGyr = hotGyr + (coolGyr - hotGyr) * share;
  return exp(-tGyr / lifetimeGyr);
}

/** Share of starlight and UV the air lets through at a surface pressure. */
export function airTransmission(pressureBar: number): number {
  return exp(-AIR_DIMMING_PER_BAR * pressureBar);
}

// ── Environment ───────────────────────────────────────────────────────────────

/** The fixed part of a solid planet's environment. */
export function environmentContext(planet: Planet, physics: PlanetPhysics, star: Star, config: UniverseConfig): EnvironmentContext {
  return {
    star,
    orbitAU: effectiveOrbitAU(planet.orbitalRadius, config),
    gravity: physics.surfaceGravity,
    geometry: bandGeometry(physics.axialTiltDeg, physics.tidallyLocked),
  };
}

/** What life meets during one step: the step's snapshot read as pressures. */
export function environmentFor(step: WorldSnapshot, context: EnvironmentContext): Environment {
  const { star, orbitAU, gravity, geometry } = context;
  const starTemperatureK = temperatureAt(star, step.tGyr);
  const flux = step.luminosity / (orbitAU * orbitAU);
  const transmission = airTransmission(step.pressureBar);

  const onMainSequence = star.age < mainSequenceEndGyr(star) || step.tGyr < mainSequenceEndGyr(star);
  const steadyUV = uvShare(starTemperatureK) / SOLAR_UV_SHARE;
  const flareUV = FLARE_UV_AT_FULL_ACTIVITY * flareActivity(starTemperatureK, onMainSequence, step.tGyr);
  const surfaceUV = flux * (steadyUV + flareUV) * transmission * (1 - step.ozone);

  const bands: EnvironmentBand[] = [];
  for (let k = 0; k < BAND_COUNT; k++) {
    const area = geometry.areas[k];
    const water = step.steam ? 0 : area * step.bandOcean[k];
    bands.push({
      area,
      light: flux * geometry.insolation[k] * transmission,
      landArea: area * (1 - step.bandOcean[k]),
      shallowWaterArea: step.iced[k] ? 0 : water,
      deepWaterArea: water,
      landK: step.bandK[k],
      waterK: Math.max(SEAWATER_FREEZING_K, step.bandK[k]),
    });
  }

  return {
    tGyr: step.tGyr,
    dtGyr: step.dtGyr,
    gravity,
    starTemperatureK,
    starPeakNm: peakWavelengthNm(starTemperatureK),
    airTransmission: transmission,
    surfaceUV,
    tectonicActivity: step.tectonicActivity,
    co2Bar: step.co2Bar,
    o2Bar: step.o2Bar,
    ch4Bar: step.ch4Bar,
    ozone: step.ozone,
    bands,
    catastrophes: { impact: step.impact, volcanicPulse: step.volcanicPulse, transitions: step.events },
  };
}
