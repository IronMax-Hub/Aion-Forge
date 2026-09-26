// Planet view (Worlds Up Close, phase A4): the third level of zoom, from a
// planetary system down to one planet seen from orbit.
//
// Why it exists: the simulation now gives every solid planet a surface, a
// climate and a history. This is the scene they are drawn in. A4 builds the
// scene and the way into and out of it; the planet itself is still a plain
// sphere in its type's colour. A5 replaces it with the globe drawn from the
// surface grid, and A6–A9 add air, clouds, giants, lava and life.
//
// How: the view has its own THREE.Scene, drawn by the renderer the galaxy and
// system views share, through the same camera and orbit controls. One scene
// unit is the planet's radius, so orbit distances are in planet radii and the
// scale bar converts with the planet's size (1 R⊕ = 6,371 km). The planet is lit
// by one directional light from its star's direction, in the star's colour. It
// fades in over 400 ms, or appears at once when the viewer prefers reduced motion.
//
// Presentation only: it reads a planet and a star and never writes to either.

import * as THREE from "three";
import type { Planet } from "../../simulation/planet";
import { PLANET_COLORS } from "../../simulation/planet";
import type { Star } from "../../simulation/star";
import { temperatureToColor } from "../../simulation/star";

export const EARTH_RADIUS_KM = 6371;

/** How close and how far the orbit controls allow, and where the view starts, in planet radii. */
export const ORBIT_DISTANCE = { min: 1.15, max: 8, start: 3 };

export const FADE_IN_MS = 400;

// Starlight on the day side, and a faint fill so the night side is not pure black
const STARLIGHT_INTENSITY = 2.6;
const NIGHT_FILL_INTENSITY = 0.03;
// The light is placed this far along the direction to the star; only its direction matters
const LIGHT_DISTANCE = 10;

export class PlanetView {
  readonly scene = new THREE.Scene();
  /** Kilometres per scene unit: the planet's radius. */
  readonly kmPerUnit: number;

  private readonly globe: THREE.Mesh<THREE.SphereGeometry, THREE.MeshStandardMaterial>;
  private readonly starlight: THREE.DirectionalLight;
  private fadeStartMs: number | null;

  /**
   * @param towardStar direction from the planet to its star
   * @param fade whether to fade in (false when the viewer prefers reduced motion)
   */
  constructor(planet: Planet, star: Star, towardStar: THREE.Vector3, fade: boolean, nowMs: number) {
    this.kmPerUnit = planet.size * EARTH_RADIUS_KM;

    const [r, g, b] = PLANET_COLORS[planet.type];
    const material = new THREE.MeshStandardMaterial({
      color: new THREE.Color(r, g, b), roughness: 0.9, metalness: 0,
      transparent: fade, opacity: fade ? 0 : 1,
    });
    this.globe = new THREE.Mesh(new THREE.SphereGeometry(1, 96, 48), material);
    this.scene.add(this.globe);

    const [sr, sg, sb] = temperatureToColor(star.temperature);
    this.starlight = new THREE.DirectionalLight(new THREE.Color(sr, sg, sb), STARLIGHT_INTENSITY);
    this.starlight.position.copy(towardStar).normalize().multiplyScalar(LIGHT_DISTANCE);
    this.scene.add(this.starlight, new THREE.AmbientLight(0xffffff, NIGHT_FILL_INTENSITY));

    this.fadeStartMs = fade ? nowMs : null;
  }

  /** Advances the fade-in; call once per frame. */
  update(nowMs: number): void {
    if (this.fadeStartMs === null) return;
    const progress = Math.min(1, (nowMs - this.fadeStartMs) / FADE_IN_MS);
    const material = this.globe.material;
    material.opacity = progress;
    if (progress === 1) {
      // Fully faded in: draw it as an opaque surface again
      material.transparent = false;
      material.needsUpdate = true;
      this.fadeStartMs = null;
    }
  }

  /** How visible the planet is, 0–1. */
  get opacity(): number {
    return this.globe.material.opacity;
  }

  /** Direction from the planet towards its star. */
  get towardStar(): THREE.Vector3 {
    return this.starlight.position.clone().normalize();
  }

  /** Frees the view's GPU resources. Objects added to the scene by others are left alone. */
  dispose(): void {
    this.globe.geometry.dispose();
    this.globe.material.dispose();
    this.starlight.dispose();
  }
}
