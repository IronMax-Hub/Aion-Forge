// Chapter 1 of the Physics page: how the simulation runs (PH1).

import { SALT } from "../../../simulation/rng";
import { SIMULATION_RULES_VERSION } from "../../../simulation/version";
import { makeUniverseId } from "../../../simulation/persistence";
import { formatInt } from "../../format";
import type { Chapter } from "../catalogue";
import { said } from "../catalogue";

export const foundations: Chapter = {
  id: "foundations",
  title: "How the simulation runs",
  intro: "One number, the seed, decides everything. These rules make sure the same seed always gives the same universe.",
  cards: [
    {
      id: "seed-streams",
      confidence: "established",
      title: "One seed, separate random streams",
      statement: "Every chance event draws from a stream derived from the universe seed. Each subsystem has its own stream, named by a salt, so adding draws to one never shifts another.",
      rule: "stream = Mulberry32(seed ⊕ salt), or Mulberry32(mixSeed(seed, star, planet, salt)) per body",
      constants: [{ name: "Named streams (salts)", value: formatInt(Object.keys(SALT).length), meaning: Object.keys(SALT).join(", ") }],
      why: "Determinism is the project's first rule after emergence: a seed can be shared, re-run and studied, and a change to one rule moves only what that rule touches.",
      limits: ["Mulberry32 is a fast 32-bit generator, not a cryptographic one; its quality is ample for a simulation."],
      laws: [],
      code: "simulation/rng.ts · createRNG, mixSeed, SALT",
      effect: (ctx) => [said(`This universe is seed ${ctx.config.seed}, catalogued as ${makeUniverseId(ctx.config.seed)}.`, "config.seed")],
    },
    {
      id: "detmath",
      confidence: "established",
      title: "Deterministic mathematics",
      statement: "exp, log, pow, sin and cos in outcome-deciding code come from the project's own functions, which use only exactly specified arithmetic and so give bit-identical results in every browser. The browser's own may round differently.",
      constants: [],
      why: "A universe must be identical in every browser and on every device; Math.exp is not required to give the same last bit everywhere.",
      source: "fdlibm (Sun Microsystems), ported in simulation/detmath.ts",
      limits: [
        "Within 1 ulp of the true value (pow somewhat less accurate for large exponents); identical everywhere, but not correctly rounded.",
        "The rendering may use the browser's maths; only what decides outcomes may not. A lint rule enforces it in simulation/.",
      ],
      laws: [],
      code: "simulation/detmath.ts",
      noEffect: "Applies to every computation; there is nothing to count.",
    },
    {
      id: "rules-version",
      confidence: "established",
      title: "Rules versions",
      statement: "When a rule changes what a seed produces, the rules version rises, so numbers measured under older rules are recognised and can be recounted.",
      constants: [{ name: "Current rules version", value: `v${SIMULATION_RULES_VERSION}`, meaning: "Every citation names it" }],
      why: "A saved universe stores its seed and its counts; the counts are true only for the rules that made them.",
      limits: ["An older version cannot be re-run: a recount always uses the current rules."],
      laws: [],
      code: "simulation/version.ts",
      effect: () => [said(`Every count on this page is from rules v${SIMULATION_RULES_VERSION}.`, "SIMULATION_RULES_VERSION")],
    },
    {
      id: "survey-index",
      confidence: "established",
      title: "The life survey and the universe index",
      statement: "After the galaxy appears, every star's planets, their histories, life and civilizations are made once, in background workers, and every world's facts are kept in one table.",
      constants: [],
      why: "Making a planet runs its whole history, which takes milliseconds; a universe has thousands. The index lets the encyclopedia, the Great Filter and this page ask questions of every world without making them again.",
      limits: ["Planets are made again on demand when a system is opened; the index holds facts, not whole histories."],
      laws: [],
      code: "simulation/lifeSurvey.ts, simulation/universeIndex.ts, workers/",
      needsIndex: true,
      effect: (ctx) => [said(
        `The survey made ${formatInt(ctx.index!.count)} planets around ${formatInt(ctx.stars.length)} stars${ctx.engulfedPlanets ? `; another ${formatInt(ctx.engulfedPlanets)} formed and were engulfed by their stars` : ""}.`,
        "index.count", "survey.engulfedPlanets")],
    },
  ],
  missing: [],
};
