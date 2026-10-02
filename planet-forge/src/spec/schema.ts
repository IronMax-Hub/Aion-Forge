// The Planet Spec (contracts/planet-spec/README.md): the description of one
// planet that Planet Forge forges, whether it comes from Aion Forge, a preset
// or your own inputs.
//
// Why it exists: it is the whole interface between Aion Forge and Planet Forge.
// This schema is its single source of truth. The TypeScript type is derived
// from it, and the shared JSON Schema file is generated from it (npm run schema).
//
// What it checks:
// - Structure and types, field by field.
// - Sanity limits only: finite numbers, positive sizes and temperatures, shares
//   within 0–1, angles within range. No "plausible range": an unusual but real
//   planet is never rejected.
// - Rules across fields, which plain JSON Schema cannot express, as refinements:
//   each cell's direction is a unit vector and the gas shares add up to 1, both
//   to within ROUNDING_TOLERANCE.
// Unknown fields are not errors (check.ts lists them as warnings), so a spec
// with a newer optional field still reads.

import { z } from "zod";

/** The spec versions this Planet Forge reads. */
export const SPEC_VERSIONS = [1] as const;
/** Allowance for rounding in written specs: directions' lengths and gas shares' sum. */
export const ROUNDING_TOLERANCE = 1e-3;
/** Fewest cells: an icosahedron's corners. */
export const MIN_CELLS = 12;
/** Most cells: keeps a spec in a URL a sensible size. */
export const MAX_CELLS = 20_000;
const MAX_SEED = 2 ** 32 - 1;

/** The gases a spec may name: those of Aion Forge's atmospheres. */
export const GASES = [
  "N2", "O2", "O3", "CO2", "H2O", "CH4", "N2O", "NO2", "CFC11", "CFC12", "H2", "He", "NH3", "CO",
] as const;

/** Cell kinds, as the cells' last entry. */
export const CELL_KIND = { land: 0, water: 1, ice: 2 } as const;

const positive = () => z.number().positive();
const share = () => z.number().min(0).max(1);
const latitude = () => z.number().min(-90).max(90);
const longitude = () => z.number().min(-180).max(180);
const linearColour = () => z.tuple([z.number().min(0), z.number().min(0), z.number().min(0)]);

/** [x, y, z, heightKm, temperatureK, moisture, kind]: a point of the surface, its direction in the body frame. */
const cellSchema = z.tuple([
  z.number(), z.number(), z.number(),
  z.number(),
  positive(),
  share(),
  z.union([z.literal(CELL_KIND.land), z.literal(CELL_KIND.water), z.literal(CELL_KIND.ice)]),
]).refine(
  ([x, y, zz]) => Math.abs(Math.sqrt(x * x + y * y + zz * zz) - 1) <= ROUNDING_TOLERANCE,
  { message: `direction is not a unit vector (to within ${ROUNDING_TOLERANCE})` },
);

const gasesSchema = z.partialRecord(z.enum(GASES), share()).refine(
  (gases) => {
    const shares = Object.values(gases);
    return shares.length === 0 || Math.abs(shares.reduce((sum, s) => sum + s, 0) - 1) <= ROUNDING_TOLERANCE;
  },
  { message: `gas shares do not add up to 1 (to within ${ROUNDING_TOLERANCE})` },
);

export const planetSpecSchema = z.object({
  specVersion: z.literal(1),
  source: z.enum(["aion-forge", "preset", "custom"]),
  name: z.string().min(1),
  seed: z.number().int().min(0).max(MAX_SEED),
  /** Where a spec from Aion Forge came from; a label only, never read as simulation. */
  origin: z.object({
    galaxySeed: z.number().int(),
    starId: z.number().int().min(0),
    planetIndex: z.number().int().min(0),
    rulesVersion: z.number().int().min(0),
  }).optional(),
  star: z.object({
    temperatureK: positive(),
    luminositySolar: positive(),
    radiusSolar: positive(),
  }),
  orbit: z.object({
    distanceAU: positive(),
    periodYears: positive(),
  }),
  body: z.object({
    radiusEarth: positive(),
    massEarth: positive(),
    gravityG: positive(),
    rotationHours: positive(),
    tidallyLocked: z.boolean(),
    axialTiltDeg: z.number().min(0).max(180),
  }),
  air: z.object({
    pressureBar: z.number().min(0),
    gases: gasesSchema,
    cloudCover: share(),
  }),
  surface: z.object({
    cells: z.array(cellSchema).min(MIN_CELLS).max(MAX_CELLS),
    seaLevelKm: z.number(),
    freezingK: positive(),
    boilingK: positive(),
    steam: z.boolean(),
  }),
  /** The tint of living ground; absent without life. */
  groundCover: z.object({
    cover: share(),
    colourLinear: linearColour(),
  }).optional(),
  /** Where to land and what the orbit globe showed there; absent in presets. */
  landing: z.object({
    latitudeDeg: latitude(),
    longitudeDeg: longitude(),
    subsolar: z.object({ latitudeDeg: latitude(), longitudeDeg: longitude() }),
    observed: z.object({
      kind: z.enum(["land", "water", "ice"]),
      heightKm: z.number(),
      vegetated: z.boolean(),
      colourLinear: linearColour(),
    }).optional(),
  }).optional(),
});

export type PlanetSpec = z.infer<typeof planetSpecSchema>;
export type SpecCell = PlanetSpec["surface"]["cells"][number];
export type Gas = (typeof GASES)[number];
