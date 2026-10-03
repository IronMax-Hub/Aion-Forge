// The eye's adaptation (PLAN, PF4; owner decisions): how far the exposure
// rises as the light around the observer falls, from a dim star or the
// evening alike.
//
// - The light: the light falling on level ground under the camera, by its
//   luminance: the star's that gets through the air, the sky's (the light
//   table, scattering.ts) and the night light.
// - The rule: the exposure follows that light to EXPOSURE_POWER, against
//   DAYLIGHT, so lit ground looks as bright as
//   the light to the power 1 + EXPOSURE_POWER: a sixteenth of the light looks
//   half as bright (as Aion Forge's globe lights a dimmer star's planet).
// - The limit: at most MAX_ADAPTATION times daylight's exposure, reached at
//   about the light of a star 3° below an Earth-like horizon; in less light
//   the scene darkens, so twilight deepens into night.
// Presentation only.

import type { Vec3 } from "../forge/icosphere";
import type { Air } from "./air";
import { LIGHT_SIZE, transmittanceToSpace } from "./scattering";

/** Daylight, to which the eye is adapted at the renderer's own exposure: the light (luminance) on the Earth-like world's ground under a star 45° up, in the renderer's units (its star gives 3 overhead before the air). */
export const DAYLIGHT = 2.1;
/** The exposure follows the light to this power (owner decision). */
export const EXPOSURE_POWER = -0.75;
/** The most the exposure rises above daylight's. */
export const MAX_ADAPTATION = 100;

const luminance = (c: number[]) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];

/** The luminance of the light on level ground at sea level with the star at zenith cosine sunMu. */
export function lightOnGround(air: Air, irradiance: Vec3, lightTable: Float32Array, sunMu: number, nightLight: number): number {
  const through = transmittanceToSpace(air, air.radiusM + 2, sunMu);
  const at = Math.round(((Math.max(-1, Math.min(1, sunMu)) + 1) / 2) * (LIGHT_SIZE - 1)) * 4;
  return luminance([0, 1, 2].map((k) => irradiance[k] * through[k] * Math.max(0, sunMu) + lightTable[at + k] + nightLight));
}

/** How far the exposure rises above daylight's for light of this luminance. */
export function adaptation(lightLuminance: number): number {
  return Math.min(MAX_ADAPTATION, Math.pow(lightLuminance / DAYLIGHT, EXPOSURE_POWER));
}
