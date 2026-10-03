// The five preset planets, as inputs to the sketcher. Authored: each is a
// plausible example of its kind, not a measured planet.
//
// Their sketched specs are committed as contracts/planet-spec/examples/<id>.json
// (npm run presets), so a preset is the same data everywhere; a test fails if
// a committed file is not what the sketcher makes from these inputs now.

import type { SketchInputs } from "./inputs";

export interface Preset {
  id: string;
  label: string;
  inputs: SketchInputs;
}

const NO_GASES = { N2: 0, O2: 0, CO2: 0, CH4: 0, H2O: 0 };

export const PRESETS: Preset[] = [
  {
    id: "earth-like",
    label: "Earth-like",
    inputs: {
      name: "Earth-like world",
      seed: 1001,
      star: { temperatureK: 5772, luminositySolar: 1 },
      orbit: { distanceAU: 1 },
      body: { radiusEarth: 1, massEarth: 1, rotationHours: 24, tidallyLocked: false, axialTiltDeg: 23.4 },
      air: { pressureBar: 1, gases: { ...NO_GASES, N2: 78, O2: 21, H2O: 1 }, ozonePpm: 0.38, cloudCover: 0.6 },
      surface: { oceanShare: 0.7, meanTemperatureK: 288, reliefKm: 4 },
      groundCover: { cover: 0.7, colourLinear: [0.05, 0.12, 0.03] },
    },
  },
  {
    id: "lava",
    label: "Lava world",
    inputs: {
      name: "Lava world",
      seed: 1002,
      star: { temperatureK: 4500, luminositySolar: 0.2 },
      orbit: { distanceAU: 0.02 },
      body: { radiusEarth: 1.4, massEarth: 3, rotationHours: 24, tidallyLocked: true, axialTiltDeg: 0 },
      air: { pressureBar: 0, gases: { ...NO_GASES }, ozonePpm: 0, cloudCover: 0 },
      surface: { oceanShare: 0, meanTemperatureK: 1400, reliefKm: 2 },
    },
  },
  {
    id: "ice",
    label: "Ice world",
    inputs: {
      name: "Ice world",
      seed: 1003,
      star: { temperatureK: 5772, luminositySolar: 1 },
      orbit: { distanceAU: 1.6 },
      body: { radiusEarth: 0.8, massEarth: 0.5, rotationHours: 30, tidallyLocked: false, axialTiltDeg: 10 },
      air: { pressureBar: 0.5, gases: { ...NO_GASES, N2: 95, CO2: 5 }, ozonePpm: 0, cloudCover: 0.2 },
      surface: { oceanShare: 0.8, meanTemperatureK: 220, reliefKm: 4 },
    },
  },
  {
    id: "ocean",
    label: "Ocean world",
    inputs: {
      name: "Ocean world",
      seed: 1004,
      star: { temperatureK: 4800, luminositySolar: 0.35 },
      orbit: { distanceAU: 0.6 },
      body: { radiusEarth: 1.5, massEarth: 2.5, rotationHours: 30, tidallyLocked: false, axialTiltDeg: 15 },
      air: { pressureBar: 2, gases: { ...NO_GASES, N2: 90, CO2: 8, H2O: 2 }, ozonePpm: 0, cloudCover: 0.7 },
      surface: { oceanShare: 0.97, meanTemperatureK: 300, reliefKm: 4 },
    },
  },
  {
    id: "desert",
    label: "Desert world",
    inputs: {
      name: "Desert world",
      seed: 1005,
      star: { temperatureK: 6500, luminositySolar: 2.5 },
      orbit: { distanceAU: 1.7 },
      body: { radiusEarth: 0.9, massEarth: 0.7, rotationHours: 40, tidallyLocked: false, axialTiltDeg: 30 },
      air: { pressureBar: 0.8, gases: { ...NO_GASES, N2: 90, CO2: 9, H2O: 1 }, ozonePpm: 0, cloudCover: 0.1 },
      surface: { oceanShare: 0.05, meanTemperatureK: 320, reliefKm: 6 },
    },
  },
];
