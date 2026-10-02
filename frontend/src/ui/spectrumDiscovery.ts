// Recording a spectrum discovery (Worlds Up Close, phase B5).
//
// Why it exists: a universe's first strong biosignature and its first
// technosignature are worth keeping. Each can be recorded once per universe,
// through the existing discoveries API; this decides, for the planet on
// screen, whether it can be recorded, has been, or another planet was first.
//
// How: a recordable verdict's discovery id names the universe and the
// verdict, so a universe holds at most one of each, whichever planet it was.
// The saved description lists the detected gases with their significance and
// the transits it took. Presentation only.

import type { Planet } from "../simulation/planet";
import type { DiscoveryItem } from "../simulation/persistence";
import type { Detection, Verdict } from "../simulation/detection";
import { DETECTION_SIGMA, VERDICT_LABEL } from "../simulation/detection";
import { GAS_LABEL, formatSigma } from "./spectrumChart";
import { planetName } from "./format";

/** Verdicts a universe can record once, as a discovery, and the collection each goes to. */
const RECORDABLE: Partial<Record<Verdict, DiscoveryItem["category"]>> = {
  "strong-biosignature": "remarkable-worlds",
  technosignature: "extraordinary-civilizations",
};

export type SpectrumDiscovery =
  | { status: "not-recordable" }
  | { status: "recordable"; item: (savedAt: number) => DiscoveryItem }
  | { status: "recorded-here" }
  | { status: "recorded-elsewhere"; label: string };

/** Whether this planet's verdict can be recorded as its universe's first, given what is saved. */
export function spectrumDiscovery(
  detection: Detection, transits: number, planet: Planet, galaxySeed: number, discoveries: readonly DiscoveryItem[],
): SpectrumDiscovery {
  const category = RECORDABLE[detection.verdict];
  if (!category) return { status: "not-recordable" };
  const id = `spectrum-${galaxySeed}-${detection.verdict}`;
  const recorded = discoveries.find((d) => d.id === id);
  if (recorded) return recorded.subjectId === planet.key ? { status: "recorded-here" } : { status: "recorded-elsewhere", label: recorded.label };
  const evidence = detection.gases
    .filter((g) => g.sigma >= DETECTION_SIGMA)
    .map((g) => `${GAS_LABEL[g.gas]} ${formatSigma(g.sigma)}σ`)
    .join(", ");
  return {
    status: "recordable",
    item: (savedAt) => ({
      id,
      category,
      universeSeed: galaxySeed,
      subjectId: planet.key,
      label: planetName(planet.hostStarId, planet.orbitalIndex),
      description: `${VERDICT_LABEL[detection.verdict]} after ${transits} transits: ${evidence}`,
      savedAt,
    }),
  };
}
