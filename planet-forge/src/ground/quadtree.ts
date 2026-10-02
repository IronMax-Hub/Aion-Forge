// Which patches to draw, and which to build next, for a camera.
//
// A patch splits into its four children when the camera is closer than
// `splitFactor` times its edge, down to the deepest level. Until all four
// children are built, the patch stays on screen, so the ground never has
// holes. Patches beyond the horizon are skipped. Patches outside the view are
// left to Three.js, which culls each mesh by its bounding sphere.
//
// Pure: camera and readiness in, lists out, so it can be tested without a browser.

import type { Vec3 } from "../forge/icosphere";
import type { PatchKey } from "./cubeSphere";
import { children, keyText, patchCentre, patchEdgeM, roots } from "./cubeSphere";

export interface Selection {
  /** Patches to draw. */
  draw: PatchKey[];
  /** Patches to build, nearest first. */
  build: PatchKey[];
}

export interface SelectionInput {
  /** The camera, m from the planet's centre, in the body frame. */
  camera: Vec3;
  radiusM: number;
  /** The highest and lowest ground on the planet, m from sea level: bounds for the horizon test. */
  highestM: number;
  lowestM: number;
  splitFactor: number;
  deepestLevel: number;
  isBuilt: (key: string) => boolean;
}

function length([x, y, z]: Vec3): number {
  return Math.sqrt(x * x + y * y + z * z);
}

/** A patch's half-width as an angle, rad (its diagonal, generously). */
function halfAngle(level: number): number {
  return ((Math.PI / 4) * Math.SQRT2) / 2 ** level;
}

/**
 * Whether any of a patch can be above the horizon: the camera sees over the
 * sphere of the lowest ground to points as high as the highest ground. Every
 * angle is from the planet's centre.
 */
export function aboveHorizon(input: SelectionInput, key: PatchKey): boolean {
  const { camera, radiusM, highestM, lowestM } = input;
  const distance = length(camera);
  const inner = Math.max(1, radiusM + lowestM);
  const outer = radiusM + highestM;
  if (distance <= inner) return true;
  const toCamera = Math.acos(Math.min(1, inner / distance));
  const toPoint = Math.acos(Math.min(1, inner / outer));
  const centre = patchCentre(key);
  const cosine = (centre[0] * camera[0] + centre[1] * camera[1] + centre[2] * camera[2]) / distance;
  const angle = Math.acos(Math.max(-1, Math.min(1, cosine)));
  return angle <= toCamera + toPoint + halfAngle(key.level);
}

/** The patches to draw for a camera, and the ones to build next. */
export function selectPatches(input: SelectionInput): Selection {
  const draw: PatchKey[] = [];
  const build: { key: PatchKey; distance: number }[] = [];
  const { camera, radiusM } = input;

  const distanceTo = (key: PatchKey) => {
    const c = patchCentre(key);
    const dx = c[0] * radiusM - camera[0], dy = c[1] * radiusM - camera[1], dz = c[2] * radiusM - camera[2];
    return Math.max(0, Math.sqrt(dx * dx + dy * dy + dz * dz) - patchEdgeM(key.level, radiusM) * 0.75);
  };

  const visit = (key: PatchKey) => {
    if (!aboveHorizon(input, key)) return;
    const distance = distanceTo(key);
    if (!input.isBuilt(keyText(key))) {
      build.push({ key, distance });
      return;
    }
    const split = key.level < input.deepestLevel && distance < input.splitFactor * patchEdgeM(key.level, radiusM);
    if (!split) {
      draw.push(key);
      return;
    }
    const kids = children(key).filter((k) => aboveHorizon(input, k));
    const missing = kids.filter((k) => !input.isBuilt(keyText(k)));
    if (missing.length > 0) {
      draw.push(key);
      for (const k of missing) build.push({ key: k, distance: distanceTo(k) });
      return;
    }
    kids.forEach(visit);
  };
  roots().forEach(visit);

  build.sort((a, b) => a.distance - b.distance);
  return { draw, build: build.map((b) => b.key) };
}
