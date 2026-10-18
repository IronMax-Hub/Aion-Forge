// Names and keys for the encyclopedia's subjects (EN3): how a link is labelled, and how two subjects are told apart.

import type { SubjectRef } from "./entry";
import { moonName, planetName, starName } from "../format";

/** A planet's or moon world's name from a subject (MO6). */
function worldName(ref: { starId: number; planetIndex: number; moonIndex?: number }): string {
  return ref.moonIndex === undefined ? planetName(ref.starId, ref.planetIndex) : moonName(ref.starId, ref.planetIndex, ref.moonIndex);
}

/** A subject's name on a link. */
export function subjectLabel(ref: SubjectRef): string {
  switch (ref.kind) {
    case "galaxy": return "Galaxy";
    case "star": return starName(ref.starId);
    case "planet": return worldName(ref);
    case "biosphere": return `${worldName(ref)} · biosphere`;
    case "civilization": return `${worldName(ref)} · civilization`;
  }
}

/** A subject as a string, for React keys and comparisons. */
export function subjectKey(ref: SubjectRef): string {
  if (ref.kind === "galaxy") return "galaxy";
  if (ref.kind === "star") return `star-${ref.starId}`;
  return `${ref.kind}-${ref.starId}-${ref.planetIndex}${ref.moonIndex === undefined ? "" : `-m${ref.moonIndex}`}`;
}
