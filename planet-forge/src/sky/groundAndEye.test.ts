import { describe, expect, it } from "vitest";
import type { PlanetSpec } from "../spec/schema";
import type { Vec3 } from "../forge/icosphere";
import { presetSpec } from "../spec/presetFiles";
import { airOf } from "./air";
import { CLOUD_ALBEDO } from "./clouds";
import { adaptation, lightOnGround, MAX_ADAPTATION } from "./exposure";
import { groundAlbedo } from "./groundAlbedo";
import { lightTable, skyRadiance } from "./scattering";

const earth = presetSpec("earth-like");
const DEGREE = Math.PI / 180;
const luminance = (c: number[]) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];

function variant(spec: PlanetSpec, change: (s: PlanetSpec) => void): PlanetSpec {
  const copy = structuredClone(spec);
  change(copy);
  return copy;
}

const clear = (spec: PlanetSpec) => variant(spec, (s) => { s.air.cloudCover = 0; });

describe("the planet as the air sees it", () => {
  it("is the ground's mean colour, then the clouds over the spec's share", () => {
    const ground = luminance(groundAlbedo(clear(earth)));
    expect(ground).toBeGreaterThan(0.1);
    expect(ground).toBeLessThan(0.3);
    expect(luminance(groundAlbedo(earth))).toBeCloseTo((1 - 0.6) * ground + 0.6 * CLOUD_ALBEDO, 6);
    for (const k of groundAlbedo(variant(earth, (s) => { s.air.cloudCover = 1; }))) expect(k).toBeCloseTo(CLOUD_ALBEDO, 9);
  });

  it("is dark over oceans and bright over ice", () => {
    const ocean = luminance(groundAlbedo(clear(presetSpec("ocean"))));
    const desert = luminance(groundAlbedo(clear(presetSpec("desert"))));
    const ice = luminance(groundAlbedo(clear(presetSpec("ice"))));
    expect(ocean).toBeLessThan(0.05);
    expect(desert).toBeGreaterThan(ocean);
    expect(ice).toBeGreaterThan(desert);
  });

  it("brightens the sky: the Earth-like zenith a quarter to a half as bright as sunlit sand", () => {
    const sun: Vec3 = [Math.cos(45 * DEGREE), Math.sin(45 * DEGREE), 0];
    const zenith = (albedo: Vec3) => {
      const air = airOf(earth, albedo);
      return luminance(skyRadiance(air, air.radiusM + 2, [0, 1, 0], sun, [3, 3, 3], [0, 1, 0]));
    };
    const black = zenith([0, 0, 0]), lit = zenith(groundAlbedo(earth));
    expect(lit).toBeGreaterThan(1.1 * black);
    // Sand of albedo 0.32 under the same star, before the air dims it: a lower bound on its brightness
    const sand = (0.32 * 3 * Math.sin(45 * DEGREE)) / Math.PI;
    expect(lit / sand).toBeGreaterThan(0.2);
    expect(lit / sand).toBeLessThan(0.5);
  });
});

describe("the eye's adaptation", () => {
  const air = airOf(earth, groundAlbedo(earth));
  const irradiance: Vec3 = [3, 3, 3];
  const table = lightTable(air, irradiance);
  const light = (elevationDeg: number) => lightOnGround(air, irradiance, table, Math.sin(elevationDeg * DEGREE), 0.001);

  it("is daylight's under a star 45° up on the Earth-like world, and a little less at noon", () => {
    expect(adaptation(light(45))).toBeCloseTo(1, 1);
    expect(adaptation(light(90))).toBeLessThan(1);
    expect(adaptation(light(90))).toBeGreaterThan(0.7);
  });

  it("makes a sixteenth of the light look half as bright, from a dim star or the evening alike", () => {
    const L = light(60);
    expect((adaptation(L / 16) * (L / 16)) / (adaptation(L) * L)).toBeCloseTo(0.5, 9);
  });

  it("rises through the evening, reaches its limit in twilight, and stops there", () => {
    expect(adaptation(light(5))).toBeGreaterThan(adaptation(light(45)));
    expect(adaptation(light(-1))).toBeLessThan(MAX_ADAPTATION);
    expect(adaptation(light(-5))).toBe(MAX_ADAPTATION);
    expect(adaptation(light(-20))).toBe(MAX_ADAPTATION);
  });
});
