// Interior heat (Galaxy Through Time, IH1).
//
// Why it exists: a world is warmed from below as well as by its star. Moons
// kept liquid by tides (step 5b) and rogue planets with no star (step 5c)
// need that heat, and liquid water under ice depends on it (IH3).
//
// How: the heat flowing out through each square metre of surface follows the
// world's tectonic activity τ(t) = √M · e^(−t / 8 Gyr) (planetPhysics.ts), the
// rule that already sets its volcanism, scaled so Earth today gives its
// measured mean:
//   q(t)  = q⊕ · τ(t) / τ⊕          q⊕ = 0.087 W/m², τ⊕ = e^(−4.6 / 8) ≈ 0.563
//   T_int = (q / σ)^(1/4)           Earth: 35 K
// Full activity (τ = 1) gives about 0.155 W/m². Heat per unit area ∝ τ, and so
// is the gas the interior vents (decision 41).
//
// Assumptions and limits: one cooling law for every world, whatever its make-up;
// no tidal heat yet (MO3 adds it); τ is capped at 1, so the heaviest young
// worlds give no more than 0.155 W/m². Deterministic: it draws nothing.

import { pow } from "./detmath";
import type { Planet } from "./planet";
import { tectonicActivity } from "./planetPhysics";
import { SOLAR_AGE_GYR } from "./star";

/** Earth's mean surface heat flow, W/m². */
export const EARTH_HEAT_FLOW_W_M2 = 0.087;
/** The Stefan–Boltzmann constant, W/m²/K⁴. */
export const STEFAN_BOLTZMANN = 5.670374419e-8;

// Earth's tectonic activity today in the model: one Earth mass, 4.6 Gyr after its star formed
const EARTH_ACTIVITY_TODAY = tectonicActivity({ mass: 1 }, SOLAR_AGE_GYR);

/** The heat flowing out of a world's interior t Gyr after its star formed, W/m². */
export function interiorHeatFlow(planet: Pick<Planet, "mass">, tGyr: number): number {
  return (EARTH_HEAT_FLOW_W_M2 * tectonicActivity(planet, tGyr)) / EARTH_ACTIVITY_TODAY;
}

/** The temperature a surface radiating only this heat flow would have, K: (q / σ)^(1/4). */
export function interiorTemperatureK(heatFlowWm2: number): number {
  return pow(heatFlowWm2 / STEFAN_BOLTZMANN, 0.25);
}
