import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { DEFAULT_CONFIG, makeConfig } from "../simulation/config";
import type { UniverseConfig } from "../simulation/config";
import { buildGalaxyConfig } from "../simulation/galaxy";
import { generateStarsFor, UNIVERSE_AGE_GYR } from "../simulation/star";
import { surveyLife } from "../simulation/lifeSurvey";
import type { LawKey, PhysicsContext } from "../ui/physics/catalogue";
import type { UniverseIndex } from "../simulation/universeIndex";
import { LAW_DOES } from "../ui/physics/catalogue";
import { CHAPTERS } from "../ui/physics/chapters";
import { PhysicsPage } from "../ui/PhysicsPage";

// Universes, each surveyed on a sample of its stars (the page reads every star for star cards)
function contextOf(seed: number, overrides: Partial<Omit<UniverseConfig, "seed">> = {}, sample = 150): PhysicsContext {
  const config = makeConfig(seed, overrides);
  const galaxy = buildGalaxyConfig(seed, config);
  const stars = generateStarsFor(galaxy, UNIVERSE_AGE_GYR, config).stars;
  const survey = surveyLife(stars.slice(0, sample), seed, config);
  return { config, galaxy, stars, index: survey.index, engulfedPlanets: survey.engulfedPlanets };
}

const contexts = [
  contextOf(100000),
  contextOf(42),
  contextOf(7777),
  // A universe where life barely begins and no mind can arise: effects must still read sensibly
  contextOf(5, { emergenceSensitivity: 0.001, intelligenceModifier: 0.01 }, 40),
];
/** A universe's context with no life anywhere: every life column cleared, as if life never began. */
function lifeless(ctx: PhysicsContext): PhysicsContext {
  const ix = { ...ctx.index! } as UniverseIndex;
  const cleared = <T extends Float32Array | Uint8Array>(column: T, value: number): T => {
    const copy = column.slice() as T;
    copy.fill(value);
    return copy;
  };
  for (const c of ["lifeBeganGyr", "lifeEndedGyr", "largestLog10Kg", "firstLightGyr", "firstMulticellularGyr", "firstLandGyr",
    "firstKilogramGyr", "lifeOxygenGyr", "mindGyr", "mindLog10Kg", "industryGyr", "speciesEndedAgoGyr"] as const) {
    (ix as Record<string, unknown>)[c] = cleared(ix[c], NaN);
  }
  for (const c of ["lifeStage", "livingLineages", "massExtinctions", "civilizationStage", "highestStage", "collapses"] as const) {
    (ix as Record<string, unknown>)[c] = cleared(ix[c], 0);
  }
  return { ...ctx, index: ix };
}
contexts.push(lifeless(contexts[0]));

const cards = CHAPTERS.flatMap((chapter) => chapter.cards);
const BAD = /NaN|undefined|Infinity|null|\[object/;

describe("the Physics page's catalogue", () => {
  it("gives every card a unique id, a statement and a code location", () => {
    expect(new Set(cards.map((c) => c.id)).size).toBe(cards.length);
    for (const card of cards) {
      expect(card.statement.length, card.id).toBeGreaterThan(20);
      expect(card.code.length, card.id).toBeGreaterThan(0);
      expect(card.effect !== undefined || card.noEffect !== undefined, `${card.id} says what it did or why it cannot`).toBe(true);
    }
  });

  it("shows constants and rules with no missing values", () => {
    for (const card of cards) {
      const texts = [card.statement, card.rule ?? "", card.why, ...card.limits, ...card.constants.flatMap((c) => [c.name, c.value, c.meaning])];
      for (const text of texts) expect(text, card.id).not.toMatch(BAD);
    }
  });

  it("measures every effect in several universes without a missing value, each sentence with its sources", () => {
    for (const ctx of contexts) {
      for (const card of cards) {
        if (!card.effect) continue;
        const sentences = card.effect(ctx);
        expect(sentences.length, card.id).toBeGreaterThan(0);
        for (const s of sentences) {
          expect(s.text, `${card.id} (seed ${ctx.config.seed})`).not.toMatch(BAD);
          expect(s.sources.length, card.id).toBeGreaterThan(0);
        }
      }
    }
  });

  it("measures the cards that do not need the survey before it finishes", () => {
    const ctx = { ...contexts[0], index: null, engulfedPlanets: null };
    for (const card of cards.filter((c) => c.effect && !c.needsIndex)) {
      for (const s of card.effect!(ctx)) expect(s.text, card.id).not.toMatch(BAD);
    }
  });

  it("names a law only where the card says how it reaches the rule, and describes every law", () => {
    for (const law of Object.keys(DEFAULT_CONFIG) as LawKey[]) expect(LAW_DOES[law].length).toBeGreaterThan(20);
    for (const card of cards) for (const l of card.laws) expect(l.how.length, card.id).toBeGreaterThan(5);
  });

  it("renders the whole page", () => {
    const html = renderToStaticMarkup(<PhysicsPage ctx={contexts[0]} onClose={() => {}} />);
    expect(html.match(/class="physics-card"/g)?.length).toBe(cards.length);
    expect(html).not.toMatch(/NaN|undefined/);
    // Every table-of-contents link lands on a card or chapter
    for (const [, target] of html.matchAll(/href="#([^"]+)"/g)) expect(html).toContain(`id="${target}"`);
  });
});

describe("the catalogue keeps up with the code", () => {
  // Exported constants that are not rules: labels, colours, codes, display tables, and aliases of constants a card shows
  const NOT_RULES: Record<string, string> = {
    STAGE_COLOR: "display colour", PLANET_COLORS: "display colour", MILESTONE_LABEL: "label", VERDICT_LABEL: "label",
    VERDICT_ORDER: "display order", CONFIG_LABELS: "label", CONFIG_DESCRIPTIONS: "label", PRESETS: "laboratory presets",
    COLLECTION_LABEL: "label", IMPORTANCE_RANK: "timeline display", WORLD_EVENT: "timeline wording", FIRST_EVENT: "timeline wording",
    LIFE_BEGAN: "timeline wording", LIFE_ENDED: "timeline wording", SURFACE_KIND: "code", INDEX_COLUMNS: "index layout",
    NO_PARENT: "index code", WORLD_KIND: "index code", ENERGY_SOURCES: "list of genome values", HABITATS: "list of genome values",
    TRAIT_READERS: "documentation table", BAND_AXIS: "drawing axis", CONDITIONS: "Great Filter breakdown, a measure",
    ORGANISM_STAGES: "list", SURVEY_PROGRESS_INTERVAL: "progress reporting", SPECTRUM_WAVELENGTHS_UM: "derived from the bins shown",
    PLANCK_C2_NM_K: "physical constant", STEPS_PER_GYR: "shown as STEP_GYR", INDUSTRIAL_TECH_LEVEL: "shown through TECH_STAGE_FROM",
  };

  it("shows every exported rule constant of the simulation on some card", () => {
    // The sources as text, through Vite's glob import (the app's tsconfig has no Node types)
    const simulation = import.meta.glob("../simulation/**/*.ts", { query: "?raw", import: "default", eager: true }) as Record<string, string>;
    const physics = import.meta.glob("../ui/physics/**/*.ts", { query: "?raw", import: "default", eager: true }) as Record<string, string>;
    const exported = Object.values(simulation).flatMap((text) => [...text.matchAll(/^export const ([A-Z][A-Z0-9_]*)/gm)].map((m) => m[1]));
    const catalogue = Object.values(physics).join("\n");
    expect(exported.length).toBeGreaterThan(100);
    const missing = exported.filter((name) => !NOT_RULES[name] && !new RegExp(`\\b${name}\\b`).test(catalogue));
    expect(missing, "add these to a card, or to NOT_RULES with a reason").toEqual([]);
  });
});
