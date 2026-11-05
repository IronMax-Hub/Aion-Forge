import { describe, it, expect } from "vitest";
import * as THREE from "three";
import { nearestStarOnScreen } from "../rendering/starPick";

/** Star points at these positions, and a camera at z = 100 looking down −z. */
function scene(positions: [number, number, number][]) {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(positions.flat()), 3));
  const points = new THREE.Points(geo);
  points.updateMatrixWorld();
  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 1000);
  camera.position.set(0, 0, 100);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld();
  return { points, camera };
}

/** The raycast the galaxy view makes for a click at these normalized device coordinates. */
function hitsAt(points: THREE.Points, camera: THREE.Camera, x: number, y: number) {
  const raycaster = new THREE.Raycaster();
  raycaster.params.Points = { threshold: 3 };
  raycaster.setFromCamera(new THREE.Vector2(x, y), camera);
  return raycaster.intersectObject(points);
}

describe("picking a star in the galaxy", () => {
  it("picks the star under the cursor, not a nearer one a little off the ray", () => {
    // Star 0 is exactly under the click; star 1 is 40 units nearer the camera and 2 units to the side
    const { points, camera } = scene([[0, 0, 0], [2, 0, 40]]);
    const hits = hitsAt(points, camera, 0, 0);
    expect(hits.map((h) => h.index)).toEqual([1, 0]);   // the raycast lists the nearer star first
    expect(nearestStarOnScreen(hits)).toBe(0);
  });

  it("compares stars by how far they look from the cursor, not by distance from the ray", () => {
    // Both 1.5 units off the ray, but star 1 is twice as far away, so it looks closer to the cursor
    const { points, camera } = scene([[1.5, 0, 50], [0, 1.5, 0]]);
    expect(nearestStarOnScreen(hitsAt(points, camera, 0, 0))).toBe(1);
  });

  it("picks nothing when no star is near the click", () => {
    const { points, camera } = scene([[0, 0, 0]]);
    expect(nearestStarOnScreen(hitsAt(points, camera, 0.9, 0.9))).toBeNull();
  });
});
