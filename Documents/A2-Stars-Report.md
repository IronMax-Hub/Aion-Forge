# A2 stars: what changed and what it did

Branch `galaxy-planet-validation` (local). Commits: `7d7cea1` (A2.1 + A2.3), `cef97c8` (A2.2), `3ee906c` and `2fdec29` (A2.4). Rules stay at v18 until A4.

## The changes

| # | Before (v18) | Now |
|---|---|---|
| A2.1 IMF | Piecewise-linear draw: 26.8% below 0.5 M☉, 10.1% above 8 M☉ | **Kroupa (2001)** by its exact inverse: 76% below 0.5 M☉, 0.5% above 8 M☉ |
| A2.2 ages | Each star's age drawn within its own lifespan, so almost nothing had died | **Constant star-formation rate** over 13.7 Gyr. Stars past their lifespan are remnants: white dwarfs 1.9% → **7.2%** (several % near the Sun); 90%+ of stars above 8 M☉ are remnants |
| A2.3 ignition threshold | Divided the draw and clamped it, putting up to 30% of stars at one mass | Raises the draw to its power (u^threshold): smooth, no pile-up |
| A2.4 giants | ×500 main-sequence light: up to 4×10⁹ L☉, 669 AU wide | 500 L☉ per M☉ (a Sun-like giant as before, 0.2–0.4 AU) or 2× main sequence, capped at the **Humphreys–Davidson limit**, 6×10⁵ L☉ |
| A2.4 remnants | Fixed or drawn luminosities | Blackbodies, L = R²T⁴. White dwarfs are Earth-sized and **cool by Mestel's law**: ~100,000 K young, ~4,000 K after 10 Gyr. Neutron stars are 12 km at their drawn temperature |

My first giant rule followed the red clump (50 L☉·M²). It left Sun-like giants 0.05 AU across, engulfing nothing, so `2fdec29` replaced it. The stats below were measured before that fix; it changes only giant hosts, 0.6% of stars.

## What it did to universes (stats harness, 18 universes)

Familiar Reality, seeds 100000 / 42 / 7777, v18 → after A1 → after A2:

| | v18 | after A1 | after A2 |
|---|---|---|---|
| Ever had life | 35.5 / 37.6 / 34.5 % | 33.4 / 35.0 / 32.6 % | **50.1 / 55.6 / 48.7 %** |
| Living today | 24.4 / 25.8 / 22.4 % | 25.6 / 26.7 / 24.4 % | **37.6 / 42.4 / 36.9 %** |
| Systems with organisms | 757 / 771 / 740 | 757 / 772 / 754 | **1,198 / 1,326 / 1,241** |
| Systems with multicellular life or more | 102 / 118 / 95 | 68 / 90 / 67 | **33 / 48 / 41** |
| Civilizations | 10 / 12 / 5 | 3 / 5 / 4 | **0 / 1 / 2** |
| World history time, seed 100000 | 80 s | 97 s | **157 s** |

Abundant Life civilizations: 38 / 47 / 32 → 18 / 27 / 22 → 6 / 12 / 12.

### Two things you should decide about

**1. Life everywhere, minds almost nowhere.** Three-quarters of stars are now red dwarfs, and they live far longer than the universe's age. Their planets get life easily: systems with organisms rise ~60%. But that life stays microbial. Multicellular systems fall by half again, and Familiar Reality has 0–2 civilizations per universe.

This is emergent; the model already contains everything behind it:
- **Less light:** dim red light gives light-using life little energy, so oxygen comes slowly.
- **Flares:** young red dwarfs flood their planets with ultraviolet (the existing flare-UV rule).
- **Tidal locking:** close-in planets lock to their star (locked planets 19% → 16%, but now mostly red-dwarf worlds).

It is also one real answer to the Fermi question: most planets orbit red dwarfs, and whether those can host complex life is an open debate. Nothing has been tuned. If you want more minds, the honest lever is the evolution model's red-dwarf assumptions (flare UV, light), not the stars.

**2. The survey is about twice as slow.** More planets now carry life, and the evolution engine runs for each one: world history went from 80 s to 157 s per universe on this PC. On your phone the survey will take about twice as long as it does now. Options, if that matters: profile the engine (it is the cost, not the climate), or skip evolution steps on worlds that stay microbial. Both are separate pieces of work.

## Tests

Seventeen tests fail. Every remaining one is pinned to v18's counts or sample planets, and they will be regenerated once at A4:
- the reference-entry snapshots;
- the Great Filter counts;
- samples that no longer contain a mind, a fireless civilization, or a low-gravity habitable world;
- one coast cell of the surface-map check on a newly sampled planet.

Two failures were real and are fixed:
- the giant rule;
- the CO₂ freeze-out test, which predated A1.3's sub-steps.
