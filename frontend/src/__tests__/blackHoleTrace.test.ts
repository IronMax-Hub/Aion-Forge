import { describe, expect, it } from "vitest";
import fragmentShader from "../rendering/blackHole/shaders/blackHole.frag.glsl?raw";
import { BLACK_HOLE_DISTANCE } from "../rendering/blackHole/BlackHoleView";
import { BLACK_HOLE_QUALITY } from "../rendering/blackHole/quality";
import {
  DISC_INNER, MAX_GAS_SPEED, normalize, shiftFactor, TRACE_RADIUS, traceRay,
} from "../rendering/blackHole/traceReference";
import type { Vec3 } from "../rendering/blackHole/traceReference";

// The CPU copy of the shader's light paths (traceReference.ts) against exact
// Schwarzschild results, in units of the horizon radius r_s = 1.

/** The critical impact parameter: light aimed closer than this falls in (3√3/2 r_s). */
const CRITICAL_IMPACT = (3 * Math.sqrt(3)) / 2;
const STANDARD = BLACK_HOLE_QUALITY.standard;

/** The angular radius of the shadow a static observer at r sees, exactly: sin ψ = (b_c / r)·√(1 − 1/r). */
const exactShadow = (r: number) => Math.asin((CRITICAL_IMPACT / r) * Math.sqrt(1 - 1 / r));

/** The shadow's angular radius in the traced picture, from a camera at r looking at the hole: bisected to where rays stop escaping. */
function tracedShadow(r: number): number {
  let lo = 0;
  let hi = Math.PI / 2;
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    if (traceRay([0, 0, r], [Math.sin(mid), 0, -Math.cos(mid)], STANDARD).fate === "escaped") hi = mid;
    else lo = mid;
  }
  return (lo + hi) / 2;
}

/** The exact deflection of light passing at impact parameter b: 2∫₀^u₀ du / √(1/b² − u² + u³) − π. */
function exactDeflection(b: number): number {
  const g = (u: number) => 1 / (b * b) - u * u + u * u * u;
  // u₀, the turning point: the root of g below 2/3, where g falls through zero
  let lo = 0;
  let hi = 2 / 3;
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2;
    if (g(mid) > 0) lo = mid;
    else hi = mid;
  }
  const u0 = lo;
  // u = u₀(1 − t²) takes away the integrand's square-root blow-up at u₀; Simpson's rule over t in 0–1
  const slopeAtTurn = -2 * u0 + 3 * u0 * u0;
  const integrand = (t: number) => (t === 0 ? 2 / Math.sqrt(-slopeAtTurn / u0) : (2 * u0 * t) / Math.sqrt(g(u0 * (1 - t * t))));
  const n = 20000;
  let sum = 0;
  for (let i = 0; i <= n; i++) sum += integrand(i / n) * (i === 0 || i === n ? 1 : i % 2 === 1 ? 4 : 2);
  return (2 * sum) / (3 * n) - Math.PI;
}

/** How far light aimed along −z from far away, passing at impact parameter b, is bent by the traced path. */
function tracedDeflection(b: number): number {
  const out = traceRay([b, 0, 1e5], [0, 0, -1], STANDARD).direction;
  return Math.acos(-normalize(out)[2]);
}

describe("the black hole's light paths (CPU copy of the shader)", () => {
  it("shares its constants with the shader", () => {
    expect(fragmentShader).toContain(`const float TRACE_RADIUS = ${TRACE_RADIUS.toFixed(1)};`);
    expect(fragmentShader).toContain(`const float DISC_INNER = ${DISC_INNER.toFixed(1)};`);
    expect(fragmentShader).toContain(`const float MAX_GAS_SPEED = ${MAX_GAS_SPEED};`);
  });

  it("captures light aimed just inside the critical impact parameter, and lets light just outside it go", () => {
    const aimed = (b: number) => traceRay([b, 0, 1e5], [0, 0, -1], STANDARD).fate;
    expect(aimed(CRITICAL_IMPACT * 0.995)).not.toBe("escaped");
    expect(aimed(CRITICAL_IMPACT * 1.005)).toBe("escaped");
  });

  it("bends passing light by the exact Schwarzschild angle, to within 1 %, where it is traced (b = 4–20)", () => {
    for (const b of [4, 6, 10, 20]) expect(Math.abs(tracedDeflection(b) / exactDeflection(b) - 1)).toBeLessThan(0.01);
  });

  it("bends light that never enters the trace radius by the weak-field 2 r_s / b", () => {
    // To a part in 10⁴: the camera, a static observer 10⁵ r_s out, aims a part in 10⁵ differently from a coordinate ray
    for (const b of [30, 100]) expect(Math.abs(tracedDeflection(b) * b / 2 - 1)).toBeLessThan(1e-4);
  });

  // Before B3 the camera's rays started in coordinate directions, and the shadow was drawn
  // too large: by 8.6 % at 6 r_s, 1.7 % at 34 and 0.6 % at 120
  it("draws the shadow as a static observer sees it, to within 1 %, across the camera's range", () => {
    for (const r of [BLACK_HOLE_DISTANCE.min, 10, BLACK_HOLE_DISTANCE.start, BLACK_HOLE_DISTANCE.max]) {
      expect(Math.abs(tracedShadow(r) / exactShadow(r) - 1)).toBeLessThan(0.01);
    }
  });

  it("gives gas at the innermost stable orbit half light's speed, and its exact shift face-on, approaching and receding", () => {
    const p: Vec3 = [DISC_INNER, 0, 0];   // the gas here orbits along +z
    const beta = 0.5;
    const redshift = Math.sqrt(1 - 1 / DISC_INNER);
    const gamma = 1 / Math.sqrt(1 - beta * beta);
    expect(shiftFactor(p, DISC_INNER, [0, 1, 0])).toBeCloseTo(redshift / gamma, 5);
    expect(shiftFactor(p, DISC_INNER, [0, 0, 1])).toBeCloseTo(redshift / (gamma * (1 - beta)), 5);
    expect(shiftFactor(p, DISC_INNER, [0, 0, -1])).toBeCloseTo(redshift / (gamma * (1 + beta)), 5);
  });
});
