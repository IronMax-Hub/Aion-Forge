import { describe, it, expect } from "vitest";
import { EARTH_HEAT_FLOW_W_M2, interiorHeatFlow, interiorTemperatureK } from "../simulation/interiorHeat";
import { generateStarsFor, SOLAR_AGE_GYR, UNIVERSE_AGE_GYR } from "../simulation/star";
import { co2SaturationBar } from "../simulation/climate";
import { makeConfig } from "../simulation/config";
import { buildGalaxyConfig } from "../simulation/galaxy";
import { generatePlanetsFor, solidWorldOf } from "../simulation/planet";
import { FROZEN_ICE_SHARE, runWorldHistory } from "../simulation/worldHistory";

describe("interior heat (IH1)", () => {
  it("gives Earth today its measured heat flow and about 35 K", () => {
    expect(interiorHeatFlow({ mass: 1 }, SOLAR_AGE_GYR)).toBeCloseTo(EARTH_HEAT_FLOW_W_M2, 12);
    expect(interiorTemperatureK(EARTH_HEAT_FLOW_W_M2)).toBeCloseTo(35, 0);
  });

  it("gives about 0.155 W/m² at full activity", () => {
    expect(interiorHeatFlow({ mass: 1 }, 0)).toBeCloseTo(0.155, 3);
    expect(interiorHeatFlow({ mass: 50 }, 0)).toBe(interiorHeatFlow({ mass: 1 }, 0));
  });

  it("never rises with time, and is larger for larger worlds", () => {
    for (const mass of [0.02, 0.3, 1, 5]) {
      let previous = Infinity;
      for (let t = 0; t <= 14; t += 0.25) {
        const q = interiorHeatFlow({ mass }, t);
        expect(q).toBeLessThanOrEqual(previous);
        expect(q).toBeGreaterThan(0);
        previous = q;
      }
      expect(interiorHeatFlow({ mass: mass * 2 }, 10)).toBeGreaterThanOrEqual(interiorHeatFlow({ mass }, 10));
    }
  });
});

describe("CO₂ that freezes out (IH2, decision 28)", () => {
  const seed = 42;
  const config = makeConfig(seed);
  const stars = generateStarsFor(buildGalaxyConfig(seed, config), UNIVERSE_AGE_GYR, config).stars.slice(0, 120);
  const worlds = stars.flatMap((star) => generatePlanetsFor(star, seed, config).planets
    .filter((p) => p.surface)
    .map((planet) => ({ planet, star })));

  it("never leaves more CO₂ in the air than the last step's temperature lets it hold, and keeps the rest as ice", () => {
    let frozenOut = 0;
    for (const { planet, star } of worlds) {
      const world = solidWorldOf(planet, star, seed, config);
      const h = runWorldHistory(planet, world.physics, world.geography, star, seed, config, { keepSnapshots: true });
      const snaps = h.snapshots!;
      for (let i = 1; i < snaps.length; i++) {
        // A step that froze over or thawed is taken in sub-steps (A1.3), each freezing out against the last
        // sub-step's temperature, which the snapshots do not keep
        const frozen = (x: (typeof snaps)[number]) => x.iceFraction >= FROZEN_ICE_SHARE;
        if (frozen(snaps[i]) !== frozen(snaps[i - 1])) continue;
        expect(snaps[i].co2Bar).toBeLessThanOrEqual(co2SaturationBar(snaps[i - 1].meanK) * (1 + 1e-12));
        expect(snaps[i].co2IceBar).toBeGreaterThanOrEqual(0);
      }
      if (h.final.co2IceBar > 0) frozenOut++;
    }
    expect(frozenOut).toBeGreaterThan(0);
  });
});
