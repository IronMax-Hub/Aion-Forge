// A giant's rings in the planet view (Worlds Up Close A7).
//
// Whether a giant has rings, and their size and pattern, come from its VISUAL
// stream (globe.ts). Cold giants have bright icy rings; warm ones, where ice
// would not last, dark dusty ones. Presentation only.

import * as THREE from "three";
import type { RingLook } from "./globe";
import ringVertex from "./shaders/atmosphere.vert.glsl?raw";
import ringFragment from "./shaders/rings.frag.glsl?raw";

// Ring ice fades out between these cloud-top temperatures, K
const ICE_LASTS_K = { below: 150, until: 250 };
const RING_SEGMENTS = 128;

/** How icy a giant's rings are, 0–1, from its temperature. */
export function ringIciness(temperatureK: number): number {
  const x = Math.min(1, Math.max(0, (temperatureK - ICE_LASTS_K.below) / (ICE_LASTS_K.until - ICE_LASTS_K.below)));
  return 1 - x * x * (3 - 2 * x);
}

interface RingLighting {
  toStar: THREE.Vector3;
  starColor: THREE.Color;
  starIntensity: number;
  opacity: number;
}

/** The ring mesh, in the equatorial plane of a globe with this orientation. */
export function ringMesh(look: RingLook, temperatureK: number, globeOrientation: THREE.Quaternion, light: RingLighting): THREE.Mesh<THREE.RingGeometry, THREE.ShaderMaterial> {
  // RingGeometry lies in its x–y plane; turned so its normal is the globe's pole (local +y)
  const orientation = globeOrientation.clone().multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2));
  const mesh = new THREE.Mesh(
    new THREE.RingGeometry(look.inner, look.outer, RING_SEGMENTS, 1),
    new THREE.ShaderMaterial({
      vertexShader: ringVertex,
      fragmentShader: ringFragment,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      uniforms: {
        innerRadius: { value: look.inner },
        outerRadius: { value: look.outer },
        patternOffset: { value: look.patternOffset },
        icy: { value: ringIciness(temperatureK) },
        ringNormal: { value: new THREE.Vector3(0, 1, 0).applyQuaternion(globeOrientation) },
        toStar: { value: light.toStar },
        starColor: { value: light.starColor },
        starIntensity: { value: light.starIntensity },
        opacity: { value: light.opacity },
      },
    }),
  );
  mesh.quaternion.copy(orientation);
  mesh.renderOrder = 1;
  return mesh;
}
