// Draws a planet's ground around a camera (PLAN, PF3): patches chosen by the
// quadtree, built in workers, kept in a cache, placed relative to the camera.
//
// - Camera-relative drawing: the camera sits at the origin; each patch is
//   placed at its origin minus the camera's position, worked out in doubles, so
//   32-bit floats never hold numbers as large as the planet's radius.
// - A logarithmic depth buffer lets ground a metre away and mountains a
//   thousand kilometres away share it without flicker.
// - The sky and light (PF4, src/sky/): the sky drawn behind everything from
//   the sky table, which is rebuilt when the camera's height or the star's
//   height over it changes enough; the ground and water lit by the starlight
//   that gets through the air and by the sky's light, and hazed by the air
//   between them and the camera (shaders/ground.*.glsl, water.*.glsl, and
//   src/sky/shaders/atmosphere.glsl, which all three share).
// - Brightness (owner decisions): the star's light at the planet scales with
//   its flux, L★ / a²; the exposure adapts, as an eye does, to the light on
//   the ground under the camera, within limits (src/sky/exposure.ts), while
//   the sky and star keep their true proportions.
//   The sky table is built a few rows a frame (SKY_BUDGET_MS) while the star
//   or camera moves, showing the last whole table meanwhile.
// - Clouds (src/sky/clouds.ts, shaders/clouds.frag.glsl): a pass over the
//   whole screen after the ground, finding each pixel's view ray's meeting
//   with the cloud layer, and writing that depth so ground in front hides
//   them. They drift about the pole, CLOUD_SECONDS_PER_TURN a turn, except
//   for viewers who prefer reduced motion (presentation only, as Aion Forge's).
// - Ground: Lambert lighting of the vertex colours, and molten ground's glow.
// - Water: one material per patch (they share a program) for the patch's own origin.
// - Frame time: when frames take longer than SLOW_MS, patches split less
//   eagerly (the split factor shrinks to at least MIN_SPLIT); with headroom it
//   recovers. The frame time is counted over each second (frameMeter.ts):
//   every frame counts, however slow; a hidden tab's pause does not.
// Presentation only.

import * as THREE from "three";
import type { PlanetSpec } from "../spec/schema";
import type { Vec3 } from "../forge/icosphere";
import { createTerrain } from "../terrain/terrain";
import type { Terrain } from "../terrain/terrain";
import { directionOf } from "../terrain/landing";
import { ancestors, deepestLevel, keyText } from "./cubeSphere";
import { patchIndices } from "./patchBuilder";
import type { PatchData } from "./patchBuilder";
import { selectPatches } from "./quadtree";
import { PatchWorkers } from "./workerPool";
import { FrameMeter } from "./frameMeter";
import { DEEP_WATER, GLOW_COLOUR, SEA_ICE, SHALLOW_WATER } from "./palette";
import { airOf, MIE_ASYMMETRY } from "../sky/air";
import { groundAlbedo } from "../sky/groundAlbedo";
import type { Air } from "../sky/air";
import { emptySkyTable, fillSkyRows, LIGHT_SIZE, lightTable, SKY_COLUMNS, SKY_ROWS } from "../sky/scattering";
import { adaptation, lightOnGround } from "../sky/exposure";
import type { SkyTable } from "../sky/scattering";
import { CLOUD_ALBEDO, CLOUD_MAP_HEIGHT, CLOUD_MAP_WIDTH, cloudHeightM, cloudMap } from "../sky/clouds";
import { mix } from "../forge/random";
import { discAngularRadius, starColour, starDirection, starFlux } from "../sky/star";
import atmosphere from "../sky/shaders/atmosphere.glsl?raw";
import skyVertex from "../sky/shaders/sky.vert.glsl?raw";
import skyFragment from "../sky/shaders/sky.frag.glsl?raw";
import cloudsFragment from "../sky/shaders/clouds.frag.glsl?raw";
import groundVertex from "./shaders/ground.vert.glsl?raw";
import groundFragment from "./shaders/ground.frag.glsl?raw";
import waterVertex from "./shaders/water.vert.glsl?raw";
import waterFragment from "./shaders/water.frag.glsl?raw";

/** Finest spacing between vertices, m. */
const FINEST_SPACING_M = 1;
const SPLIT_FACTOR = 2;
const MIN_SPLIT = 0.75;
const SLOW_MS = 20;
const FAST_MS = 14;
/** Built patches kept for reuse. */
const CACHE_SIZE = 600;
/** Patches asked for at once; the rest wait for the next frame's selection. */
const MAX_REQUESTS = 64;
/** The ripples repeat over this distance in every direction, m (water.frag.glsl). */
const RIPPLE_REPEAT_M = 1000;
/** The star's light at the planet, before the air, where its flux is Earth's. */
const SUN_INTENSITY = 3;
/** The exposure in daylight (exposure.ts: DAYLIGHT), so a clear sky reads as a mid blue. */
const EARTH_EXPOSURE = 3;
/** Light where neither star nor sky reaches, until the night sky is drawn (later): dim even to an eye adapted to the dark (exposure.ts). */
const NIGHT_LIGHT = 0.001;
/** The star's disc is drawn at least this many pixels across, with the same total light. */
const MIN_DISC_PIXELS = 3;
/** The sky table is rebuilt when the camera's height changes by this share (or 1 m), or the star's height cosine by this much. */
const SKY_HEIGHT_SHARE = 0.01;
const SKY_SUN_COSINE = 0.002;
/** Time spent building the sky table in one frame, ms, once there is a table to show. */
const SKY_BUDGET_MS = 4;
/** Clouds turn once about the pole in this long, on screen (Aion Forge's drift). */
const CLOUD_SECONDS_PER_TURN = 900;
/** Margin on the planet's highest and lowest cells for the detail's relief, at 1 g, m. */
const RELIEF_MARGIN_M = 3000;
const FIELD_OF_VIEW_DEG = 60;
const DEGREE = Math.PI / 180;

export interface GroundView {
  latitudeDeg: number;
  longitudeDeg: number;
  /** Camera height above the ground, m. */
  heightM: number;
  /** Compass direction of view, degrees from north towards east; and up from level. */
  yawDeg: number;
  pitchDeg: number;
}

export interface GroundStats {
  patchesDrawn: number;
  patchesBuilding: number;
  /** Mean frame time over the last second, ms, and frames drawn in it per second. */
  frameMs: number;
  framesPerSecond: number;
  splitFactor: number;
  /** Ground height under the camera, m above sea level. */
  groundM: number;
  /** How far the exposure has adapted above daylight's (1 under the star overhead at Earth's flux). */
  exposure: number;
  /** Time the sky table last took to build, ms, and over how many frames. */
  skyMs: number;
  skyFrames: number;
}

interface CachedPatch {
  ground: THREE.Mesh;
  water: THREE.Mesh | null;
  origin: [number, number, number];
  lowestM: number;
  highestM: number;
  lastUsed: number;
}

export class GroundRenderer {
  readonly stats: GroundStats = { patchesDrawn: 0, patchesBuilding: 0, frameMs: 0, framesPerSecond: 0, splitFactor: SPLIT_FACTOR, groundM: 0, skyMs: 0, skyFrames: 0, exposure: 1 };
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private terrain: Terrain;
  private workers: PatchWorkers;
  private cache = new Map<string, CachedPatch>();
  private indices = new THREE.BufferAttribute(patchIndices(), 1);
  private groundMaterial: THREE.ShaderMaterial;
  private waterMaterial: THREE.ShaderMaterial;
  private skyMaterial: THREE.ShaderMaterial;
  private sky: THREE.Mesh;
  private air: Air;
  /** The uniforms of atmosphere.glsl, one set shared by the sky, ground and water. */
  private atmosphere: Record<string, THREE.IUniform>;
  private skyRayleigh: THREE.DataTexture;
  private skyMie: THREE.DataTexture;
  private skyMultiple: THREE.DataTexture;
  private skyLight: THREE.DataTexture;
  /** The light table's values (scattering.ts), and the star's light at the planet: for the exposure. */
  private skyLightValues: Float32Array;
  private irradiance: Vec3;
  /** The camera's radius and the star's height cosine the sky table shown was built for. */
  private skyBuiltFor: { r: number; sunMu: number } | null = null;
  /** A sky table being built, its next row, and the time and frames spent so far. */
  private skyBuilding: { table: SkyTable; row: number; ms: number; frames: number } | null = null;
  private clouds: THREE.Mesh | null = null;
  private cloudMaterial: THREE.ShaderMaterial | null = null;
  private cloudTexture: THREE.DataTexture | null = null;
  private reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
  private discRadius: number;
  private view: GroundView = { latitudeDeg: 0, longitudeDeg: 0, heightM: 2, yawDeg: 0, pitchDeg: 0 };
  private cameraM: Vec3 = [0, 0, 0];
  private deepest: number;
  private highestM: number;
  private lowestM: number;
  private frame = 0;
  private meter = new FrameMeter();
  private onVisibility = (): void => { if (document.hidden) this.meter.restart(); };
  private animation = 0;
  private start = performance.now();

  private canvas: HTMLCanvasElement;

  constructor(canvas: HTMLCanvasElement, spec: PlanetSpec) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, logarithmicDepthBuffer: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.setClearColor(0x000000);
    this.camera = new THREE.PerspectiveCamera(FIELD_OF_VIEW_DEG, 1, 0.5, 1e9);

    this.terrain = createTerrain(spec);
    const R = this.terrain.radiusM;
    this.deepest = deepestLevel(R, FINEST_SPACING_M);
    const heights = spec.surface.cells.map((c) => (c[3] - spec.surface.seaLevelKm) * 1000);
    const margin = RELIEF_MARGIN_M / spec.body.gravityG;
    this.highestM = Math.max(...heights) + margin;
    this.lowestM = Math.min(...heights) - margin;

    this.air = airOf(spec, groundAlbedo(spec));
    const flux = starFlux(spec);
    const irradiance = starColour(spec.star.temperatureK).map((c) => c * SUN_INTENSITY * flux) as Vec3;
    this.discRadius = discAngularRadius(spec);
    this.skyRayleigh = halfFloatTexture(SKY_COLUMNS, SKY_ROWS);
    this.skyMie = halfFloatTexture(SKY_COLUMNS, SKY_ROWS);
    this.skyMultiple = halfFloatTexture(SKY_COLUMNS, SKY_ROWS);
    this.skyLight = halfFloatTexture(LIGHT_SIZE, 1);
    this.irradiance = irradiance;
    this.skyLightValues = lightTable(this.air, irradiance);
    fillTexture(this.skyLight, this.skyLightValues);
    this.atmosphere = {
      planetRadius: { value: this.air.radiusM },
      rayleighScattering: { value: new THREE.Vector3(...this.air.rayleigh) },
      rayleighHeight: { value: this.air.rayleighHeightM },
      mieScattering: { value: this.air.mie },
      mieHeight: { value: this.air.mieHeightM },
      mieAsymmetry: { value: MIE_ASYMMETRY },
      cameraBody: { value: new THREE.Vector3() },
      cameraUp: { value: new THREE.Vector3(0, 1, 0) },
      sunDirection: { value: new THREE.Vector3(...starDirection(spec)) },
      sunIrradiance: { value: new THREE.Vector3(...irradiance) },
      skyRayleigh: { value: this.skyRayleigh },
      skyMie: { value: this.skyMie },
      skyMultiple: { value: this.skyMultiple },
      skySize: { value: new THREE.Vector2(SKY_COLUMNS, SKY_ROWS) },
      skyHorizon: { value: Math.PI / 2 },
      skyLight: { value: this.skyLight },
      skyLightSize: { value: LIGHT_SIZE },
      nightLight: { value: NIGHT_LIGHT },
    };

    this.skyMaterial = new THREE.ShaderMaterial({
      vertexShader: skyVertex,
      fragmentShader: atmosphere + skyFragment,
      depthTest: false,
      depthWrite: false,
      uniforms: {
        ...this.atmosphere,
        screenToWorld: { value: new THREE.Matrix4() },
        discRadius: { value: this.discRadius },
        pixelAngle: { value: 0.001 },
      },
    });
    this.sky = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.skyMaterial);
    this.sky.frustumCulled = false;
    this.sky.renderOrder = -1;
    this.scene.add(this.sky);

    if (spec.air.cloudCover > 0) {
      this.cloudTexture = halfFloatTexture(CLOUD_MAP_WIDTH, CLOUD_MAP_HEIGHT);
      this.cloudTexture.wrapS = THREE.RepeatWrapping;
      const margins = cloudMap(spec);
      const rgba = new Float32Array(margins.length * 4);
      for (let k = 0; k < margins.length; k++) rgba[k * 4] = margins[k];
      fillTexture(this.cloudTexture, rgba);
      // The detail noise's offset, from the seed: integer hashing, so the same in every browser
      const offset = [1, 2, 3].map((k) => ((mix((spec.seed ^ Math.imul(k, 0x9e3779b9)) | 0) >>> 0) % 1000));
      this.cloudMaterial = new THREE.ShaderMaterial({
        vertexShader: skyVertex,
        fragmentShader: atmosphere + cloudsFragment,
        transparent: true,
        depthWrite: false,
        uniforms: {
          ...this.atmosphere,
          screenToWorld: this.skyMaterial.uniforms.screenToWorld,
          cloudMap: { value: this.cloudTexture },
          cloudRadius: { value: this.air.radiusM + cloudHeightM(this.air) },
          cloudTurn: { value: 0 },
          cloudOffset: { value: new THREE.Vector3(...offset) },
          cloudAlbedo: { value: CLOUD_ALBEDO },
          cameraForward: { value: new THREE.Vector3() },
        },
      });
      this.clouds = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.cloudMaterial);
      this.clouds.frustumCulled = false;
      this.clouds.renderOrder = 10;
      this.scene.add(this.clouds);
    }

    // Front faces only: the skirts face outwards from their patch, which is the side a crack shows them from;
    // drawn double-sided, their back faces took flipped normals and showed as dark dotted lines
    this.groundMaterial = new THREE.ShaderMaterial({
      vertexShader: atmosphere + groundVertex,
      fragmentShader: atmosphere + groundFragment,
      vertexColors: true,
      uniforms: { ...this.atmosphere, glowColour: { value: new THREE.Color(...GLOW_COLOUR) } },
    });

    this.waterMaterial = new THREE.ShaderMaterial({
      vertexShader: atmosphere + waterVertex,
      fragmentShader: atmosphere + waterFragment,
      uniforms: {
        ...this.atmosphere,
        origin: { value: new THREE.Vector3() },
        rippleOrigin: { value: new THREE.Vector3() },
        shallowColour: { value: new THREE.Color(...SHALLOW_WATER) },
        deepColour: { value: new THREE.Color(...DEEP_WATER) },
        seaIceColour: { value: new THREE.Color(...SEA_ICE) },
        time: { value: 0 },
      },
    });

    this.workers = new PatchWorkers(spec, (patch) => this.addPatch(patch));
    this.resize();
    document.addEventListener("visibilitychange", this.onVisibility);
    this.animation = requestAnimationFrame(this.loop);
  }

  setView(view: GroundView): void {
    this.view = view;
  }

  /** Moves the star to this direction in the body frame (the viewer's sun control; PF4b brings the time of day). */
  setSunDirection(direction: Vec3): void {
    (this.atmosphere.sunDirection.value as THREE.Vector3).set(...direction);
  }

  resize(): void {
    const { clientWidth: width, clientHeight: height } = this.canvas;
    if (width === 0 || height === 0) return;
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    const pixelAngle = (FIELD_OF_VIEW_DEG * DEGREE) / height;
    this.skyMaterial.uniforms.pixelAngle.value = pixelAngle;
    this.skyMaterial.uniforms.discRadius.value = Math.max(this.discRadius, (MIN_DISC_PIXELS / 2) * pixelAngle);
  }

  dispose(): void {
    cancelAnimationFrame(this.animation);
    document.removeEventListener("visibilitychange", this.onVisibility);
    this.workers.dispose();
    for (const patch of this.cache.values()) this.disposePatch(patch);
    this.cache.clear();
    this.groundMaterial.dispose();
    this.waterMaterial.dispose();
    this.skyMaterial.dispose();
    this.sky.geometry.dispose();
    this.clouds?.geometry.dispose();
    this.cloudMaterial?.dispose();
    this.cloudTexture?.dispose();
    for (const texture of [this.skyRayleigh, this.skyMie, this.skyMultiple, this.skyLight]) texture.dispose();
    this.renderer.dispose();
  }

  private addPatch(data: PatchData): void {
    const ground = new THREE.BufferGeometry();
    ground.setAttribute("position", new THREE.BufferAttribute(data.positions, 3));
    ground.setAttribute("normal", new THREE.BufferAttribute(data.normals, 3));
    ground.setAttribute("color", new THREE.BufferAttribute(data.colours, 3));
    ground.setAttribute("glow", new THREE.BufferAttribute(data.glow, 1));
    ground.setIndex(this.indices);
    ground.computeBoundingSphere();
    const groundMesh = new THREE.Mesh(ground, this.groundMaterial);
    groundMesh.visible = false;
    groundMesh.matrixAutoUpdate = true;
    this.scene.add(groundMesh);

    let waterMesh: THREE.Mesh | null = null;
    if (data.water) {
      const water = new THREE.BufferGeometry();
      water.setAttribute("position", new THREE.BufferAttribute(data.water.positions, 3));
      water.setAttribute("depth", new THREE.BufferAttribute(data.water.depth, 1));
      water.setAttribute("seaIce", new THREE.BufferAttribute(data.water.seaIce, 1));
      water.setIndex(this.indices);
      water.computeBoundingSphere();
      // Shared uniforms stay shared (not cloned: a clone would copy the sky's textures); the patch's own origin is its own
      const [ox, oy, oz] = data.origin;
      const mod = (v: number) => v - Math.floor(v / RIPPLE_REPEAT_M) * RIPPLE_REPEAT_M;
      const material = new THREE.ShaderMaterial({
        vertexShader: this.waterMaterial.vertexShader,
        fragmentShader: this.waterMaterial.fragmentShader,
        uniforms: {
          ...this.waterMaterial.uniforms,
          origin: { value: new THREE.Vector3(ox, oy, oz) },
          rippleOrigin: { value: new THREE.Vector3(mod(ox), mod(oy), mod(oz)) },
        },
      });
      waterMesh = new THREE.Mesh(water, material);
      waterMesh.visible = false;
      this.scene.add(waterMesh);
    }
    this.cache.set(keyText(data.key), {
      ground: groundMesh, water: waterMesh, origin: data.origin, lowestM: data.lowestM, highestM: data.highestM, lastUsed: this.frame,
    });
  }

  private disposePatch(patch: CachedPatch): void {
    this.scene.remove(patch.ground);
    patch.ground.geometry.dispose();
    if (patch.water) {
      this.scene.remove(patch.water);
      patch.water.geometry.dispose();
      (patch.water.material as THREE.Material).dispose();
    }
  }

  private placeCamera(): void {
    const { latitudeDeg, longitudeDeg, heightM, yawDeg, pitchDeg } = this.view;
    const up = directionOf(latitudeDeg, longitudeDeg);
    const groundM = this.terrain.heightM(up, 1);
    this.stats.groundM = groundM;
    // On water the camera stands on the sea's surface
    const r = this.terrain.radiusM + Math.max(groundM, 0) + heightM;
    this.cameraM = [up[0] * r, up[1] * r, up[2] * r];

    const lon = longitudeDeg * DEGREE;
    const east = new THREE.Vector3(-Math.sin(lon), 0, -Math.cos(lon));
    const upV = new THREE.Vector3(...up);
    const north = new THREE.Vector3().crossVectors(upV, east);
    const yaw = yawDeg * DEGREE, pitch = pitchDeg * DEGREE;
    const forward = north.clone().multiplyScalar(Math.cos(yaw)).addScaledVector(east, Math.sin(yaw))
      .multiplyScalar(Math.cos(pitch)).addScaledVector(upV, Math.sin(pitch));
    this.camera.position.set(0, 0, 0);
    this.camera.up.copy(upV);
    this.camera.lookAt(forward);
    // Near plane: a fraction of the height, so close ground is not clipped
    this.camera.near = Math.max(0.05, heightM * 0.1);
    this.camera.updateProjectionMatrix();
    this.camera.updateMatrixWorld();
    (this.skyMaterial.uniforms.screenToWorld.value as THREE.Matrix4).multiplyMatrices(this.camera.matrixWorld, this.camera.projectionMatrixInverse);
    (this.atmosphere.cameraBody.value as THREE.Vector3).set(...this.cameraM);
    (this.atmosphere.cameraUp.value as THREE.Vector3).copy(upV);
    if (this.cloudMaterial) this.camera.getWorldDirection(this.cloudMaterial.uniforms.cameraForward.value as THREE.Vector3);
  }

  /**
   * Keeps the sky table up to date: a new one is started when the camera's
   * height or the star's height over it has changed enough since the one shown,
   * and built a few rows a frame; the first is built whole.
   */
  private updateSky(): void {
    const r = Math.hypot(...this.cameraM);
    const sunMu = (this.atmosphere.sunDirection.value as THREE.Vector3).dot(this.atmosphere.cameraUp.value as THREE.Vector3);
    const built = this.skyBuiltFor;
    const stale = !built || Math.abs(r - built.r) > Math.max(1, SKY_HEIGHT_SHARE * Math.abs(r - this.air.radiusM))
      || Math.abs(sunMu - built.sunMu) > SKY_SUN_COSINE;
    if (!this.skyBuilding && !stale) return;
    if (!this.skyBuilding) this.skyBuilding = { table: emptySkyTable(this.air, r, sunMu), row: 0, ms: 0, frames: 0 };

    const building = this.skyBuilding;
    const start = performance.now();
    const budget = built ? SKY_BUDGET_MS : Infinity;
    while (building.row < SKY_ROWS && performance.now() - start < budget) {
      fillSkyRows(this.air, building.table, building.row, building.row + 1);
      building.row++;
    }
    building.ms += performance.now() - start;
    building.frames++;
    if (building.row < SKY_ROWS) return;

    const { table } = building;
    fillTexture(this.skyRayleigh, table.rayleigh);
    fillTexture(this.skyMie, table.mie);
    fillTexture(this.skyMultiple, table.multiple);
    this.atmosphere.skyHorizon.value = table.horizon;
    this.skyBuiltFor = { r: table.r, sunMu: table.sunMu };
    this.stats.skyMs = building.ms;
    this.stats.skyFrames = building.frames;
    this.skyBuilding = null;
  }

  /** Sets the exposure from the light on level ground under the camera, as an eye adapts (see the header). */
  private adaptExposure(): void {
    const sunMu = (this.atmosphere.sunDirection.value as THREE.Vector3).dot(this.atmosphere.cameraUp.value as THREE.Vector3);
    const adapted = adaptation(lightOnGround(this.air, this.irradiance, this.skyLightValues, sunMu, NIGHT_LIGHT));
    this.renderer.toneMappingExposure = EARTH_EXPOSURE * adapted;
    this.stats.exposure = adapted;
  }

  private loop = (time: number): void => {
    this.animation = requestAnimationFrame(this.loop);
    if (this.meter.frame(time)) {
      this.stats.frameMs = this.meter.frameMs;
      this.stats.framesPerSecond = this.meter.framesPerSecond;
    }
    if (this.stats.frameMs > 0) {
      if (this.stats.frameMs > SLOW_MS) this.stats.splitFactor = Math.max(MIN_SPLIT, this.stats.splitFactor * 0.98);
      else if (this.stats.frameMs < FAST_MS) this.stats.splitFactor = Math.min(SPLIT_FACTOR, this.stats.splitFactor * 1.01);
    }
    this.frame++;
    this.placeCamera();
    this.updateSky();
    this.adaptExposure();

    const selection = selectPatches({
      camera: this.cameraM, radiusM: this.terrain.radiusM, highestM: this.highestM, lowestM: this.lowestM,
      splitFactor: this.stats.splitFactor, deepestLevel: this.deepest, isBuilt: (k) => this.cache.has(k),
    });
    this.workers.want(selection.build.slice(0, MAX_REQUESTS));

    for (const patch of this.cache.values()) {
      patch.ground.visible = false;
      if (patch.water) patch.water.visible = false;
    }
    for (const key of selection.draw) {
      const patch = this.cache.get(keyText(key))!;
      patch.lastUsed = this.frame;
      // Ancestors stay cached too: the quadtree walks through them to reach this patch
      for (const a of ancestors(key)) {
        const above = this.cache.get(keyText(a));
        if (above) above.lastUsed = this.frame;
      }
      const [x, y, z] = [patch.origin[0] - this.cameraM[0], patch.origin[1] - this.cameraM[1], patch.origin[2] - this.cameraM[2]];
      patch.ground.position.set(x, y, z);
      patch.ground.visible = true;
      if (patch.water) {
        patch.water.position.set(x, y, z);
        patch.water.visible = true;
      }
    }
    this.evict();

    const seconds = (performance.now() - this.start) / 1000;
    this.waterMaterial.uniforms.time.value = seconds;
    if (this.cloudMaterial && !this.reducedMotion) this.cloudMaterial.uniforms.cloudTurn.value = (seconds / CLOUD_SECONDS_PER_TURN) * 2 * Math.PI;
    this.stats.patchesDrawn = selection.draw.length;
    this.stats.patchesBuilding = this.workers.busy;
    this.renderer.render(this.scene, this.camera);
  };

  /** Drops the least recently drawn patches beyond the cache's size. */
  private evict(): void {
    if (this.cache.size <= CACHE_SIZE) return;
    const old = [...this.cache.entries()].filter(([, p]) => p.lastUsed < this.frame).sort((a, b) => a[1].lastUsed - b[1].lastUsed);
    for (const [key, patch] of old.slice(0, this.cache.size - CACHE_SIZE)) {
      this.disposePatch(patch);
      this.cache.delete(key);
    }
  }
}

/** An RGBA half-float texture, linearly filtered (WebGL 2 filters half floats everywhere, full floats not). */
function halfFloatTexture(width: number, height: number): THREE.DataTexture {
  const texture = new THREE.DataTexture(new Uint16Array(width * height * 4), width, height, THREE.RGBAFormat, THREE.HalfFloatType);
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.needsUpdate = true;
  return texture;
}

function fillTexture(texture: THREE.DataTexture, values: Float32Array): void {
  const data = texture.image.data as Uint16Array;
  for (let k = 0; k < values.length; k++) data[k] = THREE.DataUtils.toHalfFloat(values[k]);
  texture.needsUpdate = true;
}
