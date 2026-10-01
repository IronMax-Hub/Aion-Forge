// Atmospheric composition (Worlds Up Close, phase B1).
//
// Why it exists: life is detected from afar through the gases it leaves in its
// planet's air, seen against the starlight passing through it (the spectrum,
// B2–B5). This says what gases each atmosphere holds today, as mixing ratios.
//
// How it works:
// - Solid planets (Revision 1): the air is read from the world history's final
//   state (planet.surface), not modelled again. The background gas (R6) is
//   taken to be N₂. CO₂, O₂ and CH₄ are the loop's. Ozone is the loop's column,
//   a share of Earth's, turned into a mixing ratio over this planet's air
//   column. Water vapour follows Clausius–Clapeyron at the surface temperature,
//   at Earth's mean relative humidity, scaled by how much surface water there
//   is, and never more than the planet's whole water inventory; while the oceans
//   are boiled (the runaway greenhouse), the vapour is all of it.
// - N₂O is made by living things: microbes turn nitrate, which forms only
//   where there is oxygen, back into nitrogen and leak some N₂O on the way.
//   Sunlight destroys it within about a century, so only living biomass
//   holds it up: Earth's pre-industrial amount, scaled by the planet's living
//   biomass against Earth's and by the aerobic share of a microbe's metabolism
//   (the same share that stops methanogens in the world history), × g like
//   the loop's other gases. Life that has died out leaves none.
// - Technology: an active (not collapsed) civilization at the industrial stage
//   or beyond adds CO₂ and NO₂; one at the information age or beyond adds CFC-11
//   and CFC-12. Each is Earth's present-day amount per head (8 billion people),
//   times the civilization's population. CFCs break down within centuries, so
//   they mark only a civilization active now; a collapsed one leaves none.
// - Giants: H₂ and He with carbon, in Jupiter's proportions for gas giants and
//   Uranus's for ice giants. Carbon is shared between CH₄ and CO by chemical
//   equilibrium, CH₄ + H₂O ⇌ CO + 3 H₂, at the cloud-top temperature and 1 bar:
//   cool giants hold methane, hot ones (above ~1,100 K) carbon monoxide, as
//   real hot Jupiters do. NH₃ and H₂O start at Jupiter's deep abundances (the
//   water less what made CO) and are cold-trapped: above the clouds each is
//   limited to its saturation vapour pressure at the cloud-top temperature.
//
// Nothing here is rolled. Life's gases are present only where the history made
// them: a planet where life never began has no CH₄, no N₂O and no tech gases. O₂ is not
// proof of life: a planet that lost water to space keeps the oxygen of its
// photolysis (worldHistory.ts), with no life at all. That false positive is
// deliberate.
//
// Assumptions and limits:
// - Mixing ratios are for the whole air column, by number, and sum to 1. Height
//   structure, clouds and condensation in the air of solid planets are left
//   to the spectrum (B2).
// - N₂O is read from today's biomass, not from a nitrogen cycle in the world
//   history; it feeds nothing back.
// - Technology gases do not depend on the planet's size or gravity, and they
//   feed nothing back: the world history and its outcomes are unchanged.
// - Giants are in equilibrium at one level, 1 bar. Real hot giants mix gas up
//   from deeper, hotter layers faster than it can react ("quenching"), and above
//   ~2,000 K water itself splits; neither is modelled.
// - All abundances are approximations, with their sources noted beside them.

import { exp } from "./detmath";
import type { Planet } from "./planet";
import type { Civilization, TechStage } from "./civilization";
import { waterAsVapourBar, wetnessOf, O2_REFERENCE_BAR } from "./worldHistory";
import { aerobicShare } from "./evolution/engine";
import { TRAIT_RANGES } from "./evolution/genome";

export type Gas =
  | "N2" | "O2" | "O3" | "CO2" | "H2O" | "CH4" | "N2O" | "NO2" | "CFC11" | "CFC12"
  | "H2" | "He" | "NH3" | "CO";

export interface AtmosphereComposition {
  /** Mixing ratios by number, summing to 1; only the gases present. Empty for a planet with no air. */
  mixingRatios: Partial<Record<Gas, number>>;
  /** The pressure the ratios describe, bar: the surface for solid planets, the cloud tops for giants. */
  pressureBar: number;
}

// ── Water vapour (Clausius–Clapeyron) ─────────────────────────────────────────

const GAS_CONSTANT = 8.314;                  // J/(mol·K)
const WATER_TRIPLE_POINT_K = 273.16;
const WATER_TRIPLE_POINT_BAR = 0.006117;
const WATER_VAPORIZATION_J_PER_MOL = 44_000; // over liquid
const WATER_SUBLIMATION_J_PER_MOL = 51_100;  // over ice
/** Earth's mean relative humidity near the surface. */
const RELATIVE_HUMIDITY = 0.77;

/** Saturation vapour pressure, bar, from one anchor point and a latent heat. */
function saturationBar(temperatureK: number, anchorK: number, anchorBar: number, latentJPerMol: number): number {
  return anchorBar * exp((latentJPerMol / GAS_CONSTANT) * (1 / anchorK - 1 / temperatureK));
}

/** Water's saturation vapour pressure, bar: over liquid above the triple point, over ice below. */
export function waterSaturationBar(temperatureK: number): number {
  const latent = temperatureK >= WATER_TRIPLE_POINT_K ? WATER_VAPORIZATION_J_PER_MOL : WATER_SUBLIMATION_J_PER_MOL;
  return saturationBar(temperatureK, WATER_TRIPLE_POINT_K, WATER_TRIPLE_POINT_BAR, latent);
}

// ── Ozone ─────────────────────────────────────────────────────────────────────

// Earth's ozone column (~300 Dobson units, 8.1e18 molecules/cm²) over its air
// column (2.15e25 molecules/cm²). The column is set by the oxygen above it, so
// in thicker air the same column is a smaller share; as a partial pressure it
// weighs ∝ g.
const EARTH_OZONE_MIXING = 3.75e-7;

// ── Nitrous oxide (life) ──────────────────────────────────────────────────────

const EARTH_N2O_BAR = 2.7e-7;     // ~270 ppb before industry
/** Earth's living biomass in the engine's units (worldHistory.ts: ~0.55). */
const EARTH_BIOMASS = 0.55;
const MICROBE_LOG10_KG = TRAIT_RANGES.log10BodyMassKg.min;

/** N₂O held up by living biomass, bar: Earth's amount at Earth's biomass and oxygen. */
function lifeN2OBar(totalBiomass: number, o2Bar: number, g: number): number {
  const oxic = aerobicShare(o2Bar, MICROBE_LOG10_KG) / aerobicShare(O2_REFERENCE_BAR, MICROBE_LOG10_KG);
  return EARTH_N2O_BAR * (totalBiomass / EARTH_BIOMASS) * oxic * g;
}

// ── Technology (Earth today, per 8 billion people) ────────────────────────────

const EARTH_POPULATION_BILLIONS = 8;
const INDUSTRIAL_CO2_BAR = 1.4e-4;     // 280 → 420 ppm since 1750
const INDUSTRIAL_NO2_BAR = 5e-11;      // tropospheric column ~1e15 molecules/cm², mostly from combustion
const CFC11_BAR = 2.2e-10;             // ~220 ppt
const CFC12_BAR = 4.9e-10;             // ~490 ppt
const INDUSTRIAL_STAGES: TechStage[] = ["industrial", "information", "space-age"];
const INFORMATION_STAGES: TechStage[] = ["information", "space-age"];

// ── Giants ────────────────────────────────────────────────────────────────────

// By number. Gas giants: Jupiter (Galileo probe: He 13.6%, CH₄ 0.18%).
// Ice giants: Uranus (Voyager 2: He 15.2%, CH₄ 2.3% below the clouds). H₂ is the rest.
// The CH₄ figure is all the carbon; chemistry decides how much of it stays CH₄.
const GIANT_BULK = {
  "gas-giant": { He: 0.136, CH4: 1.8e-3 },
  "ice-giant": { He: 0.152, CH4: 2.3e-2 },
} as const;
// Deep abundances of the condensing gases, Jupiter's (Juno: NH₃ ~3.3e-4, H₂O ~2.5e-3)
const GIANT_DEEP_NH3 = 3.3e-4;
const GIANT_DEEP_H2O = 2.5e-3;
// Ammonia ice: saturation anchored at the triple point
const AMMONIA_TRIPLE_POINT_K = 195.4;
const AMMONIA_TRIPLE_POINT_BAR = 0.0606;
const AMMONIA_SUBLIMATION_J_PER_MOL = 31_200;
/** The level the cold trap, the carbon equilibrium and the ratios refer to: about the cloud tops. */
const GIANT_REFERENCE_BAR = 1;
// CH₄ + H₂O ⇌ CO + 3 H₂: reaction enthalpy and entropy near 1,000 K, where it
// matters (JANAF). K = 1 at ~890 K; at 1 bar in Jupiter's mix CO equals CH₄ near 1,100 K.
const METHANE_TO_CO_ENTHALPY_J_PER_MOL = 225_900;
const METHANE_TO_CO_ENTROPY_J_PER_MOL_K = 253;

// ── Composition ───────────────────────────────────────────────────────────────

/** Turns partial pressures into mixing ratios over their sum, leaving out the gases that are absent. */
function fromPartials(partials: Partial<Record<Gas, number>>): AtmosphereComposition {
  const present = Object.entries(partials).filter(([, bar]) => bar! > 0) as [Gas, number][];
  const total = present.reduce((sum, [, bar]) => sum + bar, 0);
  const mixingRatios: Partial<Record<Gas, number>> = {};
  for (const [gas, bar] of present) mixingRatios[gas] = bar / total;
  return { mixingRatios, pressureBar: total };
}

/** A solid planet's air as its world history left it, with what an active civilization adds. */
function solidComposition(planet: Planet, civilization: Civilization | null): AtmosphereComposition {
  const s = planet.surface!;
  const g = s.surfaceGravity;
  const allWater = waterAsVapourBar(s.water, g);
  const vapour = s.steam
    ? allWater
    : Math.min(allWater, RELATIVE_HUMIDITY * wetnessOf(s.water) * waterSaturationBar(planet.temperature));

  const active = civilization !== null && civilization.techStage !== "collapsed";
  const perHead = active ? civilization.population / EARTH_POPULATION_BILLIONS : 0;
  const industrial = active && INDUSTRIAL_STAGES.includes(civilization.techStage) ? perHead : 0;
  const information = active && INFORMATION_STAGES.includes(civilization.techStage) ? perHead : 0;

  const totalBiomass = planet.life && planet.life.endedGyr === null ? planet.life.phylogeny.totalBiomass : 0;

  return fromPartials({
    N2: s.backgroundBar,
    CO2: s.co2Bar + INDUSTRIAL_CO2_BAR * industrial,
    O2: s.o2Bar,
    O3: EARTH_OZONE_MIXING * s.ozone * g,
    CH4: s.ch4Bar,
    H2O: vapour,
    N2O: lifeN2OBar(totalBiomass, s.o2Bar, g),
    NO2: INDUSTRIAL_NO2_BAR * industrial,
    CFC11: CFC11_BAR * information,
    CFC12: CFC12_BAR * information,
  });
}

/**
 * How much of a giant's carbon is CO at equilibrium, as a mixing ratio, given
 * its carbon and water. CO = Q · (C − CO) · (O − CO) with Q = K / (P² · x_H₂³);
 * the smaller root of that quadratic, in a form that stays exact when Q is tiny.
 */
function equilibriumCO(temperatureK: number, carbon: number, water: number, h2: number): number {
  const k = exp(METHANE_TO_CO_ENTROPY_J_PER_MOL_K / GAS_CONSTANT
    - METHANE_TO_CO_ENTHALPY_J_PER_MOL / (GAS_CONSTANT * temperatureK));
  const q = k / (GIANT_REFERENCE_BAR * GIANT_REFERENCE_BAR * h2 * h2 * h2);
  const b = q * (carbon + water) + 1;
  return (2 * q * carbon * water) / (b + Math.sqrt(b * b - 4 * q * q * carbon * water));
}

/** A giant's air at its cloud tops: hydrogen and helium, with carbon as chemistry leaves it and what is not frozen out. */
function giantComposition(planet: Planet): AtmosphereComposition {
  const bulk = planet.type === "ice-giant" ? GIANT_BULK["ice-giant"] : GIANT_BULK["gas-giant"];
  const t = planet.temperature;
  const co = equilibriumCO(t, bulk.CH4, GIANT_DEEP_H2O, 1 - bulk.He - bulk.CH4);
  const ch4 = bulk.CH4 - co;
  const nh3 = Math.min(GIANT_DEEP_NH3,
    saturationBar(t, AMMONIA_TRIPLE_POINT_K, AMMONIA_TRIPLE_POINT_BAR, AMMONIA_SUBLIMATION_J_PER_MOL) / GIANT_REFERENCE_BAR);
  const h2o = Math.min(GIANT_DEEP_H2O - co, waterSaturationBar(t) / GIANT_REFERENCE_BAR);
  const h2 = 1 - bulk.He - ch4 - co - nh3 - h2o;
  const composition = fromPartials({ H2: h2, He: bulk.He, CH4: ch4, CO: co, NH3: nh3, H2O: h2o });
  return { ...composition, pressureBar: GIANT_REFERENCE_BAR };
}

/**
 * What gases a planet's atmosphere holds today, as mixing ratios. `civilization`
 * is the planet's (generateCivilization), or null if it has none.
 */
export function atmosphereComposition(planet: Planet, civilization: Civilization | null): AtmosphereComposition {
  return planet.surface ? solidComposition(planet, civilization) : giantComposition(planet);
}
