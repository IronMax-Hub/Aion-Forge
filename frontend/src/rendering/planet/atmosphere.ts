// Atmosphere and clouds for the planet view (Worlds Up Close, phase A6).
//
// Why it exists: a planet's air should be visible in proportion to how much of
// it there is. The rim follows the planet's actual present-day pressure, from
// its world history (owner decision): an "airless" world that outgassed 10 bar
// of CO₂ shows a thick rim, and a world below MIN_VISIBLE_PRESSURE_BAR shows none.
//
// How:
// - Rim: a shell around the planet, drawn by single scattering
//   (atmosphere.frag.glsl). Its zenith optical depth is Earth's Rayleigh depth
//   per colour channel, scaled by pressure: τ ∝ λ⁻⁴ scatters blue most. The
//   light it scatters is the star's own spectrum (Planck, at the channels'
//   wavelengths), so a red dwarf, with little blue to give, has a paler, warmer
//   sky than Earth's, and thick air saturates towards the star's colour.
// - Clouds: a sphere just above the ground, reading the cloud density baked with
//   the surface (globeBake.ts). Cover follows moisture, which rises with warmth;
//   thick air clouds over, from none at 10 bar to full at 90 bar (owner decision),
//   so steam and greenhouse worlds are Venus-like. The sphere turns slowly about
//   the pole (presentation only; never under reduced motion).
//
// Assumptions: column mass, and so optical depth, is taken as proportional to
// pressure alone (the plan's rule), not pressure over gravity; the shell's
// thickness is fixed, not the planet's scale height.
//
// Presentation only: it reads a planet and never writes to it.

import * as THREE from "three";
import type { Planet } from "../../simulation/planet";
// The overcast rule is the simulation's (clouds.ts): the spectrum reads it too
export { OVERCAST_BAR, overcastShare } from "../../simulation/clouds";
import { CUBE_ATLAS_GLSL } from "./cubeFaces";
import { cubeSphereGeometry } from "./cubeSphere";
import shellVertex from "./shaders/atmosphere.vert.glsl?raw";
import shellFragment from "./shaders/atmosphere.frag.glsl?raw";
import cloudsFragment from "./shaders/clouds.frag.glsl?raw";

/** Below this surface pressure the air is too thin to see from orbit (Mars, 0.006 bar, shows none). */
export const MIN_VISIBLE_PRESSURE_BAR = 0.01;

// The wavelengths standing for the red, green and blue channels, µm: the display
// primaries' dominant wavelengths. The spectrum's far ends (680 and 440 nm) would
// make the sky twice as saturated a blue as it looks, which tone mapping turns violet.
const CHANNEL_MICRONS: THREE.Vector3Tuple = [0.612, 0.549, 0.465];
// Earth's Rayleigh optical depth straight down at 1 bar, at those wavelengths (0.0088·λ^−4.05)
const EARTH_ZENITH_DEPTH: THREE.Vector3Tuple = [0.064, 0.100, 0.196];
// hc / k, in µm·K: the Planck spectrum's exponent is this over λT
const PLANCK_MICRON_KELVIN = 14388;

// Shell and cloud heights, in planet radii: exaggerated, like the relief, so both read from orbit
export const SHELL_RADIUS = 1.025;
export const CLOUD_RADIUS = 1.004;

// Clouds turn once about the pole in this long, on screen
const CLOUD_DRIFT_SECONDS_PER_TURN = 900;

const SPHERE_SEGMENTS = 32;

/** Whether a planet has air enough to draw: solid planets only (giants come in A7). */
export function hasVisibleAtmosphere(planet: Planet): boolean {
  return planet.surface !== null && planet.surface.pressureBar >= MIN_VISIBLE_PRESSURE_BAR;
}

/** Rayleigh optical depth straight down through the air, per colour channel (red, green, blue). */
export function zenithOpticalDepth(pressureBar: number): THREE.Vector3Tuple {
  return EARTH_ZENITH_DEPTH.map((depth) => depth * pressureBar) as THREE.Vector3Tuple;
}

/**
 * A star's light in the red, green and blue channels, from its Planck spectrum at
 * the channels' wavelengths, scaled so the brightest channel is 1. The Sun comes
 * out near white; a 3,500 K red dwarf gives about half as much blue as red.
 */
export function starSpectrumRGB(temperatureK: number): THREE.Vector3Tuple {
  const radiance = CHANNEL_MICRONS.map((l) => 1 / (l ** 5 * Math.expm1(PLANCK_MICRON_KELVIN / (l * temperatureK))));
  const brightest = Math.max(...radiance);
  return radiance.map((r) => r / brightest) as THREE.Vector3Tuple;
}

/** Cloud turn about the pole, radians, this long after the view opened. */
export function cloudDriftAngle(elapsedMs: number): number {
  return (elapsedMs / 1000 / CLOUD_DRIFT_SECONDS_PER_TURN) * 2 * Math.PI;
}

interface Lighting {
  toStar: THREE.Vector3;
  starColor: THREE.Color;
  starIntensity: number;
  nightFill: number;
  opacity: number;
}

/** The single-scattering shell for a planet's air, drawn after the globe and added to it. */
export function atmosphereShell(pressureBar: number, starTemperatureK: number, light: Lighting): THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial> {
  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(SHELL_RADIUS, 64, 32),
    new THREE.ShaderMaterial({
      vertexShader: shellVertex,
      fragmentShader: shellFragment,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: {
        shellRadius: { value: SHELL_RADIUS },
        zenithDepth: { value: new THREE.Vector3(...zenithOpticalDepth(pressureBar)) },
        toStar: { value: light.toStar },
        starColor: { value: new THREE.Vector3(...starSpectrumRGB(starTemperatureK)) },
        starIntensity: { value: light.starIntensity },
        opacity: { value: light.opacity },
      },
    }),
  );
  mesh.renderOrder = 2;
  return mesh;
}

/** The cloud sphere, reading the cloud density in a baked relief atlas. */
export function cloudSphere(reliefAtlas: THREE.Texture, light: Lighting): THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial> {
  const geometry = cubeSphereGeometry(SPHERE_SEGMENTS);
  geometry.scale(CLOUD_RADIUS, CLOUD_RADIUS, CLOUD_RADIUS);
  geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), CLOUD_RADIUS);
  const mesh = new THREE.Mesh(
    geometry,
    new THREE.ShaderMaterial({
      vertexShader: shellVertex,
      fragmentShader: CUBE_ATLAS_GLSL + cloudsFragment,
      transparent: true,
      depthWrite: false,
      uniforms: {
        reliefAtlas: { value: reliefAtlas },
        toStar: { value: light.toStar },
        starColor: { value: light.starColor },
        starIntensity: { value: light.starIntensity },
        nightFill: { value: light.nightFill },
        opacity: { value: light.opacity },
      },
    }),
  );
  mesh.renderOrder = 1;
  return mesh;
}
