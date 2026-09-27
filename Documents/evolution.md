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

## The engine

`engine.ts` steps a planet's lineages through one environment at a time. C2.3a built it on its own; the world history loop calls it from C2.3b.

**Unit.** Energy and biomass share one unit: 1 = Earth's present mean sunlight falling on the whole planet, per step. A lineage's biomass is the energy it captures net of its costs.

**A step:**

1. **Mutate.** Each lineage proposes a drifted genome and keeps it unless its potential biomass (what it could hold alone, less what predators able to eat it would take) falls by more than 1%. A lineage stands for a population: better variants spread, and nearly neutral ones can spread by drift.
2. **Score.** Per band, surplus = intake − costs, as fractions of the energy reaching the lineage.
   - intake = light match × oxygen yield × uptake
     - light match: the star's Planck spectrum at the absorption peak, relative to its maximum (light users only)
     - oxygen yield: anaerobic is 1/18 of aerobic; the O₂ giving half the aerobic gain rises as (M / 10⁻⁹ kg)^⅓
     - uptake: need grows as M^¾ (Kleiber) but surface uptake as M^⅔, so a surface-limited body takes in (M / M_cell)^(−1/12); oxygen-powered transport lifts this limit in proportion to the aerobic share
   - costs = maintenance + information · info² + thermal · (ΔT / 10 K)², plus on land support · g · M^(7/12) and UV, plus in shallow water a tenth of that UV
3. **Compete.** Producers share their source's energy per band by weight surplus⁺ × (1 + 3 · info) (chemical users without the information bonus). Consumers draw 10% of the production of lineages one level down in their habitat that are no heavier than themselves, and what they take the prey loses (half of it per unit of the eaters' share). No surplus anywhere, or under 0.5% of the niche, and the lineage dies out.
4. **Speciate.** Rate 2 per Gyr, × (1 + 0.5 per empty neighbouring niche) × (1 + 2 × the share of the 32 lineage slots that are free). The child drifts three times as far and may switch energy source (15%), move to a neighbouring habitat (15%) or eat a level up or down (20%). The step's energy is then shared again with the children in it.
5. **Catastrophes.** The step's impact (15%), volcanic pulse (5%) and each climate transition (10%) kill each lineage with that chance × (1 + mass above 10⁻¹⁵ kg per 20 orders) × (1 + 0.5 per food-chain level).
6. **Cap.** Above 32 living lineages, the weakest in the most crowded niche dies out.

Firsts recorded: light user, consumer, multicellular (above 10⁻⁹ kg), land.

### Owner decisions (C2.3, 2026-09-27)

- **Two commits:** the engine on its own (C2.3a), then the loop wiring, chemistry feedback, origin roll and rules v7 (C2.3b).
- **Size benefit: eat smaller prey.** A consumer eats only lineages no heavier than itself, so large prey escape and predators gain by being large.
- **Oxygen and size: the O₂ a body needs rises with its linear size.**
- **Origin rate (C2.3b): anchored on Earth,** so an Earth-like world usually gets life within ~0.5 Gyr of its oceans forming, and the counts move wherever that leads.

### Engine choices made while building it (C2.3a)

The plan leaves the engine's quantitative model open. These choices were needed to make the owner's decisions work, and each is measured in `engine.test.ts`:

- **Prey lose what they are eaten.** Without it, growing out of predators' reach gains nothing and no size arms race starts.
- **Nearly neutral drift (1%) and larger body-mass steps (0.3 orders of magnitude per step).** With strict "never worse" acceptance, every small size increase costs a little yield and is rejected, so bodies never grow.
- **Oxygen lifts the surface limit on uptake.** The diffusion rule alone does not stop large bodies at zero O₂, where every body is equally anaerobic. With the Kleiber/surface rule (which follows from the plan's M^¾ maintenance), bodies stop near 10⁻⁶ kg without oxygen, and oxygen removes the limit.
- **Speciation rises with free room under the cap.** Without it, random deaths rarely empty whole niches, and survivors of a catastrophe did not split faster (0.24 → 0.22 per lineage per step); with it, 0.24 → 0.31.

Measured on hand-made Earth-like environments (12 seeds, 4 Gyr): without oxygen the heaviest lineage stays microbial (median below 10⁻⁹ kg); with Earth's oxygen, multicellular life appears in most runs by 2–4 Gyr and bodies reach up to ~100 kg over 10 Gyr.

### Open issues for C2.3b and C2.10

- **Gravity does not limit size in practice.** The support cost lowers the heaviest land body that can live as gravity rises (tested), but over 10 Gyr of evolution land bodies stay around 1–250 kg, far below the ceiling (thousands of kg at 1 g), so gravity makes no measurable difference between 0.2 and 5 g. To tune in C2.10: how fast size evolves, or the support constant.
- **Speed.** About 0.3 ms per step, ~19 ms per planet over its history on this machine. The plan budgets 0.6 ms per living planet. Wiring it into the survey as it is could add tens of seconds; C2.3b must measure it and decide (fewer bands for the engine, or other savings).

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
