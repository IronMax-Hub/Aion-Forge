// The four kinds of saved data: request validation (mirroring the frontend's
// types) and conversion between API objects and table rows. Pure functions only.

import { z } from "zod";

const seed      = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const count     = z.number().int().nonnegative();
const factor    = z.number().finite().positive();
const epochMs   = z.number().int().nonnegative();
const shortText = (max: number) => z.string().max(max);
const longText  = z.string().max(20_000);
// Which simulation rules produced a record's numbers. Records made before rules
// versions existed (legacy browser data, version-1 files) were made by rules 1.
const rulesVersion = z.number().int().min(1).max(65_535);

// ── Universes ────────────────────────────────────────────────────────────────

export const universeConfigSchema = z.object({
  seed,
  gravityStrength:          factor,
  expansionRate:            factor,
  stellarIgnitionThreshold: factor,
  entropyRate:              factor,
  emergenceSensitivity:     factor,
  intelligenceModifier:     factor,
});

export const universeSchema = z.object({
  snapshotId:         z.string().regex(/^AF-U-[0-9A-F]{4}-[0-9A-F]{4}$/),
  seed,
  config:             universeConfigSchema,
  name:               shortText(200).min(1),
  createdAt:          epochMs,
  galaxyType:         z.enum(["spiral", "elliptical", "irregular"]),
  summary:            longText,
  starCount:          count,
  lifeBearingPlanets: count,
  civilizationCount:  count,
  legendaryEvents:    count,
  totalPlanets:       count,
  notes:              longText,
  isFavorite:         z.boolean(),
  rulesVersion:       rulesVersion.default(1),
});
export type Universe = z.infer<typeof universeSchema>;

/** Fields the Library lets a viewer edit after saving. Counts are not among them. */
export const universePatchSchema = z.object({
  name:       shortText(200).min(1).optional(),
  notes:      longText.optional(),
  isFavorite: z.boolean().optional(),
}).strict();
export type UniversePatch = z.infer<typeof universePatchSchema>;

/**
 * A recount: the universe regenerated under newer rules. Replaces every number
 * the rules produce, the summary that states them, and the rules version.
 */
export const recountSchema = z.object({
  summary:            longText,
  starCount:          count,
  lifeBearingPlanets: count,
  civilizationCount:  count,
  legendaryEvents:    count,
  totalPlanets:       count,
  rulesVersion,
}).strict();
export type Recount = z.infer<typeof recountSchema>;

export function recountToColumns(r: Recount) {
  return {
    summary: r.summary, star_count: r.starCount, life_bearing_planets: r.lifeBearingPlanets,
    civilization_count: r.civilizationCount, legendary_events: r.legendaryEvents,
    total_planets: r.totalPlanets, rules_version: r.rulesVersion,
  };
}

export interface UniverseRow {
  snapshot_id: string; seed: number; name: string; galaxy_type: string;
  config_seed: number; gravity_strength: number; expansion_rate: number;
  stellar_ignition_threshold: number; entropy_rate: number;
  emergence_sensitivity: number; intelligence_modifier: number;
  summary: string; star_count: number; life_bearing_planets: number;
  civilization_count: number; legendary_events: number; total_planets: number;
  notes: string; is_favorite: number | boolean; rules_version: number; created_at: Date;
}

export function universeToRow(u: Universe): Omit<UniverseRow, "is_favorite"> & { is_favorite: boolean } {
  return {
    snapshot_id: u.snapshotId, seed: u.seed, name: u.name, galaxy_type: u.galaxyType,
    config_seed: u.config.seed,
    gravity_strength:           u.config.gravityStrength,
    expansion_rate:             u.config.expansionRate,
    stellar_ignition_threshold: u.config.stellarIgnitionThreshold,
    entropy_rate:               u.config.entropyRate,
    emergence_sensitivity:      u.config.emergenceSensitivity,
    intelligence_modifier:      u.config.intelligenceModifier,
    summary: u.summary, star_count: u.starCount, life_bearing_planets: u.lifeBearingPlanets,
    civilization_count: u.civilizationCount, legendary_events: u.legendaryEvents,
    total_planets: u.totalPlanets, notes: u.notes, is_favorite: u.isFavorite,
    rules_version: u.rulesVersion, created_at: new Date(u.createdAt),
  };
}

export function rowToUniverse(r: UniverseRow): Universe {
  return {
    snapshotId: r.snapshot_id, seed: Number(r.seed),
    config: {
      seed:                     Number(r.config_seed),
      gravityStrength:          r.gravity_strength,
      expansionRate:            r.expansion_rate,
      stellarIgnitionThreshold: r.stellar_ignition_threshold,
      entropyRate:              r.entropy_rate,
      emergenceSensitivity:     r.emergence_sensitivity,
      intelligenceModifier:     r.intelligence_modifier,
    },
    name: r.name, createdAt: r.created_at.getTime(),
    galaxyType: r.galaxy_type as Universe["galaxyType"], summary: r.summary,
    starCount: r.star_count, lifeBearingPlanets: r.life_bearing_planets,
    civilizationCount: r.civilization_count, legendaryEvents: r.legendary_events,
    totalPlanets: r.total_planets, notes: r.notes, isFavorite: Boolean(r.is_favorite),
    rulesVersion: r.rules_version,
  };
}

// ── Discoveries ──────────────────────────────────────────────────────────────

export const discoverySchema = z.object({
  id:           shortText(100).min(1),
  category:     z.enum(["favorite-stars", "remarkable-worlds", "extraordinary-civilizations", "historic-events"]),
  universeSeed: seed,
  subjectId:    shortText(100),
  label:        shortText(200),
  description:  longText,
  savedAt:      epochMs,
});
export type Discovery = z.infer<typeof discoverySchema>;

export interface DiscoveryRow {
  id: string; category: string; universe_seed: number; subject_id: string;
  label: string; description: string; saved_at: Date;
}

export function discoveryToRow(d: Discovery): DiscoveryRow {
  return {
    id: d.id, category: d.category, universe_seed: d.universeSeed, subject_id: d.subjectId,
    label: d.label, description: d.description, saved_at: new Date(d.savedAt),
  };
}

export function rowToDiscovery(r: DiscoveryRow): Discovery {
  return {
    id: r.id, category: r.category as Discovery["category"], universeSeed: Number(r.universe_seed),
    subjectId: r.subject_id, label: r.label, description: r.description, savedAt: r.saved_at.getTime(),
  };
}

// ── Experiments ──────────────────────────────────────────────────────────────

export const experimentSchema = z.object({
  id:                shortText(40).min(1),
  timestamp:         epochMs,
  baselineSeed:      seed,
  experimentSeed:    seed,
  modifiedConstants: z.array(shortText(100)).max(20),
  comparisonSummary: longText,
  surprises:         z.array(shortText(2000)).max(100),
  note:              longText,
  rulesVersion:      rulesVersion.default(1),
});
export type Experiment = z.infer<typeof experimentSchema>;

export interface ExperimentRow {
  id: string; recorded_at: Date; baseline_seed: number; experiment_seed: number;
  modified_constants: string[] | string; comparison_summary: string;
  surprises: string[] | string; note: string; rules_version: number;
}

export function experimentToRow(e: Experiment) {
  return {
    id: e.id, recorded_at: new Date(e.timestamp), baseline_seed: e.baselineSeed,
    experiment_seed: e.experimentSeed, modified_constants: JSON.stringify(e.modifiedConstants),
    comparison_summary: e.comparisonSummary, surprises: JSON.stringify(e.surprises), note: e.note,
    rules_version: e.rulesVersion,
  };
}

/** JSON columns arrive parsed from mysql2, but tolerate a raw string too. */
function jsonArray(value: string[] | string): string[] {
  return typeof value === "string" ? JSON.parse(value) : value;
}

export function rowToExperiment(r: ExperimentRow): Experiment {
  return {
    id: r.id, timestamp: r.recorded_at.getTime(), baselineSeed: Number(r.baseline_seed),
    experimentSeed: Number(r.experiment_seed), modifiedConstants: jsonArray(r.modified_constants),
    comparisonSummary: r.comparison_summary, surprises: jsonArray(r.surprises), note: r.note,
    rulesVersion: r.rules_version,
  };
}

// ── Star bookmarks ───────────────────────────────────────────────────────────

export const bookmarkSchema = z.object({
  starId:         z.number().int().nonnegative(),
  galaxySeed:     seed,
  classification: z.enum(["protostar", "main-sequence", "red-giant", "white-dwarf", "neutron-star", "black-hole"]),
  mass:           z.number().finite().nonnegative(),
  temperature:    z.number().finite().nonnegative(),
  note:           longText,
  savedAt:        epochMs,
});
export type Bookmark = z.infer<typeof bookmarkSchema>;

export interface BookmarkRow {
  galaxy_seed: number; star_id: number; classification: string;
  mass: number; temperature: number; note: string; saved_at: Date;
}

export function bookmarkToRow(b: Bookmark): BookmarkRow {
  return {
    galaxy_seed: b.galaxySeed, star_id: b.starId, classification: b.classification,
    mass: b.mass, temperature: b.temperature, note: b.note, saved_at: new Date(b.savedAt),
  };
}

export function rowToBookmark(r: BookmarkRow): Bookmark {
  return {
    starId: r.star_id, galaxySeed: Number(r.galaxy_seed),
    classification: r.classification as Bookmark["classification"],
    mass: r.mass, temperature: r.temperature, note: r.note, savedAt: r.saved_at.getTime(),
  };
}

// ── One-time import of data saved in the browser before the database existed ─

export const importSchema = z.object({
  universes:   z.array(universeSchema).max(1000).default([]),
  discoveries: z.array(discoverySchema).max(1000).default([]),
  experiments: z.array(experimentSchema).max(1000).default([]),
  bookmarks:   z.array(bookmarkSchema).max(10_000).default([]),
});
export type ImportPayload = z.infer<typeof importSchema>;
