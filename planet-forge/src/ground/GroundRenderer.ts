// Draws a planet's ground around a camera (PLAN, PF3): patches chosen by the
// quadtree, built in workers, kept in a cache, placed relative to the camera.
//
// - Camera-relative drawing: the camera sits at the origin; each patch is
//   placed at its origin minus the camera's position, worked out in doubles, so
//   32-bit floats never hold numbers as large as the planet's radius.
// - A logarithmic depth buffer lets ground a metre away and mountains a
//   thousand kilometres away share it without flicker.
// - Ground: Lambert lighting of the vertex colours by the star, a little
//   ambient light, and molten ground's glow added on top.
// - Water: water.vert/frag.glsl, one material per patch (they share a program)
//   for the patch's own origin.
// - Frame time: when frames take longer than SLOW_MS, patches split less
//   eagerly (the split factor shrinks to at least MIN_SPLIT); with headroom it
//   recovers. Intervals over IGNORE_MS (a hidden or paused tab) are ignored.
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
import { starColour, starDirection } from "./light";
import { DEEP_WATER, GLOW_COLOUR, SEA_ICE, SHALLOW_WATER } from "./palette";
import waterVertex from "./shaders/water.vert.glsl?raw";
import waterFragment from "./shaders/water.frag.glsl?raw";

/** Finest spacing between vertices, m. */
const FINEST_SPACING_M = 1;
const SPLIT_FACTOR = 2;
const MIN_SPLIT = 0.75;
const SLOW_MS = 20;
const FAST_MS = 14;
const IGNORE_MS = 100;
/** Built patches kept for reuse. */
const CACHE_SIZE = 600;
/** Patches asked for at once; the rest wait for the next frame's selection. */
const MAX_REQUESTS = 64;
/** The ripples repeat over this distance in every direction, m (water.frag.glsl). */
const RIPPLE_REPEAT_M = 1000;
const AMBIENT = 0.04;
const SUN_INTENSITY = 3;
/** Until PF4 draws the sky, water reflects this colour. */
const PLACEHOLDER_SKY: Vec3 = [0.18, 0.26, 0.40];
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
  frameMs: number;
  splitFactor: number;
  /** Ground height under the camera, m above sea level. */
  groundM: number;
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
  readonly stats: GroundStats = { patchesDrawn: 0, patchesBuilding: 0, frameMs: 0, splitFactor: SPLIT_FACTOR, groundM: 0 };
  private renderer: THREE.WebGLRenderer;
  private light: THREE.DirectionalLight;
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private terrain: Terrain;
  private workers: PatchWorkers;
  private cache = new Map<string, CachedPatch>();
  private indices = new THREE.BufferAttribute(patchIndices(), 1);
  private groundMaterial: THREE.MeshLambertMaterial;
  private waterMaterial: THREE.ShaderMaterial;
  private view: GroundView = { latitudeDeg: 0, longitudeDeg: 0, heightM: 2, yawDeg: 0, pitchDeg: 0 };
  private cameraM: Vec3 = [0, 0, 0];
  private deepest: number;
  private highestM: number;
  private lowestM: number;
  private frame = 0;
  private lastTime = 0;
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

    const sun = starDirection(spec);
    const colour = starColour(spec.star.temperatureK);
    const light = new THREE.DirectionalLight(new THREE.Color(...colour), SUN_INTENSITY);
    light.position.set(...sun);
    this.light = light;
    this.scene.add(light, light.target, new THREE.AmbientLight(0xffffff, AMBIENT));

    // Front faces only: the skirts face outwards from their patch, which is the side a crack shows them from;
    // drawn double-sided, their back faces took flipped normals and showed as dark dotted lines
    this.groundMaterial = new THREE.MeshLambertMaterial({ vertexColors: true });
    // Molten ground glows whatever the light: its glow attribute, added as emission
    this.groundMaterial.onBeforeCompile = (shader) => {
      shader.uniforms.glowColour = { value: new THREE.Color(...GLOW_COLOUR) };
      shader.vertexShader = shader.vertexShader
        .replace("#include <common>", "#include <common>\nattribute float glow;\nvarying float vGlow;")
        .replace("#include <begin_vertex>", "#include <begin_vertex>\nvGlow = glow;");
      shader.fragmentShader = shader.fragmentShader
        .replace("#include <common>", "#include <common>\nuniform vec3 glowColour;\nvarying float vGlow;")
        .replace("#include <emissivemap_fragment>", "#include <emissivemap_fragment>\ntotalEmissiveRadiance += glowColour * vGlow;");
    };

    this.waterMaterial = new THREE.ShaderMaterial({
      vertexShader: waterVertex,
      fragmentShader: waterFragment,
      uniforms: {
        origin: { value: new THREE.Vector3() },
        rippleOrigin: { value: new THREE.Vector3() },
        sunDirection: { value: new THREE.Vector3(...sun) },
        sunColour: { value: new THREE.Color(...colour).multiplyScalar(SUN_INTENSITY / Math.PI) },
        skyColour: { value: new THREE.Color(...PLACEHOLDER_SKY) },
        shallowColour: { value: new THREE.Color(...SHALLOW_WATER) },
        deepColour: { value: new THREE.Color(...DEEP_WATER) },
        seaIceColour: { value: new THREE.Color(...SEA_ICE) },
        // As Three.js's Lambert lighting: radiance over π
        ambient: { value: AMBIENT / Math.PI },
        time: { value: 0 },
      },
    });

    this.workers = new PatchWorkers(spec, (patch) => this.addPatch(patch));
    this.resize();
    this.animation = requestAnimationFrame(this.loop);
  }

  setView(view: GroundView): void {
    this.view = view;
  }

  /** Moves the star to this direction in the body frame (the PF3 viewer's sun control; PF4 brings the time of day). */
  setSunDirection(direction: Vec3): void {
    this.light.position.set(...direction);
    (this.waterMaterial.uniforms.sunDirection.value as THREE.Vector3).set(...direction);
  }

  resize(): void {
    const { clientWidth: width, clientHeight: height } = this.canvas;
    if (width === 0 || height === 0) return;
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }

  dispose(): void {
    cancelAnimationFrame(this.animation);
    this.workers.dispose();
    for (const patch of this.cache.values()) this.disposePatch(patch);
    this.cache.clear();
    this.groundMaterial.dispose();
    this.waterMaterial.dispose();
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
      const material = this.waterMaterial.clone();
      // Shared uniforms stay shared; the patch's own origin is its own
      for (const name of Object.keys(this.waterMaterial.uniforms)) material.uniforms[name] = this.waterMaterial.uniforms[name];
      const [ox, oy, oz] = data.origin;
      const mod = (v: number) => v - Math.floor(v / RIPPLE_REPEAT_M) * RIPPLE_REPEAT_M;
      material.uniforms.origin = { value: new THREE.Vector3(ox, oy, oz) };
      material.uniforms.rippleOrigin = { value: new THREE.Vector3(mod(ox), mod(oy), mod(oz)) };
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
  }

  private loop = (time: number): void => {
    this.animation = requestAnimationFrame(this.loop);
    const interval = this.lastTime ? time - this.lastTime : 0;
    this.lastTime = time;
    if (interval > 0 && interval < IGNORE_MS) {
      this.stats.frameMs = this.stats.frameMs ? this.stats.frameMs * 0.9 + interval * 0.1 : interval;
      if (this.stats.frameMs > SLOW_MS) this.stats.splitFactor = Math.max(MIN_SPLIT, this.stats.splitFactor * 0.98);
      else if (this.stats.frameMs < FAST_MS) this.stats.splitFactor = Math.min(SPLIT_FACTOR, this.stats.splitFactor * 1.01);
    }
    this.frame++;
    this.placeCamera();

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

    this.waterMaterial.uniforms.time.value = (performance.now() - this.start) / 1000;
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
