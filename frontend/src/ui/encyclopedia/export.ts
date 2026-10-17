// Taking an entry out of the app (Galaxy Through Time, EN4): as Markdown that
// carries its citation, and as a discovery saved to the existing collections.
//
// The Markdown holds every piece of text the panel shows, in the panel's
// order, so what is copied is what was read. A saved discovery keeps the
// entry's name and summary; it is a bookmark, not a copy of the entry.

import type { CollectionCategory, DiscoveryItem } from "../../simulation/persistence";
import { formatGyr } from "../format";
import type { Entry, SubjectRef } from "./entry";
import { subjectKey, subjectLabel } from "./subjects";

/** An entry as Markdown, ending with how to cite it. */
export function entryMarkdown(entry: Entry): string {
  const lines: string[] = [`# ${entry.title}`, "", `**${entry.designation}** · ${entry.citation}`, ""];
  if (entry.lede.length > 0) lines.push(entry.lede.map((s) => s.text).join(" "), "");
  const list = (heading: string, items: string[]) => {
    if (items.length > 0) lines.push(`## ${heading}`, "", ...items.map((item) => `- ${item}`), "");
  };
  list("Facts", entry.facts.map((f) => `${f.label}: ${f.value}`));
  list("Chronicle", entry.chronicle.map((c) => `${formatGyr(c.agoGyr)} ago — ${c.sentence.text}`));
  list("Notable", entry.notable.map((s) => s.text));
  list("See also", entry.seeAlso.map(subjectLabel));
  list("What the record cannot show", entry.limits.map((s) => s.text));
  lines.push(`Cite as: ${entry.citation}`);
  return lines.join("\n");
}

/** The existing collection each kind of entry is saved to; the galaxy has none. */
const CATEGORY: Record<SubjectRef["kind"], CollectionCategory | null> = {
  galaxy: null,
  star: "favorite-stars",
  planet: "remarkable-worlds",
  biosphere: "remarkable-worlds",
  civilization: "extraordinary-civilizations",
};

/** The discovery an entry is saved as, or null for an entry no collection takes. */
export function entryDiscovery(entry: Entry, universeSeed: number, savedAt: number): DiscoveryItem | null {
  const category = CATEGORY[entry.subject.kind];
  if (!category) return null;
  const ref = entry.subject;
  return {
    id: `entry-${universeSeed}-${subjectKey(ref)}`,
    category,
    universeSeed,
    // The timeline's subject ids: stars by id, planets (and their life) by planet key
    subjectId: ref.kind === "star" ? `star-${ref.starId}` : ref.kind === "galaxy" ? `galaxy-${universeSeed}` : `planet-${ref.starId}-${ref.planetIndex}`,
    label: `${subjectLabel(ref)} · ${entry.title}`,
    description: entry.lede.map((s) => s.text).join(" "),
    savedAt,
  };
}
