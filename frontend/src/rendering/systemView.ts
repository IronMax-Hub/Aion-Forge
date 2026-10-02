// What the system view draws besides its planets: the host star as a source of
// light, the hairline orbits, and the starlight the planets are lit by.
//
// Why it exists: the galaxy view draws stars as light (a saturated core inside
// a soft glow) and the planet view lights its globe with its star. The system
// view sits between them and must look like the same universe: no solid grey
// halo, no flat unlit discs, no orbit bands that thicken as the camera closes in.
//
// How:
// - The star: a sphere whose brightness falls toward its edge (limb darkening,
//   as the Sun's does), pushed past white so the tone mapping saturates its
//   centre, inside an additive glow sprite in the star's colour.
// - Orbits: one-pixel line loops, the same width at every zoom.
// - Light: a point light at the star in its colour (no fall-off: planets are drawn
//   enlarged, far from true scale, so a true fall-off would only mislead), and a
//   faint fill so night sides are not pure black.
//
// Assumptions and limits: sizes are not to scale. At true scale every planet,
// and the star itself, would be far smaller than a pixel.
//
// Presentation only: it reads a star's colour and never writes to the simulation.

import * as THREE from "three";

// Limb darkening: brightness at the edge as a share of the centre's (the Sun's is about 0.4 in visible light)
const LIMB_BRIGHTNESS = 0.45;
// The star's centre is drawn this much brighter than white: it saturates, while its darker limb still shows
const STAR_SURFACE_BRIGHTNESS = 1.4;
const STAR_SEGMENTS = 64;
// The glow sprite spans this many star radii, and its texture this many texels
const GLOW_RADII = 9;
const GLOW_TEXTURE_SIZE = 128;
const GLOW_OPACITY = 1;

const ORBIT_SEGMENTS = 256;
const ORBIT_COLOUR = 0x4a525d;
const ORBIT_OPACITY = 0.55;

/** Starlight on the planets, as the planet view's at Earth's flux (PlanetView.ts). */
export const SYSTEM_STARLIGHT_INTENSITY = 2.6;
const NIGHT_FILL_INTENSITY = 0.03;

const STAR_VERTEX = /* glsl */`
  varying vec3 vNormal;
  varying vec3 vView;
  void main() {
    vec4 view = modelViewMatrix * vec4(position, 1.0);
    vNormal = normalize(normalMatrix * normal);
    vView = normalize(-view.xyz);
    gl_Position = projectionMatrix * view;
  }
`;

const STAR_FRAGMENT = /* glsl */`
  uniform vec3 starColor;
  uniform float brightness;
  uniform float limbBrightness;
  varying vec3 vNormal;
  varying vec3 vView;
  void main() {
    float mu = clamp(dot(normalize(vNormal), normalize(vView)), 0.0, 1.0);
    float limb = mix(limbBrightness, 1.0, mu);
    gl_FragColor = vec4(starColor * brightness * limb, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

/** A soft radial glow, white; tinted by the sprite's colour. */
function glowTexture(): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = GLOW_TEXTURE_SIZE;
  const ctx = canvas.getContext("2d")!;
  const image = ctx.createImageData(GLOW_TEXTURE_SIZE, GLOW_TEXTURE_SIZE);
  const half = GLOW_TEXTURE_SIZE / 2;
  for (let y = 0; y < GLOW_TEXTURE_SIZE; y++) {
    for (let x = 0; x < GLOW_TEXTURE_SIZE; x++) {
      // Distance from the centre in star radii (the sprite spans GLOW_RADII of them)
      const r = Math.hypot(x + 0.5 - half, y + 0.5 - half) / half * (GLOW_RADII / 2);
      const fade = Math.max(0, 1 - r / (GLOW_RADII / 2));
      // Light scattered around a bright source falls off roughly as 1/r², softened at the core
      const alpha = Math.min(1, 0.9 / (1 + r * r)) * fade * fade;
      const i = (y * GLOW_TEXTURE_SIZE + x) * 4;
      image.data[i] = image.data[i + 1] = image.data[i + 2] = 255;
      image.data[i + 3] = Math.round(alpha * 255);
    }
  }
  ctx.putImageData(image, 0, 0);
  return new THREE.CanvasTexture(canvas);
}

/** The host star: a limb-darkened sphere of this radius inside its glow. */
export function hostStarObject(color: THREE.Color, radius: number): THREE.Group {
  const group = new THREE.Group();
  const surface = new THREE.Mesh(
    new THREE.SphereGeometry(radius, STAR_SEGMENTS, STAR_SEGMENTS / 2),
    new THREE.ShaderMaterial({
      vertexShader: STAR_VERTEX,
      fragmentShader: STAR_FRAGMENT,
      uniforms: {
        starColor: { value: color.clone().lerp(new THREE.Color(1, 1, 1), 0.35) },
        brightness: { value: STAR_SURFACE_BRIGHTNESS },
        limbBrightness: { value: LIMB_BRIGHTNESS },
      },
    }),
  );
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({
    map: glowTexture(), color, transparent: true, opacity: GLOW_OPACITY,
    blending: THREE.AdditiveBlending, depthWrite: false,
  }));
  glow.scale.setScalar(radius * GLOW_RADII);
  group.add(surface, glow);
  return group;
}

/** A planet's orbit: a one-pixel circle of this radius in the x–z plane. */
export function orbitLine(radius: number): THREE.LineLoop {
  const points = new Float32Array(ORBIT_SEGMENTS * 3);
  for (let i = 0; i < ORBIT_SEGMENTS; i++) {
    const angle = (i / ORBIT_SEGMENTS) * 2 * Math.PI;
    points[i * 3] = radius * Math.cos(angle);
    points[i * 3 + 2] = radius * Math.sin(angle);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(points, 3));
  return new THREE.LineLoop(geometry, new THREE.LineBasicMaterial({
    color: ORBIT_COLOUR, transparent: true, opacity: ORBIT_OPACITY, depthWrite: false,
  }));
}

/** The starlight planets are lit by, from the star at the group's origin, and the night-side fill. */
export function systemLights(color: THREE.Color): THREE.Light[] {
  return [
    new THREE.PointLight(color, SYSTEM_STARLIGHT_INTENSITY, 0, 0),
    new THREE.AmbientLight(0xffffff, NIGHT_FILL_INTENSITY),
  ];
}

/** Frees a system group's GPU resources, textures included. */
export function disposeSystemGroup(group: THREE.Object3D): void {
  group.traverse((object) => {
    const mesh = object as THREE.Mesh;
    mesh.geometry?.dispose();
    const materials = mesh.material ? (Array.isArray(mesh.material) ? mesh.material : [mesh.material]) : [];
    for (const material of materials) {
      (material as THREE.SpriteMaterial).map?.dispose();
      material.dispose();
    }
  });
}
