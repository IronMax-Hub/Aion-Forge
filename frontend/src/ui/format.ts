// Presentation helpers: turn simulation values into readable, unit-bearing text.
// Pure functions; nothing here feeds back into the simulation.

import type { StellarClass } from "../simulation/star";
import type { PlanetType } from "../simulation/planet";

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
  lava:        "Lava world",
  rogue:       "Rogue planet",
};
