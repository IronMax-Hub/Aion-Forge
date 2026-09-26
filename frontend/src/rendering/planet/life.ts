// Life seen from orbit (Worlds Up Close, phase A9): vegetation on the ground and
// in shallow seas, the lights of a civilization's cities on the night side, and
// a faint shell of orbital points around a space-age world.
//
// Why it exists: the simulation says whether a planet has life and a
// civilization; this makes both visible from orbit, drawn from the simulation's
// own numbers and surface, never as a separate invented picture.
//
// How:
// - Vegetation is baked into the surface once (globeBake.frag.glsl), with the
//   simulation's own habitable rule: liquid-water temperatures, land by its
//   moisture (saturating: moist coasts fully, dry interiors bare), and shallow
//   seas. Its strength follows the biosphere's biomass,
//   weighted by stage (owner decision): microbial life a faint tint (mats and
//   blooms), multicellular and up clearly coloured, prebiotic nothing.
// - Its colour follows the documented hypothesis that pigments absorb where
//   starlight is strongest: a ramp by the star's temperature (owner decision),
//   so G stars give green, K yellow-orange and M dwarfs dark red to near-black,
//   and, continuing the trend, F stars blue-green and hotter stars blue. Giants
//   and white dwarfs follow their own light. Until C2 evolves real pigments,
//   this table stands in for them (C2.5 replaces it).
// - City lights, from the industrial stage on: their number follows
//   population (∝ √population, within limits), placed on temperate coastal land
//   cells, inland temperate land far less often; a collapsed civilization
//   leaves a few dim, scattered lights. Placement and brightness come from the
//   planet's VISUAL stream, in a sub-stream of its own so the draws other
//   visuals take never shift.
// - A space-age civilization adds a faint shell of orbital points, lit by the
//   star except in the planet's shadow.
//
// Assumptions: the biosphere and civilization are the ones the simulation
// generates for this planet; a planet without a surface grid (a giant) shows no
// vegetation or lights.
//
// Presentation only: it reads a planet's life and present day and never writes to either.

import * as THREE from "three";
import type { Biosphere, LifeStage } from "../../simulation/biosphere";
import type { Civilization } from "../../simulation/civilization";
import type { Planet, SolidWorld } from "../../simulation/planet";
import { FREEZING_K, SURFACE_KIND } from "../../simulation/climate";
import { surfaceGrid } from "../../simulation/geography";
import { createRNG, mixSeed, SALT } from "../../simulation/rng";
import { axisFrame } from "./surfaceMap";
import lightsVertex from "./shaders/lights.vert.glsl?raw";
import cityLightsFragment from "./shaders/cityLights.frag.glsl?raw";
import orbitalFragment from "./shaders/orbitalShell.frag.glsl?raw";

/** Vegetation as the surface bake draws it. */
export interface Vegetation {
  /** 0–1: how fully the most habitable ground is covered. */
  cover: number;
  /** Pigment colour, linear. */
  colour: THREE.Color;
}

/** Points on or around a planet, in the globe's own frame (planet radii). */
export interface PointLayer {
  positions: Float32Array;
  /** 0–1 per point. */
  brightness: Float32Array;
}

/** What a civilization shows from orbit. */
export interface CivilizationLights {
  cities: PointLayer | null;
  orbital: PointLayer | null;
}

// Vegetation strength by stage, times biomass (owner decision: microbial faint)
const STAGE_COVER: Record<LifeStage, number> = {
  none: 0, prebiotic: 0, microbial: 0.25, multicellular: 0.7, complex: 1, dominant: 1,
};

// Pigment by star temperature, display (sRGB) colours, blended in linear light between points
const PIGMENT_RAMP: { temperatureK: number; srgb: THREE.Vector3Tuple }[] = [
  { temperatureK: 2500, srgb: [0.10, 0.04, 0.04] },   // late M: near-black
  { temperatureK: 3500, srgb: [0.32, 0.09, 0.07] },   // early M: dark red
  { temperatureK: 4500, srgb: [0.62, 0.45, 0.12] },   // K: yellow-orange
  { temperatureK: 5800, srgb: [0.20, 0.36, 0.10] },   // G: green
  { temperatureK: 6800, srgb: [0.09, 0.34, 0.32] },   // F: blue-green
  { temperatureK: 9000, srgb: [0.12, 0.24, 0.45] },   // A and hotter: blue
];

// City lights
const CITIES_PER_ROOT_BILLION = 250;       // 8 billion people: ~700 lights
const CITY_COUNT = { min: 40, max: 4000 };
const COLLAPSED_COUNT = { min: 6, max: 30 };
const COLLAPSED_BRIGHTNESS = 0.3;
const TEMPERATE_MAX_K = 313;                 // warmer than this, few would choose to live
const INLAND_WEIGHT = 0.2;                   // an inland cell draws cities this often, against a coastal one
const CITY_SPREAD = 0.07;                    // radians: about half the spacing between cells
const LIT_STAGES = new Set(["industrial", "information", "space-age"]);
export const CITY_RADIUS = 1.002;

// Orbital shell
const ORBITAL_COUNT = 400;
const ORBITAL_RADIUS = { min: 1.05, max: 1.25 };

// Sub-streams of the planet's VISUAL stream
const STREAM = { cities: 1, orbital: 2 };

/** Pigment colour, linear, for the light of a star at this temperature. */
export function pigmentColourOf(starTemperatureK: number): THREE.Color {
  const ramp = PIGMENT_RAMP;
  const t = Math.min(ramp[ramp.length - 1].temperatureK, Math.max(ramp[0].temperatureK, starTemperatureK));
  let k = 0;
  while (k < ramp.length - 2 && t > ramp[k + 1].temperatureK) k++;
  const x = (t - ramp[k].temperatureK) / (ramp[k + 1].temperatureK - ramp[k].temperatureK);
  const from = new THREE.Color().setRGB(...ramp[k].srgb, THREE.SRGBColorSpace);
  const to = new THREE.Color().setRGB(...ramp[k + 1].srgb, THREE.SRGBColorSpace);
  return from.lerp(to, x);
}

/** A planet's vegetation from its biosphere; null when it has none to show. */
export function vegetationOf(biosphere: Biosphere | null, starTemperatureK: number): Vegetation | null {
  if (!biosphere?.hasLife) return null;
  const cover = Math.min(1, Math.max(0, biosphere.biomass)) * STAGE_COVER[biosphere.stage];
  return cover > 0 ? { cover, colour: pigmentColourOf(starTemperatureK) } : null;
}

function lightsStream(planet: Planet, galaxySeed: number, stream: number): () => number {
  return createRNG(mixSeed(galaxySeed, planet.hostStarId, planet.id, SALT.VISUAL, stream));
}

/**
 * Where cities go: each cell's weight, temperate coastal land most, inland
 * temperate land less. Without temperate land, any ice-free land serves.
 */
export function cityWeights(world: SolidWorld): Float64Array {
  const { neighbours } = surfaceGrid();
  const { cellSurface, cellTemperatureK } = world.history.present;
  const weights = new Float64Array(cellSurface.length);
  let total = 0;
  for (let i = 0; i < weights.length; i++) {
    if (cellSurface[i] !== SURFACE_KIND.land) continue;
    if (cellTemperatureK[i] < FREEZING_K || cellTemperatureK[i] > TEMPERATE_MAX_K) continue;
    const coastal = neighbours[i].some((j) => cellSurface[j] === SURFACE_KIND.ocean);
    weights[i] = coastal ? 1 : INLAND_WEIGHT;
    total += weights[i];
  }
  if (total === 0) for (let i = 0; i < weights.length; i++) weights[i] = cellSurface[i] === SURFACE_KIND.land ? 1 : 0;
  return weights;
}

/** A grid cell's direction in the globe's own frame: (east, axis, third) → (x, y, z). */
function localDirection(cell: number): THREE.Vector3 {
  const p = surfaceGrid().positions[cell];
  const { east, axis, third } = axisFrame();
  const d = (v: readonly number[]) => v[0] * p[0] + v[1] * p[1] + v[2] * p[2];
  return new THREE.Vector3(d(east), d(axis), d(third));
}

function pickCell(weights: Float64Array, total: number, draw: number): number {
  let remaining = draw * total;
  for (let i = 0; i < weights.length; i++) {
    remaining -= weights[i];
    if (remaining < 0 && weights[i] > 0) return i;
  }
  let last = weights.length - 1;
  while (last > 0 && weights[last] === 0) last--;
  return last;
}

function cityLayer(planet: Planet, world: SolidWorld, galaxySeed: number, count: number, brightnessScale: number): PointLayer | null {
  const weights = cityWeights(world);
  const total = weights.reduce((sum, w) => sum + w, 0);
  if (total === 0 || count === 0) return null;
  const rng = lightsStream(planet, galaxySeed, STREAM.cities);
  const positions = new Float32Array(count * 3);
  const brightness = new Float32Array(count);
  const tangentA = new THREE.Vector3();
  const tangentB = new THREE.Vector3();
  for (let n = 0; n < count; n++) {
    const centre = localDirection(pickCell(weights, total, rng()));
    tangentA.set(0, 1, 0).cross(centre);
    if (tangentA.lengthSq() < 1e-6) tangentA.set(1, 0, 0).cross(centre);
    tangentA.normalize();
    tangentB.crossVectors(centre, tangentA);
    // Two uniform draws apiece, summed: cities crowd towards the cell's centre
    const a = (rng() + rng() - 1) * CITY_SPREAD;
    const b = (rng() + rng() - 1) * CITY_SPREAD;
    const point = centre.addScaledVector(tangentA, a).addScaledVector(tangentB, b).normalize().multiplyScalar(CITY_RADIUS);
    positions.set([point.x, point.y, point.z], n * 3);
    brightness[n] = brightnessScale * (0.35 + 0.65 * rng());
  }
  return { positions, brightness };
}

function orbitalLayer(planet: Planet, galaxySeed: number): PointLayer {
  const rng = lightsStream(planet, galaxySeed, STREAM.orbital);
  const positions = new Float32Array(ORBITAL_COUNT * 3);
  const brightness = new Float32Array(ORBITAL_COUNT);
  for (let n = 0; n < ORBITAL_COUNT; n++) {
    const y = 2 * rng() - 1;
    const angle = 2 * Math.PI * rng();
    const radius = ORBITAL_RADIUS.min + (ORBITAL_RADIUS.max - ORBITAL_RADIUS.min) * rng();
    const ring = Math.sqrt(1 - y * y);
    positions.set([radius * ring * Math.cos(angle), radius * y, radius * ring * Math.sin(angle)], n * 3);
    brightness[n] = 0.4 + 0.6 * rng();
  }
  return { positions, brightness };
}

/** How many lights a civilization shows: none before industry, a few dim ones after a collapse. */
export function cityCountOf(civilization: Civilization | null): number {
  if (!civilization) return 0;
  const root = Math.sqrt(Math.max(0, civilization.population));
  if (civilization.techStage === "collapsed") {
    return Math.round(Math.min(COLLAPSED_COUNT.max, Math.max(COLLAPSED_COUNT.min, 3 * root)));
  }
  if (!LIT_STAGES.has(civilization.techStage)) return 0;
  return Math.round(Math.min(CITY_COUNT.max, Math.max(CITY_COUNT.min, CITIES_PER_ROOT_BILLION * root)));
}

/** A civilization's lights and orbital shell; null when it shows nothing from orbit. */
export function civilizationLightsOf(
  planet: Planet, world: SolidWorld | null, civilization: Civilization | null, galaxySeed: number,
): CivilizationLights | null {
  if (!world || !civilization) return null;
  const collapsed = civilization.techStage === "collapsed";
  const cities = cityLayer(planet, world, galaxySeed, cityCountOf(civilization), collapsed ? COLLAPSED_BRIGHTNESS : 1);
  const orbital = civilization.techStage === "space-age" ? orbitalLayer(planet, galaxySeed) : null;
  return cities || orbital ? { cities, orbital } : null;
}

/** Lighting the point layers read. */
export interface PointLighting {
  toStar: THREE.Vector3;
  opacity: number;
}

function pointsMesh(layer: PointLayer, fragment: string, pointSize: number, light: PointLighting): THREE.Points<THREE.BufferGeometry, THREE.ShaderMaterial> {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(layer.positions, 3));
  geometry.setAttribute("brightness", new THREE.BufferAttribute(layer.brightness, 1));
  return new THREE.Points(geometry, new THREE.ShaderMaterial({
    vertexShader: lightsVertex,
    fragmentShader: fragment,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: {
      toStar: { value: light.toStar },
      opacity: { value: light.opacity },
      pointSize: { value: pointSize },
    },
  }));
}

// Point sizes, pixels
const CITY_POINT_SIZE = 2.5;
const ORBITAL_POINT_SIZE = 1.5;

/** City lights, shown on the night side only; add them to the globe so they turn with it. */
export function cityLightsMesh(layer: PointLayer, light: PointLighting): THREE.Points<THREE.BufferGeometry, THREE.ShaderMaterial> {
  const mesh = pointsMesh(layer, cityLightsFragment, CITY_POINT_SIZE, light);
  mesh.renderOrder = 0.5;   // under the clouds (1) and the air (2)
  return mesh;
}

/** The orbital shell, lit by the star outside the planet's shadow. */
export function orbitalShellMesh(layer: PointLayer, light: PointLighting): THREE.Points<THREE.BufferGeometry, THREE.ShaderMaterial> {
  const mesh = pointsMesh(layer, orbitalFragment, ORBITAL_POINT_SIZE, light);
  mesh.renderOrder = 3;
  return mesh;
}
