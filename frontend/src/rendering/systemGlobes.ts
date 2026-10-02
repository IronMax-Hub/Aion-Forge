// Planets in the system view drawn as they are: their own surfaces, clouds and
// air, as the planet view draws them, only smaller.
//
// Why it exists: a lit sphere in a colour per planet type tells nothing of the
// world. The planet view already bakes each planet's surface from its world
// history (globe.ts, globeBake.ts); the system view shows the same, so a planet
// looks the same from afar as up close.
//
// How, without stalling the view (Worlds Up Close, owner decision: 256-texel faces):
// - Every planet first shows the lit sphere the system view draws anyway.
// - Globes are baked coarser than the planet view's (SYSTEM_DETAIL): ~¼ of the
//   GPU work and of the CPU work for the surface map. One step runs a frame,
//   nearest planet first: building a planet's surface map (~20 ms of CPU), then
//   one strip of a face (~17 ms on a GeForce 210). When a globe is done it fades
//   in over its sphere.
// - Clouds are drawn on the ground from the same bake (cloudsOnGround), not on a
//   sphere of their own: one draw per planet.
// - Air: the planet view's scattering shell, drawn thicker (SYSTEM_SHELL_RADIUS),
//   or a rim a hair wide would not show on a planet a few dozen pixels across.
//   It needs no bake, so it shows from the start.
// - Bakes are cached by planet (the cache's size), so returning to a system
//   reuses them; a new universe clears them.
//
// Each globe and air shell sits in its planet's carrier (systemView.ts) and
// follows it round its orbit: its light comes from where the star now is, and a
// locked planet keeps the same face to it.
//
// Limits: globes do not spin, and city lights and orbital shells (A9) are left
// to the planet view; on a planet this small they would not read.
//
// Presentation only: it reads planets and their worlds and never writes them.

import * as THREE from "three";
import type { Planet } from "../simulation/planet";
import type { Star } from "../simulation/star";
import { temperatureToColor } from "../simulation/star";
import { GlobeTextureCache, drawsSurface } from "./planet/globe";
import type { GlobeSurface } from "./planet/globe";
import { SYSTEM_DETAIL } from "./planet/globeBake";
import { cubeSphereGeometry } from "./planet/cubeSphere";
import { atmosphereShell, hasVisibleAtmosphere } from "./planet/atmosphere";
import { FADE_IN_MS, glowColourOf, globeMaterial, globeOrientation, starlightIntensity } from "./planet/PlanetView";
import { vegetationOf } from "./planet/life";
import type { PlanetSight } from "./UniverseRenderer";
import type { SystemOrbits } from "./systemView";

/**
 * System-view globes kept baked: each ~4.5 MB of GPU memory with its mipmaps.
 * At least a whole system (planet.ts forms at most 8 planets), or a globe on
 * screen could lose its bake to a sibling.
 */
export const SYSTEM_GLOBE_CACHE_SIZE = 12;
// The air's shell, in planet radii (the planet view's is 1.025)
const SYSTEM_SHELL_RADIUS = 1.08;
const GLOBE_SEGMENTS = 32;
const NIGHT_FILL_INTENSITY = 0.03;

/** One planet waiting for, or showing, its globe. */
interface GlobeJob {
  planet: Planet;
  sight: PlanetSight;
  /** The lit sphere the system view draws: the planet's marker, kept for picking, hidden once the globe covers it. */
  marker: THREE.Mesh<THREE.SphereGeometry, THREE.Material>;
  surface: GlobeSurface | null;
  globe: THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial> | null;
  fadeStartMs: number | null;
}

export class SystemGlobes {
  private readonly cache = new GlobeTextureCache(SYSTEM_GLOBE_CACHE_SIZE, SYSTEM_DETAIL);
  private jobs: GlobeJob[] = [];
  private star: Star | null = null;
  private galaxySeed = 0;
  private fade = true;
  private orbits: SystemOrbits | null = null;

  /**
   * Starts drawing a system's planets as globes: adds their air now, and queues
   * their globes nearest the camera first. `markers` are the planets' spheres, by
   * planet id, each at the origin of its carrier in `orbits`; `sights` what each is drawn from.
   */
  start(
    group: THREE.Group, star: Star, galaxySeed: number, planets: Planet[],
    markers: Map<number, THREE.Mesh<THREE.SphereGeometry, THREE.Material>>, sights: Map<number, PlanetSight>,
    orbits: SystemOrbits, camera: THREE.Camera, fade: boolean,
  ): void {
    this.stop();
    this.star = star;
    this.galaxySeed = galaxySeed;
    this.fade = fade;
    this.orbits = orbits;
    group.updateMatrixWorld();
    const [sr, sg, sb] = temperatureToColor(star.temperature);
    const starColor = new THREE.Color(sr, sg, sb);

    for (const planet of planets) {
      const marker = markers.get(planet.id);
      const sight = sights.get(planet.id);
      if (!marker || !sight?.physics) continue;
      if (hasVisibleAtmosphere(planet)) this.addAir(planet, sight, marker, starColor);
      this.jobs.push({ planet, sight, marker, surface: null, globe: null, fadeStartMs: null });
    }
    const distance = (job: GlobeJob) => job.marker.getWorldPosition(new THREE.Vector3()).distanceTo(camera.position);
    this.jobs.sort((a, b) => distance(a) - distance(b));
  }

  /** Forgets the current system; its meshes leave with its group. */
  stop(): void {
    this.jobs = [];
    this.star = null;
    this.orbits = null;
  }

  /** Whether a globe is still waiting to be baked. */
  get busy(): boolean {
    return this.jobs.some((job) => job.globe === null);
  }

  /** One step of work (a surface map, or one strip of a bake), and the fades. */
  update(renderer: THREE.WebGLRenderer, nowMs: number): void {
    const job = this.jobs.find((j) => j.globe === null);
    if (job) {
      if (!job.surface) {
        const world = drawsSurface(job.planet) ? job.sight.world : null;
        const vegetation = world ? vegetationOf(job.sight.biosphere ?? null, this.star!.temperature) : null;
        job.surface = this.cache.globeFor(job.planet, world, job.sight.physics!, this.galaxySeed, vegetation);
      } else if (!job.surface.bake.done) {
        job.surface.bake.step(renderer);
      }
      if (job.surface.bake.done) this.showGlobe(job, nowMs);
    }
    for (const j of this.jobs) this.stepFade(j, nowMs);
  }

  /** Frees every cached bake: for a new universe, where planet keys name different planets. */
  clear(): void {
    this.stop();
    this.cache.clear();
  }

  private showGlobe(job: GlobeJob, nowMs: number): void {
    const { marker, planet, sight } = job;
    const surface = job.surface!;
    const [sr, sg, sb] = temperatureToColor(this.star!.temperature);
    const material = globeMaterial(surface, {
      toStar: new THREE.Vector3(1, 0, 0), starColor: new THREE.Color(sr, sg, sb), starIntensity: starlightIntensity(sight.starFlux),
      opacity: this.fade ? 0 : 1, glowColour: glowColourOf(planet.temperature), shimmer: 0, cloudsOnGround: true,
    });
    const globe = new THREE.Mesh(cubeSphereGeometry(GLOBE_SEGMENTS), material);
    globe.scale.setScalar(marker.geometry.parameters.radius);
    marker.parent!.add(globe);
    // Lit from where the star is; a locked planet's substellar point keeps facing it
    const turn = new THREE.Matrix4();
    this.orbits!.follow(planet.id, ({ toStar }) => {
      material.uniforms.toStar.value.copy(toStar);
      globe.quaternion.copy(globeOrientation(surface, toStar));
      material.uniforms.localToWorld.value.setFromMatrix4(turn.makeRotationFromQuaternion(globe.quaternion));
    });
    job.globe = globe;
    job.fadeStartMs = this.fade ? nowMs : null;
    if (!this.fade) marker.material.visible = false;
  }

  private stepFade(job: GlobeJob, nowMs: number): void {
    if (!job.globe || job.fadeStartMs === null) return;
    const progress = Math.min(1, (nowMs - job.fadeStartMs) / FADE_IN_MS);
    job.globe.material.uniforms.opacity.value = progress;
    if (progress < 1) return;
    job.fadeStartMs = null;
    job.globe.material.transparent = false;
    job.globe.material.needsUpdate = true;
    job.marker.material.visible = false;
  }

  /** The planet's air, round its marker, following it round its orbit. */
  private addAir(
    planet: Planet, sight: PlanetSight, marker: THREE.Mesh<THREE.SphereGeometry, THREE.Material>, starColor: THREE.Color,
  ): void {
    const radius = marker.geometry.parameters.radius;
    const shell = atmosphereShell(planet.surface!.pressureBar, this.star!.temperature, {
      toStar: new THREE.Vector3(1, 0, 0), starColor,
      starIntensity: starlightIntensity(sight.starFlux), nightFill: NIGHT_FILL_INTENSITY, opacity: 1,
    }, SYSTEM_SHELL_RADIUS);
    shell.scale.setScalar(radius);
    shell.material.uniforms.planetRadius.value = radius;
    marker.parent!.add(shell);
    this.orbits!.follow(planet.id, ({ centre, toStar }) => {
      shell.material.uniforms.toStar.value.copy(toStar);
      shell.material.uniforms.planetCentre.value.copy(centre);
    });
  }
}
