import { describe, it, expect } from "vitest";
import {
  activityAt, generateStarsFor, mainSequenceEndGyr, photosphericXuvShare, saturationTimeGyr, UNIVERSE_AGE_GYR,
  xuvFluence, xuvLuminosityAt,
} from "../simulation/star";
import type { Star } from "../simulation/star";
import { makeConfig } from "../simulation/config";
import { buildGalaxyConfig } from "../simulation/galaxy";

const sun: Star = {
  id: 0, position: [0, 0, 0], mass: 1, age: 4.6, lifespan: 10, temperature: 5772, luminosity: 1,
  classification: "main-sequence", isRare: false, metallicity: 0,
};
const config = makeConfig(100000);
const stars = generateStarsFor(buildGalaxyConfig(100000, config), UNIVERSE_AGE_GYR, config).stars;
const mainSequence = stars.filter((s) => s.classification === "main-sequence");
const leftMainSequence = stars.filter((s) => s.age >= mainSequenceEndGyr(s));

/** Simpson's rule over many intervals, for checking the closed form. */
function numericFluence(star: Star, t0: number, t1: number, n = 20000): number {
  const h = (t1 - t0) / n;
  let sum = xuvLuminosityAt(star, t0) + xuvLuminosityAt(star, t1);
  for (let i = 1; i < n; i++) sum += (i % 2 === 1 ? 4 : 2) * xuvLuminosityAt(star, t0 + i * h);
  return (sum * h) / 3;
}

describe("the star's XUV history", () => {
  it("gives today's Sun its measured XUV", () => {
    expect(xuvLuminosityAt(sun, 4.6)).toBeCloseTo(3.4e-6, 9);
  });

  it("keeps red dwarfs saturated longer, with no jump in temperature", () => {
    expect(saturationTimeGyr(5772)).toBe(0.1);
    expect(saturationTimeGyr(3900)).toBeCloseTo(0.8, 12);
    expect(saturationTimeGyr(2700)).toBe(8);
    expect(saturationTimeGyr(2000)).toBe(8);
    let previous = Infinity;
    for (let t = 2500; t <= 6000; t += 10) {
      const ts = saturationTimeGyr(t);
      expect(ts).toBeLessThanOrEqual(previous);
      // Continuous: ten kelvin never move it by more than the steepest slope allows
      if (previous !== Infinity) expect(previous - ts).toBeLessThan(0.07);
      previous = ts;
    }
  });

  it("is continuous at saturation and falls after it for stars with a convective envelope", () => {
    for (const star of mainSequence.filter((s) => s.temperature <= 6500).slice(0, 300)) {
      const ts = saturationTimeGyr(star.temperature);
      if (ts >= star.age) continue;
      const before = xuvLuminosityAt(star, ts * (1 - 1e-9));
      const after = xuvLuminosityAt(star, ts * (1 + 1e-9));
      expect(Math.abs(after - before) / before).toBeLessThan(1e-6);
      let previous = after;
      for (let t = ts * 1.1; t <= star.age; t += (star.age - ts) / 20) {
        const value = xuvLuminosityAt(star, t);
        expect(value).toBeLessThan(previous);
        previous = value;
      }
    }
  });

  it("fades the activity law out across 6,500–7,500 K without a jump", () => {
    const at = (temperature: number) => xuvLuminosityAt({ ...sun, temperature }, 1);
    let previous = at(6400);
    for (let t = 6410; t <= 7600; t += 10) {
      const value = at(t);
      expect(Math.abs(value - previous) / previous).toBeLessThan(0.05);
      previous = value;
    }
    // Hot stars' XUV is their photosphere's
    expect(photosphericXuvShare(10000)).toBeGreaterThan(1e-4);
    expect(photosphericXuvShare(3000)).toBeLessThan(1e-12);
  });

  it("holds the XUV at its main-sequence-end value afterwards", () => {
    for (const star of leftMainSequence.slice(0, 50)) {
      const end = mainSequenceEndGyr(star);
      expect(xuvLuminosityAt(star, star.age)).toBe(xuvLuminosityAt(star, end));
    }
  });

  it("integrates exactly: intervals add up, and match a numerical integral", () => {
    const sample = [sun, ...mainSequence.slice(0, 20), ...leftMainSequence.slice(0, 10)];
    for (const star of sample) {
      const whole = xuvFluence(star, 0, star.age);
      // Any subdivision sums to the whole (with the luminosity's brightening inside each step)
      for (const steps of [1, 3, 47, 137]) {
        let sum = 0;
        for (let i = 0; i < steps; i++) sum += xuvFluence(star, (star.age * i) / steps, (star.age * (i + 1)) / steps);
        expect(Math.abs(sum - whole) / whole).toBeLessThan(1e-10);
      }
      // And the closed form is the integral of the luminosity, across saturation and the main sequence's end
      const ts = saturationTimeGyr(star.temperature);
      for (const [t0, t1] of [[0, star.age], [ts * 0.5, Math.min(star.age, ts * 3)]]) {
        if (t1 <= t0) continue;
        expect(Math.abs(xuvFluence(star, t0, t1) - numericFluence(star, t0, t1)) / numericFluence(star, t0, t1)).toBeLessThan(1e-4);
      }
    }
  });

  it("gives one activity curve: saturated, then a power law", () => {
    expect(activityAt(1, 0.5)).toBe(1);
    expect(activityAt(1, 1)).toBe(1);
    expect(activityAt(1, 2)).toBeCloseTo(Math.pow(2, -1.23), 12);
  });
});
