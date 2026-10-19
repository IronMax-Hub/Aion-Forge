// Chapter 3 of the Physics page: stars (PH1).

import {
  ACTIVITY_DECAY_EXPONENT, ACTIVITY_SCALE, ENVELOPE_FADE_K, PAST_GIANT_TEMPERATURE_K, SOLAR_AGE_GYR, SOLAR_RADIUS_AU, GIANT_LUMINOSITY_FACTOR, LIFESPAN, luminosityAt, MAIN_SEQUENCE_BRIGHTENING,
  MAIN_SEQUENCE_END_FRACTION, MASS_DRAW, MASS_LUMINOSITY_EXPONENT, MS_RADIUS_EXPONENT, NEUTRON_STAR_LUMINOSITY,
  PROTOSTAR_FRACTION, PROTOSTAR_MAX_GYR, RARE_STAR, REMNANT_FRACTION, REMNANT_MASS, SATURATION, saturationTimeGyr,
  SOLAR_TEMPERATURE_K, SOLAR_XUV_TODAY, stellarRadiusAU, TEMP_RANGE, TEMPERATURE_JITTER, UNIVERSE_AGE_GYR,
  WHITE_DWARF_LUMINOSITY, XUV_MAX_NM, XUV_SATURATED_SHARE, xuvLuminosityAt,
} from "../../../simulation/star";
import type { Star, StellarClass } from "../../../simulation/star";
import {
  CIRCULAR_BELOW_DAYS, COMPANION_CHANCE, DAYS_PER_YEAR, LOG_PERIOD_DAYS, MASS_RATIO, MAX_ECCENTRICITY,
} from "../../../simulation/binary";
import { formatGyr, formatInt, formatPercent, formatSig, spectralType, starName, STELLAR_CLASS_NAME } from "../../format";
import type { Chapter } from "../catalogue";
import { exact, median, said } from "../catalogue";

const CLASSES: StellarClass[] = ["protostar", "main-sequence", "red-giant", "white-dwarf", "neutron-star", "black-hole"];

/** "1,203 main-sequence stars, 412 red giants, …", for the classes present. */
function classMix(stars: readonly Star[]): string {
  return CLASSES
    .map((cls) => [cls, stars.filter((s) => s.classification === cls).length] as const)
    .filter(([, n]) => n > 0)
    .map(([cls, n]) => `${formatInt(n)} ${STELLAR_CLASS_NAME[cls]}${n === 1 ? "" : "s"}`)
    .join(", ");
}

const MASS_BINS: { label: string; below: number }[] = [
  { label: "under 0.5 M☉", below: 0.5 },
  { label: "0.5–1 M☉", below: 1 },
  { label: "1–2 M☉", below: 2 },
  { label: "2–8 M☉", below: 8 },
  { label: "8–25 M☉", below: 25 },
  { label: "over 25 M☉", below: Infinity },
];

export const stars: Chapter = {
  id: "stars",
  title: "Stars",
  intro: "Every star is decided by three draws: its mass, its age and a small spread in temperature. Everything else follows from mass and age.",
  cards: [
    {
      id: "star-mass",
      title: "Masses: most stars are small",
      statement: "A star's mass comes from one draw through a curve that makes small stars common and giant ones rare, as in real star formation.",
      rule: MASS_DRAW.map((b) => `draw < ${b.below}: ${b.base} + (draw − ${b.from}) × ${b.slope}`).join("; ") + " (M☉); the draw is divided by the ignition threshold",
      constants: MASS_DRAW.map((b) => ({ name: `Below draw ${b.below}`, value: `${b.base} M☉ + ${b.slope} per unit`, meaning: "One piece of the curve" })),
      why: "Real stars follow an initial mass function weighted heavily towards red dwarfs; a piecewise curve gives that shape with one draw.",
      source: "Shape inspired by the initial mass function (Salpeter, Kroupa); not fitted to it",
      limits: ["The smallest star is 0.1 M☉ and the largest about 100 M☉; brown dwarfs are not made.", "Far more massive stars than in the Milky Way: 12% of draws (those above 0.88) give more than 5 M☉."],
      laws: [{ law: "stellarIgnitionThreshold", how: "Divides the draw: above 1, fewer heavy stars" }],
      code: "simulation/star.ts · MASS_DRAW, generateMass",
      effect: (ctx) => {
        let from = 0;
        const parts = MASS_BINS.map(({ label, below }) => {
          const n = ctx.stars.filter((s) => s.mass >= from && s.mass < below).length;
          from = below;
          return `${label}: ${formatInt(n)}`;
        });
        return [said(`Stars by mass: ${parts.join("; ")}.`, "star.mass")];
      },
    },
    {
      id: "star-lifespan",
      title: "Lifespan: heavy stars burn out fast",
      statement: "A star's life shortens steeply with mass: twice the Sun's mass lives about a sixth as long.",
      rule: `lifespan = ${LIFESPAN.solarGyr} Gyr / M^${LIFESPAN.massExponent} / entropy rate, at least ${LIFESPAN.minGyr} Gyr`,
      constants: [
        { name: "A Sun's lifespan", value: exact(LIFESPAN.solarGyr, "Gyr"), meaning: "At 1 M☉" },
        { name: "Exponent", value: exact(LIFESPAN.massExponent), meaning: "Fuel ∝ M, burned at L ∝ M^3.5" },
        { name: "Shortest life", value: exact(LIFESPAN.minGyr, "Gyr"), meaning: "A floor for the heaviest stars" },
      ],
      why: "A star's fuel grows with its mass but its luminosity grows much faster (L ∝ M^3.5), so heavy stars spend it sooner.",
      source: "Main-sequence scaling relations",
      limits: ["The entropy rate shortens lifespans without making stars brighter (issue C7)."],
      laws: [{ law: "entropyRate", how: "Divides every lifespan" }],
      code: "simulation/star.ts · LIFESPAN, calcLifespan",
      effect: (ctx) => {
        const shortest = ctx.stars.reduce((a, s) => (s.lifespan < a.lifespan ? s : a));
        const mortal = ctx.stars.filter((s) => s.lifespan < UNIVERSE_AGE_GYR).length;
        return [
          said(`A Sun-mass star here lives ${formatGyr(LIFESPAN.solarGyr / ctx.config.entropyRate)}.`, "LIFESPAN", "config.entropyRate"),
          said(`${formatInt(mortal)} of its stars have lifespans shorter than the universe's age; the shortest, ${starName(shortest.id)} (${formatSig(shortest.mass)} M☉), lives ${formatGyr(shortest.lifespan)}.`, "star.lifespan"),
        ];
      },
    },
    {
      id: "star-age",
      title: "Ages",
      statement: "Each star formed at a random moment within its lifespan or the universe's age, whichever is shorter, so every star in the galaxy is alive or a remnant today.",
      rule: `age = draw × min(lifespan, ${UNIVERSE_AGE_GYR} Gyr)`,
      constants: [{ name: "Age of the universe", value: exact(UNIVERSE_AGE_GYR, "Gyr"), meaning: "No star is older" }],
      why: "Star formation spread over cosmic time; the draw stands in for a constant birth rate.",
      limits: ["A constant birth rate: the early universe's burst of star formation is not modelled.", "No star has already died and gone: remnants appear only in the last 5% of a life."],
      laws: [{ law: "entropyRate", how: "Shorter lifespans cap ages lower" }],
      code: "simulation/star.ts · generateStarsFor",
      effect: (ctx) => [said(
        `The median star is ${formatGyr(median(ctx.stars.map((s) => s.age)))} old; ${formatInt(ctx.stars.filter((s) => s.age > 10).length)} are older than 10 Gyr.`,
        "star.age")],
    },
    {
      id: "star-phases",
      title: "Life stages",
      statement: "A star contracts as a protostar, burns hydrogen on the main sequence, swells into a giant, and ends as a white dwarf, neutron star or black hole depending on its mass.",
      rule: `protostar until min(${PROTOSTAR_FRACTION} × lifespan, ${PROTOSTAR_MAX_GYR} Gyr); main sequence to ${MAIN_SEQUENCE_END_FRACTION} of its life; giant to ${REMNANT_FRACTION}; then a remnant: white dwarf below ${REMNANT_MASS.neutronStarFrom} M☉, neutron star to ${REMNANT_MASS.blackHoleAbove} M☉, black hole above`,
      constants: [
        { name: "Main sequence ends", value: formatPercent(MAIN_SEQUENCE_END_FRACTION), meaning: "Share of the lifespan" },
        { name: "Remnant from", value: formatPercent(REMNANT_FRACTION), meaning: "Share of the lifespan" },
        { name: "Neutron star from", value: exact(REMNANT_MASS.neutronStarFrom, "M☉"), meaning: "Below: white dwarf" },
        { name: "Black hole above", value: exact(REMNANT_MASS.blackHoleAbove, "M☉"), meaning: "" },
      ],
      why: "These are the stages and mass limits of stellar evolution, simplified to fixed shares of a star's life.",
      limits: [
        "The giant phase is one stage at once 500 times brighter; subgiants, the helium flash and planetary nebulae are not modelled.",
        `A star that is a remnant today was a giant until it became one; its planets felt that light (decision 44). Its giant temperature is not stored and is taken as ${formatInt(PAST_GIANT_TEMPERATURE_K)} K.`,
        "Neutron stars and black holes have no planets.",
      ],
      laws: [],
      code: "simulation/star.ts · classify",
      effect: (ctx) => [said(`${classMix(ctx.stars)}.`, "star.classification")],
    },
    {
      id: "star-light",
      title: "Brightness and colour",
      statement: "A main-sequence star's brightness rises as the 3.5th power of its mass; its temperature follows from that brightness and its size, with a ±10% spread. Giants shine 500 times brighter than they did on the main sequence; remnants are faint.",
      rule: `L = M^${MASS_LUMINOSITY_EXPONENT}; R = M^${MS_RADIUS_EXPONENT}; T = ${SOLAR_TEMPERATURE_K} K × (L / R²)^¼ × (${TEMPERATURE_JITTER.low} + draw × ${TEMPERATURE_JITTER.span}); giant L × ${GIANT_LUMINOSITY_FACTOR}; white dwarf ${WHITE_DWARF_LUMINOSITY.base} + (T / ${WHITE_DWARF_LUMINOSITY.hottestK}) × ${WHITE_DWARF_LUMINOSITY.range} L☉; neutron star ${NEUTRON_STAR_LUMINOSITY} L☉`,
      constants: [
        { name: "Mass–luminosity exponent", value: exact(MASS_LUMINOSITY_EXPONENT), meaning: "L ∝ M^3.5" },
        { name: "Giant brightening", value: `× ${GIANT_LUMINOSITY_FACTOR}`, meaning: "Over its main-sequence luminosity" },
        { name: "Main-sequence temperatures", value: `${formatInt(TEMP_RANGE["main-sequence"][0])}–${formatInt(TEMP_RANGE["main-sequence"][1])} K`, meaning: "Clamped to this range" },
      ],
      why: "Stefan–Boltzmann (L = R² T⁴ in solar units) ties colour to brightness and size, so a star's colour and light agree.",
      source: "Mass–luminosity and mass–radius relations; Stefan–Boltzmann law",
      limits: ["The temperature spread changes colour without changing brightness, so a star's radius from L and T differs by up to ±20% from the one that set T (issue C8).", "Giants' and remnants' temperatures are drawn within a range, not computed."],
      laws: [],
      code: "simulation/star.ts · calcTemperature, calcLuminosity",
      effect: (ctx) => {
        const letters = new Map<string, number>();
        for (const s of ctx.stars) {
          const type = spectralType(s.temperature, s.classification);
          if (type && s.classification === "main-sequence") letters.set(type[0], (letters.get(type[0]) ?? 0) + 1);
        }
        const order = ["O", "B", "A", "F", "G", "K", "M", "L"].filter((l) => letters.has(l));
        const total = ctx.stars.reduce((sum, s) => sum + s.luminosity, 0);
        const sorted = [...ctx.stars].sort((a, b) => b.luminosity - a.luminosity);
        const top = sorted.slice(0, Math.max(1, Math.round(ctx.stars.length / 100))).reduce((sum, s) => sum + s.luminosity, 0);
        return [
          said(`Main-sequence stars by class: ${order.map((l) => `${formatInt(letters.get(l)!)} ${l}`).join(", ")}.`, "star.temperature", "star.classification"),
          said(`The brightest 1% of stars give ${formatPercent(top / total)} of the galaxy's light; the brightest, ${starName(sorted[0].id)}, shines at ${formatSig(sorted[0].luminosity)} L☉.`, "star.luminosity"),
        ];
      },
    },
    {
      id: "star-brightening",
      title: "Stars brighten as they age",
      statement: "On the main sequence a star's light rises steadily: it ends 80% brighter than it began. The Sun started at about 70% of today's light.",
      rule: `L(t) ∝ 1 + ${MAIN_SEQUENCE_BRIGHTENING} × t / t_main-sequence-end, anchored so today's luminosity is unchanged`,
      constants: [{ name: "Brightening over the main sequence", value: `${formatPercent(MAIN_SEQUENCE_BRIGHTENING)}`, meaning: "From birth to the main sequence's end" }],
      why: "Hydrogen fusion raises a star's core density and temperature as it goes; the faint young Sun is the classic case. Every planet's climate history reads this.",
      source: "Standard solar model (the faint young Sun)",
      limits: ["Linear in time; the jump to the giant phase is instant.", "A star that has left the main sequence has its track anchored at mid main sequence (an owner decision in A1)."],
      laws: [],
      code: "simulation/star.ts · luminosityAt",
      effect: (ctx) => {
        const ratios = ctx.stars.filter((s) => s.classification === "main-sequence").map((s) => luminosityAt(s, 0) / s.luminosity);
        return [said(`The median main-sequence star began at ${formatPercent(median(ratios))} of today's light.`, "luminosityAt", "star.luminosity")];
      },
    },
    {
      id: "star-radius",
      title: "Size, and planets swallowed",
      statement: "A star's radius follows from its light and temperature. A giant swells to an AU or more and swallows the planets inside it; a remnant swallowed those inside the giant it once was.",
      rule: `R = R☉ × √L × (${SOLAR_TEMPERATURE_K} K / T)²; a planet whose orbit lies inside R is removed`,
      constants: [{ name: "The Sun's radius", value: `${SOLAR_RADIUS_AU} AU`, meaning: "R☉" }],
      why: "Stefan–Boltzmann again: a cool, bright giant must be enormous.",
      limits: ["Engulfment is decided by today's radius only: a planet is gone or untouched, never partly evaporated or moved outward by the star's mass loss."],
      laws: [{ law: "gravityStrength", how: "Orbits move in by √gravity, so more planets lie inside a giant" }],
      code: "simulation/star.ts · stellarRadiusAU; simulation/planet.ts · generatePlanetsFor",
      effect: (ctx) => {
        const largest = ctx.stars.reduce((a, s) => (stellarRadiusAU(s) > stellarRadiusAU(a) ? s : a));
        const out = [said(`The largest star, ${starName(largest.id)} (${STELLAR_CLASS_NAME[largest.classification]}), has a radius of ${formatSig(stellarRadiusAU(largest))} AU.`, "stellarRadiusAU")];
        if (ctx.engulfedPlanets !== null) out.push(said(`${formatInt(ctx.engulfedPlanets)} planets were engulfed by their stars.`, "survey.engulfedPlanets"));
        return out;
      },
    },
    {
      id: "star-activity",
      title: "Magnetic activity, flares and ultraviolet",
      statement: "Young stars are magnetically active: they flare, and give off X-rays and extreme ultraviolet (XUV). Activity stays at full strength until a saturation time, then fades. Red dwarfs stay saturated for billions of years; the Sun left saturation at 0.1 Gyr and has been fading since.",
      rule: `activity = 1 until t_sat, then (t / t_sat)^−${ACTIVITY_DECAY_EXPONENT}; XUV = L × (s × ${formatSig(XUV_SATURATED_SHARE)} × activity × envelope + photosphere below ${XUV_MAX_NM} nm)`,
      constants: [
        { name: "Saturated XUV share", value: formatSig(XUV_SATURATED_SHARE), meaning: "f_sat (Wright et al. 2011)" },
        { name: "Decay exponent", value: exact(ACTIVITY_DECAY_EXPONENT), meaning: "Ribas et al. 2005" },
        { name: "Saturation time", value: `${SATURATION.gGyr} Gyr from ${formatInt(SATURATION.gK)} K; ${SATURATION.earlyMGyr} Gyr at ${formatInt(SATURATION.earlyMK)} K; ${SATURATION.lateMGyr} Gyr at ${formatInt(SATURATION.lateMK)} K`, meaning: "Linear between (West et al. 2008 for red dwarfs)" },
        { name: "Envelope fade", value: `${formatInt(ENVELOPE_FADE_K.from)}–${formatInt(ENVELOPE_FADE_K.to)} K`, meaning: "Hot stars have no convective envelope" },
        { name: "The Sun's XUV today", value: `${SOLAR_XUV_TODAY} L☉`, meaning: `At ${SOLAR_AGE_GYR} Gyr; the law is scaled by s = ${formatSig(ACTIVITY_SCALE)} to give it` },
      ],
      why: "Activity comes from a star's convective envelope and spin, which slows with age. Flares harm surface life; XUV strips air from weak-gravity worlds (step 3).",
      source: "Wright et al. 2011; Ribas et al. 2005; West et al. 2008",
      limits: ["No spread in rotation: stars of one temperature and age are equally active.", "After the main sequence the XUV is held at its last value; a white dwarf's own ultraviolet is not counted."],
      laws: [],
      code: "simulation/star.ts · activityAt, saturationTimeGyr, xuvLuminosityAt, xuvFluence",
      effect: (ctx) => {
        const saturated = ctx.stars.filter((s) => s.classification === "main-sequence" && s.age < saturationTimeGyr(s.temperature));
        const redDwarfs = saturated.filter((s) => s.temperature < SATURATION.earlyMK).length;
        const xuv = ctx.stars.map((s) => xuvLuminosityAt(s, s.age));
        return [
          said(`${formatInt(saturated.length)} main-sequence stars are still at full activity today, ${formatInt(redDwarfs)} of them red dwarfs.`, "star.age", "saturationTimeGyr"),
          said(`The strongest XUV source gives ${formatSig(Math.max(...xuv) / SOLAR_XUV_TODAY)} times the Sun's.`, "xuvLuminosityAt"),
        ];
      },
    },
    {
      id: "star-rare",
      title: "Rare stars",
      statement: "A star is marked rare when it is very massive, a neutron star or black hole, or an old red dwarf near the end of a very long life.",
      rule: `mass > ${RARE_STAR.massAbove} M☉, or a neutron star or black hole, or main sequence past ${formatPercent(RARE_STAR.oldShareAbove)} of its life below ${RARE_STAR.oldDwarfMassBelow} M☉`,
      constants: [],
      why: "A label for discovery and the timeline; it changes nothing the star does.",
      limits: ["A dwarf below 0.5 M☉ lives over 56 Gyr (over 28 Gyr even at the highest entropy rate), so within 13.7 Gyr it never passes 90% of its life: that clause never fires."],
      laws: [],
      code: "simulation/star.ts · RARE_STAR",
      effect: (ctx) => [said(`${formatInt(ctx.stars.filter((s) => s.isRare).length)} of its stars are rare.`, "star.isRare")],
    },
    {
      id: "star-companions",
      title: "Companions",
      statement: "About half of Sun-like stars have a companion, more among heavy stars and fewer among red dwarfs. A companion is lighter than its primary, shares its age, and orbits it at a distance drawn from the observed spread of binary periods, from days to millions of years.",
      rule: `chance ${COMPANION_CHANCE.map((b) => `${b.chance} below ${b.massBelow} M☉`).join(", ").replace(" below Infinity M☉", " above")}; companion mass = q × primary, q uniform ${MASS_RATIO.min}–${MASS_RATIO.max}; log₁₀(period / days) normal, median ${LOG_PERIOD_DAYS.median}, σ ${LOG_PERIOD_DAYS.sigma}; a³ = (M₁ + M₂) × (period / ${DAYS_PER_YEAR} days)² (AU); e = 0 below ${CIRCULAR_BELOW_DAYS} days, else uniform 0–${MAX_ECCENTRICITY}`,
      constants: [
        ...COMPANION_CHANCE.map((b, i) => ({
          name: b.massBelow === Infinity ? `Above ${COMPANION_CHANCE[i - 1].massBelow} M☉` : `Below ${b.massBelow} M☉`,
          value: formatPercent(b.chance),
          meaning: "Chance of a companion",
        })),
        { name: "Median period", value: `10^${LOG_PERIOD_DAYS.median} days`, meaning: `About ${formatInt(Math.pow(10, LOG_PERIOD_DAYS.median) / DAYS_PER_YEAR)} years; spread ${LOG_PERIOD_DAYS.sigma} dex` },
        { name: "Circular below", value: exact(CIRCULAR_BELOW_DAYS, "days"), meaning: "Tides have circularised closer orbits" },
      ],
      why: "Multiplicity rises with stellar mass, and solar-type binaries' periods follow a broad log-normal; Kepler's law turns a period into a separation. Each companion is drawn from its own stream, so every other star and planet is unchanged.",
      source: "Duchêne & Kraus 2013; Raghavan et al. 2010",
      limits: [
        "Companions limit where planets can orbit (BS2, in the chapter on planetary systems); their light reaches planets from BS3.",
        "Companions have no planets of their own (decision 15); triples and higher multiples are not made.",
        "The period spread is not cut off at short periods, so a few pairs are drawn closer than their stars' radii allow.",
        "Separations do not read the laboratory's gravity (decision 45).",
      ],
      laws: [{ law: "entropyRate", how: "Divides the companion's lifespan, as any star's" }],
      code: "simulation/binary.ts · drawCompanion; simulation/star.ts · companionFrom",
      effect: (ctx) => {
        const binaries = ctx.stars.filter((s) => s.companion);
        const sunLike = ctx.stars.filter((s) => s.mass >= 0.5 && s.mass < 1.3);
        return [
          said(`${formatInt(binaries.length)} of its ${formatInt(ctx.stars.length)} stars have a companion; among Sun-like stars (0.5–1.3 M☉), ${formatPercent(sunLike.filter((s) => s.companion).length / Math.max(1, sunLike.length))}.`, "star.companion"),
          said(`The median pair is ${formatSig(median(binaries.map((s) => s.companion!.separationAU)))} AU apart.`, "star.companion.separationAU"),
        ];
      },
    },
  ],
  missing: [
    "No triple or higher multiple stars, and companions without planets of their own (step 6).",
    "No metallicity (step 4).",
    "No stars that died before today; the galaxy's past light is not modelled (step 9).",
  ],
};
