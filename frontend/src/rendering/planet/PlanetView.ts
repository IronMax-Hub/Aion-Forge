// Planet view (Worlds Up Close, phases A4–A5): the third level of zoom, from a
// planetary system down to one planet seen from orbit.
//
// Why it exists: the simulation gives every solid planet a surface, a climate
// and a history. This is the scene they are drawn in. A4 built the scene and
// the way into and out of it; A5 draws solid planets from their surface grid.
// Giants and lava worlds stay plain spheres in their type's colour until A7,
// and A6–A9 add air, clouds, rotation and life.
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
//   which was shaded once from its surface map (surfaceMap.ts); each frame only
//   lights it. The map's pole is the grid's band axis: a rotating planet's
//   spin axis, tilted by its axial tilt from the orbit's normal, or a locked
//   planet's substellar point, which faces the star.
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
      this.globe = new THREE.Mesh(cubeSphereGeometry(GLOBE_SEGMENTS), this.globeMaterial(options.surface, starColor, intensity, fade));
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
    this.fadeStartMs = fade ? nowMs : null;
  }

  private globeMaterial(surface: GlobeSurface, starColor: THREE.Color, intensity: number, fade: boolean): THREE.ShaderMaterial {
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
      },
    });
  }

  /** Advances the fade-in; call once per frame. */
  update(nowMs: number): void {
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

  /** Frees the view's GPU resources. The surface map belongs to its cache; objects added by others are left alone. */
  dispose(): void {
    this.globe.geometry.dispose();
    this.globe.material.dispose();
    this.starlight?.dispose();
  }
}
