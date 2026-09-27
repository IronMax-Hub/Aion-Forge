import { describe, it, expect } from "vitest";
import {
  airTransmission, environmentContext, environmentFor, flareActivity, peakWavelengthNm, uvShare,
  SEAWATER_FREEZING_K,
} from "../simulation/evolution/environment";
import type { Environment } from "../simulation/evolution/environment";
import { runWorldHistory, FORMATION_DELAY_GYR } from "../simulation/worldHistory";
import type { WorldSnapshot } from "../simulation/worldHistory";
import { buildGeography } from "../simulation/geography";
import { derivePhysics } from "../simulation/planetPhysics";
import { generatePlanetsFor, planetKey } from "../simulation/planet";
import type { Planet } from "../simulation/planet";
import { generateStarsFor, UNIVERSE_AGE_GYR, mainSequenceEndGyr, temperatureAt } from "../simulation/star";
import type { Star } from "../simulation/star";
import { buildGalaxyConfig } from "../simulation/galaxy";
import { makeConfig } from "../simulation/config";

// Worlds Up Close C2.2: the environment life meets at each step of a planet's history.

const seed = 100000;
const config = makeConfig(seed);

const sun: Star = {
  id: 1, position: [0, 0, 0], mass: 1, age: 4.6, lifespan: 10, temperature: 5772, luminosity: 1,
  classification: "main-sequence", isRare: false,
};
const earth: Planet = {
  id: 2, key: planetKey(1, 2), hostStarId: 1, orbitalRadius: 1, orbitalIndex: 2, type: "rocky",
  size: 1, mass: 1, temperature: 288, atmosphere: "moderate", formationAtmosphere: "moderate", resourceAbundance: 0.5,
  habitabilityScore: 0.8, isRare: false, surface: null,
};

/** Every step of a planet's history, read as environments. */
function environmentsOf(planet: Planet, star: Star): { snapshots: WorldSnapshot[]; environments: Environment[]; events: string[] } {
  const physics = derivePhysics(planet, star, seed, config);
  const history = runWorldHistory(planet, physics, buildGeography(planet, physics, seed), star, seed, config, { keepSnapshots: true });
  const context = environmentContext(planet, physics, star, config);
  return {
    snapshots: history.snapshots!,
    environments: history.snapshots!.map((s) => environmentFor(s, context)),
    events: history.events.map((e) => e.kind),
  };
}

const earthSteps = environmentsOf(earth, sun);
const earthToday = earthSteps.environments[earthSteps.environments.length - 1];

// A sample of real planets, for the rules that need variety
const stars = generateStarsFor(buildGalaxyConfig(seed, config), UNIVERSE_AGE_GYR, config).stars.slice(0, 120);
const sample = stars.flatMap((star) => generatePlanetsFor(star, seed, config).planets
  .filter((planet) => planet.surface !== null).map((planet) => ({ star, planet, ...environmentsOf(planet, star) })));

describe("the star, as life sees it", () => {
  it("peaks the Sun's light near 500 nm and a red dwarf's in the infrared", () => {
    expect(peakWavelengthNm(5772)).toBeCloseTo(502, 0);
    expect(peakWavelengthNm(3000)).toBeGreaterThan(900);
  });

  it("gives hotter stars a larger 200–315 nm share up to ~10,000 K (beyond, their light moves further into the UV), and a red dwarf almost none", () => {
    const solar = uvShare(5772);
    expect(solar).toBeGreaterThan(0.005);
    expect(solar).toBeLessThan(0.05);
    let previous = 0;
    for (let t = 2500; t <= 10000; t += 500) {
      expect(uvShare(t)).toBeGreaterThan(previous);
      previous = uvShare(t);
    }
    expect(uvShare(3000)).toBeLessThan(solar / 50);
    expect(uvShare(0)).toBe(0);
  });

  it("lets red dwarfs flare, fully at birth and fading with age, late M dwarfs for longer", () => {
    expect(flareActivity(5772, true, 0)).toBe(0);
    expect(flareActivity(3500, false, 1)).toBe(0);          // a red giant does not flare
    expect(flareActivity(3500, true, 0)).toBe(1);
    expect(flareActivity(3500, true, 5)).toBeLessThan(flareActivity(3500, true, 1));
    expect(flareActivity(2800, true, 3)).toBeGreaterThan(flareActivity(3800, true, 3));
  });

  it("gives a star that has left the main sequence its main-sequence temperature before, and today's after", () => {
    expect(temperatureAt(sun, 1)).toBe(5772);
    const giant: Star = { ...sun, age: 9.5, classification: "red-giant", temperature: 4000, luminosity: 500 };
    expect(temperatureAt(giant, mainSequenceEndGyr(giant) - 0.1)).toBeGreaterThan(5000);
    expect(temperatureAt(giant, mainSequenceEndGyr(giant) + 0.1)).toBe(4000);
  });
});

describe("the air", () => {
  it("dims light as Venus does at 92 bar, hardly at all at Earth's pressure", () => {
    expect(airTransmission(0)).toBe(1);
    expect(airTransmission(92)).toBeCloseTo(0.025, 6);
    expect(airTransmission(1)).toBeCloseTo(0.96, 2);
  });
});

describe("an Earth-like planet around the Sun, today", () => {
  it("gets the Sun's light, Earth's gravity, and starlight nearly undimmed", () => {
    expect(earthToday.tGyr).toBe(4.6);
    expect(earthToday.starPeakNm).toBeCloseTo(502, 0);
    expect(earthToday.gravity).toBe(1);
    expect(earthToday.airTransmission).toBeGreaterThan(0.95);
    const meanLight = earthToday.bands.reduce((sum, b) => sum + b.light * b.area, 0);
    expect(meanLight).toBeCloseTo(earthToday.airTransmission, 6);   // L = 1 at 1 AU; insolation averages to 1
  });

  it("gets the Sun's UV through the air when it has no ozone", () => {
    expect(earthToday.ozone).toBe(0);   // no life yet, so no oxygen to speak of
    expect(earthToday.surfaceUV).toBeCloseTo(earthToday.airTransmission, 6);
  });

  it("warms its bands towards the equator", () => {
    const [pole, , , , , , , , equator] = earthToday.bands.map((b) => b.landK);
    expect(equator).toBeGreaterThan(pole);
  });
});

describe("habitats", () => {
  const all = sample.flatMap((p) => p.environments);

  it("split every planet into land and water, the sunlit layer lying over the deep water", () => {
    let checked = 0;
    const faults: string[] = [];
    for (const env of all) {
      let land = 0;
      let water = 0;
      let area = 0;
      for (const b of env.bands) {
        if (b.shallowWaterArea > b.deepWaterArea) faults.push("sunlit layer larger than the water");
        land += b.landArea;
        water += b.deepWaterArea;
        area += b.area;
      }
      if (Math.abs(area - 1) > 1e-9) faults.push(`band areas sum to ${area}`);
      if (water > 0 && Math.abs(land + water - 1) > 1e-9) faults.push(`land and water sum to ${land + water}`);
      checked++;
    }
    expect(checked).toBeGreaterThan(1000);
    expect(faults).toEqual([]);
  });

  it("keep deep water under ice, never colder than seawater freezes, with no sunlit layer", () => {
    let icedWater = 0;
    const faults: string[] = [];
    all.forEach((env, i) => env.bands.forEach((b, k) => {
      if (b.waterK < SEAWATER_FREEZING_K) faults.push(`water at ${b.waterK} K`);
      if (samplesFlat[i].iced[k] === 1 && b.deepWaterArea > 0) {
        icedWater++;
        if (b.shallowWaterArea !== 0) faults.push("sunlit layer under ice");
      }
    }));
    expect(icedWater).toBeGreaterThan(0);
    expect(faults).toEqual([]);
  });

  it("have no water while the oceans are steam", () => {
    const steaming = all.filter((_, i) => samplesFlat[i].steam);
    expect(steaming.length).toBeGreaterThan(0);
    expect(steaming.every((env) => env.bands.every((b) => b.deepWaterArea === 0))).toBe(true);
  });
});

const samplesFlat = sample.flatMap((p) => p.snapshots);

describe("a tidally locked planet", () => {
  const locked = sample.filter((p) => derivePhysics(p.planet, p.star, seed, config).tidallyLocked);

  it("gets no light on its night side, and most at the point facing the star", () => {
    expect(locked.length).toBeGreaterThan(0);
    for (const { environments } of locked.filter((p) => p.environments.length > 0)) {
      const today = environments[environments.length - 1];
      const light = today.bands.map((b) => b.light);
      expect(Math.max(...light)).toBe(light[0]);
      for (const l of light.slice(9)) expect(l).toBeCloseTo(0, 12);
    }
  });
});

describe("UV at the surface", () => {
  it("is shielded by thick air and by ozone", () => {
    const step = earthSteps.snapshots[earthSteps.snapshots.length - 1];
    const context = environmentContext(earth, derivePhysics(earth, sun, seed, config), sun, config);
    const bare = environmentFor(step, context).surfaceUV;
    expect(environmentFor({ ...step, ozone: 1 }, context).surfaceUV).toBe(0);
    expect(environmentFor({ ...step, ozone: 0.5 }, context).surfaceUV).toBeCloseTo(bare / 2, 9);
    expect(environmentFor({ ...step, pressureBar: 50 }, context).surfaceUV).toBeLessThan(bare / 5);
  });

  it("is higher around a young red dwarf than around the same star when it is old", () => {
    const dwarf: Star = { ...sun, mass: 0.3, temperature: 3300, luminosity: 0.01, lifespan: 200, age: 8 };
    const planet: Planet = { ...earth, orbitalRadius: 0.1 };
    const context = environmentContext(planet, derivePhysics(planet, dwarf, seed, config), dwarf, config);
    const step = earthSteps.snapshots[0];
    const young = environmentFor({ ...step, tGyr: 0.6, luminosity: 0.01, ozone: 0 }, context).surfaceUV;
    const old = environmentFor({ ...step, tGyr: 8, luminosity: 0.01, ozone: 0 }, context).surfaceUV;
    expect(young).toBeGreaterThan(3 * old);
  });
});

describe("catastrophes", () => {
  it("are the loop's own: every recorded event reaches the step it happened in, and impacts come through", () => {
    for (const { snapshots, environments, events } of sample) {
      expect(environments.flatMap((env) => env.catastrophes.transitions)).toEqual(events);
      environments.forEach((env, i) => {
        expect(env.catastrophes.impact).toBe(snapshots[i].impact);
        expect(env.catastrophes.volcanicPulse).toBe(snapshots[i].volcanicPulse);
      });
    }
    expect(sample.some((p) => p.environments.some((env) => env.catastrophes.impact))).toBe(true);
  });

  it("come with steps that tile the planet's history from formation to today", () => {
    for (const { star, environments } of sample) {
      if (environments.length === 0) continue;
      const total = environments.reduce((sum, env) => sum + env.dtGyr, 0);
      expect(total).toBeCloseTo(star.age - FORMATION_DELAY_GYR, 9);
      expect(environments[environments.length - 1].tGyr).toBe(star.age);
    }
  });
});

describe("determinism", () => {
  it("reads the same environment from the same step every time", () => {
    const again = environmentsOf(earth, sun).environments;
    expect(again).toEqual(earthSteps.environments);
  });
});
