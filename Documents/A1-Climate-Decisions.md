# A1 climate: what A1.1 found, and the A1.2 decision

Branch `galaxy-planet-validation` (local, from `black-hole-render`). Rules stay at v18 until Phase 3 ends.

## A1.1 done: the runaway greenhouse limit

A wet planet's air can radiate at most ~282 W/m² (Goldblatt et al. 2013). A planet that absorbs more, starlight plus interior heat, now boils its oceans into steam, whatever its mean temperature. In the model's terms the limit is an effective temperature of **265.6 K** (Earth's is 255 K).

Earth twin around today's Sun (life off), v18 → after A1.1:

| AU | v18 | after A1.1 |
|---|---|---|
| 0.5 | 583 K, oceans lost, 66 bar CO₂ | 637 K, oceans lost, 108 bar CO₂ |
| 0.72 (Venus) | **320 K, oceans, 1 bar** | **535 K, no water, 112 bar CO₂**: a Venus, emerged, not written |
| 0.8 | 310 K, oceans | 498 K, no water, 103 bar CO₂ |
| 0.9 | 300 K, oceans | steam runaway, 825 K, water still escaping |
| 0.95 | 295 K, oceans | 295 K, oceans (unchanged) |
| 1.0 and out | unchanged | unchanged |

The inner edge moved from 0.5–0.6 AU to **~0.92 AU**, close to Kopparapu et al.'s 0.95–0.99 AU. Worlds inside it that boiled from their first step never had liquid water ("ever wet: no"). That matches the current picture of a Venus that may never have had oceans (Turbet et al. 2021).

Two old tests had assumed the old behaviour:
- **Escape-velocity comparison:** at 0.5 AU both worlds now lose everything, so it moved to 0.9 AU.
- **Giant test:** at 1 AU a Sun-like star's late brightening now runs the world away before the giant phase, as will happen to Earth, so it moved to 1.1 AU.

### What it does to life (stats harness, 18 universes)

| Familiar Reality, seeds 100000 / 42 / 7777 | v18 | after A1.1 |
|---|---|---|
| Liquid water today | 8.0 / 9.0 / 7.8 % | 5.6 / 6.4 / 5.5 % |
| Ever had life | 35.5 / 37.6 / 34.5 % | 33.1 / 34.7 / 32.2 % |
| Worlds with a multicellular body | 115 / 143 / 119 | 59 / 68 / 71 |
| Minds | 10 / 12 / 5 | 3 / 6 / 3 |
| Civilizations | 10 / 12 / 5 | 3 / 6 / 3 |

Abundant Life: civilizations 38 / 47 / 32 → 16 / 24 / 13. Life itself falls only ~7 %, but multicellular life and minds fall by about half. The worlds that grew complex life were disproportionately the warm ones (300–330 K) on the inner side of the old habitable zone, and those are exactly the worlds now past the runaway limit. Nothing has been tuned to restore the counts (constitution: outcomes emerge). If that halving is unwelcome, the lever is evolution's own pace, not the climate.

**Tests:** 10 tests pinned to v18's counts and sample planets now fail: reference-entry snapshots, the Great Filter funnel, and samples of the first N stars that no longer contain a mind. They will be regenerated once, at the v19 bump (A4), after A1–A3 have all landed. Redoing them after each step would be churn.

## A1.2: the hot worlds have one cause

Seed 42, first 250 main-sequence stars: 782 solid planets. **107 are above 2,000 K and 32 above 4,000 K**, with the hottest at 8,540 K. Every one of the top 15 is a **steam world**: 300–2,200 bar of steam around a bright star (equilibrium temperature 900–1,570 K).

The cause: the greenhouse warming grows as √(total pressure) with no ceiling, and a boiled ocean adds its whole weight as pressure (Earth's ocean is ~270 bar). So the surface temperature reaches 4–6× the equilibrium temperature. Real steam atmospheres are bounded: once the surface is hot enough, it radiates through water vapour's near-infrared window.

### Options

**A. Bound steam worlds by their own radiation (recommended).** While the oceans are steam, the surface temperature comes from a steam atmosphere's radiation, not from the √pressure greenhouse:
- Just past the limit, the air radiates its 282 W/m² and the surface sits at a runaway floor, about 1,500 K (Kasting 1988; I'd check the exact figure in Goldblatt 2013 before coding it).
- Above that, the surface radiates the excess through a window that passes a fixed share ε of its light: absorbed = 282 + εσT⁴.
- With ε ≈ 0.1, the 8,540 K world would sit near 2,500 K: molten, but bounded.

In the same step I'd add Kopparapu's **maximum CO₂ greenhouse**: CO₂ above ~8 bar adds no more warming, because extra CO₂ reflects as much light as it traps.

It changes only steam worlds and very CO₂-rich ones; Earth, the twin sweep from 0.95 AU outward, and the Venus analogues stay as they are.

**B. A simple cap.** No greenhouse may warm a surface past N× its effective temperature, with N ≈ 3.2 (Venus's ratio). It is one line and touches nothing below the cap, but N has no physical basis beyond Venus.

**C. Rewrite the greenhouse as a grey atmosphere**, T = T_eff·(1 + ¾τ)^¼, calibrated on Earth and Venus. It looks the most physical, but it changes every planet. On its own it does not bound steam: 1,500 bar still gives ~7× T_eff. It would also need the steam cap from A.

## A1.3 preview: why the step size matters

From ~1.2 AU outward, Earth twins don't settle. They freeze over, build CO₂ under the ice, thaw, draw the CO₂ down, and freeze again, every 100–300 Myr. These "limit cycles" are a real proposed behaviour at the outer edge (Menou 2015; Haqq-Misra et al. 2016). The problem is that the cycle is about as long as the 100 Myr step, so whether "today" lands frozen or thawed depends on the step size. That is why 1.37 AU ends at 312, 254 or 246 K.

A1.3 will take smaller steps around freezing and thawing, so the cycle's timing, and today's phase, stop depending on the step size. It comes after A1.2 because A1.2 changes how warm the CO₂ makes these worlds.
