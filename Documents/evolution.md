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

## Life in the world history (C2.3b)

From rules v7 the world history loop (`worldHistory.ts`) carries life:

- **Origin.** Until life has begun, each step has a chance of it beginning: 4.6 per Gyr per unit of liquid-water area (a share of the planet), × emergence sensitivity. An Earth-like world (70% ocean) gets life within 0.5 Gyr of its oceans in about 4 cases out of 5 (owner decision: anchored on Earth). Life begins at most once; if it dies out, the planet keeps the dates.
- **Evolution.** Once begun, one engine step per loop step, in that step's environment.
- **Oxygen** (owner decision). Light users make it, 4 bar/Gyr per unit of light-user biomass × g; life respires it, 17 per Gyr per unit of total biomass × O₂. The two are solved exactly over each step, so O₂ relaxes towards 0.235 · g · (light-user share of biomass): about 0.21 bar on an Earth-like world. Early anoxic light users (biomass ~0.02) out-produce the crust and volcanic sinks, so oxidation follows them.
- **Methane.** Chemical-energy life makes it, 70 bar/Gyr per unit of biomass × g × the anaerobic share of a cell's metabolism, against the existing destruction (faster in O₂); solved exactly over each step. Anoxic vent life keeps ~10⁻³ bar; oxidised air far less.
- **The biosphere** reads whether a planet has life today, and since when, from the loop (R4; owner decision). Its other fields keep their seeded rolls until C2.5.

Found and fixed on the way: the existing methane destruction, stepped explicitly, multiplied methane by exactly zero every 0.1 Gyr step. It did not show while nothing made methane.

Measured (seed 100000, first 400 stars, before stats): life begins on ~58% of solid planets and lives today on ~45%. On Earth copies around the Sun, life begins at 0.6–1.1 Gyr, light users appear at 2.8–3.4 Gyr and the air oxidises at 3.0–3.5 Gyr, settling at 0.19–0.21 bar; some copies stay anoxic.

A world's life now changes its climate too: on a hot Earth at 0.46 AU, life's oxygen raises the pressure and so the boiling point enough to hold off the runaway greenhouse the lifeless planet suffers.

**Speed** (owner decision: accept the slower survey). With the engine running on every planet where life begins, a universe takes about 85 s to generate on this machine, against ~3 s before. The survey runs in the background worker with its progress bar.

## The biosphere summary (C2.5)

From rules v8 the biosphere (`biosphere.ts`) is read from the lineages and draws nothing. At the end of each world history, `evolution/phylogeny.ts` reduces the evolution state to a summary kept on `Planet.life.phylogeny`, and the biosphere reads:

| Field | Read from |
|---|---|
| Stage | microbial: largest living body below 10⁻⁹ kg · multicellular: 10⁻⁹–10⁻³ kg, or larger with fewer than three food-chain levels · complex: above 10⁻³ kg and at least three food-chain levels · dominant: complex, and producers hold biomass on more than 60% of the habitable area (land and liquid water, in the last step's environment) |
| Complexity | largest living body mass as a share of the genome's range (−15 to 5) |
| Diversity | living lineages ÷ the cap (32) |
| Stability | share of lineages that came through the last five catastrophes; 1 if none has struck |
| Adaptability | mean standard deviation of body mass, thermal optimum and information processing (each as a share of its range), ÷ that of an even spread (1/√12), capped at 1. The absorption peak is left out: only light users read it |
| Biomass | living biomass on a log scale: 10⁻⁵ of Earth's mean sunlight (vent life) → 0, 1 → 1 |
| Extinctions | every catastrophe that killed a lineage (owner decision), severity = share of lineages lost |
| `extinctAt` | Gyr ago life ended; null while it lives. Life that has ended has no stage, and `ageGyr` is how long it lasted (R8). Shown in the biosphere panel (owner decision) |

"Prebiotic" is no longer produced; it stays in the type only (R9).

### Owner decisions (C2.5, 2026-10-02)

- **Dominant as written:** producer presence over land and liquid water. Measured before the change (seed 100000, first 400 stars, 607 living worlds): oxygen-breathing large bodies need light producers almost everywhere, so 14 of 15 complex worlds are dominant. Dominant and complex barely differ until tuning (C2.10) separates them.
- **Every lethal catastrophe is an extinction**, not only large ones: a median world has 23 catastrophes on record (the lethal ones were not counted separately), and 4 of them killed a quarter of its lineages or more. The timeline still records each as a "mass extinction" until C2.7 rewrites the biological events.
- **Extinct life is shown** in the biosphere panel: when it ended and how long it lasted.

Measured on the same sample before the change: 91% of living worlds are microbial, 6% multicellular, 2.5% complex or dominant. Large bodies need oxygen, and most worlds never oxidise. Civilizations still need a complex or dominant stage, so they become rarer.

### Open issues for C2.10

- **Gravity does not limit size in practice.** The support cost lowers the heaviest land body that can live as gravity rises (tested), but over 10 Gyr of evolution land bodies stay around 1–250 kg, far below the ceiling (thousands of kg at 1 g), so gravity makes no measurable difference between 0.2 and 5 g. To tune in C2.10: how fast size evolves, or the support constant.
- **Land life without water.** Land lineages can outlive a planet's oceans; nothing yet ties land life to water.

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
