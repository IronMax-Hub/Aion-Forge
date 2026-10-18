// Presentation helpers: turn simulation values into readable, unit-bearing text.
// Pure functions; nothing here feeds back into the simulation.

import type { StellarClass } from "../simulation/star";
import type { AtmosphereType, PlanetType } from "../simulation/planet";
import type { Biosphere, LifeStage } from "../simulation/biosphere";
import { TECH_STAGE_LABEL } from "../simulation/civilization";
import type { SystemLife } from "../simulation/lifeSurvey";
import { DEFAULT_CONFIG, type UniverseConfig } from "../simulation/config";
import { makeUniverseId } from "../simulation/persistence";
import { SIMULATION_RULES_VERSION } from "../simulation/version";

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

// ── Metallicity (MZ4) ────────────────────────────────────────────────────────

/** Labels for a star's [Fe/H], dex: metal-poor below, metal-rich above, solar between (a reading, not a rule). */
export const METALLICITY_LABEL_BOUNDS = { poorBelow: -0.3, richAbove: 0.2 } as const;
const ORDINAL_FRACTION = ["", "", "half", "a third", "a quarter", "a fifth", "a sixth", "a seventh", "an eighth", "a ninth", "a tenth"];

/** A star's [Fe/H] with its label: "−0.42 · metal-poor". */
export function formatMetallicity(feH: number): string {
  const { poorBelow, richAbove } = METALLICITY_LABEL_BOUNDS;
  const label = feH < poorBelow ? "metal-poor" : feH > richAbove ? "metal-rich" : "solar";
  return `${feH < 0 ? "−" : "+"}${Math.abs(feH).toFixed(2)} · ${label}`;
}

/** How much metal a star's gas held against the Sun's, 10^[Fe/H] in words: "a sixth of the Sun's metals". */
export function metalShare(feH: number): string {
  const ratio = Math.pow(10, feH);
  if (ratio >= 1.5) return `${formatSig(ratio, 2)} times the Sun's metals`;
  if (ratio > 0.75) return "about the Sun's metals";
  const n = Math.round(1 / ratio);
  return n < ORDINAL_FRACTION.length ? `${ORDINAL_FRACTION[n]} of the Sun's metals` : `1/${formatInt(n)} of the Sun's metals`;
}

/** A class of air as a phrase: "thick air"; the "none" class is a trace (0.006 bar, Mars's). */
export function airPhrase(atmosphere: AtmosphereType): string {
  return atmosphere === "none" ? "a trace of air" : `${atmosphere} air`;
}

/** How a planet's class of air changed since it formed (AE3): "Formed with thick air · thin today"; null if unchanged. */
export function formatAirChange(formation: AtmosphereType, today: AtmosphereType): string | null {
  if (formation === today) return null;
  return `Formed with ${airPhrase(formation)} · ${today} today`;
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

const ROMAN_NUMERALS: [number, string][] = [
  [1000, "m"], [900, "cm"], [500, "d"], [400, "cd"], [100, "c"], [90, "xc"],
  [50, "l"], [40, "xl"], [10, "x"], [9, "ix"], [5, "v"], [4, "iv"], [1, "i"],
];

/** A positive whole number as a lower-case Roman numeral, e.g. 4 → "iv". */
function lowerRoman(n: number): string {
  let rest = n;
  let out = "";
  for (const [value, numeral] of ROMAN_NUMERALS) {
    while (rest >= value) {
      out += numeral;
      rest -= value;
    }
  }
  return out;
}

/** Exomoon-style designation: the planet plus a Roman numeral from i outward, e.g. "0006 b-ii". */
export function moonName(starId: number, orbitalIndex: number, moonIndex: number): string {
  return `${planetName(starId, orbitalIndex)}-${lowerRoman(moonIndex + 1)}`;
}

/** Short names for the laws of physics, in the citation's order. */
const LAW_SHORT_NAME: Record<keyof typeof DEFAULT_CONFIG, string> = {
  gravityStrength:          "gravity",
  expansionRate:            "expansion",
  stellarIgnitionThreshold: "ignition",
  entropyRate:              "entropy",
  emergenceSensitivity:     "emergence",
  intelligenceModifier:     "intelligence",
};

/**
 * A designation as cited outside the app: universe, rules version, any laws that
 * differ from the defaults (exact values, so the citation can rebuild the universe),
 * then the designation, e.g. "AF-U-0001-86A0 · v10 · gravity 0.4 · 1300 c".
 */
export function citation(config: UniverseConfig, designation: string): string {
  const laws = (Object.keys(LAW_SHORT_NAME) as (keyof typeof DEFAULT_CONFIG)[])
    .filter((law) => config[law] !== DEFAULT_CONFIG[law])
    .map((law) => `${LAW_SHORT_NAME[law]} ${String(config[law])}`);
  const parts = [makeUniverseId(config.seed), `v${SIMULATION_RULES_VERSION}`];
  if (laws.length > 0) parts.push(laws.join(", "));
  parts.push(designation);
  return parts.join(" · ");
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
