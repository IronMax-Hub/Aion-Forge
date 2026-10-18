// Chapters 11 and 12 of the Physics page: seeing from afar, and measures (PH4).

import {
  CFC11_BAR, CFC12_BAR, EARTH_N2O_BAR, EARTH_POPULATION_BILLIONS, RELATIVE_HUMIDITY,
} from "../../../simulation/atmosphereComposition";
import { BANDS, SPECTRUM_BINS, SPECTRUM_MAX_UM, SPECTRUM_MIN_UM } from "../../../simulation/spectrum";
import { MAX_TRANSITS, MIN_TRANSITS, REFERENCE_NOISE_PPM } from "../../../simulation/observation";
import { DETECTION_SIGMA } from "../../../simulation/detection";
import { ATMOSPHERE_FACTOR, FULL_HABITABLE_AREA, GRAVITY_WINDOW, RARE_PLANET, RESOURCE_WEIGHT } from "../../../simulation/planet";
import { FILTER_MIN_ARRIVING, funnelOf, GATES } from "../../../simulation/greatFilter";
import { INDEX_FLAG } from "../../../simulation/universeIndex";
import { formatInt, formatPercent } from "../../format";
import type { Chapter } from "../catalogue";
import { exact, rowsWhere, said } from "../catalogue";

const flagged = (bit: number) => (ix: Parameters<typeof rowsWhere>[0]) => rowsWhere(ix, (i) => (ix.flags[i] & bit) !== 0).length;

export const seeing: Chapter = {
  id: "seeing",
  title: "Seeing from afar",
  intro: "A planet's air is read from the starlight it filters when it crosses its star: the spectrum tab of every solid planet.",
  cards: [
    {
      id: "composition",
      title: "What the air is made of",
      statement: "Today's air comes from the world's history: nitrogen as the background, its CO₂, oxygen and methane, ozone from its oxygen, water vapour from its oceans and temperature. Living things add nitrous oxide; industry adds CO₂ and NO₂; information-age civilizations add CFCs. Giants hold hydrogen and helium with methane, ammonia and water.",
      constants: [
        { name: "Relative humidity", value: formatPercent(RELATIVE_HUMIDITY), meaning: "Earth's mean, for water vapour" },
        { name: "Earth's N₂O", value: `${EARTH_N2O_BAR} bar`, meaning: "Scaled by living biomass" },
        { name: "CFC-11 / CFC-12", value: `${CFC11_BAR} / ${CFC12_BAR} bar`, meaning: `Earth today, per ${EARTH_POPULATION_BILLIONS} billion people` },
      ],
      why: "Gases that life or technology keep up are the signs a distant observer can look for. Oxygen alone is not proof: escaping water leaves oxygen behind with no life at all, a deliberate false positive.",
      source: "Earth's measured abundances; Jupiter's and Uranus's for giants",
      limits: ["Technology gases do not depend on the planet's size, and feed nothing back."],
      laws: [],
      code: "simulation/atmosphereComposition.ts",
      needsIndex: true,
      effect: (ctx) => {
        const ix = ctx.index!;
        return [said(`${formatInt(flagged(INDEX_FLAG.O2_WITH_CH4)(ix))} worlds hold oxygen and methane together; ${formatInt(flagged(INDEX_FLAG.CFCS)(ix))} hold CFCs, a technosignature.`, "index.flags.O2_WITH_CH4", "index.flags.CFCS")];
      },
    },
    {
      id: "spectrum",
      title: "The transit spectrum",
      statement: "When a planet crosses its star, a thin ring of its air is backlit. Each gas absorbs at its own wavelengths, so the planet looks slightly larger in those colours.",
      rule: `${SPECTRUM_BINS} bins from ${SPECTRUM_MIN_UM} to ${SPECTRUM_MAX_UM} µm; ${BANDS.length} absorption bands; the air's height from its temperature, gravity and molecular mass`,
      constants: [],
      why: "Transmission spectroscopy is how real telescopes read exoplanet atmospheres.",
      limits: ["Bands are simplified shapes, not line lists; clouds hide the air below their deck."],
      laws: [],
      code: "simulation/spectrum.ts",
      noEffect: "Computed for a planet when its Spectrum tab opens.",
    },
    {
      id: "observation",
      title: "Noise, and how many transits",
      statement: "Each transit gathers a limited number of photons, so a spectrum is noisy; noise falls as more transits are added, and is worse for faint stars.",
      constants: [
        { name: "Transits", value: `${MIN_TRANSITS}–${MAX_TRANSITS}`, meaning: "What the instrument can gather" },
        { name: "Reference noise", value: `${REFERENCE_NOISE_PPM} ppm`, meaning: "Per bin, one transit of a Sun-like star, at 1 µm" },
      ],
      why: "Photon noise sets what can be seen; an Earth twin's oxygen is hard to detect even with many transits.",
      limits: ["One instrument; no systematic noise."],
      laws: [],
      code: "simulation/observation.ts",
      noEffect: "Computed per planet when observed.",
    },
    {
      id: "detection",
      title: "Detection and verdict",
      statement: `A gas counts as detected when the data need it at ${DETECTION_SIGMA}σ or more. The verdict weighs what was found: technosignature, strong or possible biosignature, atmosphere only, or nothing.`,
      constants: [{ name: "Detection threshold", value: `${exact(DETECTION_SIGMA)}σ`, meaning: "" }],
      why: "An astronomer asks, gas by gas, whether the data require it; the verdict says what that would mean, with its limits.",
      limits: ["Every verdict says what it cannot rule out."],
      laws: [],
      code: "simulation/detection.ts",
      noEffect: "Computed per planet when observed.",
    },
  ],
  missing: ["No direct imaging, radio listening or SETI yet (step 10)."],
};

export const measures: Chapter = {
  id: "measures",
  title: "Measures",
  intro: "Numbers the app computes about worlds: not rules that change them, but ways of reading them.",
  cards: [
    {
      id: "habitability",
      title: "Habitability score",
      statement: "How much of a planet can hold liquid water today, weighed by a gravity window, its air and its resources. Giants and lava worlds score 0.",
      rule: `min(1, habitable area / ${FULL_HABITABLE_AREA}) × gravity factor (full in ${GRAVITY_WINDOW.min}–${GRAVITY_WINDOW.max} g) × air factor × (1 − ${RESOURCE_WEIGHT} + ${RESOURCE_WEIGHT} × resources)`,
      constants: (Object.entries(ATMOSPHERE_FACTOR) as [string, number][]).map(([cls, f]) => ({ name: `Air: ${cls}`, value: exact(f), meaning: "Factor" })),
      why: "A quick reading for people. Since life lives inside each history (C2.3), the simulation reads it only in a species' cooperation draw and one timeline event.",
      limits: ["A score, not a probability of life."],
      laws: [],
      code: "simulation/planet.ts · calcHabitability",
      noEffect: "Kept per planet, not in the index; each planet's panel shows it.",
    },
    {
      id: "rarity",
      title: "Rare worlds",
      statement: "A planet is marked rare when it is a temperate ocean world, a small lava world, or a temperate rocky world under moderate air.",
      rule: `ocean ${RARE_PLANET.oceanK.above}–${RARE_PLANET.oceanK.below} K; lava below ${RARE_PLANET.lavaMassBelow} M⊕; rocky ${RARE_PLANET.rockyK.above}–${RARE_PLANET.rockyK.below} K with moderate air`,
      constants: [],
      why: "A label for discovery and the encyclopedia; it changes nothing the planet does.",
      limits: [],
      laws: [],
      code: "simulation/planet.ts · RARE_PLANET, rareReasonOf",
      needsIndex: true,
      effect: (ctx) => [said(`${formatInt(flagged(INDEX_FLAG.RARE)(ctx.index!))} planets are marked rare.`, "index.flags.RARE")],
    },
    {
      id: "great-filter",
      title: "The Great Filter",
      statement: `Twelve gates from a solid surface to a lasting civilization; each world passes as many as it can in a row. The filter is the gate that lets the smallest share through, among those at least ${FILTER_MIN_ARRIVING} worlds reach.`,
      rule: GATES.map((g, i) => `${i + 1}. ${g.label}`).join("; "),
      constants: [],
      why: "Hanson's question, counted rather than argued.",
      source: "Hanson 1998",
      limits: ["Shares, not causes. Fire and civilization stages are read from today (until DT1)."],
      laws: [],
      code: "simulation/greatFilter.ts",
      needsIndex: true,
      effect: (ctx) => {
        const funnel = funnelOf(ctx.index!);
        const filter = funnel.steps.find((s) => s.gate.id === funnel.filter);
        const last = funnel.steps[funnel.steps.length - 1];
        return [said(
          `${filter ? `Here the filter is “${filter.gate.label}”: ${formatPercent(filter.share)} of the ${formatInt(filter.arrived)} worlds that reach it pass.` : "No gate is reached by enough worlds to name a filter."} ${formatInt(last.passed)} of ${formatInt(funnel.worlds)} planets pass every gate.`,
          "greatFilter.funnelOf")];
      },
    },
  ],
  missing: [],
};
