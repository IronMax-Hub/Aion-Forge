import { describe, it, expect } from "vitest";
import {
  aerobicShare, canEat, lightMatch, livingLineages, oxygenYield, startLife, stepEvolution, surplusIn, uptakePerNeed,
  LINEAGE_CAP, MULTICELLULAR_LOG10_KG,
} from "../simulation/evolution/engine";
import type { EvolutionState, Lineage } from "../simulation/evolution/engine";
import { environmentContext, environmentFor } from "../simulation/evolution/environment";
import type { Environment } from "../simulation/evolution/environment";
import type { Genome } from "../simulation/evolution/genome";
import { bandGeometry } from "../simulation/climate";
import type { WorldEventKind } from "../simulation/worldHistory";
import { runWorldHistory } from "../simulation/worldHistory";
import { buildGeography } from "../simulation/geography";
import { derivePhysics } from "../simulation/planetPhysics";
import { planetKey } from "../simulation/planet";
import type { Planet } from "../simulation/planet";
import type { Star } from "../simulation/star";
import { makeConfig } from "../simulation/config";

// Worlds Up Close C2.3a: the evolution engine on its own.

/** An Earth-like step: 30% land, sunlit oceans, the given O₂ and gravity. */
function earthLike(tGyr: number, overrides: Partial<Environment> = {}, water = 0.7): Environment {
  const geometry = bandGeometry(23.4, false);
  const bands = Array.from(geometry.areas, (area, k) => {
    const temperature = 288 + 30 * (geometry.insolation[k] - 1);
    return {
      area, light: geometry.insolation[k] * 0.96, landArea: area * (1 - water),
      shallowWaterArea: area * water, deepWaterArea: area * water,
      landK: temperature, waterK: Math.max(271, temperature),
    };
  });
  return {
    tGyr, dtGyr: 0.1, gravity: 1, starTemperatureK: 5772, starPeakNm: 502, airTransmission: 0.96,
    surfaceUV: 0.96, tectonicActivity: 0.6, co2Bar: 3e-4, o2Bar: 0, ch4Bar: 0, ozone: 0,
    bands, catastrophes: { impact: false, volcanicPulse: false, transitions: [] }, ...overrides,
  };
}

const oxidised: Partial<Environment> = { o2Bar: 0.21, ozone: 0.95, surfaceUV: 0.05 };

interface Run { states: EvolutionState[]; final: EvolutionState }

/** Runs a planet's lineages from life's start through `steps` steps of an environment. */
function run(galaxySeed: number, steps: number, envAt: (step: number) => Environment): Run {
  const keys = { galaxySeed, starId: 1, planetIndex: 0 };
  let state = startLife(envAt(0))!;
  const states = [state];
  for (let step = 1; step <= steps; step++) {
    state = stepEvolution(state, envAt(step), keys, step);
    states.push(state);
  }
  return { states, final: state };
}

const median = (values: number[]) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
const heaviest = (state: EvolutionState) => Math.max(...livingLineages(state).map((l) => l.genome.log10BodyMassKg));

const seeds = Array.from({ length: 12 }, (_, i) => i + 1);
const anoxic = seeds.map((s) => run(s, 40, (step) => earthLike(0.6 + step * 0.1)));
const oxic = seeds.map((s) => run(s, 40, (step) => earthLike(0.6 + step * 0.1, oxidised)));

describe("energy budget", () => {
  it("catches the most light with a pigment at the star's spectral peak", () => {
    expect(lightMatch(502, 5772)).toBeCloseTo(1, 3);
    expect(lightMatch(700, 5772)).toBeLessThan(1);
    expect(lightMatch(966, 3000)).toBeCloseTo(1, 3);
    expect(lightMatch(966, 3000)).toBeGreaterThan(lightMatch(500, 3000));
  });

  it("yields 1/18 as much without oxygen, and needs more O₂ for a bigger body", () => {
    expect(oxygenYield(0, -12)).toBeCloseTo(1 / 18, 12);
    expect(oxygenYield(10, -12)).toBeGreaterThan(0.999);
    // Half the aerobic gain at an O₂ level rising with linear size: 10³ in mass needs 10× the O₂
    expect(aerobicShare(1e-5, -9)).toBeCloseTo(0.5, 12);
    expect(aerobicShare(1e-4, -6)).toBeCloseTo(0.5, 12);
    expect(aerobicShare(0.01, 0)).toBeLessThan(aerobicShare(0.01, -6));
  });

  it("limits a big body's uptake by its surfaces unless oxygen powers transport", () => {
    expect(uptakePerNeed(0, -15)).toBe(1);
    expect(uptakePerNeed(0, -3)).toBeCloseTo(0.1, 6);   // 12 orders of magnitude: 10^(−1)
    expect(uptakePerNeed(0.21, -3)).toBeGreaterThan(0.95);
  });

  it("lets gravity lower the heaviest land body that can live", () => {
    const env = (gravity: number) => earthLike(4, { ...oxidised, gravity });
    const land: Genome = {
      energySource: "consumer", absorptionPeakNm: 502, log10BodyMassKg: 0, habitat: "land",
      thermalOptimumK: 288, informationProcessing: 0,
    };
    const heaviestViable = (gravity: number) => {
      let mass = -15;
      while (mass < 5 && surplusIn({ ...land, log10BodyMassKg: mass + 0.1 }, env(gravity).bands[8], env(gravity)) > 0) mass += 0.1;
      return mass;
    };
    expect(heaviestViable(0.4)).toBeGreaterThan(heaviestViable(1));
    expect(heaviestViable(1)).toBeGreaterThan(heaviestViable(3));
    // In water, gravity carries no cost
    const swimmer: Genome = { ...land, habitat: "shallow-water", log10BodyMassKg: 4 };
    expect(surplusIn(swimmer, env(3).bands[8], env(3))).toBeCloseTo(surplusIn(swimmer, env(0.4).bands[8], env(0.4)), 12);
  });
});

describe("the food chain", () => {
  const lineage = (level: number, log10BodyMassKg: number, habitat: Genome["habitat"] = "shallow-water"): Lineage => ({
    id: 0, parentId: null, bornGyr: 0, diedGyr: null, deathCause: null, level, biomass: 1, bandBiomass: new Float64Array(18), coldestK: Infinity, warmestK: -Infinity,
    genome: { energySource: level === 0 ? "light" : "consumer", absorptionPeakNm: 502, log10BodyMassKg, habitat, thermalOptimumK: 288, informationProcessing: 0 },
  });

  it("lets a consumer eat only lineages one level down, in its habitat, no heavier than itself", () => {
    expect(canEat(lineage(1, -3), lineage(0, -5))).toBe(true);
    expect(canEat(lineage(1, -3), lineage(0, -3))).toBe(true);
    expect(canEat(lineage(1, -3), lineage(0, -2))).toBe(false);   // too big
    expect(canEat(lineage(2, -3), lineage(0, -5))).toBe(false);   // two levels down
    expect(canEat(lineage(1, -3, "land"), lineage(0, -5))).toBe(false);   // other habitat
  });
});

describe("life's start", () => {
  it("begins as one chemical-energy cell in deep water, suited to the water's temperature", () => {
    const state = startLife(earthLike(0.6))!;
    expect(state.lineages).toHaveLength(1);
    const [ancestor] = state.lineages;
    expect(ancestor.genome.energySource).toBe("chemical");
    expect(ancestor.genome.habitat).toBe("deep-water");
    expect(ancestor.genome.log10BodyMassKg).toBe(-15);
    expect(ancestor.genome.thermalOptimumK).toBeGreaterThan(271);
    expect(ancestor.genome.thermalOptimumK).toBeLessThan(300);
    expect(ancestor.biomass).toBeGreaterThan(0);
  });

  it("cannot begin without liquid water", () => {
    expect(startLife(earthLike(0.6, {}, 0))).toBeNull();
  });
});

describe("evolution", () => {
  it("is deterministic", () => {
    expect(run(3, 40, (step) => earthLike(0.6 + step * 0.1, oxidised)).final).toEqual(oxic[2].final);
  });

  it("never holds more than the cap of living lineages", () => {
    for (const { states } of [...anoxic, ...oxic]) for (const state of states) expect(livingLineages(state).length).toBeLessThanOrEqual(LINEAGE_CAP);
  });

  it("keeps a family tree: ids in birth order, each child born after its parent", () => {
    for (const { final } of oxic) {
      final.lineages.forEach((l, i) => {
        expect(l.id).toBe(i);
        if (l.parentId === null) return;
        const parent = final.lineages[l.parentId];
        expect(parent.id).toBeLessThan(l.id);
        expect(l.bornGyr).toBeGreaterThan(parent.bornGyr);
        if (l.diedGyr !== null) expect(l.diedGyr).toBeGreaterThanOrEqual(l.bornGyr);
      });
    }
  });

  it("branches into light users and consumers, and records each first once, when it happens", () => {
    for (const { final } of oxic) {
      const kinds = final.firsts.map((f) => f.kind);
      expect(new Set(kinds).size).toBe(kinds.length);
      expect(kinds).toContain("light");
      expect(kinds).toContain("consumer");
      for (const f of final.firsts) {
        const lineage = final.lineages[f.lineageId];
        expect(f.tGyr).toBeGreaterThanOrEqual(lineage.bornGyr);
        expect(f.tGyr).toBeGreaterThanOrEqual(final.startedGyr);
      }
    }
  });

  it("keeps life small without oxygen, and lets it grow large with it", () => {
    const anoxicHeaviest = anoxic.map((r) => heaviest(r.final));
    const oxicHeaviest = oxic.map((r) => heaviest(r.final));
    expect(median(anoxicHeaviest)).toBeLessThan(MULTICELLULAR_LOG10_KG);
    expect(median(oxicHeaviest)).toBeGreaterThan(MULTICELLULAR_LOG10_KG);
    expect(median(oxicHeaviest) - median(anoxicHeaviest)).toBeGreaterThan(3);
    expect(oxic.filter((r) => r.final.firsts.some((f) => f.kind === "multicellular")).length).toBeGreaterThan(seeds.length / 2);
  });

  it("holds far more biomass where light users can breathe", () => {
    expect(median(oxic.map((r) => r.final.totalBiomass))).toBeGreaterThan(5 * median(anoxic.map((r) => r.final.totalBiomass)));
  });

  it("radiates after a catastrophe: survivors split faster than before it", { timeout: 30_000 }, () => {
    let birthsBefore = 0;
    let aliveBefore = 0;
    let birthsAfter = 0;
    let aliveAfter = 0;
    const crisis = 30;
    const transitions: WorldEventKind[] = ["freezes-over", "thaws"];
    for (let s = 1; s <= 40; s++) {
      const { states } = run(s, crisis + 4, (step) => earthLike(0.6 + step * 0.1, {
        ...oxidised, catastrophes: { impact: step === crisis, volcanicPulse: false, transitions: step === crisis ? transitions : [] },
      }));
      for (let step = crisis - 4; step < crisis - 1; step++) {
        birthsBefore += states[step + 1].nextId - states[step].nextId;
        aliveBefore += livingLineages(states[step]).length;
      }
      for (let step = crisis; step < crisis + 3; step++) {
        birthsAfter += states[step + 1].nextId - states[step].nextId;
        aliveAfter += livingLineages(states[step]).length;
      }
      const crisisGyr = 0.6 + crisis * 0.1;
      const hit = states[crisis].catastrophes.filter((c) => c.tGyr === crisisGyr);
      expect(hit.map((c) => c.cause)).toEqual(["impact", "climate", "climate"]);
    }
    expect(birthsAfter / aliveAfter).toBeGreaterThan(birthsBefore / aliveBefore);
  });

  it("kills larger bodies more often in catastrophes", { timeout: 30_000 }, () => {
    let small = 0;
    let smallDead = 0;
    let large = 0;
    let largeDead = 0;
    for (const { states } of oxic) {
      const before = states[states.length - 1];
      const keys = { galaxySeed: 99, starId: 1, planetIndex: 0 };
      const after = stepEvolution(before, earthLike(4.7, { ...oxidised, catastrophes: { impact: true, volcanicPulse: true, transitions: ["freezes-over"] } }), keys, 41);
      for (const l of livingLineages(before)) {
        const dead = after.lineages[l.id].deathCause !== null && ["impact", "volcanism", "climate"].includes(after.lineages[l.id].deathCause!);
        if (l.genome.log10BodyMassKg > -8) { large++; if (dead) largeDead++; } else { small++; if (dead) smallDead++; }
      }
    }
    expect(large).toBeGreaterThan(0);
    expect(largeDead / large).toBeGreaterThan(smallDead / small);
  });

  it("loses its water life when the water is gone, and all of it when the world is too hot", () => {
    const { final } = oxic[0];
    const dry = stepEvolution(final, earthLike(4.7, oxidised, 0), { galaxySeed: 1, starId: 1, planetIndex: 0 }, 41);
    // Only land life can outlast the oceans
    for (const l of livingLineages(dry)) expect(l.genome.habitat).toBe("land");
    for (const l of livingLineages(final).filter((w) => w.genome.habitat !== "land")) {
      expect(dry.lineages[l.id].diedGyr).toBe(4.7);
    }
    const hot = stepEvolution(final, earthLike(4.7, { ...oxidised, bands: earthLike(4.7).bands.map((b) => ({ ...b, landK: 700, waterK: 700 })) }), { galaxySeed: 1, starId: 1, planetIndex: 0 }, 41);
    expect(hot.endedGyr).toBe(4.7);
  });

  it("does nothing further once life has ended", () => {
    const hot = stepEvolution(oxic[0].final, earthLike(4.7, { bands: earthLike(4.7).bands.map((b) => ({ ...b, landK: 700, waterK: 700 })) }), { galaxySeed: 1, starId: 1, planetIndex: 0 }, 41);
    expect(stepEvolution(hot, earthLike(4.8, oxidised), { galaxySeed: 1, starId: 1, planetIndex: 0 }, 42)).toBe(hot);
  });

  it("does not change the state it is given", () => {
    const before = oxic[1].states[20];
    const copy = structuredClone(before);
    stepEvolution(before, earthLike(2.7, oxidised), { galaxySeed: 2, starId: 1, planetIndex: 0 }, 21);
    expect(before).toEqual(copy);
  });
});

describe("in a real planet's history", () => {
  const seed = 100000;
  const config = makeConfig(seed);
  const sun: Star = {
    id: 1, position: [0, 0, 0], mass: 1, age: 4.6, lifespan: 10, temperature: 5772, luminosity: 1,
    classification: "main-sequence", isRare: false,
  };
  const earth: Planet = {
    id: 2, key: planetKey(1, 2), hostStarId: 1, orbitalRadius: 1, orbitalIndex: 2, type: "rocky",
    size: 1, mass: 1, temperature: 288, atmosphere: "moderate", formationAtmosphere: "moderate", resourceAbundance: 0.5,
    habitabilityScore: 0.8, isRare: false, surface: null, life: null, worldEvents: [],
  };

  it("lives through an Earth-like world's four billion years, microbial while the air has no oxygen", () => {
    const physics = derivePhysics(earth, sun, seed, config);
    const history = runWorldHistory(earth, physics, buildGeography(earth, physics, seed), sun, seed, config, { keepSnapshots: true });
    const context = environmentContext(earth, physics, sun, config);
    const keys = { galaxySeed: seed, starId: 1, planetIndex: 2 };
    let state = startLife(environmentFor(history.snapshots![0], context))!;
    history.snapshots!.slice(1).forEach((snapshot, i) => {
      state = stepEvolution(state, environmentFor(snapshot, context), keys, i + 2);
    });
    expect(state.endedGyr).toBeNull();
    expect(state.firsts.map((f) => f.kind)).toContain("light");
    // Without life's own oxygen (C2.3b), the air stays anoxic and bodies stay small
    expect(heaviest(state)).toBeLessThan(MULTICELLULAR_LOG10_KG);
  });
});
