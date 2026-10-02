import { describe, it, expect } from "vitest";
import {
  CHART, PLOT_WIDTH, PLOT_HEIGHT, DISPLAY_BIN_SIZE, LABEL_ROWS, GAS_LABEL, xOf, yOf, wavelengthTicks, depthTicks, depthUnit, displayPoints,
  depthRange, bandLabels, labelWidth, formatSigma,
} from "../ui/spectrumChart";
import { BANDS, SPECTRUM_BINS, SPECTRUM_MAX_UM, SPECTRUM_MIN_UM, SPECTRUM_WAVELENGTHS_UM } from "../simulation/spectrum";
import type { Gas } from "../simulation/atmosphereComposition";

// Worlds Up Close B5: the spectrum chart puts every mark where its value says, and labels it truly.

describe("axes", () => {
  it("spans the plot from 0.3 to 20 µm on a log scale", () => {
    expect(xOf(SPECTRUM_MIN_UM)).toBeCloseTo(CHART.left, 9);
    expect(xOf(SPECTRUM_MAX_UM)).toBeCloseTo(CHART.left + PLOT_WIDTH, 9);
    // Equal ratios, equal distances
    expect(xOf(2) - xOf(1)).toBeCloseTo(xOf(10) - xOf(5), 9);
  });

  it("labels each wavelength tick with the value it sits at", () => {
    for (const tick of wavelengthTicks()) {
      expect(Number(tick.label)).toBe(tick.value);
      expect(tick.at).toBeCloseTo(xOf(tick.value), 9);
      expect(tick.at).toBeGreaterThanOrEqual(CHART.left - 1e-9);
      expect(tick.at).toBeLessThanOrEqual(CHART.left + PLOT_WIDTH + 1e-9);
    }
  });

  it("puts higher depths higher, the range's ends at the plot's edges", () => {
    const range: [number, number] = [80, 90];
    expect(yOf(80, range)).toBeCloseTo(CHART.top + PLOT_HEIGHT, 9);
    expect(yOf(90, range)).toBeCloseTo(CHART.top, 9);
    expect(yOf(85, range)).toBeLessThan(yOf(84, range));
  });

  it("labels each depth tick with its value, at a round step inside the range", () => {
    for (const range of [[83.1, 87.4], [9_200, 9_900], [10_480, 11_420], [104_800, 114_200], [0.31, 0.38], [-2, 3]] as [number, number][]) {
      const { ppmPerUnit } = depthUnit(range);
      const ticks = depthTicks(range);
      expect(ticks.length).toBeGreaterThanOrEqual(2);
      expect(ticks.length).toBeLessThanOrEqual(8);
      const step = (ticks[1].value - ticks[0].value) / ppmPerUnit;
      const mantissa = step / 10 ** Math.floor(Math.log10(step) + 1e-9);
      expect([1, 2, 5, 10].some((m) => Math.abs(mantissa - m) < 1e-6)).toBe(true);
      for (const tick of ticks) {
        expect(Number(tick.label) * ppmPerUnit).toBeCloseTo(tick.value, 6);
        expect(tick.label.replace("-", "").length).toBeLessThanOrEqual(6);   // fits the axis
        expect(tick.at).toBeCloseTo(yOf(tick.value, range), 9);
        expect(tick.value).toBeGreaterThanOrEqual(range[0] - 1e-9);
        expect(tick.value).toBeLessThanOrEqual(range[1] + 1e-9);
      }
    }
  });

  it("labels depths in ppm, and in percent from 10,000 ppm", () => {
    expect(depthUnit([80, 90]).label).toBe("ppm");
    expect(depthUnit([9_000, 9_999]).label).toBe("ppm");
    expect(depthUnit([9_900, 10_100]).label).toBe("%");
    const ticks = depthTicks([104_800, 114_200]);
    expect(ticks.map((t) => t.label)).toContain("11.0");
  });
});

describe("display points", () => {
  const n = SPECTRUM_BINS;
  const wavelengths = SPECTRUM_WAVELENGTHS_UM;

  it("combine the bins in runs into 60 inverse-variance weighted means", () => {
    const depth = wavelengths.map((_, k) => 100 + (k % 3));
    const sigma = wavelengths.map((_, k) => (k % 2 === 0 ? 1 : 2));
    const model = wavelengths.map(() => 100);
    const points = displayPoints(wavelengths, depth, sigma, model);
    expect(points.length).toBe(n / DISPLAY_BIN_SIZE);
    // First run by hand
    let w = 0, d = 0;
    for (let k = 0; k < DISPLAY_BIN_SIZE; k++) { w += 1 / sigma[k] ** 2; d += depth[k] / sigma[k] ** 2; }
    expect(points[0].depthPpm).toBeCloseTo(d / w, 12);
    expect(points[0].uncertaintyPpm).toBeCloseTo(1 / Math.sqrt(w), 12);
    expect(points[0].modelPpm).toBeCloseTo(100, 12);
    for (let i = 1; i < points.length; i++) expect(points[i].wavelengthUm).toBeGreaterThan(points[i - 1].wavelengthUm);
  });

  it("shrink the uncertainty by √10 when the run's bins are alike", () => {
    const points = displayPoints(wavelengths, wavelengths.map(() => 50), wavelengths.map(() => 3), wavelengths.map(() => 50));
    for (const p of points) expect(p.uncertaintyPpm).toBeCloseTo(3 / Math.sqrt(DISPLAY_BIN_SIZE), 12);
  });

  it("frame the model with room for the noise", () => {
    const quiet = displayPoints(wavelengths, wavelengths.map(() => 84), wavelengths.map(() => 20), wavelengths.map((_, k) => 84 + (k === 300 ? 2 : 0)));
    const [lo, hi] = depthRange(quiet);
    expect(lo).toBeLessThan(84);
    expect(hi).toBeGreaterThan(84.2);
    expect(hi - lo).toBeGreaterThanOrEqual(2 * 20 / Math.sqrt(DISPLAY_BIN_SIZE) - 1e-9);
    const flat = displayPoints(wavelengths, wavelengths.map(() => 5), wavelengths.map(() => 1e-6), wavelengths.map(() => 5));
    const [a, b] = depthRange(flat);
    expect(b - a).toBeGreaterThanOrEqual(1);
  });
});

describe("band labels", () => {
  it("name only the detected gases' bands, at their centres", () => {
    const labels = bandLabels(["CO2"]);
    expect(labels.length).toBeGreaterThan(0);
    for (const label of labels) {
      expect(label.gas).toBe("CO2");
      expect(label.label).toBe(GAS_LABEL.CO2);
      expect(BANDS.some((b) => b.gas === "CO2" && b.centreUm === label.centreUm)).toBe(true);
      expect(label.x).toBeCloseTo(xOf(label.centreUm), 9);
    }
    expect(bandLabels([])).toEqual([]);
  });

  it("never overlap, however many gases are detected", () => {
    const all = [...new Set(BANDS.map((b) => b.gas))] as Gas[];
    const labels = bandLabels(all);
    expect(labels.length).toBeGreaterThan(5);
    for (let row = 0; row < LABEL_ROWS; row++) {
      const inRow = labels.filter((l) => l.row === row).sort((a, b) => a.x - b.x);
      for (let i = 1; i < inRow.length; i++) {
        const gap = (inRow[i].x - labelWidth(inRow[i].label) / 2) - (inRow[i - 1].x + labelWidth(inRow[i - 1].label) / 2);
        expect(gap).toBeGreaterThan(0);
      }
    }
  });

  it("leave out bands off the grid", () => {
    for (const label of bandLabels(["O3"])) expect(label.centreUm).toBeGreaterThanOrEqual(SPECTRUM_MIN_UM);
  });
});

describe("significance", () => {
  it("is shown to one decimal, capped in print at 100", () => {
    expect(formatSigma(0)).toBe("0.0");
    expect(formatSigma(3.04)).toBe("3.0");
    expect(formatSigma(99.94)).toBe("99.9");
    expect(formatSigma(160.6)).toBe("≥ 100");
  });
});
