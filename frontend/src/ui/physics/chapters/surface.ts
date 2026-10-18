// Chapters 6, 7 and 8 of the Physics page: geography, climate, and a world's history (PH2).

import {
  BAND_COUNT, CONTINENTAL_BASE_KM, CONTINENTAL_SHARE, OCEANIC_BASE_KM, PLATES, RIFT_KM, UPLIFT_KM, WATER_KM_PER_UNIT,
} from "../../../simulation/geography";
import {
  ALBEDO, CO2_REFERENCE_BAR, CONTRAST_MAX_K, EQUILIBRIUM_K_AT_1_AU, FREEZING_K, GREENHOUSE_BASE_K,
  GREENHOUSE_PER_CO2_DOUBLING_K, GREENHOUSE_PER_SQRT_CH4_K, REDISTRIBUTION_HALF_BAR, VAPOUR_FEEDBACK, WATER_CRITICAL_K,
} from "../../../simulation/climate";
import {
  CH4_DESTRUCTION_PER_GYR, CRUST_O2_CAPACITY_BAR, CRUST_O2_SINK_BAR_PER_GYR, FORMATION_DELAY_GYR, FROZEN_ICE_SHARE,
  IMPACT_BACKGROUND_PER_GYR, IMPACT_EARLY_PER_GYR, IMPACT_EARLY_TIMESCALE_GYR, MOIST_GREENHOUSE_K, O2_REFERENCE_BAR,
  OCEANS_LOST_WATER, OUTGASSING_BAR_PER_GYR, OXIDATION_O2_BAR, PHOTOLYSIS_O2_BAR_PER_WATER, SEAFLOOR_WEATHERING_SHARE,
  STEP_GYR, VOLCANIC_O2_SINK_BAR_PER_GYR, VOLCANIC_PULSE_OUTGASSING, VOLCANIC_PULSE_PER_GYR, WATER_ESCAPE_PER_K_GYR,
  WEATHERING_REFERENCE_K, WEATHERING_WARMING_SCALE_K,
} from "../../../simulation/worldHistory";
import { atmosphereClassOf, EARTH_ESCAPE_VELOCITY_KMS, SURFACE_PRESSURE_BAR } from "../../../simulation/planetPhysics";
import { ATMOSPHERE_CODES, INDEX_FLAG } from "../../../simulation/universeIndex";
import type { UniverseIndex } from "../../../simulation/universeIndex";
import { formatInt, formatPercent, formatSig } from "../../format";
import type { Chapter } from "../catalogue";
import { exact, median, rowsWhere, said } from "../catalogue";

const solidRows = (ix: UniverseIndex) => rowsWhere(ix, (i) => !Number.isNaN(ix.oceanFraction[i]));
const flagged = (ix: UniverseIndex, bit: number) => rowsWhere(ix, (i) => (ix.flags[i] & bit) !== 0).length;

export const geography: Chapter = {
  id: "geography",
  title: "Geography",
  intro: "Plates, mountains and the sea level that a planet's water fills to, drawn once for its whole life.",
  cards: [
    {
      id: "plates-relief",
      title: "Plates, continents and relief",
      statement: "A solid planet's surface is cut into plates; each is continental (high) or oceanic (low), more often continental on planets active when young. Colliding plates raise mountains, separating ones open rifts. Everything is scaled by gravity, so small worlds have taller relief.",
      rule: `${PLATES.min}–${PLATES.min + PLATES.extra} plates; continental with chance ${CONTINENTAL_SHARE} × τ(0); base ${CONTINENTAL_BASE_KM} km or ${OCEANIC_BASE_KM} km, uplift up to ${UPLIFT_KM} km, rift ${RIFT_KM} km; all ÷ g`,
      constants: [{ name: "Continental share at full activity", value: exact(CONTINENTAL_SHARE), meaning: "× the planet's activity at formation" }],
      why: "Continents are buoyant crust that active interiors make; mountains rise where plates meet.",
      limits: ["Continents never move: the surface is drawn once.", "About 1,100 km per cell: no single peaks or island chains."],
      laws: [],
      code: "simulation/geography.ts · buildGeography",
      needsIndex: true,
      effect: (ctx) => {
        const ix = ctx.index!;
        const solid = solidRows(ix);
        const withLand = solid.filter((i) => ix.landFraction[i] > 0).length;
        return [said(`${formatInt(withLand)} of ${formatInt(solid.length)} solid planets have exposed land today.`, "index.landFraction")];
      },
    },
    {
      id: "ocean-depth",
      title: "Ocean depth, and why super-Earths drown",
      statement: "A planet's water spreads into a global layer whose depth grows with its water and its gravity. Oceans fill the lowest ground first, up to a sea level that holds exactly that volume.",
      rule: `layer depth = W × ${formatSig(WATER_KM_PER_UNIT)} km × g`,
      constants: [{ name: "Depth per unit of water", value: `${formatSig(WATER_KM_PER_UNIT)} km`, meaning: "Earth: W = 0.08 gives 2.7 km" }],
      why: "Water is counted per unit of planet mass: a heavier planet has more water spread over a surface that grows more slowly than its mass, while its relief is lower (÷ g). So heavy worlds are drowned.",
      limits: ["Water in ice, rock and air is not separated from the ocean."],
      laws: [],
      code: "simulation/geography.ts · waterDepthKm, seaLevelFor",
      needsIndex: true,
      effect: (ctx) => {
        const ix = ctx.index!;
        const solid = solidRows(ix);
        const oceans = solid.map((i) => ix.oceanFraction[i]);
        return [said(`Median open-water cover today is ${formatPercent(median(oceans))}; ${formatInt(oceans.filter((o) => o > 0.9).length)} solid planets are more than 90% ocean.`, "index.oceanFraction")];
      },
    },
  ],
  missing: ["No plate motion over time, no erosion, no sediment."],
};

export const climate: Chapter = {
  id: "climate",
  title: "Climate",
  intro: `Starlight in, heat out, and the air in between: an energy balance on ${BAND_COUNT} bands, solved at every step of a world's history.`,
  cards: [
    {
      id: "energy-balance",
      title: "Starlight and albedo",
      statement: "A planet is as warm as the starlight it absorbs allows; ocean, land and ice reflect different shares. Ice reflects most, so more ice cools a world and makes more ice.",
      rule: `T_eq = ${EQUILIBRIUM_K_AT_1_AU} K × (L / a²)^¼ × (1 − albedo)^¼`,
      constants: [
        { name: "Albedo: ocean", value: exact(ALBEDO.ocean), meaning: "Clouds included" },
        { name: "Albedo: land", value: exact(ALBEDO.land), meaning: "" },
        { name: "Albedo: ice", value: exact(ALBEDO.ice), meaning: "" },
      ],
      why: "The Stefan–Boltzmann balance of absorbed and emitted energy. Earth, at albedo 0.3, gets 255 K before its greenhouse.",
      limits: ["Clouds are folded into the albedos and do not respond to climate."],
      laws: [{ law: "gravityStrength", how: "Closer effective orbits receive more light" }],
      code: "simulation/climate.ts · equilibriumTemperatureK, bandAlbedo",
      needsIndex: true,
      effect: (ctx) => {
        const ix = ctx.index!;
        const temps = solidRows(ix).map((i) => ix.temperatureK[i]);
        return [said(`Solid planets' median surface temperature is ${formatInt(median(temps))} K; ${formatInt(temps.filter((t) => t >= 273 && t <= 373).length)} lie between water's freezing and boiling points at 1 atm.`, "index.temperatureK")];
      },
    },
    {
      id: "greenhouse",
      title: "The greenhouse",
      statement: "Air warms a planet: more pressure, more CO₂ and methane warm it more, and water vapour multiplies the warming on wet worlds. Earth gets 33 K.",
      rule: `ΔT = (${GREENHOUSE_BASE_K} K × √P + ${GREENHOUSE_PER_CO2_DOUBLING_K} K × log₂(CO₂ / ${CO2_REFERENCE_BAR}) + ${GREENHOUSE_PER_SQRT_CH4_K} K × √CH₄) / (1 − ${VAPOUR_FEEDBACK} × wetness)`,
      constants: [
        { name: "Per CO₂ doubling (dry)", value: exact(GREENHOUSE_PER_CO2_DOUBLING_K, "K"), meaning: "3 K with water vapour: Earth's climate sensitivity" },
        { name: "Vapour feedback", value: exact(VAPOUR_FEEDBACK), meaning: "" },
      ],
      why: "Greenhouse gases absorb the heat a surface radiates; warmer air holds more water vapour, itself a greenhouse gas.",
      limits: ["The warming is added in kelvin however little starlight arrives, so very distant worlds under thick air can stay warm (issue 1, fixed in step 5a)."],
      laws: [],
      code: "simulation/climate.ts · greenhouseK",
      needsIndex: true,
      effect: (ctx) => {
        const ix = ctx.index!;
        const solid = solidRows(ix);
        const thick = solid.filter((i) => ["thick", "crushing"].includes(atmosphereClassOf(ix.pressureBar[i]))).length;
        return [said(`Median surface pressure today is ${formatSig(median(solid.map((i) => ix.pressureBar[i])))} bar; ${formatInt(thick)} solid planets have thick or crushing air.`, "index.pressureBar")];
      },
    },
    {
      id: "heat-transport",
      title: "Heat spreading round the planet",
      statement: "Thin air leaves sharp contrasts between lit and dark regions; thick air evens them out. A locked planet's night side is the extreme case.",
      rule: `contrast = ${CONTRAST_MAX_K} K × ${REDISTRIBUTION_HALF_BAR} / (P + ${REDISTRIBUTION_HALF_BAR})`,
      constants: [],
      why: "Air and oceans carry heat; the more air, the more they carry.",
      limits: ["No seasons, day–night cycle on rotating planets, or ocean currents beyond this one rule."],
      laws: [],
      code: "simulation/climate.ts · contrastK, relativeInsolation",
      noEffect: "Regional temperatures are kept per planet, not in the index; each planet's panel shows its range.",
    },
    {
      id: "ice",
      title: "Ice, and worlds that freeze over",
      statement: `Below ${FREEZING_K} K water turns to ice. Each step starts from the last step's ice, so a planet can freeze over and stay frozen until volcanic CO₂ builds up enough to thaw it.`,
      constants: [
        { name: "Freezing", value: exact(FREEZING_K, "K"), meaning: "Sea ice and snow form below this" },
        { name: "Frozen over", value: `≥ ${formatPercent(FROZEN_ICE_SHARE)} ice`, meaning: "" },
      ],
      why: "Ice's high albedo makes two stable climates for the same sunlight; Earth's snowball episodes are the real case. Nothing in the code names snowballs: they emerge.",
      limits: ["Frozen ground does not weather, which is what lets CO₂ build up to thaw it."],
      laws: [],
      code: "simulation/climate.ts · solveBands; simulation/worldHistory.ts",
      needsIndex: true,
      effect: (ctx) => {
        const ix = ctx.index!;
        const frozenToday = rowsWhere(ix, (i) => ix.iceFraction[i] >= FROZEN_ICE_SHARE).length;
        return [said(`${formatInt(flagged(ix, INDEX_FLAG.FROZE_OVER))} worlds froze over at least once; ${formatInt(frozenToday)} are frozen over today.`, "index.flags.FROZE_OVER", "index.iceFraction")];
      },
    },
    {
      id: "boiling",
      title: "Boiling oceans",
      statement: "Water boils at a temperature set by the total air pressure. Past it, a world's oceans turn to steam at once, and the steam's own weight and warmth hold the runaway until the water escapes.",
      rule: `boiling point by Clausius–Clapeyron, capped at water's critical point (${WATER_CRITICAL_K} K)`,
      constants: [],
      why: "A runaway greenhouse: Venus's likely fate.",
      limits: ["Under thick air the model keeps oceans on worlds absorbing more than the runaway limit (decision 6)."],
      laws: [],
      code: "simulation/climate.ts · boilingPointK; simulation/worldHistory.ts",
      needsIndex: true,
      effect: (ctx) => {
        const ix = ctx.index!;
        return [said(`${formatInt(flagged(ix, INDEX_FLAG.RUNAWAY))} worlds had a runaway greenhouse; ${formatInt(flagged(ix, INDEX_FLAG.STEAM_TODAY))} have steam oceans today.`, "index.flags.RUNAWAY", "index.flags.STEAM_TODAY")];
      },
    },
  ],
  missing: ["No seasons, weather, or ocean currents; clouds do not respond to climate."],
};

export const history: Chapter = {
  id: "history",
  title: "A world's history",
  intro: "Every solid planet is stepped from its formation to today: its star brightens, its interior cools, its air and water change, and it can freeze, boil or lose its oceans.",
  cards: [
    {
      id: "steps",
      title: "Steps through time",
      statement: `A world's history runs in steps of ${formatInt(STEP_GYR * 1000)} Myr, from ${FORMATION_DELAY_GYR} Gyr after its star formed to today.`,
      constants: [
        { name: "Step", value: exact(STEP_GYR, "Gyr"), meaning: "" },
        { name: "Start", value: exact(FORMATION_DELAY_GYR, "Gyr"), meaning: "After the star formed" },
      ],
      why: "Fine enough for climate transitions and evolution, coarse enough to run thousands of histories in a minute.",
      limits: ["A world whose star is younger than the start runs no steps: today is its formation state."],
      laws: [],
      code: "simulation/worldHistory.ts · runWorldHistory",
      needsIndex: true,
      effect: (ctx) => {
        const ix = ctx.index!;
        const young = solidRows(ix).filter((i) => ctx.stars[ix.starId[i]].age < FORMATION_DELAY_GYR).length;
        return [said(`${formatInt(young)} solid planets orbit stars younger than ${FORMATION_DELAY_GYR} Gyr and have no history yet.`, "index.starId", "star.age")];
      },
    },
    {
      id: "carbon-cycle",
      title: "The carbon cycle: a thermostat",
      statement: "Volcanoes add CO₂; rain weathering rock removes it, faster when warmer. Each step finds the CO₂ at which the two balance, so a cooling world gains CO₂ and warms again. The sea floor weathers too, more weakly, so a landless world has a weaker thermostat.",
      rule: `outgassing ${OUTGASSING_BAR_PER_GYR} bar/Gyr × τ × g² (× ${VOLCANIC_PULSE_OUTGASSING} in a pulse); weathering ∝ g × (land × wetness + ${SEAFLOOR_WEATHERING_SHARE} × ocean) × √(CO₂ / CO₂_ref) × e^((T − ${WEATHERING_REFERENCE_K}) / ${WEATHERING_WARMING_SCALE_K})`,
      constants: [
        { name: "Seafloor weathering", value: formatPercent(SEAFLOOR_WEATHERING_SHARE), meaning: "Of land's rate per area" },
        { name: "Volcanic pulses", value: `${VOLCANIC_PULSE_PER_GYR} per Gyr × τ`, meaning: "Double the step's outgassing" },
      ],
      why: "The carbonate–silicate cycle keeps Earth habitable over billions of years as the Sun brightens.",
      limits: ["Frozen, dry or steam-covered ground does not weather.", "No carbon cap: extreme close-in magma worlds pile up CO₂."],
      laws: [],
      code: "simulation/worldHistory.ts",
      needsIndex: true,
      effect: (ctx) => {
        const ix = ctx.index!;
        const solid = solidRows(ix);
        const background = (i: number) => SURFACE_PRESSURE_BAR[ATMOSPHERE_CODES[ix.formationAtmosphere[i]]];
        const thickened = solid.filter((i) => ix.pressureBar[i] > 2 * background(i)).length;
        return [said(`${formatInt(thickened)} solid planets have more than twice the background air they formed with: gases their history added (CO₂, oxygen, methane or steam) outweigh it.`, "index.pressureBar", "index.formationAtmosphere")];
      },
    },
    {
      id: "water-loss",
      title: "Losing water to space",
      statement: `Above ${MOIST_GREENHOUSE_K} K water rises into the upper air, is split by starlight and escapes; weak gravity loses it faster. Below a small remainder the oceans are gone for good.`,
      rule: `W ← W × (1 − ${WATER_ESCAPE_PER_K_GYR} × Δt × (T − ${MOIST_GREENHOUSE_K}) / (v_esc / ${EARTH_ESCAPE_VELOCITY_KMS} km/s))`,
      constants: [{ name: "Oceans lost below", value: exact(OCEANS_LOST_WATER), meaning: "About 34 m of water at 1 g" }],
      why: "The moist greenhouse: how Venus probably lost its water.",
      limits: ["The rate does not read the star's ultraviolet; step 3 makes it energy-limited (decision 40)."],
      laws: [],
      code: "simulation/worldHistory.ts",
      needsIndex: true,
      effect: (ctx) => [said(`${formatInt(flagged(ctx.index!, INDEX_FLAG.OCEANS_LOST))} worlds lost their oceans to space.`, "index.flags.OCEANS_LOST")],
    },
    {
      id: "oxygen",
      title: "Oxygen in the air",
      statement: "Oxygen comes from water split in the upper air and, once life uses light, from life. Volcanic gases and unoxidised crust remove it. When it passes 1% of Earth's, the air counts as oxidised; ozone then forms.",
      rule: `photolysis ${PHOTOLYSIS_O2_BAR_PER_WATER} bar per unit W lost; sinks ${VOLCANIC_O2_SINK_BAR_PER_GYR} bar/Gyr × τ and ${CRUST_O2_SINK_BAR_PER_GYR} bar/Gyr until ${CRUST_O2_CAPACITY_BAR} bar of crust is oxidised; ozone = min(1, √(O₂ / ${O2_REFERENCE_BAR}))`,
      constants: [{ name: "Oxidised above", value: exact(OXIDATION_O2_BAR, "bar"), meaning: "About 1% of Earth's O₂" }],
      why: "Earth's air oxidised only after life made oxygen faster than rocks and volcanoes could take it; escaping water can also leave oxygen behind, a false sign of life.",
      limits: ["Ozone is a single column number."],
      laws: [],
      code: "simulation/worldHistory.ts",
      needsIndex: true,
      effect: (ctx) => {
        const ix = ctx.index!;
        const oxidised = rowsWhere(ix, (i) => !Number.isNaN(ix.oxidationGyr[i]));
        const byLife = oxidised.filter((i) => !Number.isNaN(ix.lifeOxygenGyr[i])).length;
        return [said(`${formatInt(oxidised.length)} worlds' air oxidised; life's own oxygen would have done it on ${formatInt(byLife)} of them; on the rest, oxygen left by escaping water was needed.`, "index.oxidationGyr", "index.lifeOxygenGyr")];
      },
    },
    {
      id: "methane",
      title: "Methane",
      statement: "Methane comes from life that lives on chemical energy, and is destroyed faster in oxygen-rich air.",
      rule: `destroyed at ${CH4_DESTRUCTION_PER_GYR} per Gyr × (1 + O₂ / ${O2_REFERENCE_BAR} bar); made ∝ chemical-energy biomass × its anaerobic share × g`,
      constants: [],
      why: "Methane and oxygen together cannot last without something making both: the strongest sign of life in a spectrum.",
      limits: ["Methane on oxygen-rich worlds comes out far below Earth's, since the model has no anoxic niches."],
      laws: [],
      code: "simulation/worldHistory.ts",
      needsIndex: true,
      effect: (ctx) => [said(`${formatInt(flagged(ctx.index!, INDEX_FLAG.O2_WITH_CH4))} worlds hold oxygen and methane together today.`, "index.flags.O2_WITH_CH4")],
    },
    {
      id: "impacts-volcanism",
      title: "Impacts and volcanic pulses",
      statement: "Asteroids strike often just after formation and rarely later; volcanic pulses come with inner activity. Both are catastrophes for life.",
      rule: `impacts ${IMPACT_EARLY_PER_GYR} per Gyr fading over ${IMPACT_EARLY_TIMESCALE_GYR} Gyr to ${IMPACT_BACKGROUND_PER_GYR} per Gyr; pulses ${VOLCANIC_PULSE_PER_GYR} per Gyr × τ`,
      constants: [],
      why: "The heavy bombardment and flood-basalt eruptions shaped Earth's life.",
      limits: ["Impacts change nothing physical: they matter only as catastrophes for life."],
      laws: [],
      code: "simulation/worldHistory.ts",
      needsIndex: true,
      effect: (ctx) => {
        const ix = ctx.index!;
        const struck = rowsWhere(ix, (i) => ix.massExtinctions[i] > 0).length;
        return [said(`On ${formatInt(struck)} worlds a catastrophe ended a quarter or more of living lineages and life went on.`, "index.massExtinctions")];
      },
    },
    {
      id: "liquid-water",
      title: "Liquid water, ever",
      statement: "Liquid water, open or under ice, at any step of a world's history or today: the condition for life to begin.",
      constants: [],
      why: "The Great Filter's second gate.",
      limits: [],
      laws: [],
      code: "simulation/worldHistory.ts · everLiquidWater",
      needsIndex: true,
      effect: (ctx) => {
        const ix = ctx.index!;
        return [said(`${formatInt(flagged(ix, INDEX_FLAG.EVER_LIQUID_WATER))} of ${formatInt(solidRows(ix).length)} solid planets had liquid water at some time.`, "index.flags.EVER_LIQUID_WATER")];
      },
    },
  ],
  missing: ["Air never escapes to space (step 3).", "No heat from inside in the energy balance (step 5a)."],
};

