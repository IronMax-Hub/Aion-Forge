import { describe, it, expect } from "vitest";
import { temperatureToColor } from "../simulation/star";
import { STAR_SATURATION_BOOST, starDisplayColour } from "../rendering/starColour";

// Star colours as drawn (legibility pass, 19 Oct 2026).

const spread = ([r, g, b]: [number, number, number]) => Math.max(r, g, b) - Math.min(r, g, b);

describe("a blackbody's colour", () => {
  it("turns blue for hot stars rather than white (the fit's factors are 329.7/255 and 288.1/255)", () => {
    const [r, g, b] = temperatureToColor(30_000);
    expect(b).toBe(1);
    expect(r).toBeLessThan(0.7);
    expect(g).toBeLessThan(r + 0.2);
    expect(g).toBeGreaterThan(r);
  });

  it("runs red to blue with temperature", () => {
    const [r3, , b3] = temperatureToColor(3000);
    expect(r3).toBe(1);
    expect(b3).toBeLessThan(0.6);
    expect(temperatureToColor(10_000)[0]).toBeLessThan(temperatureToColor(5772)[0] + 1e-12);
  });
});

describe("a star's colour as drawn", () => {
  it("keeps the hue and brightest channel, pushing the others away from it", () => {
    for (const T of [2500, 3500, 4500, 5772, 7500, 12_000, 30_000]) {
      const truth = temperatureToColor(T);
      const drawn = starDisplayColour(T);
      expect(Math.max(...drawn)).toBeCloseTo(Math.max(...truth), 12);
      expect(spread(drawn)).toBeGreaterThanOrEqual(spread(truth) - 1e-12);
      // The order of the channels, so the hue, is kept
      const order = (c: number[]) => [0, 1, 2].sort((i, j) => c[j] - c[i]).join("");
      if (spread(truth) > 0.01) expect(order(drawn)).toBe(order(truth));
    }
    expect(STAR_SATURATION_BOOST).toBeGreaterThan(1);
  });

  it("separates the classes: M orange-red, G yellow-white, B blue", () => {
    const [mr, mg, mb] = starDisplayColour(3000);
    expect(mr).toBe(1);
    expect(mg).toBeLessThan(0.75);
    expect(mb).toBeLessThan(0.3);
    const [gr, gg, gb] = starDisplayColour(5772);
    expect(Math.min(gr, gg)).toBeGreaterThan(0.95);
    expect(gb).toBeGreaterThan(0.8);
    const [br, , bb] = starDisplayColour(20_000);
    expect(bb).toBe(1);
    expect(br).toBeLessThan(0.6);
  });
});
