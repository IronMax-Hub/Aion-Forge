// The encyclopedia's entry writers (Galaxy Through Time, EN2).
//
// Why it exists: every object in a universe should be readable as a short
// article built only from what the simulation produced, so a reader can learn
// what a world is, what happened to it and what makes it unusual without
// reading panels of numbers.
//
// How: each writer is a pure function of simulation data. A planet's entry
// reads the planet, its star and, when the app has kept it, the planet's
// world (physics, geography and history: the temperature range and the
// lineages come from there); the index (EN0) supplies comparisons with every
// other world. Each fact has one template (decision 2); each sentence lists
// the fields that filled it. The timeline's own wording is reused for events,
// so the timeline and the encyclopedia say the same thing.
//
// Style: numbers to three significant figures, durations by formatGyr, units
// always, and no adjective that is not a measure.
//
// Limits: a comparison needs the index, so until the survey finishes an entry
// has no "notable" list. A civilization's highest stage is the stage of its
// final tech level (the index's rule, until DT1).

import type { UniverseConfig } from "../../simulation/config";
import type { GalaxyConfig } from "../../simulation/galaxy";
import type { Star } from "../../simulation/star";
import { MAIN_SEQUENCE_END_FRACTION, REMNANT_FRACTION } from "../../simulation/star";
import type { Planet, SolidWorld } from "../../simulation/planet";
import { rareReasonOf } from "../../simulation/planet";
import { derivePhysics } from "../../simulation/planetPhysics";
import { generateBiosphere, STAGE_LABEL } from "../../simulation/biosphere";
import type { Biosphere, LifeStage } from "../../simulation/biosphere";
import {
  canSustainFire, generateCivilization, techLevelToStage, TECH_STAGE_LABEL,
  FIRE_MIN_LAND, FIRE_MIN_PRESSURE_BAR, FIRE_MIN_O2_BAR,
} from "../../simulation/civilization";
import type { Civilization, Species, TechStage } from "../../simulation/civilization";
import { atmosphereComposition } from "../../simulation/atmosphereComposition";
import type { Gas } from "../../simulation/atmosphereComposition";
import {
  extinctionSummary, FIRST_EVENT, LIFE_BEGAN, LIFE_ENDED, MASS_EXTINCTION_SHARE, mindAroseSummary, planetFormedAgo, WORLD_EVENT,
} from "../../simulation/history";
import { FROZEN_ICE_SHARE, OCEANS_LOST_WATER } from "../../simulation/worldHistory";
import { LINEAGE_CAP, livingLineages } from "../../simulation/evolution/engine";
import type { Lineage } from "../../simulation/evolution/engine";
import { CIVILIZATION_STAGE_CODES, LIFE_STAGE_CODES } from "../../simulation/universeIndex";
import { funnelOf } from "../../simulation/greatFilter";
import type { UniverseIndex } from "../../simulation/universeIndex";
import {
  airPhrase, citation, formatAirChange, formatGravity, formatGyr, formatInt, formatLightYears, formatPercent, formatPressure, formatRotation, formatSig,
  formatSurfaceShares, formatTemperatureRange, formatTilt, formatIndex, LIGHT_YEARS_PER_UNIT, PLANET_TYPE_LABEL, planetName,
  spectralType, starName, STELLAR_CLASS_NAME,
} from "../format";
import { formatMass, HABITAT_LABEL } from "../specimens";
import { GAS_LABEL } from "../spectrumChart";
import type { Entry, Sentence, SubjectRef } from "./entry";

/** What every writer reads besides its subject. */
export interface EntryContext {
  /** The universe's seed and laws: the citation names them, and physics reads the laws. */
  config: UniverseConfig;
  /** Every star in the galaxy, in id order. */
  stars: readonly Star[];
  /** Every world's facts (EN0), for comparisons; null until the survey finishes, and then no entry lists what is notable. */
  index: UniverseIndex | null;
}

// ── Comparisons ──────────────────────────────────────────────────────────────

/** A measure is notable when it lies above, or below, this share of the others. */
const NOTABLE_SHARE = 0.95;
/** A count of worlds is notable when it is at most this share of the galaxy's worlds. */
const RARE_SHARE = 0.05;
/** Fewer others than this, and no share is quoted: a percentage of a handful says little. */
const MIN_COMPARED = 20;

/** The shares of other values strictly below and strictly above `value`. */
function rankAmong(values: readonly number[], value: number): { below: number; above: number } {
  let below = 0;
  let above = 0;
  for (const v of values) {
    if (v < value) below++;
    else if (v > value) above++;
  }
  return { below: below / values.length, above: above / values.length };
}

/**
 * A sentence placing `value` among `others`, or null when it is not in the top
 * or bottom 5%. The percentage is rounded down, so it never claims more than is true.
 */
function rankSentence(
  others: readonly number[], value: number, higher: string, lower: string, group: string, sources: string[],
): Sentence | null {
  if (others.length < MIN_COMPARED || Number.isNaN(value)) return null;
  const { below, above } = rankAmong(others, value);
  if (below >= NOTABLE_SHARE) return { text: `${higher} than ${Math.floor(below * 100)}% of ${group}.`, sources };
  if (above >= NOTABLE_SHARE) return { text: `${lower} than ${Math.floor(above * 100)}% of ${group}.`, sources };
  return null;
}

/** Index rows other than `self` for which `include` holds. */
function otherRows(index: UniverseIndex, self: number, include: (row: number) => boolean): number[] {
  const rows: number[] = [];
  for (let i = 0; i < index.count; i++) if (i !== self && include(i)) rows.push(i);
  return rows;
}

/** The index row of a planet, or -1. */
function rowOf(index: UniverseIndex, starId: number, planetIndex: number): number {
  for (let i = 0; i < index.count; i++) {
    if (index.starId[i] === starId && index.planetIndex[i] === planetIndex) return i;
  }
  return -1;
}

// ── Shared pieces ────────────────────────────────────────────────────────────

function sentence(text: string, sources: string[], link?: SubjectRef): Sentence {
  return link ? { text, sources, link } : { text, sources };
}

const ago = (gyr: number) => `${formatGyr(gyr)} ago`;

function planetRef(planet: Planet, kind: "planet" | "biosphere" | "civilization" = "planet"): SubjectRef {
  return { kind, starId: planet.hostStarId, planetIndex: planet.id };
}

function starRef(star: Star): SubjectRef {
  return { kind: "star", starId: star.id };
}

function capitalise(text: string): string {
  return text[0].toUpperCase() + text.slice(1);
}

/** "a" or "an" before a word, by its first sound: vowels, and the spectral letters F, L and M ("an M4 V star"). */
function article(word: string): string {
  return /^[aeiouAEIOU]|^[FLM]\d/.test(word) ? "an" : "a";
}

/** Lists items as "a", "a and b", or "a, b, and c". */
function listWords(items: readonly string[]): string {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")}, and ${items[items.length - 1]}`;
}

/** "a G2 V star", or the class's name for a star with no spectral type. */
function starKind(star: Star): string {
  const spectral = spectralType(star.temperature, star.classification);
  if (spectral) return `${article(spectral)} ${spectral} star`;
  const name = STELLAR_CLASS_NAME[star.classification];
  return `${article(name)} ${name}`;
}

/** Catastrophes that ended at least MASS_EXTINCTION_SHARE of living lineages, and that life outlived (the index's rule). */
function massExtinctionsOf(bio: Biosphere) {
  return bio.extinctions.filter((e) => e.severityLoss >= MASS_EXTINCTION_SHARE && e.severityLoss < 1);
}

/** The stage a civilization reached: its final tech level's stage (the index's rule until DT1). */
function highestStageOf(civ: Civilization): Exclude<TechStage, "collapsed"> {
  return techLevelToStage(civ.techLevel, false) as Exclude<TechStage, "collapsed">;
}

const STAGE_WORD: Record<Exclude<TechStage, "collapsed">, string> = {
  primitive: "primitive",
  agricultural: "agricultural",
  industrial: "industrial",
  information: "information-age",
  "space-age": "space-age",
};

const STAGE_ARTICLE: Record<Exclude<TechStage, "collapsed">, string> = {
  primitive: "a", agricultural: "an", industrial: "an", information: "an", "space-age": "a",
};

/** Life today, in words for "one of N worlds with …". */
const LIFE_TODAY_PHRASE: Record<LifeStage, string> = {
  none: "no life",
  prebiotic: "prebiotic chemistry",
  microbial: "microbial life",
  multicellular: "multicellular life",
  complex: "complex ecosystems",
  dominant: "a dominant biosphere",
};

/** What a world's simulation made of its life and civilization. */
interface Lives {
  bio: Biosphere;
  civ: Civilization | null;
  species: Species | null;
}

function livesOf(planet: Planet, star: Star, ctx: EntryContext): Lives {
  const bio = generateBiosphere(planet, star);
  const { civilization, species } = generateCivilization(bio, planet, ctx.config.seed);
  return { bio, civ: civilization, species };
}

/** The civilization's sentences: what it reached, its fate, and, if it never had fire, why. */
function civilizationSentences(planet: Planet, civ: Civilization): Sentence[] {
  const link = planetRef(planet, "civilization");
  const highest = highestStageOf(civ);
  const out = [sentence(
    `Developed ${STAGE_ARTICLE[highest]} ${STAGE_WORD[highest]} civilization ${ago(civ.ageGyr)}.`,
    ["civilization.techLevel", "civilization.ageGyr"], link,
  )];

  if (civ.extinctAgoGyr !== null) {
    out.push(sentence(`Its species died out ${ago(civ.extinctAgoGyr)}.`, ["civilization.extinctAgoGyr"]));
  } else if (civ.techStage === "collapsed") {
    const collapse = civ.milestones.find((m) => m.type === "collapse");
    out.push(collapse
      ? sentence(`It collapsed ${ago(collapse.timeAgo)}.`, ["civilization.techStage", "civilization.milestones"])
      : sentence("It has collapsed.", ["civilization.techStage"]));
  } else {
    out.push(sentence("It is active today.", ["civilization.techStage"]));
  }

  // The three conditions of canSustainFire, named where they fail
  const surface = planet.surface;
  if ((highest === "primitive" || highest === "agricultural") && surface && !canSustainFire(planet)) {
    const fails: string[] = [];
    if (surface.landFraction < FIRE_MIN_LAND) {
      fails.push(surface.landFraction === 0 ? "no exposed land" : `too little exposed land (${formatPercent(surface.landFraction)})`);
    }
    if (surface.pressureBar < FIRE_MIN_PRESSURE_BAR) fails.push(`air too thin (${formatPressure(surface.pressureBar)})`);
    if (surface.o2Bar < FIRE_MIN_O2_BAR) fails.push(`too little oxygen (${formatPressure(surface.o2Bar)})`);
    out.push(sentence(`Its civilization never had fire: ${listWords(fails)}.`,
      ["planet.surface.landFraction", "planet.surface.pressureBar", "planet.surface.o2Bar"]));
  }
  return out;
}

/** A chronicle line. */
function event(agoGyr: number, text: string, sources: string[]): Entry["chronicle"][number] {
  return { agoGyr, sentence: sentence(text, sources) };
}

/** Oldest first; events at the same moment keep the order they were added in. */
function byAge(chronicle: Entry["chronicle"]): Entry["chronicle"] {
  return chronicle.map((e, i) => ({ e, i })).sort((a, b) => b.e.agoGyr - a.e.agoGyr || a.i - b.i).map(({ e }) => e);
}

/** Life's firsts, in the timeline's words. */
function firstsChronicle(planet: Planet, star: Star): Entry["chronicle"] {
  return (planet.life?.phylogeny.firsts ?? []).flatMap((first) => {
    const recorded = FIRST_EVENT[first.kind];
    return recorded ? [event(star.age - first.tGyr, recorded.summary, [`planet.life.phylogeny.firsts.${first.kind}`])] : [];
  });
}

/** When life began and, if it did, ended, in the timeline's words. */
function lifeChronicle(planet: Planet, star: Star): Entry["chronicle"] {
  if (!planet.life) return [];
  const out = [event(star.age - planet.life.startedGyr, LIFE_BEGAN, ["planet.life.startedGyr"])];
  if (planet.life.endedGyr !== null) out.push(event(star.age - planet.life.endedGyr, LIFE_ENDED, ["planet.life.endedGyr"]));
  return out;
}

/** A civilization's species arising and its milestones, in the timeline's words. */
function civilizationChronicle(civ: Civilization, species: Species): Entry["chronicle"] {
  return [
    event(civ.ageGyr, mindAroseSummary(species), ["civilization.ageGyr"]),
    // The timeline shows a milestone's note as written; here it closes a sentence
    ...civ.milestones.map((m) => event(m.timeAgo, m.note.endsWith(".") ? m.note : `${m.note}.`, [`civilization.milestones.${m.type}`])),
  ];
}

// ── Planet ───────────────────────────────────────────────────────────────────

/** The three most abundant gases, e.g. "N₂ 78%, O₂ 21%, H₂O 0.9%". */
function leadingGases(planet: Planet, civ: Civilization | null): string | null {
  const ratios = Object.entries(atmosphereComposition(planet, civ).mixingRatios) as [Gas, number][];
  if (ratios.length === 0) return null;
  return ratios
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([gas, share]) => `${GAS_LABEL[gas]} ${formatSig(share * 100)}%`)
    .join(", ");
}

function planetLede(planet: Planet, star: Star, lives: Lives): Sentence[] {
  const lede: Sentence[] = [];
  const kind = `${PLANET_TYPE_LABEL[planet.type]} orbiting ${starKind(star)} at ${formatSig(planet.orbitalRadius)} AU`;
  lede.push(planet.surface
    ? sentence(`${kind}.`, ["planet.type", "star.temperature", "star.classification", "planet.orbitalRadius"], starRef(star))
    : sentence(`${kind}, with cloud tops at ${formatInt(planet.temperature)} K.`,
      ["planet.type", "star.temperature", "star.classification", "planet.orbitalRadius", "planet.temperature"], starRef(star)));

  lede.push(sentence(`Formed ${ago(planetFormedAgo(planet, star))}.`, ["star.age", "planet.orbitalIndex"]));

  if (planet.life) {
    const began = ago(star.age - planet.life.startedGyr);
    lede.push(planet.life.endedGyr === null
      ? sentence(`Life emerged ${began}.`, ["planet.life.startedGyr", "star.age"], planetRef(planet, "biosphere"))
      : sentence(`Life emerged ${began} and ended ${ago(star.age - planet.life.endedGyr)}.`,
        ["planet.life.startedGyr", "planet.life.endedGyr", "star.age"], planetRef(planet, "biosphere")));
  }

  const survived = massExtinctionsOf(lives.bio).length;
  if (survived >= 1) {
    lede.push(sentence(`Survived ${survived} mass extinction${survived === 1 ? "" : "s"}.`, ["biosphere.extinctions"]));
  }

  if (lives.civ) lede.push(...civilizationSentences(planet, lives.civ));

  const surface = planet.surface;
  if (surface) {
    const airChange = formatAirChange(planet.formationAtmosphere, planet.atmosphere);
    const airLost = planet.worldEvents.find((e) => e.kind === "air-lost");
    if (airLost) {
      lede.push(sentence(`It formed with ${airPhrase(planet.formationAtmosphere)}; the last of it was lost to space ${ago(star.age - airLost.tGyr)}.`,
        ["planet.formationAtmosphere", "planet.worldEvents.air-lost"]));
    } else if (airChange) {
      lede.push(sentence(`${airChange.replace(" · ", "; ")}.`, ["planet.formationAtmosphere", "planet.atmosphere"]));
    }
    const oceansLost = [...planet.worldEvents].reverse().find((e) => e.kind === "oceans-lost");
    if (oceansLost) {
      lede.push(sentence(`Its oceans were lost to space ${ago(star.age - oceansLost.tGyr)}.`, ["planet.worldEvents.oceans-lost"]));
    } else if (surface.iceFraction >= FROZEN_ICE_SHARE && surface.water >= OCEANS_LOST_WATER && !surface.steam) {
      lede.push(sentence("Frozen over today; liquid water lies under the ice.",
        ["planet.surface.iceFraction", "planet.surface.water", "planet.surface.steam"]));
    } else if (planet.type === "ocean") {
      lede.push(sentence("Covered by ocean.", ["planet.type"]));
    }
  }
  return lede;
}

function planetFacts(planet: Planet, star: Star, world: SolidWorld | null, ctx: EntryContext, lives: Lives): Entry["facts"] {
  const physics = world?.physics ?? derivePhysics(planet, star, ctx.config.seed, ctx.config);
  const surface = planet.surface;
  const facts: Entry["facts"] = [
    { label: "Designation", value: planetName(planet.hostStarId, planet.orbitalIndex) },
    { label: "Type", value: PLANET_TYPE_LABEL[planet.type] },
    { label: "Orbit", value: `${formatSig(planet.orbitalRadius)} AU` },
    { label: "Period", value: physics.orbitalPeriodYears < 1
      ? `${formatSig(physics.orbitalPeriodYears * 365.25)} days` : `${formatSig(physics.orbitalPeriodYears)} years` },
    { label: "Mass", value: `${formatSig(planet.mass)} M⊕` },
    { label: "Radius", value: `${formatSig(planet.size)} R⊕` },
    { label: "Gravity", value: formatGravity(physics.surfaceGravity) },
    { label: "Escape velocity", value: `${formatSig(physics.escapeVelocityKms)} km/s` },
    { label: "Day", value: formatRotation(physics.rotationPeriodHours, physics.tidallyLocked) },
    { label: "Tilt", value: formatTilt(physics.axialTiltDeg) },
  ];
  if (surface) {
    facts.push(
      { label: "Ocean / land / ice", value: formatSurfaceShares(surface.oceanFraction, surface.landFraction, surface.iceFraction) },
      { label: "Pressure", value: `${formatPressure(surface.pressureBar)} (${planet.atmosphere})` },
    );
  }
  facts.push({ label: surface ? "Mean temperature" : "Cloud-top temperature", value: `${formatInt(planet.temperature)} K` });
  if (world) {
    facts.push({ label: "Temperature range", value: formatTemperatureRange(world.history.present.minK, world.history.present.maxK) });
  }
  const gases = leadingGases(planet, lives.civ);
  if (gases) facts.push({ label: "Main gases", value: gases });
  facts.push({ label: "Habitability", value: formatIndex(planet.habitabilityScore) });

  const phylogeny = planet.life?.phylogeny ?? null;
  facts.push({ label: "Life", value: !planet.life ? "None"
    : lives.bio.extinctAt !== null ? `Extinct, ${ago(lives.bio.extinctAt)}` : STAGE_LABEL[lives.bio.stage] });
  if (phylogeny && lives.bio.hasLife) {
    facts.push({ label: "Living lineages", value: formatInt(phylogeny.livingLineages) });
    if (phylogeny.largestLog10BodyMassKg !== null) {
      facts.push({ label: "Largest organism", value: formatMass(phylogeny.largestLog10BodyMassKg) });
    }
  }
  if (phylogeny?.mind) facts.push({ label: "First mind", value: ago(phylogeny.mind.ageGyr) });
  if (lives.civ) facts.push({ label: "Civilization", value: TECH_STAGE_LABEL[lives.civ.techStage] });
  return facts;
}

function planetChronicle(planet: Planet, star: Star, lives: Lives): Entry["chronicle"] {
  const chronicle = [
    event(planetFormedAgo(planet, star), `The planet formed at ${formatSig(planet.orbitalRadius)} AU.`, ["star.age", "planet.orbitalIndex"]),
    ...planet.worldEvents.map((e) => event(star.age - e.tGyr, WORLD_EVENT[e.kind].summary, [`planet.worldEvents.${e.kind}`])),
    ...lifeChronicle(planet, star),
    ...firstsChronicle(planet, star),
    ...massExtinctionsOf(lives.bio).map((e) => event(e.timeAgo, extinctionSummary(e), ["biosphere.extinctions"])),
  ];
  if (lives.civ && lives.species) chronicle.push(...civilizationChronicle(lives.civ, lives.species));
  return byAge(chronicle);
}

function planetNotable(planet: Planet, ctx: EntryContext, lives: Lives): Sentence[] {
  const notable: Sentence[] = [];
  const index = ctx.index;
  const self = index ? rowOf(index, planet.hostStarId, planet.id) : -1;
  if (index && self >= 0) {
    const values = (column: Float32Array | Uint8Array, rows: number[]) => rows.map((i) => column[i]);
    const all = otherRows(index, self, () => true);
    const solid = otherRows(index, self, (i) => !Number.isNaN(index.oceanFraction[i]));
    const lifeBegan = otherRows(index, self, (i) => !Number.isNaN(index.lifeBeganGyr[i]));
    const lifeAgo = (i: number) => ctx.stars[index.starId[i]].age - index.lifeBeganGyr[i];

    notable.push(...[
      rankSentence(values(index.massEarths, all), index.massEarths[self],
        "More massive", "Less massive", "the galaxy's other planets", ["index.massEarths"]),
      planet.surface ? rankSentence(values(index.temperatureK, solid), index.temperatureK[self],
        "Hotter", "Colder", "the galaxy's other solid worlds", ["index.temperatureK"]) : null,
      planet.life ? rankSentence(lifeBegan.map(lifeAgo), lifeAgo(self),
        "Life began here longer ago", "Life began here more recently", "the other worlds where it began",
        ["index.lifeBeganGyr", "star.age"]) : null,
      massExtinctionsOf(lives.bio).length > 0 ? rankSentence(values(index.massExtinctions, lifeBegan), index.massExtinctions[self],
        `More mass extinctions (${index.massExtinctions[self]})`, "Fewer mass extinctions", "the other worlds where life began",
        ["index.massExtinctions"]) : null,
    ].filter((s): s is Sentence => s !== null));

    if (lives.bio.hasLife) {
      const stageCode = LIFE_STAGE_CODES.indexOf(lives.bio.stage);
      const same = otherRows(index, -1, (i) => index.lifeStage[i] === stageCode).length;
      if (same / index.count <= RARE_SHARE) {
        notable.push(sentence(`One of ${formatInt(same)} worlds with ${LIFE_TODAY_PHRASE[lives.bio.stage]} today.`, ["index.lifeStage"]));
      }
    }
  }
  const rare = rareReasonOf(planet);
  if (rare) notable.push(sentence(`Rare: ${rare}.`, ["planet.isRare", "planet.type", "planet.temperature"]));
  return notable;
}

/** A planet's entry. `world` is its physics, geography and history when the app has kept them (planet.ts solidWorldOf); null for giants. */
export function planetEntry(planet: Planet, star: Star, world: SolidWorld | null, ctx: EntryContext): Entry {
  const lives = livesOf(planet, star, ctx);
  const designation = planetName(planet.hostStarId, planet.orbitalIndex);
  const seeAlso: SubjectRef[] = [starRef(star)];
  if (planet.life) seeAlso.push(planetRef(planet, "biosphere"));
  if (lives.civ) seeAlso.push(planetRef(planet, "civilization"));
  return {
    subject: planetRef(planet),
    designation,
    citation: citation(ctx.config, designation),
    title: PLANET_TYPE_LABEL[planet.type],
    lede: planetLede(planet, star, lives),
    facts: planetFacts(planet, star, world, ctx, lives),
    chronicle: planetChronicle(planet, star, lives),
    notable: planetNotable(planet, ctx, lives),
    seeAlso,
    limits: planet.surface ? [
      sentence("Its continents were drawn once and never move.", ["geography"]),
      sentence("When life began is a chance event in this model; its date is not predicted by the conditions.", ["worldHistory.origin"]),
    ] : [
      sentence("A giant's interior and weather are not modelled; only its cloud tops are.", ["planet.type"]),
    ],
  };
}

// ── Star ─────────────────────────────────────────────────────────────────────

/** A star's entry. `planets` are its system's planets. */
export function starEntry(star: Star, planets: readonly Planet[], ctx: EntryContext): Entry {
  const designation = starName(star.id);
  const spectral = spectralType(star.temperature, star.classification);
  const className = STELLAR_CLASS_NAME[star.classification];
  const withLife = planets.filter((p) => p.life !== null);

  const lede: Sentence[] = [
    sentence(`${capitalise(starKind(star))} of ${formatSig(star.mass)} M☉, ${formatGyr(star.age)} old.`,
      ["star.temperature", "star.classification", "star.mass", "star.age"]),
    sentence(`It has used ${formatPercent(Math.min(1, star.age / star.lifespan))} of its lifespan.`, ["star.age", "star.lifespan"]),
  ];
  if (planets.length > 0) {
    lede.push(sentence(
      `${planets.length} planet${planets.length === 1 ? "" : "s"} orbit${planets.length === 1 ? "s" : ""} it; life began on ${withLife.length === 0 ? "none" : withLife.length} of them.`,
      ["system.planets", "planet.life"]));
  }

  const [x, , z] = star.position;
  const facts: Entry["facts"] = [];
  if (spectral) facts.push({ label: "Spectral type", value: spectral });
  facts.push(
    { label: "Class", value: capitalise(className) },
    { label: "Mass", value: `${formatSig(star.mass)} M☉` },
    { label: "Age", value: formatGyr(star.age) },
    { label: "Lifespan used", value: formatPercent(Math.min(1, star.age / star.lifespan)) },
  );
  if (star.luminosity > 0) facts.push({ label: "Luminosity", value: `${formatSig(star.luminosity)} L☉` });
  if (star.temperature > 0) facts.push({ label: "Temperature", value: `${formatInt(star.temperature)} K` });
  facts.push(
    { label: "Distance from centre", value: formatLightYears(Math.sqrt(x * x + z * z) * LIGHT_YEARS_PER_UNIT) },
    { label: "Planets", value: formatInt(planets.length) },
    { label: "Planets with life", value: withLife.length === 0 ? "None" : withLife.map((p) => planetName(p.hostStarId, p.orbitalIndex)).join(", ") },
  );

  // Phase changes as the classification dates them (history.ts)
  const phaseAgo = (fraction: number) => Math.max(0.001, star.age - star.lifespan * fraction);
  const chronicle: Entry["chronicle"] = [event(star.age, "The star formed.", ["star.age"])];
  if (star.age >= star.lifespan * MAIN_SEQUENCE_END_FRACTION) {
    chronicle.push(event(phaseAgo(MAIN_SEQUENCE_END_FRACTION), "It left the main sequence.", ["star.age", "star.lifespan"]));
  }
  if (star.age >= star.lifespan * REMNANT_FRACTION) {
    chronicle.push(event(phaseAgo(REMNANT_FRACTION), `It became ${article(className)} ${className}.`, ["star.classification"]));
  }

  const notable: Sentence[] = [];
  if (ctx.stars.length > 0) {
    const others = ctx.stars.filter((s) => s.id !== star.id);
    notable.push(...[
      rankSentence(others.map((s) => s.mass), star.mass, "More massive", "Less massive", "the galaxy's other stars", ["star.mass"]),
      rankSentence(others.map((s) => s.age), star.age, "Older", "Younger", "the galaxy's other stars", ["star.age"]),
      star.luminosity > 0 ? rankSentence(others.map((s) => s.luminosity), star.luminosity,
        "Brighter", "Fainter", "the galaxy's other stars", ["star.luminosity"]) : null,
    ].filter((s): s is Sentence => s !== null));
  }

  return {
    subject: starRef(star),
    designation,
    citation: citation(ctx.config, designation),
    title: capitalise(className),
    lede,
    facts,
    chronicle: byAge(chronicle),
    notable,
    seeAlso: [{ kind: "galaxy" }, ...planets.map((p) => planetRef(p))],
    limits: [
      sentence("How it formed is not modelled.", ["star"]),
      sentence("Stars that died before today are not in the galaxy.", ["star"]),
    ],
  };
}

// ── Biosphere ────────────────────────────────────────────────────────────────

/** The living lineage that has lived longest, and the most abundant light user, from the kept world. */
function lineageFacts(planet: Planet, world: SolidWorld | null, star: Star): Entry["facts"] {
  const life = world?.history.life;
  if (!life) return [];
  const living = livingLineages(life);
  const facts: Entry["facts"] = [];
  const designation = planetName(planet.hostStarId, planet.orbitalIndex);
  const oldest = [...living].sort((a, b) => a.bornGyr - b.bornGyr || a.id - b.id)[0] as Lineage | undefined;
  if (oldest) facts.push({ label: "Oldest living lineage", value: `${designation} · L-${oldest.id}, arose ${ago(star.age - oldest.bornGyr)}` });
  const light = living.filter((l) => l.genome.energySource === "light").sort((a, b) => b.biomass - a.biomass || a.id - b.id)[0];
  if (light) facts.push({ label: "Pigment absorbs at", value: `${formatInt(light.genome.absorptionPeakNm)} nm (L-${light.id})` });
  return facts;
}

/** A planet's biosphere's entry; `world` as for planetEntry. */
export function biosphereEntry(planet: Planet, star: Star, world: SolidWorld | null, ctx: EntryContext): Entry {
  const { bio, civ } = livesOf(planet, star, ctx);
  const designation = planetName(planet.hostStarId, planet.orbitalIndex);
  const phylogeny = planet.life?.phylogeny ?? null;
  const lede: Sentence[] = [];
  const facts: Entry["facts"] = [];

  if (!planet.life || !phylogeny) {
    lede.push(sentence("Life never began here.", ["planet.life"]));
  } else if (bio.extinctAt !== null) {
    lede.push(sentence(
      `Life began ${ago(star.age - planet.life.startedGyr)} and lasted ${formatGyr(bio.ageGyr)}, until it died out ${ago(bio.extinctAt)}.`,
      ["planet.life.startedGyr", "biosphere.ageGyr", "biosphere.extinctAt"]));
    facts.push({ label: "Stage", value: "Extinct" }, { label: "Lasted", value: formatGyr(bio.ageGyr) });
  } else {
    lede.push(
      sentence(`${capitalise(LIFE_TODAY_PHRASE[bio.stage])}, ${formatGyr(bio.ageGyr)} old.`, ["biosphere.stage", "biosphere.ageGyr"]),
      sentence(`${phylogeny.livingLineages} lineage${phylogeny.livingLineages === 1 ? " lives" : "s live"} today, in ${phylogeny.foodChainLevels} food-chain level${phylogeny.foodChainLevels === 1 ? "" : "s"}.`,
        ["planet.life.phylogeny.livingLineages", "planet.life.phylogeny.foodChainLevels"]),
    );
    facts.push(
      { label: "Stage", value: STAGE_LABEL[bio.stage] },
      { label: "Age", value: formatGyr(bio.ageGyr) },
      { label: "Living lineages", value: formatInt(phylogeny.livingLineages) },
      { label: "Food-chain levels", value: formatInt(phylogeny.foodChainLevels) },
    );
    if (phylogeny.largestLog10BodyMassKg !== null) facts.push({ label: "Largest body", value: formatMass(phylogeny.largestLog10BodyMassKg) });
    facts.push(...lineageFacts(planet, world, star));
  }

  const chronicle = byAge([
    ...lifeChronicle(planet, star),
    ...firstsChronicle(planet, star),
    ...bio.extinctions.map((e) => event(e.timeAgo, extinctionSummary(e), ["biosphere.extinctions"])),
  ]);

  const notable: Sentence[] = [];
  const index = ctx.index;
  const self = index ? rowOf(index, planet.hostStarId, planet.id) : -1;
  if (index && self >= 0 && bio.hasLife) {
    const living = otherRows(index, self, (i) => index.lifeStage[i] !== 0);
    notable.push(...[
      rankSentence(living.map((i) => index.livingLineages[i]), index.livingLineages[self],
        "More living lineages", "Fewer living lineages", "the other worlds with life today", ["index.livingLineages"]),
      rankSentence(living.map((i) => index.largestLog10Kg[i]), index.largestLog10Kg[self],
        "Its largest body is heavier", "Its largest body is lighter", "the largest on the other worlds with life today",
        ["index.largestLog10Kg"]),
    ].filter((s): s is Sentence => s !== null));
  }

  const seeAlso: SubjectRef[] = [planetRef(planet)];
  if (civ) seeAlso.push(planetRef(planet, "civilization"));
  return {
    subject: planetRef(planet, "biosphere"),
    designation,
    citation: citation(ctx.config, designation),
    title: !planet.life ? "No life" : bio.extinctAt !== null ? "Extinct biosphere" : STAGE_LABEL[bio.stage],
    lede,
    facts,
    chronicle,
    notable,
    seeAlso,
    limits: [sentence(`The record keeps at most ${LINEAGE_CAP} living lineages at once.`, ["engine.LINEAGE_CAP"])],
  };
}

// ── Civilization ─────────────────────────────────────────────────────────────

/** Gases the civilization adds to its world's air: those richer with it than without it. */
function addedGases(planet: Planet, civ: Civilization): string[] {
  const without = atmosphereComposition(planet, null).mixingRatios;
  const withCiv = atmosphereComposition(planet, civ).mixingRatios;
  return (Object.keys(withCiv) as Gas[]).filter((gas) => (withCiv[gas] ?? 0) > (without[gas] ?? 0)).map((gas) => GAS_LABEL[gas]);
}

/** A planet's civilization's entry; `world` as for planetEntry (its species' habitat comes from there). */
export function civilizationEntry(planet: Planet, star: Star, world: SolidWorld | null, ctx: EntryContext): Entry {
  const { civ, species } = livesOf(planet, star, ctx);
  const designation = planetName(planet.hostStarId, planet.orbitalIndex);
  const mind = planet.life?.phylogeny.mind ?? null;
  const base = {
    subject: planetRef(planet, "civilization"),
    designation,
    citation: citation(ctx.config, designation),
    seeAlso: [planetRef(planet), planetRef(planet, "biosphere")],
    limits: [
      sentence("Curiosity, cooperation and resilience were drawn by chance: no evolved trait supplies them yet.", ["civilization.species"]),
      sentence("Its milestone dates are placed by formula, not lived.", ["civilization.milestones"]),
    ],
  };
  if (!civ || !species || !mind) {
    return { ...base, title: "No civilization", lede: [sentence("No civilization arose here.", ["planet.life.phylogeny.mind"])],
      facts: [], chronicle: [], notable: [] };
  }

  const lineage = world?.history.life?.lineages[mind.lineageId];
  const facts: Entry["facts"] = [
    { label: "Species", value: `${designation} · L-${mind.lineageId}` },
    { label: "Body mass", value: formatMass(mind.log10BodyMassKg) },
  ];
  if (lineage) facts.push({ label: "Habitat", value: HABITAT_LABEL[lineage.genome.habitat] });
  const highest = highestStageOf(civ);
  const gases = addedGases(planet, civ);
  facts.push(
    { label: "Stage", value: TECH_STAGE_LABEL[civ.techStage] },
    { label: "Highest stage", value: TECH_STAGE_LABEL[highest] },
    { label: "Age", value: formatGyr(civ.ageGyr) },
    { label: civ.extinctAgoGyr === null ? "Population" : "Peak population", value: `${formatSig(civ.population)} billion` },
    { label: "Fire", value: canSustainFire(planet) ? "Possible" : "Not possible" },
    { label: "Gases it adds to the air", value: gases.length > 0 ? gases.join(", ") : "None" },
  );

  const chronicle = civilizationChronicle(civ, species);
  if (civ.extinctAgoGyr !== null && !civ.milestones.some((m) => m.timeAgo === civ.extinctAgoGyr)) {
    chronicle.push(event(civ.extinctAgoGyr, "Its species died out.", ["civilization.extinctAgoGyr"]));
  }

  const notable: Sentence[] = [];
  const index = ctx.index;
  const self = index ? rowOf(index, planet.hostStarId, planet.id) : -1;
  if (index && self >= 0) {
    const minds = otherRows(index, -1, (i) => !Number.isNaN(index.mindGyr[i])).length;
    if (minds / index.count <= RARE_SHARE) {
      notable.push(sentence(`One of ${formatInt(minds)} worlds where a mind arose.`, ["index.mindGyr"]));
    }
    const civs = otherRows(index, -1, (i) => index.civilizationStage[i] !== 0);
    const highestCode = CIVILIZATION_STAGE_CODES.indexOf(highest);
    const asFar = civs.filter((i) => index.highestStage[i] >= highestCode).length;
    if (civs.length >= MIN_COMPARED && asFar / civs.length <= 1 - NOTABLE_SHARE) {
      notable.push(sentence(`One of ${formatInt(asFar)} of the galaxy's ${formatInt(civs.length)} civilizations to reach the ${STAGE_WORD[highest]} stage or beyond.`,
        ["index.highestStage"]));
    }
    const collapses = rankSentence(civs.filter((i) => i !== self).map((i) => index.collapses[i]), index.collapses[self],
      `More collapses (${index.collapses[self]})`, "Fewer collapses", "the other civilizations", ["index.collapses"]);
    if (collapses && index.collapses[self] > 0) notable.push(collapses);
  }

  return {
    ...base,
    title: civ.extinctAgoGyr !== null ? "Ruins of a civilization" : `${TECH_STAGE_LABEL[civ.techStage]} civilization`,
    lede: [
      sentence(`A mind arose here ${ago(mind.ageGyr)}, in a species of ${formatMass(mind.log10BodyMassKg)} bodies${lineage ? ` living in ${HABITAT_LABEL[lineage.genome.habitat].toLowerCase()}` : ""}.`,
        ["planet.life.phylogeny.mind"]),
      ...civilizationSentences(planet, civ),
    ],
    facts,
    chronicle: byAge(chronicle),
    notable,
  };
}

// ── Galaxy ───────────────────────────────────────────────────────────────────

/** The galaxy's entry. */
export function galaxyEntry(galaxy: GalaxyConfig, ctx: EntryContext): Entry {
  const designation = "Galaxy";
  const oldest = ctx.stars.reduce<Star | null>((a, s) => (a === null || s.age > a.age ? s : a), null);
  const lede: Sentence[] = [
    sentence(`${capitalise(article(galaxy.type))} ${galaxy.type} galaxy of ${formatInt(ctx.stars.length)} stars.`, ["galaxy.type", "stars"]),
  ];
  if (oldest) lede.push(sentence(`Its oldest star formed ${ago(oldest.age)}.`, ["star.age"], starRef(oldest)));
  const facts: Entry["facts"] = [
    { label: "Type", value: capitalise(galaxy.type) },
    { label: "Stars", value: formatInt(ctx.stars.length) },
  ];
  if (oldest) facts.push({ label: "Oldest star", value: `${starName(oldest.id)}, ${formatGyr(oldest.age)}` });

  const seeAlso: SubjectRef[] = [];
  const index = ctx.index;
  if (index) {
    const rows = otherRows(index, -1, () => true);
    const began = rows.filter((i) => !Number.isNaN(index.lifeBeganGyr[i]));
    const living = rows.filter((i) => index.lifeStage[i] !== 0);
    const minds = rows.filter((i) => !Number.isNaN(index.mindGyr[i]));
    const civs = rows.filter((i) => index.civilizationStage[i] !== 0);
    const enduring = civs.filter((i) => CIVILIZATION_STAGE_CODES[index.civilizationStage[i]] !== "collapsed");
    const lifeAgo = (i: number) => ctx.stars[index.starId[i]].age - index.lifeBeganGyr[i];
    const first = began.reduce<number | null>((a, i) => (a === null || lifeAgo(i) > lifeAgo(a) ? i : a), null);

    facts.push(
      { label: "Planets", value: formatInt(index.count) },
      { label: "Worlds where life began", value: formatInt(began.length) },
      { label: "Worlds with life today", value: formatInt(living.length) },
      { label: "Minds", value: formatInt(minds.length) },
      { label: "Civilizations", value: `${formatInt(civs.length)} (${formatInt(enduring.length)} endure)` },
    );
    lede.push(sentence(began.length === 0
      ? "Life began on none of its worlds."
      : `Life began on ${formatInt(began.length)} of its ${formatInt(index.count)} planets and lives on ${formatInt(living.length)} today.`,
    ["index.lifeBeganGyr", "index.lifeStage"]));
    if (first !== null) {
      const ref: SubjectRef = { kind: "planet", starId: index.starId[first], planetIndex: index.planetIndex[first] };
      lede.push(sentence(`The first life began on ${planetName(ref.starId, ref.planetIndex)}, ${ago(lifeAgo(first))}.`,
        ["index.lifeBeganGyr", "star.age"], ref));
      seeAlso.push(ref);
    }
    if (minds.length > 0) {
      lede.push(sentence(`Minds arose on ${formatInt(minds.length)} worlds; ${formatInt(civs.length)} built civilizations, and ${formatInt(enduring.length)} endure.`,
        ["index.mindGyr", "index.civilizationStage"]));
    }
    // The steepest gate of its Great Filter (GF1)
    const funnel = funnelOf(index);
    const filter = funnel.steps.find((step) => step.gate.id === funnel.filter);
    if (filter) {
      lede.push(sentence(`The steepest gate of its Great Filter is “${filter.gate.label}”: ${formatPercent(filter.share)} of the ${formatInt(filter.arrived)} worlds that reached it passed.`,
        ["index", "greatFilter.funnelOf"]));
      facts.push({ label: "Great Filter", value: `${filter.gate.label} (${formatPercent(filter.share)})` });
    }
  }

  return {
    subject: { kind: "galaxy" },
    designation,
    citation: citation(ctx.config, designation),
    title: `${capitalise(galaxy.type)} galaxy`,
    lede,
    facts,
    chronicle: oldest ? [event(oldest.age, "Its oldest surviving star formed.", ["star.age"])] : [],
    notable: [],
    seeAlso,
    limits: [sentence("Stars that died before today are not in the galaxy.", ["star"])],
  };
}
