// A CPU copy of the black hole shader's light paths (shaders/blackHole.frag.glsl).
//
// Why it exists: a GPU shader cannot be unit-tested, and an error in its physics
// shows only as a picture that looks slightly wrong. This file repeats, line for
// line, the parts of the shader that decide where light goes and how it is
// shifted, so tests can hold them against exact Schwarzschild results: the
// shadow's size seen from a given distance, the bending of light that passes,
// and the shift of light from the disc.
//
// How: the same units (horizon radius r_s = 1), the same light-path equation,
// the same Verlet steps and step rule, the same weak-field hand-off at
// TRACE_RADIUS, and the same shift function. The gas's look (streaks, clumps,
// colour) is left out: it does not move light.
//
// Limits: it is a copy, so it proves the shader right only while the two agree.
// Change both together; the tests check the shared constants match.
//
// Presentation only: the simulation never reads it.

import type { BlackHoleQuality } from "./quality";

export type Vec3 = readonly [number, number, number];

/** Beyond this radius light is carried by the weak-field formula, not traced (the shader's TRACE_RADIUS). */
export const TRACE_RADIUS = 24;
/** The thin disc's inner edge: the innermost stable circular orbit (the shader's DISC_INNER). */
export const DISC_INNER = 3;
/** Gas inside the last stable orbit plunges; its speed is held below this share of light's (the shader's MAX_GAS_SPEED). */
export const MAX_GAS_SPEED = 0.7;

const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const scale = (a: Vec3, k: number): Vec3 => [a[0] * k, a[1] * k, a[2] * k];
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const length = (a: Vec3) => Math.sqrt(dot(a, a));
export const normalize = (a: Vec3): Vec3 => scale(a, 1 / length(a));

/** Weak-field bending of a near-straight ray, s along it from its closest point b: the deflection accrued from −∞ to s. */
export function weakBendTo(s: number, b: number): number {
  const r2 = s * s + b * b;
  return 1 / b + (s * (2 * s * s + 3 * b * b)) / (2 * b * r2 * Math.sqrt(r2));
}

/** A ray's direction, turned towards the hole by `angle`. */
export function bendToward(pos: Vec3, dir: Vec3, angle: number): Vec3 {
  const offset = add(pos, scale(dir, -dot(pos, dir)));
  if (dot(offset, offset) < 1e-12) return dir;
  return normalize(add(scale(dir, Math.cos(angle)), scale(normalize(offset), -Math.sin(angle))));
}

/** Where a ray from the camera ends: in the hole, out to the sky in `direction`, or still circling when the steps ran out (drawn dark). */
export interface RayFate {
  fate: "captured" | "escaped" | "circling";
  direction: Vec3;
}

/** The step settings a trace uses, as a quality level sets them. */
export type TraceSteps = Pick<BlackHoleQuality, "maxSteps" | "stepScale" | "minStep" | "maxStep">;

/**
 * A camera ray's coordinate direction, for a pixel looking along `screenDir` in the camera's own
 * (static observer's) frame: its radial part shrinks by √(1 − 1/r), so tan α = tan ψ / √(1 − 1/r).
 */
export function cameraRay(cameraPos: Vec3, screenDir: Vec3): Vec3 {
  const outward = normalize(cameraPos);
  const radial = dot(screenDir, outward);
  return normalize(add(screenDir, scale(outward, (Math.sqrt(1 - 1 / length(cameraPos)) - 1) * radial)));
}

/** Traces one camera ray, as the shader's main() does, without the gas. */
export function traceRay(cameraPos: Vec3, screenDir: Vec3, steps: TraceSteps): RayFate {
  const dir = cameraRay(cameraPos, screenDir);
  let pos = cameraPos;
  let vel = dir;

  const sNow = dot(pos, dir);
  const impact = length(add(pos, scale(dir, -sNow)));
  if (length(pos) > TRACE_RADIUS) {
    if (impact >= TRACE_RADIUS || sNow > 0) {
      return { fate: "escaped", direction: bendToward(pos, dir, (1 / impact) * 2 - weakBendTo(sNow, impact)) };
    }
    const sEntry = -Math.sqrt(TRACE_RADIUS * TRACE_RADIUS - impact * impact);
    const entryDir = bendToward(pos, dir, weakBendTo(sEntry, impact) - weakBendTo(sNow, impact));
    pos = add(pos, scale(dir, sEntry - sNow));
    vel = entryDir;
  }
  const h = cross(pos, vel);
  const h2 = dot(h, h);

  for (let i = 0; i < steps.maxSteps; i++) {
    const r = length(pos);
    if (r < 1) return { fate: "captured", direction: vel };
    if (r > TRACE_RADIUS && dot(pos, vel) > 0) {
      const v = normalize(vel);
      const sOut = dot(pos, v);
      const bOut = Math.max(length(add(pos, scale(v, -sOut))), 1e-3);
      return { fate: "escaped", direction: bendToward(pos, v, 2 / bOut - weakBendTo(sOut, bOut)) };
    }
    const dt = Math.min(Math.max(steps.stepScale * r * (r - 0.9), steps.minStep), steps.maxStep);
    const acc = scale(pos, (-1.5 * h2) / r ** 5);
    const nextPos = add(add(pos, scale(vel, dt)), scale(acc, 0.5 * dt * dt));
    const nr = length(nextPos);
    if (nr < 1) return { fate: "captured", direction: vel };
    const nextAcc = scale(nextPos, (-1.5 * h2) / nr ** 5);
    vel = add(vel, scale(add(acc, nextAcc), 0.5 * dt));
    pos = nextPos;
  }
  return { fate: "circling", direction: vel };
}

/**
 * The shift g of light from gas in circular orbit at radius r, leaving in the coordinate direction
 * `towardCamera`. The gas's speed is a static observer's measure there, so the light's angle to the
 * orbit is taken in that observer's frame: the direction's radial part stretched by 1/√(1 − 1/r).
 */
export function shiftFactor(p: Vec3, r: number, towardCamera: Vec3): number {
  const outward = normalize(p);
  const localDir = normalize(add(towardCamera, scale(outward, (1 / Math.sqrt(1 - 1 / r) - 1) * dot(towardCamera, outward))));
  const orbitDir = normalize(add([-p[2], 0, p[0]], [1e-6, 0, 0]));
  const beta = Math.min(Math.sqrt(0.5 / (r - 1)), MAX_GAS_SPEED);
  const doppler = Math.sqrt(1 - beta * beta) / (1 - beta * dot(orbitDir, localDir));
  return Math.sqrt(1 - 1 / r) * doppler;
}
