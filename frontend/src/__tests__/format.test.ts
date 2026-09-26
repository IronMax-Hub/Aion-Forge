import { describe, it, expect } from "vitest";
import {
  spectralType, planetName, starName, formatSig, formatGyr, formatInt, niceScaleLength, formatLightYears,
  formatGravity, formatPressure, formatRotation, formatTilt, formatPercent, wholePercents, formatSurfaceShares, formatTemperatureRange,
} from "../ui/format";

describe("spectralType", () => {
  it("types the Sun as G2 V", () => {
    expect(spectralType(5772, "main-sequence")).toBe("G2 V");
  });

  it("covers the hot and cool ends of the sequence", () => {
    expect(spectralType(42000, "main-sequence")).toMatch(/^O\d V$/);
    expect(spectralType(3000, "main-sequence")).toMatch(/^M\d V$/);
  });

  it("marks giants as luminosity class III and leaves protostars unclassed", () => {
    expect(spectralType(4200, "red-giant")).toMatch(/^K\d III$/);
    expect(spectralType(3000, "protostar")).toMatch(/^M\d$/);
  });

  it("gives no spectral type to stellar remnants", () => {
    expect(spectralType(20000, "white-dwarf")).toBeNull();
    expect(spectralType(500000, "neutron-star")).toBeNull();
    expect(spectralType(0, "black-hole")).toBeNull();
  });
});

describe("designations", () => {
  it("pads star IDs to four digits", () => {
    expect(starName(6)).toBe("Star 0006");
  });

  it("letters planets from b outward", () => {
    expect(planetName(6, 0)).toBe("0006 b");
    expect(planetName(6, 7)).toBe("0006 i");
  });
});

describe("number formatting", () => {
  it("uses significant figures and thousands separators", () => {
    expect(formatSig(0.0962846)).toBe("0.0963");
    expect(formatSig(53.2146)).toBe("53.2");
    expect(formatInt(6755.3)).toBe("6,755");
  });

  it("switches to scientific notation for tiny values", () => {
    expect(formatSig(0.00001)).toBe("1.0 × 10⁻⁵");
  });

  it("shows short durations in Myr", () => {
    expect(formatGyr(0.05)).toBe("50 Myr");
    expect(formatGyr(10.656)).toBe("10.7 Gyr");
  });
});

describe("scale bar", () => {
  it("rounds down to 1, 2 or 5 × 10ⁿ", () => {
    expect(niceScaleLength(7300)).toBe(5000);
    expect(niceScaleLength(0.34)).toBe(0.2);
    expect(niceScaleLength(1)).toBe(1);
    expect(niceScaleLength(19.9)).toBe(10);
  });

  it("labels distances in ly or kly", () => {
    expect(formatLightYears(500)).toBe("500 ly");
    expect(formatLightYears(20000)).toBe("20 kly");
  });
});

// Worlds Up Close A10: the planet panel's Surface section
describe("surface", () => {
  it("gives gravity in g and pressure in bar, to three significant figures", () => {
    expect(formatGravity(0.9807)).toBe("0.981 g");
    expect(formatGravity(2.5)).toBe("2.5 g");
    expect(formatPressure(1.01325)).toBe("1.01 bar");
    expect(formatPressure(92.4)).toBe("92.4 bar");
    expect(formatPressure(8563)).toBe("8,560 bar");
    expect(formatPressure(0.0006)).toBe("6.0 × 10⁻⁴ bar");
  });

  it("gives the day in hours, or says the planet is tidally locked", () => {
    expect(formatRotation(23.93, false)).toBe("23.9 h");
    expect(formatRotation(1631.2, false)).toBe("1,630 h");
    expect(formatRotation(1631.2, true)).toBe("Tidally locked");
  });

  it("gives the axial tilt to a tenth of a degree", () => {
    expect(formatTilt(23.44)).toBe("23.4°");
    expect(formatTilt(0)).toBe("0.0°");
    expect(formatTilt(90)).toBe("90.0°");
  });

  it("gives shares as whole percentages, marking a trace as <1%", () => {
    expect(formatPercent(0.41)).toBe("41%");
    expect(formatPercent(1)).toBe("100%");
    expect(formatPercent(0)).toBe("0%");
    expect(formatPercent(0.003)).toBe("<1%");
    expect(formatPercent(0.006)).toBe("1%");
  });

  it("rounds ocean, land and ice so they still sum to 100%", () => {
    expect(formatSurfaceShares(0.71, 0.26, 0.03)).toBe("71% / 26% / 3%");
    // Each rounds to 33%: the largest remainder takes the missing point
    expect(wholePercents([0.334, 0.333, 0.333])).toEqual([34, 33, 33]);
    // Plain rounding would give 101%
    expect(wholePercents([0.125, 0.125, 0.75])).toEqual([13, 12, 75]);
    for (const shares of [[0.5, 0.25, 0.25], [0.996, 0.003, 0.001], [0.2, 0.3, 0.5], [0.1234, 0.4321, 0.4445]]) {
      expect(wholePercents(shares).reduce((a, b) => a + b, 0)).toBe(100);
    }
    expect(wholePercents([0, 0, 0])).toEqual([0, 0, 0]);
  });

  it("gives the temperature range in kelvin", () => {
    expect(formatTemperatureRange(184.4, 330.6)).toBe("184–331 K");
    expect(formatTemperatureRange(1500, 2210)).toBe("1,500–2,210 K");
  });
});
