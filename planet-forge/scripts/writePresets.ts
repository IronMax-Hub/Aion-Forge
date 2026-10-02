// Writes each preset's sketched spec to contracts/planet-spec/examples/<id>.json (src/forge/presets.ts).
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { PRESETS } from "../src/forge/presets";
import { sketchPlanet } from "../src/forge/sketch";
import { specFileText } from "../src/spec/specFile";

for (const preset of PRESETS) {
  const path = fileURLToPath(new URL(`../../contracts/planet-spec/examples/${preset.id}.json`, import.meta.url));
  writeFileSync(path, specFileText(sketchPlanet(preset.inputs, "preset")));
  console.log(`Wrote ${path}`);
}
