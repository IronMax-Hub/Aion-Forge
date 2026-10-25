import { describe, expect, it } from "vitest";
import { BLACK_HOLE_QUALITY, configuredQualityLevel, qualityForAccretion, qualityForThermalStatus } from "../rendering/blackHole/quality";
import { galaxyFrameFor, shaderDefines } from "../rendering/blackHole/BlackHoleView";

describe("black hole quality levels", () => {
  it("keeps standard as the close-up was first built for the desktop", () => {
    expect(BLACK_HOLE_QUALITY.standard).toEqual({
      resolutionScale: 0.5, maxSteps: 220, stepScale: 0.07, minStep: 0.015, maxStep: 1.0,
      streakOctaves: 4, starSize: 1.0, movingFps: 0, stillFps: 0,
    });
  });

  it("traces more finely at each level up", () => {
    const [s, m, h] = [BLACK_HOLE_QUALITY.standard, BLACK_HOLE_QUALITY.medium, BLACK_HOLE_QUALITY.high];
    expect(s.resolutionScale).toBeLessThan(m.resolutionScale);
    expect(m.resolutionScale).toBeLessThan(h.resolutionScale);
    expect(s.stepScale).toBeGreaterThan(m.stepScale);
    expect(m.stepScale).toBeGreaterThan(h.stepScale);
    expect(s.maxSteps).toBeLessThan(m.maxSteps);
    expect(m.maxSteps).toBeLessThan(h.maxSteps);
  });

  it("reads the build's level, standard when unset or unknown", () => {
    expect(configuredQualityLevel("high")).toBe("high");
    expect(configuredQualityLevel("medium")).toBe("medium");
    expect(configuredQualityLevel(undefined)).toBe("standard");
    expect(configuredQualityLevel("ultra")).toBe("standard");
  });
});

describe("level for the black hole's gas", () => {
  it("traces a thin disc at the chosen level", () => {
    for (const level of ["standard", "medium", "high"] as const) expect(qualityForAccretion(level, "thin-disc")).toBe(level);
  });

  it("traces a hot flow one level lower, never below standard", () => {
    expect(qualityForAccretion("high", "hot-flow")).toBe("medium");
    expect(qualityForAccretion("medium", "hot-flow")).toBe("standard");
    expect(qualityForAccretion("standard", "hot-flow")).toBe("standard");
  });
});

describe("heat guard", () => {
  it("keeps the build's level while the phone is cool or slightly warm, or cannot say", () => {
    expect(qualityForThermalStatus("high", -1)).toBe("high");
    expect(qualityForThermalStatus("high", 0)).toBe("high");
    expect(qualityForThermalStatus("high", 1)).toBe("high");
  });

  it("drops one level once the phone is moderately hot", () => {
    expect(qualityForThermalStatus("high", 2)).toBe("medium");
    expect(qualityForThermalStatus("medium", 2)).toBe("standard");
    expect(qualityForThermalStatus("standard", 2)).toBe("standard");
  });

  it("falls back to standard once the phone is severely hot or worse", () => {
    for (const status of [3, 4, 5, 6]) expect(qualityForThermalStatus("high", status)).toBe("standard");
  });
});

describe("the shader's constants per level", () => {
  it("gives standard the close-up's original constants", () => {
    expect(shaderDefines("standard")).toEqual({
      MAX_STEPS: 220, STREAK_OCTAVES: 4, STEP_SCALE: "0.0700", MIN_STEP: "0.0150", MAX_STEP: "1.0000", STAR_SIZE: "1.0000",
    });
  });

  it("writes loop counts as integers and every other constant with a decimal point, as GLSL requires", () => {
    for (const level of ["standard", "medium", "high"] as const) {
      const d = shaderDefines(level);
      expect(Number.isInteger(d.MAX_STEPS)).toBe(true);
      expect(Number.isInteger(d.STREAK_OCTAVES)).toBe(true);
      for (const key of ["STEP_SCALE", "MIN_STEP", "MAX_STEP", "STAR_SIZE"]) expect(String(d[key])).toMatch(/^\d+\.\d+$/);
    }
  });
});

describe("the host galaxy's axes in the close-up", () => {
  it("are three perpendicular unit axes", () => {
    for (const seed of [1, 13, 42, 7, 123456]) {
      const e = galaxyFrameFor(seed).elements;   // column-major: longest, middle, pole
      const axes = [0, 1, 2].map((c) => [e[3 * c], e[3 * c + 1], e[3 * c + 2]]);
      const dot = (a: number[], b: number[]) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
      for (let i = 0; i < 3; i++) {
        expect(dot(axes[i], axes[i])).toBeCloseTo(1, 9);
        for (let j = i + 1; j < 3; j++) expect(dot(axes[i], axes[j])).toBeCloseTo(0, 9);
      }
    }
  });

  it("are the same for the same seed and differ between seeds", () => {
    expect(galaxyFrameFor(13).elements).toEqual(galaxyFrameFor(13).elements);
    expect(galaxyFrameFor(13).elements).not.toEqual(galaxyFrameFor(42).elements);
  });
});
