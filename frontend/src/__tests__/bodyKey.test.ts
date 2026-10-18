import { describe, it, expect } from "vitest";
import { bodyKey, moonKey, MOON_TAG, planetKey } from "../simulation/bodyKey";
import { mixSeed } from "../simulation/rng";

describe("body keys (MO1)", () => {
  it("keep a planet's key parts exactly as before: its star and its index", () => {
    expect(bodyKey({ hostStarId: 1300, id: 2 })).toEqual([1300, 2]);
    expect(mixSeed(42, ...bodyKey({ hostStarId: 1300, id: 2 }), 7)).toBe(mixSeed(42, 1300, 2, 7));
  });

  it("give a moon its own parts, after its planet's", () => {
    expect(bodyKey({ hostStarId: 1300, id: 2, moonIndex: 0 })).toEqual([1300, 2, MOON_TAG, 0]);
  });

  it("are unique across planets and moons", () => {
    const streams = new Set<number>();
    const keys = new Set<string>();
    for (let star = 0; star < 40; star++) {
      for (let planet = 0; planet < 8; planet++) {
        streams.add(mixSeed(42, ...bodyKey({ hostStarId: star, id: planet }), 0x5a17));
        keys.add(planetKey(star, planet));
        for (let moon = 0; moon < 6; moon++) {
          streams.add(mixSeed(42, ...bodyKey({ hostStarId: star, id: planet, moonIndex: moon }), 0x5a17));
          keys.add(moonKey(star, planet, moon));
        }
      }
    }
    expect(streams.size).toBe(40 * 8 * 7);
    expect(keys.size).toBe(40 * 8 * 7);
    expect(moonKey(1300, 2, 1)).toBe("1300-2-m1");
  });
});
