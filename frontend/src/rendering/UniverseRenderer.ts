import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type { GalaxyParticles } from "../simulation/galaxy";
import type { Star, StellarPopulation } from "../simulation/star";
import { temperatureToColor } from "../simulation/star";
import type { Planet, PlanetarySystem } from "../simulation/planet";
import { PLANET_COLORS } from "../simulation/planet";
import type { Biosphere } from "../simulation/biosphere";

// ── Visual seeded PRNG (ENH-506) ──────────────────────────────────────────────
// Used for background starfield and nebula — purely visual, does not affect
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

/** How large one screen pixel is at the orbit target, in scene units, and which view it applies to. */
export interface ViewScale {
  mode: "galaxy" | "system";
  unitsPerPixel: number;
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
  private starfieldLayers: THREE.Points[]      = [];

  private starSprite:   THREE.CanvasTexture  | null = null;   // ENH-512: reuse texture
  private reticleTexture: THREE.CanvasTexture | null = null;

  private onViewScale: ((scale: ViewScale) => void) | null = null;
  private lastReportedScale = 0;

  private raycaster  = new THREE.Raycaster();
  private starData:   Star[]   = [];
  private planetData: Planet[] = [];
  private onStarSelected:   ((star: Star | null)     => void) | null = null;
  private onPlanetSelected: ((planet: Planet | null) => void) | null = null;

  private tween: { from: THREE.Vector3; to: THREE.Vector3; t: number } | null = null;
  private mode: "galaxy" | "system" = "galaxy";

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

    this.buildStarfield();
    this.startLoop();

    canvas.addEventListener("click", this.onClick);
    window.addEventListener("resize", this.onResize);
  }

  // ── ENH-506: 4-layer seeded background starfield ──────────────────────────

  private buildStarfield() {
    // Fixed visual seed — background is invariant across universes
    const rng = mulberry32(0xF7D3A291);
    const tex  = this.starSprite!;

    type LayerDef = {
      count: number; rMin: number; rMax: number;
      size: number; opacity: number;
      tint: "white" | "blue" | "mixed";
    };

    const layers: LayerDef[] = [
      { count: 4000, rMin: 3000, rMax: 5500, size: 0.7,  opacity: 0.28, tint: "white" },
      { count: 1800, rMin: 2500, rMax: 4500, size: 1.2,  opacity: 0.44, tint: "blue"  },
      { count:  360, rMin: 2000, rMax: 4000, size: 2.1,  opacity: 0.65, tint: "white" },
      { count:   55, rMin: 2000, rMax: 4500, size: 3.4,  opacity: 0.88, tint: "mixed" },
    ];

    for (const layer of layers) {
      const pos = new Float32Array(layer.count * 3);
      const col = new Float32Array(layer.count * 3);

      for (let i = 0; i < layer.count; i++) {
        const theta = rng() * Math.PI * 2;
        const phi   = Math.acos(2 * rng() - 1);
        const r     = layer.rMin + rng() * (layer.rMax - layer.rMin);
        pos[i * 3]     = r * Math.sin(phi) * Math.cos(theta);
        pos[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
        pos[i * 3 + 2] = r * Math.cos(phi);

        if (layer.tint === "blue") {
          col[i * 3]     = 0.72 + rng() * 0.18;
          col[i * 3 + 1] = 0.84 + rng() * 0.12;
          col[i * 3 + 2] = 1.0;
        } else if (layer.tint === "mixed") {
          if (rng() > 0.5) {
            // warm highlight
            col[i * 3] = 1.0; col[i * 3 + 1] = 0.85 + rng() * 0.1; col[i * 3 + 2] = 0.6 + rng() * 0.2;
          } else {
            // cool highlight
            col[i * 3] = 0.65 + rng() * 0.2; col[i * 3 + 1] = 0.85 + rng() * 0.1; col[i * 3 + 2] = 1.0;
          }
        } else {
          const v = 0.82 + rng() * 0.18;
          col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = v;
        }
      }

      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
      geo.setAttribute("color",    new THREE.BufferAttribute(col, 3));

      const mat = new THREE.PointsMaterial({
        map: tex, size: layer.size, sizeAttenuation: true,
        transparent: true, opacity: layer.opacity,
        depthWrite: false, blending: THREE.AdditiveBlending,
        vertexColors: true, alphaTest: 0.001,
      });

      const points = new THREE.Points(geo, mat);
      this.starfieldLayers.push(points);
      this.scene.add(points);
    }
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
  }

  // ── Stellar population (ENH-502–509) ─────────────────────────────────────

  renderStars(population: StellarPopulation, onSelected: (star: Star | null) => void) {
    this.onStarSelected = onSelected;
    this.starData = population.stars;

    this.clearMesh("starMesh");
    this.clearMesh("highlightMesh");

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
    biospheres: Map<number, Biosphere> = new Map()
  ) {
    this.onPlanetSelected = onPlanetSelected;
    this.planetData = system.planets;
    this.mode = "system";
    this.lastReportedScale = 0;

    if (this.galaxyMesh)    this.galaxyMesh.visible    = false;
    if (this.starMesh)      this.starMesh.visible      = false;
    if (this.highlightMesh) this.highlightMesh.visible = false;
    if (this.nebulaGroup)   this.nebulaGroup.visible   = false;

    if (this.systemGroup) {
      this.scene.remove(this.systemGroup);
      this.systemGroup.traverse(obj => {
        if ((obj as THREE.Mesh).geometry) (obj as THREE.Mesh).geometry.dispose();
        if ((obj as THREE.Mesh).material) ((obj as THREE.Mesh).material as THREE.Material).dispose();
      });
    }

    const group = new THREE.Group();

    const [sr, sg, sb] = temperatureToColor(hostStar.temperature);
    const starCol = new THREE.Color(sr, sg, sb);

    // Host star
    const starGeo = new THREE.SphereGeometry(0.12, 16, 16);
    const starMat = new THREE.MeshBasicMaterial({ color: starCol });
    group.add(new THREE.Mesh(starGeo, starMat));

    // Star glow
    const glowGeo = new THREE.SphereGeometry(0.26, 16, 16);
    const glowMat = new THREE.MeshBasicMaterial({ color: starCol, transparent: true, opacity: 0.14 });
    group.add(new THREE.Mesh(glowGeo, glowMat));

    for (const planet of system.planets) {
      const orbitR = planet.orbitalRadius * SYSTEM_UNITS_PER_AU;

      const ringGeo = new THREE.RingGeometry(orbitR - 0.005, orbitR + 0.005, 128);
      const ringMat = new THREE.MeshBasicMaterial({
        color: 0x4a525d, transparent: true, opacity: 0.45, side: THREE.DoubleSide,
      });
      const ring = new THREE.Mesh(ringGeo, ringMat);
      ring.rotation.x = Math.PI / 2;
      group.add(ring);

      const [pr, pg, pb] = PLANET_COLORS[planet.type];
      const pSize = Math.max(0.025, Math.min(0.09, planet.size * 0.035));
      const pGeo  = new THREE.SphereGeometry(pSize, 12, 12);
      const pMat  = new THREE.MeshBasicMaterial({ color: new THREE.Color(pr, pg, pb) });
      const pMesh = new THREE.Mesh(pGeo, pMat);
      pMesh.position.set(orbitR, 0, 0);
      pMesh.userData = { planetId: planet.id };
      group.add(pMesh);

      // Life marker: a thin ring around the planet, stronger for more complex life
      const bio = biospheres.get(planet.id);
      if (bio?.hasLife) {
        const markerR = pSize * 2.2;
        const lifeGeo = new THREE.RingGeometry(markerR, markerR + 0.008, 48);
        const lifeMat = new THREE.MeshBasicMaterial({
          color: 0x6fc49a, transparent: true, opacity: 0.35 + bio.complexity * 0.45, side: THREE.DoubleSide,
        });
        const lifeMesh = new THREE.Mesh(lifeGeo, lifeMat);
        lifeMesh.rotation.x = Math.PI / 2;
        lifeMesh.position.copy(pMesh.position);
        group.add(lifeMesh);
      }
    }

    group.position.set(...hostStar.position);
    this.systemGroup = group;
    this.scene.add(group);

    const starPos = new THREE.Vector3(...hostStar.position);
    this.tween = null;   // a galaxy-view camera glide must not keep steering the system view
    this.controls.target.copy(starPos);
    this.camera.position.copy(starPos.clone().add(new THREE.Vector3(0, 2, 5)));
    this.controls.autoRotate      = true;
    this.controls.autoRotateSpeed = 0.4;
  }

  exitSystemView() {
    this.mode = "galaxy";
    this.lastReportedScale = 0;
    if (this.galaxyMesh)    this.galaxyMesh.visible    = true;
    if (this.starMesh)      this.starMesh.visible      = true;
    if (this.highlightMesh) this.highlightMesh.visible = true;
    if (this.nebulaGroup)   this.nebulaGroup.visible   = true;

    if (this.systemGroup) {
      this.scene.remove(this.systemGroup);
      this.systemGroup = null;
    }
    this.planetData = [];
    this.controls.autoRotate = false;
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
      const star = this.starData[hits[0].index!];
      this.onStarSelected?.(star);
      this.highlightStar(star);
      this.tweenCameraTo(new THREE.Vector3(...star.position));
      this.controls.autoRotate = false;
    } else {
      this.onStarSelected?.(null);
      this.highlightStar(null);
      this.controls.autoRotate = true;
    }
  };

  // ── ENH-510: cinematic camera tween (quintic ease-out) ───────────────────

  private tweenCameraTo(target: THREE.Vector3) {
    this.tween = { from: this.controls.target.clone(), to: target, t: 0 };
  }

  private stepTween() {
    if (!this.tween) return;
    this.tween.t += 0.038;
    const p     = Math.min(this.tween.t, 1);
    const eased = 1 - Math.pow(1 - p, 5);   // quintic ease-out
    this.controls.target.lerpVectors(this.tween.from, this.tween.to, eased);
    if (this.tween.t >= 1) this.tween = null;
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
      this.stepTween();
      this.controls.update();

      this.reportViewScale();

      this.renderer.render(this.scene, this.camera);
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
    const distance = this.camera.position.distanceTo(this.controls.target);
    const visibleHeight = 2 * distance * Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2));
    const unitsPerPixel = visibleHeight / canvasHeight;
    if (Math.abs(unitsPerPixel - this.lastReportedScale) / unitsPerPixel < 0.02) return;
    this.lastReportedScale = unitsPerPixel;
    this.onViewScale({ mode: this.mode, unitsPerPixel });
  }

  private onResize = () => {
    const canvas = this.renderer.domElement;
    this.camera.aspect = canvas.clientWidth / canvas.clientHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(canvas.clientWidth, canvas.clientHeight, false);
  };

  dispose() {
    cancelAnimationFrame(this.animFrameId);
    this.renderer.domElement.removeEventListener("click", this.onClick);
    window.removeEventListener("resize", this.onResize);

    // ENH-512: dispose all resources
    this.starSprite?.dispose();
    this.reticleTexture?.dispose();
    for (const layer of this.starfieldLayers) {
      this.scene.remove(layer);
      layer.geometry.dispose();
      (layer.material as THREE.Material).dispose();
    }
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
