// Detection and interpretation (Worlds Up Close, phase B4).
//
// Why it exists: a noisy spectrum (observation.ts) does not say what it
// shows. An astronomer asks, gas by gas, whether the data need it: how much
// worse the best explanation fits once that gas is taken away. That
// significance, and what the detected gases together can and cannot prove, is
// what this reports.
//
// How:
// - Significance per gas: χ² of the data against the model spectrum with the
//   planet's full air, and against the same model with that gas removed (the
//   others filling its share, the pressure kept). σ = √(χ²_without − χ²_with),
//   0 where noise makes the gas look unneeded. Only gases with absorption
//   bands are tested; N₂, H₂ and He are the air's bulk.
// - Detected: σ ≥ 3.
// - Verdict, the first that applies:
//     CFC-11 or CFC-12 detected            Technosignature
//     O₂ or O₃ detected, with CH₄           Strong biosignature (chemical
//                                           disequilibrium: each destroys the other,
//                                           so both lasting needs a source)
//     CH₄ detected on a temperate solid     Possible biosignature
//     world, or N₂O detected
//     O₂ or O₃ detected                     Ambiguous: could be abiotic
//     any other gas detected                Atmosphere detected
//     nothing detected                      No detection at this depth
//   N₂O (owner decision in B1 that it be made) has few abiotic sources, so it
//   is read like methane on a temperate world. A world whose oxygen came from
//   water lost to space carries no methane or N₂O, so it can never read as
//   more than ambiguous: the deliberate false positive stays a false positive.
//
// Assumptions and limits:
// - The observer is handed the right model: the planet's own temperature,
//   gravity, clouds and the other gases' amounts. Real retrievals must fit
//   those too and would find less.
// - √Δχ² is the usual approximation for one parameter; it assumes Gaussian
//   noise, which observation.ts gives.
// - Significance is read from the data, so near 3σ it can move either way as
//   transits are added; the evidence builds up because the data do.
// - Presentation of simulation data: nothing here changes the universe.

import type { Planet } from "./planet";
import type { Star } from "./star";
import type { AtmosphereComposition, Gas } from "./atmosphereComposition";
import { BANDS, transitSpectrum } from "./spectrum";
import { cloudDeckOf } from "./clouds";
import type { Observation } from "./observation";

/** Significance at which a gas counts as detected, σ. */
export const DETECTION_SIGMA = 3;
/** Surface temperatures at which a solid world counts as temperate, K: roughly where liquid water can last. */
const TEMPERATE_K = { min: 250, max: 350 };

export type Verdict =
  | "technosignature"
  | "strong-biosignature"
  | "possible-biosignature"
  | "ambiguous"
  | "atmosphere"
  | "none";

export const VERDICT_LABEL: Record<Verdict, string> = {
  technosignature:         "Technosignature",
  "strong-biosignature":   "Strong biosignature (chemical disequilibrium)",
  "possible-biosignature": "Possible biosignature",
  ambiguous:               "Ambiguous: could be abiotic",
  atmosphere:              "Atmosphere detected, no biosignature",
  none:                    "No detection at this depth",
};

/** Verdicts from least to most telling. */
export const VERDICT_ORDER: readonly Verdict[] = [
  "none", "atmosphere", "ambiguous", "possible-biosignature", "strong-biosignature", "technosignature",
];

export interface GasDetection {
  gas: Gas;
  /** Significance, σ. */
  sigma: number;
}

export interface Detection {
  /** Every gas with absorption bands in the air, most significant first. */
  gases: GasDetection[];
  verdict: Verdict;
}

/** Gases that have absorption bands, in the band table's order. */
const BAND_GASES: readonly Gas[] = [...new Set(BANDS.map((band) => band.gas))];

/** The same air without one gas: the others fill its share, the pressure is kept. */
function without(composition: AtmosphereComposition, gas: Gas): AtmosphereComposition {
  const rest = (Object.entries(composition.mixingRatios) as [Gas, number][]).filter(([g]) => g !== gas);
  const total = rest.reduce((sum, [, x]) => sum + x, 0);
  const mixingRatios: Partial<Record<Gas, number>> = {};
  for (const [g, x] of rest) mixingRatios[g] = x / total;
  return { mixingRatios, pressureBar: composition.pressureBar };
}

function chiSquared(observation: Observation, model: number[]): number {
  let chi2 = 0;
  for (let k = 0; k < model.length; k++) {
    const pull = (observation.depthPpm[k] - model[k]) / observation.uncertaintyPpm[k];
    chi2 += pull * pull;
  }
  return chi2;
}

/** The verdict a set of detected gases supports. */
export function verdictFor(detected: ReadonlySet<Gas>, planet: Planet): Verdict {
  const oxygen = detected.has("O2") || detected.has("O3");
  const temperateSolid = planet.surface !== null
    && planet.temperature >= TEMPERATE_K.min && planet.temperature <= TEMPERATE_K.max;
  if (detected.has("CFC11") || detected.has("CFC12")) return "technosignature";
  if (oxygen && detected.has("CH4")) return "strong-biosignature";
  if ((detected.has("CH4") && temperateSolid) || detected.has("N2O")) return "possible-biosignature";
  if (oxygen) return "ambiguous";
  if (detected.size > 0) return "atmosphere";
  return "none";
}

/**
 * What an observation of a planet supports: each gas's significance and a
 * verdict. `composition` is the planet's air (atmosphereComposition), the
 * model the observer tests.
 */
export function detectGases(observation: Observation, planet: Planet, star: Star, composition: AtmosphereComposition): Detection {
  // The clouds stay as they are while a gas is taken away: removing water must not clear the sky
  const clouds = cloudDeckOf(planet, composition);
  const chi2With = chiSquared(observation, transitSpectrum(planet, star, composition, clouds).depthPpm);
  const gases = BAND_GASES
    .filter((gas) => composition.mixingRatios[gas] !== undefined)
    .map((gas) => {
      const chi2Without = chiSquared(observation, transitSpectrum(planet, star, without(composition, gas), clouds).depthPpm);
      return { gas, sigma: Math.sqrt(Math.max(0, chi2Without - chi2With)) };
    })
    .sort((a, b) => b.sigma - a.sigma);
  const detected = new Set(gases.filter((g) => g.sigma >= DETECTION_SIGMA).map((g) => g.gas));
  return { gases, verdict: verdictFor(detected, planet) };
}
