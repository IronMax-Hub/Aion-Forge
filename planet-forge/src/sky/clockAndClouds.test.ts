import { describe, expect, it } from "vitest";
import type { PlanetSpec } from "../spec/schema";
import { presetSpec } from "../spec/presetFiles";
import { airOf } from "./air";
import { CLOUD_MAP_HEIGHT, CLOUD_MAP_WIDTH, cloudHeightM, cloudMap, cloudMapArea } from "./clouds";
import {
  arrivalSubsolar, daysUntilLocalTime, localTime, solarDayHours, starElevationDeg, starMoves, subsolarAt, sunDirectionAt,
} from "./dayClock";

const earth = presetSpec("earth-like");

function variant(spec: PlanetSpec, change: (s: PlanetSpec) => void): PlanetSpec {
  const copy = structuredClone(spec);
  change(copy);
  return copy;
}

const withArrival = variant(earth, (s) => {
  s.landing = { latitudeDeg: 10, longitudeDeg: 20, subsolar: { latitudeDeg: 15, longitudeDeg: 50 } };
});

describe("the time of day", () => {
  it("has a solar day a little longer than the sidereal day, and Venus's long one when spinning backwards", () => {
    expect(solarDayHours(earth)).toBeCloseTo(24 / (1 - 24 / (365.25 * 24)), 9);
    const venus = variant(earth, (s) => { s.body.rotationHours = 5832.5; s.body.axialTiltDeg = 177.4; s.orbit.periodYears = 0.6152; });
    expect(solarDayHours(venus) / 24).toBeCloseTo(116.75, 0);
  });

  it("starts with the star over the spec's subsolar point, or over latitude 0, longitude 0", () => {
    expect(arrivalSubsolar(withArrival)).toEqual({ latitudeDeg: 15, longitudeDeg: 50 });
    expect(arrivalSubsolar(earth)).toEqual({ latitudeDeg: 0, longitudeDeg: 0 });
  });

  it("moves the star's point west through a day, at a fixed latitude, and back after a whole day", () => {
    expect(subsolarAt(withArrival, 0.25)).toEqual({ latitudeDeg: 15, longitudeDeg: -40 });
    expect(subsolarAt(withArrival, 0.5).longitudeDeg).toBeCloseTo(-130, 9);
    const start = sunDirectionAt(withArrival, 0), later = sunDirectionAt(withArrival, 3);
    for (let k = 0; k < 3; k++) expect(later[k]).toBeCloseTo(start[k], 9);
  });

  it("keeps a locked world's star still, at a height set by the site's distance from the substellar point", () => {
    const lava = presetSpec("lava");
    expect(lava.body.tidallyLocked).toBe(true);
    expect(starMoves(lava)).toBe(false);
    expect(subsolarAt(lava, 0.37)).toEqual(subsolarAt(lava, 0));
    const substellar = subsolarAt(lava, 0);
    expect(starElevationDeg(substellar, substellar)).toBeCloseTo(90, 6);
    expect(starElevationDeg({ latitudeDeg: 0, longitudeDeg: substellar.longitudeDeg + 60 }, substellar)).toBeCloseTo(30, 6);
    expect(starElevationDeg({ latitudeDeg: 0, longitudeDeg: substellar.longitudeDeg - 90 }, substellar)).toBeCloseTo(0, 6);
  });

  it("gives noon under the star, afternoon east of it, and finds a chosen local time", () => {
    const subsolar = { latitudeDeg: 0, longitudeDeg: 50 };
    expect(localTime(subsolar, 50)).toBeCloseTo(0.5, 12);
    expect(localTime(subsolar, 140)).toBeCloseTo(0.75, 12);
    expect(localTime(subsolar, -130)).toBeCloseTo(0, 12);
    for (const time of [0, 0.2, 0.5, 0.9]) {
      const days = daysUntilLocalTime(withArrival, 20, time);
      expect(days).toBeGreaterThanOrEqual(0);
      expect(days).toBeLessThan(1);
      const t = localTime(subsolarAt(withArrival, days), 20);
      expect(Math.min(Math.abs(t - time), 1 - Math.abs(t - time))).toBeLessThan(1e-9);
    }
  });
});

describe("the clouds", () => {
  const share = (margins: Float32Array) => {
    let area = 0;
    for (let k = 0; k < margins.length; k++) if (margins[k] > 0) area += cloudMapArea(Math.floor(k / CLOUD_MAP_WIDTH));
    return area;
  };

  it("weighs the map's entries by the area they stand for", () => {
    let total = 0;
    for (let row = 0; row < CLOUD_MAP_HEIGHT; row++) total += cloudMapArea(row) * CLOUD_MAP_WIDTH;
    expect(total).toBeCloseTo(1, 9);
  });

  it("clouds over the spec's share of the planet, none or all at the ends", () => {
    for (const cover of [0, 0.1, 0.6, 0.95, 1]) {
      const margins = cloudMap(variant(earth, (s) => { s.air.cloudCover = cover; }));
      expect(Math.abs(share(margins) - cover)).toBeLessThan(1e-3);
    }
  });

  it("is the same for the same seed and different for another", () => {
    const a = cloudMap(earth), b = cloudMap(earth), c = cloudMap(variant(earth, (s) => { s.seed += 1; }));
    expect(a).toEqual(b);
    expect(a).not.toEqual(c);
  });

  it("lies a quarter of the air's scale height up: about 2 km on the Earth-like world", () => {
    const height = cloudHeightM(airOf(earth));
    expect(height).toBeGreaterThan(1900);
    expect(height).toBeLessThan(2300);
  });
});
