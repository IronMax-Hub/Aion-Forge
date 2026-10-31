import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { CSS2DRenderer, CSS2DObject } from "three/examples/jsm/renderers/CSS2DRenderer.js";
import type { GalaxyParticles, GalaxyType } from "../simulation/galaxy";
import type { Star, StellarPopulation } from "../simulation/star";
import { companionAsStar, stellarRadiusAU } from "../simulation/star";
import { pairLight } from "../simulation/binary";
import { starDisplayColour, starDisplayThreeColour, starLightThreeColour } from "./starColour";
import { nearestStarOnScreen } from "./starPick";
import { moonKey } from "../simulation/bodyKey";
import { formatSig, spectralType, STELLAR_CLASS_NAME } from "../ui/format";
import type { Planet, PlanetarySystem, SolidWorld } from "../simulation/planet";
import { effectiveOrbitAU } from "../simulation/planetBasics";
import type { UniverseConfig } from "../simulation/config";
import type { PlanetPhysics } from "../simulation/planetPhysics";
import { PLANET_COLORS } from "../simulation/planet";
import type { Biosphere } from "../simulation/biosphere";
import type { Civilization } from "../simulation/civilization";
import type { CentralBlackHole } from "../simulation/blackHole";
import { BlackHoleView, BLACK_HOLE_DISTANCE, START_ELEVATION_DEG } from "./blackHole/BlackHoleView";
import type { BlackHoleStats } from "./blackHole/BlackHoleView";
import type { BlackHoleQualityLevel } from "./blackHole/quality";
import { SkyBackground } from "./background";
import {
  barycentreMarker, circumbinaryOrbitLine, companionStartAngle, disposeSystemGroup, distantStarMarker, FASTEST_PAIR_ORBIT_SECONDS,
  fadeMoonOrbit, hostStarObject, INNER_MOON_ORBIT_SECONDS, keplerLine, markOrbit, moonOrbitLine, moonOrbitVisibility, orbitLine,
  secondsPerOrbit, SYSTEM_STARLIGHT_INTENSITY, systemLights, SystemOrbits,
} from "./systemView";
import type { KeplerPath } from "./systemView";
import { drawnOrbit, HOST_STAR_RADIUS, hostStarRadius, SYSTEM_UNITS_PER_AU, systemLayout } from "./systemLayout";
import type { PlanetLayout } from "./systemLayout";
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


/** What the system view is given besides the system: callbacks and what it labels and draws each planet with. */
export interface SystemSight {
  /** Called when a planet (or moon world) is double-clicked, to approach it. */
  onPlanetApproach?: ((planet: Planet) => void) | null;
  /** Hover label text per body key; a body without one shows no label. */
  planetLabels?: Map<string, string>;
  /** What each planet and moon world is drawn from, by body key: its world, physics, starlight and life (its globe, air and rings). */
  planets?: Map<string, PlanetSight>;
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

export type ViewMode = "galaxy" | "system" | "planet" | "blackHole";

/**
 * How large one screen pixel is, in scene units, and which view it applies to:
 * at the orbit target in the galaxy and system views, at the nearest surface in
 * the planet view, whose scene unit is `kmPerUnit` kilometres, and at the black
 * hole in its close-up, whose scene unit is its horizon radius, also `kmPerUnit`.
 */
export interface ViewScale {
  mode: ViewMode;
  unitsPerPixel: number;
  kmPerUnit?: number;
}

// Orbit-control limits outside the planet view
const DEFAULT_DISTANCE = { min: 0.01, max: 2000 };
// Where the camera starts for every new galaxy: above the disc, looking at its centre
const GALAXY_START_POSITION = new THREE.Vector3(0, 80, 220);
// The views' slow turns, in turns per minute (OrbitControls' autoRotateSpeed, given each frame's
// duration). They match what the views did on the owner's phone at 120 frames a second, when
// the turn was counted per frame and so ran many times slower on a slow desktop GPU.
const GALAXY_AUTO_ROTATE_SPEED = 0.24;
const SYSTEM_AUTO_ROTATE_SPEED = 0.8;
const PLANET_AUTO_ROTATE_SPEED = 0.5;
// The approach glide ends this many planet-marker radii from the marker
const APPROACH_END_DISTANCE = 6;
// The planets' clock and the views' turns move at most this much a frame, so a hidden tab does not make them jump
const MAX_ORBIT_STEP_MS = 100;
// A focused planet is framed this many of its radii away, and the camera may come no closer than the second
// (there the planet fills about half the view, and its 256-texel bake is still sharp)
const FOCUS_FRAME_RADII = 8;
const FOCUS_MIN_RADII = 3;
// A body shrunk to fit a crowded system (systemLayout.ts) can be smaller than the camera's near plane allows at
// those distances, so the camera stays at least this many near-plane distances beyond its surface
const FOCUS_NEAR_CLEARANCE = 2;
// A press that moves farther than this before release is a drag (turning the view), not a click
const CLICK_SLOP_PX = 5;
// A system whose innermost planet lies beyond this is drawn at a larger scale (see renderPlanetarySystem)
const USUAL_INNER_ORBIT_AU = 0.4;
// Where the system view's camera starts, relative to the star, at the usual scale
const SYSTEM_CAMERA_OFFSET = new THREE.Vector3(0, 2, 5);
// Planet spheres stay round up close: 48 segments keep the outline smooth at the closest zoom
const SYSTEM_PLANET_SEGMENTS = 48;
// Moons too small to be worlds are drawn in the grey of ice and rock
const SMALL_MOON_COLOUR: [number, number, number] = [0.7, 0.72, 0.75];
// A body on screen can be picked within at least this many pixels of its centre
const PICK_RADIUS_PX = 12;
// A binary's star orbits (BS4), drawn in each star's colour
const COMPANION_ORBIT_OPACITY = 0.45;

/** A star's kind in a few characters: its spectral type, or its class for a remnant. */
function starKindOf(star: { temperature: number; classification: Star["classification"] }): string {
  return spectralType(star.temperature, star.classification) ?? STELLAR_CLASS_NAME[star.classification];
}

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

// A double ring, wider than the life ring so both show on a system that has each.
// Drawn white: each point's colour tints it, gold for a living civilization, dull for ruins.
function makeCivilizationRingTexture(): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 32;
  const ctx = canvas.getContext("2d")!;
  ctx.strokeStyle = "rgba(255, 255, 255, 0.95)";
  ctx.lineWidth = 2;
  for (const radius of [13, 9.5]) {
    ctx.beginPath();
    ctx.arc(16, 16, radius, 0, Math.PI * 2);
    ctx.stroke();
  }
  return new THREE.CanvasTexture(canvas);
}

// ── Central black hole ───────────────────────────────────────────────────────
//
// At galaxy scale a black hole is invisible: Sagittarius A*'s horizon is 0.08 AU
// across, a hundred-millionth of a scene unit. What marks a galaxy's centre is its
// crowded core of stars, so nothing is drawn there; a click on the core selects the
// black hole, and the reticle marks it as it marks a selected star.

/** How near the galaxy's centre on screen, px, a click selects its black hole. */
const BLACK_HOLE_PICK_RADIUS_PX = 12;

// ── Life and civilization markers ────────────────────────────────────────────

/** One star system with life, as the galaxy view should mark it. */
export interface LifeMarker {
  starId: number;
  label: string;   // text for the bubble, e.g. "Complex ecosystems +1"
}

/** One star system where a civilization arose; ruins when none of its civilizations still lives (R8). */
export interface CivilizationMarker extends LifeMarker {
  ruins: boolean;
}

/** The galaxy view's two kinds of marker, each with its own switch. */
type MarkerKind = "life" | "civilization";

/** A kind of marker on screen: a ring on each marked system, and a bubble that may show above it. */
interface MarkerLayer {
  rings:  THREE.Points;
  labels: THREE.Group;
}

/** Only this many life systems carry a text bubble at once, the ones nearest the camera; the rest keep just the ring.
 *  Civilizations are rare enough that every one on screen keeps its bubble. */
const LABELLED_MARKER_LIMIT = 30;
const LIFE_RING_SIZE_PX = 13;
const CIVILIZATION_RING_SIZE_PX = 21;
const CIVILIZATION_RING_COLOUR = new THREE.Color(0xD9BC6A);   // --col-gold
const RUINS_RING_COLOUR        = new THREE.Color(0x8A7F62);   // gold, dulled
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
  /** Whether the render loop is stopped, while a page covers the view (setPaused). */
  private paused = false;

  private galaxyMesh:      THREE.Points | null = null;
  private blackHole:       CentralBlackHole | null = null;
  private blackHoleSeed = 0;
  private blackHoleGalaxyType: GalaxyType = "spiral";
  private blackHoleQuality: BlackHoleQualityLevel = "standard";
  private blackHoleView:   BlackHoleView | null = null;
  private galaxyCameraPose: { position: THREE.Vector3; target: THREE.Vector3 } | null = null;
  private onBlackHoleSelected: (() => void) | null = null;
  private starMesh:        THREE.Points | null = null;
  private highlightMesh:   THREE.Points | null = null;
  private nebulaGroup:     THREE.Group  | null = null;
  private systemGroup:     THREE.Group  | null = null;
  private sky: SkyBackground;

  private starSprite:   THREE.CanvasTexture  | null = null;   // ENH-512: reuse texture
  private reticleTexture: THREE.CanvasTexture | null = null;

  // Markers: rings (WebGL points) on every marked system, plus HTML bubbles for those that fit
  private labelRenderer: CSS2DRenderer;
  private resizeObserver: ResizeObserver;
  private lifeRingTexture: THREE.CanvasTexture | null = null;
  private civilizationRingTexture: THREE.CanvasTexture | null = null;
  private markerLayers: Record<MarkerKind, MarkerLayer | null> = { life: null, civilization: null };
  private markersOn:    Record<MarkerKind, boolean> = { life: false, civilization: false };
  private labelsDirty   = true;
  private lastLabelCamera = { position: new THREE.Vector3(), quaternion: new THREE.Quaternion() };

  private onViewScale: ((scale: ViewScale) => void) | null = null;
  private lastReportedScale = 0;

  private raycaster  = new THREE.Raycaster();
  private starData:   Star[]   = [];
  private planetData: Planet[] = [];
  private onStarSelected:   ((star: Star | null)     => void) | null = null;
  /** Called with the planet picked in the system view; for a moon too small to be a world, its planet and the moon's index. */
  private onPlanetSelected: ((planet: Planet | null, smallMoonIndex?: number) => void) | null = null;
  private onPlanetApproach: ((planet: Planet) => void) | null = null;

  // System view: the label shown beside the planet under the pointer (life is named there, never drawn on the planet)
  private planetLabels = new Map<string, string>();
  private planetLabel: CSS2DObject | null = null;
  private hoveredPlanetKey: string | null = null;
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
  // The system view's planets going round their star, their spheres (for picking), and the last frame's time
  private systemOrbits = new SystemOrbits();
  private systemMarkers = new Map<string, THREE.Mesh<THREE.SphereGeometry, THREE.MeshStandardMaterial>>();
  /** Every body's orbit line in the system view, by body key: planets' and moons'. */
  private orbitLines = new Map<string, THREE.LineLoop>();
  /** Moons' orbit lines with the planet carrier they circle, faded by their size on screen. */
  private moonOrbits: { line: THREE.LineLoop; carrier: THREE.Object3D; radius: number }[] = [];
  private orbitsMove = false;
  private lastFrameMs = performance.now();
  // The planet the system view's camera is on, following it round its orbit; null: the star
  private focusedPlanetKey: string | null = null;
  private systemScale = 1;
  private pressedAt: { x: number; y: number } | null = null;
  private pendingBake: GlobeBake | null = null;
  private systemGalaxySeed = 0;
  private systemMaxDistance = DEFAULT_DISTANCE.max;
  private systemHostStar: Star | null = null;
  private systemCameraPose: { position: THREE.Vector3; target: THREE.Vector3 } | null = null;

  constructor(canvas: HTMLCanvasElement) {
    // ENH-511: ACES filmic tone mapping for natural brightness rolloff
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    // false: leave the canvas's CSS size alone, so it keeps following its container
    this.renderer.setSize(canvas.clientWidth, canvas.clientHeight, false);
    this.renderer.setClearColor(0x050608);
    this.renderer.toneMapping         = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.9;

    this.scene = new THREE.Scene();

    this.camera = new THREE.PerspectiveCamera(60, canvas.clientWidth / canvas.clientHeight, 0.01, 100000);
    this.camera.position.copy(GALAXY_START_POSITION);

    // ENH-510: cinematic orbit controls
    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableDamping   = true;
    this.controls.dampingFactor   = 0.08;
    this.controls.minDistance     = 0.01;
    this.controls.maxDistance     = 2000;
    this.controls.autoRotate      = true;
    this.controls.autoRotateSpeed = GALAXY_AUTO_ROTATE_SPEED;

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
    canvas.addEventListener("pointerdown", this.onPointerDown);
    canvas.addEventListener("pointermove", this.onPointerMove);
    canvas.addEventListener("pointerleave", this.onPointerLeave);
    // The canvas resizes with the window and when a drawer beside it opens or hides
    this.resizeObserver = new ResizeObserver(this.onResize);
    this.resizeObserver.observe(canvas);
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
    this.resetGalaxyCamera();
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
    this.clearMarkers();   // they belong to the previous population

    const stars  = population.stars;
    const pos    = new Float32Array(stars.length * 3);
    const col    = new Float32Array(stars.length * 3);
    const sizes  = new Float32Array(stars.length);

    for (let i = 0; i < stars.length; i++) {
      const s = stars[i];
      pos[i * 3]     = s.position[0];
      pos[i * 3 + 1] = s.position[1];
      pos[i * 3 + 2] = s.position[2];

      // A binary is one point at this scale: its colour from both stars' light, its size from their sum (BS4)
      const seen = pairLight(s);
      const [r, g, b] = starDisplayColour(seen.temperature);
      col[i * 3]     = r;
      col[i * 3 + 1] = g;
      col[i * 3 + 2] = b;

      // ENH-504 / ENH-505: classification-aware size
      const { baseSize } = stellarProfile(seen.temperature, seen.luminosity, s.isRare);
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
    config: UniverseConfig,
    onPlanetSelected: (planet: Planet | null, smallMoonIndex?: number) => void,
    sight: SystemSight = {},
  ) {
    const { onPlanetApproach = null, planetLabels = new Map(), planets = new Map() } = sight;
    this.closePlanetView();
    this.planetLabels = planetLabels;
    this.hidePlanetLabel();
    this.onPlanetSelected = onPlanetSelected;
    this.onPlanetApproach = onPlanetApproach;
    // Everything that can be picked: the planets and their moon worlds (MO6)
    this.planetData = system.planets.flatMap((planet) => [planet, ...planet.moons.flatMap((moon) => (moon.world ? [moon.world] : []))]);
    this.systemGalaxySeed = system.galaxySeed;
    this.systemHostStar = hostStar;
    this.mode = "system";
    this.lastReportedScale = 0;

    if (this.galaxyMesh)    this.galaxyMesh.visible    = false;
    if (this.starMesh)      this.starMesh.visible      = false;
    if (this.highlightMesh) this.highlightMesh.visible = false;
    if (this.nebulaGroup)   this.nebulaGroup.visible   = false;
    this.applyMarkerVisibility();   // bubbles belong to the galaxy view only

    if (this.systemGroup) {
      this.scene.remove(this.systemGroup);
      disposeSystemGroup(this.systemGroup);
    }

    const group = new THREE.Group();
    group.position.set(...hostStar.position);

    // A bright star forms its planets farther out (planet.ts): its system is drawn
    // at a larger scale, camera, markers and zoom limit alike, by how far out its
    // innermost planet lies, so it looks like any other system, only bigger.
    // Orbits are drawn at the distance the physics uses, which gravity moves (effectiveOrbitAU).
    const orbitAU = (planet: Planet) => effectiveOrbitAU(planet.orbitalRadius, config);
    const innermostAU = system.planets.length > 0 ? Math.min(...system.planets.map(orbitAU)) : 0;
    const scale = Math.max(1, innermostAU / USUAL_INNER_ORBIT_AU);

    // The star's true colour lights its planets; it is drawn in its display colour (starColour.ts)
    const starCol = starLightThreeColour(hostStar.temperature);
    const maxDistance = Math.min(DEFAULT_DISTANCE.max * scale, this.camera.far / 2);

    const markers = new Map<string, THREE.Mesh<THREE.SphereGeometry, THREE.MeshStandardMaterial>>();
    const orbitLines = new Map<string, THREE.LineLoop>();
    this.moonOrbits = [];
    // Each planet's meshes ride in a carrier that goes round the orbit (systemView.ts)
    this.systemOrbits = new SystemOrbits();
    // Host star, as light (systemView.ts), and the starlight the planets are lit by; in a binary, its
    // companion too (BS4), and the group the primary's own planets ride in
    // The host star's drawn size, inside its innermost planet's orbit as drawn (a hot Jupiter's too)
    const starRadius = hostStarRadius(system.planets, scale, config);
    const ownPlanetsParent = this.addStars(group, hostStar, system, orbitAU, starCol, scale, starRadius, maxDistance);
    // Each planet's and moons' drawn sizes, fitted so no body reaches the star or a neighbour (systemLayout.ts)
    const layouts = systemLayout(system.planets, scale, config);
    for (const planet of system.planets) {
      const orbitR = drawnOrbit(planet, config);
      const parent = planet.orbitsBothStars ? group : ownPlanetsParent;
      const orbit = planet.orbitsBothStars ? circumbinaryOrbitLine(orbitR) : orbitLine(orbitR);
      parent.add(orbit);
      orbitLines.set(planet.key, orbit);
      const carrier = new THREE.Group();
      parent.add(carrier);
      this.systemOrbits.add(planet, carrier, orbitR, innermostAU * SYSTEM_UNITS_PER_AU, system.galaxySeed);

      const [pr, pg, pb] = PLANET_COLORS[planet.type];
      const layout = layouts.get(planet.key)!;
      const pSize = layout.planetRadius;
      const pGeo  = new THREE.SphereGeometry(pSize, SYSTEM_PLANET_SEGMENTS, SYSTEM_PLANET_SEGMENTS / 2);
      const pMat  = new THREE.MeshStandardMaterial({ color: new THREE.Color(pr, pg, pb), roughness: 0.9, metalness: 0 });
      const pMesh = new THREE.Mesh(pGeo, pMat);
      markers.set(planet.key, pMesh);
      pMesh.userData = { planetKey: planet.key };
      carrier.add(pMesh);
      this.addMoonMarkers(planet, layout, markers, orbitLines, system.galaxySeed);

      // A giant's rings, as the planet view draws them (its VISUAL stream, globe.ts), in its equatorial plane
      const planetSight = planets.get(planet.key);
      const giantPhysics = planet.surface === null ? planetSight?.physics ?? undefined : undefined;
      const rings = giantPhysics ? giantLookOf(planet, system.galaxySeed, giantPhysics.rotationPeriodHours).rings : null;
      if (giantPhysics && rings) {
        const pole = new THREE.Vector3(0, 1, 0).applyAxisAngle(new THREE.Vector3(1, 0, 0), THREE.MathUtils.degToRad(giantPhysics.axialTiltDeg));
        const ring = ringMesh(rings, planet.temperature, new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), pole), {
          toStar: new THREE.Vector3(-1, 0, 0), starColor: starCol, starIntensity: starlightIntensity(planetSight!.starFlux), opacity: 1,
        });
        ring.scale.setScalar(pSize);
        ring.material.uniforms.planetRadius.value = pSize;
        carrier.add(ring);
        this.systemOrbits.follow(planet.key, ({ centre, toStar }) => {
          ring.material.uniforms.planetCentre.value.copy(centre);
          ring.material.uniforms.toStar.value.copy(toStar);
        });
      }
    }

    this.systemOrbits.advance(0);
    this.systemMarkers = markers;
    this.orbitLines = orbitLines;
    this.systemScale = scale;
    this.focusedPlanetKey = null;
    this.controls.minDistance = DEFAULT_DISTANCE.min;
    this.orbitsMove = !prefersReducedMotion();
    this.systemGroup = group;
    this.scene.add(group);

    const starPos = new THREE.Vector3(...hostStar.position);
    this.tween = null;   // a galaxy-view camera glide must not keep steering the system view
    this.controls.target.copy(starPos);
    this.camera.position.copy(starPos.clone().addScaledVector(SYSTEM_CAMERA_OFFSET, scale));
    // No farther than half the camera's far plane, or the system would be clipped away
    this.systemMaxDistance = maxDistance;
    this.controls.maxDistance = this.systemMaxDistance;
    this.controls.autoRotate      = true;
    this.controls.autoRotateSpeed = SYSTEM_AUTO_ROTATE_SPEED;
    this.systemGlobes.start(group, hostStar, system.galaxySeed, this.planetData, markers, planets, this.systemOrbits, this.camera, !prefersReducedMotion());
  }

  /**
   * The host star and, in a binary, its companion (BS4); returns the group the primary's own planets
   * go in. Both stars move on Kepler ellipses from the pair's simulated separation and eccentricity,
   * fastest at closest approach, and their centre of mass is marked with a cross.
   * - When a planet orbits both stars, the centre of mass is the group's origin: each star goes round
   *   it on its own ellipse, the lighter one on the larger, and the primary's own planets ride with it.
   *   Planets around both are drawn on dashed orbits.
   * - Otherwise the primary stays at the origin and the companion goes round it on their relative
   *   orbit, with the centre of mass between them; a companion beyond half the view's reach is drawn
   *   closer, and its label says so.
   * Stars light the planets in proportion to their light. Not to scale: a close pair is drawn far
   * enough apart to see both stars.
   */
  private addStars(
    group: THREE.Group, hostStar: Star, system: PlanetarySystem, orbitAU: (planet: Planet) => number,
    starCol: THREE.Color, scale: number, starRadius: number, maxDistance: number,
  ): THREE.Object3D {
    const companion = hostStar.companion;
    const companionStar = companionAsStar(hostStar);
    if (!companion || !companionStar) {
      group.add(hostStarObject(starDisplayThreeColour(hostStar.temperature), starRadius), ...systemLights(starCol));
      return group;
    }
    const companionCol = starLightThreeColour(companion.temperature);
    const drawnCol = starDisplayThreeColour(hostStar.temperature);
    const companionDrawnCol = starDisplayThreeColour(companion.temperature);
    const total = hostStar.luminosity + companion.luminosity;
    const ownShare = total > 0 ? hostStar.luminosity / total : 1;
    const primaryRadiusAU = stellarRadiusAU(hostStar);
    const companionSize = Math.min(1.5, Math.max(0.5, primaryRadiusAU > 0 ? stellarRadiusAU(companionStar) / primaryRadiusAU : 1));
    const periapsis = companionStartAngle(hostStar.id, system.galaxySeed);
    const e = companion.eccentricity;
    const trueA = companion.separationAU * SYSTEM_UNITS_PER_AU;
    const mu = companion.mass / (hostStar.mass + companion.mass);
    const innermostAU = system.planets.length > 0 ? Math.min(...system.planets.map(orbitAU)) : companion.separationAU;
    const seconds = Math.max(FASTEST_PAIR_ORBIT_SECONDS, secondsPerOrbit(companion.separationAU, innermostAU));
    const aroundBoth = system.planets.filter((p) => p.orbitsBothStars);

    if (aroundBoth.length === 0) {
      // A companion round the primary: their relative orbit, with the centre of mass on the line between them
      const radius = starRadius;
      group.add(hostStarObject(drawnCol, radius), ...systemLights(starCol));
      const closest = 3 * radius * (1 + companionSize);
      const a = Math.min(maxDistance / 2 / (1 + e), Math.max(trueA, closest / (1 - e)));
      const relative: KeplerPath = { a, e, share: 1, periapsis };
      group.add(keplerLine(relative, companionDrawnCol, COMPANION_ORBIT_OPACITY));
      const marker = distantStarMarker(companionDrawnCol, radius * companionSize,
        `Companion · ${starKindOf(companion)} · ${formatSig(companion.separationAU)} AU${a < trueA ? " (drawn closer)" : a > trueA ? " (drawn apart)" : ""}`);
      const centre = new THREE.Group();
      centre.add(barycentreMarker());
      group.add(marker, centre);
      this.systemOrbits.addStar("pair-companion", marker, relative, seconds);
      this.systemOrbits.addStar("pair-centre", centre, { ...relative, share: mu }, seconds);
      return group;
    }

    // A close pair round its centre of mass, inside the innermost planet that orbits both
    const innermostBothAU = Math.min(...aroundBoth.map(orbitAU));
    const ownPlanets = system.planets.length > aroundBoth.length;
    const radius = Math.min(HOST_STAR_RADIUS * scale, (innermostBothAU * SYSTEM_UNITS_PER_AU) / 10);
    const roomy = ownPlanets ? trueA : Math.max(trueA, (3 * radius * (1 + companionSize)) / (1 - e));
    const a = Math.min(0.6 * innermostBothAU * SYSTEM_UNITS_PER_AU / (1 + e), roomy);
    const primaryPath: KeplerPath = { a, e, share: -mu, periapsis };
    const companionPath: KeplerPath = { a, e, share: 1 - mu, periapsis };
    const primaryCarrier = new THREE.Group();
    const companionCarrier = new THREE.Group();
    group.add(
      primaryCarrier, companionCarrier, barycentreMarker(),
      keplerLine(primaryPath, drawnCol, COMPANION_ORBIT_OPACITY), keplerLine(companionPath, companionDrawnCol, COMPANION_ORBIT_OPACITY),
    );
    this.systemOrbits.addStar("pair-primary", primaryCarrier, primaryPath, seconds);
    this.systemOrbits.addStar("pair-companion", companionCarrier, companionPath, seconds);
    primaryCarrier.add(hostStarObject(drawnCol, radius), ...systemLights(starCol, SYSTEM_STARLIGHT_INTENSITY * ownShare));
    companionCarrier.add(hostStarObject(companionDrawnCol, radius * companionSize),
      new THREE.PointLight(companionCol, SYSTEM_STARLIGHT_INTENSITY * (1 - ownShare), 0, 0));
    return primaryCarrier;
  }

  /**
   * A planet's moons (MO6), going round it at the distances and sizes of its layout (systemLayout.ts),
   * with their real period ratios. Moon worlds can be picked and approached
   * as planets can; smaller moons are only drawn.
   */
  private addMoonMarkers(
    planet: Planet, layout: PlanetLayout,
    markers: Map<string, THREE.Mesh<THREE.SphereGeometry, THREE.MeshStandardMaterial>>, orbitLines: Map<string, THREE.LineLoop>,
    galaxySeed: number,
  ): void {
    const carrier = this.systemOrbits.carrierOf(planet.key);
    if (!carrier || planet.moons.length === 0) return;
    const innermost = planet.moons[0];
    planet.moons.forEach((moon, i) => {
      const { distance, radius: size } = layout.moons[i];
      const orbit = moonOrbitLine(distance);
      carrier.add(orbit);
      orbitLines.set(moon.key, orbit);
      this.moonOrbits.push({ line: orbit, carrier, radius: distance });
      const moonCarrier = new THREE.Group();
      this.systemOrbits.addMoon(moon, planet.key, moonCarrier, distance,
        INNER_MOON_ORBIT_SECONDS * (moon.orbitalPeriodHours / innermost.orbitalPeriodHours), galaxySeed);
      const [r, g, b] = moon.world ? PLANET_COLORS[moon.world.type] : SMALL_MOON_COLOUR;
      const mesh = new THREE.Mesh(
        new THREE.SphereGeometry(size, SYSTEM_PLANET_SEGMENTS / 2, SYSTEM_PLANET_SEGMENTS / 4),
        new THREE.MeshStandardMaterial({ color: new THREE.Color(r, g, b), roughness: 0.9, metalness: 0 }),
      );
      moonCarrier.add(mesh);
      // Every moon can be picked and focused; one too small to be a world selects its planet, naming the moon
      mesh.userData = moon.world ? { planetKey: moon.world.key } : { planetKey: moon.key, moonOf: planet.key, moonIndex: moon.moonIndex };
      markers.set(moon.key, mesh);
    });
  }

  exitSystemView() {
    this.leaveBlackHole();
    this.closePlanetView();
    this.systemGlobes.stop();
    this.hidePlanetLabel();
    this.planetLabels = new Map();
    this.mode = "galaxy";
    this.lastReportedScale = 0;
    this.applyMarkerVisibility();
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
    this.focusedPlanetKey = null;
    this.controls.minDistance = DEFAULT_DISTANCE.min;
    this.systemMarkers = new Map();
    this.orbitLines = new Map();
    this.moonOrbits = [];
    this.systemOrbits = new SystemOrbits();
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
    const marker = this.systemMarkers.get(planet.key);
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
    this.controls.minDistance = this.focusMinDistance();
    this.controls.autoRotate      = true;
    this.controls.autoRotateSpeed = SYSTEM_AUTO_ROTATE_SPEED;
  }

  // ── System view: focus on a planet ────────────────────────────────────────

  /**
   * Glides the system view's camera to frame a planet, then keeps it on the
   * planet as it orbits, circling it; null glides back to the whole system.
   * Does nothing outside the system view, during an approach, or if already there.
   */
  focusPlanet(planet: Planet | null, smallMoonIndex: number | null = null) {
    if (this.mode !== "system" || !this.systemHostStar || this.tween?.onDone) return;
    // A moon too small to be a world is focused by its own key (MO6 moon keys)
    const key = planet && smallMoonIndex !== null ? moonKey(planet.hostStarId, planet.id, smallMoonIndex) : planet?.key ?? null;
    if (key === this.focusedPlanetKey) return;
    const marker = key !== null ? this.systemMarkers.get(key) : undefined;
    if (key !== null && !marker) return;
    // The focused body's orbit is drawn in the selection colour
    if (this.focusedPlanetKey !== null) { const line = this.orbitLines.get(this.focusedPlanetKey); if (line) markOrbit(line, false); }
    if (key !== null) { const line = this.orbitLines.get(key); if (line) markOrbit(line, true); }
    this.focusedPlanetKey = key;

    // Keep the direction the camera looks from; only the distance and the point it circles change
    const fromTarget = this.camera.position.clone().sub(this.controls.target).normalize();
    const to = marker
      ? marker.getWorldPosition(new THREE.Vector3())
      : new THREE.Vector3(...this.systemHostStar.position);
    const distance = marker
      ? this.focusDistance(marker.geometry.parameters.radius, FOCUS_FRAME_RADII)
      : SYSTEM_CAMERA_OFFSET.length() * this.systemScale;
    this.controls.minDistance = this.focusMinDistance();
    // The planets wait while the camera glides (see the render loop), so the glide ends on the planet
    this.tween = {
      from: this.controls.target.clone(), to, t: 0,
      camera: { from: this.camera.position.clone(), to: to.clone().addScaledVector(fromTarget, distance) },
    };
  }

  /** How far from a body of this radius the camera sits at this many of its radii, kept clear of the near plane. */
  private focusDistance(radius: number, radii: number): number {
    return Math.max(radius * radii, radius + FOCUS_NEAR_CLEARANCE * this.camera.near);
  }

  /** How close the camera may come: to a focused planet, FOCUS_MIN_RADII of its radii. */
  private focusMinDistance(): number {
    const marker = this.focusedPlanetKey !== null ? this.systemMarkers.get(this.focusedPlanetKey) : undefined;
    return marker ? this.focusDistance(marker.geometry.parameters.radius, FOCUS_MIN_RADII) : DEFAULT_DISTANCE.min;
  }

  /** Moves the camera with the focused planet, keeping its place relative to it. */
  private followFocusedPlanet() {
    const marker = this.focusedPlanetKey !== null ? this.systemMarkers.get(this.focusedPlanetKey) : undefined;
    if (!marker || this.mode !== "system" || this.tween) return;
    const shift = marker.getWorldPosition(new THREE.Vector3()).sub(this.controls.target);
    this.controls.target.add(shift);
    this.camera.position.add(shift);
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

  /** Put the camera back where every galaxy starts, so a new one is seen whole whatever the last was zoomed to. */
  private resetGalaxyCamera() {
    this.tween = null;
    this.camera.position.copy(GALAXY_START_POSITION);
    this.controls.target.set(0, 0, 0);
    this.controls.autoRotate = true;
    this.controls.update();
  }

  // ── Star highlight ────────────────────────────────────────────────────────

  // A thin square frame drawn at constant screen size, like a telescope's target marker.
  private highlightStar(star: Star | null) {
    this.highlightAt(star?.position ?? null);
  }

  /** Put the selection reticle on a point of the galaxy, or remove it. */
  private highlightAt(position: readonly [number, number, number] | null) {
    this.clearMesh("highlightMesh");
    if (!position) return;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(position), 3));
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

  private onPointerDown = (e: PointerEvent) => {
    this.pressedAt = { x: e.clientX, y: e.clientY };
  };

  private onClick = (e: MouseEvent) => {
    // The end of a drag that turned the view is not a click
    const pressed = this.pressedAt;
    this.pressedAt = null;
    if (pressed && Math.hypot(e.clientX - pressed.x, e.clientY - pressed.y) > CLICK_SLOP_PX) return;
    const canvas = this.renderer.domElement;
    const rect   = canvas.getBoundingClientRect();
    const ndc    = new THREE.Vector2(
      ((e.clientX - rect.left) / rect.width)  *  2 - 1,
      ((e.clientY - rect.top)  / rect.height) * -2 + 1,
    );
    this.raycaster.setFromCamera(ndc, this.camera);

    if (this.mode === "planet" || this.mode === "blackHole") return;
    if (this.mode === "system" && this.systemGroup) {
      const hit = this.planetMeshAt(ndc);
      if (hit?.userData.moonOf) {
        const planet = this.planetData.find(p => p.key === hit.userData.moonOf) ?? null;
        this.onPlanetSelected?.(planet, hit.userData.moonIndex as number);
        return;
      }
      const key = hit ? hit.userData.planetKey as string : null;
      this.onPlanetSelected?.(key !== null ? this.planetData.find(p => p.key === key) ?? null : null);
      return;
    }

    if (this.blackHoleAt(e.clientX - rect.left, e.clientY - rect.top)) {
      this.selectBlackHole();
      return;
    }
    if (!this.starMesh || this.starData.length === 0) return;
    this.raycaster.params.Points = { threshold: 3 };
    const picked = nearestStarOnScreen(this.raycaster.intersectObject(this.starMesh));
    if (picked !== null) {
      this.selectStar(this.starData[picked]);
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
    return hit ? this.planetData.find(p => p.key === hit.userData.planetKey) ?? null : null;
  }

  private pointerNdc(e: MouseEvent): THREE.Vector2 {
    const rect = this.renderer.domElement.getBoundingClientRect();
    return new THREE.Vector2(
      ((e.clientX - rect.left) / rect.width)  *  2 - 1,
      ((e.clientY - rect.top)  / rect.height) * -2 + 1,
    );
  }

  /**
   * The system view's body under a point on screen (normalized device coordinates), if any: the one
   * whose drawn sphere, widened to at least PICK_RADIUS_PX, holds the point, nearest its centre.
   * Measured on screen, so a moon a few pixels wide is as easy to pick as a planet.
   */
  private planetMeshAt(ndc: THREE.Vector2): THREE.Object3D | null {
    if (!this.systemGroup) return null;
    const { width, height } = this.renderer.domElement.getBoundingClientRect();
    const pxPerUnitAt1 = height / (2 * Math.tan(THREE.MathUtils.degToRad(this.camera.fov) / 2));
    const centre = new THREE.Vector3();
    let best: THREE.Object3D | null = null;
    let bestScore = Infinity;
    for (const marker of this.systemMarkers.values()) {
      marker.getWorldPosition(centre);
      const distance = centre.distanceTo(this.camera.position);
      const projected = centre.project(this.camera);
      if (projected.z > 1) continue;   // behind the camera
      const dx = (projected.x - ndc.x) * width / 2;
      const dy = (projected.y - ndc.y) * height / 2;
      const offPx = Math.hypot(dx, dy);
      const radiusPx = Math.max(PICK_RADIUS_PX, (marker.geometry.parameters.radius / distance) * pxPerUnitAt1);
      if (offPx > radiusPx) continue;
      // Nearest centre wins, as a share of the target's size, so a moon in front of its planet can be picked
      const score = offPx / radiusPx;
      if (score < bestScore) {
        bestScore = score;
        best = marker;
      }
    }
    return best;
  }

  /** Fades moons' orbits in as they grow on screen, so a far planet is not ringed with smudges. */
  private fadeMoonOrbits() {
    if (this.moonOrbits.length === 0) return;
    const pxPerUnitAt1 = this.renderer.domElement.clientHeight / (2 * Math.tan(THREE.MathUtils.degToRad(this.camera.fov) / 2));
    const centre = new THREE.Vector3();
    for (const { line, carrier, radius } of this.moonOrbits) {
      const distance = carrier.getWorldPosition(centre).distanceTo(this.camera.position);
      fadeMoonOrbit(line, moonOrbitVisibility((radius / distance) * pxPerUnitAt1));
    }
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
    const key = mesh ? mesh.userData.planetKey as string : null;
    const text = key !== null ? this.planetLabels.get(key) : undefined;
    if (!mesh || text === undefined) {
      this.hidePlanetLabel();
      return;
    }
    if (key !== this.hoveredPlanetKey) {
      this.hidePlanetLabel();
      const element = document.createElement("div");
      element.className = "planet-label";
      element.textContent = text;
      const anchor = document.createElement("div");   // CSS2DRenderer owns this element's transform
      anchor.className = "planet-label-anchor";
      anchor.append(element);
      this.planetLabel = new CSS2DObject(anchor);
      this.scene.add(this.planetLabel);
      this.hoveredPlanetKey = key;
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
    this.hoveredPlanetKey = null;
  }

  /** Selects a star from outside the view (the star search): as a click on it does, in the galaxy view. */
  showStar(star: Star) {
    if (this.mode !== "galaxy") return;
    this.selectStar(star);
  }

  private selectStar(star: Star) {
    this.onStarSelected?.(star);
    this.highlightStar(star);
    this.tweenCameraTo(new THREE.Vector3(...star.position));
    this.controls.autoRotate = false;
  }

  // ── Central black hole ────────────────────────────────────────────────────

  /** The galaxy's central black hole, or none; a click on the galaxy's centre selects it and calls onSelected. */
  setCentralBlackHole(blackHole: CentralBlackHole | null, galaxySeed: number, galaxyType: GalaxyType, onSelected: () => void) {
    this.leaveBlackHole();
    this.onBlackHoleSelected = onSelected;
    this.blackHole = blackHole;
    this.blackHoleSeed = galaxySeed;
    this.blackHoleGalaxyType = galaxyType;
  }

  /** Go from the galaxy view to the close-up of its central black hole. */
  approachBlackHole() {
    if (this.mode !== "galaxy" || !this.blackHole) return;
    this.galaxyCameraPose = { position: this.camera.position.clone(), target: this.controls.target.clone() };
    this.tween = null;
    this.blackHoleView = new BlackHoleView(this.blackHole, this.blackHoleSeed, this.blackHoleGalaxyType, !prefersReducedMotion(), performance.now(), this.blackHoleQuality);
    this.mode = "blackHole";
    this.lastReportedScale = 0;
    this.applyMarkerVisibility();

    const elevation = THREE.MathUtils.degToRad(START_ELEVATION_DEG);
    this.controls.target.set(0, 0, 0);
    this.camera.position.set(0, Math.sin(elevation), Math.cos(elevation)).multiplyScalar(BLACK_HOLE_DISTANCE.start);
    this.controls.minDistance = BLACK_HOLE_DISTANCE.min;
    this.controls.maxDistance = BLACK_HOLE_DISTANCE.max;
    this.controls.autoRotate = false;
  }

  /** How finely the close-up is traced (blackHole/quality.ts), now and from the next approach. */
  setBlackHoleQuality(level: BlackHoleQualityLevel) {
    this.blackHoleQuality = level;
    this.blackHoleView?.setQuality(level);
  }

  /** What the close-up is doing, or null outside it. */
  blackHoleStats(): BlackHoleStats | null {
    return this.blackHoleView?.stats ?? null;
  }

  /** Back from the black hole's close-up to the galaxy view, where it was left; nothing outside the close-up. */
  leaveBlackHole() {
    if (!this.blackHoleView) return;
    this.blackHoleView.dispose();
    this.blackHoleView = null;
    this.mode = "galaxy";
    this.lastReportedScale = 0;
    this.controls.minDistance = DEFAULT_DISTANCE.min;
    this.controls.maxDistance = DEFAULT_DISTANCE.max;
    if (this.galaxyCameraPose) {
      this.camera.position.copy(this.galaxyCameraPose.position);
      this.controls.target.copy(this.galaxyCameraPose.target);
      this.galaxyCameraPose = null;
    }
    this.applyMarkerVisibility();
  }

  /** Whether a point on the canvas, in CSS pixels, falls on the galaxy's centre, where its black hole is. */
  private blackHoleAt(x: number, y: number): boolean {
    if (!this.blackHole) return false;
    const centre = new THREE.Vector3(0, 0, 0).project(this.camera);
    if (centre.z < -1 || centre.z > 1) return false;
    const { clientWidth, clientHeight } = this.renderer.domElement;
    return Math.hypot((centre.x + 1) / 2 * clientWidth - x, (1 - centre.y) / 2 * clientHeight - y) <= BLACK_HOLE_PICK_RADIUS_PX;
  }

  private selectBlackHole() {
    this.onBlackHoleSelected?.();
    this.highlightAt([0, 0, 0]);
    this.tweenCameraTo(new THREE.Vector3(0, 0, 0));
    this.controls.autoRotate = false;
  }

  // ── Life and civilization markers ─────────────────────────────────────────

  /** Replace the systems marked with life. Call after renderStars, with markers for that population. */
  setLifeMarkers(markers: LifeMarker[]) {
    this.lifeRingTexture ??= makeLifeRingTexture();
    this.setMarkers("life", markers, this.lifeRingTexture, LIFE_RING_SIZE_PX, () => null, "life-bubble");
  }

  /** Replace the systems marked with civilizations. Call after renderStars, with markers for that population. */
  setCivilizationMarkers(markers: CivilizationMarker[]) {
    this.civilizationRingTexture ??= makeCivilizationRingTexture();
    const ruinsOf = new Map(markers.map(m => [m.starId, m.ruins]));
    this.setMarkers("civilization", markers, this.civilizationRingTexture, CIVILIZATION_RING_SIZE_PX,
      starId => (ruinsOf.get(starId) ? RUINS_RING_COLOUR : CIVILIZATION_RING_COLOUR),
      starId => `life-bubble civ-bubble${ruinsOf.get(starId) ? " ruins" : ""}`);
  }

  setLifeMarkersVisible(on: boolean) {
    this.markersOn.life = on;
    this.applyMarkerVisibility();
  }

  setCivilizationMarkersVisible(on: boolean) {
    this.markersOn.civilization = on;
    this.applyMarkerVisibility();
  }

  /** Build one kind's rings and bubbles; a ring colour tints that kind's texture, or none leaves it as drawn. */
  private setMarkers(
    kind: MarkerKind, markers: LifeMarker[], texture: THREE.CanvasTexture, sizePx: number,
    ringColour: (starId: number) => THREE.Color | null, bubbleClass: string | ((starId: number) => string),
  ) {
    this.clearMarkers(kind);
    const starsById = new Map(this.starData.map(star => [star.id, star]));
    const marked = markers.flatMap(m => {
      const star = starsById.get(m.starId);
      return star ? [{ star, label: m.label }] : [];
    });
    if (marked.length === 0) return;

    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(marked.flatMap(m => m.star.position)), 3));
    const colours = marked.map(m => ringColour(m.star.id));
    const tinted = colours.every(c => c !== null);
    if (tinted) geo.setAttribute("color", new THREE.BufferAttribute(new Float32Array(colours.flatMap(c => c!.toArray())), 3));
    const mat = new THREE.PointsMaterial({
      map: texture, size: sizePx, sizeAttenuation: false, vertexColors: tinted,
      transparent: true, depthWrite: false, toneMapped: false,
    });
    const rings = new THREE.Points(geo, mat);
    rings.renderOrder = 5;
    this.scene.add(rings);

    const labels = new THREE.Group();
    for (const { star, label } of marked) {
      const bubble = document.createElement("button");
      bubble.type = "button";
      bubble.className = typeof bubbleClass === "string" ? bubbleClass : bubbleClass(star.id);
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
      labels.add(object);
    }
    this.scene.add(labels);

    this.markerLayers[kind] = { rings, labels };
    this.applyMarkerVisibility();
  }

  private applyMarkerVisibility() {
    for (const kind of ["life", "civilization"] as const) {
      const layer = this.markerLayers[kind];
      if (!layer) continue;
      const show = this.markersOn[kind] && this.mode === "galaxy";
      layer.rings.visible  = show;
      layer.labels.visible = show;
    }
    this.labelsDirty = true;
  }

  /** Remove one kind of marker, or both. */
  private clearMarkers(kind?: MarkerKind) {
    for (const k of kind ? [kind] : (["life", "civilization"] as const)) {
      const layer = this.markerLayers[k];
      if (!layer) continue;
      this.scene.remove(layer.rings);
      layer.rings.geometry.dispose();
      (layer.rings.material as THREE.Material).dispose();
      this.scene.remove(layer.labels);
      for (const object of layer.labels.children) (object as CSS2DObject).element.remove();
      this.markerLayers[k] = null;
    }
  }

  /**
   * Give bubbles to every on-screen civilization, then to the on-screen life systems nearest
   * the camera, skipping any bubble that would overlap one already placed. Recomputed only
   * when the camera moves.
   */
  private updateMarkerLabels() {
    const layers = (["civilization", "life"] as const)
      .map(kind => ({ kind, layer: this.markerLayers[kind] }))
      .filter(({ layer }) => layer?.labels.visible);
    if (layers.length === 0) return;
    const cam = this.lastLabelCamera;
    if (!this.labelsDirty && cam.position.equals(this.camera.position) && cam.quaternion.equals(this.camera.quaternion)) return;
    cam.position.copy(this.camera.position);
    cam.quaternion.copy(this.camera.quaternion);
    this.labelsDirty = false;

    this.camera.updateMatrixWorld();
    const projected = new THREE.Vector3();
    const { clientWidth, clientHeight } = this.renderer.domElement;
    type Box = { left: number; right: number; top: number; bottom: number };
    const placed: Box[] = [];
    for (const { kind, layer } of layers) {
      const onScreen: { object: CSS2DObject; distance: number; box: Box }[] = [];
      for (const child of layer!.labels.children) {
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

      const limit = kind === "life" ? placed.length + LABELLED_MARKER_LIMIT : Infinity;
      for (const { object, box } of onScreen) {
        if (placed.length >= limit) break;
        const overlaps = placed.some(p => box.left < p.right && box.right > p.left && box.top < p.bottom && box.bottom > p.top);
        if (overlaps) continue;
        placed.push(box);
        object.visible = true;
      }
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

  /**
   * Stops the render loop while something covers the whole view (the Physics page), and starts it
   * again after: rendering nothing visible would only take time from the page. The scene is kept.
   */
  setPaused(paused: boolean) {
    if (paused === this.paused) return;
    this.paused = paused;
    if (paused) {
      cancelAnimationFrame(this.animFrameId);
    } else {
      this.lastFrameMs = performance.now();   // the pause is not time the planets went round
      this.startLoop();
    }
  }

  private startLoop() {
    const tick = () => {
      this.animFrameId = requestAnimationFrame(tick);
      const now = performance.now();
      // The frame's duration, for the planets' orbits and the views' slow turns, which go by time, not frames;
      // a long gap (a hidden tab) counts as one ordinary frame
      const frameSeconds = Math.min(now - this.lastFrameMs, MAX_ORBIT_STEP_MS) / 1000;
      this.lastFrameMs = now;
      // Planets go round while the system view is shown and the camera is not gliding (never under reduced motion)
      if (this.mode === "system" && this.orbitsMove && !this.tween?.camera) {
        this.systemOrbits.advance(frameSeconds);
      }
      this.followFocusedPlanet();
      if (this.pendingBake) {
        this.pendingBake.step(this.renderer);
        if (this.pendingBake.done) this.pendingBake = null;
      } else if (this.mode === "system") {
        this.systemGlobes.update(this.renderer, performance.now());   // the approach's bake goes first
      }
      if (this.mode === "system") {
        this.systemGlobes.spin(performance.now());
        this.fadeMoonOrbits();
      }
      this.stepTween();
      this.controls.update(frameSeconds);

      this.reportViewScale();

      this.sky.follow(this.camera);
      if (this.mode === "planet" && this.planetView) {
        this.planetView.update(performance.now());
        this.renderer.render(this.planetView.scene, this.camera);
      } else if (this.mode === "blackHole" && this.blackHoleView) {
        this.blackHoleView.render(this.renderer, this.camera, performance.now());
      } else {
        this.renderer.render(this.scene, this.camera);
      }
      this.updateMarkerLabels();
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
      : this.blackHoleView
        ? { mode: "blackHole", unitsPerPixel, kmPerUnit: this.blackHoleView.kmPerUnit }
        : { mode: this.mode, unitsPerPixel });
  }

  private onResize = () => {
    const canvas = this.renderer.domElement;
    if (canvas.clientWidth === 0 || canvas.clientHeight === 0) return;   // hidden: keep the last size
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
    this.renderer.domElement.removeEventListener("pointerdown", this.onPointerDown);
    this.renderer.domElement.removeEventListener("pointermove", this.onPointerMove);
    this.renderer.domElement.removeEventListener("pointerleave", this.onPointerLeave);
    this.hidePlanetLabel();
    this.closePlanetView();
    this.globeTextures.clear();
    this.systemGlobes.clear();
    this.resizeObserver.disconnect();

    // ENH-512: dispose all resources
    this.starSprite?.dispose();
    this.reticleTexture?.dispose();
    this.clearMarkers();
    this.lifeRingTexture?.dispose();
    this.civilizationRingTexture?.dispose();
    this.leaveBlackHole();
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
