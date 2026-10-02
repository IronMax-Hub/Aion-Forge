// Layout for the spectrum chart (Worlds Up Close, phase B5).
//
// Why it exists: the chart (SpectrumPanel.tsx) must put every mark where its
// value says, and its labels must say what the marks are. Keeping the scales,
// ticks, display binning and band labels here, as plain functions, lets tests
// check that without drawing anything.
//
// How:
// - x: log wavelength, 0.3–20 µm, ticks at round values. y: transit depth,
//   linear, with ticks at a 1–2–5 step chosen for the range; in ppm, or in
//   percent from 10,000 ppm (a giant, or a planet of a white dwarf), where
//   ppm would need more digits than the axis has room for.
// - Display bins: the 600 measured bins are combined in runs of ten into 60,
//   each the inverse-variance weighted mean of its run, with the uncertainty
//   that weighting gives (1/√Σw). At the panel's width 600 error bars would
//   merge into a band; 60 can be read one by one. The model is averaged with
//   the same weights, so it passes where the data would without noise.
// - y range: the model's range, padded by the typical display uncertainty, so
//   a quiet planet's noise fills the frame and a loud one's features do;
//   points beyond it are pinned to its edge and drawn hollow.
// - Band labels: only bands of detected gases, so the chart claims what the
//   data support and no more. A label that would overlap another, judged by
//   its estimated width, moves to a second row, or is dropped if both are full.
//
// Presentation only: it reads simulation data and changes nothing.

import type { Gas } from "../simulation/atmosphereComposition";
import { BANDS, SPECTRUM_MAX_UM, SPECTRUM_MIN_UM } from "../simulation/spectrum";

/** The plot area inside the SVG, in its own units. */
export const CHART = { width: 288, height: 196, left: 46, right: 8, top: 34, bottom: 24 } as const;
export const PLOT_WIDTH = CHART.width - CHART.left - CHART.right;
export const PLOT_HEIGHT = CHART.height - CHART.top - CHART.bottom;

export const DISPLAY_BIN_SIZE = 10;
const WAVELENGTH_TICKS_UM = [0.3, 0.5, 1, 2, 3, 5, 10, 20];
const Y_TICK_TARGET = 4;
const MIN_Y_SPAN_PPM = 1;
/** Labels are drawn at the design system's 11px floor; the chart is drawn about 1:1, so this is a character's width. */
const LABEL_CHAR_WIDTH = 6.6;
/** Space kept between two band labels in one row, chart units. */
const LABEL_GAP = 4;
export const LABEL_ROWS = 2;

export const GAS_LABEL: Record<Gas, string> = {
  N2: "N₂", O2: "O₂", O3: "O₃", CO2: "CO₂", H2O: "H₂O", CH4: "CH₄", N2O: "N₂O", NO2: "NO₂",
  CFC11: "CFC-11", CFC12: "CFC-12", H2: "H₂", He: "He", NH3: "NH₃", CO: "CO",
};

export interface Tick {
  value: number;
  /** Position along the axis, chart units. */
  at: number;
  label: string;
}

export interface DisplayPoint {
  wavelengthUm: number;
  depthPpm: number;
  uncertaintyPpm: number;
  modelPpm: number;
}

export interface BandLabel {
  gas: Gas;
  centreUm: number;
  x: number;
  row: number;
  label: string;
}

/** x position of a wavelength, chart units. */
export function xOf(wavelengthUm: number): number {
  const share = Math.log(wavelengthUm / SPECTRUM_MIN_UM) / Math.log(SPECTRUM_MAX_UM / SPECTRUM_MIN_UM);
  return CHART.left + share * PLOT_WIDTH;
}

/** y position of a depth within a range, chart units (higher depth, higher on the chart). */
export function yOf(depthPpm: number, range: [number, number]): number {
  const share = (depthPpm - range[0]) / (range[1] - range[0]);
  return CHART.top + (1 - share) * PLOT_HEIGHT;
}

export function wavelengthTicks(): Tick[] {
  return WAVELENGTH_TICKS_UM.map((value) => ({ value, at: xOf(value), label: String(value) }));
}

/** Depths from here up are labelled in percent. */
const PERCENT_FROM_PPM = 10_000;
const PPM_PER_PERCENT = 10_000;

/** The unit the depth axis is labelled in, for a range. */
export function depthUnit(range: [number, number]): { label: "ppm" | "%"; ppmPerUnit: number } {
  return range[1] >= PERCENT_FROM_PPM ? { label: "%", ppmPerUnit: PPM_PER_PERCENT } : { label: "ppm", ppmPerUnit: 1 };
}

/** A round step (1, 2 or 5 × 10ⁿ) giving about `target` intervals over a span. */
function niceStep(span: number, target: number): number {
  const raw = span / target;
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  const unit = raw / magnitude;
  return (unit < 1.5 ? 1 : unit < 3.5 ? 2 : unit < 7.5 ? 5 : 10) * magnitude;
}

/**
 * Ticks inside a depth range, in the axis unit (depthUnit), labelled with as
 * many decimals as the step needs. `value` is in ppm.
 */
export function depthTicks(range: [number, number]): Tick[] {
  const { ppmPerUnit } = depthUnit(range);
  const lo = range[0] / ppmPerUnit;
  const hi = range[1] / ppmPerUnit;
  const step = niceStep(hi - lo, Y_TICK_TARGET);
  const decimals = Math.max(0, -Math.floor(Math.log10(step) + 1e-9));
  const ticks: Tick[] = [];
  for (let n = Math.ceil(lo / step - 1e-9); n * step <= hi + step * 1e-9; n++) {
    const inUnit = Number((n * step).toFixed(decimals));
    const value = inUnit * ppmPerUnit;
    ticks.push({ value, at: yOf(value, range), label: inUnit.toFixed(decimals) });
  }
  return ticks;
}

/** The measured bins combined in runs into display points (inverse-variance weighted). */
export function displayPoints(
  wavelengthUm: readonly number[], depthPpm: readonly number[], uncertaintyPpm: readonly number[], modelPpm: readonly number[],
): DisplayPoint[] {
  const points: DisplayPoint[] = [];
  for (let start = 0; start < wavelengthUm.length; start += DISPLAY_BIN_SIZE) {
    let weights = 0, depth = 0, model = 0, logWavelength = 0;
    const end = Math.min(start + DISPLAY_BIN_SIZE, wavelengthUm.length);
    for (let k = start; k < end; k++) {
      const w = 1 / (uncertaintyPpm[k] * uncertaintyPpm[k]);
      weights += w;
      depth += w * depthPpm[k];
      model += w * modelPpm[k];
      logWavelength += Math.log(wavelengthUm[k]);
    }
    points.push({
      wavelengthUm: Math.exp(logWavelength / (end - start)),
      depthPpm: depth / weights,
      uncertaintyPpm: 1 / Math.sqrt(weights),
      modelPpm: model / weights,
    });
  }
  return points;
}

/** The depth range shown: the model's, padded by the median display uncertainty. */
export function depthRange(points: readonly DisplayPoint[]): [number, number] {
  const models = points.map((p) => p.modelPpm);
  const lo = Math.min(...models);
  const hi = Math.max(...models);
  const sorted = points.map((p) => p.uncertaintyPpm).sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];
  const pad = Math.max(0.15 * (hi - lo), median, MIN_Y_SPAN_PPM / 2);
  return [lo - pad, hi + pad];
}

/** A label's estimated width, chart units. */
export function labelWidth(label: string): number {
  return label.length * LABEL_CHAR_WIDTH;
}

/** Labels for the bands of the detected gases, staggered so none overlap. */
export function bandLabels(detected: readonly Gas[]): BandLabel[] {
  const bands = BANDS
    .filter((band) => detected.includes(band.gas) && band.centreUm >= SPECTRUM_MIN_UM && band.centreUm <= SPECTRUM_MAX_UM)
    .map((band) => ({ gas: band.gas, centreUm: band.centreUm, x: xOf(band.centreUm), label: GAS_LABEL[band.gas] }))
    .sort((a, b) => a.x - b.x);
  // Where each row's last label ends, chart units
  const rowEnd = Array<number>(LABEL_ROWS).fill(-Infinity);
  const labels: BandLabel[] = [];
  for (const band of bands) {
    const half = labelWidth(band.label) / 2;
    const row = rowEnd.findIndex((end) => band.x - half >= end + LABEL_GAP);
    if (row === -1) continue;
    rowEnd[row] = band.x + half;
    labels.push({ ...band, row });
  }
  return labels;
}

/** A significance for the table: one decimal, and "≥ 100" beyond that. */
export function formatSigma(sigma: number): string {
  return sigma >= 100 ? "≥ 100" : sigma.toFixed(1);
}
