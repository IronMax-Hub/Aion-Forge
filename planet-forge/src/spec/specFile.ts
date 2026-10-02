// A Planet Spec as a committed file (contracts/planet-spec/examples/): indented
// JSON, but one line per cell, so a file of 642 cells stays readable and diffs
// line by line.

import type { PlanetSpec } from "./schema";

const CELLS_PLACEHOLDER = '"@cells@"';

/** The spec's file text. */
export function specFileText(spec: PlanetSpec): string {
  const text = JSON.stringify({ ...spec, surface: { ...spec.surface, cells: "@cells@" } }, null, 2);
  const cells = `[\n${spec.surface.cells.map((c) => `      ${JSON.stringify(c)}`).join(",\n")}\n    ]`;
  return `${text.replace(CELLS_PLACEHOLDER, cells)}\n`;
}
