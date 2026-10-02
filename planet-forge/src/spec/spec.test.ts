import { describe, expect, it } from "vitest";
import { checkSpec, pathText } from "./check";
import { planetSpecJsonSchemaText } from "./jsonSchema";
import type { PlanetSpec } from "./schema";
import { MAX_CELLS, MIN_CELLS } from "./schema";
import { encodeSpec, MAX_SPEC_BYTES, readSpecFromFragment } from "./url";

import example from "../../../contracts/planet-spec/examples/minimal.json";
// The committed file, as text (SCHEMA_FILE)
import schemaFile from "../../../contracts/planet-spec/planet-spec.v1.schema.json?raw";

/** A fresh copy of the minimal example, to change. */
const minimal = (): Record<string, unknown> => structuredClone(example);

/** The minimal example with every optional part filled in. */
function fullSpec(): PlanetSpec {
  const spec = minimal() as unknown as PlanetSpec;
  return {
    ...spec,
    source: "aion-forge",
    origin: { galaxySeed: 89941287, starId: 861, planetIndex: 3, rulesVersion: 10 },
    air: { pressureBar: 1.01, gases: { N2: 0.78, O2: 0.21, H2O: 0.01 }, cloudCover: 0.6 },
    groundCover: { cover: 0.7, colourLinear: [0.05, 0.12, 0.03] },
    landing: {
      latitudeDeg: 12.4, longitudeDeg: -71,
      subsolar: { latitudeDeg: 3, longitudeDeg: -40 },
      observed: { kind: "land", heightKm: 0.4, vegetated: true, colourLinear: [0.06, 0.1, 0.04] },
    },
  };
}

/** The errors of a spec that must fail. */
function errorsOf(input: unknown): string[] {
  const result = checkSpec(input);
  if (result.ok) throw new Error("expected the spec to be rejected");
  return result.errors;
}

/** Compressed bytes as base64url, for hand-made fragments. */
async function packed(text: string): Promise<string> {
  const stream = new Blob([text]).stream().pipeThrough(new CompressionStream("deflate-raw"));
  const bytes = new Uint8Array(await new Response(stream).arrayBuffer());
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

describe("checkSpec", () => {
  it("accepts the minimal example, with no warnings", () => {
    expect(checkSpec(minimal())).toEqual({ ok: true, spec: minimal(), warnings: [] });
  });

  it("accepts a spec with every optional part", () => {
    const result = checkSpec(fullSpec());
    expect(result.ok && result.warnings).toEqual([]);
  });

  it("rejects what is not an object", () => {
    expect(errorsOf([1, 2])).toEqual(["a Planet Spec must be a JSON object"]);
    expect(errorsOf(null)).toEqual(["a Planet Spec must be a JSON object"]);
  });

  it("rejects an unknown or missing version, naming the versions it reads", () => {
    expect(errorsOf({ ...minimal(), specVersion: 2 })).toEqual(["specVersion: 2 is not known; this Planet Forge reads version 1"]);
    const unversioned = minimal();
    delete unversioned.specVersion;
    expect(errorsOf(unversioned)).toEqual(["specVersion: missing; this Planet Forge reads version 1"]);
  });

  it("names the place of a missing field", () => {
    const spec = minimal() as { star: Record<string, unknown> };
    delete spec.star.temperatureK;
    expect(errorsOf(spec)).toEqual([expect.stringMatching(/^star\.temperatureK: /)]);
  });

  it("rejects values outside their sanity limits", () => {
    const spec = fullSpec();
    spec.air.cloudCover = 1.5;
    spec.star.luminositySolar = 0;
    spec.landing!.latitudeDeg = 91;
    spec.seed = 2.5;
    const errors = errorsOf(spec);
    for (const place of ["air.cloudCover", "star.luminositySolar", "landing.latitudeDeg", "seed"]) {
      expect(errors.some((e) => e.startsWith(`${place}: `))).toBe(true);
    }
  });

  it("names the place inside a cell", () => {
    const spec = minimal() as { surface: { cells: unknown[][] } };
    spec.surface.cells[2][3] = "high";
    spec.surface.cells[5][6] = 3;
    const errors = errorsOf(spec);
    expect(errors.some((e) => e.startsWith("surface.cells[2][3]: "))).toBe(true);
    expect(errors.some((e) => e.startsWith("surface.cells[5][6]: "))).toBe(true);
  });

  it("rejects a cell whose direction is not a unit vector, beyond rounding", () => {
    const spec = fullSpec();
    spec.surface.cells[3] = [0.5, 0.5, 0.5, 0, 300, 0, 0];
    expect(errorsOf(spec)).toEqual(["surface.cells[3]: direction is not a unit vector (to within 0.001)"]);
    spec.surface.cells[3] = [0, 1.0009, 0, 0, 300, 0, 0];
    expect(checkSpec(spec).ok).toBe(true);
  });

  it("rejects gas shares that do not add up to 1, and allows no gases at all", () => {
    const spec = fullSpec();
    spec.air.gases = { N2: 0.5, CO2: 0.3 };
    expect(errorsOf(spec)).toEqual(["air.gases: gas shares do not add up to 1 (to within 0.001)"]);
    spec.air.gases = {};
    expect(checkSpec(spec).ok).toBe(true);
  });

  it("rejects a gas it does not know", () => {
    const spec = fullSpec() as unknown as { air: { gases: Record<string, number> } };
    spec.air.gases = { N2: 0.99, Ar: 0.01 };
    expect(errorsOf(spec).some((e) => e.startsWith("air.gases"))).toBe(true);
  });

  it("needs between MIN_CELLS and MAX_CELLS cells", () => {
    const spec = fullSpec();
    spec.surface.cells = spec.surface.cells.slice(0, MIN_CELLS - 1);
    expect(errorsOf(spec)).toEqual([expect.stringMatching(/^surface\.cells: /)]);
    spec.surface.cells = Array.from({ length: MAX_CELLS + 1 }, () => [0, 1, 0, 0, 300, 0, 0]);
    expect(errorsOf(spec)).toEqual([expect.stringMatching(/^surface\.cells: /)]);
  });

  it("ignores fields it does not know, and lists them as warnings", () => {
    const spec = { ...fullSpec(), weather: { storms: 3 }, star: { ...fullSpec().star, colour: "white" } };
    const result = checkSpec(spec);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.warnings).toEqual([
      "star.colour: not a field this Planet Forge knows; ignored",
      "weather: not a field this Planet Forge knows; ignored",
    ]);
    expect(result.spec).toEqual(fullSpec());
  });

  it("writes places as in code", () => {
    expect(pathText(["surface", "cells", 12, 3])).toBe("surface.cells[12][3]");
    expect(pathText(["seed"])).toBe("seed");
    expect(pathText([])).toBe("");
  });
});

describe("a spec in a URL", () => {
  it("survives the round trip unchanged", async () => {
    const spec = fullSpec();
    const fragment = await encodeSpec(spec);
    expect(fragment).toMatch(/^spec=[A-Za-z0-9_-]+$/);
    expect(await readSpecFromFragment(`#${fragment}`)).toEqual({ found: true, ok: true, spec, warnings: [] });
    expect(await readSpecFromFragment(fragment)).toEqual({ found: true, ok: true, spec, warnings: [] });
  });

  it("finds nothing in a fragment without a spec", async () => {
    expect(await readSpecFromFragment("")).toEqual({ found: false });
    expect(await readSpecFromFragment("#view=surface")).toEqual({ found: false });
  });

  it("reads the spec beside other parameters", async () => {
    const fragment = await encodeSpec(fullSpec());
    const read = await readSpecFromFragment(`#view=surface&${fragment}`);
    expect(read.found && read.ok).toBe(true);
  });

  it("says which step failed", async () => {
    const errorOf = async (hash: string) => {
      const read = await readSpecFromFragment(hash);
      if (!read.found || read.ok) throw new Error("expected the fragment to be rejected");
      return read.errors;
    };
    expect(await errorOf("#spec=not*base64")).toEqual([expect.stringContaining("not base64url")]);
    expect(await errorOf("#spec=AAAA")).toEqual([expect.stringContaining("not compressed data")]);
    expect(await errorOf(`#spec=${await packed("{ not json")}`)).toEqual(["the link's spec is not JSON"]);
    expect(await errorOf(`#spec=${await packed("[1]")}`)).toEqual(["a Planet Spec must be a JSON object"]);
    expect(await errorOf(`#spec=${await packed(" ".repeat(MAX_SPEC_BYTES + 1))}`)).toEqual([expect.stringContaining("more than 2 MB")]);
  });

  it("fits comfortably in a URL with Aion Forge's 642 cells", async () => {
    // Directions on a Fibonacci sphere, with smooth, rounded values, as an export would round them
    const spec = fullSpec();
    spec.surface.cells = Array.from({ length: 642 }, (_, i) => {
      const y = 1 - (2 * (i + 0.5)) / 642;
      const r = Math.sqrt(1 - y * y);
      const a = i * Math.PI * (3 - Math.sqrt(5));
      const round = (v: number, d: number) => Number(v.toFixed(d));
      return [round(r * Math.cos(a), 4), round(y, 4), round(r * Math.sin(a), 4),
        round(3 * Math.sin(5 * a), 2), round(288 - 40 * y * y, 1), round(Math.abs(Math.cos(3 * a)), 2), i % 3 === 0 ? 1 : 0];
    }) as PlanetSpec["surface"]["cells"];
    const fragment = await encodeSpec(spec);
    expect(fragment.length).toBeLessThan(20_000);
  });
});

describe("the shared JSON Schema file", () => {
  it("is what the Zod schema generates (run `npm run schema` after changing the spec)", () => {
    expect(schemaFile).toBe(planetSpecJsonSchemaText());
  });
});
