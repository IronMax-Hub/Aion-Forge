import { describe, it, expect } from "vitest";
import { makeConfig } from "../simulation/config";
import { buildGalaxyConfig } from "../simulation/galaxy";
import { generateStarsFor, UNIVERSE_AGE_GYR } from "../simulation/star";
import { effectiveOrbitAU, generatePlanetsFor } from "../simulation/planet";
import { derivePhysics } from "../simulation/planetPhysics";
import { generateBiosphere } from "../simulation/biosphere";
import { canSustainFire, generateCivilization } from "../simulation/civilization";
import { atmosphereComposition } from "../simulation/atmosphereComposition";
import { surveyLife } from "../simulation/lifeSurvey";
import {
  CIVILIZATION_STAGE_CODES, INDEX_COLUMNS, INDEX_FLAG, LIFE_STAGE_CODES, NO_PARENT, PLANET_TYPE_CODES, WORLD_KIND,
  indexRowsFor, mergeIndices, packIndex,
} from "../simulation/universeIndex";
import type { IndexRow, UniverseIndex } from "../simulation/universeIndex";

const SEED = 100000;
const config = makeConfig(SEED);
// A sample: the survey reads every star the same way
const stars = generateStarsFor(buildGalaxyConfig(SEED, config), UNIVERSE_AGE_GYR, config).stars.slice(0, 100);
const survey = surveyLife(stars, SEED, config);
const { index } = survey;

/** A stored value as Float32 keeps it; absent values are NaN. */
const f32 = (x: number | null | undefined) => (x === null || x === undefined ? NaN : Math.fround(x));

function rowAt(ix: UniverseIndex, i: number): IndexRow {
  return Object.fromEntries(INDEX_COLUMNS.map((column) => [column, ix[column][i]])) as IndexRow;
}

describe("universe index", () => {
  it("has one row per planet, in star order and then planet index order", () => {
    const keys = stars.flatMap((star) => generatePlanetsFor(star, SEED, config).planets.map((p) => [star.id, p.id]));
    expect(index.count).toBe(survey.totalPlanets);
    expect(keys.length).toBe(index.count);
    keys.forEach(([starId, planetIndex], i) => {
      expect(index.starId[i]).toBe(starId);
      expect(index.planetIndex[i]).toBe(planetIndex);
    });
    for (const column of INDEX_COLUMNS) expect(index[column].length).toBe(index.count);
  });

  it("reads every row from what the generators give on the main thread", () => {
    let i = 0;
    for (const star of stars) {
      for (const planet of generatePlanetsFor(star, SEED, config).planets) {
        const bio = generateBiosphere(planet, star);
        const civ = generateCivilization(bio, planet, SEED).civilization;
        const air = atmosphereComposition(planet, civ).mixingRatios;
        const life = planet.life;
        const firstGyr = (kind: string) => life?.phylogeny.firsts.find((f) => f.kind === kind)?.tGyr;
        const flag = (bit: number) => (index.flags[i] & bit) !== 0;

        expect(index.kind[i]).toBe(WORLD_KIND.PLANET);
        expect(index.parentIndex[i]).toBe(NO_PARENT);
        expect(PLANET_TYPE_CODES[index.type[i]]).toBe(planet.type);
        expect(index.massEarths[i]).toBe(f32(planet.mass));
        expect(index.radiusEarths[i]).toBe(f32(planet.size));
        expect(index.orbitAU[i]).toBe(f32(effectiveOrbitAU(planet.orbitalRadius, config)));
        expect(index.temperatureK[i]).toBe(f32(planet.temperature));
        expect(index.oceanFraction[i]).toBe(f32(planet.surface?.oceanFraction));
        expect(index.iceFraction[i]).toBe(f32(planet.surface?.iceFraction));
        expect(index.landFraction[i]).toBe(f32(planet.surface?.landFraction));
        expect(index.pressureBar[i]).toBe(f32(planet.surface?.pressureBar));
        expect(index.o2Bar[i]).toBe(f32(planet.surface?.o2Bar));

        expect(flag(INDEX_FLAG.RARE)).toBe(planet.isRare);
        expect(flag(INDEX_FLAG.TIDALLY_LOCKED)).toBe(derivePhysics(planet, star, SEED, config).tidallyLocked);
        expect(flag(INDEX_FLAG.EVER_LIQUID_WATER)).toBe(planet.everLiquidWater);
        expect(flag(INDEX_FLAG.FIRE_POSSIBLE)).toBe(canSustainFire(planet));
        expect(flag(INDEX_FLAG.O2_WITH_CH4)).toBe((air.O2 ?? 0) >= 0.01 && (air.CH4 ?? 0) >= 1e-6);
        expect(flag(INDEX_FLAG.CFCS)).toBe((air.CFC11 ?? 0) + (air.CFC12 ?? 0) > 0);

        expect(index.lifeBeganGyr[i]).toBe(f32(life?.startedGyr));
        expect(index.lifeEndedGyr[i]).toBe(f32(life?.endedGyr));
        expect(LIFE_STAGE_CODES[index.lifeStage[i]]).toBe(bio.stage);
        expect(index.livingLineages[i]).toBe(life?.phylogeny.livingLineages ?? 0);
        expect(index.massExtinctions[i]).toBe(bio.extinctions.filter((e) => e.severityLoss >= 0.25 && e.severityLoss < 1).length);
        expect(index.largestLog10Kg[i]).toBe(f32(life?.phylogeny.largestLog10BodyMassKg));
        expect(index.firstLightGyr[i]).toBe(f32(firstGyr("light")));
        expect(index.firstMulticellularGyr[i]).toBe(f32(firstGyr("multicellular")));
        expect(index.firstLandGyr[i]).toBe(f32(firstGyr("land")));
        expect(index.firstKilogramGyr[i]).toBe(f32(firstGyr("kilogram")));
        expect(index.oxidationGyr[i]).toBe(f32(planet.worldEvents.find((e) => e.kind === "oxidation")?.tGyr));
        expect(index.lifeOxygenGyr[i]).toBe(f32(life?.oxygenGyr));
        expect(index.mindGyr[i]).toBe(f32(life?.phylogeny.mind?.tGyr));
        expect(index.mindLog10Kg[i]).toBe(f32(life?.phylogeny.mind?.log10BodyMassKg));

        expect(CIVILIZATION_STAGE_CODES[index.civilizationStage[i]]).toBe(civ?.techStage ?? "none");
        const industry = civ?.milestones.find((m) => m.type === "industry");
        expect(index.industryGyr[i]).toBe(f32(industry && star.age - industry.timeAgo));
        expect(index.collapses[i]).toBe(civ?.collapsesCount ?? 0);
        expect(index.speciesEndedAgoGyr[i]).toBe(f32(civ?.extinctAgoGyr));
        i++;
      }
    }
    expect(i).toBe(index.count);
  });

  it("gives giants no surface and no life", () => {
    let giants = 0;
    for (let i = 0; i < index.count; i++) {
      const type = PLANET_TYPE_CODES[index.type[i]];
      if (type !== "gas-giant" && type !== "ice-giant") continue;
      giants++;
      expect(index.oceanFraction[i]).toBeNaN();
      expect(index.pressureBar[i]).toBeNaN();
      expect(index.lifeBeganGyr[i]).toBeNaN();
      expect(index.flags[i] & INDEX_FLAG.EVER_LIQUID_WATER).toBe(0);
    }
    expect(giants).toBeGreaterThan(0);
  });

  it("keeps the highest stage a civilization's record shows, with industry dated exactly when it reached industry", () => {
    const industrial = CIVILIZATION_STAGE_CODES.indexOf("industrial");
    const collapsed = CIVILIZATION_STAGE_CODES.indexOf("collapsed");
    for (let i = 0; i < index.count; i++) {
      const today = index.civilizationStage[i];
      const highest = index.highestStage[i];
      expect(highest === 0).toBe(today === 0);
      expect(highest).not.toBe(collapsed);
      if (today !== collapsed) expect(highest).toBe(today);
      expect(Number.isNaN(index.industryGyr[i])).toBe(highest < industrial);
    }
  });

  it("dates life's own oxygen after the first light user", () => {
    let dated = 0;
    for (let i = 0; i < index.count; i++) {
      if (Number.isNaN(index.lifeOxygenGyr[i])) continue;
      dated++;
      expect(index.lifeOxygenGyr[i]).toBeGreaterThan(index.firstLightGyr[i]);
    }
    expect(dated).toBeGreaterThan(0);
  });

  it("merges the indices of consecutive runs of stars into the index of all of them", () => {
    const rows = stars.flatMap((star) => indexRowsFor(generatePlanetsFor(star, SEED, config), star, SEED, config));
    expect(packIndex(rows)).toEqual(index);
    const cuts = [0, 7, 7, 40, rows.length];
    const parts = cuts.slice(1).map((end, k) => packIndex(rows.slice(cuts[k], end)));
    expect(mergeIndices(parts)).toEqual(index);
    expect(rowAt(mergeIndices(parts), 12)).toEqual(rowAt(index, 12));
    expect(mergeIndices([]).count).toBe(0);
  });
});
