import { describe, it, expect } from "vitest";
import {
  agoText, chooseSpecimens, describeSpecimen, fieldGuideSpecimens, formatLength, formatMass, mindSpecies, MAX_SPECIMENS,
} from "../ui/specimens";
import { bodyPlans } from "../rendering/life/morphology";
import type { Lineage } from "../simulation/evolution/engine";
import type { Genome } from "../simulation/evolution/genome";
import { STEP_GYR } from "../simulation/worldHistory";
import { makeConfig } from "../simulation/config";
import { buildGalaxyConfig } from "../simulation/galaxy";
import { generateStarsFor, UNIVERSE_AGE_GYR } from "../simulation/star";
import { generatePlanetsFor, solidWorldOf } from "../simulation/planet";

const lineage = (id: number, over: Partial<Genome> = {}, extra: Partial<Lineage> = {}): Lineage => ({
  id, parentId: null, bornGyr: 1, diedGyr: null, deathCause: null, level: 1, biomass: 0.1,
  bandBiomass: new Float64Array(4), coldestK: 280, warmestK: 300,
  genome: { energySource: "consumer", absorptionPeakNm: 680, log10BodyMassKg: -2, habitat: "land", thermalOptimumK: 290, informationProcessing: 0.2, ...over },
  ...extra,
});
const env = { gravityG: 1, starFlux: 1, starTemperatureK: 5772 };
const keys = { galaxySeed: 1, starId: 2, planetId: 3 };
const plansOf = (ls: Lineage[]) => bodyPlans(ls, env, keys);

describe("choosing specimens", () => {
  const microbes = Array.from({ length: 20 }, (_, i) => lineage(i, { log10BodyMassKg: -13, energySource: "light", habitat: "shallow-water" }, { biomass: 1 + i }));
  const mindLine = lineage(100, { log10BodyMassKg: -1 }, { parentId: null, diedGyr: 3 });          // a mind arose here, then it died out
  const heir = lineage(101, { log10BodyMassKg: -1.5 }, { parentId: 100, biomass: 0.01 });           // its living descendant
  const giant = lineage(102, { log10BodyMassKg: 2 }, { biomass: 0.02 });
  const tree = lineage(103, { energySource: "light", log10BodyMassKg: 1 }, { biomass: 0.03 });
  const all = [...microbes, mindLine, heir, giant, tree];

  it("puts the mind's living species first, then the largest body, then one of each kind, then by biomass", () => {
    const chosen = chooseSpecimens(all, plansOf(all), 100);
    expect(chosen.map((l) => l.id).slice(0, 4)).toEqual([101, 102, 103, 19]);
    expect(chosen).toHaveLength(MAX_SPECIMENS);
    expect(chosen.every((l) => l.diedGyr === null)).toBe(true);
  });

  it("counts a mind's descendants as its species", () => {
    expect(mindSpecies(all, 100)).toEqual(new Set([100, 101]));
    expect(mindSpecies(all, null).size).toBe(0);
  });

  it("shows the last lineages to die where life has ended", () => {
    const dead = [lineage(1, {}, { diedGyr: 2 }), lineage(2, {}, { diedGyr: 5 }), lineage(3, {}, { diedGyr: 4 })];
    expect(chooseSpecimens(dead, plansOf(dead), null).map((l) => l.id)).toEqual([2, 3, 1]);
  });
});

describe("what a plate says", () => {
  it("describes a body plainly, from its plan and traits", () => {
    const swimmer = lineage(7, { habitat: "shallow-water", log10BodyMassKg: -5 }, { level: 2 });
    const text = describeSpecimen(swimmer, plansOf([swimmer]).get(7)!);
    expect(text).toMatch(/finned hunter, shallow seas$/);
    const mat = lineage(8, { log10BodyMassKg: -13, energySource: "chemical", habitat: "shallow-water" });
    expect(describeSpecimen(mat, plansOf([mat]).get(8)!)).toBe("microscopic mat-forming microbe, shallow seas");
  });

  it("writes masses and lengths in the unit that suits them", () => {
    expect(formatMass(3)).toBe("1 t");
    expect(formatMass(0)).toBe("1 kg");
    expect(formatMass(-4)).toBe("100 mg");
    expect(formatMass(-12)).toBe("1 ng");
    expect(formatLength(0.017)).toBe("1.7 cm");
    expect(formatLength(2.5e-6)).toBe("2.5 µm");
  });

  it("dates no closer than the history's own steps", () => {
    expect(agoText(0)).toBe("within the last 0.1 Gyr");
    expect(STEP_GYR).toBeCloseTo(0.1, 12);
    expect(agoText(0.379)).toBe("0.379 Gyr ago");
  });
});

describe("field guides of real planets", () => {
  const seed = 100000;
  const config = makeConfig(seed);
  const stars = generateStarsFor(buildGalaxyConfig(seed, config), UNIVERSE_AGE_GYR, config).stars;

  it("give every living planet's plates, dated within its star's life, the same every time", () => {
    let checked = 0;
    for (const star of stars) {
      for (const planet of generatePlanetsFor(star, seed, config).planets) {
        if (!planet.life || planet.life.endedGyr !== null) continue;
        const life = solidWorldOf(planet, star, seed, config).history.life!;
        const source = {
          lineages: life.lineages, plans: bodyPlans(life.lineages, env, { galaxySeed: seed, starId: star.id, planetId: planet.id }),
          planetName: "x", starAgeGyr: star.age, mindLineageId: planet.life.phylogeny.mind?.lineageId ?? null,
        };
        const plates = fieldGuideSpecimens(source);
        expect(plates.length).toBe(Math.min(MAX_SPECIMENS, planet.life.phylogeny.livingLineages));
        for (const p of plates) {
          expect(p.lineage.bornGyr).toBeGreaterThanOrEqual(planet.life.startedGyr);
          expect(p.lineage.bornGyr).toBeLessThanOrEqual(star.age);
        }
        expect(fieldGuideSpecimens(source).map((p) => p.description)).toEqual(plates.map((p) => p.description));
        if (++checked >= 5) return;
      }
    }
  });
});
