// Chapter 2 of the Physics page: the galaxy (PH1).

import { GALAXY_PARTICLE_COUNT, GALAXY_SCALE, GALAXY_TYPE_ROLL } from "../../../simulation/galaxy";
import { METALLICITY_SCATTER_DEX, STAR_COUNT, UNIVERSE_AGE_GYR } from "../../../simulation/star";
import { ENRICHMENT, feH, gasMetallicity, METALLICITY_FLOOR } from "../../../simulation/metallicity";
import { ACCRETION, CENTRAL_BLACK_HOLE, centralBlackHoleFor, DISC_PEAK_TEMPERATURE, THIN_DISC_FROM_EDDINGTON, eventHorizonRadiusKm, SAGITTARIUS_A_STAR_SOLAR, SUPERMASSIVE_FROM_SOLAR } from "../../../simulation/blackHole";
import { formatHorizonRadius, formatInt, formatSig, formatLightYears, formatPercent, formatSolarMasses, LIGHT_YEARS_PER_UNIT } from "../../format";
import type { Chapter, PhysicsContext } from "../catalogue";
import { exact, median, said } from "../catalogue";

/** [Fe/H] as text, with its sign. */
const dex = (value: number) => `${value >= 0 ? "+" : "−"}${Math.abs(value).toFixed(2)}`;

/** The median [Fe/H] of the stars whose age passes `test`, as text. */
function starsAged(ctx: PhysicsContext, test: (age: number) => boolean): string {
  const values = ctx.stars.filter((s) => test(s.age)).map((s) => s.metallicity);
  return values.length === 0 ? "are none" : `have ${dex(median(values))} (${formatInt(values.length)})`;
}

/** Each star's distance from the galaxy's axis in the disc plane, light-years (as the star panel measures it). */
function discDistancesLy(ctx: PhysicsContext): number[] {
  return ctx.stars.map(({ position: [x, , z] }) => Math.sqrt(x * x + z * z) * LIGHT_YEARS_PER_UNIT);
}

export const galaxy: Chapter = {
  id: "galaxy",
  title: "The galaxy",
  intro: "The stage: a galaxy's shape and size, and how many stars it holds.",
  cards: [
    {
      id: "galaxy-type",
      title: "Its shape",
      statement: "The seed's first draw picks the galaxy's type: spiral, elliptical or irregular.",
      rule: `draw < ${GALAXY_TYPE_ROLL.spiralBelow} → spiral; < ${GALAXY_TYPE_ROLL.ellipticalBelow} → elliptical; otherwise irregular`,
      constants: [
        { name: "Spiral", value: formatPercent(GALAXY_TYPE_ROLL.spiralBelow), meaning: "Share of seeds" },
        { name: "Elliptical", value: formatPercent(GALAXY_TYPE_ROLL.ellipticalBelow - GALAXY_TYPE_ROLL.spiralBelow), meaning: "Share of seeds" },
        { name: "Irregular", value: formatPercent(1 - GALAXY_TYPE_ROLL.ellipticalBelow), meaning: "Share of seeds" },
      ],
      why: "Large galaxies come in these broad shapes; the type sets where stars lie (two arms, a flattened ellipsoid, or a scattered cloud).",
      limits: ["The shape decides only where stars are placed: no star's properties depend on where it lies, and the galaxy does not evolve."],
      laws: [],
      code: "simulation/galaxy.ts · pickGalaxyType; simulation/star.ts · posSpiral, posElliptical, posIrregular",
      effect: (ctx) => [said(`This galaxy is ${ctx.galaxy.type}.`, "galaxy.type")],
    },
    {
      id: "galaxy-size",
      title: "Its size",
      statement: "The galaxy's radius is a fixed scale times the expansion rate. The display shows the default as about 50,000 light-years.",
      rule: "radius = GALAXY_SCALE × expansion rate (scene units)",
      constants: [
        { name: "Scale", value: exact(GALAXY_SCALE, "units"), meaning: "Radius at expansion rate 1" },
        { name: "Light-years per unit", value: exact(Math.round(LIGHT_YEARS_PER_UNIT)), meaning: "A display assumption, not a simulation rule" },
        { name: "Particles drawn", value: formatInt(GALAXY_PARTICLE_COUNT), meaning: "The glowing cloud: presentation only" },
      ],
      why: "A Milky Way–sized disc gives distances people can picture.",
      limits: ["Distance from the centre changes nothing about a star's light or life yet: it sets the star's metallicity (below), and so how heavy its planets are; there is no galactic habitable zone and no supernova hazard."],
      laws: [{ law: "expansionRate", how: "Multiplies the radius" }],
      code: "simulation/galaxy.ts · buildGalaxyConfig",
      effect: (ctx) => {
        const distances = discDistancesLy(ctx);
        return [said(
          `Half its stars lie within ${formatLightYears(median(distances))} of the centre; the farthest is ${formatLightYears(Math.max(...distances))} out.`,
          "star.position")];
      },
    },
    {
      id: "central-black-hole",
      title: "Its central black hole",
      statement: "Most galaxies hold a massive black hole at their centre. Its mass is drawn once per galaxy, about a typical value for the galaxy's type; dwarf irregulars often have none.",
      rule: "has one with chance CENTRAL_BLACK_HOLE[type].chance; log₁₀ mass ~ normal(mean, spread); supermassive from SUPERMASSIVE_FROM_SOLAR M☉",
      constants: [
        ...(["spiral", "elliptical", "irregular"] as const).map((type) => ({
          name: type[0].toUpperCase() + type.slice(1),
          value: `${formatPercent(CENTRAL_BLACK_HOLE[type].chance)} · 10^${CENTRAL_BLACK_HOLE[type].log10MeanSolar} M☉ ± ${CENTRAL_BLACK_HOLE[type].spreadDex} dex`,
          meaning: "Chance of one · typical mass ± spread",
        })),
        { name: "Supermassive from", value: formatSolarMasses(SUPERMASSIVE_FROM_SOLAR), meaning: "Below it, intermediate-mass" },
        { name: "Sagittarius A*", value: formatSolarMasses(SAGITTARIUS_A_STAR_SOLAR), meaning: "The Milky Way's, for comparison" },
        { name: "Feeding rate", value: `10^${ACCRETION.log10MeanEddington} ± ${ACCRETION.spreadDex} dex, at most ${ACCRETION.maxEddington}`, meaning: "Share of its Eddington limit" },
        { name: "Thin disc from", value: exact(THIN_DISC_FROM_EDDINGTON), meaning: "Below it, a faint hot flow" },
        { name: "Disc's hottest", value: `${formatInt(DISC_PEAK_TEMPERATURE.kelvin)} K`, meaning: `At the limit around ${formatSolarMasses(DISC_PEAK_TEMPERATURE.atSolar)}; ∝ (rate / mass)^¼` },
      ],
      why: "Observed central black holes run from about a million solar masses in spirals like ours to billions in giant ellipticals, while many dwarf galaxies show none. Most feed slowly, wrapped in faint hot gas like Sagittarius A*; a few feed fast enough for their gas to cool into a thin, brilliant disc (Shakura–Sunyaev).",
      limits: ["Its mass follows the galaxy's type only, not its size; it does not spin; its feeding rate is drawn, not fed by the galaxy's gas; it acts on nothing: no orbits, no quasar phase, no effect on stars or life."],
      laws: [],
      code: "simulation/blackHole.ts · centralBlackHoleFor",
      effect: (ctx) => {
        const hole = centralBlackHoleFor(ctx.galaxy);
        return [hole
          ? said(`This galaxy's is ${formatSolarMasses(hole.massSolar)}, its event horizon ${formatHorizonRadius(eventHorizonRadiusKm(hole))} in radius, feeding at ${formatSig(hole.eddingtonRatio, 2)} of its limit: ${hole.accretionMode === "thin-disc" ? `a thin disc, ${formatInt(hole.discPeakTemperatureK)} K at its inner edge` : "a faint hot flow"}.`, "galaxy.type", "galaxy.seed")
          : said("This galaxy has no central black hole.", "galaxy.type", "galaxy.seed")];
      },
    },
    {
      id: "enrichment",
      title: "The gas grows richer in metals",
      statement: "Every generation of stars returns heavier elements to the gas the next forms from. The gas approaches the type's yield, fastest near the centre, where stars form fastest. Each star keeps the metallicity of the gas where and when it formed.",
      rule: "Z(R, t) = Z_floor + y · (1 − e^(−t / τ)), τ = τ_core · e^(R / R_τ); a star's [Fe/H] = log10 Z(R★, its birth) + a normal scatter",
      constants: [
        { name: "Floor", value: `${exact(METALLICITY_FLOOR)} Z☉`, meaning: "The first gas: [Fe/H] = −3, like the oldest halo stars" },
        { name: "Star scatter", value: `${exact(METALLICITY_SCATTER_DEX)} dex`, meaning: "Standard deviation about the gas, from each star's own stream; about 0.2 is observed, much of it from migration" },
        ...(Object.entries(ENRICHMENT)).map(([type, e]) => ({
          name: type[0].toUpperCase() + type.slice(1),
          value: `y ${exact(e.yieldZ)}, τ_core ${exact(e.coreGyr, "Gyr")}, R_τ ${exact(e.scaleR)}`,
          meaning: type === "spiral" ? "The gas where and when the Sun formed (R 0.52, 9.1 Gyr) is solar"
            : type === "elliptical" ? "One early, fast burst: old stars metal-rich, a shallow gradient"
              : "Slow formation; outflows carry metals away: levels off near −0.3",
        })),
      ],
      why: "The simplest galaxy that turns its gas into stars while fresh gas falls in. Today's spiral gradient comes out near the Milky Way's (about −0.05 dex per kpc).",
      source: "Inside-out disc formation; Magellanic Clouds for irregulars",
      limits: ["Stars and gas do not migrate between radii.", "Metals are one number: no alpha-element enhancement.", "Metallicity does not change the star itself (metal-poor stars are slightly hotter and shorter-lived)."],
      laws: [],
      code: "simulation/metallicity.ts · gasMetallicity (MZ1; decision 7); simulation/star.ts · starMetallicity (MZ2)",
      effect: (ctx) => {
        const at = (rLy: number) => dex(feH(gasMetallicity(ctx.galaxy.type, rLy / LIGHT_YEARS_PER_UNIT / ctx.galaxy.scale, UNIVERSE_AGE_GYR)));
        const distances = discDistancesLy(ctx);
        return [said(
          `Today this ${ctx.galaxy.type} galaxy's gas has [Fe/H] ${at(0)} at the centre, ${at(median(distances))} where half its stars lie within, and ${at(Math.max(...distances))} at its farthest star.`,
          "galaxy.type", "star.position"),
        said(
          `Its stars' median [Fe/H] is ${dex(median(ctx.stars.map((s) => s.metallicity)))}; stars older than 10 Gyr ${starsAged(ctx, (age) => age > 10)}, stars younger than 2 Gyr ${starsAged(ctx, (age) => age < 2)}.`,
          "star.metallicity", "star.age")];
      },
    },
    {
      id: "star-count",
      title: "How many stars, and the age of the universe",
      statement: "Every universe holds the same number of stars, each formed at some moment in the universe's past.",
      constants: [
        { name: "Stars", value: formatInt(STAR_COUNT), meaning: "Every universe" },
        { name: "Age of the universe", value: exact(UNIVERSE_AGE_GYR, "Gyr"), meaning: "No star is older" },
      ],
      why: "Two thousand stars are enough for rare events to happen and few enough to survey every planet's history in a minute.",
      limits: [
        "A real galaxy holds hundreds of billions of stars: rarity here is rarity among two thousand.",
        "Stars that died before today are not in the galaxy (only those alive or as remnants today).",
      ],
      laws: [],
      code: "simulation/star.ts · STAR_COUNT, UNIVERSE_AGE_GYR",
      effect: (ctx) => [said(`This galaxy has ${formatInt(ctx.stars.length)} stars.`, "stars")],
    },
  ],
  missing: [
    "The galaxy does not change over time: its shape, and the stars that died before today, are not modelled (Deep Time, step 9).",
  ],
};
