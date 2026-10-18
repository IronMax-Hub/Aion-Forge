import { describe, it, expect } from "vitest";
import { EARTH_HEAT_FLOW_W_M2, interiorHeatFlow, interiorTemperatureK } from "../simulation/interiorHeat";
import { SOLAR_AGE_GYR } from "../simulation/star";

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
