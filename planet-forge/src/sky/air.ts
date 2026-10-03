// The air as light sees it (PLAN, PF4): how strongly it scatters light, per
// colour channel, and how fast it thins with height.
//
// Why it exists: the sky's colour, the haze over distant ground and the
// reddening of a low star all follow from these few numbers, worked out from
// the spec by stated rules, never per planet type.
//
// How (owner decisions, 3 Oct 2026):
// - The air thins exponentially, with scale height H = R·T / (M·g): T the
//   cells' mean temperature, M the gases' mean molar mass, g the surface gravity.
// - Rayleigh scattering (scatters blue most): Earth's optical depth straight up
//   at 1 bar, per channel, scaled by the number of molecules overhead, P / (M·g)
//   against Earth's air, and by how strongly the gases scatter, (n − 1)²
//   against air's, n each gas's refractive index. Thin air gives a dark sky,
//   low gravity a hazier one; CO₂ scatters about 2.3 times as strongly as N₂.
// - Mie scattering (haze, the glow around the star): Earth's clear-sky haze
//   per unit mass of air overhead, the same at every wavelength, in a layer
//   AEROSOL_HEIGHT_SHARE as thick as the air's. An airless world has none.
// - The channels' Rayleigh depths are what the whole spectrum gives, not the
//   law sampled at one wavelength per channel: green is Earth's depth at
//   550 nm (0.0088·λ^−4.05 µm, A6's), and red and blue are scaled by how much
//   of sunlight scattered as λ^−4.05 each channel sees, against sunlight
//   itself, integrating against the CIE 1931 observer into linear sRGB. That
//   gives red 0.52 and blue 2.39 times green (within 0.04 for stars from
//   3,200 to 10,000 K), where sampling at 612 and 465 nm, as A6 does, gave
//   0.64 and 1.96: so a Rayleigh sky is as blue as it is (about 3.8 times as
//   much blue as red under the Sun, against 2.1), and still never violet.
//   This departs from A6, whose rim keeps the sampled depths (fix after PF4).
//
// Assumptions: one temperature for the whole column (an isothermal
// atmosphere); scattering only, no absorption (extinction equals scattering);
// trace gases whose refractive index is not tabled scatter as air does.
//
// Presentation only: it reads the spec and never changes the planet.

import type { Gas, PlanetSpec } from "../spec/schema";
import type { Vec3 } from "../forge/icosphere";

const EARTH_RADIUS_M = 6_371_000;
const STANDARD_GRAVITY = 9.80665;
/** Molar gas constant, J/(mol·K). */
const GAS_CONSTANT = 8.314462618;
/** Earth's air: mean molar mass, kg/mol, and refractivity (n − 1) in visible light. */
const AIR_MOLAR_MASS = 0.028964;
const AIR_REFRACTIVITY = 2.93e-4;
/** Earth's Rayleigh optical depth straight up at 1 bar and 1 g in green, and red's and blue's against it (the spectrum through the CIE observer; above). */
const EARTH_RAYLEIGH_GREEN = 0.100;
export const RAYLEIGH_CHANNELS: Vec3 = [0.518, 1, 2.389];
/** Earth's clear-sky haze (aerosol optical depth straight up) at 1 bar and 1 g: Bruneton and Neyret's (2008) 21 per Mm over a 1.2 km layer. */
const EARTH_MIE_DEPTH = 0.025;
/** The haze layer's scale height as a share of the air's (Earth: about 1.2 of 8.4 km). */
export const AEROSOL_HEIGHT_SHARE = 0.15;
/** How strongly haze scatters forwards (Henyey–Greenstein asymmetry; Earth's aerosols). */
export const MIE_ASYMMETRY = 0.76;
/** The air is taken to end this many scale heights up (its density is then e^−12 of the ground's). */
const TOP_SCALE_HEIGHTS = 12;
/** Air with no gases named is taken to be nitrogen. */
const DEFAULT_GAS: Gas = "N2";

/** Molar mass, kg/mol. */
const MOLAR_MASS: Record<Gas, number> = {
  N2: 0.028013, O2: 0.031999, O3: 0.047998, CO2: 0.04401, H2O: 0.018015, CH4: 0.016043, N2O: 0.044013,
  NO2: 0.046006, CFC11: 0.13737, CFC12: 0.12091, H2: 0.002016, He: 0.004003, NH3: 0.017031, CO: 0.02801,
};

/** Refractivity (n − 1) at standard conditions in visible light; gases not listed scatter as air. */
const REFRACTIVITY: Partial<Record<Gas, number>> = {
  N2: 2.98e-4, O2: 2.71e-4, CO2: 4.49e-4, H2O: 2.56e-4, CH4: 4.41e-4, N2O: 5.16e-4,
  H2: 1.39e-4, He: 0.35e-4, NH3: 3.76e-4, CO: 3.38e-4,
};

export interface Air {
  /** The planet's radius, and the top of the air, m from its centre. */
  radiusM: number;
  topM: number;
  /** Rayleigh scattering at the ground, per m, red, green, blue; and its scale height, m. */
  rayleigh: Vec3;
  rayleighHeightM: number;
  /** Mie scattering at the ground, per m (the same in every channel); and its scale height, m. */
  mie: number;
  mieHeightM: number;
}

/** The gases' shares; air with none named is DEFAULT_GAS. */
function gasShares(spec: PlanetSpec): [Gas, number][] {
  const shares = Object.entries(spec.air.gases) as [Gas, number][];
  return shares.length > 0 ? shares : [[DEFAULT_GAS, 1]];
}

/** The gases' mean molar mass, kg/mol. */
export function molarMass(spec: PlanetSpec): number {
  return gasShares(spec).reduce((sum, [gas, share]) => sum + share * MOLAR_MASS[gas], 0);
}

/** How strongly each molecule of this air scatters, against Earth's air: the share-weighted (n − 1)². */
export function scatteringPerMolecule(spec: PlanetSpec): number {
  return gasShares(spec).reduce((sum, [gas, share]) => sum + share * ((REFRACTIVITY[gas] ?? AIR_REFRACTIVITY) / AIR_REFRACTIVITY) ** 2, 0);
}

export function airOf(spec: PlanetSpec): Air {
  const radiusM = spec.body.radiusEarth * EARTH_RADIUS_M;
  const cells = spec.surface.cells;
  const temperatureK = cells.reduce((sum, c) => sum + c[4], 0) / cells.length;
  const mass = molarMass(spec);
  const gravity = spec.body.gravityG * STANDARD_GRAVITY;
  const rayleighHeightM = (GAS_CONSTANT * temperatureK) / (mass * gravity);
  const mieHeightM = rayleighHeightM * AEROSOL_HEIGHT_SHARE;

  // Air overhead against Earth's: by mass, P / g; by molecules, P / (M·g)
  const massColumn = spec.air.pressureBar / spec.body.gravityG;
  const moleculeColumn = massColumn * (AIR_MOLAR_MASS / mass);
  const perMolecule = scatteringPerMolecule(spec);
  // A depth straight up, τ, is the ground's scattering times the scale height
  const greenDepth = EARTH_RAYLEIGH_GREEN * moleculeColumn * perMolecule;
  const rayleigh = RAYLEIGH_CHANNELS.map((share) => (greenDepth * share) / rayleighHeightM) as Vec3;
  const mieDepth = EARTH_MIE_DEPTH * massColumn;
  const mie = mieDepth / mieHeightM;
  return { radiusM, topM: radiusM + TOP_SCALE_HEIGHTS * rayleighHeightM, rayleigh, rayleighHeightM, mie, mieHeightM };
}
