// Chapters 6, 7 and 8 of the Physics page: geography, climate, and a world's history (PH2).

import {
  BAND_COUNT, CONTINENTAL_BASE_KM, CONTINENTAL_SHARE, OCEANIC_BASE_KM, PLATES, RIFT_KM, UPLIFT_KM, WATER_KM_PER_UNIT,
} from "../../../simulation/geography";
import {
  ALBEDO, CO2_CRITICAL_K, CO2_REFERENCE_BAR, CO2_TRIPLE_POINT, CONTRAST_MAX_K, EQUILIBRIUM_K_AT_1_AU, FREEZING_K,
  GREENHOUSE_BASE_K, GREENHOUSE_PER_CO2_DOUBLING_K, GREENHOUSE_PER_SQRT_CH4_K, GREENHOUSE_REFERENCE_K, REDISTRIBUTION_HALF_BAR,
  VAPOUR_FEEDBACK, WATER_CRITICAL_K,
} from "../../../simulation/climate";
import {
  CH4_DESTRUCTION_PER_GYR, CRUST_O2_CAPACITY_BAR, CRUST_O2_SINK_BAR_PER_GYR, FORMATION_DELAY_GYR, FROZEN_ICE_SHARE,
  IMPACT_BACKGROUND_PER_GYR, IMPACT_EARLY_PER_GYR, IMPACT_EARLY_TIMESCALE_GYR, O2_REFERENCE_BAR,
  OCEANS_LOST_WATER, OUTGASSING_BAR_PER_GYR, OXIDATION_O2_BAR, PHOTOLYSIS_O2_BAR_PER_WATER, SEAFLOOR_WEATHERING_SHARE,
  STEP_GYR, VOLCANIC_O2_SINK_BAR_PER_GYR, VOLCANIC_PULSE_OUTGASSING, VOLCANIC_PULSE_PER_GYR,
  WEATHERING_REFERENCE_K, WEATHERING_WARMING_SCALE_K,
} from "../../../simulation/worldHistory";
import { atmosphereClassOf, EARTH_ESCAPE_VELOCITY_KMS, SURFACE_PRESSURE_BAR } from "../../../simulation/planetPhysics";
import {
  EARTH_OCEANS_LOST_PER_GYR, EARTH_XUV_FLUENCE, ESCAPE_K, MOIST_RAMP_K, MOIST_THRESHOLD, WATER_LOST_PER_DOSE,
} from "../../../simulation/atmosphericEscape";
import { WATER_LATENT_OVER_R_BELOW_1_ATM_K, WATER_TRIPLE_POINT } from "../../../simulation/climate";
import { ICE_CONDUCTIVITY_W_PER_M, ICE_SHELL_BASE_K } from "../../../simulation/interiorHeat";
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
      statement: "A planet is as warm as the starlight it absorbs, plus the heat from its interior, allow; ocean, land and ice reflect different shares. Ice reflects most, so more ice cools a world and makes more ice.",
      rule: `T_eq = ${EQUILIBRIUM_K_AT_1_AU} K × (L / a²)^¼ × (1 − albedo)^¼; T_eff⁴ = T_eq⁴ + T_int⁴ (the interior's heat, IH1)`,
      constants: [
        { name: "Albedo: ocean", value: exact(ALBEDO.ocean), meaning: "Clouds included" },
        { name: "Albedo: land", value: exact(ALBEDO.land), meaning: "" },
        { name: "Albedo: ice", value: exact(ALBEDO.ice), meaning: "" },
      ],
      why: "The Stefan–Boltzmann balance of absorbed and emitted energy. Earth, at albedo 0.3, gets 255 K before its greenhouse.",
      limits: ["Clouds are folded into the albedos and do not respond to climate."],
      laws: [{ law: "gravityStrength", how: "Closer effective orbits receive more light" }],
      code: "simulation/climate.ts · equilibriumTemperatureK, effectiveTemperatureK, bandAlbedo",
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
      statement: "Air warms a planet in proportion to the energy it holds: more pressure, more CO₂ and methane warm it more, and water vapour multiplies the warming on wet worlds. Earth gets 33 K; the same air on a world far from its star warms it far less.",
      rule: `T_mean = T_eff × (1 + G / ${GREENHOUSE_REFERENCE_K} K); G = (${GREENHOUSE_BASE_K} K × √P + ${GREENHOUSE_PER_CO2_DOUBLING_K} K × log₂(CO₂ / ${CO2_REFERENCE_BAR}) + ${GREENHOUSE_PER_SQRT_CH4_K} K × √CH₄) / (1 − ${VAPOUR_FEEDBACK} × wetness)`,
      constants: [
        { name: "Per CO₂ doubling (dry)", value: exact(GREENHOUSE_PER_CO2_DOUBLING_K, "K"), meaning: "3 K with water vapour: Earth's climate sensitivity" },
        { name: "Vapour feedback", value: exact(VAPOUR_FEEDBACK), meaning: "" },
        { name: "Reference", value: exact(GREENHOUSE_REFERENCE_K, "K"), meaning: "Earth's equilibrium temperature: G is the warming there, scaled with T_eff elsewhere (IH2)" },
      ],
      why: "Greenhouse gases absorb the heat a surface radiates; a grey atmosphere's surface temperature is proportional to its effective temperature. Warmer air holds more water vapour, itself a greenhouse gas.",
      limits: ["The vapour reads the water inventory, not the temperature, so a frozen wet world keeps its vapour warming. Reading it from the mean temperature (decision 39) made Earth-like worlds cycle between snowballs and moist greenhouses; deferred."],
      laws: [],
      code: "simulation/climate.ts · greenhouseK, surfaceMeanK",
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
      rule: `contrast = ${CONTRAST_MAX_K} K × ${REDISTRIBUTION_HALF_BAR} / (P + ${REDISTRIBUTION_HALF_BAR}) × T_eq⁴ / T_eff⁴; no place colder than the interior's own temperature`,
      constants: [],
      why: "Air and oceans carry heat; the more air, the more they carry.",
      limits: ["No seasons, day–night cycle on rotating planets, or ocean currents beyond this one rule.", "Only starlight is uneven: heat from inside warms every place alike."],
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
      statement: "Water boils at a temperature set by the total air pressure. Past it, a world's oceans turn to steam at once, and the steam's own weight and warmth hold the runaway until the water escapes. Below water's triple point there is no liquid at all: water is ice, or vapour.",
      rule: `boiling point by Clausius–Clapeyron (L/R = ${formatInt(WATER_LATENT_OVER_R_BELOW_1_ATM_K)} K below 1 atm, through the triple point), capped at water's critical point (${WATER_CRITICAL_K} K)`,
      constants: [{ name: "Triple point", value: `${WATER_TRIPLE_POINT.K} K, ${WATER_TRIPLE_POINT.bar} bar`, meaning: "No liquid water at lower pressure (decision 27)" }],
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
      rule: `outgassing ${OUTGASSING_BAR_PER_GYR} bar/Gyr × τ × g (× ${VOLCANIC_PULSE_OUTGASSING} in a pulse); weathering ∝ g × (land × wetness + ${SEAFLOOR_WEATHERING_SHARE} × ocean) × √(CO₂ / CO₂_ref) × e^((T − ${WEATHERING_REFERENCE_K}) / ${WEATHERING_WARMING_SCALE_K})`,
      constants: [
        { name: "Seafloor weathering", value: formatPercent(SEAFLOOR_WEATHERING_SHARE), meaning: "Of land's rate per area" },
        { name: "Volcanic pulses", value: `${VOLCANIC_PULSE_PER_GYR} per Gyr × τ`, meaning: "Double the step's outgassing" },
        { name: "CO₂ triple point", value: `${CO2_TRIPLE_POINT.K} K, ${CO2_TRIPLE_POINT.bar} bar`, meaning: `CO₂ above its saturation pressure freezes out as ice, and sublimes back as the world warms; none condenses above ${CO2_CRITICAL_K} K (decision 28)` },
      ],
      why: "The carbonate–silicate cycle keeps Earth habitable over billions of years as the Sun brightens.",
      limits: [
        "Frozen, dry or steam-covered ground does not weather.",
        "No carbon cap: extreme close-in magma worlds pile up CO₂.",
        "CO₂ condenses against the mean temperature: colder poles and night sides, which would freeze more out, are not modelled.",
      ],
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
      statement: "When a world is warm enough for water vapour to reach its upper air, starlight's ultraviolet splits it and the hydrogen escapes. The amount lost follows the ultraviolet dose and weak gravity, not how much water there is, so a water-rich world keeps its ocean longer. Thin air cold-traps vapour less, so its threshold is lower.",
      rule: `ΔW = min(W, ${formatSig(WATER_LOST_PER_DOSE)} × ΔX × (R / R⊕) × (${EARTH_ESCAPE_VELOCITY_KMS} km/s / v_esc)⁴ × min(1, (T − T_moist) / ${MOIST_RAMP_K} K)); T_moist = ${MOIST_THRESHOLD.atOneBarK} K at 1 bar, ${MOIST_THRESHOLD.perDecadeK} K lower per tenfold less background air, at least ${MOIST_THRESHOLD.lowestK} K`,
      constants: [
        { name: "Oceans lost below", value: exact(OCEANS_LOST_WATER), meaning: "About 34 m of water at 1 g" },
        { name: "A fully moist Earth loses", value: `${EARTH_OCEANS_LOST_PER_GYR} oceans per Gyr`, meaning: "To today's Sun: the energy limit at heating efficiency 0.15" },
      ],
      why: "The moist greenhouse, how Venus probably lost its water. Energy-limited escape removes an amount set by the ultraviolet a world absorbs (decision 40).",
      source: "Wordsworth & Pierrehumbert 2014 (the threshold); energy-limited escape",
      limits: ["No diffusion-limited regime under strong XUV; the ramp stands in for it.", "The escaping hydrogen leaves its oxygen behind, which the crust and surface take up (photolysis oxygen is kept)."],
      laws: [],
      code: "simulation/worldHistory.ts",
      needsIndex: true,
      effect: (ctx) => [said(`${formatInt(flagged(ctx.index!, INDEX_FLAG.OCEANS_LOST))} worlds lost their oceans to space.`, "index.flags.OCEANS_LOST")],
    },
    {
      id: "escape",
      title: "Air lost to space",
      statement: "A young star's extreme ultraviolet heats a world's upper air; a world whose gravity is weak for the dose it receives loses its air. Worlds well inside the line keep almost all of it; those near it are stripped quickly. Escape takes every gas alike, and once a world is past the line, whatever its volcanoes add is lost too.",
      rule: `X = ∫ L_XUV / a² dt in Earth doses; X_crit = ${ESCAPE_K} × (v_esc / ${EARTH_ESCAPE_VELOCITY_KMS} km/s)⁴; air kept r = max(0, 1 − (X / X_crit)²)`,
      constants: [
        { name: "K", value: exact(ESCAPE_K), meaning: "Placed between Titan and Mars" },
        { name: "One Earth dose", value: `${formatSig(EARTH_XUV_FLUENCE)} L☉ · Gyr at 1 AU`, meaning: "The model's Sun over 4.6 Gyr (REFERENCE_SUN)" },
      ],
      why: "The Solar System's bodies with and without air divide along one line, the cosmic shoreline, drawn as XUV dose against the fourth power of escape velocity. Earth keeps 99% by this rule, Venus 93%; Mars and Mercury keep nothing.",
      source: "Zahnle & Catling 2017 (the shoreline); the retention curve and K are this model's choices (AE4 measures them)",
      limits: ["A share of the air, not an amount (decision 38): a dose strips 90 bar as completely as 0.1 bar.", "The laboratory's gravity is not read; escape uses the planet's own escape velocity (decision 45)."],
      laws: [{ law: "gravityStrength", how: "Closer effective orbits receive a larger dose" }],
      code: "simulation/atmosphericEscape.ts; simulation/worldHistory.ts",
      needsIndex: true,
      effect: (ctx) => {
        const ix = ctx.index!;
        const solid = solidRows(ix);
        const thinner = solid.filter((i) => ATMOSPHERE_CODES.indexOf(atmosphereClassOf(ix.pressureBar[i])) < ix.formationAtmosphere[i]).length;
        return [said(`${formatInt(flagged(ix, INDEX_FLAG.AIR_LOST))} solid planets lost all their air to space; ${formatInt(thinner)} have a thinner class of air today than they formed with.`, "index.flags.AIR_LOST", "index.pressureBar", "index.formationAtmosphere")];
      },
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
      statement: "Liquid water, open or under ice, at any step of a world's history or today: the condition for life to begin. Under ice, water stays liquid only below a shell thick enough to carry the interior's heat up to the cold surface; shallower water freezes solid to the floor, and life in it dies.",
      rule: `shell d = (${ICE_CONDUCTIVITY_W_PER_M} W/m / q) × ln(${ICE_SHELL_BASE_K} K / T_surface); liquid under a frozen band = its water deeper than d`,
      constants: [
        { name: "Ice conductivity", value: `${ICE_CONDUCTIVITY_W_PER_M} / T W/(m·K)`, meaning: "Petrenko & Whitworth 1999; Klinger 1980's 567 / T would make shells 13% thinner" },
        { name: "Shell base", value: exact(ICE_SHELL_BASE_K, "K"), meaning: "Seawater's freezing point" },
      ],
      why: "The Great Filter's second gate. Earth's heat flow holds 0.9 km of ice over water under a 240 K surface and 7.5 km at 100 K; Europa's model shell is 13 km, within the 10–30 km estimated.",
      limits: ["Shells conduct heat only; convecting ice, salts and tides (step 5b) are not modelled."],
      laws: [],
      code: "simulation/interiorHeat.ts · iceShellKm; simulation/worldHistory.ts · everLiquidWater (IH3)",
      needsIndex: true,
      effect: (ctx) => {
        const ix = ctx.index!;
        return [said(`${formatInt(flagged(ix, INDEX_FLAG.EVER_LIQUID_WATER))} of ${formatInt(solidRows(ix).length)} solid planets had liquid water at some time.`, "index.flags.EVER_LIQUID_WATER")];
      },
    },
  ],
  missing: ["Thick air does not last longer than thin under the same dose (decision 38).", "No heat from inside in the energy balance (step 5a)."],
};

