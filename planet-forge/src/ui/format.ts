import type { PlanetSpec } from "../spec/schema";
import { CELL_KIND } from "../spec/schema";

/** A figure to a few significant digits, without trailing zeros. */
export function figure(value: number, digits = 4): string {
  if (value === 0) return "0";
  return Number(value.toPrecision(digits)).toLocaleString("en-GB", { maximumFractionDigits: 6 });
}

/** The surface in numbers: its cells by kind, and the range of their heights and temperatures. */
export function surfaceSummary(cells: PlanetSpec["surface"]["cells"]) {
  const count = { land: 0, water: 0, ice: 0 };
  let lowKm = Infinity, highKm = -Infinity, coldK = Infinity, warmK = -Infinity;
  for (const [, , , heightKm, temperatureK, , kind] of cells) {
    count[kind === CELL_KIND.land ? "land" : kind === CELL_KIND.water ? "water" : "ice"]++;
    lowKm = Math.min(lowKm, heightKm);
    highKm = Math.max(highKm, heightKm);
    coldK = Math.min(coldK, temperatureK);
    warmK = Math.max(warmK, temperatureK);
  }
  return { count, lowKm, highKm, coldK, warmK };
}

/** "1 year", "2.5 years". */
export function years(value: number, digits = 4): string {
  const text = figure(value, digits);
  return `${text} ${text === "1" ? "year" : "years"}`;
}
