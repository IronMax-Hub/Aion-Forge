import { describe, it, expect } from "vitest";
import { rootFor, snapToScale, universeKey } from "../audio/scene";

describe("universeKey", () => {
  it("is the same for the same universe", () => {
    expect(universeKey(100000, "spiral")).toEqual(universeKey(100000, "spiral"));
  });

  it("gives every tonic across seeds, each a pitch class", () => {
    const tonics = new Set<number>();
    for (let seed = 0; seed < 500; seed++) {
      const { tonic } = universeKey(seed, "spiral");
      expect(Number.isInteger(tonic) && tonic >= 0 && tonic < 12).toBe(true);
      tonics.add(tonic);
    }
    expect(tonics.size).toBe(12);
  });

  it("takes the tonic from the seed and the scale from the galaxy's shape", () => {
    const spiral = universeKey(42, "spiral");
    const elliptical = universeKey(42, "elliptical");
    expect(elliptical.tonic).toBe(spiral.tonic);
    expect(elliptical.scale).not.toEqual(spiral.scale);
    expect(elliptical.pace).toBeGreaterThan(spiral.pace);
  });
});

describe("snapToScale", () => {
  const minor = [0, 2, 3, 5, 7, 8, 10];
  const wholeTone = [0, 2, 4, 6, 8, 10];

  it("leaves notes of the scale alone, in any octave", () => {
    for (const note of [0, 7, 12, 14, 19, 24]) expect(snapToScale(note, minor)).toBe(note);
  });

  it("moves notes outside the scale to the nearest, a tie going down", () => {
    expect(snapToScale(4, minor)).toBe(3);    // major third → minor third (tie 3/5)
    expect(snapToScale(16, minor)).toBe(15);  // an octave up, the same
    expect(snapToScale(7, wholeTone)).toBe(6); // the fifth → tritone (tie 6/8)
    expect(snapToScale(11, minor)).toBe(10);  // tie between 10 and the next tonic
    expect(snapToScale(11, [0, 2, 4, 5, 7, 9])).toBe(12); // nearest is the next tonic
  });
});

describe("rootFor", () => {
  it("puts the tonic in the octave starting at the register", () => {
    for (let tonic = 0; tonic < 12; tonic++) {
      const root = rootFor(45, tonic);
      expect(root).toBeGreaterThanOrEqual(45);
      expect(root).toBeLessThan(57);
      expect(root % 12).toBe(tonic);
    }
  });
});
