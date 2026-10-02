// Checking a Planet Spec: whatever arrives (a link, a preset, a file) is
// checked here before Planet Forge reads it.
//
// The result is either the spec, with warnings for fields this Planet Forge
// does not know (ignored, so a spec with a newer optional field still reads),
// or the errors, each naming its place, e.g. "surface.cells[12][3]: …".

import type { z } from "zod";
import type { PlanetSpec } from "./schema";
import { planetSpecSchema, SPEC_VERSIONS } from "./schema";

export type SpecCheck =
  | { ok: true; spec: PlanetSpec; warnings: string[] }
  | { ok: false; errors: string[] };

/** A place in the spec, written as in code: `surface.cells[12][3]`. */
export function pathText(path: readonly PropertyKey[]): string {
  return path.reduce<string>((text, key) =>
    typeof key === "number" ? `${text}[${key}]` : text ? `${text}.${String(key)}` : String(key), "");
}

function issueText(issue: z.core.$ZodIssue): string {
  const place = pathText(issue.path);
  return place ? `${place}: ${issue.message}` : issue.message;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** The places of fields in `input` that checking dropped from `output`: the fields the schema does not know. */
function unknownFields(input: unknown, output: unknown, path: PropertyKey[] = []): string[] {
  if (Array.isArray(input) && Array.isArray(output)) {
    return input.flatMap((item, i) => unknownFields(item, output[i], [...path, i]));
  }
  if (!isPlainObject(input) || !isPlainObject(output)) return [];
  return Object.keys(input).flatMap((key) =>
    key in output ? unknownFields(input[key], output[key], [...path, key]) : [pathText([...path, key])]);
}

/** Checks a Planet Spec, given as parsed JSON. */
export function checkSpec(input: unknown): SpecCheck {
  if (!isPlainObject(input)) return { ok: false, errors: ["a Planet Spec must be a JSON object"] };
  // The version first: a spec of another version is not checked field by field against this one
  const version = input.specVersion;
  if (!(SPEC_VERSIONS as readonly unknown[]).includes(version)) {
    const known = `this Planet Forge reads version ${SPEC_VERSIONS.join(", ")}`;
    return { ok: false, errors: [version === undefined ? `specVersion: missing; ${known}` : `specVersion: ${JSON.stringify(version)} is not known; ${known}`] };
  }
  const result = planetSpecSchema.safeParse(input);
  if (!result.success) return { ok: false, errors: result.error.issues.map(issueText) };
  const warnings = unknownFields(input, result.data).map((place) => `${place}: not a field this Planet Forge knows; ignored`);
  return { ok: true, spec: result.data, warnings };
}
