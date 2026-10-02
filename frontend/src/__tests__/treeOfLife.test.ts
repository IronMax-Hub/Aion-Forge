import { describe, it, expect } from "vitest";
import { agoTicks, layoutTree, pruneLineages, MASS_EXTINCTION_SHARE } from "../ui/treeOfLife";
import type { Lineage } from "../simulation/evolution/engine";
import { makeConfig } from "../simulation/config";
import { buildGalaxyConfig } from "../simulation/galaxy";
import { generateStarsFor, UNIVERSE_AGE_GYR } from "../simulation/star";
import { generatePlanetsFor, solidWorldOf } from "../simulation/planet";

const lineage = (id: number, parentId: number | null, bornGyr: number, diedGyr: number | null): Lineage => ({
  id, parentId, bornGyr, diedGyr, deathCause: diedGyr === null ? null : "outcompeted", level: 0, biomass: 0.1,
  bandBiomass: new Float64Array(4), coldestK: 280, warmestK: 300,
  genome: { energySource: "light", absorptionPeakNm: 680, log10BodyMassKg: -12, habitat: "shallow-water", thermalOptimumK: 290, informationProcessing: 0 },
});

// 0 ─┬─ 1 (dies) ── 3 (lives)
//    ├─ 2 (dies, short)
//    └─ 4 (dies, long)
const small = [lineage(0, null, 1, 2), lineage(1, 0, 1.5, 3), lineage(2, 0, 1.6, 1.7), lineage(3, 1, 2.5, null), lineage(4, 0, 1.8, 4)];

describe("pruning the tree", () => {
  it("always keeps the living and every ancestor, then the longest-lived extinct branches", () => {
    expect(pruneLineages(small, 3)).toEqual(new Set([0, 1, 3]));
    expect(pruneLineages(small, 4)).toEqual(new Set([0, 1, 3, 4]));   // 4 lived 2.2 Gyr, 2 only 0.1
    expect(pruneLineages(small, 99).size).toBe(5);
  });
});

describe("laying out the tree", () => {
  const tree = layoutTree(small, [], 1, 5);

  it("draws each lineage from its birth to its death, or to today", () => {
    for (const r of tree.rows) {
      expect(r.fromGyr).toBe(r.lineage.bornGyr);
      expect(r.toGyr).toBe(r.lineage.diedGyr ?? 5);
    }
  });

  it("puts a parent above its children and keeps each clade together, children in birth order", () => {
    expect(tree.rows.map((r) => r.lineage.id)).toEqual([0, 1, 3, 2, 4]);
    for (const r of tree.rows) if (r.parentRow !== null) expect(r.parentRow).toBeLessThan(r.row);
  });

  it("marks as mass extinctions only catastrophes that killed a quarter of the living or more", () => {
    const t = layoutTree(small, [
      { tGyr: 2, cause: "impact", aliveBefore: 8, lineagesLost: 2 },
      { tGyr: 3, cause: "volcanism", aliveBefore: 8, lineagesLost: 1 },
    ], 1, 5);
    expect(t.extinctions).toEqual([{ tGyr: 2, cause: "impact", share: MASS_EXTINCTION_SHARE }]);
  });

  it("ticks the axis in tidy steps back from today", () => {
    expect(agoTicks(8.7)).toEqual([0, 2, 4, 6, 8]);
    expect(agoTicks(0.35)).toEqual([0, 0.05, 0.1, 0.15, 0.2, 0.25, 0.3, 0.35]);
  });
});

describe("trees of real planets", () => {
  it("stay inside the time axis and their lineages' lives, joined parent to child", () => {
    const seed = 100000;
    const config = makeConfig(seed);
    const stars = generateStarsFor(buildGalaxyConfig(seed, config), UNIVERSE_AGE_GYR, config).stars;
    let checked = 0;
    for (const star of stars) {
      for (const planet of generatePlanetsFor(star, seed, config).planets) {
        if (!planet.life || planet.life.endedGyr !== null) continue;
        const life = solidWorldOf(planet, star, seed, config).history.life!;
        const tree = layoutTree(life.lineages, life.catastrophes, life.startedGyr, star.age);
        const living = life.lineages.filter((l) => l.diedGyr === null);
        expect(tree.rows.filter((r) => r.living)).toHaveLength(living.length);
        const byId = new Map(tree.rows.map((r) => [r.lineage.id, r]));
        for (const r of tree.rows) {
          expect(r.fromGyr).toBeGreaterThanOrEqual(tree.startGyr);
          expect(r.toGyr).toBeLessThanOrEqual(tree.nowGyr);
          expect(r.fromGyr).toBeLessThanOrEqual(r.toGyr);
          // A drawn parent is joined at the child's birth, while the parent was alive
          if (r.parentRow !== null) {
            const parent = byId.get(r.lineage.parentId!)!;
            expect(parent.row).toBe(r.parentRow);
            expect(parent.fromGyr).toBeLessThanOrEqual(r.fromGyr);
          }
        }
        if (++checked >= 5) return;
      }
    }
  });
});
