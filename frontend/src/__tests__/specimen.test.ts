import { describe, it, expect } from "vitest";
import { bodyPlan } from "../rendering/life/morphology";
import type { BodyPlan } from "../rendering/life/morphology";
import { drawSpecimen } from "../rendering/life/specimen";
import type { Lineage } from "../simulation/evolution/engine";
import type { Genome } from "../simulation/evolution/genome";

/** A stand-in 2D context that records every call and assignment, in order. */
function recordingContext(): { ctx: CanvasRenderingContext2D; log: string[] } {
  const log: string[] = [];
  const ctx = new Proxy({}, {
    get: (_, name) => (...args: unknown[]) => { log.push(`${String(name)}(${args.map((a) => typeof a === "number" ? a.toFixed(6) : String(a)).join(",")})`); },
    set: (_, name, value) => { log.push(`${String(name)}=${String(value)}`); return true; },
  }) as unknown as CanvasRenderingContext2D;
  return { ctx, log };
}

const lineage = (over: Partial<Genome>): Lineage => ({
  id: 1, parentId: null, bornGyr: 1, diedGyr: null, deathCause: null, level: 1, biomass: 1,
  bandBiomass: new Float64Array(4), coldestK: 280, warmestK: 300,
  genome: { energySource: "consumer", absorptionPeakNm: 680, log10BodyMassKg: 1, habitat: "land", thermalOptimumK: 290, informationProcessing: 0.3, ...over },
});
const env = { gravityG: 1, starFlux: 1, starTemperatureK: 5772 };
const keys = { galaxySeed: 1, starId: 2, planetId: 3 };
const plans: BodyPlan[] = [
  lineage({ log10BodyMassKg: -12, energySource: "light", habitat: "shallow-water" }),
  lineage({ log10BodyMassKg: -13, energySource: "chemical", habitat: "deep-water" }),
  lineage({ energySource: "light", habitat: "land", log10BodyMassKg: 3 }),
  lineage({ energySource: "light", habitat: "shallow-water" }),
  lineage({ energySource: "chemical", habitat: "deep-water" }),
  lineage({ habitat: "land" }),
  lineage({ habitat: "deep-water" }),
].map((l) => bodyPlan(l, new Map([[l.id, l]]), env, keys));
const style = { ink: "#2b2a26", paper: "#e9e4d6", lineWidth: 1 };

describe("specimen drawings", () => {
  it("draw every kind of body the same way every time", () => {
    for (const plan of plans) {
      const a = recordingContext();
      const b = recordingContext();
      drawSpecimen(a.ctx, plan, { x: 0, y: 0, width: 240, height: 160 }, style);
      drawSpecimen(b.ctx, plan, { x: 0, y: 0, width: 240, height: 160 }, style);
      expect(a.log.length).toBeGreaterThan(5);
      expect(a.log).toEqual(b.log);
    }
  });

  it("report the scale they were drawn at, for the scale bar: twice the box, half the metres per pixel", () => {
    for (const plan of plans) {
      const small = drawSpecimen(recordingContext().ctx, plan, { x: 0, y: 0, width: 200, height: 150 }, style);
      const large = drawSpecimen(recordingContext().ctx, plan, { x: 0, y: 0, width: 400, height: 300 }, style);
      expect(Number.isFinite(small.metresPerPixel) && small.metresPerPixel > 0).toBe(true);
      expect(large.metresPerPixel).toBeCloseTo(small.metresPerPixel / 2, 12);
    }
  });
});
