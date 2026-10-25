// How finely the black hole close-up is traced (Documents/Black-Hole-Phone-Quality.md).
//
// Why it exists: the close-up was tuned for an old desktop GPU (a GeForce G210),
// and the phone's GPU is many times faster. The same light paths can be traced
// more finely where the hardware allows. Every level shows the same black hole
// with the same physics; a finer level only sharpens the photon ring, the stars
// and the gas's streaks.
//
// The build picks its level (VITE_BLACK_HOLE_QUALITY: "medium" in the phone build,
// standard elsewhere). A hot flow is traced one level lower (qualityForAccretion).
// On the phone, Android's heat status can lower it for a while
// (qualityForThermalStatus), so the phone never runs hot to show it.

import type { AccretionMode } from "../../simulation/blackHole";

export type BlackHoleQualityLevel = "standard" | "medium" | "high";

export interface BlackHoleQuality {
  /** The traced buffer's size as a share of the screen's, in each direction. */
  resolutionScale: number;
  /** Most steps a ray may take inside the trace radius. */
  maxSteps: number;
  /** Step length per r(r − 0.9), in horizon radii: smaller is finer where paths bend most. */
  stepScale: number;
  /** Shortest and longest step, in horizon radii. */
  minStep: number;
  maxStep: number;
  /** Octaves of noise in the gas's streaks. */
  streakOctaves: number;
  /** The sky's stars' width, as a share of the standard width (which covers a half-resolution pixel).
   *  Kept above one traced pixel: finer, and lensed arcs break into dashes. */
  starSize: number;
  /** Most traced frames per second while the camera moves and while it is still; 0 is no limit. */
  movingFps: number;
  stillFps: number;
}

export const BLACK_HOLE_QUALITY: Record<BlackHoleQualityLevel, BlackHoleQuality> = {
  // As first built for the desktop: half resolution, traced every frame
  standard: { resolutionScale: 0.5,  maxSteps: 220, stepScale: 0.07,  minStep: 0.015, maxStep: 1.0, streakOctaves: 4, starSize: 1.0, movingFps: 0,  stillFps: 0 },
  medium:   { resolutionScale: 0.75, maxSteps: 300, stepScale: 0.055, minStep: 0.011, maxStep: 0.8, streakOctaves: 5, starSize: 0.9, movingFps: 60, stillFps: 30 },
  high:     { resolutionScale: 1.0,  maxSteps: 400, stepScale: 0.04,  minStep: 0.008, maxStep: 0.6, streakOctaves: 6, starSize: 0.75, movingFps: 60, stillFps: 30 },
};

export const QUALITY_LEVELS: BlackHoleQualityLevel[] = ["standard", "medium", "high"];

/** The level this build asks for: an unknown or missing value is standard. */
export function configuredQualityLevel(value: string | undefined): BlackHoleQualityLevel {
  return QUALITY_LEVELS.includes(value as BlackHoleQualityLevel) ? value as BlackHoleQualityLevel : "standard";
}

/** One level lower, or standard. */
function levelBelow(level: BlackHoleQualityLevel): BlackHoleQualityLevel {
  return QUALITY_LEVELS[Math.max(0, QUALITY_LEVELS.indexOf(level) - 1)];
}

/**
 * The level for this black hole's gas: a hot flow one level lower. It costs about 2.5 times a
 * thin disc at the same level, since every ray crosses its whole cloud while most stop at the
 * opaque disc (measured on the owner's phone: Medium fell to 12–23 fps on it, 27–30 on a disc).
 */
export function qualityForAccretion(level: BlackHoleQualityLevel, accretionMode: AccretionMode): BlackHoleQualityLevel {
  return accretionMode === "hot-flow" ? levelBelow(level) : level;
}

/** Android's thermal status (PowerManager.THERMAL_STATUS_*): 0 none, 1 light, 2 moderate, 3 severe, 4 critical, 5 emergency, 6 shutdown. */
export const THERMAL_STATUS_NAMES = ["none", "light", "moderate", "severe", "critical", "emergency", "shutdown"];
const THERMAL_MODERATE = 2;
const THERMAL_SEVERE = 3;

/** The level to trace at: the build's, one lower once the phone is moderately hot, standard once it is severely hot. */
export function qualityForThermalStatus(configured: BlackHoleQualityLevel, thermalStatus: number): BlackHoleQualityLevel {
  if (thermalStatus >= THERMAL_SEVERE) return "standard";
  if (thermalStatus >= THERMAL_MODERATE) return levelBelow(configured);
  return configured;
}
