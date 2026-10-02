// The presets' committed specs (contracts/planet-spec/examples/<id>.json, written
// by npm run presets). An unchanged preset is forged from its file, so it is the
// same data in every browser.

import type { PlanetSpec } from "./schema";

const files = import.meta.glob("../../../contracts/planet-spec/examples/*.json", { import: "default", eager: true }) as Record<string, unknown>;

/** A preset's committed spec, by its id. */
export function presetSpec(id: string): PlanetSpec {
  const spec = files[`../../../contracts/planet-spec/examples/${id}.json`];
  if (!spec) throw new Error(`no committed spec for the preset "${id}"; run npm run presets`);
  return spec as PlanetSpec;
}
