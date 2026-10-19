import { describe, it, expect } from "vitest";
import { searchStars } from "../ui/starSearch";
import type { SurveyFacts } from "../ui/starSearch";
import { generateStarsFor, UNIVERSE_AGE_GYR } from "../simulation/star";
import { buildGalaxyConfig } from "../simulation/galaxy";
import { makeConfig } from "../simulation/config";
import { spectralType } from "../ui/format";

const config = makeConfig(100000);
const stars = generateStarsFor(buildGalaxyConfig(100000, config), UNIVERSE_AGE_GYR, config).stars;
const facts: SurveyFacts = { living: new Set([3, 416, 900]), civilized: new Set([416]), withPlanets: new Set([3, 416, 900, 1200]) };

describe("the star search", () => {
  it("finds a star by its number, however written", () => {
    for (const q of ["416", "0416", "Star 0416", "star 416"]) expect(searchStars(q, stars, null).stars.map((s) => s.id)).toEqual([416]);
  });

  it("finds nothing for an empty query", () => {
    expect(searchStars("  ", stars, null).stars).toEqual([]);
  });

  it("narrows by every trait at once", () => {
    const binaries = searchStars("binary", stars, null).stars;
    expect(binaries.length).toBe(stars.filter((s) => s.companion).length);
    const gBinaries = searchStars("g binary", stars, null).stars;
    expect(gBinaries.length).toBeGreaterThan(0);
    for (const s of gBinaries) {
      expect(s.companion).not.toBeNull();
      expect(spectralType(s.temperature, s.classification)?.startsWith("G")).toBe(true);
    }
    expect(gBinaries.length).toBeLessThan(binaries.length);
  });

  it("reads spectral subtypes and two-word classes", () => {
    for (const s of searchStars("K2", stars, null).stars) expect(spectralType(s.temperature, s.classification)?.startsWith("K2")).toBe(true);
    const giants = searchStars("red giants", stars, null).stars;
    expect(giants.length).toBe(stars.filter((s) => s.classification === "red-giant").length);
    expect(searchStars("white dwarf", stars, null).stars.every((s) => s.classification === "white-dwarf")).toBe(true);
  });

  it("uses the life survey's facts, and says when they are not known yet", () => {
    expect(searchStars("life", stars, facts).stars.map((s) => s.id)).toEqual([3, 416, 900]);
    expect(searchStars("civilization 416", stars, facts).stars.map((s) => s.id)).toEqual([416]);
    const waiting = searchStars("binary life", stars, null);
    expect(waiting.stars).toEqual([]);
    expect(waiting.waitingForSurvey).toEqual(["life"]);
  });

  it("reports words it does not know rather than ignoring them", () => {
    const result = searchStars("binary purple", stars, null);
    expect(result.unknown).toEqual(["purple"]);
    expect(result.stars).toEqual([]);
  });
});
