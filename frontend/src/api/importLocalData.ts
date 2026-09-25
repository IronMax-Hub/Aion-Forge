// Before the MySQL backend existed, saved data lived in this browser's localStorage.
// On first run against the database, send that data to the server once. The server
// only inserts records it does not already have, and the browser copy is left in
// place untouched.

import { importData } from "./client";
import type { ImportPayload } from "./client";

const LEGACY_KEYS = {
  universes:   "aion-forge-gallery",
  discoveries: "aion-forge-discoveries",
  experiments: "aion-forge-experiments",
  bookmarks:   "aion-forge-journal",
} as const;

const IMPORTED_FLAG = "aion-forge-imported-to-db";

function readLegacyList(key: string): unknown[] {
  try {
    const value = JSON.parse(localStorage.getItem(key) ?? "[]");
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

/** Import legacy browser data once. Resolves to the number of records sent (0 if nothing to do). */
export async function importLocalDataOnce(): Promise<number> {
  if (localStorage.getItem(IMPORTED_FLAG)) return 0;

  const payload = {
    universes:   readLegacyList(LEGACY_KEYS.universes),
    discoveries: readLegacyList(LEGACY_KEYS.discoveries),
    experiments: readLegacyList(LEGACY_KEYS.experiments),
    bookmarks:   readLegacyList(LEGACY_KEYS.bookmarks),
  } as ImportPayload;
  const total = payload.universes.length + payload.discoveries.length
              + payload.experiments.length + payload.bookmarks.length;

  if (total > 0) await importData(payload);   // throws if the server is unreachable; retried next start
  localStorage.setItem(IMPORTED_FLAG, new Date().toISOString());
  return total;
}
