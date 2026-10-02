// The landing site's pin: near the site, the ground agrees with what Aion
// Forge's globe showed there (the spec's landing.observed).
//
// Why it exists: the landing site matches exactly even though Planet Forge's
// fine detail is its own (owner decision): you land on the ground you clicked.
//
// How:
// - Weight: 1 within FULL_M of the site, falling smoothly to 0 at GONE_M
//   (owner decision: 1 km and 10 km).
// - Height: the ground near the site is raised or lowered by one offset, so its
//   shape is kept and the site stands at the observed height, on the side of
//   sea level its kind needs, at least MARGIN_M from it. The observed height
//   comes from Aion Forge's surface map, the same blend of the same cells as
//   cellField.ts, so the offset mostly cancels Planet Forge's own detail. It is
//   worked out for each level of detail asked for, so the site is exact at all.
// - Kind: the ice flag is pulled to 1 for ice seen, 0 otherwise, and the dry
//   flag to 0 (terrain.ts), by the same weight.
// Without an observation there is no pin.

import type { PlanetSpec } from "../spec/schema";
import type { Vec3 } from "../forge/icosphere";
import { cos, sin } from "../forge/detmath";

const FULL_M = 1_000;
const GONE_M = 10_000;
/** The site stands at least this far from sea level, on its kind's side, m. */
const MARGIN_M = 5;
const DEGREE = Math.PI / 180;

export interface LandingPin {
  /** How strongly the site pins a point, 0–1. */
  weight(direction: Vec3): number;
  /** What to add to heights near the site at a level of detail, m. */
  offsetM(layers: number): number;
  /** The ice flag the site pulls to. */
  iceTarget: number;
}

/** The body-frame direction of a latitude and longitude, degrees (contracts/planet-spec, Frame). */
export function directionOf(latitudeDeg: number, longitudeDeg: number): Vec3 {
  const lat = latitudeDeg * DEGREE, lon = longitudeDeg * DEGREE;
  return [cos(lat) * cos(lon), sin(lat), -cos(lat) * sin(lon)];
}

const NO_PIN: LandingPin = { weight: () => 0, offsetM: () => 0, iceTarget: 0 };

export function createLandingPin(
  spec: PlanetSpec, radiusM: number, unpinnedHeightM: (direction: Vec3, layers: number) => number,
): LandingPin {
  const observed = spec.landing?.observed;
  if (!spec.landing || !observed) return NO_PIN;
  const site = directionOf(spec.landing.latitudeDeg, spec.landing.longitudeDeg);

  const seenM = (observed.heightKm - spec.surface.seaLevelKm) * 1000;
  const underSea = observed.kind === "water" || (observed.kind === "ice" && seenM < 0);
  const targetM = underSea ? Math.min(seenM, -MARGIN_M) : Math.max(seenM, MARGIN_M);

  const fullChord = FULL_M / radiusM;
  const goneChord = GONE_M / radiusM;
  const offsets = new Map<number, number>();

  return {
    iceTarget: observed.kind === "ice" ? 1 : 0,
    weight(direction) {
      // Within 10 km the chord and the arc agree to well under a millimetre
      const dx = direction[0] - site[0], dy = direction[1] - site[1], dz = direction[2] - site[2];
      const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (d <= fullChord) return 1;
      if (d >= goneChord) return 0;
      const t = (goneChord - d) / (goneChord - fullChord);
      return t * t * (3 - 2 * t);
    },
    offsetM(layers) {
      let offset = offsets.get(layers);
      if (offset === undefined) {
        offset = targetM - unpinnedHeightM(site, layers);
        offsets.set(layers, offset);
      }
      return offset;
    },
  };
}
