import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { CSS2DRenderer, CSS2DObject } from "three/examples/jsm/renderers/CSS2DRenderer.js";
import type { GalaxyParticles } from "../simulation/galaxy";
import type { Star, StellarPopulation } from "../simulation/star";
import { temperatureToColor } from "../simulation/star";
import type { Planet, PlanetarySystem, SolidWorld } from "../simulation/planet";
import type { PlanetPhysics } from "../simulation/planetPhysics";
import { PLANET_COLORS } from "../simulation/planet";
import type { Biosphere } from "../simulation/biosphere";
import type { Civilization } from "../simulation/civilization";
import { SkyBackground } from "./background";
import { disposeSystemGroup, hostStarObject, orbitLine, systemLights } from "./systemView";
import { SystemGlobes } from "./systemGlobes";
import { PlanetView, ORBIT_DISTANCE, starlightIntensity } from "./planet/PlanetView";
import { GlobeTextureCache, drawsSurface, giantLookOf } from "./planet/globe";
import { ringMesh } from "./planet/rings";
import type { GlobeSurface } from "./planet/globe";
import type { GlobeBake } from "./planet/globeBake";
import { civilizationLightsOf, vegetationOf } from "./planet/life";
import type { CivilizationLights } from "./planet/life";

// ── Visual seeded PRNG (ENH-506) ──────────────────────────────────────────────
// Used for the nebula accents — purely visual, does not affect
// simulation determinism. Separate from simulation RNG by design.

function mulberry32(seed: number): () => number {
  return function (): number {
    seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = t + Math.imul(t ^ (t >>> 7), 61 | t) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ── Canvas texture helpers (ENH-501, ENH-506, ENH-507) ───────────────────────

function makeStarSprite(): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 32;
  const ctx = canvas.getContext("2d")!;
  const grad = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
  grad.addColorStop(0,    "rgba(255,255,255,1)");
  grad.addColorStop(0.2,  "rgba(255,255,255,0.7)");
  grad.addColorStop(0.55, "rgba(255,255,255,0.15)");
  grad.addColorStop(1,    "rgba(255,255,255,0)");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 32, 32);
  return new THREE.CanvasTexture(canvas);
}

function makeReticleTexture(): THREE.CanvasTexture {
  const size = 64;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  ctx.strokeStyle = "#E0A458";
  ctx.lineWidth = 2;
  ctx.strokeRect(4, 4, size - 8, size - 8);
  return new THREE.CanvasTexture(canvas);
}

function makeNebulaTexture(r: number, g: number, b: number): THREE.CanvasTexture {
  const size = 256;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  const half = size / 2;
  const grad = ctx.createRadialGradient(half, half, 0, half, half, half);
  grad.addColorStop(0,    `rgba(${r},${g},${b},0.38)`);
  grad.addColorStop(0.25, `rgba(${r},${g},${b},0.18)`);
  grad.addColorStop(0.6,  `rgba(${r},${g},${b},0.06)`);
  grad.addColorStop(1,    `rgba(${r},${g},${b},0)`);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  return new THREE.CanvasTexture(canvas);
}

// ── GLSL shaders ──────────────────────────────────────────────────────────────

// ENH-501 / ENH-503: Circular soft-edged dust particles
const DUST_VERT = /* glsl */`
  varying vec3 vColor;
  void main() {
    vColor = color;
    vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = 1.7 * (180.0 / -mvPos.z);
    gl_Position  = projectionMatrix * mvPos;
  }
`;

const DUST_FRAG = /* glsl */`
  varying vec3 vColor;
  void main() {
    float d = length(gl_PointCoord - 0.5);
    if (d > 0.5) discard;
    float alpha = (1.0 - smoothstep(0.08, 0.5, d)) * 0.30;
    gl_FragColor = vec4(vColor, alpha);
  }
`;

// ENH-502 / ENH-504 / ENH-509: Gaussian star renderer (steady light — no twinkle)
const STAR_VERT = /* glsl */`
  attribute float size;
  varying  vec3  vColor;
  void main() {
    vColor = color;
    vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = size * (300.0 / -mvPos.z);
    gl_Position  = projectionMatrix * mvPos;
  }
`;

// Three-layer Gaussian: bright core → inner glow → faint halo
// Core is pushed slightly toward white, as a real point source saturates a detector
const STAR_FRAG = /* glsl */`
  varying vec3 vColor;
  void main() {
    float d     = length(gl_PointCoord - 0.5);
    if (d > 0.5) discard;
    float core  = exp(-d * d * 80.0) * 2.2;
    float inner = exp(-d * d * 22.0) * 0.55;
    float halo  = exp(-d * d *  6.0) * 0.10;
    float alpha = core + inner + halo;
    vec3  col   = vColor + vec3(core * 0.15);
    gl_FragColor = vec4(col, alpha);
  }
`;

// ── Dust colour ──────────────────────────────────────────────────────────────
// The simulation's particle colours are stylised (blue-violet arms, magenta
// irregulars). For display, keep each particle's brightness but tint it the way
// real galaxies look: old, warm light in the core; young, blue-white light in the
// disc. Elliptical galaxies are old throughout, irregulars young throughout.

const DUST_WARM: [number, number, number] = [1.00, 0.86, 0.68];
const DUST_COOL: [number, number, number] = [0.78, 0.86, 1.00];

function realisticDustColors(particles: GalaxyParticles): Float32Array {
  const { positions, colors, config } = particles;
  const out = new Float32Array(colors.length);
  const youngBias = config.type === "elliptical" ? 0.15 : config.type === "irregular" ? 0.85 : 1.0;
  for (let i = 0; i < colors.length; i += 3) {
    const x = positions[i], z = positions[i + 2];
    const dist = Math.sqrt(x * x + z * z) / config.scale;
    const young = config.type === "irregular" ? youngBias : Math.min(1, dist * 1.8) * youngBias;
    const lum = 0.2126 * colors[i] + 0.7152 * colors[i + 1] + 0.0722 * colors[i + 2];
    const k = 0.35 + 0.75 * lum;
    for (let c = 0; c < 3; c++) {
      out[i + c] = (DUST_WARM[c] + (DUST_COOL[c] - DUST_WARM[c]) * young) * k;
    }
  }
  return out;
}

/** Planetary-system view draws orbits at this many scene units per AU. */
export const SYSTEM_UNITS_PER_AU = 2.5;

/** What the system view is given besides the system: callbacks and what it labels and draws each planet with. */
export interface SystemSight {
  /** Called when a planet is double-clicked, to approach it. */
  onPlanetApproach?: ((planet: Planet) => void) | null;
  /** Hover label text per planet id; a planet without one shows no label. */
  planetLabels?: Map<number, string>;
  /** What each planet is drawn from, by planet id: its world, physics, starlight and life (its globe, air and rings). */
  planets?: Map<number, PlanetSight>;
}

/** What the planet view is given about a planet besides the planet itself. */
export interface PlanetSight {
  /** The planet's solid world, when it has one to draw; null for giants. */
  world: SolidWorld | null;
  /** The planet's physics (spin, tilt, locking); null draws a plain sphere. */
  physics: PlanetPhysics | null;
  /** Starlight at the planet, relative to Earth's. */
  starFlux: number;
  /** The planet's life and civilization, as the simulation generates them (A9); absent or null shows none. */
  biosphere?: Biosphere | null;
  civilization?: Civilization | null;
}

export type ViewMode = "galaxy" | "system" | "planet";

/**
 * How large one screen pixel is, in scene units, and which view it applies to:
 * at the orbit target in the galaxy and system views, at the nearest surface in
 * the planet view, whose scene unit is `kmPerUnit` kilometres.
 */
export interface ViewScale {
  mode: ViewMode;
  unitsPerPixel: number;
  kmPerUnit?: number;
}

// Orbit-control limits outside the planet view, and the system view's auto-rotation
const DEFAULT_DISTANCE = { min: 0.01, max: 2000 };
const SYSTEM_AUTO_ROTATE_SPEED = 0.4;
const PLANET_AUTO_ROTATE_SPEED = 0.25;
// The approach glide ends this many planet-marker radii from the marker
const APPROACH_END_DISTANCE = 6;
// A system whose innermost planet lies beyond this is drawn at a larger scale (see renderPlanetarySystem)
const USUAL_INNER_ORBIT_AU = 0.4;
// Where the system view's camera starts, relative to the star, at the usual scale
const SYSTEM_CAMERA_OFFSET = new THREE.Vector3(0, 2, 5);
// The host star's drawn radius at the usual scale (far larger than true scale, as the planets are)
const HOST_STAR_RADIUS = 0.12;
// Planet spheres stay round up close: 48 segments keep the outline smooth at the closest zoom
const SYSTEM_PLANET_SEGMENTS = 48;

function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;
}

// ── ENH-504: Stellar classification visual profile ────────────────────────────

function stellarProfile(
  temp: number,
  luminosity: number,
  isRare: boolean
): { baseSize: number; glowMult: number } {
  let classSize: number;
  if      (temp > 30000) classSize = 2.3;   // O — blue supergiants
  else if (temp > 10000) classSize = 1.65;  // B
  else if (temp > 7500)  classSize = 1.28;  // A
  else if (temp > 6000)  classSize = 1.0;   // F
  else if (temp > 5200)  classSize = 0.88;  // G (sun-like)
  else if (temp > 3700)  classSize = 0.72;  // K
  else                   classSize = 0.58;  // M — red dwarfs

  // ENH-505: luminosity log scale with floor and ceiling
  const lumSize  = 0.75 + Math.min(4.8, Math.log10(Math.max(1, luminosity)) * 0.7);
  const rareBoost = isRare ? 1.3 : 1.0;
  return {
    baseSize: lumSize * classSize * rareBoost,
    glowMult: classSize,
  };
}

// A thin green ring drawn around each star system that holds life.
function makeLifeRingTexture(): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 32;
  const ctx = canvas.getContext("2d")!;
  ctx.strokeStyle = "rgba(111, 196, 154, 0.9)";   // --col-life
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.arc(16, 16, 12, 0, Math.PI * 2);
  ctx.stroke();
  return new THREE.CanvasTexture(canvas);
}

// ── Life markers ─────────────────────────────────────────────────────────────

/** One star system with life, as the galaxy view should mark it. */
export interface LifeMarker {
  starId: number;
  label: string;   // text for the bubble, e.g. "Complex ecosystems +1"
}

/** Only this many systems carry a text bubble at once, the ones nearest the camera; the rest keep just the ring. */
const LABELLED_MARKER_LIMIT = 30;
const LIFE_RING_SIZE_PX = 13;
// A planet's hover label moves to its left once the planet is this far right (normalized device coordinates)
const PLANET_LABEL_FLIP_NDC = 0.2;
// Approximate bubble footprint on screen (10px monospace text plus padding and pointer),
// used to skip a bubble that would cover a nearer one.
const BUBBLE_CHAR_WIDTH_PX = 6.1;
const BUBBLE_PADDING_PX    = 14;
const BUBBLE_HEIGHT_PX     = 27;

// ─────────────────────────────────────────────────────────────────────────────

export class UniverseRenderer {
  private renderer: THREE.WebGLRenderer;
  private scene:    THREE.Scene;
  private camera:   THREE.PerspectiveCamera;
  private controls: OrbitControls;
  private animFrameId = 0;

  private galaxyMesh:      THREE.Points | null = null;
  private starMesh:        THREE.Points | null = null;
  private highlightMesh:   THREE.Points | null = null;
  private nebulaGroup:     THREE.Group  | null = null;
  private systemGroup:     THREE.Group  | null = null;
  private sky: SkyBackground;

  private starSprite:   THREE.CanvasTexture  | null = null;   // ENH-512: reuse texture
  private reticleTexture: THREE.CanvasTexture | null = null;

  // Life markers: rings (WebGL points) on every system with life, plus HTML bubbles for the nearest few
  private labelRenderer: CSS2DRenderer;
  private lifeRingTexture: THREE.CanvasTexture | null = null;
  private lifeRings:  THREE.Points | null = null;
  private lifeLabels: THREE.Group  | null = null;
  private lifeMarkersOn = false;
  private labelsDirty   = true;
  private lastLabelCamera = { position: new THREE.Vector3(), quaternion: new THREE.Quaternion() };

  private onViewScale: ((scale: ViewScale) => void) | null = null;
  private lastReportedScale = 0;

  private raycaster  = new THREE.Raycaster();
  private starData:   Star[]   = [];
  private planetData: Planet[] = [];
  private onStarSelected:   ((star: Star | null)     => void) | null = null;
  private onPlanetSelected: ((planet: Planet | null) => void) | null = null;
  private onPlanetApproach: ((planet: Planet) => void) | null = null;

  // System view: the label shown beside the planet under the pointer (life is named there, never drawn on the planet)
  private planetLabels = new Map<number, string>();
  private planetLabel: CSS2DObject | null = null;
  private hoveredPlanetId: number | null = null;
  private pointer: THREE.Vector2 | null = null;

  // A glide moves the orbit target and, when `camera` is set, the camera too; `onDone` runs when it ends
  private tween: {
    from: THREE.Vector3; to: THREE.Vector3; t: number;
    camera?: { from: THREE.Vector3; to: THREE.Vector3 };
    onDone?: () => void;
  } | null = null;
  private mode: ViewMode = "galaxy";

  // Planet view: its scene, and the system view's camera to return to
  private planetView: PlanetView | null = null;
  private readonly globeTextures = new GlobeTextureCache();
  // The system view's planets as globes, baked a step a frame (systemGlobes.ts)
  private readonly systemGlobes = new SystemGlobes();
  private pendingBake: GlobeBake | null = null;
  private systemGalaxySeed = 0;
  private systemMaxDistance = DEFAULT_DISTANCE.max;
  private systemHostStar: Star | null = null;
  private systemCameraPose: { position: THREE.Vector3; target: THREE.Vector3 } | null = null;

  constructor(canvas: HTMLCanvasElement) {
    // ENH-511: ACES filmic tone mapping for natural brightness rolloff
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(canvas.clientWidth, canvas.clientHeight);
    this.renderer.setClearColor(0x050608);
    this.renderer.toneMapping         = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.9;

    this.scene = new THREE.Scene();

    this.camera = new THREE.PerspectiveCamera(60, canvas.clientWidth / canvas.clientHeight, 0.01, 100000);
    this.camera.position.set(0, 80, 220);

    // ENH-510: cinematic orbit controls
    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableDamping   = true;
    this.controls.dampingFactor   = 0.08;
    this.controls.minDistance     = 0.01;
    this.controls.maxDistance     = 2000;
    this.controls.autoRotate      = true;
    this.controls.autoRotateSpeed = 0.12;

    this.starSprite = makeStarSprite();   // ENH-512: create once, reuse

    // HTML overlay for life bubbles, stacked directly above the canvas
    this.labelRenderer = new CSS2DRenderer();
    this.labelRenderer.setSize(canvas.clientWidth, canvas.clientHeight);
    this.labelRenderer.domElement.className = "life-overlay";
    canvas.after(this.labelRenderer.domElement);

    this.sky = new SkyBackground(this.renderer.getPixelRatio(), this.renderer.getDrawingBufferSize(new THREE.Vector2()));
    this.scene.add(this.sky.group);
    this.startLoop();

    canvas.addEventListener("click", this.onClick);
    canvas.addEventListener("dblclick", this.onDoubleClick);
    canvas.addEventListener("pointermove", this.onPointerMove);
    canvas.addEventListener("pointerleave", this.onPointerLeave);
    window.addEventListener("resize", this.onResize);
  }

  // ── ENH-507: Nebula sprite accents seeded by galaxy ──────────────────────

  private buildNebula(galaxySeed: number, scale: number) {
    if (this.nebulaGroup) {
      this.scene.remove(this.nebulaGroup);
      for (const child of this.nebulaGroup.children) {
        const s = child as THREE.Sprite;
        (s.material as THREE.SpriteMaterial).map?.dispose();
        s.material.dispose();
      }
    }

    const rng = mulberry32((galaxySeed ^ 0x7E6B1A3C) >>> 0);
    const group = new THREE.Group();

    const nebulaDefs = [
      { r: 55,  g: 75,  b: 190 },   // blue-purple emission
      { r: 190, g: 65,  b: 45  },   // warm orange-red reflection
      { r: 45,  g: 165, b: 145 },   // teal ionization region
    ];

    for (const def of nebulaDefs) {
      const tex = makeNebulaTexture(def.r, def.g, def.b);
      const mat = new THREE.SpriteMaterial({
        map: tex, transparent: true,
        opacity: 0.03 + rng() * 0.03,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      const sprite = new THREE.Sprite(mat);
      const px = (rng() - 0.5) * scale * 1.5;
      const py = (rng() - 0.5) * scale * 0.14;
      const pz = (rng() - 0.5) * scale * 1.5;
      sprite.position.set(px, py, pz);
      const ns = scale * (0.32 + rng() * 0.30);
      sprite.scale.set(ns, ns * (0.55 + rng() * 0.45), 1);
      group.add(sprite);
    }

    this.nebulaGroup = group;
    this.scene.add(group);
  }

  // ── Galaxy dust cloud (ENH-501 / ENH-503) ────────────────────────────────

  renderGalaxy(particles: GalaxyParticles) {
    if (this.galaxyMesh) {
      this.scene.remove(this.galaxyMesh);
      this.galaxyMesh.geometry.dispose();
      (this.galaxyMesh.material as THREE.Material).dispose();
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(particles.positions, 3));
    geo.setAttribute("color",    new THREE.BufferAttribute(realisticDustColors(particles), 3));

    // ENH-501: ShaderMaterial replaces PointsMaterial — circular soft dust
    const mat = new THREE.ShaderMaterial({
      vertexShader:   DUST_VERT,
      fragmentShader: DUST_FRAG,
      transparent: true, depthWrite: false,
      blending: THREE.AdditiveBlending, vertexColors: true,
    });

    this.galaxyMesh = new THREE.Points(geo, mat);
    this.scene.add(this.galaxyMesh);

    // ENH-507: rebuild nebula positioned within this galaxy's scale
    this.buildNebula(particles.config.seed, particles.config.scale);
    // The distant galaxies behind this universe (presentation only, see background.ts)
    this.sky.setUniverse(particles.config.seed);
    // A new universe reuses planet keys for different planets
    this.pendingBake = null;
    this.globeTextures.clear();
    this.systemGlobes.clear();
  }

  // ── Stellar population (ENH-502–509) ─────────────────────────────────────

  renderStars(population: StellarPopulation, onSelected: (star: Star | null) => void) {
    this.onStarSelected = onSelected;
    this.starData = population.stars;

    this.clearMesh("starMesh");
    this.clearMesh("highlightMesh");
    this.clearLifeMarkers();   // they belong to the previous population

    const stars  = population.stars;
    const pos    = new Float32Array(stars.length * 3);
    const col    = new Float32Array(stars.length * 3);
    const sizes  = new Float32Array(stars.length);

    for (let i = 0; i < stars.length; i++) {
      const s = stars[i];
      pos[i * 3]     = s.position[0];
      pos[i * 3 + 1] = s.position[1];
      pos[i * 3 + 2] = s.position[2];

      const [r, g, b] = temperatureToColor(s.temperature);
      col[i * 3]     = r;
      col[i * 3 + 1] = g;
      col[i * 3 + 2] = b;

      // ENH-504 / ENH-505: classification-aware size
      const { baseSize } = stellarProfile(s.temperature, s.luminosity, s.isRare);
      sizes[i] = Math.max(0.5, Math.min(12, baseSize));
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    geo.setAttribute("color",    new THREE.BufferAttribute(col, 3));
    geo.setAttribute("size",     new THREE.BufferAttribute(sizes, 1));

    // ENH-502 / ENH-509: Gaussian three-layer glow
    const mat = new THREE.ShaderMaterial({
      vertexShader:   STAR_VERT,
      fragmentShader: STAR_FRAG,
      transparent: true, depthWrite: false,
      blending: THREE.AdditiveBlending, vertexColors: true,
    });

    this.starMesh = new THREE.Points(geo, mat);
    this.scene.add(this.starMesh);
  }

  // ── Planetary system view ─────────────────────────────────────────────────

  renderPlanetarySystem(
    system: PlanetarySystem,
    hostStar: Star,
    onPlanetSelected: (planet: Planet | null) => void,
    sight: SystemSight = {},
  ) {
    const { onPlanetApproach = null, planetLabels = new Map(), planets = new Map() } = sight;
    this.closePlanetView();
    this.planetLabels = planetLabels;
    this.hidePlanetLabel();
    this.onPlanetSelected = onPlanetSelected;
    this.onPlanetApproach = onPlanetApproach;
    this.planetData = system.planets;
    this.systemGalaxySeed = system.galaxySeed;
    this.systemHostStar = hostStar;
    this.mode = "system";
    this.lastReportedScale = 0;

    if (this.galaxyMesh)    this.galaxyMesh.visible    = false;
    if (this.starMesh)      this.starMesh.visible      = false;
    if (this.highlightMesh) this.highlightMesh.visible = false;
    if (this.nebulaGroup)   this.nebulaGroup.visible   = false;
    this.applyLifeMarkerVisibility();   // bubbles belong to the galaxy view only

    if (this.systemGroup) {
      this.scene.remove(this.systemGroup);
      disposeSystemGroup(this.systemGroup);
    }

    const group = new THREE.Group();

    // A bright star forms its planets farther out (planet.ts): its system is drawn
    // at a larger scale, camera, markers and zoom limit alike, by how far out its
    // innermost planet lies, so it looks like any other system, only bigger.
    const innermostAU = system.planets.length > 0 ? Math.min(...system.planets.map((p) => p.orbitalRadius)) : 0;
    const scale = Math.max(1, innermostAU / USUAL_INNER_ORBIT_AU);

    const [sr, sg, sb] = temperatureToColor(hostStar.temperature);
    const starCol = new THREE.Color(sr, sg, sb);

    // Host star, as light (systemView.ts), and the starlight the planets are lit by
    group.add(hostStarObject(starCol, HOST_STAR_RADIUS * scale), ...systemLights(starCol));

    const markers = new Map<number, THREE.Mesh<THREE.SphereGeometry, THREE.MeshStandardMaterial>>();
    for (const planet of system.planets) {
      const orbitR = planet.orbitalRadius * SYSTEM_UNITS_PER_AU;
      group.add(orbitLine(orbitR));

      const [pr, pg, pb] = PLANET_COLORS[planet.type];
      const pSize = Math.max(0.025, Math.min(0.09, planet.size * 0.035)) * scale;
      const pGeo  = new THREE.SphereGeometry(pSize, SYSTEM_PLANET_SEGMENTS, SYSTEM_PLANET_SEGMENTS / 2);
      const pMat  = new THREE.MeshStandardMaterial({ color: new THREE.Color(pr, pg, pb), roughness: 0.9, metalness: 0 });
      const pMesh = new THREE.Mesh(pGeo, pMat);
      markers.set(planet.id, pMesh);
      pMesh.position.set(orbitR, 0, 0);
      pMesh.userData = { planetId: planet.id };
      group.add(pMesh);

      // A giant's rings, as the planet view draws them (its VISUAL stream, globe.ts), in its equatorial plane
      const planetSight = planets.get(planet.id);
      const giantPhysics = planet.surface === null ? planetSight?.physics ?? undefined : undefined;
      const rings = giantPhysics ? giantLookOf(planet, system.galaxySeed, giantPhysics.rotationPeriodHours).rings : null;
      if (giantPhysics && rings) {
        const pole = new THREE.Vector3(0, 1, 0).applyAxisAngle(new THREE.Vector3(1, 0, 0), THREE.MathUtils.degToRad(giantPhysics.axialTiltDeg));
        const ring = ringMesh(rings, planet.temperature, new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), pole), {
          toStar: new THREE.Vector3(-1, 0, 0), starColor: starCol, starIntensity: starlightIntensity(planetSight!.starFlux), opacity: 1,
        });
        ring.position.copy(pMesh.position);
        ring.scale.setScalar(pSize);
        ring.material.uniforms.planetCentre.value.set(...hostStar.position).add(pMesh.position);
        ring.material.uniforms.planetRadius.value = pSize;
        group.add(ring);
      }
    }

    group.position.set(...hostStar.position);
    this.systemGroup = group;
    this.scene.add(group);

    const starPos = new THREE.Vector3(...hostStar.position);
    this.tween = null;   // a galaxy-view camera glide must not keep steering the system view
    this.controls.target.copy(starPos);
    this.camera.position.copy(starPos.clone().addScaledVector(SYSTEM_CAMERA_OFFSET, scale));
    // No farther than half the camera's far plane, or the system would be clipped away
    this.systemMaxDistance = Math.min(DEFAULT_DISTANCE.max * scale, this.camera.far / 2);
    this.controls.maxDistance = this.systemMaxDistance;
    this.controls.autoRotate      = true;
    this.controls.autoRotateSpeed = SYSTEM_AUTO_ROTATE_SPEED;
    this.systemGlobes.start(group, hostStar, system.galaxySeed, system.planets, markers, planets, this.camera, !prefersReducedMotion());
  }

  exitSystemView() {
    this.closePlanetView();
    this.systemGlobes.stop();
    this.hidePlanetLabel();
    this.planetLabels = new Map();
    this.mode = "galaxy";
    this.lastReportedScale = 0;
    this.applyLifeMarkerVisibility();
    if (this.galaxyMesh)    this.galaxyMesh.visible    = true;
    if (this.starMesh)      this.starMesh.visible      = true;
    if (this.highlightMesh) this.highlightMesh.visible = true;
    if (this.nebulaGroup)   this.nebulaGroup.visible   = true;

    if (this.systemGroup) {
      this.scene.remove(this.systemGroup);
      disposeSystemGroup(this.systemGroup);
      this.systemGroup = null;
    }
    this.planetData = [];
    this.systemHostStar = null;
    this.onPlanetApproach = null;
    this.controls.autoRotate = false;
    this.systemMaxDistance = DEFAULT_DISTANCE.max;
    this.controls.maxDistance = DEFAULT_DISTANCE.max;
  }

  // ── Planet view (Worlds Up Close A4–A5) ───────────────────────────────────

  /**
   * Glide to a planet in the system view, then switch to its planet view.
   * Does nothing outside the system view or for a planet not in the system.
   * `sight.world` is the planet's solid world (solidWorldOf), for drawing its
   * surface; `sight.physics` its spin and tilt; `sight.starFlux` its starlight
   * relative to Earth's.
   */
  approachPlanet(planet: Planet, sight: PlanetSight = { world: null, physics: null, starFlux: 1 }) {
    if (this.mode !== "system" || !this.systemGroup || !this.systemHostStar) return;
    const marker = this.systemGroup.children.find(
      c => c instanceof THREE.Mesh && c.userData.planetId === planet.id,
    ) as THREE.Mesh<THREE.SphereGeometry> | undefined;
    if (!marker) return;

    const planetWorld = marker.getWorldPosition(new THREE.Vector3());
    const markerRadius = marker.geometry.parameters.radius;
    const fromPlanet = this.camera.position.clone().sub(planetWorld).normalize();
    this.systemCameraPose = { position: this.camera.position.clone(), target: this.controls.target.clone() };
    this.controls.autoRotate = false;

    const star = this.systemHostStar;
    const towardStar = new THREE.Vector3(...star.position).sub(planetWorld);
    // The globe is baked a face per frame while the camera glides in
    const world = drawsSurface(planet) ? sight.world : null;
    const surface = sight.physics
      ? this.globeTextures.globeFor(planet, world, sight.physics, this.systemGalaxySeed,
        world ? vegetationOf(sight.biosphere ?? null, star.temperature) : null)
      : null;
    const lights = civilizationLightsOf(planet, world, sight.civilization ?? null, this.systemGalaxySeed);
    this.pendingBake = surface?.bake ?? null;
    this.tween = {
      from: this.controls.target.clone(), to: planetWorld, t: 0,
      camera: { from: this.camera.position.clone(), to: planetWorld.clone().addScaledVector(fromPlanet, markerRadius * APPROACH_END_DISTANCE) },
      onDone: () => this.openPlanetView(planet, star, towardStar, fromPlanet, sight.starFlux, surface, lights),
    };
  }

  /** Return from the planet view (or an approach under way) to the system view. */
  leavePlanetView() {
    if (this.mode !== "planet" && !this.tween?.onDone) return;
    this.closePlanetView();
    this.mode = "system";
    this.lastReportedScale = 0;
    if (this.systemGroup) this.systemGroup.visible = true;
    if (this.systemCameraPose) {
      this.camera.position.copy(this.systemCameraPose.position);
      this.controls.target.copy(this.systemCameraPose.target);
      this.systemCameraPose = null;
    }
    this.controls.autoRotate      = true;
    this.controls.autoRotateSpeed = SYSTEM_AUTO_ROTATE_SPEED;
  }

  private openPlanetView(
    planet: Planet, star: Star, towardStar: THREE.Vector3, cameraDirection: THREE.Vector3,
    starFlux: number, surface: GlobeSurface | null, lights: CivilizationLights | null,
  ) {
    surface?.bake.finish(this.renderer);   // whatever the glide left unbaked
    this.pendingBake = null;
    this.planetView = new PlanetView(planet, star, towardStar, !prefersReducedMotion(), performance.now(), {
      starFlux, surface, lights,
    });
    this.planetView.scene.add(this.sky.group);   // the night sky moves with the viewer
    this.mode = "planet";
    this.lastReportedScale = 0;
    if (this.systemGroup) this.systemGroup.visible = false;

    // Same viewing direction as the glide, now in planet radii around the planet at the origin
    this.controls.target.set(0, 0, 0);
    this.camera.position.copy(cameraDirection).multiplyScalar(ORBIT_DISTANCE.start);
    this.controls.minDistance = ORBIT_DISTANCE.min;
    this.controls.maxDistance = ORBIT_DISTANCE.max;
    this.controls.autoRotate      = true;
    this.controls.autoRotateSpeed = PLANET_AUTO_ROTATE_SPEED;
  }

  /** Disposes the planet view, if any, and cancels an approach under way. */
  private closePlanetView() {
    if (this.tween?.onDone) this.tween = null;
    this.pendingBake = null;   // a half-baked globe stays cached and resumes on the next approach
    if (!this.planetView) return;
    this.scene.add(this.sky.group);
    this.planetView.dispose();
    this.planetView = null;
    this.controls.minDistance = DEFAULT_DISTANCE.min;
    this.controls.maxDistance = this.systemMaxDistance;
  }

  // ── Star highlight ────────────────────────────────────────────────────────

  // A thin square frame drawn at constant screen size, like a telescope's target marker.
  private highlightStar(star: Star | null) {
    this.clearMesh("highlightMesh");
    if (!star) return;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(star.position), 3));
    this.reticleTexture ??= makeReticleTexture();
    const mat = new THREE.PointsMaterial({
      map: this.reticleTexture, size: 28, sizeAttenuation: false,
      transparent: true, depthTest: false, depthWrite: false,
    });
    this.highlightMesh = new THREE.Points(geo, mat);
    this.highlightMesh.renderOrder = 10;
    this.scene.add(this.highlightMesh);
  }

  // ── Click handler ─────────────────────────────────────────────────────────

  private onClick = (e: MouseEvent) => {
    const canvas = this.renderer.domElement;
    const rect   = canvas.getBoundingClientRect();
    const ndc    = new THREE.Vector2(
      ((e.clientX - rect.left) / rect.width)  *  2 - 1,
      ((e.clientY - rect.top)  / rect.height) * -2 + 1,
    );
    this.raycaster.setFromCamera(ndc, this.camera);

    if (this.mode === "planet") return;
    if (this.mode === "system" && this.systemGroup) {
      const planetMeshes = this.systemGroup.children.filter(
        c => c instanceof THREE.Mesh && c.userData.planetId !== undefined
      );
      const hits = this.raycaster.intersectObjects(planetMeshes);
      if (hits.length > 0) {
        const id     = hits[0].object.userData.planetId as number;
        const planet = this.planetData.find(p => p.id === id) ?? null;
        this.onPlanetSelected?.(planet);
      } else {
        this.onPlanetSelected?.(null);
      }
      return;
    }

    if (!this.starMesh || this.starData.length === 0) return;
    this.raycaster.params.Points = { threshold: 3 };
    const hits = this.raycaster.intersectObject(this.starMesh);
    if (hits.length > 0) {
      this.selectStar(this.starData[hits[0].index!]);
    } else {
      this.onStarSelected?.(null);
      this.highlightStar(null);
      this.controls.autoRotate = true;
    }
  };

  /** Double-clicking a planet in the system view approaches it. */
  private onDoubleClick = (e: MouseEvent) => {
    if (this.mode !== "system" || !this.systemGroup || !this.onPlanetApproach) return;
    const planet = this.planetAt(e);
    if (planet) this.onPlanetApproach(planet);
  };

  private planetAt(e: MouseEvent): Planet | null {
    const hit = this.planetMeshAt(this.pointerNdc(e));
    return hit ? this.planetData.find(p => p.id === hit.userData.planetId) ?? null : null;
  }

  private pointerNdc(e: MouseEvent): THREE.Vector2 {
    const rect = this.renderer.domElement.getBoundingClientRect();
    return new THREE.Vector2(
      ((e.clientX - rect.left) / rect.width)  *  2 - 1,
      ((e.clientY - rect.top)  / rect.height) * -2 + 1,
    );
  }

  /** The system view's planet sphere under a point on screen (normalized device coordinates), if any. */
  private planetMeshAt(ndc: THREE.Vector2): THREE.Object3D | null {
    if (!this.systemGroup) return null;
    this.raycaster.setFromCamera(ndc, this.camera);
    const markers = this.systemGroup.children.filter(c => c instanceof THREE.Mesh && c.userData.planetId !== undefined);
    return this.raycaster.intersectObjects(markers)[0]?.object ?? null;
  }

  // ── System view: hover label ──────────────────────────────────────────────

  private onPointerMove = (e: PointerEvent) => {
    this.pointer = this.mode === "system" ? this.pointerNdc(e) : null;
  };

  private onPointerLeave = () => {
    this.pointer = null;
  };

  /** Shows the label of the planet under the pointer, once a frame, so planets moving under a still pointer are found too. */
  private updatePlanetLabel() {
    const mesh = this.mode === "system" && this.pointer ? this.planetMeshAt(this.pointer) : null;
    const id = mesh ? mesh.userData.planetId as number : null;
    const text = id !== null ? this.planetLabels.get(id) : undefined;
    if (!mesh || text === undefined) {
      this.hidePlanetLabel();
      return;
    }
    if (id !== this.hoveredPlanetId) {
      this.hidePlanetLabel();
      const element = document.createElement("div");
      element.className = "planet-label";
      element.textContent = text;
      const anchor = document.createElement("div");   // CSS2DRenderer owns this element's transform
      anchor.className = "planet-label-anchor";
      anchor.append(element);
      this.planetLabel = new CSS2DObject(anchor);
      this.scene.add(this.planetLabel);
      this.hoveredPlanetId = id;
    }
    const label = this.planetLabel!;
    const radius = ((mesh as THREE.Mesh).geometry as THREE.SphereGeometry).parameters.radius;
    mesh.getWorldPosition(label.position);
    label.position.y += radius;
    // Up and to the right of the planet, or to the left in the right part of the view, so the edge never cuts it off
    const onLeft = label.position.clone().project(this.camera).x > PLANET_LABEL_FLIP_NDC;
    label.center.set(onLeft ? 1 : 0, 1);
    label.element.classList.toggle("left", onLeft);
  }

  private hidePlanetLabel() {
    if (this.planetLabel) {
      this.scene.remove(this.planetLabel);
      this.planetLabel.element.remove();
      this.planetLabel = null;
    }
    this.hoveredPlanetId = null;
  }

  private selectStar(star: Star) {
    this.onStarSelected?.(star);
    this.highlightStar(star);
    this.tweenCameraTo(new THREE.Vector3(...star.position));
    this.controls.autoRotate = false;
  }

  // ── Life markers ──────────────────────────────────────────────────────────

  /** Replace the marked systems. Call after renderStars, with markers for that population. */
  setLifeMarkers(markers: LifeMarker[]) {
    this.clearLifeMarkers();
    const starsById = new Map(this.starData.map(star => [star.id, star]));
    const marked = markers.flatMap(m => {
      const star = starsById.get(m.starId);
      return star ? [{ star, label: m.label }] : [];
    });
    if (marked.length === 0) return;

    const positions = new Float32Array(marked.flatMap(m => m.star.position));
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    this.lifeRingTexture ??= makeLifeRingTexture();
    const mat = new THREE.PointsMaterial({
      map: this.lifeRingTexture, size: LIFE_RING_SIZE_PX, sizeAttenuation: false,
      transparent: true, depthWrite: false, toneMapped: false,
    });
    this.lifeRings = new THREE.Points(geo, mat);
    this.lifeRings.renderOrder = 5;
    this.scene.add(this.lifeRings);

    this.lifeLabels = new THREE.Group();
    for (const { star, label } of marked) {
      const bubble = document.createElement("button");
      bubble.type = "button";
      bubble.className = "life-bubble";
      bubble.textContent = label;
      bubble.setAttribute("aria-label", `${label}. Select this star system`);
      bubble.addEventListener("click", () => this.selectStar(star));

      const anchor = document.createElement("div");   // CSS2DRenderer owns this element's transform
      anchor.className = "life-anchor";
      anchor.append(bubble);

      const object = new CSS2DObject(anchor);
      object.center.set(0.5, 1);   // bottom-centre of the bubble's pointer sits on the star
      object.position.set(...star.position);
      object.visible = false;
      this.lifeLabels.add(object);
    }
    this.scene.add(this.lifeLabels);

    this.labelsDirty = true;
    this.applyLifeMarkerVisibility();
  }

  setLifeMarkersVisible(on: boolean) {
    this.lifeMarkersOn = on;
    this.labelsDirty = true;
    this.applyLifeMarkerVisibility();
  }

  private applyLifeMarkerVisibility() {
    const show = this.lifeMarkersOn && this.mode === "galaxy";
    if (this.lifeRings)  this.lifeRings.visible  = show;
    if (this.lifeLabels) this.lifeLabels.visible = show;
    this.labelsDirty = true;
  }

  private clearLifeMarkers() {
    if (this.lifeRings) {
      this.scene.remove(this.lifeRings);
      this.lifeRings.geometry.dispose();
      (this.lifeRings.material as THREE.Material).dispose();
      this.lifeRings = null;
    }
    if (this.lifeLabels) {
      this.scene.remove(this.lifeLabels);
      for (const object of this.lifeLabels.children) (object as CSS2DObject).element.remove();
      this.lifeLabels = null;
    }
  }

  /**
   * Give bubbles to the on-screen systems nearest the camera, skipping any that would
   * overlap a nearer bubble. Recomputed only when the camera moves.
   */
  private updateLifeLabels() {
    if (!this.lifeLabels?.visible) return;
    const cam = this.lastLabelCamera;
    if (!this.labelsDirty && cam.position.equals(this.camera.position) && cam.quaternion.equals(this.camera.quaternion)) return;
    cam.position.copy(this.camera.position);
    cam.quaternion.copy(this.camera.quaternion);
    this.labelsDirty = false;

    this.camera.updateMatrixWorld();
    const projected = new THREE.Vector3();
    const { clientWidth, clientHeight } = this.renderer.domElement;
    type Box = { left: number; right: number; top: number; bottom: number };
    const onScreen: { object: CSS2DObject; distance: number; box: Box }[] = [];
    for (const child of this.lifeLabels.children) {
      const object = child as CSS2DObject;
      object.visible = false;
      projected.copy(object.position).project(this.camera);
      const inView = Math.abs(projected.x) <= 1 && Math.abs(projected.y) <= 1 && projected.z >= -1 && projected.z <= 1;
      if (!inView) continue;
      const x = (projected.x + 1) / 2 * clientWidth;
      const y = (1 - projected.y) / 2 * clientHeight;
      const halfWidth = ((object.element.textContent?.length ?? 0) * BUBBLE_CHAR_WIDTH_PX + BUBBLE_PADDING_PX) / 2;
      onScreen.push({
        object,
        distance: object.position.distanceTo(this.camera.position),
        box: { left: x - halfWidth, right: x + halfWidth, top: y - BUBBLE_HEIGHT_PX, bottom: y },
      });
    }
    onScreen.sort((a, b) => a.distance - b.distance);

    const placed: Box[] = [];
    for (const { object, box } of onScreen) {
      if (placed.length >= LABELLED_MARKER_LIMIT) break;
      const overlaps = placed.some(p => box.left < p.right && box.right > p.left && box.top < p.bottom && box.bottom > p.top);
      if (overlaps) continue;
      placed.push(box);
      object.visible = true;
    }
  }

  // ── ENH-510: cinematic camera tween (quintic ease-out) ───────────────────

  private tweenCameraTo(target: THREE.Vector3) {
    this.tween = { from: this.controls.target.clone(), to: target, t: 0 };
  }

  private stepTween() {
    const tween = this.tween;
    if (!tween) return;
    tween.t += 0.038;
    const p     = Math.min(tween.t, 1);
    const eased = 1 - Math.pow(1 - p, 5);   // quintic ease-out
    this.controls.target.lerpVectors(tween.from, tween.to, eased);
    if (tween.camera) this.camera.position.lerpVectors(tween.camera.from, tween.camera.to, eased);
    if (tween.t >= 1) {
      this.tween = null;
      tween.onDone?.();
    }
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  private clearMesh(key: "starMesh" | "highlightMesh") {
    const mesh = this[key];
    if (mesh) {
      this.scene.remove(mesh);
      mesh.geometry.dispose();
      (mesh.material as THREE.Material).dispose();
      this[key] = null;
    }
  }

  // ── Render loop ───────────────────────────────────────────────────────────

  private startLoop() {
    const tick = () => {
      this.animFrameId = requestAnimationFrame(tick);
      if (this.pendingBake) {
        this.pendingBake.step(this.renderer);
        if (this.pendingBake.done) this.pendingBake = null;
      } else if (this.mode === "system") {
        this.systemGlobes.update(this.renderer, performance.now());   // the approach's bake goes first
      }
      this.stepTween();
      this.controls.update();

      this.reportViewScale();

      this.sky.follow(this.camera);
      if (this.mode === "planet" && this.planetView) {
        this.planetView.update(performance.now());
        this.renderer.render(this.planetView.scene, this.camera);
      } else {
        this.renderer.render(this.scene, this.camera);
      }
      this.updateLifeLabels();
      this.updatePlanetLabel();
      this.labelRenderer.render(this.scene, this.camera);
    };
    tick();
  }

  /** Register a listener for the on-screen scale; called when zoom or view changes noticeably. */
  setViewScaleListener(listener: ((scale: ViewScale) => void) | null) {
    this.onViewScale = listener;
    this.lastReportedScale = 0;
  }

  private reportViewScale() {
    if (!this.onViewScale) return;
    const canvasHeight = this.renderer.domElement.clientHeight;
    if (canvasHeight === 0) return;
    const inPlanetView = this.mode === "planet" && this.planetView;
    // In the planet view, measure at the surface point facing the camera (one radius nearer than the centre)
    const distance = this.camera.position.distanceTo(this.controls.target) - (inPlanetView ? 1 : 0);
    const visibleHeight = 2 * distance * Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2));
    const unitsPerPixel = visibleHeight / canvasHeight;
    if (Math.abs(unitsPerPixel - this.lastReportedScale) / unitsPerPixel < 0.02) return;
    this.lastReportedScale = unitsPerPixel;
    this.onViewScale(inPlanetView
      ? { mode: "planet", unitsPerPixel, kmPerUnit: this.planetView!.kmPerUnit }
      : { mode: this.mode, unitsPerPixel });
  }

  private onResize = () => {
    const canvas = this.renderer.domElement;
    this.camera.aspect = canvas.clientWidth / canvas.clientHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(canvas.clientWidth, canvas.clientHeight, false);
    this.sky.setDrawingBufferSize(this.renderer.getDrawingBufferSize(new THREE.Vector2()));
    this.labelRenderer.setSize(canvas.clientWidth, canvas.clientHeight);
    this.labelsDirty = true;
  };

  dispose() {
    cancelAnimationFrame(this.animFrameId);
    this.renderer.domElement.removeEventListener("click", this.onClick);
    this.renderer.domElement.removeEventListener("dblclick", this.onDoubleClick);
    this.renderer.domElement.removeEventListener("pointermove", this.onPointerMove);
    this.renderer.domElement.removeEventListener("pointerleave", this.onPointerLeave);
    this.hidePlanetLabel();
    this.closePlanetView();
    this.globeTextures.clear();
    this.systemGlobes.clear();
    window.removeEventListener("resize", this.onResize);

    // ENH-512: dispose all resources
    this.starSprite?.dispose();
    this.reticleTexture?.dispose();
    this.clearLifeMarkers();
    this.lifeRingTexture?.dispose();
    this.labelRenderer.domElement.remove();
    this.sky.dispose();
    if (this.nebulaGroup) {
      for (const child of this.nebulaGroup.children) {
        const s = child as THREE.Sprite;
        (s.material as THREE.SpriteMaterial).map?.dispose();
        s.material.dispose();
      }
    }

    this.controls.dispose();
    this.renderer.dispose();
  }
}
