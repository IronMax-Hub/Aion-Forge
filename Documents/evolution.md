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
