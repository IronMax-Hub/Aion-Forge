// Client for the local Aion Forge API (backend/), which stores saved data in MySQL.
// Every call either resolves with the server's data or throws a StorageError.

import type { UniverseMeta, DiscoveryItem } from "../simulation/persistence";
import type { ExperimentRecord } from "../simulation/experiment";
import type { JournalEntry } from "../simulation/journal";

export class StorageError extends Error {}

const UNREACHABLE = "cannot reach the Aion Forge API — is the backend running?";

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`/api${path}`, {
      method,
      headers: body === undefined ? undefined : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new StorageError(UNREACHABLE);
  }
  if (!response.ok) {
    const detail = await response.json().catch(() => null) as { error?: string } | null;
    if (detail?.error) throw new StorageError(detail.error);
    // No JSON body: the dev proxy answered because the backend itself is down
    throw new StorageError(response.status >= 500 ? UNREACHABLE : `The API answered ${response.status}`);
  }
  return response.status === 204 ? (undefined as T) : (await response.json() as T);
}

// ── Library ──────────────────────────────────────────────────────────────────

export const fetchUniverses = () => request<UniverseMeta[]>("GET", "/universes");
export const saveUniverse   = (meta: UniverseMeta) =>
  request<UniverseMeta>("PUT", `/universes/${encodeURIComponent(meta.snapshotId)}`, meta);
export const updateUniverse = (snapshotId: string, patch: Partial<Pick<UniverseMeta, "name" | "notes" | "isFavorite">>) =>
  request<UniverseMeta>("PATCH", `/universes/${encodeURIComponent(snapshotId)}`, patch);
/** New counts from regenerating a saved universe under the current rules. */
export type UniverseRecount = Pick<UniverseMeta,
  "summary" | "starCount" | "lifeBearingPlanets" | "civilizationCount" | "legendaryEvents" | "totalPlanets" | "rulesVersion">;
export const recountUniverse = (snapshotId: string, recount: UniverseRecount) =>
  request<UniverseMeta>("PATCH", `/universes/${encodeURIComponent(snapshotId)}/counts`, recount);
export const deleteUniverse = (snapshotId: string) =>
  request<void>("DELETE", `/universes/${encodeURIComponent(snapshotId)}`);

// ── Discoveries ──────────────────────────────────────────────────────────────

export const fetchDiscoveries = () => request<DiscoveryItem[]>("GET", "/discoveries");
export const saveDiscovery    = (item: DiscoveryItem) => request<DiscoveryItem>("POST", "/discoveries", item);
export const deleteDiscovery  = (id: string) => request<void>("DELETE", `/discoveries/${encodeURIComponent(id)}`);

// ── Experiment log ───────────────────────────────────────────────────────────

export const fetchExperiments = () => request<ExperimentRecord[]>("GET", "/experiments");
export const saveExperiment   = (record: ExperimentRecord) => request<ExperimentRecord>("POST", "/experiments", record);

// ── Star bookmarks ───────────────────────────────────────────────────────────

export const fetchBookmarks = () => request<JournalEntry[]>("GET", "/bookmarks");
export const saveBookmark   = (entry: JournalEntry) =>
  request<JournalEntry>("PUT", `/bookmarks/${entry.galaxySeed}/${entry.starId}`, entry);
export const deleteBookmark = (galaxySeed: number, starId: number) =>
  request<void>("DELETE", `/bookmarks/${galaxySeed}/${starId}`);

// ── One-time import of pre-database browser data ─────────────────────────────

export interface ImportPayload {
  universes: UniverseMeta[];
  discoveries: DiscoveryItem[];
  experiments: ExperimentRecord[];
  bookmarks: JournalEntry[];
}

export const importData = (payload: ImportPayload) => request<Record<string, number>>("POST", "/import", payload);
