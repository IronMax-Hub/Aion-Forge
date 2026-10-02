// The shared JSON Schema file (contracts/planet-spec/planet-spec.v1.schema.json),
// generated from the Zod schema so the two cannot disagree. `npm run schema`
// writes it; a test fails if the committed file is not what this generates.
//
// The JSON Schema checks structure and sanity limits. The rules across fields
// (unit-vector cells, gas shares adding up to 1) are refinements it cannot
// express; Planet Forge checks them, and the spec's README lists them.

import { z } from "zod";
import { planetSpecSchema } from "./schema";

/** Where the file lives, from planet-forge/. */
export const SCHEMA_FILE = "../contracts/planet-spec/planet-spec.v1.schema.json";

/** The file's text: the Planet Spec as a JSON Schema (draft 2020-12). */
export function planetSpecJsonSchemaText(): string {
  // "input": what a spec may contain, so unknown fields stay allowed, as the versioning rule needs
  const schema = z.toJSONSchema(planetSpecSchema, { io: "input", target: "draft-2020-12" });
  const described = {
    $schema: schema.$schema,
    title: "Planet Spec, version 1",
    description: "One planet, as Planet Forge forges it. Generated from planet-forge/src/spec/schema.ts by `npm run schema`; see contracts/planet-spec/README.md. Also required, but not expressible here: each cell's direction is a unit vector and the gas shares add up to 1, both to within 0.001.",
    ...schema,
  };
  return `${JSON.stringify(described, null, 2)}\n`;
}
