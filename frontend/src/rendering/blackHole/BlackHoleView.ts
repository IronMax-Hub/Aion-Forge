// Black hole view: a close-up of a galaxy's central black hole, the zoom level
// below the galaxy that the planet view is below a system.
//
// Why it exists: at galaxy scale a black hole is far smaller than a pixel. Seen
// from a few dozen horizon radii it is the strangest sight in the universe: a
// shadow ringed by light that has circled it, and the far side of its disc
// lifted over it and under it by gravity.
//
// How: one quad covers the view and its shader (shaders/blackHole.frag.glsl)
// traces every pixel's light through Schwarzschild space. The camera and orbit
// controls are the renderer's own; one scene unit is the horizon radius, so the
// scale bar converts with the black hole's size. The shader is costly per pixel,
// so it draws into a buffer at a share of the screen's size, which is then
// stretched over the view. How large a share, how finely rays are stepped and how
// often a frame is traced are set by a quality level (quality.ts). The disc turns
// slowly, each ring at its own Keplerian rate; under reduced motion it holds still.
// Behind it, the sky holds the host galaxy's own starlight as seen from its centre
// (a band for a spiral, a smooth glow for an elliptical, clouds for an irregular),
// so the lensing shows at every pixel.
//
// Presentation only: it reads a black hole and never writes to it.

import * as THREE from "three";
import type { CentralBlackHole } from "../../simulation/blackHole";
import type { GalaxyType } from "../../simulation/galaxy";
import { eventHorizonRadiusKm } from "../../simulation/blackHole";
import type { BlackHoleQualityLevel } from "./quality";
import { BLACK_HOLE_QUALITY } from "./quality";
import vertexShader from "./shaders/blackHole.vert.glsl?raw";
import fragmentShader from "./shaders/blackHole.frag.glsl?raw";

/** How close and how far the orbit controls allow, and where the view starts, in horizon radii. */
export const BLACK_HOLE_DISTANCE = { min: 6, max: 120, start: 34 };

/** The camera starts this far above the disc's plane, degrees: near edge-on, where lensing lifts the far side highest. */
export const START_ELEVATION_DEG = 7;

/** The disc's inner edge turns once in this many display seconds; outer rings turn slower, as Kepler's law says. */
export const SECONDS_PER_INNER_ORBIT = 24;

/** What the close-up is doing, for the on-screen stats readout. */
export interface BlackHoleStats {
  level: BlackHoleQualityLevel;
  width: number;
  height: number;
  /** Traced frames in the last full second. */
  fps: number;
}

/** The host galaxy's kind, as the shader's galaxyKind numbers it. */
const GALAXY_KIND: Record<GalaxyType, number> = { spiral: 0, elliptical: 1, irregular: 2 };

/**
 * The host galaxy's axes in the close-up (columns: longest, middle, pole), at an orientation drawn from its
 * seed: a galaxy's plane and its black hole's disc are unrelated in real galaxies. The pole is spread evenly
 * over directions (its cosine against the disc's axis is uniform). Pure: the same seed gives the same axes.
 */
export function galaxyFrameFor(galaxySeed: number): THREE.Matrix3 {
  const cosTilt = (galaxySeed * 0.7548776662) % 1;
  const azimuth = 2 * Math.PI * ((galaxySeed * 0.5698402910) % 1);
  const sinTilt = Math.sqrt(1 - cosTilt * cosTilt);
  const pole = new THREE.Vector3(sinTilt * Math.cos(azimuth), cosTilt, sinTilt * Math.sin(azimuth));
  const helper = Math.abs(pole.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
  const longest = new THREE.Vector3().crossVectors(helper, pole).normalize();
  const middle = new THREE.Vector3().crossVectors(pole, longest);
  return new THREE.Matrix3().set(
    longest.x, middle.x, pole.x,
    longest.y, middle.y, pole.y,
    longest.z, middle.z, pole.z,
  );
}

/** A frame is traced once this share of its interval has passed, so display-rate jitter does not drop every other one. */
const FRAME_INTERVAL_SLACK = 0.9;

/** The shader's constants for a level: float values are written with a decimal point, as GLSL requires. */
export function shaderDefines(level: BlackHoleQualityLevel): Record<string, string | number> {
  const q = BLACK_HOLE_QUALITY[level];
  return {
    MAX_STEPS: q.maxSteps,
    STREAK_OCTAVES: q.streakOctaves,
    STEP_SCALE: q.stepScale.toFixed(4),
    MIN_STEP: q.minStep.toFixed(4),
    MAX_STEP: q.maxStep.toFixed(4),
    STAR_SIZE: q.starSize.toFixed(4),
  };
}

export class BlackHoleView {
  /** Kilometres per scene unit: the horizon radius. */
  readonly kmPerUnit: number;

  private readonly traceScene = new THREE.Scene();
  private readonly blitScene  = new THREE.Scene();
  private readonly quadCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private readonly traceMaterial: THREE.ShaderMaterial;
  private readonly blitMaterial: THREE.MeshBasicMaterial;
  private readonly target: THREE.WebGLRenderTarget;
  private readonly quad = new THREE.PlaneGeometry(2, 2);
  private readonly bufferSize = new THREE.Vector2();
  private readonly startMs: number;
  private level: BlackHoleQualityLevel;
  private readonly lastCameraMatrix = new THREE.Matrix4();
  private lastTraceMs = -Infinity;
  private framesThisSecond = 0;
  private secondStartMs: number | null;
  private fps = 0;

  constructor(blackHole: CentralBlackHole, galaxySeed: number, galaxyType: GalaxyType, animate: boolean, nowMs: number, level: BlackHoleQualityLevel) {
    this.kmPerUnit = eventHorizonRadiusKm(blackHole);
    this.startMs = nowMs;
    this.secondStartMs = nowMs;
    this.level = level;
    this.traceMaterial = new THREE.ShaderMaterial({
      vertexShader, fragmentShader,
      defines: shaderDefines(level),
      uniforms: {
        cameraPosition_: { value: new THREE.Vector3() },
        cameraBasis: { value: new THREE.Matrix3() },
        tanHalfFov: { value: 1 },
        aspect: { value: 1 },
        time: { value: 0 },
        orbitRate: { value: animate ? 1 / SECONDS_PER_INNER_ORBIT : 0 },
        thinDisc: { value: blackHole.accretionMode === "thin-disc" ? 1 : 0 },
        peakTemperatureK: { value: blackHole.discPeakTemperatureK },
        // The galaxy's seed as two numbers in [0, 1), for the gas's streaks and the sky's stars
        seed: { value: new THREE.Vector2((galaxySeed * 0.6180339887) % 1, (galaxySeed * 0.4142135624) % 1) },
        galaxyKind: { value: GALAXY_KIND[galaxyType] },
        galaxyFrame: { value: galaxyFrameFor(galaxySeed) },
        pixelAngle: { value: 0.002 },
      },
      depthTest: false, depthWrite: false,
    });
    const trace = new THREE.Mesh(this.quad, this.traceMaterial);
    trace.frustumCulled = false;
    this.traceScene.add(trace);

    this.target = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, depthBuffer: false });
    this.blitMaterial = new THREE.MeshBasicMaterial({ map: this.target.texture, toneMapped: false, depthTest: false, depthWrite: false });
    const blit = new THREE.Mesh(this.quad, this.blitMaterial);
    blit.frustumCulled = false;
    this.blitScene.add(blit);
  }

  /** Trace at another quality level from the next frame (the shader is rebuilt, once). */
  setQuality(level: BlackHoleQualityLevel) {
    if (level === this.level) return;
    this.level = level;
    this.traceMaterial.defines = shaderDefines(level);
    this.traceMaterial.needsUpdate = true;
    this.lastTraceMs = -Infinity;
    // Count the new level's frames afresh, so the readout never mixes two levels
    this.framesThisSecond = 0;
    this.secondStartMs = null;
    this.fps = 0;
  }

  get stats(): BlackHoleStats {
    return { level: this.level, width: this.target.width, height: this.target.height, fps: this.fps };
  }

  /**
   * Trace the view from the camera, which sits in horizon radii around the black hole at the origin.
   * A level with a frame-rate limit skips frames that come too soon; the screen keeps the last traced one.
   */
  render(renderer: THREE.WebGLRenderer, camera: THREE.PerspectiveCamera, nowMs: number) {
    const quality = BLACK_HOLE_QUALITY[this.level];
    camera.updateMatrixWorld();
    const moving = !camera.matrixWorld.equals(this.lastCameraMatrix);
    const maxFps = moving ? quality.movingFps : quality.stillFps;
    if (maxFps > 0 && nowMs - this.lastTraceMs < FRAME_INTERVAL_SLACK * 1000 / maxFps) return;
    this.lastTraceMs = nowMs;
    this.lastCameraMatrix.copy(camera.matrixWorld);
    this.countFrame(nowMs);

    renderer.getDrawingBufferSize(this.bufferSize);
    const width  = Math.max(1, Math.round(this.bufferSize.x * quality.resolutionScale));
    const height = Math.max(1, Math.round(this.bufferSize.y * quality.resolutionScale));
    if (this.target.width !== width || this.target.height !== height) this.target.setSize(width, height);

    const u = this.traceMaterial.uniforms;
    u.cameraPosition_.value.copy(camera.position);
    u.cameraBasis.value.setFromMatrix4(camera.matrixWorld);
    u.tanHalfFov.value = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    u.pixelAngle.value = 2 * u.tanHalfFov.value / height;
    u.aspect.value = camera.aspect;
    u.time.value = (nowMs - this.startMs) / 1000;

    const previous = renderer.getRenderTarget();
    renderer.setRenderTarget(this.target);
    renderer.render(this.traceScene, this.quadCamera);
    renderer.setRenderTarget(previous);
    renderer.render(this.blitScene, this.quadCamera);
  }

  private countFrame(nowMs: number) {
    if (this.secondStartMs === null) this.secondStartMs = nowMs;
    this.framesThisSecond++;
    if (nowMs - this.secondStartMs < 1000) return;
    this.fps = Math.round(this.framesThisSecond * 1000 / (nowMs - this.secondStartMs));
    this.framesThisSecond = 0;
    this.secondStartMs = nowMs;
  }

  dispose() {
    this.quad.dispose();
    this.traceMaterial.dispose();
    this.blitMaterial.dispose();
    this.target.dispose();
  }
}
