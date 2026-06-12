import type { UniverseConfig } from "./config";

// ── Universe ID (AF-134) ──────────────────────────────────────────────────────
// Deterministic from seed: AF-U-XXXX-XXXX

export function makeUniverseId(seed: number): string {
  const h = seed >>> 0;
  const a = (h >>> 16).toString(16).toUpperCase().padStart(4, "0").slice(-4);
  const b = (h & 0xffff).toString(16).toUpperCase().padStart(4, "0").slice(-4);
  return `AF-U-${a}-${b}`;
}

// ── Saved universe data model (AF-131) ────────────────────────────────────────

export interface UniverseMeta {
  snapshotId: string;         // AF-U-XXXX-XXXX
  seed: number;
  config: UniverseConfig;
  name: string;               // user-editable label
  createdAt: number;          // Date.now()
  galaxyType: string;
  summary: string;            // prose summary
  starCount: number;
  lifeBearingPlanets: number;
  civilizationCount: number;
  legendaryEvents: number;
  notes: string;
  isFavorite: boolean;
}

// ── Discovery collections (AF-143) ────────────────────────────────────────────

export type CollectionCategory =
  | "favorite-stars"
  | "remarkable-worlds"
  | "extraordinary-civilizations"
  | "historic-events";

export const COLLECTION_LABEL: Record<CollectionCategory, string> = {
  "favorite-stars":              "Favorite Stars",
  "remarkable-worlds":           "Remarkable Worlds",
  "extraordinary-civilizations": "Extraordinary Civilizations",
  "historic-events":             "Historic Events",
};

export interface DiscoveryItem {
  id: string;
  category: CollectionCategory;
  universeSeed: number;
  subjectId: string;
  label: string;
  description: string;
  savedAt: number;
}

// ── Serialization (AF-132) ────────────────────────────────────────────────────

export interface SerializedUniverse {
  version: 1;
  meta: UniverseMeta;
}

export function serializeUniverse(meta: UniverseMeta): string {
  const payload: SerializedUniverse = { version: 1, meta };
  return JSON.stringify(payload, null, 2);
}

export function deserializeUniverse(raw: string): UniverseMeta | null {
  try {
    const parsed = JSON.parse(raw) as SerializedUniverse;
    if (parsed.version !== 1 || !parsed.meta?.seed) return null;
    return parsed.meta;
  } catch {
    return null;
  }
}

// ── Snapshot summary generator (AF-142) ───────────────────────────────────────

export function generateUniverseSummary(meta: Omit<UniverseMeta, "summary" | "name" | "notes" | "isFavorite" | "snapshotId" | "createdAt">): string {
  const { lifeBearingPlanets, civilizationCount, legendaryEvents, galaxyType, starCount, totalPlanets } = meta;

  const density = starCount < 1000 ? "sparse" : starCount > 1800 ? "dense" : "mid-sized";
  const galaxyDesc = `A ${density} ${galaxyType} galaxy containing ${starCount.toLocaleString()} stars`;
  const planetDesc = totalPlanets > 0 ? ` and ${totalPlanets.toLocaleString()} worlds` : "";

  if (lifeBearingPlanets === 0) {
    return `${galaxyDesc}${planetDesc}. No chemistry yielded life — the universe aged in complete silence.`;
  }

  const lifeDesc =
    lifeBearingPlanets === 1
      ? "On one improbable world, chemistry became biology"
      : `On ${lifeBearingPlanets} worlds, chemistry became biology`;

  if (civilizationCount === 0) {
    return `${galaxyDesc}${planetDesc}. ${lifeDesc}, but intelligence never emerged to contemplate it.`;
  }

  const civDesc =
    civilizationCount === 1
      ? "a single civilization arose to ask questions of the cosmos"
      : `${civilizationCount} civilizations independently discovered language, fire, and the stars`;

  const legacyDesc =
    legendaryEvents === 0
      ? "Their history unfolded quietly."
      : legendaryEvents <= 3
      ? `${legendaryEvents} legendary moment${legendaryEvents > 1 ? "s" : ""} shaped their story.`
      : `A universe of legendary moments — ${legendaryEvents} events that will not be forgotten.`;

  return `${galaxyDesc}${planetDesc}. ${lifeDesc}, and ${civDesc}. ${legacyDesc}`;
}

// ── localStorage persistence ──────────────────────────────────────────────────

const GALLERY_KEY    = "aion-forge-gallery";
const DISCOVERY_KEY  = "aion-forge-discoveries";

export function saveToGallery(meta: UniverseMeta): void {
  const existing = loadGallery();
  const idx = existing.findIndex((m) => m.snapshotId === meta.snapshotId);
  if (idx >= 0) existing[idx] = meta;
  else existing.unshift(meta);
  localStorage.setItem(GALLERY_KEY, JSON.stringify(existing.slice(0, 50)));
}

export function loadGallery(): UniverseMeta[] {
  try {
    const raw = localStorage.getItem(GALLERY_KEY);
    return raw ? (JSON.parse(raw) as UniverseMeta[]) : [];
  } catch {
    return [];
  }
}

export function removeFromGallery(snapshotId: string): void {
  const existing = loadGallery().filter((m) => m.snapshotId !== snapshotId);
  localStorage.setItem(GALLERY_KEY, JSON.stringify(existing));
}

export function toggleFavorite(snapshotId: string): void {
  const gallery = loadGallery();
  const entry = gallery.find((m) => m.snapshotId === snapshotId);
  if (entry) {
    entry.isFavorite = !entry.isFavorite;
    localStorage.setItem(GALLERY_KEY, JSON.stringify(gallery));
  }
}

// ── Discovery collection persistence ─────────────────────────────────────────

export function saveDiscovery(item: DiscoveryItem): void {
  const existing = loadDiscoveries();
  if (!existing.find((d) => d.id === item.id)) {
    existing.unshift(item);
    localStorage.setItem(DISCOVERY_KEY, JSON.stringify(existing.slice(0, 100)));
  }
}

export function loadDiscoveries(): DiscoveryItem[] {
  try {
    const raw = localStorage.getItem(DISCOVERY_KEY);
    return raw ? (JSON.parse(raw) as DiscoveryItem[]) : [];
  } catch {
    return [];
  }
}

export function removeDiscovery(id: string): void {
  const existing = loadDiscoveries().filter((d) => d.id !== id);
  localStorage.setItem(DISCOVERY_KEY, JSON.stringify(existing));
}

// ── Export / import (AF-137, AF-138) ─────────────────────────────────────────

export function exportUniverse(meta: UniverseMeta): void {
  const json = serializeUniverse(meta);
  const blob = new Blob([json], { type: "application/json" });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href     = url;
  a.download = `${meta.snapshotId}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

export async function importUniverseFromFile(file: File): Promise<UniverseMeta | null> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      resolve(deserializeUniverse(text));
    };
    reader.onerror = () => resolve(null);
    reader.readAsText(file);
  });
}

// ── Featured universes (AF-144) ───────────────────────────────────────────────
// Surfaces exceptional universes from the gallery based on simulation outcomes.

export function getFeaturedUniverses(gallery: UniverseMeta[]): UniverseMeta[] {
  const scored = gallery.map((m) => {
    let score = 0;
    if (m.isFavorite)              score += 10;
    if (m.legendaryEvents > 5)     score += 5;
    if (m.civilizationCount > 2)   score += 4;
    if (m.lifeBearingPlanets === 0) score += 3;  // the silent universe — eerie
    if (m.civilizationCount > 0 && m.lifeBearingPlanets === 1) score += 4; // lone civilization
    return { meta: m, score };
  });
  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)
    .map((s) => s.meta);
}
