// Starlight scattered by the air (PLAN, PF4): the sky's light in any direction,
// what reaches a point through the air, and the tables the renderer draws from.
//
// How:
// - Single scattering. Along a view ray, each stretch of air scatters
//   starlight towards the viewer in proportion to its density; that light is
//   dimmed on its way in from the star and on its way out to the viewer. The
//   view ray is followed in RAY_STEPS steps, closer together near the viewer.
// - The starlight's path to each step is not followed: the air it crosses is
//   given in closed form by the Chapman function for an exponential
//   atmosphere on a sphere (its asymptotic form; chapman()). A step in the
//   planet's shadow gets no starlight, which gives twilight: high air stays lit
//   after the star has set.
// - The angle between the view and the star is the same all along a ray, so
//   the scattering's angular shape (its phase function: Rayleigh's, and
//   Henyey–Greenstein's for haze) is applied after the march, by the shader.
//   The tables therefore hold Rayleigh and Mie light separately, before phase.
// - Light scattered more than once, by Hillaire's method (2020): for a point
//   at each height with the star at each height, the once-scattered light
//   arriving from every direction (MULTIPLE_DIRECTIONS of them, scattered
//   evenly, as if by an isotropic phase), and the share of light that a
//   scattering sends on to scatter again, f; light scattered any number of
//   times more is that first light times 1 / (1 − f). The table (the
//   multiple-scattering table, made once per planet) is read at each step of
//   a view ray, which adds it as it adds the starlight. It is mostly blue in
//   thin air and whitens as the air thickens, as light scattered many times
//   mixes its colours. No light from the ground is counted (it is taken as
//   black). (Replaces A6's fixed 35% grey share, which paled thin skies and
//   left them too dark beside the ground.)
// - The sky table: for a camera at one height with the star at one height,
//   the scattered light by the view's angle from overhead (rows) and its angle
//   round from the star's direction (columns; the sky is symmetric about the
//   star's vertical plane). Rows are packed towards the horizon, as in
//   Hillaire's sky-view table (2020), where the sky changes fastest.
// - The light table: the light of the whole sky falling on level ground, by
//   the star's height. It depends only on the planet, so it is made once.
//
// Units: lengths in m; light per unit of the star's irradiance unless given.
// The shaders (shaders/atmosphere.glsl) repeat chapman() and the table
// mappings; keep them the same.
// Presentation only.

import type { Vec3 } from "../forge/icosphere";
import type { Air } from "./air";
import { MIE_ASYMMETRY } from "./air";

/** Steps along each view ray. */
export const RAY_STEPS = 32;
/** The sky table's size: columns round from the star, rows from overhead to straight down. */
export const SKY_COLUMNS = 32;
export const SKY_ROWS = 128;
/** The light table's size: the star's height, from straight down to overhead (cosines −1 to 1). */
export const LIGHT_SIZE = 64;
/** Rings and directions round sampled when summing the sky's light on the ground. */
const LIGHT_RINGS = 8;
const LIGHT_DIRECTIONS = 16;
/** The multiple-scattering table's size: heights (packed towards the ground) by the star's zenith cosine, −1 to 1. */
export const MULTIPLE_SIZE = 32;
/** Directions summed for each entry, and steps along each. */
const MULTIPLE_DIRECTIONS = 64;
const MULTIPLE_STEPS = 20;
/** The camera is kept at least this far above the sphere at sea level, for the sky's sake, m. */
const MIN_CAMERA_HEIGHT_M = 1;

/** erfcx's fitted constant: with b = 1 / (π·a²), the form below is exact at 0 and for large y, and within 0.35% between. */
const ERFCX_A = 0.344;
const ERFCX_B = 1 / (Math.PI * ERFCX_A * ERFCX_A);

/** e^(y²)·erfc(y) for y ≥ 0: 1 / (√π·((1 − a)·y + a·√(y² + b))), the form of Ren and MacKenzie (2007), fitted here. */
function erfcx(y: number): number {
  return 1 / (Math.sqrt(Math.PI) * ((1 - ERFCX_A) * y + ERFCX_A * Math.sqrt(y * y + ERFCX_B)));
}

/**
 * The Chapman function for an exponential atmosphere on a sphere: the air
 * crossed from a point at height h towards infinity at zenith cosine mu, in
 * scale heights of air at ground density. X is the planet's radius in scale
 * heights. Looking up, the asymptotic form √(π·x/2)·erfcx(√(x/2)·mu), x the
 * point's radius in scale heights; looking down, a level crossing through the
 * ray's lowest point, less the part behind the start. Within 0.4% for Earth's
 * air; less close for air deep against the planet: 0.9% at X = 100, 1.4% at
 * 65, 2.6% at 33. The path must not meet the ground.
 */
export function chapman(X: number, h: number, mu: number): number {
  const x = X + h;
  const up = Math.sqrt((Math.PI / 2) * x) * erfcx(Math.sqrt(x / 2) * Math.abs(mu)) * Math.exp(-h);
  if (mu >= 0) return up;
  const x0 = Math.sqrt(1 - mu * mu) * x;
  return 2 * Math.sqrt((Math.PI / 2) * x0) * Math.exp(X - x0) - up;
}

/** Whether a ray from radius r at zenith cosine mu meets the planet's sphere at sea level. */
export function meetsGround(air: Air, r: number, mu: number): boolean {
  return mu < 0 && r * Math.sqrt(1 - mu * mu) < air.radiusM;
}

/** The air crossed from radius r to space at zenith cosine mu, by Rayleigh and by Mie scale heights; null where the planet is in the way. */
function columnsToSpace(air: Air, r: number, mu: number): [number, number] | null {
  if (meetsGround(air, r, mu)) return null;
  const h = Math.max(0, r - air.radiusM);
  return [
    air.rayleighHeightM * chapman(air.radiusM / air.rayleighHeightM, h / air.rayleighHeightM, mu),
    air.mieHeightM * chapman(air.radiusM / air.mieHeightM, h / air.mieHeightM, mu),
  ];
}

/** What gets through the air from radius r to space at zenith cosine mu, per channel: 0 where the planet is in the way. */
export function transmittanceToSpace(air: Air, r: number, mu: number): Vec3 {
  const columns = columnsToSpace(air, r, mu);
  if (!columns) return [0, 0, 0];
  return air.rayleigh.map((b) => Math.exp(-(b * columns[0] + air.mie * columns[1]))) as Vec3;
}

export function rayleighPhase(cosAngle: number): number {
  return (3 / (16 * Math.PI)) * (1 + cosAngle * cosAngle);
}

export function miePhase(cosAngle: number, g = MIE_ASYMMETRY): number {
  return (1 - g * g) / (4 * Math.PI * Math.pow(1 + g * g - 2 * g * cosAngle, 1.5));
}

/** Light gathered along one view ray: Rayleigh and Mie light from the star, before phase; and light scattered more than once. */
export interface Scattered {
  rayleigh: Vec3;
  mie: Vec3;
  multiple: Vec3;
}

/** Where a ray from radius r at zenith cosine mu is inside the air: from `start` to `end`, m; null if never. */
function insideAir(air: Air, r: number, mu: number): { start: number; end: number } | null {
  const top = air.topM, R = air.radiusM;
  const b = r * mu;
  const outer = b * b - (r * r - top * top);
  if (outer <= 0) return null;
  const start = Math.max(0, -b - Math.sqrt(outer));
  let end = -b + Math.sqrt(outer);
  if (end <= 0) return null;
  const inner = b * b - (r * r - R * R);
  if (inner > 0 && -b - Math.sqrt(inner) > 0) end = Math.min(end, -b - Math.sqrt(inner));
  return { start, end };
}

/** Each planet's multiple-scattering table, made on first use (it depends only on the air). */
const multipleTables = new WeakMap<Air, Float32Array>();

/** The multiple-scattering table entry's height above sea level for a coordinate 0–1 (packed towards the ground). */
function multipleHeightM(air: Air, u: number): number {
  return (air.topM - air.radiusM) * u * u;
}

/**
 * The multiple-scattering table (Hillaire 2020): for each height and star
 * height, the light scattered more than once arriving at a point, per unit of
 * the star's irradiance and per unit of scattering there, RGB.
 */
export function multipleScatteringTable(air: Air): Float32Array {
  const cached = multipleTables.get(air);
  if (cached) return cached;
  const table = new Float32Array(MULTIPLE_SIZE * MULTIPLE_SIZE * 3);
  multipleTables.set(air, table);
  if (air.rayleigh.every((b) => b === 0) && air.mie === 0) return table;

  // Directions spread evenly over the sphere (a Fibonacci lattice)
  const golden = Math.PI * (3 - Math.sqrt(5));
  const directions = Array.from({ length: MULTIPLE_DIRECTIONS }, (_, k) => {
    const y = 1 - (2 * (k + 0.5)) / MULTIPLE_DIRECTIONS, ring = Math.sqrt(1 - y * y);
    return [ring * Math.cos(golden * k), y, ring * Math.sin(golden * k)];
  });
  const isotropic = 1 / (4 * Math.PI);

  for (let row = 0; row < MULTIPLE_SIZE; row++) {
    const r = Math.max(air.radiusM + MIN_CAMERA_HEIGHT_M, air.radiusM + multipleHeightM(air, row / (MULTIPLE_SIZE - 1)));
    for (let column = 0; column < MULTIPLE_SIZE; column++) {
      const sunMu = -1 + (2 * column) / (MULTIPLE_SIZE - 1);
      const sun = [Math.sqrt(1 - sunMu * sunMu), sunMu, 0];
      const once: Vec3 = [0, 0, 0], onward: Vec3 = [0, 0, 0];
      for (const d of directions) {
        const span = insideAir(air, r, d[1]);
        if (!span) continue;
        const ds = (span.end - span.start) / MULTIPLE_STEPS;
        const depth: Vec3 = [0, 0, 0];
        for (let i = 0; i < MULTIPLE_STEPS; i++) {
          const t = span.start + (i + 0.5) * ds;
          const x = d[0] * t, y = r + d[1] * t, w = d[2] * t;
          const rs = Math.sqrt(x * x + y * y + w * w);
          const h = Math.max(0, rs - air.radiusM);
          const rayleighDensity = Math.exp(-h / air.rayleighHeightM), mieDensity = Math.exp(-h / air.mieHeightM);
          const toSun = columnsToSpace(air, rs, (x * sun[0] + y * sun[1] + w * sun[2]) / rs);
          for (let k = 0; k < 3; k++) {
            const scattering = air.rayleigh[k] * rayleighDensity + air.mie * mieDensity;
            const through = Math.exp(-(depth[k] + (scattering * ds) / 2));
            const sunlight = toSun ? Math.exp(-(air.rayleigh[k] * toSun[0] + air.mie * toSun[1])) : 0;
            once[k] += through * scattering * sunlight * isotropic * ds;
            onward[k] += through * scattering * ds;
            depth[k] += scattering * ds;
          }
        }
      }
      const at = (row * MULTIPLE_SIZE + column) * 3;
      for (let k = 0; k < 3; k++) {
        // Averages over the sphere: the isotropic phase times the whole sphere's 4π
        const first = once[k] / MULTIPLE_DIRECTIONS, f = onward[k] / MULTIPLE_DIRECTIONS;
        table[at + k] = first / (1 - Math.min(f, 0.99));
      }
    }
  }
  return table;
}

/** The multiple-scattering table read at a height and star zenith cosine, bilinearly. */
function multipleAt(air: Air, table: Float32Array, heightM: number, sunMu: number, out: Vec3): void {
  const u = Math.sqrt(Math.max(0, Math.min(1, heightM / (air.topM - air.radiusM)))) * (MULTIPLE_SIZE - 1);
  const v = ((Math.max(-1, Math.min(1, sunMu)) + 1) / 2) * (MULTIPLE_SIZE - 1);
  const r0 = Math.min(MULTIPLE_SIZE - 2, Math.floor(u)), c0 = Math.min(MULTIPLE_SIZE - 2, Math.floor(v));
  const fu = u - r0, fv = v - c0;
  for (let k = 0; k < 3; k++) {
    const a = table[(r0 * MULTIPLE_SIZE + c0) * 3 + k], b = table[(r0 * MULTIPLE_SIZE + c0 + 1) * 3 + k];
    const c = table[((r0 + 1) * MULTIPLE_SIZE + c0) * 3 + k], e = table[((r0 + 1) * MULTIPLE_SIZE + c0 + 1) * 3 + k];
    out[k] = (a + (b - a) * fv) * (1 - fu) + (c + (e - c) * fv) * fu;
  }
}

/**
 * Starlight scattered towards a camera at radius r, looking at zenith cosine mu
 * and at azimuth phi from the star, with the star at zenith cosine sunMu; until
 * the ray leaves the air or meets the sphere at sea level.
 */
export function scatterAlong(air: Air, r: number, mu: number, phi: number, sunMu: number): Scattered {
  const rayleigh: Vec3 = [0, 0, 0], mie: Vec3 = [0, 0, 0], multiple: Vec3 = [0, 0, 0];
  r = Math.max(r, air.radiusM + MIN_CAMERA_HEIGHT_M);
  const R = air.radiusM;
  const sinMu = Math.sqrt(Math.max(0, 1 - mu * mu));
  const direction = [sinMu * Math.cos(phi), mu, sinMu * Math.sin(phi)];
  const sun = [Math.sqrt(Math.max(0, 1 - sunMu * sunMu)), sunMu, 0];
  const span = insideAir(air, r, mu);
  if (!span) return { rayleigh, mie, multiple };
  const { start, end } = span;
  const table = multipleScatteringTable(air);
  const again: Vec3 = [0, 0, 0];

  const length = end - start;
  const depth: Vec3 = [0, 0, 0];
  for (let i = 0; i < RAY_STEPS; i++) {
    const a = i / RAY_STEPS, z = (i + 1) / RAY_STEPS;
    const t = start + length * ((a * a + z * z) / 2);
    const ds = length * (z * z - a * a);
    const x = direction[0] * t, y = r + direction[1] * t, w = direction[2] * t;
    const rs = Math.sqrt(x * x + y * y + w * w);
    const h = Math.max(0, rs - R);
    const rayleighDensity = Math.exp(-h / air.rayleighHeightM);
    const mieDensity = Math.exp(-h / air.mieHeightM);
    const sunMuHere = (x * sun[0] + y * sun[1] + w * sun[2]) / rs;
    const toSun = columnsToSpace(air, rs, sunMuHere);
    multipleAt(air, table, h, sunMuHere, again);
    for (let k = 0; k < 3; k++) {
      const scattering = air.rayleigh[k] * rayleighDensity + air.mie * mieDensity;
      const step = scattering * ds;
      const seen = Math.exp(-(depth[k] + step / 2));
      const through = toSun ? seen * Math.exp(-(air.rayleigh[k] * toSun[0] + air.mie * toSun[1])) : 0;
      rayleigh[k] += air.rayleigh[k] * rayleighDensity * ds * through;
      mie[k] += air.mie * mieDensity * ds * through;
      multiple[k] += scattering * again[k] * ds * seen;
      depth[k] += step;
    }
  }
  return { rayleigh, mie, multiple };
}

/** Light scattered towards the viewer, from what a ray gathered, the angle to the star and the star's irradiance. */
export function radianceOf(scattered: Scattered, cosToStar: number, irradiance: Vec3): Vec3 {
  const pr = rayleighPhase(cosToStar), pm = miePhase(cosToStar);
  return [0, 1, 2].map((k) => irradiance[k] * (pr * scattered.rayleigh[k] + pm * scattered.mie[k] + scattered.multiple[k])) as Vec3;
}

/** The view's zenith angle at the horizon from radius r: below it, rays meet the ground. */
export function horizonZenith(air: Air, r: number): number {
  return Math.PI - Math.asin(Math.min(1, air.radiusM / Math.max(r, air.radiusM + MIN_CAMERA_HEIGHT_M)));
}

/** A sky-table row coordinate (0 overhead, ½ the horizon, 1 straight down) from a zenith angle. */
export function rowOfZenith(zenith: number, horizon: number): number {
  if (zenith < horizon) return 0.5 * (1 - Math.sqrt(1 - zenith / horizon));
  return 0.5 + 0.5 * Math.sqrt((zenith - horizon) / (Math.PI - horizon));
}

/** The zenith angle of a sky-table row coordinate (rowOfZenith's inverse). */
export function zenithOfRow(row: number, horizon: number): number {
  if (row < 0.5) {
    const s = 1 - 2 * row;
    return horizon * (1 - s * s);
  }
  const s = 2 * row - 1;
  return horizon + s * s * (Math.PI - horizon);
}

export interface SkyTable {
  /** RGBA per entry, SKY_COLUMNS × SKY_ROWS, row by row: Rayleigh light and Mie light, before phase. */
  rayleigh: Float32Array;
  mie: Float32Array;
  /** RGBA per entry: light scattered more than once (no phase: it comes from every direction). */
  multiple: Float32Array;
  /** The camera's radius and the star's zenith cosine the table is for. */
  r: number;
  sunMu: number;
  /** The zenith angle of the horizon the rows are packed around. */
  horizon: number;
}

/** An empty sky table for a camera at radius r, with the star at zenith cosine sunMu, to fill with fillSkyRows. */
export function emptySkyTable(air: Air, r: number, sunMu: number): SkyTable {
  return {
    rayleigh: new Float32Array(SKY_COLUMNS * SKY_ROWS * 4),
    mie: new Float32Array(SKY_COLUMNS * SKY_ROWS * 4),
    multiple: new Float32Array(SKY_COLUMNS * SKY_ROWS * 4),
    r, sunMu, horizon: horizonZenith(air, r),
  };
}

/** Fills rows from `from` up to (not including) `to`; the table can be filled a few rows at a time. */
export function fillSkyRows(air: Air, table: SkyTable, from: number, to: number): void {
  for (let row = from; row < Math.min(to, SKY_ROWS); row++) {
    const mu = Math.cos(zenithOfRow(row / (SKY_ROWS - 1), table.horizon));
    for (let column = 0; column < SKY_COLUMNS; column++) {
      const phi = (column / (SKY_COLUMNS - 1)) * Math.PI;
      const s = scatterAlong(air, table.r, mu, phi, table.sunMu);
      const at = (row * SKY_COLUMNS + column) * 4;
      table.rayleigh.set([...s.rayleigh, 1], at);
      table.mie.set([...s.mie, 1], at);
      table.multiple.set([...s.multiple, 1], at);
    }
  }
}

/** The sky table for a camera at radius r, with the star at zenith cosine sunMu. */
export function skyTable(air: Air, r: number, sunMu: number): SkyTable {
  const table = emptySkyTable(air, r, sunMu);
  fillSkyRows(air, table, 0, SKY_ROWS);
  return table;
}

/**
 * The sky's light falling on level ground at sea level, by the star's zenith
 * cosine from −1 to 1 (LIGHT_SIZE entries, RGBA), for a star of this irradiance.
 */
export function lightTable(air: Air, irradiance: Vec3): Float32Array {
  const table = new Float32Array(LIGHT_SIZE * 4);
  const r = air.radiusM + MIN_CAMERA_HEIGHT_M;
  const dMu = 1 / LIGHT_RINGS, dPhi = Math.PI / LIGHT_DIRECTIONS;
  for (let entry = 0; entry < LIGHT_SIZE; entry++) {
    const sunMu = -1 + (2 * entry) / (LIGHT_SIZE - 1);
    const sunSin = Math.sqrt(1 - sunMu * sunMu);
    const total: Vec3 = [0, 0, 0];
    for (let ring = 0; ring < LIGHT_RINGS; ring++) {
      const mu = (ring + 0.5) * dMu;
      for (let d = 0; d < LIGHT_DIRECTIONS; d++) {
        const phi = (d + 0.5) * dPhi;
        const cosToStar = mu * sunMu + Math.sqrt(1 - mu * mu) * Math.cos(phi) * sunSin;
        const light = radianceOf(scatterAlong(air, r, mu, phi, sunMu), cosToStar, irradiance);
        // Both sides of the star's vertical plane: twice the half sampled
        for (let k = 0; k < 3; k++) total[k] += 2 * light[k] * mu * dMu * dPhi;
      }
    }
    table.set([...total, 1], entry * 4);
  }
  return table;
}

/** The sky's light in one direction, for a camera at radius r and up `up`, with the star towards `sun` (unit vectors). */
export function skyRadiance(air: Air, r: number, up: Vec3, sun: Vec3, irradiance: Vec3, direction: Vec3): Vec3 {
  const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const mu = dot(direction, up), sunMu = dot(sun, up);
  const flat = (v: Vec3, m: number): Vec3 => [v[0] - up[0] * m, v[1] - up[1] * m, v[2] - up[2] * m];
  const a = flat(direction, mu), b = flat(sun, sunMu);
  const lengths = Math.sqrt(dot(a, a) * dot(b, b));
  const phi = lengths > 1e-9 ? Math.acos(Math.max(-1, Math.min(1, dot(a, b) / lengths))) : 0;
  return radianceOf(scatterAlong(air, r, mu, phi, sunMu), dot(direction, sun), irradiance);
}
