# A3 planets and moons: what changed and what it did

Branch `galaxy-planet-validation` (local). Commits: `01ca265` (A3.1), `c8a6e8e` (A3.2), `27d54d3` (A3.3), `e74bc22` (A3.4), `3b5b16d` (A3.5) and `e2e5f37` (a drawing fix and test updates). Rules stay at v18 until A4.

## The changes

| # | Before (v18) | Now |
|---|---|---|
| A3.1 Circumbinary orbits | Periods and moon Hill limits used the primary's mass only | Both stars' mass (`orbitedMassSolar`), as the stability check already did |
| A3.2 Large moons | A rocky planet's large moon was drawn at 30–60 planet radii with no Hill cap | Kept only within half the Hill radius, the giants' own rule. Planets close to small stars, whose Hill spheres reach under 30 radii, have none, so their tilt is free to wander |
| A3.3 White-dwarf hosts | Planets kept the progenitor's mass and their formation orbits | Remnant mass from the initial–final relation (Kalirai et al. 2008: 0.109·M_i + 0.394 M☉). Orbits widen by M_i/M_f. A planet's history keeps its closer formation orbit until the star becomes a remnant (`orbitAUAt`; each snapshot carries its orbit), and its water is gathered where it formed |
| A3.4 Sub-Neptunes | Every planet up to 15 M⊕ had a rocky surface, oceans and possibly life, even at 2–4 R⊕ | From **1.75 R⊕**, the radius valley (Fulton et al. 2017), a planet keeps its envelope and has no surface. Below 15 M⊕ it is the new type **Sub-Neptune**, with a giant's moons, crushing air and an ice giant's envelope. One test, `hasSolidSurface`, decides it everywhere |
| A3.5 Orbits and the star | Every star's planets started at 0.1–0.4 AU, so red dwarfs' habitable zones stayed nearly empty | Orbits are drawn as a Sun's and kept at the same periods: a × M^⅓. **Hot Jupiters:** in a system with a giant of 95 M⊕ or more, its innermost such giant migrates to a 3–5 day orbit with chance 0.045, clearing the planets inside its path, so about 1.2% of Sun-like stars host one (Wright et al. 2012) |

Also: the system view drew every star 0.12 units across, so a hot Jupiter at 0.04 AU sat inside its own star. The drawn star now stays within a third of the way to its innermost planet.

## What it did (seed-42 sample, and the stats harness)

| | v18 | after A3 |
|---|---|---|
| Hot Jupiters (250 Sun-like and smaller stars, seed 42) | 0 | 6 |
| Solid planets above 2.04 M⊕ | 30.3 % | 11.5 % |
| Solid planets of ≥ 1 M⊕ lighter than 3 g/cm³ | many | none |
| Tidally locked planets (Familiar Reality, 100000) | 19.4 % | 28.1 % |

Familiar Reality, seeds 100000 / 42 / 7777:

| | v18 | after A2 | after A3 |
|---|---|---|---|
| Solid planets | 5,806 / 5,669 / 5,794 | 6,378 / 6,243 / 6,265 | 5,259 / 4,802 / 5,280 |
| Liquid water today | 8.0 / 9.0 / 7.8 % | 4.2 / 5.1 / 4.3 % | 6.7 / 7.8 / 6.4 % |
| Ever had life | 35.5 / 37.6 / 34.5 % | 50.1 / 55.6 / 48.7 % | 46.8 / 51.6 / 45.8 % |
| Systems with organisms | 757 / 771 / 740 | 1,198 / 1,326 / 1,241 | 1,089 / 1,212 / 1,143 |
| Systems with multicellular life or more | 102 / 118 / 95 | 33 / 48 / 41 | 22 / 32 / 43 |
| Civilizations | 10 / 12 / 5 | 0 / 1 / 2 | 1 / 1 / 1 |
| World history time, seed 100000 | 80 s | 157 s | 131 s |

Abundant Life civilizations: 38 / 47 / 32 (v18) → 6 / 12 / 12 (A2) → 1 / 4 / 4.

A3 brings liquid water back (red dwarfs' habitable zones now hold planets) and takes ~17% of solid planets away as sub-Neptunes, many of which were water worlds with life. Complex life stays where A2 left it, and civilizations are now about 1 per default universe.

## Phase 3 so far: where the minds went

| Step | Familiar Reality civilizations (100000 / 42 / 7777) | Main cause |
|---|---|---|
| v18 | 10 / 12 / 5 | |
| A1 climate | 3 / 5 / 4 | Warm inner-zone worlds (300–330 K), where complex life grew fastest, are past the runaway limit |
| A2 stars | 0 / 1 / 2 | Three-quarters of stars are red dwarfs: life everywhere, but dim light and flares keep it microbial |
| A3 planets | 1 / 1 / 1 | Sub-Neptunes take the big water worlds |

Each step is a correction toward measured astronomy, and nothing was tuned. The model now says intelligence is very rare. Whether that is the answer you want the instrument to give is a design question for you: the levers are in the evolution model (red-dwarf light and flares, the mind threshold), not the physics.

## Not modelled (named on the physics page)

- A companion's orbit does not widen when a white dwarf loses mass, and the instability that can follow is not modelled.
- Hot Jupiters' frequency does not depend on metallicity.
- Red-dwarf planets' tidal heating is unchanged.

## Tests

**About 17 tests fail, all pinned to v18's exact counts, sample planets or reference snapshots:**
- the reference entries;
- the Great Filter counts;
- samples without a mind, a fireless civilization, a low-gravity habitable world, or life-made oxygen;
- the filter comparison;
- one surface-map coast cell.

A4 regenerates them once. Every failure that was a real problem is fixed:
- the formation and geography tests;
- the CO₂ freeze-out check (snapshots now record their sub-steps);
- the hot-Jupiter drawing bug.

## Next: A4 closes Phase 3

1. Bump `SIMULATION_RULES_VERSION` to 19.
2. Regenerate the pinned tests, checking each new value rather than pasting it.
3. Re-run `npm run stats` and the probes, regenerate the README seed table, and write the v18 → v19 comparison.
4. Merge into `black-hole-render`.

**A merge note:** `rendering/systemLayout.ts` changed on both `engineering-fixes` (B1, orbits at the gravity-moved distance) and here (the drawn star fits inside a hot Jupiter's orbit). Merging the two branches will need that file joined by hand.
