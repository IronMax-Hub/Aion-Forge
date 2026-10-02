// Transit spectrum (Worlds Up Close, phase B2).
//
// Why it exists: when a planet crosses its star, a thin ring of its air is
// backlit. Each gas absorbs at its own wavelengths, so the planet looks
// slightly larger there; that difference, wavelength by wavelength, is how
// astronomers read an atmosphere they can never visit. This produces that
// spectrum from what the air holds (atmosphereComposition.ts).
//
// How (Lecavelier des Etangs et al. 2008, isothermal):
//   H     = k·T / (μ·m_u·g)                      scale height
//   σ(λ)  = Σ xᵢ·σᵢ(λ)                           mean cross-section per molecule
//   σ_ref = τ_eq / (n₀ · √(2π·R_p·H))            the σ that makes the air opaque at the
//                                                 reference level along the limb, τ_eq = 0.56
//   z(λ)  = H · ln(σ(λ) / σ_ref), clipped at 0   effective height above that level
//   depth = (R_p + z(λ))² / R★²                  in ppm
// The reference level is the surface for solid planets (their air cannot hide
// more than the ground does) and 1 bar for giants. Each σᵢ is Rayleigh
// scattering, (128π⁵/3)·α²/λ⁴ from the gas's polarisability, plus its
// absorption bands (BANDS below), each a Gaussian in wavelength. A band
// narrower than a bin is widened to the bin, keeping its area, as an
// instrument at this resolution would see it. The cloud deck (clouds.ts) hides
// everything below its top: under it z is at least the deck's height,
// H · ln(P₀ / P_top); the planet's spectrum is the cloudy and clear parts
// mixed by the deck's cover.
//
// Assumptions and limits:
// - Not line-by-line radiative transfer. Band strengths are averages over each
//   band (approximations, sources beside them), and an average cross-section
//   overstates how opaque a band of saturated lines is, so features come out
//   somewhat taller than real ones.
// - One temperature for the whole air (the surface's, or a giant's cloud tops)
//   and one composition at every height: no stratosphere, no cold trap above
//   the surface, no photochemistry with height.
// - No refraction (which hides Earth's lowest ~12 km from a distant observer),
//   no collision-induced absorption, no hazes.
// - Gases only: no emission or reflected-light spectra.
// - Presentation of simulation data: it changes nothing in the universe.

import { exp, log } from "./detmath";
import type { Planet } from "./planet";
import type { Star } from "./star";
import { stellarRadiusAU } from "./star";
import type { AtmosphereComposition, Gas } from "./atmosphereComposition";
import { cloudDeckOf } from "./clouds";
import type { CloudDeck } from "./clouds";

// ── Grid ──────────────────────────────────────────────────────────────────────

export const SPECTRUM_BINS = 600;
export const SPECTRUM_MIN_UM = 0.3;
export const SPECTRUM_MAX_UM = 20;
/** Each bin's width as a share of its wavelength (log-spaced bins all have the same one). */
const BIN_WIDTH_SHARE = log(SPECTRUM_MAX_UM / SPECTRUM_MIN_UM) / SPECTRUM_BINS;

/** Bin centres, µm: 600 log-spaced bins from 0.3 to 20 µm. */
export const SPECTRUM_WAVELENGTHS_UM: readonly number[] = Array.from({ length: SPECTRUM_BINS },
  (_, k) => SPECTRUM_MIN_UM * exp(BIN_WIDTH_SHARE * (k + 0.5)));

// ── Physical constants ────────────────────────────────────────────────────────

const BOLTZMANN = 1.380649e-23;        // J/K
const ATOMIC_MASS_KG = 1.66053907e-27;
const STANDARD_GRAVITY = 9.80665;      // m/s² per g
const PA_PER_BAR = 1e5;
const EARTH_RADIUS_M = 6.371e6;
const AU_M = 1.495978707e11;
/** Slant optical depth at which the limb turns opaque (Lecavelier des Etangs et al. 2008). */
const LIMB_OPTICAL_DEPTH = 0.56;
const CM2_TO_M2 = 1e-4;
const RAYLEIGH_PREFACTOR = (128 * Math.PI * Math.PI * Math.PI * Math.PI * Math.PI) / 3;

// ── Gases ─────────────────────────────────────────────────────────────────────

/** Molar mass, g/mol, and polarisability volume, Å³ (CRC Handbook), of each gas. */
const GAS_PROPERTIES: Record<Gas, { molarMass: number; polarisability: number }> = {
  N2:    { molarMass: 28.013, polarisability: 1.74 },
  O2:    { molarMass: 31.999, polarisability: 1.58 },
  O3:    { molarMass: 47.998, polarisability: 3.21 },
  CO2:   { molarMass: 44.010, polarisability: 2.91 },
  H2O:   { molarMass: 18.015, polarisability: 1.50 },
  CH4:   { molarMass: 16.043, polarisability: 2.59 },
  N2O:   { molarMass: 44.013, polarisability: 3.03 },
  NO2:   { molarMass: 46.006, polarisability: 3.02 },
  CFC11: { molarMass: 137.37, polarisability: 9.5 },
  CFC12: { molarMass: 120.91, polarisability: 7.9 },
  H2:    { molarMass: 2.016,  polarisability: 0.80 },
  He:    { molarMass: 4.003,  polarisability: 0.205 },
  NH3:   { molarMass: 17.031, polarisability: 2.26 },
  CO:    { molarMass: 28.010, polarisability: 1.95 },
};

export interface Band {
  gas: Gas;
  centreUm: number;
  /** Full width at half maximum, µm. */
  widthUm: number;
  /** Peak cross-section per molecule, cm². */
  peakCm2: number;
}

// Absorption bands. Approximations, not measurements: each is one Gaussian
// standing in for many lines. Vibrational bands: the peak is a HITRAN-scale
// integrated band strength S (cm/molecule, 296 K) spread over the band's
// width W (cm⁻¹), peak = S / (1.064·W), and the width in µm is λ²·W·10⁻⁴.
// Electronic bands (O₃ UV and visible, NO₂ visible): peak and width read
// from their measured continua.
export const BANDS: readonly Band[] = [
  { gas: "O2", centreUm: 0.76, widthUm: 0.0017, peakCm2: 6.9e-24 },   // A band: S 2.2e-22, W 30
  { gas: "O3", centreUm: 0.255, widthUm: 0.035, peakCm2: 1.1e-17 },   // Hartley continuum; only its wing is on the grid
  { gas: "O3", centreUm: 0.6, widthUm: 0.15, peakCm2: 5e-21 },        // Chappuis continuum
  { gas: "O3", centreUm: 9.6, widthUm: 0.55, peakCm2: 2.2e-19 },      // ν3: S 1.4e-17, W 60
  { gas: "H2O", centreUm: 0.94, widthUm: 0.0265, peakCm2: 1.9e-22 },  // S 6e-20, W 300
  { gas: "H2O", centreUm: 1.4, widthUm: 0.059, peakCm2: 1.9e-21 },    // S 6e-19, W 300
  { gas: "H2O", centreUm: 1.9, widthUm: 0.108, peakCm2: 2.7e-21 },    // S 8.5e-19, W 300
  { gas: "H2O", centreUm: 2.7, widthUm: 0.219, peakCm2: 2.5e-20 },    // ν1, ν3: S 8e-18, W 300
  { gas: "H2O", centreUm: 6.3, widthUm: 1.59, peakCm2: 2.3e-20 },     // ν2: S 1e-17, W 400
  { gas: "CO2", centreUm: 4.3, widthUm: 0.0925, peakCm2: 1.8e-18 },   // ν3: S 9.6e-17, W 50
  { gas: "CO2", centreUm: 15, widthUm: 1.35, peakCm2: 1.25e-19 },     // ν2 with hot bands: S 8e-18, W 60
  { gas: "CH4", centreUm: 1.7, widthUm: 0.058, peakCm2: 4.7e-22 },    // 2ν3: S 1e-19, W 200
  { gas: "CH4", centreUm: 2.3, widthUm: 0.106, peakCm2: 1.9e-21 },    // ν3 + ν4: S 4e-19, W 200
  { gas: "CH4", centreUm: 3.3, widthUm: 0.163, peakCm2: 6.9e-20 },    // ν3: S 1.1e-17, W 150
  { gas: "CH4", centreUm: 7.7, widthUm: 0.71, peakCm2: 4.5e-20 },     // ν4: S 5.8e-18, W 120
  { gas: "N2O", centreUm: 4.5, widthUm: 0.101, peakCm2: 1.9e-18 },    // ν3: S 1e-16, W 50
  { gas: "N2O", centreUm: 7.8, widthUm: 0.304, peakCm2: 4.5e-20 },    // ν1: S 2.4e-18, W 50
  { gas: "NO2", centreUm: 0.45, widthUm: 0.12, peakCm2: 5e-19 },      // visible continuum, 0.4–0.5 µm
  { gas: "CFC11", centreUm: 11.8, widthUm: 0.42, peakCm2: 2.2e-18 },  // ν4: S 7e-17, W 30
  { gas: "CFC12", centreUm: 9.2, widthUm: 0.25, peakCm2: 1.6e-18 },   // S 5e-17, W 30
  { gas: "CFC12", centreUm: 10.8, widthUm: 0.29, peakCm2: 2.3e-18 },  // ν6: S 6e-17, W 25
  // Giants' gases (B1 adds CO and NH₃, which the plan's table predates)
  { gas: "CO", centreUm: 2.35, widthUm: 0.044, peakCm2: 8.8e-22 },    // first overtone: S 7.5e-20, W 80
  { gas: "CO", centreUm: 4.7, widthUm: 0.177, peakCm2: 1.2e-19 },     // fundamental: S 1e-17, W 80
  { gas: "NH3", centreUm: 3.0, widthUm: 0.18, peakCm2: 1.9e-20 },     // ν1, ν3: S 4e-18, W 200
  { gas: "NH3", centreUm: 10.5, widthUm: 1.65, peakCm2: 1.3e-19 },    // ν2: S 2.1e-17, W 150
];

// ── Spectrum ──────────────────────────────────────────────────────────────────

export interface Spectrum {
  /** Bin centres, µm (SPECTRUM_WAVELENGTHS_UM). */
  wavelengthUm: readonly number[];
  /** Transit depth per bin, ppm. */
  depthPpm: number[];
  /** The depth of the planet's reference level alone, ppm: the floor the air adds to. */
  baselinePpm: number;
  scaleHeightKm: number;
  clouds: CloudDeck;
}

/** Rayleigh scattering cross-section of one molecule, cm², at λ µm. */
function rayleighCm2(gas: Gas, wavelengthUm: number): number {
  const alphaCm3 = GAS_PROPERTIES[gas].polarisability * 1e-24;
  const lambdaCm = wavelengthUm * 1e-4;
  const lambda2 = lambdaCm * lambdaCm;
  return (RAYLEIGH_PREFACTOR * alphaCm3 * alphaCm3) / (lambda2 * lambda2);
}

/** A band's cross-section, cm², averaged over a bin of this width: widened to the bin if narrower, area kept. */
function bandCm2(band: Band, wavelengthUm: number, binWidthUm: number): number {
  const width = Math.sqrt(band.widthUm * band.widthUm + binWidthUm * binWidthUm);
  const offset = (wavelengthUm - band.centreUm) / width;
  // Gaussian with this full width at half maximum: exp(−4 ln 2 · offset²)
  return band.peakCm2 * (band.widthUm / width) * exp(-4 * Math.LN2 * offset * offset);
}

/** Mean cross-section per molecule of the mix, cm², at each bin. */
function meanCrossSections(composition: AtmosphereComposition): number[] {
  const gases = Object.entries(composition.mixingRatios) as [Gas, number][];
  const bands = BANDS.filter((band) => composition.mixingRatios[band.gas] !== undefined);
  return SPECTRUM_WAVELENGTHS_UM.map((wavelength) => {
    const binWidth = wavelength * BIN_WIDTH_SHARE;
    let sigma = 0;
    for (const [gas, x] of gases) sigma += x * rayleighCm2(gas, wavelength);
    for (const band of bands) sigma += composition.mixingRatios[band.gas]! * bandCm2(band, wavelength, binWidth);
    return sigma;
  });
}

/** Mean molecular mass of the mix, g/mol. */
export function meanMolarMass(composition: AtmosphereComposition): number {
  let mu = 0;
  for (const [gas, x] of Object.entries(composition.mixingRatios) as [Gas, number][]) mu += x * GAS_PROPERTIES[gas].molarMass;
  return mu;
}

/**
 * The planet's transit spectrum: how deep its transit is at each wavelength,
 * from its air, temperature and gravity. `clouds` defaults to the planet's own
 * deck (clouds.ts); a caller may pass another to see the air without it.
 */
export function transitSpectrum(
  planet: Planet, star: Star, composition: AtmosphereComposition,
  clouds: CloudDeck = cloudDeckOf(planet, composition),
): Spectrum {
  // Gravity as planetPhysics.ts derives it, M / R² in Earth units
  const g = (planet.surface?.surfaceGravity ?? planet.mass / (planet.size * planet.size)) * STANDARD_GRAVITY;
  const temperatureK = planet.temperature;
  const scaleHeightM = (BOLTZMANN * temperatureK) / (meanMolarMass(composition) * ATOMIC_MASS_KG * g);
  const planetRadiusM = planet.size * EARTH_RADIUS_M;
  const starRadiusM = stellarRadiusAU(star) * AU_M;

  // The σ at which the limb turns opaque at the reference level
  const referenceBar = composition.pressureBar;
  const numberDensity = (referenceBar * PA_PER_BAR) / (BOLTZMANN * temperatureK);   // m⁻³
  const sigmaRefM2 = LIMB_OPTICAL_DEPTH / (numberDensity * Math.sqrt(2 * Math.PI * planetRadiusM * scaleHeightM));
  const deckHeightM = clouds.cover > 0 && clouds.topBar < referenceBar ? scaleHeightM * log(referenceBar / clouds.topBar) : 0;

  const depthOf = (heightM: number) => {
    const ratio = (planetRadiusM + heightM) / starRadiusM;
    return ratio * ratio * 1e6;
  };
  const depthPpm = meanCrossSections(composition).map((sigmaCm2) => {
    const sigmaM2 = sigmaCm2 * CM2_TO_M2;
    const clear = sigmaM2 > sigmaRefM2 ? scaleHeightM * log(sigmaM2 / sigmaRefM2) : 0;
    return (1 - clouds.cover) * depthOf(clear) + clouds.cover * depthOf(Math.max(clear, deckHeightM));
  });

  return {
    wavelengthUm: SPECTRUM_WAVELENGTHS_UM, depthPpm, baselinePpm: depthOf(0), scaleHeightKm: scaleHeightM / 1000, clouds,
  };
}
