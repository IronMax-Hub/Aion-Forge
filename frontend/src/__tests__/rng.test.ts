import { describe, it, expect } from "vitest";
import { mixSeed, SALT } from "../simulation/rng";

describe("mixSeed", () => {
  it("is deterministic", () => {
    expect(mixSeed(42, 7, 3, SALT.BIO)).toBe(mixSeed(42, 7, 3, SALT.BIO));
  });

  it("returns an unsigned 32-bit integer", () => {
    for (const parts of [[0], [1, 2, 3], [0xFFFFFFFF, 0xFFFFFFFF], [123456789, 2000, 8]]) {
      const h = mixSeed(parts[0], ...parts.slice(1));
      expect(Number.isInteger(h)).toBe(true);
      expect(h).toBeGreaterThanOrEqual(0);
      expect(h).toBeLessThan(2 ** 32);
    }
  });

  it("depends on the order of its parts, so star 2 / planet 5 and star 5 / planet 2 differ", () => {
    expect(mixSeed(100000, 2, 5, SALT.BIO)).not.toBe(mixSeed(100000, 5, 2, SALT.BIO));
    for (let a = 0; a < 50; a++) {
      for (let b = a + 1; b < 50; b++) {
        expect(mixSeed(42, a, b, SALT.BIO)).not.toBe(mixSeed(42, b, a, SALT.BIO));
      }
    }
  });

  it("gives every star and planet in a galaxy its own stream", () => {
    const seen = new Set<number>();
    for (let star = 0; star < 2000; star++) {
      for (let planet = 0; planet < 10; planet++) seen.add(mixSeed(100000, star, planet, SALT.BIO));
    }
    expect(seen.size).toBe(20000);
  });

  it("separates subsystems that share the same ids", () => {
    expect(mixSeed(42, 7, 3, SALT.BIO)).not.toBe(mixSeed(42, 7, 3, SALT.CIV));
  });

  // χ² over 256 buckets (255 degrees of freedom). The 0.1% critical value is
  // about 330; a uniform hash averages 255. Deterministic, so never flaky.
  it("spreads 100,000 mixed seeds uniformly across both the high and low bits", () => {
    const BUCKETS = 256;
    const N = 100_000;
    const high = new Array<number>(BUCKETS).fill(0);
    const low = new Array<number>(BUCKETS).fill(0);
    for (let i = 0; i < N; i++) {
      const h = mixSeed(100000, i % 2000, Math.floor(i / 2000), SALT.BIO);
      high[h >>> 24]++;
      low[h & 0xFF]++;
    }
    const expected = N / BUCKETS;
    const chiSquared = (counts: number[]) =>
      counts.reduce((sum, c) => sum + (c - expected) ** 2 / expected, 0);
    expect(chiSquared(high)).toBeLessThan(330);
    expect(chiSquared(low)).toBeLessThan(330);
  });
});

describe("Salts", () => {
  it("are all distinct", () => {
    const values = Object.values(SALT);
    expect(new Set(values).size).toBe(values.length);
  });
});
