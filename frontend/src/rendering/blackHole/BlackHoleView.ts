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
// so it draws into a buffer at RESOLUTION_SCALE of the screen's, which is then
// stretched over the view. The disc turns slowly, each ring at its own Keplerian
// rate; under reduced motion it holds still.
//
// Presentation only: it reads a black hole and never writes to it.

import * as THREE from "three";
import type { CentralBlackHole } from "../../simulation/blackHole";
import { eventHorizonRadiusKm } from "../../simulation/blackHole";
import vertexShader from "./shaders/blackHole.vert.glsl?raw";
import fragmentShader from "./shaders/blackHole.frag.glsl?raw";

/** How close and how far the orbit controls allow, and where the view starts, in horizon radii. */
export const BLACK_HOLE_DISTANCE = { min: 6, max: 120, start: 34 };

/** The camera starts this far above the disc's plane, degrees: near edge-on, where lensing lifts the far side highest. */
export const START_ELEVATION_DEG = 7;

/** The disc's inner edge turns once in this many display seconds; outer rings turn slower, as Kepler's law says. */
export const SECONDS_PER_INNER_ORBIT = 24;

/** The traced buffer's size as a share of the screen's, in each direction. */
const RESOLUTION_SCALE = 0.5;

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

  constructor(blackHole: CentralBlackHole, galaxySeed: number, animate: boolean, nowMs: number) {
    this.kmPerUnit = eventHorizonRadiusKm(blackHole);
    this.startMs = nowMs;
    this.traceMaterial = new THREE.ShaderMaterial({
      vertexShader, fragmentShader,
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

  /** Trace the view from the camera, which sits in horizon radii around the black hole at the origin. */
  render(renderer: THREE.WebGLRenderer, camera: THREE.PerspectiveCamera, nowMs: number) {
    renderer.getDrawingBufferSize(this.bufferSize);
    const width  = Math.max(1, Math.round(this.bufferSize.x * RESOLUTION_SCALE));
    const height = Math.max(1, Math.round(this.bufferSize.y * RESOLUTION_SCALE));
    if (this.target.width !== width || this.target.height !== height) this.target.setSize(width, height);

    camera.updateMatrixWorld();
    const u = this.traceMaterial.uniforms;
    u.cameraPosition_.value.copy(camera.position);
    u.cameraBasis.value.setFromMatrix4(camera.matrixWorld);
    u.tanHalfFov.value = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    u.aspect.value = camera.aspect;
    u.time.value = (nowMs - this.startMs) / 1000;

    const previous = renderer.getRenderTarget();
    renderer.setRenderTarget(this.target);
    renderer.render(this.traceScene, this.quadCamera);
    renderer.setRenderTarget(previous);
    renderer.render(this.blitScene, this.quadCamera);
  }

  dispose() {
    this.quad.dispose();
    this.traceMaterial.dispose();
    this.blitMaterial.dispose();
    this.target.dispose();
  }
}
