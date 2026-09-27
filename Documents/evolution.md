# Evolution

How life evolves inside each planet's world history (Worlds Up Close, Phase C2), and the record of every change to what can evolve.

The plan is `Worlds-Up-Close.md` as amended by `Worlds-Up-Close-Revision-1.md`; the revision takes precedence. The code lives in `frontend/src/simulation/evolution/`.

---

## The genome

A lineage is a population sharing one set of traits. It passes them on, with drift, to the lineages that split from it. The starting genome has six traits (`genome.ts`):

| Trait | Values | Read by |
|---|---|---|
| Energy source | chemical · light · consumer | energy intake |
| Absorption peak | 400–1,100 nm; carried by every lineage, read only while it uses light | light capture; vegetation colour |
| Body mass | 10⁻¹⁵ to 10⁵ kg, stored as log10 kg | maintenance, support and oxygen-yield costs; life stage |
| Habitat | deep water · shallow water · land | energy intake; UV and support costs |
| Thermal optimum | 250–400 K | thermal-mismatch cost |
| Information processing | 0–1 | competition share; information cost; minds |

Energy source and habitat change only when a lineage splits. The other four drift at every step and are held inside their ranges.

A consumer's place in the food chain is not a trait. It follows from what it eats, and the engine records it.

---

## The environment

At every step of a planet's history, the engine meets the planet through one environment (`environment.ts`). It is read from the world history loop's snapshot of that step, so a brightening star, a freezing planet or a rising ozone layer change what life meets.

| Pressure | Rule |
|---|---|
| Light | L(t) / a² times each band's mean insolation, dimmed by the air: e^(−0.040 · pressure in bar), set so Venus's 92 bar passes ~2.5% (Earth 96%) |
| Star | Temperature at the step (the main-sequence value before a giant left it), spectral peak by Wien's law |
| Habitats | Land above the sea; shallow water = the sunlit top layer of open water; deep water = all liquid water, open or under ice |
| Temperatures | Land at the band temperature; water never below 271 K |
| UV | Steady: the star's blackbody share at 200–315 nm relative to the Sun's, times its flux. Flares: stars below 3,900 K on the main sequence, fading as e^(−t / lifetime), lifetime 0.8 Gyr (M0) to 8 Gyr (M7). Dimmed by the air, then × (1 − ozone) |
| Gravity, chemistry | Gravity, tectonic activity (chemical energy), CO₂, O₂, CH₄, ozone |
| Catastrophes | The loop's impacts, volcanic pulses and climate transitions for the step; the environment draws nothing |

Starting values to tune in C2.10: time-averaged flare UV at full activity, per unit of starlight, equal to the Sun's steady UV (`FLARE_UV_AT_FULL_ACTIVITY = 1`).

### Owner decisions (C2.2, 2026-09-27)

- **Water habitats are layers, not places.** The 642-cell grid cannot resolve continental shelves: half of all ocean planets have no water within even 1 km of the surface on it. Shallow water is therefore the sunlit top layer of all open water (where Earth's ocean plankton live) and deep water the dark water beneath, including under ice. A frozen world keeps life in its dark water.
- **Air dims light and UV by one rule**, calibrated on Venus.
- **UV is blackbody plus fading red-dwarf flares** (West et al. 2008 activity lifetimes).

---

## Rule for adding a trait

A trait is added only when a stats-harness run shows a specific gap that the current genome cannot express. Each addition is its own phase-let, and is recorded below with:

- the evidence (the stats run and the gap it shows);
- the rule that reads the new trait;
- the stats before and after.

A trait no rule reads is never added.

---

## Genome changelog

### C2.1 · starting genome · 2026-09-27

The six traits above, as specified in Revision 1. Owner decisions on values the plan left open:

- **Thermal optimum range: 250–400 K.** The span of known life on Earth, from brine microbes near 253 K to vent microbes at 395 K.
- **Absorption peak is carried by every lineage.** Only a light user's is read. A lineage that turns to light when it splits starts from its parent's value, so the genome keeps one shape.

No outcome changes: nothing reads the genome until the engine (C2.3).
