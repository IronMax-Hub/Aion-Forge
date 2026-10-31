import { describe, it, expect } from "vitest";
import { makeConfig } from "../simulation/config";
import type { UniverseConfig } from "../simulation/config";
import { buildGalaxyConfig } from "../simulation/galaxy";
import { generateStarsFor, UNIVERSE_AGE_GYR } from "../simulation/star";
import { surveyLife } from "../simulation/lifeSurvey";
import { buildSnapshot, compareUniverses, makeExperimentRecord } from "../simulation/experiment";
import { GATES } from "../simulation/greatFilter";

const SEED = 100000;
// A sample of the universe under each set of laws: the first 300 stars, and star 1660, where seed 100000's
// only mind arises under rules v19
function snapshot(config: UniverseConfig) {
  const all = generateStarsFor(buildGalaxyConfig(SEED, config), UNIVERSE_AGE_GYR, config).stars;
  const stars = [...all.slice(0, 300), all[1660]];
  return buildSnapshot(SEED, config, stars.length, surveyLife(stars, SEED, config));
}

const familiar = snapshot(makeConfig(SEED));

describe("the filter in the laboratory", () => {
  it("shows no movement when a universe is compared with itself", () => {
    const cmp = compareUniverses(familiar, familiar);
    expect(cmp.gates.length).toBe(GATES.length);
    expect(cmp.movedGates).toEqual([]);
    expect(cmp.summary).not.toContain("The gate");
    for (const g of cmp.gates) expect(g.experimentPassed).toBe(g.baselinePassed);
  });

  it("names the gates that moved most, and keeps them in the saved experiment", () => {
    const fewMinds = snapshot(makeConfig(SEED, { intelligenceModifier: 0.3 }));
    const cmp = compareUniverses(familiar, fewMinds);
    // Lower intelligence moves the mind gate; nothing before it changes
    expect(cmp.movedGates[0].label).toBe("A mind");
    expect(cmp.movedGates[0].experimentShare).toBeLessThan(cmp.movedGates[0].baselineShare);
    const mind = GATES.findIndex((g) => g.id === "mind");
    for (const g of cmp.gates.slice(0, mind)) expect(g.experimentPassed).toBe(g.baselinePassed);
    expect(cmp.summary).toContain("The gate “A mind” passed");
    expect(makeExperimentRecord(cmp).comparisonSummary).toBe(cmp.summary);
  });
});
