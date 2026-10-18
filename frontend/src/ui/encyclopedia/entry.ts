// The encyclopedia's entry model (Galaxy Through Time, EN1).
//
// Every entry, whatever it describes, follows this one structure so the panel,
// copy-out and tests treat all subjects alike. Entries are written from
// simulation data by the entry writers (EN2); this file holds only the shape.

/** What an entry, or a link inside one, is about. */
export type SubjectRef =
  | { kind: "galaxy" }
  | { kind: "star"; starId: number }
  | { kind: "planet" | "biosphere" | "civilization"; starId: number; planetIndex: number; moonIndex?: number };

/** One sentence of an entry, with the data it was written from. */
export interface Sentence {
  text: string;
  /** The fields that filled it, e.g. ["planet.life.startedGyr", "star.age"]. For tests; never shown. */
  sources: string[];
  link?: SubjectRef;
}

export interface Entry {
  subject: SubjectRef;
  /** The on-screen name, e.g. "1300 c" (format.ts starName / planetName). */
  designation: string;
  /** The name as cited outside the app, e.g. "AF-U-0001-86A0 · v10 · 1300 c" (format.ts citation). */
  citation: string;
  /** What the subject is, e.g. "Ocean world". */
  title: string;
  /** The summary paragraph. */
  lede: Sentence[];
  /** Measured values, formatted with units (format.ts). */
  facts: { label: string; value: string }[];
  /** What happened, oldest first. */
  chronicle: { agoGyr: number; sentence: Sentence }[];
  /** What is unusual, each with its measure. */
  notable: Sentence[];
  seeAlso: SubjectRef[];
  /** What the record cannot show. */
  limits: Sentence[];
}
