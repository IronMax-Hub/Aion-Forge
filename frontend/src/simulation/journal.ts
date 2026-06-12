import type { Star } from "./star";

export interface JournalEntry {
  starId: number;
  galaxySeed: number;
  classification: string;
  mass: number;
  temperature: number;
  note: string;
  savedAt: number;
}

const KEY = "aion-forge-journal";

export function loadJournal(): JournalEntry[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "[]");
  } catch {
    return [];
  }
}

function saveJournal(entries: JournalEntry[]) {
  localStorage.setItem(KEY, JSON.stringify(entries));
}

export function bookmarkStar(star: Star, galaxySeed: number, note = ""): JournalEntry[] {
  const entries = loadJournal();
  const exists = entries.find(e => e.starId === star.id && e.galaxySeed === galaxySeed);
  if (exists) return entries;
  const entry: JournalEntry = {
    starId: star.id,
    galaxySeed,
    classification: star.classification,
    mass: star.mass,
    temperature: star.temperature,
    note,
    savedAt: Date.now(),
  };
  const updated = [entry, ...entries];
  saveJournal(updated);
  return updated;
}

export function removeBookmark(starId: number, galaxySeed: number): JournalEntry[] {
  const updated = loadJournal().filter(e => !(e.starId === starId && e.galaxySeed === galaxySeed));
  saveJournal(updated);
  return updated;
}

export function isBookmarked(starId: number, galaxySeed: number): boolean {
  return loadJournal().some(e => e.starId === starId && e.galaxySeed === galaxySeed);
}
