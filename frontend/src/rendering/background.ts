// The sky behind the galaxy: fixed foreground stars and per-universe distant galaxies.
//
// Why: seen from outside a galaxy, real space is black, scattered with faint
// foreground stars and tiny, mostly redshifted, distant galaxies (as in a deep-field
// photograph). There is no haze or glow.
//
// Presentation only. This module never reads or feeds the simulation: it imports
// nothing from simulation/ (a lint rule enforces it), uses its own random numbers,
// and its only outside input is the universe's seed number, which chooses which
// distant galaxies appear. The foreground stars are the same in every universe.
//
// How: both layers are points drawn at a fixed pixel size by small shaders, so they
// stay visible at any distance, and they sit on a sphere that follows the camera, so
// the sky behaves as if infinitely far away.

import * as THREE from "three";

/** Distance of the sky sphere from the camera, in scene units (inside the far plane). */
export const SKY_RADIUS = 5000;

const STAR_COUNT = 5000;
const STAR_SEED = 0xF7D3A291;
// Star counts rise roughly threefold per magnitude fainter, so faint stars dominate
const STAR_COUNT_SLOPE = 0.45;     // log10 N per magnitude
const STAR_MAGNITUDE_RANGE = 6;    // brightest to faintest, in magnitudes
// Faint stars are one crisp pixel; only the brightest get a small halo
const STAR_SIZE_PX = { faint: 1, bright: 3 };
const STAR_HALO_BRIGHTNESS = 0.7;
// Faintest shown brightness: fainter stars would vanish into the black on most screens
const STAR_BRIGHTNESS_FLOOR = 0.3;

const GALAXY_COUNT = 260;
const GALAXY_SALT = 0xD15A7A11;
// Small enough to read as distant, large enough to read as fuzzy ovals rather than stars
const GALAXY_SIZE_PX = { min: 5, max: 14 };

// Renderer-only random numbers (Mulberry32), independent of the simulation's streams
function visualRng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6D2B79F5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pointOnSky(rng: () => number, out: Float32Array, i: number): void {
  const theta = rng() * Math.PI * 2;
  const cosPhi = 2 * rng() - 1;
  const sinPhi = Math.sqrt(1 - cosPhi * cosPhi);
  out[i * 3]     = SKY_RADIUS * sinPhi * Math.cos(theta);
  out[i * 3 + 1] = SKY_RADIUS * sinPhi * Math.sin(theta);
  out[i * 3 + 2] = SKY_RADIUS * cosPhi;
}

function pick<T>(rng: () => number, table: readonly (readonly [number, T])[]): T {
  let r = rng();
  for (const [weight, value] of table) {
    if (r < weight) return value;
    r -= weight;
  }
  return table[table.length - 1][1];
}

// ── Foreground stars ──────────────────────────────────────────────────────────

type Rgb = readonly [number, number, number];

// Field-star colours, mostly cool and warm, softened towards white as the eye sees them
const STAR_TINTS: readonly (readonly [number, Rgb])[] = [
  [0.38, [1.00, 0.84, 0.66]],   // K and M
  [0.27, [1.00, 0.94, 0.84]],   // G
  [0.18, [1.00, 0.98, 0.95]],   // F
  [0.13, [0.88, 0.92, 1.00]],   // A
  [0.04, [0.76, 0.84, 1.00]],   // B
];
const STAR_WHITENING = 0.35;

export interface PointLayerData {
  positions: Float32Array;   // xyz per point
  tints: Float32Array;       // rgb per point, brightness included
  sizes: Float32Array;       // CSS pixels; drawn at the nearest odd number of device pixels
}

/** The fixed foreground starfield, identical in every universe. */
export function starfieldData(): PointLayerData {
  const rng = visualRng(STAR_SEED);
  const positions = new Float32Array(STAR_COUNT * 3);
  const tints = new Float32Array(STAR_COUNT * 3);
  const sizes = new Float32Array(STAR_COUNT);
  const growth = Math.pow(10, STAR_COUNT_SLOPE * STAR_MAGNITUDE_RANGE) - 1;

  for (let i = 0; i < STAR_COUNT; i++) {
    pointOnSky(rng, positions, i);
    // Magnitude from the star-count law (0 = brightest), then flux relative to the brightest
    const magnitude = Math.log10(1 + rng() * growth) / STAR_COUNT_SLOPE;
    const flux = Math.pow(10, -0.4 * magnitude);
    // The eye compresses a wide range of fluxes
    const brightness = STAR_BRIGHTNESS_FLOOR + (1 - STAR_BRIGHTNESS_FLOOR) * Math.sqrt(flux);
    const tint = pick(rng, STAR_TINTS);
    for (let c = 0; c < 3; c++) {
      tints[i * 3 + c] = brightness * (tint[c] + (1 - tint[c]) * STAR_WHITENING);
    }
    sizes[i] = brightness > STAR_HALO_BRIGHTNESS ? STAR_SIZE_PX.bright : STAR_SIZE_PX.faint;
  }
  return { positions, tints, sizes };
}

// ── Distant galaxies ──────────────────────────────────────────────────────────

interface GalaxyKind { tint: Rgb; bulge: number; axisMin: number }

// Most are old and redshifted, so yellow-orange; a few nearer spirals look blue-white
const GALAXY_KINDS: readonly (readonly [number, GalaxyKind])[] = [
  [0.55, { tint: [1.00, 0.76, 0.52], bulge: 0.8, axisMin: 0.55 }],   // elliptical
  [0.33, { tint: [1.00, 0.88, 0.72], bulge: 0.4, axisMin: 0.18 }],   // disc, seen at any angle
  [0.12, { tint: [0.74, 0.82, 1.00], bulge: 0.2, axisMin: 0.18 }],   // star-forming spiral
];
const GALAXY_BRIGHTNESS = { min: 0.22, max: 0.6 };

export interface GalaxyLayerData extends PointLayerData {
  angles: Float32Array;      // orientation on the sky, radians
  axisRatios: Float32Array;  // minor / major axis
  bulges: Float32Array;      // 0 = pure disc, 1 = pure central bulge
}

/** The distant galaxies behind one universe, chosen by its seed. */
export function distantGalaxyData(universeSeed: number): GalaxyLayerData {
  const rng = visualRng((universeSeed ^ GALAXY_SALT) >>> 0);
  const positions = new Float32Array(GALAXY_COUNT * 3);
  const tints = new Float32Array(GALAXY_COUNT * 3);
  const sizes = new Float32Array(GALAXY_COUNT);
  const angles = new Float32Array(GALAXY_COUNT);
  const axisRatios = new Float32Array(GALAXY_COUNT);
  const bulges = new Float32Array(GALAXY_COUNT);

  for (let i = 0; i < GALAXY_COUNT; i++) {
    pointOnSky(rng, positions, i);
    const kind = pick(rng, GALAXY_KINDS);
    // Apparent size falls off steeply: most are barely resolved
    const nearness = rng() * rng();
    const brightness = GALAXY_BRIGHTNESS.min + (GALAXY_BRIGHTNESS.max - GALAXY_BRIGHTNESS.min) * nearness;
    for (let c = 0; c < 3; c++) tints[i * 3 + c] = brightness * kind.tint[c];
    sizes[i] = GALAXY_SIZE_PX.min + (GALAXY_SIZE_PX.max - GALAXY_SIZE_PX.min) * nearness;
    angles[i] = rng() * Math.PI;
    axisRatios[i] = kind.axisMin + (1 - kind.axisMin) * rng();
    bulges[i] = kind.bulge;
  }
  return { positions, tints, sizes, angles, axisRatios, bulges };
}

// ── Drawing ───────────────────────────────────────────────────────────────────

// Tiny points only look sharp if they sit exactly on a pixel: centre each one on a
// pixel centre and give it an odd size in device pixels, so a faint star is one full
// pixel instead of a dim smear across several.
const PIXEL_SNAP = /* glsl */`
  uniform float pixelRatio;
  uniform vec2 resolution;   // drawing buffer, device pixels
  attribute vec3 tint;
  attribute float size;
  varying vec3 vTint;
  void placePoint() {
    vTint = tint;
    vec4 clip = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    vec2 pixel = (clip.xy / clip.w * 0.5 + 0.5) * resolution;
    clip.xy = ((floor(pixel) + 0.5) / resolution * 2.0 - 1.0) * clip.w;
    gl_Position = clip;
    gl_PointSize = floor(size * pixelRatio * 0.5) * 2.0 + 1.0;
  }
`;

const STAR_VERT = /* glsl */`
  ${PIXEL_SNAP}
  void main() { placePoint(); }
`;

const STAR_FRAG = /* glsl */`
  varying vec3 vTint;
  void main() {
    vec2 p = gl_PointCoord * 2.0 - 1.0;
    float r2 = dot(p, p);
    if (r2 > 1.0) discard;
    gl_FragColor = vec4(vTint * exp(-r2 * 4.0), 1.0);
  }
`;

const GALAXY_VERT = /* glsl */`
  ${PIXEL_SNAP}
  attribute float angle;
  attribute float axisRatio;
  attribute float bulge;
  varying vec2 vRotation;
  varying float vAxisRatio;
  varying float vBulge;
  void main() {
    placePoint();
    vRotation = vec2(cos(angle), sin(angle));
    vAxisRatio = axisRatio;
    vBulge = bulge;
  }
`;

// A disc (soft, flattened by the axis ratio) plus a concentrated central bulge
const GALAXY_FRAG = /* glsl */`
  varying vec3 vTint;
  varying vec2 vRotation;
  varying float vAxisRatio;
  varying float vBulge;
  void main() {
    vec2 p = gl_PointCoord * 2.0 - 1.0;
    vec2 q = vec2(vRotation.x * p.x - vRotation.y * p.y, vRotation.y * p.x + vRotation.x * p.y);
    q.y /= vAxisRatio;
    float r2 = dot(q, q);
    if (r2 > 1.0) discard;
    float disc = exp(-r2 * 2.0) * (1.0 - r2);
    float core = exp(-r2 * 7.0);
    gl_FragColor = vec4(vTint * mix(disc, core, vBulge), 1.0);
  }
`;

interface SkyUniforms {
  [name: string]: THREE.IUniform;
  pixelRatio: THREE.IUniform<number>;
  resolution: THREE.IUniform<THREE.Vector2>;
}

function pointLayer(data: PointLayerData, extra: Record<string, Float32Array>, vertexShader: string, fragmentShader: string, uniforms: SkyUniforms): THREE.Points {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(data.positions, 3));
  geometry.setAttribute("tint", new THREE.BufferAttribute(data.tints, 3));
  geometry.setAttribute("size", new THREE.BufferAttribute(data.sizes, 1));
  for (const [name, values] of Object.entries(extra)) geometry.setAttribute(name, new THREE.BufferAttribute(values, 1));
  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader, fragmentShader,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const points = new THREE.Points(geometry, material);
  points.frustumCulled = false;   // the layer surrounds the camera
  points.renderOrder = -1;        // drawn before everything, so it is always behind
  return points;
}

function disposeLayer(layer: THREE.Points): void {
  layer.geometry.dispose();
  (layer.material as THREE.Material).dispose();
}

/** The sky: add `group` to the scene, call `follow` every frame, and `setUniverse` per universe. */
export class SkyBackground {
  readonly group = new THREE.Group();
  private galaxies: THREE.Points | null = null;
  private readonly stars: THREE.Points;
  // Shared by both layers, so a resize updates them together
  private readonly uniforms: SkyUniforms;

  constructor(pixelRatio: number, drawingBufferSize: THREE.Vector2) {
    this.uniforms = { pixelRatio: { value: pixelRatio }, resolution: { value: drawingBufferSize.clone() } };
    this.stars = pointLayer(starfieldData(), {}, STAR_VERT, STAR_FRAG, this.uniforms);
    this.group.add(this.stars);
  }

  /** Call when the drawing buffer changes size, so points stay on pixel centres. */
  setDrawingBufferSize(size: THREE.Vector2): void {
    this.uniforms.resolution.value.copy(size);
  }

  /** Show the distant galaxies that belong behind this universe. */
  setUniverse(universeSeed: number): void {
    if (this.galaxies) {
      this.group.remove(this.galaxies);
      disposeLayer(this.galaxies);
    }
    const data = distantGalaxyData(universeSeed);
    this.galaxies = pointLayer(data,
      { angle: data.angles, axisRatio: data.axisRatios, bulge: data.bulges },
      GALAXY_VERT, GALAXY_FRAG, this.uniforms);
    this.group.add(this.galaxies);
  }

  /** Keep the sky centred on the camera, so it never shows parallax or comes nearer. */
  follow(camera: THREE.Camera): void {
    this.group.position.copy(camera.position);
  }

  dispose(): void {
    disposeLayer(this.stars);
    if (this.galaxies) disposeLayer(this.galaxies);
  }
}
