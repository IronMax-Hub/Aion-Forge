import { describe, it, expect } from "vitest";
import { ACCRETION, CENTRAL_BLACK_HOLE, centralBlackHoleFor, DISC_PEAK_TEMPERATURE, eventHorizonRadiusKm, SUPERMASSIVE_FROM_SOLAR, THIN_DISC_FROM_EDDINGTON } from "../simulation/blackHole";
import type { GalaxyConfig, GalaxyType } from "../simulation/galaxy";
import { formatHorizonRadius, formatSolarMasses } from "../ui/format";

const SEEDS = Array.from({ length: 2000 }, (_, i) => i * 7919 + 1);
const galaxy = (type: GalaxyType, seed: number): GalaxyConfig => ({ type, particleCount: 0, seed, scale: 120 });

describe("central black hole", () => {
  it("is the same for the same galaxy", () => {
    for (const seed of SEEDS.slice(0, 50)) {
      expect(centralBlackHoleFor(galaxy("spiral", seed))).toEqual(centralBlackHoleFor(galaxy("spiral", seed)));
    }
  });

  it("is always present in spirals and ellipticals, and in about half of irregulars", () => {
    const share = (type: GalaxyType) => SEEDS.filter(seed => centralBlackHoleFor(galaxy(type, seed))).length / SEEDS.length;
    expect(share("spiral")).toBe(1);
    expect(share("elliptical")).toBe(1);
    expect(share("irregular")).toBeCloseTo(CENTRAL_BLACK_HOLE.irregular.chance, 1);
  });

  it("weighs about its type's typical mass, ellipticals heaviest", () => {
    const meanLog10 = (type: GalaxyType) => {
      const masses = SEEDS.flatMap(seed => centralBlackHoleFor(galaxy(type, seed))?.massSolar ?? []);
      return masses.reduce((sum, m) => sum + Math.log10(m), 0) / masses.length;
    };
    for (const type of ["spiral", "elliptical", "irregular"] as const) {
      expect(meanLog10(type)).toBeCloseTo(CENTRAL_BLACK_HOLE[type].log10MeanSolar, 1);
    }
  });

  it("is supermassive from its threshold up", () => {
    for (const seed of SEEDS) {
      const hole = centralBlackHoleFor(galaxy("irregular", seed));
      if (hole) expect(hole.kind).toBe(hole.massSolar >= SUPERMASSIVE_FROM_SOLAR ? "supermassive" : "intermediate-mass");
    }
  });

  it("feeds below its Eddington limit, mostly slowly, with a thin disc only from a hundredth of it", () => {
    const holes = SEEDS.flatMap(seed => centralBlackHoleFor(galaxy("spiral", seed)) ?? []);
    for (const hole of holes) {
      expect(hole.eddingtonRatio).toBeLessThanOrEqual(ACCRETION.maxEddington);
      expect(hole.accretionMode).toBe(hole.eddingtonRatio >= THIN_DISC_FROM_EDDINGTON ? "thin-disc" : "hot-flow");
    }
    const meanLog10 = holes.reduce((sum, h) => sum + Math.log10(h.eddingtonRatio), 0) / holes.length;
    expect(meanLog10).toBeCloseTo(ACCRETION.log10MeanEddington, 0);
    const thinShare = holes.filter(h => h.accretionMode === "thin-disc").length / holes.length;
    expect(thinShare).toBeGreaterThan(0.03);
    expect(thinShare).toBeLessThan(0.2);
  });

  it("has hotter discs around lighter and hungrier black holes", () => {
    const peak = (massSolar: number, eddingtonRatio: number) =>
      DISC_PEAK_TEMPERATURE.kelvin * (eddingtonRatio / (massSolar / DISC_PEAK_TEMPERATURE.atSolar)) ** 0.25;
    for (const seed of SEEDS.slice(0, 100)) {
      const hole = centralBlackHoleFor(galaxy("elliptical", seed))!;
      expect(hole.discPeakTemperatureK).toBeCloseTo(peak(hole.massSolar, hole.eddingtonRatio), -1);
    }
  });

  it("has Sagittarius A*'s horizon at its mass", () => {
    expect(eventHorizonRadiusKm({ massSolar: 4.3e6 })).toBeCloseTo(1.27e7, -5);
  });
});

describe("black hole formatting", () => {
  it("names masses in words", () => {
    expect(formatSolarMasses(4.3e6)).toBe("4.3 million M☉");
    expect(formatSolarMasses(6.5e9)).toBe("6.5 billion M☉");
    expect(formatSolarMasses(25_000)).toBe("25 thousand M☉");
  });
  it("gives a horizon in AU once it is large", () => {
    expect(formatHorizonRadius(1.27e7)).toBe("0.085 AU");
    expect(formatHorizonRadius(30_000)).toBe("30,000 km");
  });
});
