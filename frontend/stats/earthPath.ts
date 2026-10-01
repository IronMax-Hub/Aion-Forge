// The Earth-path measurement (Worlds Up Close C2.10, Revision 1).
//
// Why it exists: Earth's order of evolutionary firsts (oxygen in the air, then
// life on land, then a body over 1 kg, then a mind) should be one outcome
// among several, not the only one. If every world with a mind followed it, a
// cost constant would be favouring it. This writes each mind world's order so
// the harness can count how often Earth's occurs and list the others.
//
// How: the four firsts are dated from the world history (oxidation) and the
// evolution record (land, kilogram, the mind). Firsts in the same 100 Myr step
// cannot be ordered, so they are joined with "+"; a first that never happened
// is listed after "never:". A world matches Earth's path only when all four
// happened in four different steps, in Earth's order.

import type { WorldHistory } from "../src/simulation/worldHistory";

const LABEL = { oxidation: "oxygen", land: "land", kilogram: "1 kg", mind: "mind" } as const;
type Milestone = keyof typeof LABEL;
const EARTH_ORDER: Milestone[] = ["oxidation", "land", "kilogram", "mind"];

export const EARTH_PATH = EARTH_ORDER.map((m) => LABEL[m]).join(" → ");

/** The order of a mind world's firsts, e.g. "oxygen → land → 1 kg + mind"; null for a world without a mind. */
export function firstsOrder(history: WorldHistory): string | null {
  const mind = history.phylogeny?.mind;
  if (!mind) return null;
  const firstOf = (kind: string) => history.life!.firsts.find((f) => f.kind === kind)?.tGyr ?? null;
  const dates: Record<Milestone, number | null> = {
    oxidation: history.events.find((e) => e.kind === "oxidation")?.tGyr ?? null,
    land: firstOf("land"),
    kilogram: firstOf("kilogram"),
    mind: mind.tGyr,
  };
  const happened = EARTH_ORDER.filter((m) => dates[m] !== null);
  const times = [...new Set(happened.map((m) => dates[m]!))].sort((a, b) => a - b);
  const order = times.map((t) => happened.filter((m) => dates[m] === t).map((m) => LABEL[m]).join(" + ")).join(" → ");
  const never = EARTH_ORDER.filter((m) => dates[m] === null).map((m) => LABEL[m]);
  return never.length === 0 ? order : `${order} (never: ${never.join(", ")})`;
}
