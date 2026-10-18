# The plan: The Physics page

A page, opened from the left sidebar, that sets out every rule the simulation runs on: what it says, why it is there, what it assumes, which laboratory law reaches it, and what it did to the universe on screen right now.

Status: built 18 Oct 2026 (PH0–PH5): 59 cards in 12 chapters.

## Contents

- [Why](#why)
- [What the page holds](#what-the-page-holds)
- [The rules, by chapter](#the-rules-by-chapter)
- [Effects on the universe on screen](#effects-on-the-universe-on-screen)
- [How it is built](#how-it-is-built)
- [Build order](#build-order)
- [Ground rules](#ground-rules)
- [Risks](#risks)
- [Decisions needed](#decisions-needed)

## Why

The rules live in about thirty modules, each with a header comment, and in three documents that record decisions (`Worlds-Up-Close*.md`, `Galaxy-Through-Time.md`, `evolution.md`, `spectrum.md`). `SIMULATION_RULES.md` gives the principles but, by design, no formulas. Nobody using the app can see why a universe came out as it did, or what a laboratory law changes. This page joins the two: the rule, and its measured consequence in this universe.

It serves the charter's question, "how do simple rules produce extraordinary complexity?", by showing the rules and the complexity side by side.

## What the page holds

**Shape.** A page that replaces the stage and the dock while it is open (the sidebar stays, so the universe can still be changed). A **Physics** item in the sidebar opens it; Escape or its close button returns to the galaxy as it was. On the left, a table of contents by chapter; on the right, the chapters. Each rule is a card:

| Part of a card | Example (stellar lifespan) |
|---|---|
| Title and plain statement | Heavier stars burn out faster: lifespan falls as the 2.5th power of mass. |
| Rule | `lifespan = 10 Gyr / M^2.5 / entropy` (shown as written in the code, collapsible) |
| Constants, with values read from the code | 10 Gyr; exponent 2.5; floor 0.003 Gyr |
| Why it is this way | The Sun lives about 10 Gyr; the mass–luminosity relation (L ∝ M^3.5) burns fuel ∝ M at a rate ∝ M^3.5. |
| Source | Textbook main-sequence scaling |
| Assumptions and limits | A star brightens only linearly on the main sequence; the helium flash is not modelled |
| Laboratory law that reaches it | Entropy rate: divides every lifespan (here 1.00×) |
| **In this universe** | (illustrative figures) 1,214 of 2,000 stars are still on the main sequence; 412 have left it; the shortest-lived star lives 3 Myr. On the page these are computed live. |
| Where it lives | `simulation/star.ts`, `calcLifespan` · decided in AF-021 |

At the top of the page: the universe's citation (`AF-U-0001-86A0 · v11`), the six laboratory laws with their current values, and for each law the rules it reaches, including the ones it does not (C7: gravity moves orbits but not surface gravity).

## The rules, by chapter

Inventory from the code as of rules v11. Each line becomes one or more cards.

1. **How the simulation runs.** One seed, named random streams (`rng.ts`, `mixSeed`, `SALT`); deterministic maths (`detmath.ts`, why `Math.exp` is banned in outcome code); the rules version and what a recount means; the life survey and the universe index.
2. **The galaxy.** Morphology from the seed; scale × expansion rate; 2,000 stars; positions by morphology.
3. **Stars.** Mass distribution (and the ignition threshold); lifespan; phases (protostar, main sequence to 85%, giant, remnant at 95%; remnant by mass: 8 and 25 M☉); temperature and luminosity (L = M^3.5, Stefan–Boltzmann radius); brightening on the main sequence (0.8); temperature over time; magnetic activity, flares and XUV (AE1: saturation time, f_sat, the 6,500–7,500 K fade, the photosphere).
4. **Planetary systems.** Planet count by star mass; four orbital architectures; the dust-sublimation line; engulfment by a swollen star; the mass draw (log-uniform to 25 M⊕, the top tenth to 13 Mj); Chen & Kipping radius ±20%; giants above 15 M⊕; equilibrium temperature; the atmosphere draw and its five classes; gravity's effect on orbits (`effectiveOrbitAU`).
5. **A planet's body.** Surface gravity and escape velocity; tidal locking (a⁶ / M★²); rotation and tilt; snow line and water inventory; tectonic activity over time.
6. **Geography.** Ocean depth (W · 33.75 km · g); continents (0.4 · τ); sea level; why super-Earths drown.
7. **Climate.** Energy balance and albedo; the greenhouse (pressure, CO₂, CH₄, water); bands and a tilted axis; freezing and ice; boiling point under the air; the 642-cell present-day solve.
8. **A world's history.** Steps of 0.1 Gyr from 0.5 Gyr; the carbon cycle (outgassing τ · g², land and seafloor weathering); water loss in a moist greenhouse; runaway and steam; oceans lost; oxygen (photolysis, volcanic and crust sinks, oxidation); methane; ozone; impacts and volcanic pulses; freezing over and thawing; the events it records.
9. **Life.** Origin (4.6 per Gyr per unit of liquid-water area × emergence sensitivity); the environment life meets (light, UV, flares, habitats); the genome's six traits; the engine (energy sources, food web, speciation, drift, catastrophes, the 32-lineage cap); oxygen and methane made by life; biosphere stages; firsts.
10. **Minds and civilizations.** The mind threshold (and the intelligence law); species traits (three evolved, three drawn); technology, cohesion, collapse; fire's three conditions; milestones (placed by formula, until DT1); population.
11. **Seeing from afar.** Air composition; the transit spectrum; observation noise; detection and verdict.
12. **Measures.** Habitability; rarity; the twelve Great Filter gates.

Each chapter ends with what the model does not have (from the plans' "what the universe does not have yet").

## Effects on the universe on screen

Every card's **In this universe** line is computed from the universe on screen, never written by hand, and follows the encyclopedia's rule: a fixed template filled with measured values, each sentence carrying the fields it read.

What the app already holds, and what each can show:

| Source | Holds | Shows, for example |
|---|---|---|
| The stars (`populationRef`) | every star's mass, age, lifespan, class, temperature, luminosity | class mix; how many left the main sequence; the hottest, coldest, shortest-lived; red dwarfs still saturated today |
| The universe index (EN0) | every planet's type, mass, radius, orbit, temperature, surface shares, pressure, O₂, flags, life dates, stage, firsts, mind, civilization | planet-type mix; tidally locked share; ocean and frozen worlds; liquid water ever; life began; oxygenated by life; stage mix; minds; fire shortfalls; the Great Filter |
| The galaxy config | type, scale | morphology, radius in light-years |

What it does not hold, so some rules would have no line yet: planets engulfed by their star (they are not rows); the class each planet formed with; whether a world ever ran away, froze over or lost its oceans (only oxidation is in the index); outgassing and weathering rates; XUV doses. **Proposal:** add six index columns, all additive and with no outcome change, as EN0 did: `formationAtmosphere`, and flags `FROZE_OVER`, `RUNAWAY`, `OCEANS_LOST`, `STEAM_TODAY`, plus a per-system count of engulfed planets in the survey. A rule with no measurable effect says so ("not measured in this universe") rather than guess.

Two limits, stated on the page:
- **Effects are measured, not counterfactual.** The page can say "412 stars have left the main sequence" (illustrative), not "without this rule there would be 600 more living worlds". The laboratory and the Great Filter comparison answer what-if questions; the page links to them.
- **Before the life survey finishes**, star and galaxy lines show at once; planet and life lines wait for the index, as the Great Filter panel does.

## How it is built

- **`ui/physics/catalogue.ts`**: the rules as data, one entry per card: id, chapter, title, statement, rule text, constants, why, source, limits, laws, code location, and an `effect(ctx)` function returning sentences with sources. Presentation only, like the entry writers.
- **Constants come from the code.** A card never types a number the simulation uses. Constants that are private today (for example `PROTOSTAR_FRACTION`, `DUST_SUBLIMATION_K`, `ATMOSPHERE_LOSS_TEMP_K`) are exported, as GF2 did for the fire limits; nothing else in those modules changes. Where exporting would mean restructuring a module, the card shows the value with a test that checks it against the code.
- **`ui/PhysicsPage.tsx`**: the page, table of contents and cards, reusing the inspector's look; keyboard and ARIA as the inspectors; the sidebar keeps working.
- **Effects** read the stars, the galaxy config and the index (plus the new columns), cached per universe.
- **Keeping it true over time.** Every outcome-changing step of Galaxy Through Time (AE2 onwards) updates its cards in the same phase-let; a test lists every exported simulation constant that a card should show and fails when one is missing.

## Build order

One phase-let, one commit, as the other plans.

| | Phase-let | Changes outcomes? |
|---|---|---|
| PH0 | Index columns for the missing effects (formation class, froze, runaway, oceans lost, steam today, engulfed count) | No; verified identical planets and survey totals, as EN0 |
| PH1 | The page, the sidebar link, the laws header, and chapters 1–3 (simulation, galaxy, stars) with effects | No |
| PH2 | Chapters 4–8 (systems, bodies, geography, climate, histories) | No |
| PH3 | Chapters 9–10 (life, minds, civilizations) | No |
| PH4 | Chapters 11–12 (seeing from afar, measures) and the "does not have yet" lists | No |
| PH5 | Tests: every shown constant equals the code's; every effect sentence has sources and no NaN for three seeds; the catalogue lists every exported constant; screenshots | No |

**Built** 18 Oct 2026: PH0 a4484e7, PH1 2351209, PH2 01af188, PH3 a833260, PH4 617910a, PH5 (this commit). 59 cards. Constants a card shows are imported, never typed: about 60 simulation constants were exported or named for it (inline draws in `star.ts`, `galaxy.ts`, `planet.ts` and `civilization.ts` became named tables with identical arithmetic and draw order; seed 100000's exact funnel is unchanged). The PH5 scan reads every `export const` in `simulation/` through Vite's glob import and fails if a rule constant appears on no card; labels, colours, codes and aliases are listed as not rules, each with a reason. Effects are tested in four universes and in one with all life cleared, which caught empty-case NaNs in the life cards. Measured on a random seed: the brightest 1% of stars give 99% of the light, and a 99 M☉ red giant has an 893 AU radius (the ×500 giant rule applied to massive stars, a known limit).

## Ground rules

- No number typed by hand where the code holds it.
- No effect sentence the data cannot back; "not measured" is an allowed answer.
- Plain language first, the formula second, the source third.
- It is documentation that runs: when a rule changes, its card changes in the same commit.

## Risks

| Risk | Answer |
|---|---|
| Size: ~80 cards is a lot to write and keep true | Catalogue as data, tests that tie it to the code, and each future step updating its own cards |
| Exporting private constants spreads small edits across many modules | Additive exports only; no logic changes; one commit per chapter |
| Effects read as causes | The page says "measured, not counterfactual" and links to the laboratory for what-ifs |
| It duplicates `evolution.md`, `spectrum.md` and AE4's planned `physics.md` | The page is the reader's view; those documents keep the decision history, and the cards link to them |

## Decisions needed

| # | Question | Recommendation |
|---|---|---|
| P1 | A full page over the stage and dock, or a floating panel like the encyclopedia? | **Decided 18 Oct 2026, as recommended.** A full page: ~80 cards need room, and the galaxy is not needed while reading them |
| P2 | Show formulas? | **Decided 18 Oct 2026, as recommended.** Yes, collapsed under each plain statement |
| P3 | Add the six index columns (PH0) so climate and history rules can show their effects? | **Decided 18 Oct 2026, as recommended.** Yes; no outcome change |
| P4 | Build before AE2 (so AE2 adds its escape cards) or after step 3 is complete? | **Decided 18 Oct 2026, as recommended.** Before: AE2 then lands with its own cards, and the page shows the universe before escape changes it |
| P5 | Should AE4's `Documents/physics.md` be generated from the catalogue, or stay a hand-written record of decisions and measurements? | **Decided 18 Oct 2026, as recommended.** Stay hand-written, like `evolution.md`; the page links to it |
