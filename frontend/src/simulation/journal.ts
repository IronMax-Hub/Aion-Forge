import type { Star } from "./star";

/** A bookmarked star, identified by its universe seed and star ID. */
export interface JournalEntry {
  starId: number;
  galaxySeed: number;
  classification: string;
  mass: number;
  temperature: number;
  note: string;
  savedAt: number;
}

export function makeJournalEntry(star: Star, galaxySeed: number, note = ""): JournalEntry {
  return {
    starId: star.id,
    galaxySeed,
    classification: star.classification,
    mass: star.mass,
    temperature: star.temperature,
    note,
    savedAt: Date.now(),
  };
}
