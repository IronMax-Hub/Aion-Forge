import { describe, it, expect } from "vitest";
import {
  universeSchema, universeToRow, rowToUniverse, universePatchSchema,
  discoverySchema, discoveryToRow, rowToDiscovery,
  experimentSchema, experimentToRow, rowToExperiment,
  bookmarkSchema, bookmarkToRow, rowToBookmark,
  importSchema,
} from "../src/records.js";
import type { UniverseRow, ExperimentRow } from "../src/records.js";

const universe = {
  snapshotId: "AF-U-0001-86A0",
  seed: 100000,
  config: {
    seed: 0, gravityStrength: 1, expansionRate: 1.25, stellarIgnitionThreshold: 1,
    entropyRate: 0.8, emergenceSensitivity: 1, intelligenceModifier: 1,
  },
  name: "Classic spiral",
  createdAt: 1_790_000_000_123,
  galaxyType: "spiral" as const,
  summary: "A spiral galaxy.",
  starCount: 2000, lifeBearingPlanets: 968, civilizationCount: 100,
  legendaryEvents: 0, totalPlanets: 9000,
  notes: "", isFavorite: true,
};

describe("universes", () => {
  it("round-trips through a table row unchanged", () => {
    const row = universeToRow(universeSchema.parse(universe));
    const fromDb: UniverseRow = { ...row, is_favorite: row.is_favorite ? 1 : 0 };  // MySQL returns BOOLEAN as 0/1
    expect(rowToUniverse(fromDb)).toEqual(universe);
  });

  it("rejects malformed IDs and non-finite parameters", () => {
    expect(() => universeSchema.parse({ ...universe, snapshotId: "AF-U-1; DROP TABLE" })).toThrow();
    expect(() => universeSchema.parse({ ...universe, config: { ...universe.config, entropyRate: Infinity } })).toThrow();
  });

  it("allows only name, notes and favourite to be patched", () => {
    expect(universePatchSchema.parse({ name: "Renamed" })).toEqual({ name: "Renamed" });
    expect(() => universePatchSchema.parse({ seed: 5 })).toThrow();
  });
});

describe("discoveries, experiments, bookmarks", () => {
  it("round-trip discoveries", () => {
    const d = discoverySchema.parse({
      id: "star-100000-6", category: "favorite-stars", universeSeed: 100000,
      subjectId: "star-6", label: "Star 0006", description: "F3 V", savedAt: 1_790_000_000_000,
    });
    expect(rowToDiscovery(discoveryToRow(d))).toEqual(d);
  });

  it("round-trip experiments, with JSON columns returned either parsed or as text", () => {
    const e = experimentSchema.parse({
      id: "EXP-ABC", timestamp: 1_790_000_000_000, baselineSeed: 1, experimentSeed: 1,
      modifiedConstants: ["Gravity"], comparisonSummary: "More stars.", surprises: ["None"], note: "",
    });
    const row = experimentToRow(e);
    const asText: ExperimentRow = row;
    const asParsed: ExperimentRow = { ...row, modified_constants: ["Gravity"], surprises: ["None"] };
    expect(rowToExperiment(asText)).toEqual(e);
    expect(rowToExperiment(asParsed)).toEqual(e);
  });

  it("round-trip bookmarks and reject unknown star classes", () => {
    const b = bookmarkSchema.parse({
      starId: 6, galaxySeed: 100000, classification: "main-sequence",
      mass: 0.51, temperature: 3760, note: "", savedAt: 1_790_000_000_000,
    });
    expect(rowToBookmark(bookmarkToRow(b))).toEqual(b);
    expect(() => bookmarkSchema.parse({ ...b, classification: "quasar" })).toThrow();
  });

  it("accepts a partial import payload", () => {
    expect(importSchema.parse({ universes: [universe] })).toMatchObject({ discoveries: [], experiments: [], bookmarks: [] });
  });
});
