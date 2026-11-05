// Which star a click on the galaxy means.
//
// Why it exists: a raycast against the star points returns every star within
// a threshold of the click's ray, sorted by distance from the camera. Taking
// the first picked the nearest star in that tube, not the one under the
// cursor: in a crowded disc a foreground star a few pixels off almost always
// won, so the reticle landed beside the star clicked.
//
// How: of the stars the raycast found, take the one at the smallest angle
// from the ray (its distance from the ray over its distance along it), which
// is the one nearest the cursor on screen whatever its depth.
//
// Presentation only: it reads the raycast and never touches the simulation.

import type { Intersection } from "three";

/** The index of the star nearest the cursor on screen among a raycast's hits, or null if there are none. */
export function nearestStarOnScreen(hits: readonly Intersection[]): number | null {
  let best: Intersection | null = null;
  let bestAngle = Infinity;
  for (const hit of hits) {
    if (hit.index === undefined || hit.distanceToRay === undefined) continue;
    const angle = hit.distanceToRay / hit.distance;
    if (angle < bestAngle) {
      bestAngle = angle;
      best = hit;
    }
  }
  return best ? best.index! : null;
}
