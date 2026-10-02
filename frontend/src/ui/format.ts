// Presentation helpers: turn simulation values into readable, unit-bearing text.
// Pure functions; nothing here feeds back into the simulation.

import type { StellarClass } from "../simulation/star";
import type { PlanetType } from "../simulation/planet";
import type { Biosphere, LifeStage } from "../simulation/biosphere";
import { TECH_STAGE_LABEL } from "../simulation/civilization";
import type { SystemLife } from "../simulation/lifeSurvey";

const SUPERSCRIPT: Record<string, string> = {
  "-": "⁻", "0": "⁰", "1": "¹", "2": "²", "3": "³", "4": "⁴",
  "5": "⁵", "6": "⁶", "7": "⁷", "8": "⁸", "9": "⁹",
};

/** A number to `digits` significant figures, with thousands separators; tiny values in scientific notation. */
export function formatSig(n: number, digits = 3): string {
  if (n === 0) return "0";
  if (Math.abs(n) < 0.001) {
    const [mantissa, exponent] = n.toExponential(1).split("e");
    const sup = String(Number(exponent)).split("").map((c) => SUPERSCRIPT[c]).join("");
    return `${mantissa} × 10${sup}`;
  }
  return n.toLocaleString("en-US", { maximumSignificantDigits: digits });
}

/** A whole number with thousands separators. */
export function formatInt(n: number): string {
  return Math.round(n).toLocaleString("en-US");
}

/** A duration given in billions of years, shown in Gyr or Myr as appropriate. */
export function formatGyr(gyr: number): string {
  if (gyr < 0.1) return `${formatSig(gyr * 1000, 3)} Myr`;
  return `${formatSig(gyr, 3)} Gyr`;
}

/** A 0–1 index to two decimals. */
export function formatIndex(value: number): string {
  return value.toFixed(2);
}

// ── Surface (Worlds Up Close A10) ────────────────────────────────────────────

/** Surface gravity, in Earth gravities. */
export function formatGravity(g: number): string {
  return `${formatSig(g)} g`;
}

/** Surface pressure in bar. */
export function formatPressure(bar: number): string {
  return `${formatSig(bar)} bar`;
}

/** Length of a day in hours, or "Tidally locked" when one face always points at the star. */
export function formatRotation(hours: number, tidallyLocked: boolean): string {
  return tidallyLocked ? "Tidally locked" : `${formatSig(hours)} h`;
}

/** Axial tilt in degrees, to a tenth. */
export function formatTilt(deg: number): string {
  return `${deg.toFixed(1)}°`;
}

/** A 0–1 share as a whole percentage; a share too small to round up shows as "<1%". */
export function formatPercent(share: number): string {
  if (share > 0 && share < 0.005) return "<1%";
  return `${Math.round(share * 100)}%`;
}

/**
 * Shares that make up a whole, as whole percentages that still sum to 100
 * (largest remainder: the shares that lost most to rounding down gain a point).
 */
export function wholePercents(shares: number[]): number[] {
  const total = shares.reduce((sum, x) => sum + x, 0);
  if (total <= 0) return shares.map(() => 0);
  const exact = shares.map((x) => (x / total) * 100);
  const whole = exact.map(Math.floor);
  let missing = 100 - whole.reduce((sum, x) => sum + x, 0);
  const byRemainder = exact.map((_, i) => i).sort((a, b) => (exact[b] - whole[b]) - (exact[a] - whole[a]) || a - b);
  for (const i of byRemainder) {
    if (missing <= 0) break;
    whole[i]++;
    missing--;
  }
  return whole;
}

/** Ocean, land and ice shares, e.g. "71% / 26% / 3%". */
export function formatSurfaceShares(ocean: number, land: number, ice: number): string {
  return wholePercents([ocean, land, ice]).map((p) => `${p}%`).join(" / ");
}

/** Coldest to warmest surface temperature, e.g. "184–330 K". */
export function formatTemperatureRange(minK: number, maxK: number): string {
  return `${formatInt(minK)}–${formatInt(maxK)} K`;
}

// ── Stellar designations ─────────────────────────────────────────────────────

/** Harvard spectral classes by effective temperature (K), hottest first. */
const SPECTRAL_CLASSES: { letter: string; min: number; max: number }[] = [
  { letter: "O", min: 30000, max: 50000 },
  { letter: "B", min: 10000, max: 30000 },
  { letter: "A", min: 7500,  max: 10000 },
  { letter: "F", min: 6000,  max: 7500 },
  { letter: "G", min: 5200,  max: 6000 },
  { letter: "K", min: 3700,  max: 5200 },
  { letter: "M", min: 2400,  max: 3700 },
  { letter: "L", min: 1300,  max: 2400 },
];

const LUMINOSITY_CLASS: Partial<Record<StellarClass, string>> = {
  "main-sequence": "V",
  "red-giant":     "III",
};

/**
 * Spectral type such as "G2 V", derived from temperature and evolutionary class.
 * Returns null for remnants (white dwarfs, neutron stars, black holes), which are not typed this way.
 */
export function spectralType(temperatureK: number, cls: StellarClass): string | null {
  if (cls === "white-dwarf" || cls === "neutron-star" || cls === "black-hole") return null;
  const spec = SPECTRAL_CLASSES.find((s) => temperatureK >= s.min) ?? SPECTRAL_CLASSES[SPECTRAL_CLASSES.length - 1];
  const t = Math.min(spec.max, temperatureK);
  const subclass = Math.min(9, Math.max(0, Math.floor(((spec.max - t) / (spec.max - spec.min)) * 10)));
  const lum = LUMINOSITY_CLASS[cls];
  return lum ? `${spec.letter}${subclass} ${lum}` : `${spec.letter}${subclass}`;
}

export const STELLAR_CLASS_NAME: Record<StellarClass, string> = {
  protostar:       "pre-main-sequence star",
  "main-sequence": "main-sequence star",
  "red-giant":     "red giant",
  "white-dwarf":   "white dwarf",
  "neutron-star":  "neutron star",
  "black-hole":    "black hole",
};

/** Catalogue label for a star, e.g. "Star 0006". */
export function starName(starId: number): string {
  return `Star ${starId.toString().padStart(4, "0")}`;
}

/** Exoplanet-style designation: the host star plus a letter from "b" outward, e.g. "0006 b". */
export function planetName(starId: number, orbitalIndex: number): string {
  const letter = orbitalIndex < 25 ? String.fromCharCode(98 + orbitalIndex) : `#${orbitalIndex + 1}`;
  return `${starId.toString().padStart(4, "0")} ${letter}`;
}

export const PLANET_TYPE_LABEL: Record<PlanetType, string> = {
  rocky:       "Rocky planet",
  ocean:       "Ocean world",
  ice:         "Ice world",
  desert:      "Desert planet",
  "gas-giant": "Gas giant",
  "ice-giant": "Ice giant",
  lava:        "Lava world",
  rogue:       "Rogue planet",
};

// ── Distances ────────────────────────────────────────────────────────────────

/**
 * Display assumption, not a simulation rule: the default galaxy radius (120 scene
 * units) is shown as about 50,000 light-years, roughly the Milky Way's disc.
 */
export const LIGHT_YEARS_PER_UNIT = 50_000 / 120;

/** A distance in light-years, switching to kly above 1,000 ly. */
export function formatLightYears(ly: number): string {
  return ly >= 1000 ? `${formatSig(ly / 1000)} kly` : `${formatSig(ly)} ly`;
}

/** The largest 1, 2 or 5 × 10ⁿ that does not exceed `max` — a tidy scale-bar length. */
export function niceScaleLength(max: number): number {
  const magnitude = Math.pow(10, Math.floor(Math.log10(max)));
  const steps = [5, 2, 1];
  const step = steps.find((s) => s * magnitude <= max) ?? 1;
  return step * magnitude;
}

// ── Life markers ─────────────────────────────────────────────────────────────

/** Short names for the life stages a galaxy marker can show. */
export const LIFE_MARKER_STAGE: Record<LifeStage, string> = {
  none:          "No life",
  prebiotic:     "Prebiotic",
  microbial:     "Microbial",
  multicellular: "Multicellular",
  complex:       "Complex ecosystems",
  dominant:      "Dominant biosphere",
};

/** Short names for a planet's life in the system table and the system view's hover label. */
const PLANET_LIFE_STAGE: Record<LifeStage, string> = {
  none:          "—",
  prebiotic:     "Prebiotic",
  microbial:     "Microbial",
  multicellular: "Multicellular",
  complex:       "Complex",
  dominant:      "Dominant",
};

/** A planet's life in a word: its stage, "Extinct" where life has ended, "—" where it never began. */
export function planetLifeLabel(biosphere: Biosphere): string {
  return biosphere.extinctAt !== null ? "Extinct" : PLANET_LIFE_STAGE[biosphere.stage];
}

/** Bubble text for a system: its most notable life, plus how many other planets have life. */
export function lifeMarkerLabel(life: SystemLife): string {
  const main = life.civilizationStage
    ? `Civilization · ${TECH_STAGE_LABEL[life.civilizationStage]}`
    : LIFE_MARKER_STAGE[life.mostAdvancedStage];
  const others = life.lifePlanetCount - 1;
  return others > 0 ? `${main} +${others}` : main;
}
