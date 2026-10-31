# Rules v18 → v19: the audit's corrections

Phase 3 of `Documents/Fixing-Plan-2026-11.md`, on branch `galaxy-planet-validation`, bumped once (`61cb16d`), with one owner-approved fix added inside v19 (`6659389`). Step reports: `A1-Climate-Decisions.md`, `A2-Stars-Report.md`, `A3-Planets-Report.md`. Raw figures: `stats.md` (entries for `1294752`, v18, and `6659389`, v19), `baseline-v18/probes.md` and `v19/probes.md`.

## What changed

| | Rule | Source |
|---|---|---|
| A1.1 | Oceans boil once a wet planet absorbs more than 282 W/m² (T_eff > 265.6 K) | Goldblatt et al. 2013 |
| A1.2 | A steam world's surface is set by what it can radiate: 1,600 K where the 4 µm window opens, then absorbed = 282 + 0.07·σ(T⁴ − 1,600⁴). CO₂'s own warming stops at 8 bar | Goldblatt et al. 2013; Kasting et al. 1993 |
| A1.3 | A step that freezes over or thaws is redone in 1 Myr sub-steps | Limit cycles: Menou 2015 |
| A2.1 | Star masses from the Kroupa IMF, 0.08–100 M☉ | Kroupa 2001 |
| A2.2 | Stars form at a constant rate over 13.7 Gyr; old stars are remnants | Owner decision: constant rate to start |
| A2.3 | The ignition threshold reshapes the IMF as draw^threshold, with no clamp | |
| A2.4 | Giants: 500 L☉ per M☉ or 2× main sequence, at most 6×10⁵ L☉. White dwarfs cool by Mestel's law. Remnants shine as blackbodies | Humphreys & Davidson 1979; Mestel 1952 |
| A3.1 | Planets around both stars orbit the pair's mass | |
| A3.2 | A rocky planet's large moon is kept only within half its Hill radius | |
| A3.3 | White dwarfs weigh their remnant mass; their planets' orbits widen by M_i/M_f | Kalirai et al. 2008 |
| A3.4 | Planets of 1.75 R⊕ or more keep an envelope: sub-Neptunes, with no surface | Fulton et al. 2017 |
| A3.5 | Orbits scale as M^⅓; about 1.2% of Sun-like stars get a hot Jupiter | Wright et al. 2012 |
| Decision 27 | Below water's triple point, water is ice below 273.16 K and vapour above. Before, it was ice at any temperature, so a warm, airless world had ice at 374 K and life in "liquid under the ice" | Owner decision, 1 Nov 2026 |

## The audit's probes, v18 → v19

| Probe | v18 | v19 | Measured astronomy |
|---|---|---|---|
| Stars below 0.5 M☉ | 26.8 % | **76.0 %** | ~75 % (Kroupa) |
| Stars above 8 M☉ | 10.1 % | **0.5 %** | ~0.4 % |
| White dwarfs | 1.9 % | **7.2 %** | ~6–8 % near the Sun |
| Brightest giant / widest | 4.2×10⁹ L☉ / 669 AU | **1.9×10³ L☉ / 1 AU** | ≤ ~6×10⁵ L☉ |
| Earth twin's inner edge (today's Sun) | 0.5–0.6 AU | **~0.92 AU** | 0.95–0.99 AU (Kopparapu et al.) |
| Earth twin at Venus's orbit | 320 K, oceans | **528 K, no water, 112 bar CO₂** | Venus: 737 K, 92 bar |
| Hottest solid planet (seed-42 sample) | 8,540 K | **2,301 K** | |
| 1.37 AU twin at 10 / 20 / 40 steps per Gyr | 312 / 254 / 246 K (open ocean at one step size, frozen at the others) | **242 / 248 / 237 K, frozen at all three** | |
| Solid planets above 2.04 M⊕ (seed 42) | 30.3 % | **11.5 %** | mostly sub-Neptunes above the radius valley |
| Hot Jupiters (seed-42 sample) | 0 | **6** | ~1 % of Sun-like stars |

## What it did to universes

Familiar Reality, seeds 100000 / 42 / 7777:

| | v18 | v19 |
|---|---|---|
| Planets | 6,766 / 7,275 / 6,828 | 7,320 / 7,827 / 7,285 |
| Solid planets | 5,806 / 5,669 / 5,794 | 5,259 / 4,802 / 5,280 |
| Tidally locked | 19.4 / 19.6 / 20.1 % | 28.1 / 28.8 / 29.4 % |
| Liquid water today | 8.0 / 9.0 / 7.8 % | 6.8 / 7.8 / 6.5 % |
| Ever had life | 35.5 / 37.6 / 34.5 % | 44.4 / 49.1 / 43.2 % |
| Life-bearing planets | 1,419 / 1,461 / 1,298 | 1,659 / 1,685 / 1,626 |
| Systems with multicellular life or more | 102 / 118 / 95 | 23 / 32 / 43 |
| Civilizations | 10 / 12 / 5 | 1 / 1 / 1 |
| World history time, seed 100000 (this PC) | 80 s | 108 s |

Great Filter for seed 100000 (worlds passing each gate), v18 → v19:

| Gate | v18 | v19 |
|---|---|---|
| Solid surface | 5,806 | 5,259 |
| Liquid water at some time | 2,690 | 2,976 |
| Life began | 2,062 | 2,333 |
| Life used starlight | 388 | 396 |
| Life's oxygen filled the air | 151 | **35** |
| A multicellular body | 115 | 26 |
| A mind | 10 | 1 |
| Fire within reach | 3 | 0 |

**The shape of the filter changed.** v18's steepest gate was a multicellular body to a mind. In v19 a new choke appears earlier: **life's oxygen filling the air (396 → 35, 9%)**. Most life now orbits red dwarfs, whose dim red light gives light-using life too little energy to oxygenate a planet. Without oxygen, bodies stay tiny, and without large bodies, no minds.

Each default universe now has about one civilization:

| Seed | Civilization |
|---|---|
| 100000 | Star 1660, in ruins |
| 42 | Star 663, agricultural |
| 7777 | Star 1635, in ruins |

Nothing was tuned to move these numbers. They follow from rules that now match measured astronomy. Whether rare minds are what this instrument should show is a design question. The levers are in the evolution model: how much energy dim red light gives, flare ultraviolet, and the mind threshold. The physics is not where to adjust it.

## Known limits and open items

- **Fixed inside v19 (decision 27):** below water's triple point, warm water is now vapour and its basins lie dry. Worlds that ever froze over fall from about 9% to 3%. Light-using life falls by a quarter (541 → 396 for seed 100000), because warm, airless worlds no longer start life under ice that could not exist there. Minds and civilizations are unchanged. The globe draws ice at each world's own freezing point.
- **Not modelled:**
  - a white dwarf's companion orbit widening, and the instability that follows;
  - hot Jupiters' dependence on metallicity;
  - a neutron star cooling with age;
  - Novikov–Thorne corrections to black-hole discs (Phase 2).
- **Stale document:** `SHOWCASE.md` still quotes v17 figures.
- **Merge conflict ahead:** `rendering/systemLayout.ts` differs between `engineering-fixes` (Phase 2, B1) and this branch (the drawn star fitting inside a hot Jupiter's orbit), and will need joining by hand.
