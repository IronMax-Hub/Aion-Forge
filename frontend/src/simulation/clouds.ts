// Cloud decks (Worlds Up Close, phases A6 and B2).
//
// Why it exists: clouds hide what lies beneath them. In the planet view they
// cover the ground (A6); in a transit spectrum they hide the air below their
// tops, flattening its features (B2). Both read the same rule from here, so the
// globe and the spectrum agree on which worlds are clouded over.
//
// How:
// - Thick air clouds over whatever its moisture, from none at 10 bar to full
//   cover at 90 bar (owner decision in A6), so steam and greenhouse worlds are
//   Venus-like.
// - Water clouds cover a share of a solid planet that follows its water
//   vapour: two-thirds at Earth's surface humidity (~1%, as the globe's warm
//   oceans have), less in colder, drier air.
// - Giants are clouded over wherever water condenses at their 1-bar level
//   (ammonia, which condenses colder still, adds to the same deck); hotter
//   giants are clear.
// - Cloud tops sit at the tropopause, ~0.1 bar: on Earth, Venus, Jupiter,
//   Saturn and Titan alike the air stops convecting near there (Robinson &
//   Catling 2014), so condensation clouds rarely rise above it. On a planet
//   whose surface pressure is below it, the clouds hide nothing.
//
// Assumptions and limits:
// - One deck per planet, opaque at all wavelengths, with a single top.
// - No hazes, and no silicate or salt clouds on very hot giants.
// - Simulation data: it changes nothing in the world history.

import type { Planet } from "./planet";
import type { AtmosphereComposition } from "./atmosphereComposition";
import { GIANT_DEEP_H2O, waterSaturationBar } from "./atmosphereComposition";

/** Overcast share: none below `from` bar, all of the sky from `full`. */
export const OVERCAST_BAR = { from: 10, full: 90 };

/** Share of a solid planet water clouds cover at Earth's humidity: about two-thirds, as on Earth. */
const WATER_CLOUD_COVER = 0.65;
/** Water vapour mixing ratio at Earth's surface: air this humid is fully cloud-capable. */
const EARTH_SURFACE_H2O = 0.01;
/** Cloud tops: the tropopause, bar. */
export const CLOUD_TOP_BAR = 0.1;
/** Giants' reference level, bar: the clouds form if water condenses here. */
const GIANT_CLOUD_LEVEL_BAR = 1;

export interface CloudDeck {
  /** Share of the planet the deck covers, 0–1. */
  cover: number;
  /** Pressure at its top, bar. */
  topBar: number;
}

/** Share of the sky a thick atmosphere clouds over, whatever the moisture: 0 below 10 bar, 1 from 90. */
export function overcastShare(pressureBar: number): number {
  const x = Math.min(1, Math.max(0, (pressureBar - OVERCAST_BAR.from) / (OVERCAST_BAR.full - OVERCAST_BAR.from)));
  return x * x * (3 - 2 * x);
}

/** The planet's cloud deck today, from its air. */
export function cloudDeckOf(planet: Planet, composition: AtmosphereComposition): CloudDeck {
  if (!planet.surface) {
    const condenses = waterSaturationBar(planet.temperature) < GIANT_DEEP_H2O * GIANT_CLOUD_LEVEL_BAR;
    return { cover: condenses ? 1 : 0, topBar: CLOUD_TOP_BAR };
  }
  const humidity = Math.min(1, (composition.mixingRatios.H2O ?? 0) / EARTH_SURFACE_H2O);
  const cover = Math.max(overcastShare(planet.surface.pressureBar), WATER_CLOUD_COVER * humidity);
  return { cover, topBar: CLOUD_TOP_BAR };
}
