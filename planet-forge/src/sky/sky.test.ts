import { describe, expect, it } from "vitest";
import type { Vec3 } from "../forge/icosphere";
import type { PlanetSpec } from "../spec/schema";
import { presetSpec } from "../spec/presetFiles";
import { airOf, molarMass, OZONE_CROSS_SECTION_CM2, RAYLEIGH_CHANNELS, scatteringPerMolecule } from "./air";
import type { Air } from "./air";
import {
  chapman, horizonZenith, lightTable, miePhase, rayleighPhase, LIGHT_SIZE, rowOfZenith, scatterAlong, SKY_COLUMNS, SKY_ROWS, skyRadiance, skyTable,
  transmittanceToSpace, zenithOfRow,
} from "./scattering";
import { discAngularRadius, starColour, starFlux } from "./star";

const DEGREE = Math.PI / 180;
const earth = presetSpec("earth-like");
const UP: Vec3 = [0, 1, 0];

/** A copy of a spec with some of its parts changed. */
function variant(spec: PlanetSpec, change: (s: PlanetSpec) => void): PlanetSpec {
  const copy = structuredClone(spec);
  change(copy);
  return copy;
}

/** The star at this elevation, along +x. */
function sunAt(elevationDeg: number): Vec3 {
  return [Math.cos(elevationDeg * DEGREE), Math.sin(elevationDeg * DEGREE), 0];
}

/** The sky straight overhead from 2 m above the sea, with the star 45° up. */
function zenithSky(spec: PlanetSpec): Vec3 {
  const air = airOf(spec);
  const irradiance = starColour(spec.star.temperatureK).map((c) => c * 3) as Vec3;
  return skyRadiance(air, air.radiusM + 2, UP, sunAt(45), irradiance, UP);
}

// Wyman, Sloan and Shirley's (2013) fit of the CIE 1931 2° observer, and XYZ to linear sRGB
const lobe = (x: number, mu: number, below: number, above: number) => Math.exp(-0.5 * ((x - mu) / (x < mu ? below : above)) ** 2);
const xbar = (l: number) => 1.056 * lobe(l, 599.8, 37.9, 31.0) + 0.362 * lobe(l, 442.0, 16.0, 26.7) - 0.065 * lobe(l, 501.1, 20.4, 26.2);
const ybar = (l: number) => 0.821 * lobe(l, 568.8, 46.9, 40.5) + 0.286 * lobe(l, 530.9, 16.3, 31.1);
const zbar = (l: number) => 1.217 * lobe(l, 437.0, 11.8, 36.0) + 0.681 * lobe(l, 459.0, 26.0, 13.8);
const TO_RGB = [[3.2406, -1.5372, -0.4986], [-0.9689, 1.8758, 0.0415], [0.0557, -0.2040, 1.0570]];

/** A spectrum (of wavelength, nm) seen as linear sRGB. */
function rgbOf(spectrum: (l: number) => number): number[] {
  const xyz = [0, 0, 0];
  for (let l = 380; l <= 780; l += 5) {
    const w = spectrum(l);
    xyz[0] += w * xbar(l); xyz[1] += w * ybar(l); xyz[2] += w * zbar(l);
  }
  return TO_RGB.map((row) => row[0] * xyz[0] + row[1] * xyz[1] + row[2] * xyz[2]);
}

/** Planck's law at this temperature, by wavelength in nm. */
function planckAt(temperatureK: number): (l: number) => number {
  return (l) => 1 / ((l * 1e-9) ** 5 * Math.expm1(1.4388e-2 / (l * 1e-9 * temperatureK)));
}

const luminance = (c: Vec3) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];

describe("the air", () => {
  it("thins over Earth's scale height and scatters as Earth's air at 1 bar", () => {
    const air = airOf(earth);
    expect(air.rayleighHeightM).toBeGreaterThan(8000);
    expect(air.rayleighHeightM).toBeLessThan(8800);
    // Optical depth straight up is the ground's scattering times the scale height: 0.1 in green, red and blue by the spectrum
    const depth = air.rayleigh.map((b) => b * air.rayleighHeightM);
    expect(depth[1]).toBeCloseTo(0.100, 3);
    expect(depth[0]).toBeCloseTo(0.0518, 3);
    expect(depth[2]).toBeCloseTo(0.2389, 3);
  });

  it("scatters each channel as the whole spectrum does, seen through the CIE observer", () => {
    for (const temperatureK of [3200, 5772, 10000]) {
      const planck = planckAt(temperatureK);
      const direct = rgbOf(planck), scattered = rgbOf((l) => planck(l) * (550 / l) ** 4.05);
      const weights = [0, 1, 2].map((k) => scattered[k] / direct[k] / (scattered[1] / direct[1]));
      expect(Math.abs(weights[0] - RAYLEIGH_CHANNELS[0])).toBeLessThan(0.04);
      expect(Math.abs(weights[2] - RAYLEIGH_CHANNELS[2])).toBeLessThan(0.12);
    }
  });

  it("absorbs in ozone's Chappuis band as the whole spectrum does: red most, blue hardly", () => {
    const chappuis = (l: number) => 5.2e-21 * Math.exp(-0.5 * ((l - 600) / 60) ** 2);
    const planck = planckAt(5772);
    const direct = rgbOf(planck), absorbed = rgbOf((l) => planck(l) * chappuis(l));
    for (let k = 0; k < 3; k++) expect(Math.max(0, absorbed[k] / direct[k])).toBeCloseTo(OZONE_CROSS_SECTION_CM2[k], 22);
    // Earth's 0.38 ppm: about 0.029 straight up in green, as measured (Earth's ozone column, about 300 Dobson units)
    const air = airOf(earth);
    expect(air.ozone[1] * air.rayleighHeightM).toBeGreaterThan(0.025);
    expect(air.ozone[1] * air.rayleighHeightM).toBeLessThan(0.033);
    expect(airOf(variant(earth, (s) => { delete s.air.gases.O3; })).ozone).toEqual([0, 0, 0]);
  });

  it("follows the column of air: lower gravity, more air overhead and a deeper sky", () => {
    const light = airOf(variant(earth, (s) => { s.body.gravityG = 0.5; }));
    const heavy = airOf(earth);
    expect(light.rayleigh[2] * light.rayleighHeightM).toBeCloseTo(2 * heavy.rayleigh[2] * heavy.rayleighHeightM, 6);
    expect(light.rayleighHeightM).toBeCloseTo(2 * heavy.rayleighHeightM, 6);
  });

  it("scatters by its gases: CO₂ more than N₂ per molecule, hydrogen far less", () => {
    const co2 = variant(earth, (s) => { s.air.gases = { CO2: 1 }; });
    const n2 = variant(earth, (s) => { s.air.gases = { N2: 1 }; });
    const h2 = variant(earth, (s) => { s.air.gases = { H2: 0.9, He: 0.1 }; });
    expect(scatteringPerMolecule(co2) / scatteringPerMolecule(n2)).toBeCloseTo(2.27, 1);
    expect(scatteringPerMolecule(h2)).toBeLessThan(0.3);
    expect(molarMass(co2)).toBeCloseTo(0.044, 3);
    // Air with no gases named is nitrogen
    expect(molarMass(variant(earth, (s) => { s.air.gases = {}; }))).toBeCloseTo(molarMass(n2), 9);
  });

  it("is none on an airless world", () => {
    const air = airOf(presetSpec("lava"));
    expect(air.rayleigh).toEqual([0, 0, 0]);
    expect(air.mie).toBe(0);
  });
});

describe("the air crossed towards space", () => {
  /** The same column found by stepping along the ray, in scale heights. */
  function stepped(X: number, h: number, mu: number): number {
    const r0 = X + h;
    let sum = 0;
    const step = 0.01, steps = 60_000;
    for (let i = 0; i < steps; i++) {
      const t = (i + 0.5) * step;
      const r = Math.sqrt(r0 * r0 + t * t + 2 * r0 * t * mu);
      sum += Math.exp(-(r - X)) * step;
    }
    return sum;
  }

  it("matches the column stepped along the ray, overhead to beyond the horizon", () => {
    // Earth's air, Earth's haze, and deep air on a small planet (Titan-like, where the asymptotic form is least close)
    for (const [X, tolerance] of [[6_371_000 / 8400, 0.005], [6_371_000 / 1260, 0.005], [100, 0.01]]) {
      for (const h of [0, 0.5, 5]) {
        for (const mu of [-0.2, -0.05, 0, 0.01, 0.03, 0.1, 0.3, 0.6, 1]) {
          if (mu < 0 && (X + h) * Math.sqrt(1 - mu * mu) < X) continue;
          expect(Math.abs(chapman(X, h, mu) / stepped(X, h, mu) - 1), `X ${X}, h ${h}, mu ${mu}`).toBeLessThan(tolerance);
        }
      }
    }
  });

  it("dims and reddens a low star", () => {
    const air = airOf(earth);
    const high = transmittanceToSpace(air, air.radiusM + 2, 1);
    const low = transmittanceToSpace(air, air.radiusM + 2, Math.sin(3 * DEGREE));
    expect(low[2]).toBeLessThan(high[2]);
    expect(low[0] / low[2]).toBeGreaterThan(2 * (high[0] / high[2]));
  });

  it("is nothing where the planet is in the way, and everything without air", () => {
    const air = airOf(earth);
    expect(transmittanceToSpace(air, air.radiusM + 2, -0.5)).toEqual([0, 0, 0]);
    const none = airOf(presetSpec("lava"));
    expect(transmittanceToSpace(none, none.radiusM + 2, 0.01)).toEqual([1, 1, 1]);
  });
});

describe("the sky", () => {
  it("is blue on the Earth-like preset", () => {
    const [r, g, b] = zenithSky(earth);
    expect(b).toBeGreaterThan(g);
    expect(g).toBeGreaterThan(r);
    expect(b / r).toBeGreaterThan(3);
  });

  it("is blue, not violet, under a hot star: green stays above red", () => {
    const [r, g, b] = zenithSky(variant(earth, (s) => { s.star.temperatureK = 10_000; }));
    expect(b).toBeGreaterThan(g);
    expect(g).toBeGreaterThan(r);
  });

  it("gains light scattered more than once: a little in thin air, most of it in thick air", () => {
    const share = (spec: PlanetSpec) => {
      const air = airOf(spec);
      const s = scatterAlong(air, air.radiusM + 2, 1, 0, Math.SQRT1_2);
      const single = rayleighPhase(Math.SQRT1_2) * s.rayleigh[1] + miePhase(Math.SQRT1_2) * s.mie[1];
      return s.multiple[1] / (single + s.multiple[1]);
    };
    const thin = share(variant(earth, (s) => { s.air.pressureBar = 0.1; })), normal = share(earth);
    const thick = share(variant(earth, (s) => { s.air.pressureBar = 10; }));
    expect(thin).toBeLessThan(normal);
    expect(normal).toBeGreaterThan(0.05);
    expect(normal).toBeLessThan(0.5);
    expect(thick).toBeGreaterThan(0.5);
  });

  it("is warmer under a red dwarf", () => {
    const sun = zenithSky(earth);
    const dwarf = zenithSky(variant(earth, (s) => { s.star.temperatureK = 3200; }));
    expect(dwarf[0] / dwarf[2]).toBeGreaterThan(1.5 * (sun[0] / sun[2]));
  });

  it("is darker in thin air and paler in thick air", () => {
    const thin = zenithSky(variant(earth, (s) => { s.air.pressureBar = 0.01; }));
    const thick = zenithSky(variant(earth, (s) => { s.air.pressureBar = 10; }));
    const normal = zenithSky(earth);
    expect(luminance(thin)).toBeLessThan(0.05 * luminance(normal));
    expect(thick[2] / thick[0]).toBeLessThan(normal[2] / normal[0]);
  });

  it("stays blue overhead in twilight with ozone, where without it the sky is grey", () => {
    const twilight = (spec: PlanetSpec) => {
      const air = airOf(spec);
      return skyRadiance(air, air.radiusM + 2, UP, sunAt(-3), [3, 3, 3], UP);
    };
    const withOzone = twilight(earth), without = twilight(variant(earth, (s) => { delete s.air.gases.O3; }));
    // Ozone taken as mixed through the air (air.ts) gives a little under twice the blue; Earth's, in its layer high up, more
    expect(withOzone[2] / withOzone[0]).toBeGreaterThan(1.7 * (without[2] / without[0]));
    expect(withOzone[2] / withOzone[0]).toBeGreaterThan(2.2);
    // By day ozone hardly changes the sky: a short path through it
    const day = zenithSky(earth), dayWithout = zenithSky(variant(earth, (s) => { delete s.air.gases.O3; }));
    expect(day[2] / day[0]).toBeLessThan(1.15 * (dayWithout[2] / dayWithout[0]));
  });

  it("is black on an airless world", () => {
    expect(zenithSky(presetSpec("lava"))).toEqual([0, 0, 0]);
  });

  it("is lit after sunset only from high air, and dark at night", () => {
    const air = airOf(earth);
    const at = (elevationDeg: number) => luminance(skyRadiance(air, air.radiusM + 2, UP, sunAt(elevationDeg), [1, 1, 1], UP));
    expect(at(-3)).toBeGreaterThan(0);
    expect(at(-3)).toBeLessThan(at(10));
    expect(at(-30)).toBe(0);
  });
});

describe("the sky table", () => {
  it("packs its rows round the horizon, and finds them again", () => {
    const air = airOf(earth);
    for (const heightM of [2, 10_000, 2_000_000]) {
      const horizon = horizonZenith(air, air.radiusM + heightM);
      expect(rowOfZenith(horizon, horizon)).toBeCloseTo(0.5, 12);
      for (const row of [0, 0.1, 0.37, 0.5, 0.62, 0.99, 1]) expect(rowOfZenith(zenithOfRow(row, horizon), horizon)).toBeCloseTo(row, 9);
    }
    // From high up, the horizon is below level
    expect(horizonZenith(air, air.radiusM + 2_000_000)).toBeGreaterThan(Math.PI / 2 + 0.5);
  });

  it("holds what a ray gathers in each entry's direction", () => {
    const air = airOf(earth);
    const r = air.radiusM + 200, sunMu = 0.4;
    const table = skyTable(air, r, sunMu);
    for (const [row, column] of [[0, 0], [40, 7], [63, 20], [64, 31], [100, 3]]) {
      const mu = Math.cos(zenithOfRow(row / (SKY_ROWS - 1), table.horizon));
      const phi = (column / (SKY_COLUMNS - 1)) * Math.PI;
      const ray = scatterAlong(air, r, mu, phi, sunMu);
      const at = (row * SKY_COLUMNS + column) * 4;
      for (let k = 0; k < 3; k++) {
        expect(table.rayleigh[at + k]).toBeCloseTo(ray.rayleigh[k], 6);
        expect(table.mie[at + k]).toBeCloseTo(ray.mie[k], 6);
      }
    }
  });
});

describe("the sky's light on the ground", () => {
  const entry = (table: Float32Array, sunMu: number) => {
    const k = Math.round(((sunMu + 1) / 2) * (LIGHT_SIZE - 1)) * 4;
    return [table[k], table[k + 1], table[k + 2]];
  };

  it("grows as the star rises, and is nothing at night or without air", () => {
    const air: Air = airOf(earth);
    const table = lightTable(air, [3, 3, 3]);
    expect(entry(table, -0.8)).toEqual([0, 0, 0]);
    expect(entry(table, 0.2)[2]).toBeLessThan(entry(table, 0.9)[2]);
    expect(entry(table, 0.9)[2]).toBeGreaterThan(entry(table, 0.9)[0]);
    expect([...lightTable(airOf(presetSpec("lava")), [3, 3, 3])].every((v, k) => k % 4 === 3 || v === 0)).toBe(true);
  });
});

describe("the star", () => {
  it("is white for a Sun-like star and orange for a red dwarf", () => {
    for (const c of starColour(5772)) expect(c).toBeCloseTo(1, 9);
    const [r, g, b] = starColour(3200);
    expect(r).toBe(1);
    expect(g).toBeLessThan(r);
    expect(b).toBeLessThan(g);
  });

  it("has the Sun's disc at 1 AU, larger from a closer orbit", () => {
    expect(2 * discAngularRadius(earth) / DEGREE).toBeCloseTo(0.533, 2);
    const closer = variant(earth, (s) => { s.orbit.distanceAU = 0.5; });
    expect(discAngularRadius(closer)).toBeCloseTo(2 * discAngularRadius(earth), 5);
  });

  it("gives Earth's light at 1 AU from the Sun, falling with the square of distance", () => {
    expect(starFlux(earth)).toBe(1);
    expect(starFlux(variant(earth, (s) => { s.orbit.distanceAU = 2; }))).toBeCloseTo(0.25, 12);
  });
});
