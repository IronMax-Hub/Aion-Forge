import { describe, it, expect } from "vitest";
import { planetColour, rootFor, snapToScale, subjectSeed, systemColour, universeKey } from "../audio/scene";

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

describe("systemColour", () => {
  it("leaves a Sun-like star near the view's own register and brightness", () => {
    const sun = systemColour("7", 5800, 8);
    expect(sun.registerShift).toBe(0);
    expect(sun.brightness).toBeCloseTo(1, 5);
  });

  it("puts red dwarfs low and dark and blue stars high and bright, within bounds", () => {
    const red = systemColour("1", 3000, 2);
    const blue = systemColour("2", 30000, 2);
    expect(red.registerShift!).toBeLessThan(0);
    expect(red.brightness!).toBeLessThan(1);
    expect(blue.registerShift!).toBeGreaterThan(0);
    expect(blue.brightness!).toBeGreaterThan(1);
    const coldest = systemColour("3", 100, 0);
    const hottest = systemColour("4", 1e6, 0);
    expect(coldest.registerShift).toBe(-7);
    expect(hottest.registerShift).toBe(10);
    expect(coldest.brightness).toBe(0.6);
    expect(hottest.brightness).toBe(1.8);
  });

  it("gives one voice per two planets, from 1 to 4", () => {
    expect([0, 1, 2, 3, 4, 5, 7, 12].map((n) => systemColour("5", 5800, n).voices))
      .toEqual([1, 1, 1, 2, 2, 3, 4, 4]);
  });

  it("seeds by the star, the same star always the same", () => {
    expect(systemColour("9", 4000, 3)).toEqual(systemColour("9", 4000, 3));
    expect(systemColour("9", 4000, 3).subject).not.toBe(systemColour("10", 4000, 3).subject);
  });
});

describe("planetColour", () => {
  it("has no wind without air, and more and darker wind as the air thickens", () => {
    expect(planetColour("1-0", 0, 0).wind).toBe(0);
    expect(planetColour("1-0", 0.005, 0).wind).toBe(0);
    const earth = planetColour("1-1", 1, 0.7);
    const venus = planetColour("1-2", 90, 0);
    expect(earth.wind).toBeCloseTo(0.5, 5);
    expect(venus.wind!).toBeGreaterThan(earth.wind!);
    expect(venus.windShade!).toBeLessThan(earth.windShade!);
    expect(planetColour("1-3", 1e4, 0).wind).toBe(1);
  });

  it("treats a giant as the thickest air, darkening the wind only to half", () => {
    expect(planetColour("1-4", null, 0).wind).toBe(1);
    expect(planetColour("1-4", null, 0).windShade).toBe(0.5);
  });

  it("makes waves from the ocean share", () => {
    expect(planetColour("1-5", 1, 0).waves).toBe(0);
    expect(planetColour("1-5", 1, 0.7).waves).toBe(0.7);
  });
});

describe("subjectSeed", () => {
  it("is stable and tells keys apart", () => {
    expect(subjectSeed("12-3")).toBe(subjectSeed("12-3"));
    expect(subjectSeed("12-3")).not.toBe(subjectSeed("12-4"));
  });
});
