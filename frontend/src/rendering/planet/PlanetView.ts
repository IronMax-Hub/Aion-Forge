// Planet view (Worlds Up Close, phases A4–A7): the third level of zoom, from a
// planetary system down to one planet seen from orbit.
//
// Why it exists: the simulation gives every solid planet a surface, a climate
// and a history. This is the scene they are drawn in. A4 built the scene and
// the way into and out of it; A5 draws solid planets from their surface grid;
// A6 adds air and clouds; A7 draws giants and molten ground. A8–A9 add
// rotation and life.
//
// How: the view has its own THREE.Scene, drawn by the renderer the galaxy and
// system views share, through the same camera and orbit controls. One scene
// unit is the planet's radius, so orbit distances are in planet radii and the
// scale bar converts with the planet's size (1 R⊕ = 6,371 km).
// - Light: one directional light from the star's direction, in the star's
//   colour. Its intensity follows the fourth root of the starlight the planet
//   receives (as its temperature does), within limits, so a far, dim world looks
//   dim without going black.
// - Globe: a cube-sphere drawn from the planet's baked atlas (globeBake.ts),
//   shaded once from a solid planet's surface map (surfaceMap.ts) or a giant's
//   bands; each frame only lights it, and adds the glow of molten ground or a
//   hot giant. The atlas's pole is the spin axis, tilted by the axial tilt from
//   the orbit's normal, or a locked solid planet's substellar point, which faces
//   the star (a solid planet's grid band axis). Molten ground shimmers on the
//   day side. A giant may have rings (rings.ts).
// - Air (A6): a scattering shell when the planet has air enough to see, and a
//   cloud sphere over a drawn surface (atmosphere.ts). The clouds drift slowly,
//   except under reduced motion.
// - Fade: in over 400 ms, or at once when the viewer prefers reduced motion.
//
// Presentation only: it reads a planet and a star and never writes to either.

import * as THREE from "three";
import type { Planet } from "../../simulation/planet";
import { PLANET_COLORS } from "../../simulation/planet";
import type { Star } from "../../simulation/star";
import { temperatureToColor } from "../../simulation/star";
import type { GlobeSurface } from "./globe";
import { cubeSphereGeometry } from "./cubeSphere";
import { CUBE_ATLAS_GLSL } from "./cubeFaces";
import { atmosphereShell, cloudDriftAngle, cloudSphere, hasVisibleAtmosphere } from "./atmosphere";
import { ringMesh } from "./rings";
import globeVertex from "./shaders/globe.vert.glsl?raw";
import globeFragment from "./shaders/globe.frag.glsl?raw";

export const EARTH_RADIUS_KM = 6371;

/** How close and how far the orbit controls allow, and where the view starts, in planet radii. */
export const ORBIT_DISTANCE = { min: 1.15, max: 8, start: 3 };

export const FADE_IN_MS = 400;

// Starlight on the day side at Earth's flux, and a faint fill so the night side is not pure black
const STARLIGHT_INTENSITY = 2.6;
const NIGHT_FILL_INTENSITY = 0.03;
// Starlight follows flux^¼, held within these factors of Earth's
const STARLIGHT_RANGE = { min: 0.35, max: 1.6 };
// The light is placed this far along the direction to the star; only its direction matters
const LIGHT_DISTANCE = 10;

// Globe mesh: 6 × 32² quads. The sphere is shaded per pixel and never displaced, so
// more vertices add nothing; worse, triangles only a few pixels across make GPUs
// shade many pixels twice or more (they work in 2 × 2 blocks). At 6 × 128² that
// tripled the globe's cost. At 32 the outline is within a pixel even at 1.15 radii.
const GLOBE_SEGMENTS = 32;

// The orbit's normal: "up" in the system view, which the planets circle in the x–z plane
const ORBIT_NORMAL = new THREE.Vector3(0, 1, 0);

export interface PlanetViewOptions {
  /** Starlight at the planet, relative to Earth's. */
  starFlux?: number;
  /** A solid planet's surface, when the view draws it; otherwise a plain sphere. */
  surface?: GlobeSurface | null;
  /** Whether the clouds drift and hot ground shimmers; defaults to `fade` (all off under reduced motion). */
  drift?: boolean;
}

// The planet's own light (molten ground, hot giants): blackbody colour at its
// temperature, held in this range (the colour ramp starts at 1,000 K)
const GLOW_COLOUR_K = { min: 1000, max: 3000 };
// Brightness of a fully glowing texel, in the same units as starlight / π
const GLOW_INTENSITY = 0.6;
// Molten ground shimmers from this mean temperature, fully from the next
const SHIMMER_K = { from: 900, full: 1300 };

/** The colour a planet glows with, from its temperature (temperatureToColor gives display, sRGB, values). */
export function glowColourOf(temperatureK: number): THREE.Color {
  const [r, g, b] = temperatureToColor(Math.min(GLOW_COLOUR_K.max, Math.max(GLOW_COLOUR_K.min, temperatureK)));
  return new THREE.Color().setRGB(r, g, b, THREE.SRGBColorSpace);
}

/** How strongly a planet's day side shimmers with heat, 0–1: solid planets hot enough to melt. */
export function shimmerOf(planet: Planet): number {
  if (!planet.surface) return 0;
  const x = Math.min(1, Math.max(0, (planet.temperature - SHIMMER_K.from) / (SHIMMER_K.full - SHIMMER_K.from)));
  return x * x * (3 - 2 * x);
}

/** Light intensity for the starlight a planet receives. */
export function starlightIntensity(starFlux: number): number {
  const factor = Math.min(STARLIGHT_RANGE.max, Math.max(STARLIGHT_RANGE.min, Math.pow(starFlux, 0.25)));
  return STARLIGHT_INTENSITY * factor;
}

/**
 * Orientation of the globe's own frame, whose +y is the map's pole: towards the
 * star for a locked planet, otherwise the spin axis tilted from the orbit's normal.
 */
export function globeOrientation(surface: GlobeSurface, towardStar: THREE.Vector3): THREE.Quaternion {
  const pole = surface.tidallyLocked
    ? towardStar.clone().normalize()
    : ORBIT_NORMAL.clone().applyAxisAngle(new THREE.Vector3(1, 0, 0), THREE.MathUtils.degToRad(surface.axialTiltDeg));
  return new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), pole);
}

export class PlanetView {
  readonly scene = new THREE.Scene();
  /** Kilometres per scene unit: the planet's radius. */
  readonly kmPerUnit: number;

  private readonly globe: THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial | THREE.ShaderMaterial>;
  private readonly starlight: THREE.DirectionalLight | null;
  private readonly lightDirection: THREE.Vector3;
  private readonly shell: THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial> | null = null;
  private readonly clouds: THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial> | null = null;
  private readonly rings: THREE.Mesh<THREE.RingGeometry, THREE.ShaderMaterial> | null = null;
  private readonly cloudBase = new THREE.Quaternion();
  private readonly openedMs: number;
  private readonly drift: boolean;
  private fadeStartMs: number | null;

  /**
   * @param towardStar direction from the planet to its star
   * @param fade whether to fade in (false when the viewer prefers reduced motion)
   */
  constructor(planet: Planet, star: Star, towardStar: THREE.Vector3, fade: boolean, nowMs: number, options: PlanetViewOptions = {}) {
    this.kmPerUnit = planet.size * EARTH_RADIUS_KM;
    this.lightDirection = towardStar.clone().normalize();
    const [sr, sg, sb] = temperatureToColor(star.temperature);
    const starColor = new THREE.Color(sr, sg, sb);
    const intensity = starlightIntensity(options.starFlux ?? 1);

    if (options.surface) {
      const shimmer = (options.drift ?? fade) ? shimmerOf(planet) : 0;
      this.globe = new THREE.Mesh(cubeSphereGeometry(GLOBE_SEGMENTS),
        this.globeMaterial(options.surface, starColor, intensity, fade, glowColourOf(planet.temperature), shimmer));
      this.globe.quaternion.copy(globeOrientation(options.surface, towardStar));
      this.globe.updateMatrixWorld();
      (this.globe.material as THREE.ShaderMaterial).uniforms.localToWorld.value.setFromMatrix4(this.globe.matrixWorld);
      this.starlight = null;
    } else {
      const [r, g, b] = PLANET_COLORS[planet.type];
      const material = new THREE.MeshStandardMaterial({
        color: new THREE.Color(r, g, b), roughness: 0.9, metalness: 0,
        transparent: fade, opacity: fade ? 0 : 1,
      });
      this.globe = new THREE.Mesh(new THREE.SphereGeometry(1, 96, 48), material);
      this.starlight = new THREE.DirectionalLight(starColor, intensity);
      this.starlight.position.copy(this.lightDirection).multiplyScalar(LIGHT_DISTANCE);
      this.scene.add(this.starlight, new THREE.AmbientLight(0xffffff, NIGHT_FILL_INTENSITY));
    }
    this.scene.add(this.globe);

    const light = {
      toStar: this.lightDirection, starColor, starIntensity: intensity,
      nightFill: NIGHT_FILL_INTENSITY, opacity: fade ? 0 : 1,
    };
    if (options.surface?.hasClouds) {
      this.clouds = cloudSphere(options.surface.bake.relief, light);
      this.cloudBase.copy(this.globe.quaternion);
      this.clouds.quaternion.copy(this.cloudBase);
      this.scene.add(this.clouds);
    }
    if (options.surface?.rings) {
      this.rings = ringMesh(options.surface.rings, planet.temperature, this.globe.quaternion, light);
      this.scene.add(this.rings);
    }
    if (hasVisibleAtmosphere(planet)) {
      this.shell = atmosphereShell(planet.surface!.pressureBar, star.temperature, light);
      this.scene.add(this.shell);
    }

    this.openedMs = nowMs;
    this.drift = options.drift ?? fade;
    this.fadeStartMs = fade ? nowMs : null;
  }

  private globeMaterial(
    surface: GlobeSurface, starColor: THREE.Color, intensity: number, fade: boolean, glowColour: THREE.Color, shimmer: number,
  ): THREE.ShaderMaterial {
    return new THREE.ShaderMaterial({
      vertexShader: globeVertex,
      fragmentShader: CUBE_ATLAS_GLSL + globeFragment,
      transparent: fade,
      uniforms: {
        albedoAtlas: { value: surface.bake.albedo },
        reliefAtlas: { value: surface.bake.relief },
        localToWorld: { value: new THREE.Matrix3() },
        toStar: { value: this.lightDirection.clone() },
        starColor: { value: starColor },
        starIntensity: { value: intensity },
        nightFill: { value: NIGHT_FILL_INTENSITY },
        opacity: { value: fade ? 0 : 1 },
        glowColour: { value: glowColour },
        glowIntensity: { value: GLOW_INTENSITY },
        shimmer: { value: shimmer },
        timeSeconds: { value: 0 },
      },
    });
  }

  /** Advances the fade-in and the cloud drift; call once per frame. */
  update(nowMs: number): void {
    const globe = this.globe.material;
    if (globe instanceof THREE.ShaderMaterial && globe.uniforms.shimmer.value > 0) {
      globe.uniforms.timeSeconds.value = (nowMs - this.openedMs) / 1000;
    }
    if (this.clouds && this.drift) {
      const turn = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), cloudDriftAngle(nowMs - this.openedMs));
      this.clouds.quaternion.copy(this.cloudBase).multiply(turn);
    }
    if (this.fadeStartMs === null) return;
    const progress = Math.min(1, (nowMs - this.fadeStartMs) / FADE_IN_MS);
    this.setOpacity(progress);
    if (progress === 1) {
      // Fully faded in: draw it as an opaque surface again
      this.globe.material.transparent = false;
      this.globe.material.needsUpdate = true;
      this.fadeStartMs = null;
    }
  }

  private setOpacity(opacity: number): void {
    const material = this.globe.material;
    if (material instanceof THREE.ShaderMaterial) material.uniforms.opacity.value = opacity;
    else material.opacity = opacity;
    for (const layer of [this.clouds, this.shell, this.rings]) if (layer) layer.material.uniforms.opacity.value = opacity;
  }

  /** How visible the planet is, 0–1. */
  get opacity(): number {
    const material = this.globe.material;
    return material instanceof THREE.ShaderMaterial ? material.uniforms.opacity.value : material.opacity;
  }

  /** Direction from the planet towards its star. */
  get towardStar(): THREE.Vector3 {
    return this.lightDirection.clone();
  }

  /** Whether the planet is drawn from its surface map rather than as a plain sphere. */
  get drawsSurface(): boolean {
    return this.globe.material instanceof THREE.ShaderMaterial;
  }

  /** Whether the view draws rings. */
  get hasRings(): boolean {
    return this.rings !== null;
  }

  /** Whether the view draws a cloud sphere. */
  get hasClouds(): boolean {
    return this.clouds !== null;
  }

  /** Whether the view draws an atmosphere shell. */
  get hasAtmosphere(): boolean {
    return this.shell !== null;
  }

  /** The cloud sphere's turn about the planet's pole, radians. */
  get cloudTurn(): number {
    if (!this.clouds) return 0;
    return 2 * Math.acos(Math.min(1, Math.abs(this.cloudBase.clone().invert().multiply(this.clouds.quaternion).w)));
  }

  /** Frees the view's GPU resources. The baked atlas belongs to its cache; objects added by others are left alone. */
  dispose(): void {
    for (const mesh of [this.globe, this.clouds, this.shell, this.rings]) {
      if (!mesh) continue;
      mesh.geometry.dispose();
      mesh.material.dispose();
    }
    this.starlight?.dispose();
  }
}
