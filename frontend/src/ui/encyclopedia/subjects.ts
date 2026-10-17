// Names and keys for the encyclopedia's subjects (EN3): how a link is labelled, and how two subjects are told apart.

import type { SubjectRef } from "./entry";
import { planetName, starName } from "../format";

/** A subject's name on a link. */
export function subjectLabel(ref: SubjectRef): string {
  switch (ref.kind) {
    case "galaxy": return "Galaxy";
    case "star": return starName(ref.starId);
    case "planet": return planetName(ref.starId, ref.planetIndex);
    case "biosphere": return `${planetName(ref.starId, ref.planetIndex)} · biosphere`;
    case "civilization": return `${planetName(ref.starId, ref.planetIndex)} · civilization`;
  }
}

/** A subject as a string, for React keys and comparisons. */
export function subjectKey(ref: SubjectRef): string {
  return ref.kind === "galaxy" ? "galaxy" : ref.kind === "star" ? `star-${ref.starId}` : `${ref.kind}-${ref.starId}-${ref.planetIndex}`;
}
