// Chapters 4 and 5 of the Physics page: planetary systems, and a planet's body (PH2).

import {
  ARCHITECTURE_ROLL, ATMOSPHERE_DRAW, DESERT_MAX_OCEAN, OWN_AIR_STREAM_BELOW_MASS, DESERT_MIN_K, DUST_SUBLIMATION_K,
  FIRST_ORBIT_AU, ICE_GIANT_MAX_K, ICE_WORLD_MIN_ICE, LAVA_MIN_K, METALLICITY_MASS_EXPONENT, OCEAN_WORLD_MIN_OCEAN, ORBIT_SPACING,
  PLANET_COUNT,
} from "../../../simulation/planet";
import { GIANT_PLANET_MASS, MASS_RADIUS, PLANET_MASS_DRAW } from "../../../simulation/planetBasics";
import {
  EARTH_ESCAPE_VELOCITY_KMS, INTERIOR_COOLING_GYR, ROTATION_HOURS, SNOW_LINE_AU_PER_SQRT_L, SURFACE_PRESSURE_BAR,
  TIDAL_LOCK_CONSTANT_AU, TILT, WATER_BEYOND_SNOW_LINE, WATER_INSIDE_SNOW_LINE, WATER_RETENTION_MASS,
} from "../../../simulation/planetPhysics";
import { EQUILIBRIUM_K_AT_1_AU } from "../../../simulation/climate";
import { EARTH_HEAT_FLOW_W_M2, interiorHeatFlow, interiorTemperatureK, TIDAL_K2_OVER_Q } from "../../../simulation/interiorHeat";
import {
  FIRST_MOON_ORBIT, HILL_SHARE, LARGE_MOON, MOON_COUNT, MOON_ECCENTRICITY, MOON_SPACING, MOON_WATER, SATELLITE_MASS_RATIO,
  TILT_HOLDING_RATIO,
} from "../../../simulation/moons";
import { TILT_WANDER } from "../../../simulation/worldHistory";
import { P_TYPE_LIMIT, pTypeLimitAU, S_TYPE_LIMIT, sTypeLimitAU } from "../../../simulation/binary";
import { HILL_SPACING } from "../../../simulation/rogues";
import { ATMOSPHERE_CODES, INDEX_FLAG, PLANET_TYPE_CODES } from "../../../simulation/universeIndex";
import type { UniverseIndex } from "../../../simulation/universeIndex";
import { formatInt, formatPercent, formatSig, PLANET_TYPE_LABEL } from "../../format";
import type { Chapter } from "../catalogue";
import { exact, median, rowsWhere, said } from "../catalogue";

const solidRows = (ix: UniverseIndex) => rowsWhere(ix, (i) => !Number.isNaN(ix.oceanFraction[i]));
const gravityOf = (ix: UniverseIndex, i: number) => ix.massEarths[i] / (ix.radiusEarths[i] * ix.radiusEarths[i]);
/** Saturn's mass, M⊕: "heavier than Saturn" in the plan's words. */
const SATURN_MASS = 95;

export const systems: Chapter = {
  id: "systems",
  title: "Planetary systems",
  intro: "How many planets a star gets, where they orbit, how heavy they are and what air they start with.",
  cards: [
    {
      id: "planet-count",
      title: "How many planets",
      statement: "One star in ten is barren and some have one or two planets; the rest have a base number plus up to four more. Heavier, short-lived stars get fewer. Neutron stars and black holes get none.",
      rule: `draw < ${PLANET_COUNT.barrenBelow}: none; < ${PLANET_COUNT.sparseBelow}: ${PLANET_COUNT.sparse.min}–${PLANET_COUNT.sparse.min + PLANET_COUNT.sparse.range - 1}; else base + 0–${PLANET_COUNT.extraRange - 1}, base ${PLANET_COUNT.base.counts.join(" / ")} below ${PLANET_COUNT.base.belowMass.join(" / ")} M☉ / above`,
      constants: [],
      why: "Most Sun-like stars host planets; very massive stars live too briefly and blow their disks away sooner.",
      limits: ["The count drawn does not depend on the star's metallicity or on a companion (step 6); a metal-poor star loses the bodies too small to be planets (see masses)."],
      laws: [],
      code: "simulation/planet.ts · PLANET_COUNT, planetCount",
      needsIndex: true,
      effect: (ctx) => {
        const ix = ctx.index!;
        const hosts = new Set(Array.from(ix.starId)).size;
        return [said(`${formatInt(hosts)} of ${formatInt(ctx.stars.length)} stars have planets today, ${formatSig(ix.count / Math.max(1, hosts))} each on average.`, "index.starId")];
      },
    },
    {
      id: "orbits",
      title: "Where planets orbit",
      statement: "The innermost planet forms beyond the young star's dust-sublimation line, where dust would be too hot to survive; each next orbit is a fixed-ish ratio further out, set by the system's architecture.",
      rule: `first orbit ${FIRST_ORBIT_AU.base}–${FIRST_ORBIT_AU.base + FIRST_ORBIT_AU.spread} AU, moved out as a whole to at least (${EQUILIBRIUM_K_AT_1_AU} / ${DUST_SUBLIMATION_K} K)² × √L(birth) AU; next = previous × ratio`,
      constants: [
        { name: "Dust sublimation", value: exact(DUST_SUBLIMATION_K, "K"), meaning: "Planets form outside this temperature" },
        ...(Object.entries(ORBIT_SPACING) as [string, { base: number; spread: number }][]).map(([arch, s]) => ({
          name: `${arch[0].toUpperCase()}${arch.slice(1)} spacing`, value: `× ${s.base}–${formatSig(s.base + s.spread)}`, meaning: "Ratio of each orbit to the one before",
        })),
        { name: "Architecture shares", value: `${formatPercent(ARCHITECTURE_ROLL.compactBelow)} / ${formatPercent(ARCHITECTURE_ROLL.distributedBelow - ARCHITECTURE_ROLL.compactBelow)} / ${formatPercent(ARCHITECTURE_ROLL.resonantBelow - ARCHITECTURE_ROLL.distributedBelow)} / ${formatPercent(1 - ARCHITECTURE_ROLL.resonantBelow)}`, meaning: "Compact / distributed / resonant / chaotic" },
      ],
      why: "Planets form in the disk of dust and gas around a young star, where solids can exist; a brighter star pushes that edge out, so its planets form farther away at similar temperatures.",
      limits: ["Orbits are circular and never migrate; planets never scatter one another (step 7 adds that)."],
      laws: [{ law: "gravityStrength", how: "Divides every orbit by √gravity (the effective orbit the climate feels)" }],
      code: "simulation/planet.ts · dustSublimationAU, generateOrbits",
      needsIndex: true,
      effect: (ctx) => {
        const ix = ctx.index!;
        const orbits = Array.from(ix.orbitAU);
        return [said(`The median planet orbits at ${formatSig(median(orbits))} AU; the closest at ${formatSig(Math.min(...orbits))} AU and the farthest at ${formatInt(Math.max(...orbits))} AU.`, "index.orbitAU")];
      },
    },
    {
      id: "planet-mass",
      title: "Planet masses, and giants",
      statement: "A planet's mass is drawn evenly on a logarithmic scale up to 25 Earth masses; the top tenth of draws spreads from there to 13 Jupiter masses. The draw is then scaled by the solids in the star's disk, which follow its metallicity: a metal-poor star builds lighter planets, and a body that ends up too small is no planet. Above 15 Earth masses a planet is a giant with no solid surface.",
      rule: `log-uniform ${formatSig(PLANET_MASS_DRAW.min)}–${formatSig(PLANET_MASS_DRAW.knee.mass)} M⊕ for draws below ${PLANET_MASS_DRAW.knee.u}; log-uniform ${formatSig(PLANET_MASS_DRAW.knee.mass)}–${formatInt(PLANET_MASS_DRAW.max)} M⊕ above; then × 10^(α · [Fe/H]), at most ${formatInt(PLANET_MASS_DRAW.max)} M⊕; below ${formatSig(PLANET_MASS_DRAW.min)} M⊕ no planet`,
      constants: [
        { name: "α", value: exact(METALLICITY_MASS_EXPONENT), meaning: "Mass ∝ the disk's solids (decision 8)" },
        { name: "Giant above", value: exact(GIANT_PLANET_MASS, "M⊕"), meaning: "No solid surface beyond this" },
        { name: "Heaviest planet", value: exact(PLANET_MASS_DRAW.max, "M⊕"), meaning: "About 13 Jupiter masses, where brown dwarfs begin" },
      ],
      why: "Small planets are common and giants rarer, as exoplanet surveys find; a single cut separates rocky worlds from those that gathered thick gas envelopes.",
      limits: [
        "Every planet scales alike, though observed small planets barely depend on metallicity (Buchhave et al. 2012; Petigura et al. 2018); only giants do. Kept as the simplest rule (decision 8).",
        "No mass depends on the orbit: a giant can form anywhere.",
      ],
      laws: [],
      code: "simulation/planetBasics.ts · PLANET_MASS_DRAW, GIANT_PLANET_MASS; simulation/planet.ts · planetMassFor (MZ3)",
      needsIndex: true,
      effect: (ctx) => {
        const ix = ctx.index!;
        const giants = rowsWhere(ix, (i) => ix.massEarths[i] > GIANT_PLANET_MASS).length;
        const saturns = rowsWhere(ix, (i) => ix.massEarths[i] > SATURN_MASS).length;
        const out = [said(`${formatInt(giants)} of ${formatInt(ix.count)} planets are giants (${formatPercent(giants / ix.count)}); ${formatInt(saturns)} are heavier than Saturn.`, "index.massEarths")];
        // Stars hosting a giant, metal-rich against metal-poor
        const hosts = new Set(rowsWhere(ix, (i) => ix.massEarths[i] > GIANT_PLANET_MASS).map((i) => ix.starId[i]));
        const share = (test: (feH: number) => boolean) => {
          const stars = ctx.stars.filter((s) => test(s.metallicity));
          return stars.length === 0 ? "none" : formatPercent(stars.filter((s) => hosts.has(s.id)).length / stars.length);
        };
        out.push(said(`A giant orbits ${share((z) => z >= 0)} of stars at or above solar metallicity and ${share((z) => z < -0.5)} of stars below −0.5.`, "index.massEarths", "star.metallicity"));
        if (ctx.tooSmallPlanets !== null) out.push(said(`${formatInt(ctx.tooSmallPlanets)} bodies were too small to be planets.`, "survey.tooSmallPlanets"));
        return out;
      },
    },
    {
      id: "planet-radius",
      title: "Planet sizes",
      statement: "A planet's radius follows from its mass by a measured law with three regimes, rocky, Neptune-like and Jupiter-like, and a ±20% spread for make-up.",
      rule: MASS_RADIUS.map((l) => `M ≤ ${l.upToMass === Infinity ? "∞" : l.upToMass}: R = ${l.coefficient} · M^${l.exponent}`).join("; ") + " (× 0.8–1.2)",
      constants: [],
      why: "Rock compresses slowly, gas envelopes swell quickly, and above about 0.4 Jupiter masses more mass barely changes a giant's size.",
      source: "Chen & Kipping 2017 (ApJ 834, 17)",
      limits: ["The fit includes inflated hot Jupiters, so a Saturn-mass planet comes out about a quarter larger than Saturn."],
      laws: [],
      code: "simulation/planetBasics.ts · MASS_RADIUS, typicalRadiusForMass",
      needsIndex: true,
      effect: (ctx) => {
        const ix = ctx.index!;
        const solid = solidRows(ix).map((i) => ix.radiusEarths[i]);
        return [said(`Solid planets' median radius is ${formatSig(median(solid))} R⊕; the largest planet is ${formatSig(Math.max(...Array.from(ix.radiusEarths)))} R⊕.`, "index.radiusEarths")];
      },
    },
    {
      id: "moons",
      title: "Moons of giants",
      statement: "A giant builds a satellite system in the disk around it: two to five moons sharing a fixed share of its mass, spaced outward like Jupiter's, none beyond half the planet's Hill radius. Moons formed beyond the snow line are rich in ice; all are locked to their planet and share its tilt. The planet's tide flexes each moon on its eccentric orbit and heats it: q = (21/2)(k₂/Q) G M_p² R⁵ n e² / a⁶ / 4πR². Moons as heavy as the smallest planet are worlds: the same physics, history, life and civilizations as planets, in their planet's starlight, warmed by tides too (MO4).",
      rule: `system mass = ${exact(SATELLITE_MASS_RATIO)} × M_p, split at sorted uniform draws; first orbit ${FIRST_MOON_ORBIT.planetRadii}–${FIRST_MOON_ORBIT.planetRadii * (1 + FIRST_MOON_ORBIT.spread)} planet radii, each next × ${MOON_SPACING.min}–${MOON_SPACING.min + MOON_SPACING.range}; no moon beyond ${exact(HILL_SHARE)} × Hill radius`,
      constants: [
        { name: "Satellite mass", value: `${exact(SATELLITE_MASS_RATIO)} of the planet`, meaning: "Jupiter's Galilean ratio (decision 30); Canup & Ward's 10⁻⁴ would give half as much" },
        { name: "Moons", value: `${MOON_COUNT.min}–${MOON_COUNT.min + MOON_COUNT.extra - 1}`, meaning: "Per giant, before the Hill limit" },
        { name: "Ice-rich water", value: `${formatPercent(MOON_WATER.minShare)}–${formatPercent(MOON_WATER.maxShare)} of the mass`, meaning: `Beyond the snow line, W = ${MOON_WATER.unitsPerShare} × the share (decision 35); inside it, the planets' rule` },
        { name: "Eccentricity", value: `${MOON_ECCENTRICITY.min}–${MOON_ECCENTRICITY.max}`, meaning: "Log-uniform, a stand-in for the resonances that keep the Galilean moons' orbits eccentric (MO3)" },
        { name: "Tidal k₂/Q", value: exact(TIDAL_K2_OVER_Q), meaning: "Io's, for every moon (decision 34): Io 2.2 W/m², Europa 0.2 W/m²" },
        { name: "Large moons of rocky planets", value: `${formatPercent(LARGE_MOON.chance)} chance`, meaning: `Mass ${formatPercent(LARGE_MOON.massRatio.min)}–${formatPercent(LARGE_MOON.massRatio.max)} of the planet's, ${LARGE_MOON.orbitPlanetRadii.min}–${LARGE_MOON.orbitPlanetRadii.max} planet radii out: a roll for the giant impacts that are not simulated (MO5); none beyond half the planet's Hill radius (A3.2)` },
      ],
      why: "Regular moons form in a giant's own disk, as the Galilean moons did; one share of mass and one spacing rule give systems like Jupiter's, and super-Jupiters moons heavier than Mars.",
      source: "Canup & Ward 2006; the Galilean moons",
      limits: ["No captured moons, resonances or migration: the eccentricity is drawn, so the tidal heat is in effect a heat draw scaled by the formula, and constant over a moon's life.", "No ceiling where a moon would melt (decision 29): the inner moons of the heaviest giants are overheated.", "Moons lighter than 0.018 M⊕ have no history (decision 11): their heat, water and ice shell are listed at their airless equilibrium temperature.", "Eclipses by the planet and the planet's own glow are not modelled."],
      laws: [{ law: "gravityStrength", how: "Through the giant's effective orbit, which sets its Hill radius" }],
      code: "simulation/moons.ts · moonsOf (MO2); simulation/interiorHeat.ts · tidalHeatFlow (MO3)",
      noEffect: "Moon worlds run histories, and their life and civilizations are counted in the survey, but they are not yet in its index (MO7).",
    },
    {
      id: "formation-air",
      title: "The air a planet starts with",
      statement: "Every rocky planet draws one of five atmosphere classes from the same distribution, whatever its size or heat; each class has a background pressure. Its history then decides what it keeps: escape strips the weak-gravity and strongly irradiated (Atmospheric escape).",
      rule: `none / thin / moderate / thick / crushing below draws ${ATMOSPHERE_DRAW.noneBelow} / ${ATMOSPHERE_DRAW.thinBelow} / ${ATMOSPHERE_DRAW.moderateBelow} / ${ATMOSPHERE_DRAW.thickBelow} / 1; planets below ${OWN_AIR_STREAM_BELOW_MASS} M⊕ draw from their own stream`,
      constants: (Object.entries(SURFACE_PRESSURE_BAR) as [string, number][]).map(([cls, bar]) => ({ name: cls, value: exact(bar, "bar"), meaning: "Background pressure of the class" })),
      why: "Planets capture and outgas very different amounts of gas; the classes span airless Mercury to Venus-like crushing air.",
      limits: ["Before AE2, planets below 0.05 M⊕ formed airless and those above 700 K thin or airless (decision 43 retired both): the small ones now draw from a stream of their own so no other planet's draws move."],
      laws: [],
      code: "simulation/planet.ts · ATMOSPHERE_DRAW, pickAtmosphere; simulation/planetPhysics.ts · SURFACE_PRESSURE_BAR",
      needsIndex: true,
      effect: (ctx) => {
        const ix = ctx.index!;
        const solid = solidRows(ix);
        const counts = ATMOSPHERE_CODES.map((cls, code) => `${cls} ${formatInt(solid.filter((i) => ix.formationAtmosphere[i] === code).length)}`);
        return [said(`Solid planets formed with: ${counts.join(", ")}.`, "index.formationAtmosphere")];
      },
    },
    {
      id: "planet-type",
      title: "What kind of world it is",
      statement: "A planet's type is read from what its history left, not drawn: lava above 1,000 K, an ocean world when water covers over 90%, an ice world over 85% ice, a desert when almost dry and warm, otherwise rocky. Giants colder than 75 K are ice giants.",
      constants: [
        { name: "Lava world", value: `> ${exact(LAVA_MIN_K, "K")}`, meaning: "Mean surface temperature" },
        { name: "Ocean world", value: `> ${formatPercent(OCEAN_WORLD_MIN_OCEAN)}`, meaning: "Open water" },
        { name: "Ice world", value: `> ${formatPercent(ICE_WORLD_MIN_ICE)}`, meaning: "Ice cover" },
        { name: "Desert", value: `< ${formatPercent(DESERT_MAX_OCEAN)} water, > ${DESERT_MIN_K} K`, meaning: "" },
        { name: "Ice giant", value: `< ${exact(ICE_GIANT_MAX_K, "K")}`, meaning: "Cloud tops; warmer giants are gas giants" },
      ],
      why: "A type is a result: the same world can be an ocean world early and a desert after it loses its water.",
      limits: ["Types are labels for people; no rule reads them except rarity and the planet's colour."],
      laws: [],
      code: "simulation/planet.ts · solidType, giantType",
      needsIndex: true,
      effect: (ctx) => {
        const ix = ctx.index!;
        const counts = PLANET_TYPE_CODES.map((type, code) => [type, rowsWhere(ix, (i) => ix.type[i] === code).length] as const).filter(([, n]) => n > 0);
        return [said(`${counts.map(([type, n]) => `${PLANET_TYPE_LABEL[type]}s: ${formatInt(n)}`).join("; ")}.`, "index.type")];
      },
    },
    {
      id: "neighbour-spacing",
      title: "Neighbours too close to share their orbits",
      statement: "Two planets on neighbouring orbits pull on each other. Closer together than a few times the distance over which their gravity rules the star's, they cannot both keep their orbits: the lighter one is thrown out of the system.",
      rule: `R_H = ((m₁ + m₂) / 3M★)^⅓ · (a₁ + a₂) / 2; neighbours closer than ${formatSig(HILL_SPACING)} R_H cannot both stay; the lighter leaves (the outer if equal); checked from the innermost pair outward until none is too close`,
      constants: [
        { name: "Spacing", value: `2√3 ≈ ${formatSig(HILL_SPACING)} mutual Hill radii`, meaning: "The limit for two planets alone (decision 31)" },
      ],
      why: "Gladman's limit for two planets: closer than this their orbits cross sooner or later. Most such pairs here pair a giant with a lighter neighbour, whose escape velocity is high enough to fling it out rather than collide.",
      source: "Gladman 1993 (Icarus 106, 247)",
      limits: [
        "Systems of many planets are unstable over billions of years at about 8–10 mutual Hill radii (Chambers et al. 1996), so many kept systems would in nature not last.",
        "The survivor keeps its orbit; real scattering would make it eccentric or move it.",
        "Pairs never merge, though a few close-in ones would more likely collide than eject.",
        "That the lighter planet leaves is this model's choice: the limit says only that the pair is unstable. From RP2 thrown-out planets become rogue planets.",
      ],
      laws: [],
      code: "simulation/rogues.ts · HILL_SPACING, settleNeighbours; simulation/planet.ts · generatePlanetsFor",
      effect: (ctx) => ctx.ejectedPlanets === null
        ? [said("Counted once the life survey finishes.", "survey.ejectedPlanets")]
        : [said(`${formatInt(ctx.ejectedPlanets)} planets were thrown out by a neighbour too close to share their orbits.`, "survey.ejectedPlanets")],
    },
    {
      id: "binary-orbits",
      title: "Where a companion lets planets orbit",
      statement: "A companion star's pull leaves two places where a planet's orbit lasts: close to its star, or far out around both stars. A planet drawn in between cannot stay and is removed; planets beyond the outer limit orbit both stars.",
      rule: `around the star: a < a_b · (${S_TYPE_LIMIT.c} − ${-S_TYPE_LIMIT.mu}μ − ${-S_TYPE_LIMIT.e}e + ${S_TYPE_LIMIT.muE}μe + ${S_TYPE_LIMIT.e2}e² − ${-S_TYPE_LIMIT.muE2}μe²); around both: a > a_b · (${P_TYPE_LIMIT.c} + ${P_TYPE_LIMIT.e}e − ${-P_TYPE_LIMIT.e2}e² + ${P_TYPE_LIMIT.mu}μ − ${-P_TYPE_LIMIT.eMu}eμ − ${-P_TYPE_LIMIT.mu2}μ² + ${P_TYPE_LIMIT.e2Mu2}e²μ²); μ = m₂ / (m₁ + m₂), a_b and e the pair's separation and eccentricity`,
      constants: [
        { name: "Around one of two equal stars, circular", value: `${formatSig(S_TYPE_LIMIT.c + S_TYPE_LIMIT.mu * 0.5)} a_b`, meaning: "The widest lasting orbit around one of two equal stars (μ 0.5, e 0)" },
        { name: "Around both, circular", value: `${formatSig(P_TYPE_LIMIT.c + P_TYPE_LIMIT.mu * 0.5 + P_TYPE_LIMIT.mu2 * 0.25)} a_b`, meaning: "The closest lasting orbit around an equal pair (μ 0.5, e 0)" },
      ],
      why: "Fits to numerical integrations of planets in binaries: an eccentric or heavy companion narrows the room around each star and pushes the room around both further out.",
      source: "Holman & Wiegert 1999 (AJ 117, 621)",
      limits: [
        "Removed planets are counted as thrown out; in nature the companion also truncates the disk, so many would never have formed (decision 17). From step 7 they become rogue planets.",
        "The fits cover e up to about 0.7–0.8 and μ 0.1–0.9; companions here reach e 0.8 and μ down to 0.09.",
        "Sharp limits, where nature has a fuzzy band with islands of stability.",
        "A world around both stars is placed as if at the pair's centre: the light it gets is (L₁ + L₂) / a².",
      ],
      laws: [{ law: "gravityStrength", how: "Moves planets' orbits inward (effectiveOrbitAU) before the test; the pair's separation is not scaled (decision 45)" }],
      code: "simulation/binary.ts · sTypeLimitAU, pTypeLimitAU, binaryOrbitOf; simulation/planet.ts · generatePlanetsFor",
      effect: (ctx) => {
        const binaries = ctx.stars.filter((s) => s.companion);
        if (binaries.length === 0) return [said("No star here has a companion.", "star.companion")];
        const out = [said(
          `In the median binary no orbit lasts between ${formatSig(median(binaries.map((s) => sTypeLimitAU(s.mass, s.companion!))))} AU and ${formatSig(median(binaries.map((s) => pTypeLimitAU(s.mass, s.companion!))))} AU.`,
          "star.companion", "sTypeLimitAU", "pTypeLimitAU")];
        if (ctx.unstablePlanets !== null) out.push(said(`${formatInt(ctx.unstablePlanets)} planets were drawn where a companion allows no orbit, and removed.`, "survey.unstablePlanets"));
        return out;
      },
    },
  ],
  missing: [
    "Orbits are circular and fixed: no migration, no scattering, no rogue planets (step 7).",
    "No moons of rocky planets yet (MO5).",
  ],
};

export const bodies: Chapter = {
  id: "bodies",
  title: "A planet's body",
  intro: "Gravity, spin, tilt, water and inner heat: what a solid planet's surface and climate are built on.",
  cards: [
    {
      id: "gravity",
      title: "Gravity and escape velocity",
      statement: "Surface gravity is mass over radius squared, in Earth units; escape velocity grows with √(mass / radius).",
      rule: `g = M / R²; v_esc = ${EARTH_ESCAPE_VELOCITY_KMS} km/s × √(M / R)`,
      constants: [{ name: "Earth's escape velocity", value: exact(EARTH_ESCAPE_VELOCITY_KMS, "km/s"), meaning: "" }],
      why: "Newton's gravity. It sets how deep the oceans are, how heavy the air is and, from step 3, which air a world can keep.",
      limits: ["The laboratory's gravity does not change it (issue C7)."],
      laws: [],
      code: "simulation/planetPhysics.ts · derivePhysics",
      needsIndex: true,
      effect: (ctx) => {
        const ix = ctx.index!;
        const g = solidRows(ix).map((i) => gravityOf(ix, i));
        return [said(`Solid planets' median gravity is ${formatSig(median(g))} g; ${formatInt(g.filter((x) => x > 1.5).length)} exceed 1.5 g.`, "index.massEarths", "index.radiusEarths")];
      },
    },
    {
      id: "tidal-locking",
      title: "Tidal locking",
      statement: "A planet close enough to its star is turned to keep one face towards it. The distance grows with the star's mass and age.",
      rule: `locked inside ${TIDAL_LOCK_CONSTANT_AU} AU × (age × M★²)^⅙`,
      constants: [{ name: "Calibration", value: exact(TIDAL_LOCK_CONSTANT_AU, "AU"), meaning: "The Sun today locks inside about 0.4 AU" }],
      why: "Tides raised by the star slow a planet's spin; the despinning time scales as a⁶ / M★², calibrated so Earth is free and Mercury near the edge.",
      limits: ["Read from today's age and applied to the whole history (issue C8); planet mass, rigidity and resonances such as Mercury's 3:2 are ignored."],
      laws: [{ law: "gravityStrength", how: "Closer effective orbits lock sooner" }],
      code: "simulation/planetPhysics.ts · tidalLockingDistanceAU",
      needsIndex: true,
      effect: (ctx) => {
        const ix = ctx.index!;
        const locked = rowsWhere(ix, (i) => (ix.flags[i] & INDEX_FLAG.TIDALLY_LOCKED) !== 0).length;
        return [said(`${formatInt(locked)} of ${formatInt(ix.count)} planets are tidally locked (${formatPercent(locked / ix.count)}).`, "index.flags.TIDALLY_LOCKED")];
      },
    },
    {
      id: "spin-tilt",
      title: "Day length and tilt",
      statement: "A free planet's day is drawn between 8 and 60 hours on a logarithmic scale; its tilt is usually under 35°, sometimes up to 90°. Without a large moon to hold it, a tilt wanders through a world's history as the other planets pull on it; a planet alone, or locked to its star, keeps its tilt.",
      rule: `day = ${ROTATION_HOURS.min} × (${ROTATION_HOURS.max} / ${ROTATION_HOURS.min})^draw h; tilt: ${formatPercent(TILT.lowShare)} of planets 0–${TILT.lowMaxDeg}°, the rest ${TILT.lowMaxDeg}–${TILT.maxDeg}°`,
      constants: [
        { name: "Tilt wander", value: `σ ${TILT_WANDER.stepSigmaDeg}° per step, within ±${TILT_WANDER.rangeDeg}°`, meaning: "A bounded walk motivated by Lissauer et al. 2012 (decision 12); the resonances that drive it are not simulated" },
        { name: "Holding moon", value: `≥ ${formatPercent(TILT_HOLDING_RATIO)} of the planet's mass`, meaning: "Holds its planet's tilt steady (the Moon: 1.2%)" },
      ],
      why: "Day length and tilt shape where sunlight falls: tilt moves heat towards the poles. Earth's Moon keeps its tilt within a few degrees; Mars, with no large moon, has swung far more (Laskar et al. 1993).",
      limits: ["The walk stands in for resonances between a planet's precession and its siblings' orbits, which are not simulated."],
      laws: [],
      code: "simulation/planetPhysics.ts · ROTATION_HOURS, TILT; simulation/worldHistory.ts · TILT_WANDER (MO5)",
      noEffect: "Day length and tilt are not kept in the universe index; each planet's panel shows its own.",
    },
    {
      id: "water-inventory",
      title: "How much water a planet gets",
      statement: "Inside the young star's snow line a planet gets a little water; beyond it, much more. Small planets keep less.",
      rule: `snow line = ${SNOW_LINE_AU_PER_SQRT_L} AU × √L(birth); water ≈ ${WATER_INSIDE_SNOW_LINE.median} (÷× ${WATER_INSIDE_SNOW_LINE.spread}) inside, ${WATER_BEYOND_SNOW_LINE.median} (÷× ${WATER_BEYOND_SNOW_LINE.spread}) beyond; × min(1, M / ${WATER_RETENTION_MASS} M⊕)`,
      constants: [{ name: "Earth's water", value: exact(WATER_INSIDE_SNOW_LINE.median), meaning: "The median inner planet: Earth's 2.7 km ocean layer at 1 g" }],
      why: "Ice condenses only where the young disk is cold enough; worlds forming there gather far more water.",
      limits: ["Water is set at formation; only escape removes it later."],
      laws: [],
      code: "simulation/planetPhysics.ts · derivePhysics",
      noEffect: "The water inventory is not kept in the index; its effect shows in ocean cover (Geography).",
    },
    {
      id: "inner-heat",
      title: "Inner heat and volcanism",
      statement: "A planet's tectonic activity starts with its mass and fades as its interior cools: larger planets stay active longer. The heat flowing out through its surface follows the same activity, scaled to Earth's.",
      rule: `τ(t) = min(1, √M × e^(−t / ${INTERIOR_COOLING_GYR} Gyr)); heat flow q = ${EARTH_HEAT_FLOW_W_M2} W/m² × τ / τ⊕ (τ⊕ = Earth today); T_int = (q / σ)^¼`,
      constants: [
        { name: "Cooling time", value: exact(INTERIOR_COOLING_GYR, "Gyr"), meaning: "" },
        { name: "Earth's heat flow", value: `${EARTH_HEAT_FLOW_W_M2} W/m²`, meaning: `Its mean today; a surface radiating only that would be ${formatInt(interiorTemperatureK(EARTH_HEAT_FLOW_W_M2))} K` },
      ],
      why: "Activity drives outgassing, which feeds the carbon cycle, and builds continental crust. The gas vented per square metre follows the heat, as both come from the interior (decision 41). The heat also warms the surface from below (IH2).",
      limits: ["Tides add no heat yet (step 5b)."],
      laws: [],
      code: "simulation/planetPhysics.ts · tectonicActivity; simulation/interiorHeat.ts · interiorHeatFlow (IH1)",
      needsIndex: true,
      effect: (ctx) => {
        const ix = ctx.index!;
        const flows = solidRows(ix).map((i) => interiorHeatFlow({ mass: ix.massEarths[i] }, ctx.stars[ix.starId[i]].age));
        const m = median(flows);
        return [said(`Today the median solid planet gives ${formatSig(m, 2)} W/m² from its interior (a surface radiating only that would be ${formatInt(interiorTemperatureK(m))} K), against Earth's ${EARTH_HEAT_FLOW_W_M2}.`, "index.massEarths", "star.age")];
      },
    },
  ],
  missing: ["No heat from inside in the climate, and no tidal heating (steps 5a and 5)."],
};
