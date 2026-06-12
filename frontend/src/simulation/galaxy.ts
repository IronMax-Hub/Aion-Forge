import { createRNG } from "./rng";
import type { RNG } from "./rng";

export type GalaxyType = "spiral" | "elliptical" | "irregular";

export interface GalaxyConfig {
  type: GalaxyType;
  particleCount: number;
  seed: number;
  scale: number;
}

export interface GalaxyParticles {
  positions: Float32Array; // x,y,z triples
  colors: Float32Array;    // r,g,b triples
  config: GalaxyConfig;
}

// ── helpers ──────────────────────────────────────────────────────────────────

function hsl(h: number, s: number, l: number): [number, number, number] {
  // h 0-1, s 0-1, l 0-1 → r,g,b 0-1
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const hue2rgb = (t: number) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  return [hue2rgb(h + 1 / 3), hue2rgb(h), hue2rgb(h - 1 / 3)];
}

// ── spiral ───────────────────────────────────────────────────────────────────

function generateSpiral(rng: RNG, count: number, scale: number): GalaxyParticles {
  const arms = 2;
  const spin = 1.2;
  const spread = 0.35;
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);

  for (let i = 0; i < count; i++) {
    const r = rng();
    const arm = Math.floor(r * arms);
    const t = rng();
    const radius = t * scale;
    const angle = (arm / arms) * Math.PI * 2 + t * Math.PI * 2 * spin;
    const scatter = (rng() - 0.5) * spread * radius;
    const x = Math.cos(angle) * radius + scatter;
    const z = Math.sin(angle) * radius + scatter;
    const y = (rng() - 0.5) * scale * 0.06 * (1 - t * 0.7);

    positions[i * 3]     = x;
    positions[i * 3 + 1] = y;
    positions[i * 3 + 2] = z;

    // Core bright white-blue → arm blue-purple → edge dim
    const dist = Math.sqrt(x * x + z * z) / scale;
    const hue = 0.58 + dist * 0.1 + rng() * 0.05;
    const sat = 0.4 + rng() * 0.3;
    const lit = 0.5 + (1 - dist) * 0.4 + rng() * 0.1;
    const [cr, cg, cb] = hsl(hue, sat, lit);
    colors[i * 3]     = cr;
    colors[i * 3 + 1] = cg;
    colors[i * 3 + 2] = cb;
  }

  return { positions, colors, config: { type: "spiral", particleCount: count, seed: 0, scale } };
}

// ── elliptical ───────────────────────────────────────────────────────────────

function generateElliptical(rng: RNG, count: number, scale: number): GalaxyParticles {
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const flatness = 0.45 + rng() * 0.3;

  for (let i = 0; i < count; i++) {
    // Reject sampling for spherical shell distribution
    let x = 0, y = 0, z = 0;
    do {
      x = (rng() - 0.5) * 2;
      y = (rng() - 0.5) * 2;
      z = (rng() - 0.5) * 2;
    } while (x * x + y * y + z * z > 1);

    const r = Math.pow(rng(), 0.5); // concentrate toward center
    x *= r * scale;
    y *= r * scale * flatness;
    z *= r * scale;

    positions[i * 3]     = x;
    positions[i * 3 + 1] = y;
    positions[i * 3 + 2] = z;

    const dist = Math.sqrt(x * x + y * y + z * z) / scale;
    const hue = 0.08 + rng() * 0.06;
    const sat = 0.2 + rng() * 0.2;
    const lit = 0.6 + (1 - dist) * 0.3 + rng() * 0.1;
    const [cr, cg, cb] = hsl(hue, sat, lit);
    colors[i * 3]     = cr;
    colors[i * 3 + 1] = cg;
    colors[i * 3 + 2] = cb;
  }

  return { positions, colors, config: { type: "elliptical", particleCount: count, seed: 0, scale } };
}

// ── irregular ────────────────────────────────────────────────────────────────

function generateIrregular(rng: RNG, count: number, scale: number): GalaxyParticles {
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const clumps = Math.floor(3 + rng() * 5);

  // Pick random clump centers
  const cx = Array.from({ length: clumps }, () => (rng() - 0.5) * scale * 1.2);
  const cy = Array.from({ length: clumps }, () => (rng() - 0.5) * scale * 0.4);
  const cz = Array.from({ length: clumps }, () => (rng() - 0.5) * scale * 1.2);
  const cr = Array.from({ length: clumps }, () => 0.2 + rng() * 0.5);

  for (let i = 0; i < count; i++) {
    const c = Math.floor(rng() * clumps);
    const r = cr[c] * scale;
    const x = cx[c] + (rng() - 0.5) * r;
    const y = cy[c] + (rng() - 0.5) * r * 0.3;
    const z = cz[c] + (rng() - 0.5) * r;

    positions[i * 3]     = x;
    positions[i * 3 + 1] = y;
    positions[i * 3 + 2] = z;

    const hue = 0.5 + rng() * 0.35;
    const sat = 0.3 + rng() * 0.4;
    const lit = 0.45 + rng() * 0.35;
    const [red, green, blue] = hsl(hue, sat, lit);
    colors[i * 3]     = red;
    colors[i * 3 + 1] = green;
    colors[i * 3 + 2] = blue;
  }

  return { positions, colors, config: { type: "irregular", particleCount: count, seed: 0, scale } };
}

// ── public API ───────────────────────────────────────────────────────────────

export function generateGalaxy(config: GalaxyConfig): GalaxyParticles {
  const rng = createRNG(config.seed);
  let result: GalaxyParticles;

  switch (config.type) {
    case "spiral":
      result = generateSpiral(rng, config.particleCount, config.scale);
      break;
    case "elliptical":
      result = generateElliptical(rng, config.particleCount, config.scale);
      break;
    case "irregular":
      result = generateIrregular(rng, config.particleCount, config.scale);
      break;
  }

  result.config = config;
  return result;
}

export function pickGalaxyType(rng: RNG): GalaxyType {
  const roll = rng();
  if (roll < 0.55) return "spiral";
  if (roll < 0.85) return "elliptical";
  return "irregular";
}
