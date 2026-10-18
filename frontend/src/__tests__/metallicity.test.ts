import { describe, it, expect } from "vitest";
import { ENRICHMENT, feH, gasMetallicity, METALLICITY_FLOOR } from "../simulation/metallicity";
import type { GalaxyType } from "../simulation/galaxy";
import { UNIVERSE_AGE_GYR } from "../simulation/star";

const TYPES: GalaxyType[] = ["spiral", "elliptical", "irregular"];
// The default galaxy's scale is shown as 50,000 light-years (ui/format.ts): 15.3 kpc
const SCALE_KPC = 50_000 / 3261.56;

describe("the galaxy's enrichment (MZ1)", () => {
  it("makes the gas where and when the Sun formed solar", () => {
    expect(feH(gasMetallicity("spiral", 0.52, 9.1))).toBeCloseTo(0, 2);
  });

  it("enriches a spiral's gas at the Sun's distance as the plan's checks give", () => {
    const at = (t: number) => feH(gasMetallicity("spiral", 0.52, t));
    expect(at(1)).toBeCloseTo(-0.8, 1);
    expect(at(3)).toBeCloseTo(-0.4, 1);
    expect(at(6)).toBeCloseTo(-0.1, 1);
    expect(at(UNIVERSE_AGE_GYR)).toBeCloseTo(0.1, 1);
  });

  it("gives a spiral today a gradient near the Milky Way's (about −0.05 dex per kpc)", () => {
    const gradient = (feH(gasMetallicity("spiral", 0.6, UNIVERSE_AGE_GYR)) - feH(gasMetallicity("spiral", 0.4, UNIVERSE_AGE_GYR)))
      / (0.2 * SCALE_KPC);
    expect(gradient).toBeCloseTo(-0.05, 2);
  });

  it("makes an elliptical's old stars metal-rich and an irregular level off near −0.3", () => {
    expect(feH(gasMetallicity("elliptical", 0.34, 1))).toBeGreaterThan(0);
    expect(feH(gasMetallicity("irregular", 0, 100))).toBeCloseTo(-0.3, 1);
    expect(feH(gasMetallicity("irregular", 0.52, UNIVERSE_AGE_GYR))).toBeLessThan(-0.3);
  });

  it("rises with time, falls with distance, and stays between its floor and its ceiling", () => {
    for (const type of TYPES) {
      const ceiling = METALLICITY_FLOOR + ENRICHMENT[type].yieldZ;
      expect(gasMetallicity(type, 0.5, 0)).toBe(METALLICITY_FLOOR);
      for (let r = 0; r <= 1.5; r += 0.1) {
        let previous = 0;
        for (let t = 0; t <= 20; t += 0.5) {
          const z = gasMetallicity(type, r, t);
          expect(z).toBeGreaterThanOrEqual(previous);
          expect(z).toBeGreaterThanOrEqual(METALLICITY_FLOOR);
          expect(z).toBeLessThanOrEqual(ceiling);
          expect(gasMetallicity(type, r + 0.1, t)).toBeLessThanOrEqual(z);
          previous = z;
        }
      }
    }
  });
});
