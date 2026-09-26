// Cube-sphere mesh for the globe (Worlds Up Close, phase A5).
//
// A cube whose six faces are each divided into segments × segments quads, with
// every vertex pushed onto the unit sphere. The "spherified cube" mapping keeps
// the quads close to equal in area, unlike a latitude–longitude sphere, which
// crowds its triangles at the poles and wastes them there.

import * as THREE from "three";
import { CUBE_FACES } from "./cubeFaces";

/** A unit sphere made of 6 × segments² quads. Normals point outwards and equal the positions. */
export function cubeSphereGeometry(segments: number): THREE.BufferGeometry {
  const side = segments + 1;
  const positions = new Float32Array(6 * side * side * 3);
  const indices = new Uint32Array(6 * segments * segments * 6);
  let v = 0;
  let t = 0;
  CUBE_FACES.forEach(([normal, u, w], face) => {
    const base = face * side * side;
    for (let j = 0; j < side; j++) {
      for (let i = 0; i < side; i++) {
        const a = (2 * i) / segments - 1;
        const b = (2 * j) / segments - 1;
        const x = normal[0] + a * u[0] + b * w[0];
        const y = normal[1] + a * u[1] + b * w[1];
        const z = normal[2] + a * u[2] + b * w[2];
        // Spherified cube: evens out the quads' sizes across each face
        positions[v++] = x * Math.sqrt(1 - (y * y) / 2 - (z * z) / 2 + (y * y * z * z) / 3);
        positions[v++] = y * Math.sqrt(1 - (z * z) / 2 - (x * x) / 2 + (z * z * x * x) / 3);
        positions[v++] = z * Math.sqrt(1 - (x * x) / 2 - (y * y) / 2 + (x * x * y * y) / 3);
      }
    }
    for (let j = 0; j < segments; j++) {
      for (let i = 0; i < segments; i++) {
        const k = base + j * side + i;
        indices[t++] = k; indices[t++] = k + 1; indices[t++] = k + side + 1;
        indices[t++] = k; indices[t++] = k + side + 1; indices[t++] = k + side;
      }
    }
  });

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("normal", new THREE.BufferAttribute(positions.slice(), 3));
  geometry.setIndex(new THREE.BufferAttribute(indices, 1));
  geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1);
  return geometry;
}
