// World history loop (Worlds Up Close, phase A2b).
//
// Why it exists: a planet is not a snapshot. Its star brightens, its interior
// cools, its air and water change, and its climate can freeze over, run away
// or hold steady for billions of years. This steps one solid planet from its
// formation to the present and records what happened, with any life that
// arises on it (C2.3b).
//
// How: 100 Myr steps from 0.5 Gyr after the star formed to the star's age
// (the last step is shortened to end exactly there). Each step:
//   1. Star      L(t) from luminosityAt: brightening on the main sequence,
//                then today's luminosity once the star has left it (R2).
//   2. Interior  τ(t) = clamp(√M · e^(−t / 8 Gyr)).
//   3. Climate   the 18-band energy balance (climate.ts), starting from the
//                previous step's ice, over oceans refilled from the step's water,
//                with the CO₂ that closes this step's carbon budget (below).
//   4. Chemistry
//      CO₂  outgassing G·τ·g² (doubled in a volcanic pulse) against weathering
//           K·g·(openLand·wetness + s·openOcean)·(CO₂/CO₂_ref)^½·e^((T − 288)/13.7).
//           Solved implicitly, before the climate: weathering runs to balance far
//           faster than 100 Myr, so each step finds the CO₂ at which the step's
//           budget closes. The ocean floor weathers too, at s = 15% of land's
//           rate per area (owner decision; about a quarter of Earth's total), so a
//           world with no land keeps a weaker thermostat. Frozen, dry or
//           steam-covered ground does not weather.
//      Water  above 340 K it reaches the upper air and escapes:
//           W ← W · (1 − E·Δt·(T − 340) / (v_esc / 11.2)). It never returns.
//      O₂   photolysis of the escaping water leaves oxygen behind; volcanic
//           gases (∝ τ) and unoxidised crust (which is used up) remove it.
//           Ozone = min(1, √(O₂ / 0.21 bar)). CH₄ is destroyed faster in O₂.
//           Life's O₂ and CH₄ each relax towards production / loss, solved
//           exactly over the step.
//   5. Events    impacts (a heavy early bombardment fading to a background)
//                and volcanic pulses (∝ τ), each from its own keyed draw.
//                Climate transitions are recorded with their dates.
//   6. Life      (C2.3b) until life has begun, a chance per step of it
//                beginning, ∝ liquid-water area × emergenceSensitivity; once
//                begun, one step of the evolution engine (evolution/engine.ts)
//                in this step's environment (evolution/environment.ts). Its
//                biomass feeds the next step's chemistry: light users make O₂
//                and chemical users CH₄; life respires O₂ in proportion to O₂ ×
//                its biomass. Life begins at most once; if it dies out, the
//                history keeps its record.
//   7. Record    a snapshot of the step, when asked for.
// After the last step, the present day is solved on all 642 cells (R5).
//
// Gravity (owner decisions): water is W · 33.75 km · g deep (geography.ts);
// outgassed gas becomes pressure ∝ τ·g² (gas per unit planet mass, spread over
// the area and weighed by g); weathering converts rock area, so its pressure
// scales with g; photolysis oxygen, like outgassing, scales with g².
//
// Two stable climates: each step's solve starts from the previous step's ice,
// so a planet can freeze over and stay frozen until volcanic CO₂, which frozen
// land cannot weather away, warms it enough to thaw. No code names snowballs.
//
// Water phase (R3): the moist greenhouse (above 340 K) loses water gradually.
// Past the boiling point set by total pressure the oceans are steam at once
// (the runaway greenhouse) and the escape continues from the steam. The steam
// weighs on the surface like the ocean it was (Earth's would be ~270 bar),
// which raises both the greenhouse and the boiling point, so the runaway holds
// until the water escapes or the star dims enough for it to condense again.
//
// Assumptions and limits:
// - The background pressure from the atmosphere class is fixed (R6); CO₂, O₂,
//   CH₄ and steam add to it. Steam warms only through that pressure.
// - Water in ice, rock and air is not separated from the ocean inventory.
// - Impacts are recorded but change nothing yet; they are catastrophes for
//   evolution (C2.3). Volcanic pulses change only this step's outgassing.
// - All constants are starting values, to be tuned in C2.10 with the reasons
//   recorded in Documents/evolution.md.

import { createRNG, mixSeed, SALT } from "./rng";
import { exp } from "./detmath";
import type { Planet } from "./planet";
import { effectiveOrbitAU } from "./planetBasics";
import type { PlanetPhysics } from "./planetPhysics";
import { tectonicActivity } from "./planetPhysics";
import type { Star } from "./star";
import { luminosityAt, mainSequenceEndGyr } from "./star";
import type { Geography } from "./geography";
import { areaBelow, BAND_COUNT, seaLevelFor, waterDepthKm } from "./geography";
import type { ClimateInputs, PresentClimate } from "./climate";
import {
  bandAlbedo, bandGeometry, boilingPointK, CO2_REFERENCE_BAR, equilibriumTemperatureK, greenhouseK,
  solveBands, solvePresentClimate,
} from "./climate";
import { makeConfig } from "./config";
import type { UniverseConfig } from "./config";
import { environmentContext, environmentFor } from "./evolution/environment";
import type { EnvironmentContext } from "./evolution/environment";
import { aerobicShare, startLife, stepEvolution } from "./evolution/engine";
import { TRAIT_RANGES } from "./evolution/genome";
import type { EvolutionState } from "./evolution/engine";

// ── Constants ─────────────────────────────────────────────────────────────────

const STEPS_PER_GYR = 10;
export const STEP_GYR = 1 / STEPS_PER_GYR;
/** The loop starts this long after the star forms; the same delay biosphere.ts uses. */
export const FORMATION_DELAY_GYR = 0.5;

// Carbon cycle. Outgassing is Earth-scaled (~30 bar of CO₂ per Gyr at full activity);
// weathering is calibrated so Earth today (τ ≈ 0.56, ~29% open land and ~66% open
// ocean, 288 K) balances at CO₂_ref.
const OUTGASSING_BAR_PER_GYR = 30;
const EARTH_TECTONICS_NOW = 0.5627;           // e^(−4.6 / 8)
const EARTH_OPEN_LAND = 0.29;
const EARTH_OPEN_OCEAN = 0.66;
/** The ocean floor's weathering per area, as a share of land's (seafloor basalt alteration). */
export const SEAFLOOR_WEATHERING_SHARE = 0.15;
const WEATHERING_BAR_PER_GYR = (OUTGASSING_BAR_PER_GYR * EARTH_TECTONICS_NOW)
  / (EARTH_OPEN_LAND + SEAFLOOR_WEATHERING_SHARE * EARTH_OPEN_OCEAN);
const WEATHERING_REFERENCE_K = 288;
const WEATHERING_WARMING_SCALE_K = 13.7;
const INITIAL_CO2_BAR = 0.01;
const CO2_SOLVE_MAX_ITERATIONS = 60;
const CO2_SOLVE_TOLERANCE = 1e-10;   // relative

// Surface water: below this inventory the planet counts as dry; wetness is W / WET_WATER, capped at 1
const WET_WATER = 0.005;
/** Below this inventory the oceans are lost for good (~34 m of water at g = 1). */
export const OCEANS_LOST_WATER = 0.001;

// Steam: water turned to vapour weighs on the surface like the ocean it was.
// 1 km of water at g = 1 presses with ~98 bar; W is 33.75 km · g deep, so W · 3,311 · g² bar.
const STEAM_BAR_PER_WATER = 98.1 * 33.75;

// Water loss in a moist greenhouse
export const MOIST_GREENHOUSE_K = 340;
const WATER_ESCAPE_PER_K_GYR = 0.015;
const EARTH_ESCAPE_VELOCITY_KMS = 11.2;

// Oxygen without life
const PHOTOLYSIS_O2_BAR_PER_WATER = 0.5;     // O₂ kept per unit of W lost, at g = 1; the rest escapes or oxidises at once
const VOLCANIC_O2_SINK_BAR_PER_GYR = 0.02;   // at τ = 1
const CRUST_O2_SINK_BAR_PER_GYR = 0.05;      // while the crust is fully unoxidised
const CRUST_O2_CAPACITY_BAR = 2;
export const O2_REFERENCE_BAR = 0.21;
/** O₂ above this counts as an oxidised atmosphere (about 1% of Earth's). */
export const OXIDATION_O2_BAR = 0.002;
const CH4_DESTRUCTION_PER_GYR = 10;

// Freezing over: ice on this share of the planet
export const FROZEN_ICE_SHARE = 0.9;

// Events
const IMPACT_BACKGROUND_PER_GYR = 2;
const IMPACT_EARLY_PER_GYR = 40;             // heavy bombardment just after formation
const IMPACT_EARLY_TIMESCALE_GYR = 0.15;
const VOLCANIC_PULSE_PER_GYR = 4;            // at τ = 1
const VOLCANIC_PULSE_OUTGASSING = 2;         // outgassing multiplier during a pulse

/** Draw purposes within the WORLD stream: each step's draw for each purpose is its own. */
const PURPOSE = { IMPACT: 1, VOLCANISM: 2, ORIGIN: 3 } as const;

// Life (C2.3b). Origin: a chance per Gyr per unit of liquid-water area (a share
// of the planet), × emergenceSensitivity; set so an Earth-like world (70%
// ocean) gets life within 0.5 Gyr of its oceans forming in 4 cases out of 5
// (owner decision: anchored on Earth). −ln(0.2) / (0.7 · 0.5 Gyr) ≈ 4.6.
const ORIGIN_PER_GYR_PER_WATER_AREA = 4.6;
// Life's oxygen (owner decision): light users make it, life respires it.
// Production per unit of light-user biomass (engine.ts units), × g like the
// other gases; respiration and decay take O₂ × total biomass × RESPIRATION.
// Their ratio sets the balance: Earth-like biomass (light ≈ 0.5 of 0.55) holds
// ~0.21 bar. Production is high enough that early anoxic light users (biomass
// ~0.02) outpace the crust and volcanic sinks, so oxidation can follow.
const O2_PRODUCTION_BAR_PER_GYR = 4;
const O2_RESPIRATION_PER_GYR = 17;
// Methane from chemical-energy life (methanogens), in proportion to the
// anaerobic share of a cell's metabolism; anoxic vent life (biomass ~1.5e-4)
// keeps ~1e-3 bar against the existing destruction.
const CH4_PRODUCTION_BAR_PER_GYR = 70;

// ── Types ─────────────────────────────────────────────────────────────────────

export type WorldEventKind =
  | "star-leaves-main-sequence"
  | "freezes-over"
  | "thaws"
  | "moist-greenhouse"
  | "runaway-greenhouse"
  | "oceans-lost"
  | "oxidation";

export interface WorldEvent {
  kind: WorldEventKind;
  /** Time since the star formed, Gyr. */
  tGyr: number;
}

/** The state of the planet at the end of a step. */
export interface WorldState {
  tGyr: number;
  luminosity: number;
  tectonicActivity: number;
  water: number;             // inventory, A1 scale
  co2Bar: number;
  o2Bar: number;
  ch4Bar: number;
  ozone: number;             // 0–1
  unoxidisedCrust: number;   // 0–1
  pressureBar: number;
  meanK: number;
  steam: boolean;            // oceans boiled into the air
  iceFraction: number;
  openOceanFraction: number;
  openLandFraction: number;
  bandK: Float64Array;
  iced: Uint8Array;
  /** Each band's share of liquid water (open or under ice), for the next step. */
  bandOcean: Float64Array;
  /** Life's biomass at the end of the step (engine.ts units): light users, chemical users, all. */
  lightBiomass: number;
  chemicalBiomass: number;
  totalBiomass: number;
}

export interface WorldSnapshot extends WorldState {
  /** Length of this step, Gyr (the last step is shortened to end at the star's age). */
  dtGyr: number;
  impact: boolean;
  volcanicPulse: boolean;
  /** The events recorded during this step. */
  events: WorldEventKind[];
}

export interface WorldHistory {
  /** The last step's state: the loop's final values. */
  final: WorldState;
  /** Solved on all 642 cells from the final values (R5). */
  present: PresentClimate;
  events: WorldEvent[];
  steps: number;
  /** Every step, when `keepSnapshots` is set. */
  snapshots?: WorldSnapshot[];
  /** Life's lineages, if life ever began (C2.3b); its `endedGyr` says whether it still lives. */
  life: EvolutionState | null;
}

export interface WorldHistoryOptions {
  keepSnapshots?: boolean;
}

// ── The loop ──────────────────────────────────────────────────────────────────

function wetnessOf(water: number): number {
  return Math.min(1, water / WET_WATER);
}

/**
 * The root of an increasing function between lo (f ≤ 0) and hi (f ≥ 0), by the
 * Illinois variant of regula falsi: it keeps the bracket like bisection but
 * converges in a handful of steps on smooth functions.
 */
function solveIncreasing(f: (x: number) => number, lo: number, hi: number): number {
  let fLo = f(lo);
  let fHi = f(hi);
  if (fLo >= 0) return lo;
  if (fHi <= 0) return hi;
  let side = 0;
  for (let i = 0; i < CO2_SOLVE_MAX_ITERATIONS && hi - lo > CO2_SOLVE_TOLERANCE * hi; i++) {
    const x = (lo * fHi - hi * fLo) / (fHi - fLo);
    const fx = f(x);
    if (fx === 0) return x;
    if (fx > 0) {
      hi = x; fHi = fx;
      if (side === 1) fLo /= 2;   // the same end moved twice: halve the other's weight
      side = 1;
    } else {
      lo = x; fLo = fx;
      if (side === -1) fHi /= 2;
      side = -1;
    }
  }
  return (lo * fHi - hi * fLo) / (fHi - fLo);
}

/** Whether this step's draw for a purpose happens, at a rate per Gyr. */
function happens(galaxySeed: number, planet: Planet, step: number, purpose: number, ratePerGyr: number, dtGyr: number): boolean {
  const draw = createRNG(mixSeed(galaxySeed, planet.hostStarId, planet.id, SALT.WORLD, step, purpose))();
  return draw < 1 - exp(-ratePerGyr * dtGyr);
}

/**
 * Steps a solid planet from its formation to the present, and solves its
 * present-day climate.
 */
export function runWorldHistory(
  planet: Planet, physics: PlanetPhysics, geography: Geography, star: Star, galaxySeed: number,
  cfg?: UniverseConfig, options: WorldHistoryOptions = {},
): WorldHistory {
  const config = cfg ?? makeConfig(galaxySeed);
  const orbitAU = effectiveOrbitAU(planet.orbitalRadius, config);
  const g = physics.surfaceGravity;
  const backgroundBar = physics.surfacePressureBar;
  const geometry = bandGeometry(physics.axialTiltDeg, physics.tidallyLocked);
  const msEnd = mainSequenceEndGyr(star);
  const escapeFactor = physics.escapeVelocityKms / EARTH_ESCAPE_VELOCITY_KMS;

  // Formation: warm, ice-free, with the water it was born with
  let state: WorldState = {
    tGyr: Math.min(star.age, FORMATION_DELAY_GYR),
    luminosity: luminosityAt(star, Math.min(star.age, FORMATION_DELAY_GYR)),
    tectonicActivity: tectonicActivity(planet, Math.min(star.age, FORMATION_DELAY_GYR)),
    water: physics.waterInventory,
    co2Bar: INITIAL_CO2_BAR,
    o2Bar: 0,
    ch4Bar: 0,
    ozone: 0,
    unoxidisedCrust: 1,
    pressureBar: backgroundBar + INITIAL_CO2_BAR,
    meanK: 0,
    steam: false,
    iceFraction: 0,
    openOceanFraction: 0,
    openLandFraction: 1,
    bandK: new Float64Array(BAND_COUNT),
    iced: new Uint8Array(BAND_COUNT),
    bandOcean: new Float64Array(BAND_COUNT),
    lightBiomass: 0,
    chemicalBiomass: 0,
    totalBiomass: 0,
  };

  const events: WorldEvent[] = [];
  const snapshots: WorldSnapshot[] | undefined = options.keepSnapshots ? [] : undefined;
  const bandOcean = new Float64Array(BAND_COUNT);
  let frozen = false;
  let moist = false;
  let oceansLost = physics.waterInventory < OCEANS_LOST_WATER;
  let oxidised = false;

  /** Total surface pressure: the background, the gases, and steam while the oceans are boiled. */
  const pressureOf = (co2: number, o2: number, ch4: number, water: number, steam: boolean) =>
    backgroundBar + co2 + o2 + ch4 + (steam ? STEAM_BAR_PER_WATER * water * g * g : 0);

  /**
   * Fills each band's liquid-water share from the current water inventory and
   * returns the sea level. Steam, or water below the oceans-lost threshold, fills nothing.
   */
  let filledFor = { water: NaN, steam: false };
  const fillOceans = (water: number, steam: boolean): number => {
    if (water === filledFor.water && steam === filledFor.steam) return seaLevelKm;
    filledFor = { water, steam };
    const noOceans = steam || water < OCEANS_LOST_WATER;
    const seaLevel = seaLevelFor(geography.hypsometry, noOceans ? 0 : waterDepthKm(water, g));
    geography.bands.forEach((band, k) => {
      bandOcean[k] = noOceans || band.area === 0 ? 0 : Math.min(1, areaBelow(band.hypsometry, seaLevel) / band.area);
    });
    return seaLevel;
  };

  // Life: the engine's fixed context, made once life can start; the keys of its streams
  let life: EvolutionState | null = null;
  let lifeContext: EnvironmentContext | null = null;
  const lifeKeys = { galaxySeed, starId: planet.hostStarId, planetIndex: planet.id };

  const stepCount = star.age > FORMATION_DELAY_GYR ? Math.ceil((star.age - FORMATION_DELAY_GYR) / STEP_GYR - 1e-9) : 0;
  let seaLevelKm = 0;
  seaLevelKm = fillOceans(state.water, false);
  state.bandOcean = Float64Array.from(bandOcean);

  for (let step = 1; step <= stepCount; step++) {
    const t0 = state.tGyr;
    // Whole steps over STEPS_PER_GYR, so step times are the nearest doubles to 0.6, 0.7, …
    const t = step === stepCount ? star.age : (FORMATION_DELAY_GYR * STEPS_PER_GYR + step) / STEPS_PER_GYR;
    const dt = t - t0;
    const eventsBefore = events.length;

    // 1–2. Star and interior
    const luminosity = luminosityAt(star, t);
    const tau = tectonicActivity(planet, t);
    if (star.age >= msEnd && t0 < msEnd && t >= msEnd) events.push({ kind: "star-leaves-main-sequence", tGyr: msEnd });

    // 5 (drawn first: the pulse feeds this step's chemistry)
    const impact = happens(galaxySeed, planet, step, PURPOSE.IMPACT,
      IMPACT_BACKGROUND_PER_GYR + IMPACT_EARLY_PER_GYR * exp(-t0 / IMPACT_EARLY_TIMESCALE_GYR), dt);
    const volcanicPulse = happens(galaxySeed, planet, step, PURPOSE.VOLCANISM, VOLCANIC_PULSE_PER_GYR * tau, dt);

    // 4a. CO₂: the step's budget closes at the CO₂ where CO₂ = CO₂₀ + (outgassing − weathering(CO₂))·Δt.
    // Weathering is judged against the step's starting ice and oceans, which is what the rock sees.
    const wetness = wetnessOf(state.water);
    const outgassing = OUTGASSING_BAR_PER_GYR * tau * g * g * (volcanicPulse ? VOLCANIC_PULSE_OUTGASSING : 1);
    // Weathering needs liquid water and rock: bare land as far as it is wet, and the
    // ocean floor at a fraction of land's rate; none under ice or while the oceans are steam
    let openLand = 0;
    let openOcean = 0;
    for (let k = 0; k < BAND_COUNT; k++) {
      if (state.iced[k]) continue;
      openLand += geometry.areas[k] * (1 - bandOcean[k]);
      openOcean += geometry.areas[k] * bandOcean[k];
    }
    const weatherableLand = state.steam ? 0 : openLand * wetness + SEAFLOOR_WEATHERING_SHARE * openOcean;
    const pressureAt = (co2: number) => pressureOf(co2, state.o2Bar, state.ch4Bar, state.water, state.steam);
    const inputsAt = (co2: number): ClimateInputs => ({
      luminosity, orbitAU, co2Bar: co2, ch4Bar: state.ch4Bar, wetness, pressureBar: pressureAt(co2),
    });
    let co2 = state.co2Bar + outgassing * dt;
    if (weatherableLand > 0) {
      const eqK = equilibriumTemperatureK(luminosity, orbitAU, bandAlbedo(geometry, bandOcean, state.iced, wetness));
      const weathering = (c: number) => {
        const meanK = eqK + greenhouseK(pressureAt(c), c, state.ch4Bar, wetness);
        return WEATHERING_BAR_PER_GYR * g * weatherableLand * Math.sqrt(c / CO2_REFERENCE_BAR)
          * exp((meanK - WEATHERING_REFERENCE_K) / WEATHERING_WARMING_SCALE_K);
      };
      const budget = (c: number) => c - state.co2Bar - (outgassing - weathering(c)) * dt;
      co2 = solveIncreasing(budget, 0, co2);
    }

    // 3. Climate, over oceans filled from this step's starting water
    const climate = solveBands(geometry, bandOcean, inputsAt(co2), state.iced);

    // 4b. Water escapes above the moist-greenhouse limit; its oxygen stays behind
    const escape = Math.min(1, (WATER_ESCAPE_PER_K_GYR * dt * Math.max(0, climate.meanK - MOIST_GREENHOUSE_K)) / escapeFactor);
    const waterLost = state.water * escape;
    const water = state.water - waterLost;

    // 4c. Oxygen, ozone and methane
    // Life's O₂ from last step's biomass (a one-step lag keeps the order explicit):
    // dO₂/dt = production − respiration·O₂, solved exactly over the step, so the
    // O₂ relaxes towards production / respiration however fast life turns it over
    const production = O2_PRODUCTION_BAR_PER_GYR * state.lightBiomass * g;
    const respiration = O2_RESPIRATION_PER_GYR * state.totalBiomass;
    const o2Living = respiration > 0
      ? production / respiration + (state.o2Bar - production / respiration) * exp(-respiration * dt)
      : state.o2Bar + production * dt;
    const o2Supplied = o2Living + PHOTOLYSIS_O2_BAR_PER_WATER * waterLost * g * g;
    const volcanicSink = VOLCANIC_O2_SINK_BAR_PER_GYR * tau * dt;
    const crustDemand = CRUST_O2_SINK_BAR_PER_GYR * state.unoxidisedCrust * dt;
    const volcanicTaken = Math.min(o2Supplied, volcanicSink);
    const crustTaken = Math.min(o2Supplied - volcanicTaken, crustDemand);
    const o2 = o2Supplied - volcanicTaken - crustTaken;
    const unoxidisedCrust = Math.max(0, state.unoxidisedCrust - crustTaken / CRUST_O2_CAPACITY_BAR);
    // dCH₄/dt = production − destruction·CH₄, solved exactly over the step (the
    // destruction is fast, ~0.1 Gyr, so an explicit step would wipe it out each time)
    // Methanogens work anaerobically: only the anaerobic share of a cell's metabolism makes methane
    const anaerobic = 1 - aerobicShare(state.o2Bar, TRAIT_RANGES.log10BodyMassKg.min);
    const ch4Production = CH4_PRODUCTION_BAR_PER_GYR * state.chemicalBiomass * anaerobic * g;
    const ch4Destruction = CH4_DESTRUCTION_PER_GYR * (1 + o2 / O2_REFERENCE_BAR);
    const ch4Balance = ch4Production / ch4Destruction;
    const ch4 = ch4Balance + (state.ch4Bar - ch4Balance) * exp(-ch4Destruction * dt);

    // Water phase for the next step (R3): oceans boil above the boiling point
    // under the air alone; steam condenses below it under the air and the steam
    const boilingK = boilingPointK(pressureOf(co2, o2, ch4, water, state.steam));
    const steam = water >= OCEANS_LOST_WATER && climate.meanK >= boilingK;
    if (steam && !state.steam && step > 1) events.push({ kind: "runaway-greenhouse", tGyr: t });
    seaLevelKm = fillOceans(water, steam);

    // 5. Climate transitions. The first step sets the starting climate: a world
    // frozen or steaming from its first step records no transition into it.
    const first = step === 1;
    const nowFrozen = climate.iceFraction >= FROZEN_ICE_SHARE;
    if (nowFrozen !== frozen && !first) events.push({ kind: nowFrozen ? "freezes-over" : "thaws", tGyr: t });
    frozen = nowFrozen;
    const nowMoist = climate.meanK > MOIST_GREENHOUSE_K && water >= OCEANS_LOST_WATER;
    if (nowMoist && !moist && !first) events.push({ kind: "moist-greenhouse", tGyr: t });
    moist = nowMoist;
    if (!oceansLost && water < OCEANS_LOST_WATER) { oceansLost = true; events.push({ kind: "oceans-lost", tGyr: t }); }
    if (!oxidised && o2 >= OXIDATION_O2_BAR) { oxidised = true; events.push({ kind: "oxidation", tGyr: t }); }

    const stepEvents = events.slice(eventsBefore).map((e) => e.kind);
    state = {
      tGyr: t, luminosity, tectonicActivity: tau, water, co2Bar: co2, o2Bar: o2, ch4Bar: ch4,
      ozone: Math.min(1, Math.sqrt(o2 / O2_REFERENCE_BAR)), unoxidisedCrust,
      pressureBar: pressureOf(co2, o2, ch4, water, steam),
      meanK: climate.meanK, steam, iceFraction: climate.iceFraction,
      openOceanFraction: climate.openOceanFraction, openLandFraction: climate.openLandFraction,
      bandK: climate.bandK, iced: climate.iced, bandOcean: Float64Array.from(bandOcean),
      lightBiomass: 0, chemicalBiomass: 0, totalBiomass: 0,
    };
    const snapshot: WorldSnapshot = { ...state, dtGyr: dt, impact, volcanicPulse, events: stepEvents };

    // 6. Life: once, a chance of beginning where there is liquid water; then one engine step per step
    if (life === null) {
      let waterArea = 0;
      if (!steam) for (let k = 0; k < BAND_COUNT; k++) waterArea += geometry.areas[k] * bandOcean[k];
      const originRate = ORIGIN_PER_GYR_PER_WATER_AREA * waterArea * config.emergenceSensitivity;
      if (waterArea > 0 && happens(galaxySeed, planet, step, PURPOSE.ORIGIN, originRate, dt)) {
        lifeContext = environmentContext(planet, physics, star, config);
        life = startLife(environmentFor(snapshot, lifeContext));
      }
    } else if (life.endedGyr === null) {
      life = stepEvolution(life, environmentFor(snapshot, lifeContext!), lifeKeys, step);
    }
    if (life !== null && life.endedGyr === null) {
      state.lightBiomass = snapshot.lightBiomass = life.lightBiomass;
      state.chemicalBiomass = snapshot.chemicalBiomass = life.chemicalBiomass;
      state.totalBiomass = snapshot.totalBiomass = life.totalBiomass;
    }
    snapshots?.push(snapshot);
  }

  // A star younger than the formation delay runs no steps: its planet is as it
  // formed, except that the loop's water-phase rule still holds (owner decision):
  // oceans above their boiling point under the air are steam. Like the loop's
  // first step, this sets the starting climate and records no event.
  if (stepCount === 0) {
    const climate = solveBands(geometry, bandOcean, {
      luminosity: state.luminosity, orbitAU, pressureBar: state.pressureBar, co2Bar: state.co2Bar,
      ch4Bar: state.ch4Bar, wetness: wetnessOf(state.water),
    }, state.iced);
    const steam = state.water >= OCEANS_LOST_WATER && climate.meanK >= boilingPointK(state.pressureBar);
    if (steam) seaLevelKm = fillOceans(state.water, true);
    state = { ...state, bandOcean: Float64Array.from(bandOcean), meanK: climate.meanK, iceFraction: climate.iceFraction,
      openOceanFraction: climate.openOceanFraction, openLandFraction: climate.openLandFraction,
      bandK: climate.bandK, iced: climate.iced,
      steam, pressureBar: pressureOf(state.co2Bar, state.o2Bar, state.ch4Bar, state.water, steam) };
  }

  const present = solvePresentClimate(geography, {
    luminosity: state.luminosity, orbitAU, pressureBar: state.pressureBar, co2Bar: state.co2Bar,
    ch4Bar: state.ch4Bar, wetness: wetnessOf(state.water),
  }, seaLevelKm, state.steam, physics.axialTiltDeg, physics.tidallyLocked, state.iced);

  return { final: state, present, events, steps: stepCount, snapshots, life };
}
