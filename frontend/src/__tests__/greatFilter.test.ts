import { describe, it, expect } from "vitest";
import { makeConfig } from "../simulation/config";
import { buildGalaxyConfig } from "../simulation/galaxy";
import { generateStarsFor, UNIVERSE_AGE_GYR } from "../simulation/star";
import type { Star } from "../simulation/star";
import { generatePlanetsFor } from "../simulation/planet";
import { generateBiosphere } from "../simulation/biosphere";
import { generateCivilization, mindCanUseFire, techLevelToStage } from "../simulation/civilization";
import { surveyLife } from "../simulation/lifeSurvey";
import { breakdown, FILTER_MIN_ARRIVING, funnelOf, GATES, quantile, spreadOf, stoppedAt } from "../simulation/greatFilter";
import type { UniverseIndex } from "../simulation/universeIndex";

function starsOf(seed: number): Star[] {
  const config = makeConfig(seed);
  return generateStarsFor(buildGalaxyConfig(seed, config), UNIVERSE_AGE_GYR, config).stars;
}

/** How many gates a planet passes in a row, counted from the generators rather than the index. */
function directGates(seed: number, stars: Star[]): number[] {
  const config = makeConfig(seed);
  const out: number[] = [];
  for (const star of stars) {
    for (const planet of generatePlanetsFor(star, seed, config).planets) {
      const bio = generateBiosphere(planet, star);
      const civ = generateCivilization(bio, planet, seed).civilization;
      const phylogeny = planet.life?.phylogeny;
      const first = (kind: string) => phylogeny?.firsts.some((f) => f.kind === kind) ?? false;
      const highest = civ ? techLevelToStage(civ.techLevel, false) : null;
      const checks = [
        planet.surface !== null,
        planet.everLiquidWater,
        planet.life !== null,
        first("light"),
        planet.life?.oxygenGyr != null,
        first("multicellular"),
        phylogeny?.mind != null,
        mindCanUseFire(planet),
        highest === "industrial" || highest === "information" || highest === "space-age",
        highest === "information" || highest === "space-age",
        highest === "space-age",
        civ !== null && civ.techStage !== "collapsed",
      ];
      const k = checks.indexOf(false);
      out.push(k === -1 ? checks.length : k);
    }
  }
  return out;
}

// Seed 100000 whole, for the plan's table
const SEED = 100000;
const seedStars = starsOf(SEED);
let fullIndex: UniverseIndex | null = null;
const indexOf100000 = () => (fullIndex ??= surveyLife(seedStars, SEED, makeConfig(SEED)).index);

describe("the Great Filter funnel", () => {
  it("counts seed 100000's funnel, and never rises", () => {
    const funnel = funnelOf(indexOf100000());
    expect(funnel.worlds).toBe(6893);
    // The plan's table is rules v10 (8,537 planets; 7,134, 4,730, 4,167, 1,706, 334, 271, 86, 37, 22, 13, 3, 3).
    // Rules v11: AE1's activity curve, then AE2's escape, water loss, one atmosphere draw and past giants
    // (109 planets engulfed by the giants today's white dwarfs once were)
    // (7,051, 4,428, 3,795, 1,326, 234, 179, 53, 25, 16, 10, 2, 2 of 8,428 planets).
    // Rules v12: MZ3's planet masses from the disk's solids (778 bodies too small to be planets)
    // (6,549, 4,037, 3,441, 1,142, 198, 150, 36, 16, 14, 8, 2, 2).
    // Rules v13: IH1's outgassing ∝ τ·g instead of τ·g² (decision 41)
    // (6,549, 4,040, 3,429, 1,255, 198, 150, 40, 17, 9, 4, 1, 1), then IH2's greenhouse scaled by the
    // energy the air holds: worlds warm only from thick air far from their stars freeze (Issue 1)
    // (6,549, 4,032, 3,452, 432, 165, 127, 27, 13, 5, 2, 0, 0), then IH3's ice shells: water under ice
    // stays liquid only below a shell the interior's heat can hold up
    // (6,549, 2,683, 2,094, 360, 165, 127, 28, 14, 6, 3, 0, 0). Rules v14 (MO4): water under an ice shell
    // stays liquid below water's triple point too, as on airless Europa (IH3 had counted it frozen)
    // (6,549, 3,032, 2,307, 426, 165, 127, 28, 14, 6, 3, 0, 0), then MO5's large moons and wandering tilts
    // (6,549, 3,034, 2,302, 425, 161, 123, 29, 14, 8, 7, 0, 0 of 7,650 planets). Rules v15 (BS2): 757 planets
    // drawn where a companion allows no orbit are removed (5,911, 2,762, 2,121, 395, 153, 119, 27, 13, 7, 6, 0, 0),
    // then BS3's light from both stars (…, 119, 26, 13, 7, 6, 0, 0). Rules v16: minds must eat other life,
    // and a species ends when its consumer line does (…, 119, 24, 11, 5, 4, 0, 0). Rules v17: a consumer gains
    // from thinking as far as it sees, water life breathes dissolved oxygen, and only a mind on land has fire
    expect(funnel.steps.map((s) => s.passed)).toEqual([5911, 2760, 2120, 395, 152, 116, 10, 3, 3, 3, 0, 0]);
    for (let g = 1; g < funnel.steps.length; g++) {
      expect(funnel.steps[g].arrived).toBe(funnel.steps[g - 1].passed);
      expect(funnel.steps[g].passed).toBeLessThanOrEqual(funnel.steps[g].arrived);
    }
    // The steepest gate that at least ten worlds reach: from v17, a multicellular body to a mind (10 of 116,
    // about 9%); v13–v16, life to light-using life (about 13%); before it, light-using life to an oxygenated sky
    expect(funnel.filter).toBe("mind");
  });

  it("equals counts made directly from the generators", () => {
    for (const seed of [42, 7777]) {
      const stars = starsOf(seed).slice(0, 250);
      const funnel = funnelOf(surveyLife(stars, seed, makeConfig(seed)).index);
      const reached = directGates(seed, stars);
      GATES.forEach((_, g) => expect(funnel.steps[g].passed, `${seed} gate ${g + 1}`).toBe(reached.filter((k) => k > g).length));
      const named = funnel.steps.find((s) => s.gate.id === funnel.filter);
      if (named) expect(named.arrived).toBeGreaterThanOrEqual(FILTER_MIN_ARRIVING);
    }
  });
});

describe("where worlds stop", () => {
  it("splits the worlds at every gate into those that stopped and those that passed", () => {
    const index = indexOf100000();
    const funnel = funnelOf(index);
    for (const [g, gate] of GATES.entries()) {
      const b = breakdown(index, seedStars, gate.id);
      expect(b.arrived).toBe(funnel.steps[g].arrived);
      expect(b.passed).toBe(funnel.steps[g].passed);
      expect(b.stopped + b.passed).toBe(b.arrived);
      expect(stoppedAt(index, gate.id).length).toBe(b.stopped);
      for (const c of b.conditions) {
        for (const share of [c.stopped, c.passed]) {
          if (!Number.isNaN(share)) {
            expect(share).toBeGreaterThanOrEqual(0);
            expect(share).toBeLessThanOrEqual(1);
          }
        }
      }
      if (b.waiting) {
        expect(b.waiting.passedWaitsGyr.length).toBe(b.passed);
        for (const w of b.waiting.passedWaitsGyr) expect(w).toBeGreaterThanOrEqual(0);
        if (b.stopped > 0) {
          expect(b.waiting.stoppedUnderMedian).toBeGreaterThanOrEqual(0);
          expect(b.waiting.stoppedUnderMedian).toBeLessThanOrEqual(1);
        }
      }
      expect(b.waiting !== null).toBe(["light", "oxygen", "multicellular", "mind"].includes(gate.id));
      expect(b.fire !== null).toBe(gate.id === "fire");
    }
  });

  it("counts which of fire's conditions fail where minds have no fire, a mind in water among them (rules v17)", () => {
    const index = indexOf100000();
    const fire = breakdown(index, seedStars, "fire");
    expect(fire.stopped).toBe(10 - 3);
    // Every stopped world fails at least one condition, and none fails more than the stopped count
    const { noLand, thinAir, lowOxygen, inWater } = fire.fire!;
    expect(noLand + thinAir + lowOxygen + inWater).toBeGreaterThanOrEqual(fire.stopped);
    for (const n of [noLand, thinAir, lowOxygen, inWater]) expect(n).toBeLessThanOrEqual(fire.stopped);
  });

  it("interpolates quantiles", () => {
    expect(quantile([1, 2, 3, 4], 0.5)).toBe(2.5);
    expect(quantile([5], 0.5)).toBe(5);
    expect(quantile([], 0.5)).toBeNaN();
  });
});

describe("many seeds", () => {
  it("reproduces one universe's funnel from one seed", () => {
    const funnel = funnelOf(indexOf100000());
    const spread = spreadOf([funnel]);
    spread.forEach((g, i) => {
      expect(g.passed).toEqual({ median: funnel.steps[i].passed, min: funnel.steps[i].passed, max: funnel.steps[i].passed });
    });
  });

  it("gives the same medians whatever order the seeds finish in", () => {
    const funnels = [11, 12, 13, 14, 15].map((seed) => funnelOf(surveyLife(starsOf(seed).slice(0, 120), seed, makeConfig(seed)).index));
    const forward = spreadOf(funnels);
    expect(spreadOf([...funnels].reverse())).toEqual(forward);
    expect(spreadOf([funnels[2], funnels[0], funnels[4], funnels[1], funnels[3]])).toEqual(forward);
    for (const g of forward) {
      expect(g.passed.min).toBeLessThanOrEqual(g.passed.median);
      expect(g.passed.median).toBeLessThanOrEqual(g.passed.max);
    }
  });
});
