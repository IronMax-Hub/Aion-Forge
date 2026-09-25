import { describe, it, expect } from "vitest";
import { spectralType, planetName, starName, formatSig, formatGyr, formatInt, niceScaleLength, formatLightYears } from "../ui/format";

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
