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

## A1.2 done (option A, owner's choice)

- **Steam worlds are bounded by their radiation.** Past the runaway limit, the air radiates 282 W/m² and the surface heats until light leaves through water vapour's 4 µm window. The window opens at **1,600 K** (Goldblatt et al. 2013; Goldblatt & Watson 2012 put an Earth-like runaway's equilibrium near 1,400 K). Above that, absorbed = 282 + ε·σ(T⁴ − 1,600⁴), with **ε = 0.07**: the share of a 1,600–2,000 K surface's light at 3.5–4.1 µm. ε is an approximation; it is named on the physics page.
- A steam world absorbing *less* than the limit radiates everything at any temperature up to 1,600 K, so it keeps the greenhouse's value, capped at 1,600 K. Goldblatt et al. found that a steam atmosphere can persist at Earth's present sunlight, so this hysteresis is physical.
- **Maximum CO₂ greenhouse:** the CO₂ term stops rising at 8 bar (Kasting et al. 1993). The pressure term still counts all the gas, so Venus-like worlds stay hot.

| | after A1.1 | after A1.2 |
|---|---|---|
| Hottest solid planet (seed 42 sample) | 8,540 K | **3,115 K** |
| Earth twin at 0.9 AU (steam) | 825 K | 1,600 K (where the window opens; it is barely past the limit) |
| Earth twin at 0.72 AU (Venus analogue) | 535 K | 528 K |
| Familiar Reality civilizations (100000 / 42 / 7777) | 3 / 6 / 3 | 2 / 6 / 3 |

Life is otherwise unchanged to within a few planets: steam worlds were already lifeless.

## A1.3 done: sub-steps across freezing over and thawing

A step in which a world freezes over or thaws (crosses 90% ice) has its carbon budget and climate redone in **1 Myr sub-steps**: the time weathering takes to draw a thawed world's CO₂ down. Other steps are unchanged bit for bit, so a world that never crosses the threshold has exactly the history it had.

Earth twin at the outer edge, today, at 10 / 20 / 40 steps per Gyr:

| AU | v18 | after A1.3 |
|---|---|---|
| 1.3 | 232 K frozen / **304 K open ocean** / 234 K frozen | 236 / 247 / 248 K, all frozen |
| 1.37 | **312 K open ocean** / 254 K frozen / 246 K frozen | 242 / 248 / 237 K, all frozen |
| 1.5 | **320 K open ocean** / 252 K frozen / 246 K frozen | 252 / 238 / 253 K, all frozen |

All three step sizes now agree on the state. The remaining ±8 K is the CO₂ built up under the ice since the last brief thaw: the cycle's phase today, which no finite step can pin exactly. Before, these worlds alternated frozen and open in whole 100 Myr steps and spent ~40% of their history thawed. Now their thaws last a few Myr, and they are found frozen nearly all the time, as limit-cycle models predict (Menou 2015). Freeze-over and thaw is the only trigger. The first version also sub-stepped whenever any ice band moved, which cost 4× on ordinary worlds and gained nothing.

| Familiar Reality (100000 / 42 / 7777) | v18 | after A1.2 | after A1.3 |
|---|---|---|---|
| Living today | 24.4 / 25.8 / 22.4 % | 22.4 / 23.7 / 20.7 % | 25.6 / 26.7 / 24.4 % |
| Systems with organisms | 757 / 771 / 740 | 714 / 734 / 694 | 757 / 772 / 754 |
| Civilizations | 10 / 12 / 5 | 2 / 6 / 3 | 3 / 5 / 4 |
| World history time, seed 100000 | 80 s | 75 s | 97 s |

Life today recovers because each artificial whole-step freeze-over had struck life as a catastrophe every cycle. Civilizations stay about half of v18's: that is A1.1's runaway limit.

**Limits.** A thaw that refreezes within one step is not recorded as an event, and its few Myr of open water cannot start life. Runaway onsets are not sub-stepped: they follow the star's slow brightening, so their date is off by at most one step, and nothing cycles.
