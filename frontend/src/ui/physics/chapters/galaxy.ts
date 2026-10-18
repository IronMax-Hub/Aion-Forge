// Chapter 2 of the Physics page: the galaxy (PH1).

import { GALAXY_PARTICLE_COUNT, GALAXY_SCALE, GALAXY_TYPE_ROLL } from "../../../simulation/galaxy";
import { STAR_COUNT, UNIVERSE_AGE_GYR } from "../../../simulation/star";
import { ENRICHMENT, feH, gasMetallicity, METALLICITY_FLOOR } from "../../../simulation/metallicity";
import { formatInt, formatLightYears, formatPercent, LIGHT_YEARS_PER_UNIT } from "../../format";
import type { Chapter, PhysicsContext } from "../catalogue";
import { exact, median, said } from "../catalogue";

/** [Fe/H] as text, with its sign. */
const dex = (value: number) => `${value >= 0 ? "+" : "−"}${Math.abs(value).toFixed(2)}`;

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
      limits: ["Distance from the centre changes nothing about a star yet: the gas's metallicity varies with it (below), but no star reads it until MZ2; there is no galactic habitable zone and no supernova hazard."],
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
      id: "enrichment",
      title: "The gas grows richer in metals",
      statement: "Every generation of stars returns heavier elements to the gas the next forms from. The gas approaches the type's yield, fastest near the centre, where stars form fastest.",
      rule: "Z(R, t) = Z_floor + y · (1 − e^(−t / τ)), τ = τ_core · e^(R / R_τ); [Fe/H] = log10 Z",
      constants: [
        { name: "Floor", value: `${exact(METALLICITY_FLOOR)} Z☉`, meaning: "The first gas: [Fe/H] = −3, like the oldest halo stars" },
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
      limits: ["Stars and gas do not migrate between radii.", "Metals are one number: no alpha-element enhancement."],
      laws: [],
      code: "simulation/metallicity.ts · gasMetallicity (MZ1; decision 7)",
      effect: (ctx) => {
        const at = (rLy: number) => dex(feH(gasMetallicity(ctx.galaxy.type, rLy / LIGHT_YEARS_PER_UNIT / ctx.galaxy.scale, UNIVERSE_AGE_GYR)));
        const distances = discDistancesLy(ctx);
        return [said(
          `Today this ${ctx.galaxy.type} galaxy's gas has [Fe/H] ${at(0)} at the centre, ${at(median(distances))} where half its stars lie within, and ${at(Math.max(...distances))} at its farthest star.`,
          "galaxy.type", "star.position")];
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
    "No star carries a metallicity yet: every star is made of the same stuff until MZ2.",
  ],
};
