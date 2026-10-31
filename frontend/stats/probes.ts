// Scientific probes: `npm run probes`.
//
// Why it exists: the audits of October 2026 (Documents/Scientific-Audit-2026-10.md
// and the reviews beside it) measured the stellar population, an Earth twin's
// climate across orbits, the climate's dependence on the time step and the
// planets of seed 42. The fixing plan (Documents/Fixing-Plan-2026-11.md) saves
// those numbers before any rule changes, and again after, so every fix shows
// what it moved. These are measurements, not tests: they assert nothing.
//
// How: Vitest runs this file (stats/probes.config.ts) so the TypeScript
// simulation loads unchanged. The step-size probe copies src/simulation to a
// temporary folder with STEPS_PER_GYR changed, and imports the copy. Results go
// to PROBE_OUT (a folder) as probes.json and probes.md, or only to the console.

import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "vitest";

import { makeConfig } from "../src/simulation/config";
import { buildGalaxyConfig } from "../src/simulation/galaxy";
import { generateStarsFor, stellarRadiusAU, type Star } from "../src/simulation/star";
import { generatePlanetsFor, type Planet } from "../src/simulation/planet";
import { SIMULATION_RULES_VERSION } from "../src/simulation/version";

const SIMULATION_DIR = fileURLToPath(new URL("../src/simulation", import.meta.url));

const POPULATION_SEEDS = [42, 7777, 100000, 1, 2, 3];
const SWEEP_AU = [0.45, 0.5, 0.6, 0.7, 0.72, 0.8, 0.9, 0.95, 1.0, 1.1, 1.2, 1.3, 1.37, 1.5, 1.7];
const STEP_SWEEP_AU = [1.0, 1.2, 1.3, 1.37, 1.5];
const STEPS_PER_GYR_TRIED = [10, 20, 40];
const SYSTEM_SEED = 42;
const SYSTEM_STARS = 250;
const TWIN_SEED = 4242;
const EARTH_DENSITY = 5.51;   // g/cm³
const NEPTUNIAN_FROM = 2.04;  // M⊕, where Chen & Kipping's volatile-rich branch begins
const HOT_JUPITER = { minMass: 95, maxAU: 0.1 };   // > 0.3 M_J inside 0.1 AU

const share = (n: number, of: number) => (of === 0 ? 0 : n / of);

/** A1: class and mass shares of whole galaxies, and the largest giants. */
function stellarPopulation() {
  const stars: Star[] = [];
  for (const seed of POPULATION_SEEDS) stars.push(...generateStarsFor(buildGalaxyConfig(seed, makeConfig(seed))).stars);
  const classes: Record<string, number> = {};
  for (const s of stars) classes[s.classification] = (classes[s.classification] ?? 0) + 1;
  const giants = stars.filter((s) => s.classification === "red-giant");
  const radii = giants.map(stellarRadiusAU);
  return {
    seeds: POPULATION_SEEDS,
    stars: stars.length,
    classShares: Object.fromEntries(Object.entries(classes).map(([c, n]) => [c, share(n, stars.length)])),
    massShares: {
      above8: share(stars.filter((s) => s.mass > 8).length, stars.length),
      above20: share(stars.filter((s) => s.mass > 20).length, stars.length),
      below1: share(stars.filter((s) => s.mass < 1).length, stars.length),
      below05: share(stars.filter((s) => s.mass < 0.5).length, stars.length),
    },
    giants: giants.length,
    maxGiantLuminosity: Math.max(...giants.map((s) => s.luminosity)),
    maxGiantRadiusAU: Math.max(...radii),
    giantsWiderThan5AU: radii.filter((r) => r > 5).length,
  };
}

/** The Sun today, as the climate probes' host. */
const SUN: Star = {
  id: 1, position: [0, 0, 0], mass: 1, age: 4.6, lifespan: 10, temperature: 5772, luminosity: 1,
  classification: "main-sequence", isRare: false, metallicity: 0, companion: null,
};

/** An Earth twin at `orbitAU`: Earth's mass, size, air, water and tilt. */
function earthTwin(orbitAU: number): Planet {
  return {
    id: 0, key: "1-0", hostStarId: 1, orbitalRadius: orbitAU, orbitalIndex: 0, type: "rocky", size: 1, mass: 1,
    temperature: 288, atmosphere: "moderate", formationAtmosphere: "moderate", resourceAbundance: 0.5,
    habitabilityScore: 0, isRare: false, surface: null, life: null, worldEvents: [], everLiquidWater: false, moons: [],
  };
}

type Sim = {
  config: typeof import("../src/simulation/config");
  planetPhysics: typeof import("../src/simulation/planetPhysics");
  geography: typeof import("../src/simulation/geography");
  worldHistory: typeof import("../src/simulation/worldHistory");
};

async function loadSim(dir: string): Promise<Sim> {
  return {
    config: await import(/* @vite-ignore */ join(dir, "config.ts")),
    planetPhysics: await import(/* @vite-ignore */ join(dir, "planetPhysics.ts")),
    geography: await import(/* @vite-ignore */ join(dir, "geography.ts")),
    worldHistory: await import(/* @vite-ignore */ join(dir, "worldHistory.ts")),
  };
}

/** A2: an Earth twin's present climate at one orbit, with life switched off. */
function twinClimate(sim: Sim, orbitAU: number) {
  const cfg = sim.config.makeConfig(TWIN_SEED, { emergenceSensitivity: 0 });
  const planet = earthTwin(orbitAU);
  const physics = sim.planetPhysics.derivePhysics(planet, SUN, TWIN_SEED, cfg);
  physics.waterInventory = 0.08;
  physics.axialTiltDeg = 23.4;
  const history = sim.worldHistory.runWorldHistory(
    planet, physics, sim.geography.buildGeography(planet, physics, TWIN_SEED), SUN, TWIN_SEED, cfg,
  );
  const { final, present } = history;
  return {
    orbitAU,
    meanK: Math.round(present.meanK),
    maxK: Math.round(present.maxK),
    pressureBar: +final.pressureBar.toFixed(2),
    co2Bar: +final.co2Bar.toFixed(4),
    steam: final.steam,
    ocean: +present.oceanFraction.toFixed(3),
    ice: +present.iceFraction.toFixed(3),
    water: +final.water.toFixed(4),
    everLiquidWater: history.everLiquidWater,
  };
}

/** A3: the same twins with the world history's step shortened, from copies of the simulation. */
async function stepConvergence() {
  const rows: { stepsPerGyr: number; climates: ReturnType<typeof twinClimate>[] }[] = [];
  const scratch = mkdtempSync(join(tmpdir(), "aion-probe-"));
  try {
    for (const steps of STEPS_PER_GYR_TRIED) {
      const dir = join(scratch, `steps-${steps}`);
      mkdirSync(dir);
      cpSync(SIMULATION_DIR, dir, { recursive: true });
      const file = join(dir, "worldHistory.ts");
      const source = readFileSync(file, "utf8");
      const changed = source.replace(/export const STEPS_PER_GYR = \d+;/, `export const STEPS_PER_GYR = ${steps};`);
      if (changed === source && steps !== 10) throw new Error("STEPS_PER_GYR not found in worldHistory.ts");
      writeFileSync(file, changed);
      const sim = await loadSim(dir);
      rows.push({ stepsPerGyr: steps, climates: STEP_SWEEP_AU.map((a) => twinClimate(sim, a)) });
    }
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
  return rows;
}

/** A4: the planets of seed 42's first main-sequence stars. */
function planetarySystems() {
  const cfg = makeConfig(SYSTEM_SEED);
  const hosts = generateStarsFor(buildGalaxyConfig(SYSTEM_SEED, cfg), undefined, cfg).stars
    .filter((s) => s.classification === "main-sequence").slice(0, SYSTEM_STARS);
  const planets = hosts.flatMap((s) => generatePlanetsFor(s, SYSTEM_SEED, cfg).planets);
  const giants = planets.filter((p) => p.type === "gas-giant" || p.type === "ice-giant");
  const solids = planets.filter((p) => p.surface !== null);
  const density = (p: Planet) => (EARTH_DENSITY * p.mass) / (p.size * p.size * p.size);
  const lava = solids.filter((p) => p.type === "lava");
  const everWet = solids.filter((p) => p.everLiquidWater);
  return {
    seed: SYSTEM_SEED,
    hosts: hosts.length,
    planetsPerStar: +share(planets.length, hosts.length).toFixed(2),
    giantShare: share(giants.length, planets.length),
    hotJupiters: giants.filter((p) => p.mass > HOT_JUPITER.minMass && p.orbitalRadius < HOT_JUPITER.maxAU).length,
    solids: solids.length,
    solidsAboveNeptunianBranch: share(solids.filter((p) => p.mass > NEPTUNIAN_FROM).length, solids.length),
    solidsBelow3gcc: solids.filter((p) => density(p) < 3).length,
    solidsWithLife: share(solids.filter((p) => p.life !== null).length, solids.length),
    everWetWithLife: share(everWet.filter((p) => p.life !== null).length, everWet.length),
    lavaWorlds: lava.length,
    maxLavaK: lava.length ? Math.round(Math.max(...lava.map((p) => p.temperature))) : null,
  };
}

const pct = (x: number) => `${(100 * x).toFixed(1)}%`;

function report(r: Awaited<ReturnType<typeof runAll>>): string {
  const lines = [`# Scientific probes · rules v${r.rulesVersion}`, "", `Measured ${r.measured}.`, ""];
  const p = r.population;
  lines.push("## A1 Stellar population", "", `${p.stars} stars from seeds ${p.seeds.join(", ")}.`, "", "| Class | Share |", "|---|---|");
  for (const [c, s] of Object.entries(p.classShares)) lines.push(`| ${c} | ${pct(s)} |`);
  lines.push("", "| Mass | Share |", "|---|---|",
    `| > 8 M☉ | ${pct(p.massShares.above8)} |`, `| > 20 M☉ | ${pct(p.massShares.above20)} |`,
    `| < 1 M☉ | ${pct(p.massShares.below1)} |`, `| < 0.5 M☉ | ${pct(p.massShares.below05)} |`, "",
    `Giants: ${p.giants}; brightest ${p.maxGiantLuminosity.toExponential(2)} L☉; widest ${p.maxGiantRadiusAU.toFixed(0)} AU; ${p.giantsWiderThan5AU} wider than 5 AU.`, "");
  const climateHeader = ["| AU | mean K | max K | bar | CO₂ bar | steam | ocean | ice | water | ever wet |", "|---|---|---|---|---|---|---|---|---|---|"];
  const climateRow = (c: ReturnType<typeof twinClimate>) =>
    `| ${c.orbitAU} | ${c.meanK} | ${c.maxK} | ${c.pressureBar} | ${c.co2Bar} | ${c.steam ? "yes" : "no"} | ${c.ocean} | ${c.ice} | ${c.water} | ${c.everLiquidWater ? "yes" : "no"} |`;
  lines.push("## A2 Earth-twin climate sweep", "", "The Sun today; Earth's mass, size, air, water (0.08) and tilt; life off.", "", ...climateHeader, ...r.sweep.map(climateRow), "");
  lines.push("## A3 Step-size convergence", "");
  for (const row of r.steps) lines.push(`### ${row.stepsPerGyr} steps per Gyr`, "", ...climateHeader, ...row.climates.map(climateRow), "");
  const s = r.systems;
  lines.push("## A4 Planetary systems", "", `First ${s.hosts} main-sequence stars of seed ${s.seed}.`, "", "| Measure | Value |", "|---|---|",
    `| Planets per star | ${s.planetsPerStar} |`, `| Giant share | ${pct(s.giantShare)} |`, `| Hot Jupiters | ${s.hotJupiters} |`,
    `| Solid planets | ${s.solids} |`, `| Solids above ${NEPTUNIAN_FROM} M⊕ | ${pct(s.solidsAboveNeptunianBranch)} |`,
    `| Solids below 3 g/cm³ | ${s.solidsBelow3gcc} |`, `| Solids with life | ${pct(s.solidsWithLife)} |`,
    `| Ever-wet worlds with life | ${pct(s.everWetWithLife)} |`, `| Lava worlds | ${s.lavaWorlds} |`, `| Hottest lava world | ${s.maxLavaK} K |`, "");
  return lines.join("\n");
}

async function runAll() {
  const current = await loadSim(SIMULATION_DIR);
  return {
    rulesVersion: SIMULATION_RULES_VERSION,
    measured: new Date().toISOString(),
    population: stellarPopulation(),
    sweep: SWEEP_AU.map((a) => twinClimate(current, a)),
    steps: await stepConvergence(),
    systems: planetarySystems(),
  };
}

test("scientific probes", async () => {
  const results = await runAll();
  const markdown = report(results);
  console.log(markdown);
  const out = process.env.PROBE_OUT;
  if (out) {
    mkdirSync(out, { recursive: true });
    writeFileSync(join(out, "probes.json"), JSON.stringify(results, null, 2) + "\n");
    writeFileSync(join(out, "probes.md"), markdown + "\n");
  }
});
