// Chapters 9 and 10 of the Physics page: life, and minds and civilizations (PH3).

import {
  CH4_PRODUCTION_BAR_PER_GYR, FORMATION_DELAY_GYR, O2_PRODUCTION_BAR_PER_GYR, O2_RESPIRATION_PER_GYR,
  ORIGIN_PER_GYR_PER_WATER_AREA,
} from "../../../simulation/worldHistory";
import {
  FLARE_UV_AT_FULL_ACTIVITY, FLARING_BELOW_K, SEAWATER_FREEZING_K, UV_BAND_NM, VENUS_PRESSURE_BAR, VENUS_SURFACE_TRANSMISSION,
} from "../../../simulation/evolution/environment";
import { TRAIT_RANGES } from "../../../simulation/evolution/genome";
import {
  AEROBIC_YIELD, CHEMICAL_SUPPLY, COST, DRIFT_TOLERANCE, KILL_CHANCE, LINEAGE_CAP, MAX_LEVEL, MULTICELLULAR_LOG10_KG, MUTATION_SIGMA,
  PREDATION_LOSS, SPECIATION_PER_GYR, TROPHIC_EFFICIENCY,
} from "../../../simulation/evolution/engine";
import { MASS_EXTINCTION_SHARE } from "../../../simulation/history";
import { RECENT_CATASTROPHES } from "../../../simulation/evolution/phylogeny";
import { COMPLEX_FOOD_CHAIN_LEVELS, COMPLEX_LOG10_KG, DOMINANT_BIOMASS, STAGE_LABEL } from "../../../simulation/biosphere";
import { MIND_BASE_THRESHOLD, MIND_MIN_LOG10_KG, mindThreshold } from "../../../simulation/evolution/minds";
import {
  FIRE_MIN_LAND, FIRE_MIN_O2_BAR, FIRE_MIN_PRESSURE_BAR, TECH_STAGE_FROM, TECH_STAGE_LABEL,
} from "../../../simulation/civilization";
import { CIVILIZATION_STAGE_CODES, INDEX_FLAG, LIFE_STAGE_CODES } from "../../../simulation/universeIndex";
import type { UniverseIndex } from "../../../simulation/universeIndex";
import { formatGyr, formatInt, formatPercent, formatSig } from "../../format";
import { formatMass } from "../../specimens";
import type { Chapter } from "../catalogue";
import { exact, median, rowsWhere, said } from "../catalogue";

const has = (x: number) => !Number.isNaN(x);
const began = (ix: UniverseIndex) => rowsWhere(ix, (i) => has(ix.lifeBeganGyr[i]));
const living = (ix: UniverseIndex) => rowsWhere(ix, (i) => ix.lifeStage[i] !== 0);
const mindRows = (ix: UniverseIndex) => rowsWhere(ix, (i) => has(ix.mindGyr[i]));

export const life: Chapter = {
  id: "life",
  title: "Life",
  intro: "Life is not rolled: it begins by chance on liquid water, then lineages branch, compete and die out under their own world's history.",
  cards: [
    {
      id: "origin",
      title: "How life begins",
      statement: "At each step, a world with liquid water has a chance of life beginning, in proportion to how much of its surface is liquid water. Once begun, it never begins again, even if it dies out.",
      rule: `chance per step = ${ORIGIN_PER_GYR_PER_WATER_AREA} per Gyr × liquid-water share × emergence sensitivity × step`,
      constants: [{ name: "Origin rate", value: `${exact(ORIGIN_PER_GYR_PER_WATER_AREA)} per Gyr`, meaning: "Per unit of liquid-water area" }],
      why: "Anchored on Earth (owner decision): a 70%-ocean world gets life within 0.5 Gyr of its oceans in 4 cases out of 5, as Earth's early life suggests.",
      limits: ["When life began is a chance event; nothing in the conditions predicts its date.", "The rate saturates: most wet worlds get life whatever the sensitivity, unless it is set very low."],
      laws: [{ law: "emergenceSensitivity", how: "Multiplies the chance" }],
      code: "simulation/worldHistory.ts · ORIGIN_PER_GYR_PER_WATER_AREA",
      needsIndex: true,
      effect: (ctx) => {
        const ix = ctx.index!;
        const wet = rowsWhere(ix, (i) => (ix.flags[i] & INDEX_FLAG.EVER_LIQUID_WATER) !== 0).length;
        const b = began(ix);
        if (b.length === 0) return [said(`Life began on none of the ${formatInt(wet)} worlds that ever had liquid water.`, "index.lifeBeganGyr", "index.flags.EVER_LIQUID_WATER")];
        const wait = median(b.map((i) => ix.lifeBeganGyr[i] - FORMATION_DELAY_GYR));
        return [said(`Life began on ${formatInt(b.length)} of the ${formatInt(wet)} worlds that ever had liquid water, a median ${formatGyr(Math.max(0, wait))} after their histories began.`, "index.lifeBeganGyr", "index.flags.EVER_LIQUID_WATER")];
      },
    },
    {
      id: "environment",
      title: "What life meets: light, ultraviolet, flares",
      statement: "Producers live on starlight (sunlit water and land) or chemical energy (deep water, from volcanism). Thick air dims the light; harmful ultraviolet reaches the surface unless air and ozone stop it; red dwarfs add flares.",
      rule: `light × e^(−k·P), k from Venus (${VENUS_PRESSURE_BAR} bar lets ${formatPercent(VENUS_SURFACE_TRANSMISSION)} through); UV = the star's ${UV_BAND_NM.from}–${UV_BAND_NM.to} nm share + flares below ${formatInt(FLARING_BELOW_K)} K × ${FLARE_UV_AT_FULL_ACTIVITY} × activity, × (1 − ozone)`,
      constants: [
        { name: "Flaring stars", value: `< ${formatInt(FLARING_BELOW_K)} K`, meaning: "On the main sequence" },
        { name: "Chemical energy", value: `${CHEMICAL_SUPPLY}`, meaning: "Per unit of deep water at full tectonic activity (Earth's sunlight = 1)" },
        { name: "Liquid water", value: `≥ ${exact(SEAWATER_FREEZING_K, "K")}`, meaning: "Seawater's freezing point, even under ice" },
      ],
      why: "Light is life's largest energy source; UV breaks the molecules life is made of, so land life needs air and ozone.",
      limits: ["One transmission for all wavelengths."],
      laws: [],
      code: "simulation/evolution/environment.ts",
      needsIndex: true,
      effect: (ctx) => {
        const ix = ctx.index!;
        const live = living(ix);
        if (live.length === 0) return [said("Nothing lives in this universe today.", "index.lifeStage")];
        const aroundDwarfs = live.filter((i) => ctx.stars[ix.starId[i]].temperature < FLARING_BELOW_K).length;
        return [said(`${formatInt(aroundDwarfs)} of ${formatInt(live.length)} living worlds orbit flaring red dwarfs.`, "index.lifeStage", "star.temperature")];
      },
    },
    {
      id: "genome",
      title: "What a lineage carries",
      statement: "Each lineage is a population sharing six traits: energy source, habitat, body mass, the temperature it does best at, how much information it processes, and, for light users, the colour of light it absorbs.",
      constants: [
        { name: "Body mass", value: `10^${TRAIT_RANGES.log10BodyMassKg.min} to 10^${TRAIT_RANGES.log10BodyMassKg.max} kg`, meaning: "" },
        { name: "Best temperature", value: `${TRAIT_RANGES.thermalOptimumK.min}–${TRAIT_RANGES.thermalOptimumK.max} K`, meaning: "" },
        { name: "Absorption peak", value: `${TRAIT_RANGES.absorptionPeakNm.min}–${TRAIT_RANGES.absorptionPeakNm.max} nm`, meaning: "Read only by light users" },
      ],
      why: "Every trait is read by at least one rule of the engine, so each can matter.",
      limits: ["No body plans in the simulation: shapes in the field guide are drawn from these traits for display."],
      laws: [],
      code: "simulation/evolution/genome.ts",
      needsIndex: true,
      effect: (ctx) => {
        const ix = ctx.index!;
        const sizes = living(ix).map((i) => ix.largestLog10Kg[i]).filter(has);
        if (sizes.length === 0) return [said("Nothing lives in this universe today.", "index.largestLog10Kg")];
        return [said(`On living worlds the median largest body is ${formatMass(median(sizes))}; the largest anywhere is ${formatMass(Math.max(...sizes))}.`, "index.largestLog10Kg")];
      },
    },
    {
      id: "engine",
      title: "Evolution: branching, drift, competition",
      statement: "Lineages split into new ones, drift a little each step, and keep a change unless it costs them. They share the energy of their niche by how well they do; consumers eat the level below, if no heavier than themselves. A lineage with no surplus dies out.",
      rule: `speciation ${SPECIATION_PER_GYR} per Gyr (faster after extinctions); costs: maintenance ${COST.maintenance}, information ${COST.information} × info², heat ${COST.thermal}, land support ${COST.support} × g × M^(7/12), UV ${COST.uv}; consumers draw ${formatPercent(TROPHIC_EFFICIENCY)} of the level below; aerobic life gets ${AEROBIC_YIELD}× the energy`,
      constants: [
        { name: "Lineage cap", value: exact(LINEAGE_CAP), meaning: "Most lineages alive at once" },
        { name: "Food-chain levels", value: `0–${MAX_LEVEL}`, meaning: "Producers at 0" },
        { name: "Drift tolerance", value: formatPercent(DRIFT_TOLERANCE), meaning: "A change costing less than this can spread" },
        { name: "Body-mass drift", value: `${MUTATION_SIGMA.log10BodyMassKg} dex per step`, meaning: "" },
        { name: "Prey loss", value: exact(PREDATION_LOSS), meaning: "What eaters take, prey lose" },
      ],
      why: "Selection with drift: variants that do better spread, nearly neutral ones can spread by chance, and empty niches invite new lineages.",
      limits: ["Biomass is at equilibrium each step; no population lags.", "At most 32 living lineages: a world's diversity is a sample, not a census."],
      laws: [],
      code: "simulation/evolution/engine.ts",
      needsIndex: true,
      effect: (ctx) => {
        const ix = ctx.index!;
        const live = living(ix);
        if (live.length === 0) return [said("Nothing lives in this universe today.", "index.livingLineages")];
        const full = live.filter((i) => ix.livingLineages[i] >= LINEAGE_CAP).length;
        return [said(`Living worlds hold a median of ${formatInt(median(live.map((i) => ix.livingLineages[i])))} lineages; ${formatInt(full)} are at the cap of ${LINEAGE_CAP}.`, "index.livingLineages")];
      },
    },
    {
      id: "catastrophes",
      title: "Catastrophes and extinctions",
      statement: "Impacts, volcanic pulses and sudden climate changes kill lineages, large bodies and high predators more often. Life on a world can die out entirely.",
      constants: [
        { name: "Impact", value: formatPercent(KILL_CHANCE.impact), meaning: "Chance to kill the smallest producer" },
        { name: "Volcanic pulse", value: formatPercent(KILL_CHANCE.volcanicPulse), meaning: "" },
        { name: "Climate transition", value: formatPercent(KILL_CHANCE.transition), meaning: "" },
        { name: "Mass extinction", value: `≥ ${formatPercent(MASS_EXTINCTION_SHARE)}`, meaning: "Of living lineages ended at once" },
        { name: "Stability reads", value: `last ${RECENT_CATASTROPHES}`, meaning: "Catastrophes, for the biosphere's stability index" },
      ],
      why: "Mass extinctions reset Earth's life several times and opened room for new lineages.",
      limits: ["Catastrophes do not change the planet itself (impacts heat nothing)."],
      laws: [],
      code: "simulation/evolution/engine.ts · KILL_CHANCE",
      needsIndex: true,
      effect: (ctx) => {
        const ix = ctx.index!;
        if (began(ix).length === 0) return [said("Life never began, so nothing has died out.", "index.lifeBeganGyr")];
        const ended = rowsWhere(ix, (i) => has(ix.lifeEndedGyr[i])).length;
        const massive = rowsWhere(ix, (i) => ix.massExtinctions[i] > 0).length;
        return [said(`Life died out on ${formatInt(ended)} of ${formatInt(began(ix).length)} worlds where it began; ${formatInt(massive)} survived at least one mass extinction.`, "index.lifeEndedGyr", "index.lifeBeganGyr", "index.massExtinctions")];
      },
    },
    {
      id: "life-chemistry",
      title: "Life changes its air",
      statement: "Light users make oxygen and life respires it; life living on chemical energy makes methane in oxygen-poor water. The balance is solved each step.",
      rule: `O₂ made ${O2_PRODUCTION_BAR_PER_GYR} bar/Gyr per unit of light-user biomass × g; respired ${O2_RESPIRATION_PER_GYR} per Gyr × O₂ × biomass; CH₄ made ${CH4_PRODUCTION_BAR_PER_GYR} bar/Gyr per unit of chemical-user biomass × anaerobic share × g`,
      constants: [],
      why: "Earth's oxygen is life's. Production over respiration sets an Earth-like biosphere near 0.21 bar.",
      limits: ["Global oxygen sets every lineage's chemistry: no anoxic niches, so methane stays low on oxygen-rich worlds."],
      laws: [],
      code: "simulation/worldHistory.ts",
      needsIndex: true,
      effect: (ctx) => {
        const ix = ctx.index!;
        const light = rowsWhere(ix, (i) => has(ix.firstLightGyr[i])).length;
        const oxygen = rowsWhere(ix, (i) => has(ix.lifeOxygenGyr[i])).length;
        return [said(`Life learned to use light on ${formatInt(light)} worlds; on ${formatInt(oxygen)} its oxygen alone could fill the air.`, "index.firstLightGyr", "index.lifeOxygenGyr")];
      },
    },
    {
      id: "stages",
      title: "How far life has gone",
      statement: "A biosphere's stage is read from its living lineages: microbial below a microgram, multicellular above, complex above a gram with three food-chain levels, dominant when complex life's biomass covers the planet.",
      constants: [
        { name: "Multicellular above", value: `10^${MULTICELLULAR_LOG10_KG} kg`, meaning: "A microgram" },
        { name: "Complex above", value: `10^${COMPLEX_LOG10_KG} kg, ${COMPLEX_FOOD_CHAIN_LEVELS} levels`, meaning: "" },
        { name: "Dominant from", value: `${DOMINANT_BIOMASS} unit of biomass`, meaning: "Earth's mean sunlight on the whole planet" },
      ],
      why: "Body size and food-chain depth stand in for multicellularity and ecosystems.",
      limits: ["Body mass stands in for multicellularity."],
      laws: [],
      code: "simulation/biosphere.ts · stageOf",
      needsIndex: true,
      effect: (ctx) => {
        const ix = ctx.index!;
        const parts = LIFE_STAGE_CODES.map((stage, code) => [stage, rowsWhere(ix, (i) => ix.lifeStage[i] === code).length] as const)
          .filter(([stage, n]) => stage !== "none" && n > 0)
          .map(([stage, n]) => `${STAGE_LABEL[stage]}: ${formatInt(n)}`);
        return [said(parts.length === 0 ? "Nothing lives in this universe today." : `Living worlds by stage: ${parts.join("; ")}.`, "index.lifeStage")];
      },
    },
  ],
  missing: ["No life on giants, moons or rogue planets; no panspermia between worlds."],
};

export const minds: Chapter = {
  id: "minds",
  title: "Minds and civilizations",
  intro: "A mind is a lineage that evolved, not a roll; a civilization's course is then computed from its species and its world.",
  cards: [
    {
      id: "mind",
      title: "When a mind appears",
      statement: "The first living lineage that eats other life, is heavier than a gram, and whose information processing reaches a threshold becomes a mind. Its species is that lineage and its descendants that still eat other life.",
      rule: `consumer, info ≥ 1 − ${1 - MIND_BASE_THRESHOLD} × intelligence, body > 10^${MIND_MIN_LOG10_KG} kg`,
      constants: [
        { name: "Threshold at 1×", value: exact(MIND_BASE_THRESHOLD), meaning: "Information processing, 0–1" },
        { name: "Lightest body", value: formatMass(MIND_MIN_LOG10_KG), meaning: "A mind's body is heavier" },
      ],
      why: "Intelligence needs a body able to carry a brain and a lineage that paid for information processing.",
      limits: ["Only the first mind on a world counts."],
      laws: [{ law: "intelligenceModifier", how: "Lowers or raises the threshold" }],
      code: "simulation/evolution/minds.ts",
      needsIndex: true,
      effect: (ctx) => {
        const ix = ctx.index!;
        const m = mindRows(ix);
        const wait = median(m.map((i) => ix.mindGyr[i] - ix.lifeBeganGyr[i]));
        return [
          said(`Here a mind needs information processing of ${formatSig(mindThreshold(ctx.config.intelligenceModifier))}.`, "config.intelligenceModifier"),
          said(m.length === 0 ? "No mind has arisen." : `${formatInt(m.length)} minds arose, a median ${formatGyr(wait)} after life began.`, "index.mindGyr"),
        ];
      },
    },
    {
      id: "species",
      title: "A species' character",
      statement: "Intelligence, aggression and adaptability come from the mind's lineage (its information processing, how many of its ancestors ate others, and the range of temperatures they lived in). Curiosity, cooperation and resilience are drawn by chance.",
      constants: [],
      why: "What can be read from the lineage is read; what has no trait to come from is drawn, and said so.",
      limits: ["Three of six traits are chance draws, not evolved."],
      laws: [],
      code: "simulation/civilization.ts · generateSpecies",
      noEffect: "Species traits are kept per civilization, not in the index; each civilization's panel shows them.",
    },
    {
      id: "technology",
      title: "Technology, collapse and ruins",
      statement: "A civilization's technology grows with curiosity and cooperation and is slowed by aggression; it can collapse and recover. If its species dies out, only ruins remain.",
      rule: `stages by tech level: agricultural from ${TECH_STAGE_FROM.agricultural}, industrial ${TECH_STAGE_FROM.industrial}, information ${TECH_STAGE_FROM.information}, space age ${TECH_STAGE_FROM["space-age"]}`,
      constants: [],
      why: "A minimal model of growth and fragility, from the species' traits and its time.",
      limits: ["Computed in closed form, not lived step by step; milestone dates are placed by formula (Deep Time, DT1).", "A civilization that fell keeps only the stage its ruined level reaches."],
      laws: [],
      code: "simulation/civilization.ts · generateCivilization",
      needsIndex: true,
      effect: (ctx) => {
        const ix = ctx.index!;
        const civs = rowsWhere(ix, (i) => ix.civilizationStage[i] !== 0);
        const parts = CIVILIZATION_STAGE_CODES.map((stage, code) => [stage, civs.filter((i) => ix.civilizationStage[i] === code).length] as const)
          .filter(([stage, n]) => stage !== "none" && n > 0)
          .map(([stage, n]) => `${TECH_STAGE_LABEL[stage as Exclude<typeof stage, "none">]}: ${formatInt(n)}`);
        const ruins = civs.filter((i) => has(ix.speciesEndedAgoGyr[i])).length;
        return [said(civs.length === 0 ? "No civilization arose." : `Civilizations today: ${parts.join("; ")}. ${formatInt(ruins)} are ruins of a species that died out.`, "index.civilizationStage", "index.speciesEndedAgoGyr")];
      },
    },
    {
      id: "fire",
      title: "Fire",
      statement: "Industry needs open fire, and fire needs exposed land, air thick enough to burn in, and enough oxygen. A mind on a world without them can farm but goes no further.",
      constants: [
        { name: "Exposed land", value: `≥ ${formatPercent(FIRE_MIN_LAND)}`, meaning: "" },
        { name: "Pressure", value: `≥ ${exact(FIRE_MIN_PRESSURE_BAR, "bar")}`, meaning: "" },
        { name: "Oxygen", value: `≥ ${exact(FIRE_MIN_O2_BAR, "bar")}`, meaning: "Earth: 0.21 bar" },
      ],
      why: "Smelting metal needs flame. The limit comes from the world, not from who evolved: an aquatic mind is capped because its world has no fire.",
      limits: ["Read from today's air, not when the civilization lived (DT1)."],
      laws: [],
      code: "simulation/civilization.ts · canSustainFire",
      needsIndex: true,
      effect: (ctx) => {
        const ix = ctx.index!;
        const m = mindRows(ix);
        const fire = m.filter((i) => (ix.flags[i] & INDEX_FLAG.FIRE_POSSIBLE) !== 0).length;
        return [said(m.length === 0 ? "No mind has arisen to need fire." : `Fire is possible on ${formatInt(fire)} of the ${formatInt(m.length)} worlds with a mind.`, "index.flags.FIRE_POSSIBLE", "index.mindGyr")];
      },
    },
  ],
  missing: ["No contact between civilizations, no expansion beyond their worlds (steps 10 and 11)."],
};
