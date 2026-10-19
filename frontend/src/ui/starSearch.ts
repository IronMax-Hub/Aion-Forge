// Star search: find stars by catalogue number and by traits.
//
// Why it exists: a galaxy has 2,000 stars and no way to reach a particular
// one but clicking points. The search finds a star by its number ("416",
// "0416", "Star 0416") and narrows the galaxy by traits, every word applying
// at once: "binary life", "G2", "red giant", "metal-poor planets".
//
// Words it knows:
//   a number                    that star
//   O B A F G K M L, or "G2"   spectral type, or its start (remnants have none)
//   protostar, main sequence, red giant (or giant), white dwarf, neutron star, black hole, remnant
//   binary (double, companion), single
//   life (living), civilization (civilisation, civ), planets   from the life survey
//   rare, metal-poor, solar, metal-rich
// Unknown words are reported, not ignored, so a typo does not silently match
// everything. Words that need the life survey match nothing until it is done.
//
// Presentation only: it reads stars and the survey's index and changes nothing.

import type { Star, StellarClass } from "../simulation/star";
import type { UniverseIndex } from "../simulation/universeIndex";
import { METALLICITY_LABEL_BOUNDS, spectralType } from "./format";

/** What the life survey says about each star, by star id. */
export interface SurveyFacts {
  living: ReadonlySet<number>;      // a planet with life today
  civilized: ReadonlySet<number>;   // a planet that holds or held a civilization
  withPlanets: ReadonlySet<number>; // at least one planet
}

export interface StarSearch {
  /** Every matching star, in catalogue order. */
  stars: Star[];
  /** Words the search does not know. */
  unknown: string[];
  /** Words that need the life survey, while it is not done. */
  waitingForSurvey: string[];
}

/** The survey's facts per star, from its index. */
export function surveyFactsOf(index: UniverseIndex): SurveyFacts {
  const living = new Set<number>();
  const civilized = new Set<number>();
  const withPlanets = new Set<number>();
  for (let i = 0; i < index.count; i++) {
    const star = index.starId[i];
    withPlanets.add(star);
    if (index.lifeStage[i] > 0) living.add(star);
    if (index.highestStage[i] > 0) civilized.add(star);
  }
  return { living, civilized, withPlanets };
}

// Phrases of two words, joined before the query is split
const PHRASES: [RegExp, string][] = [
  [/\bred giants?\b/g, "red-giant"],
  [/\bwhite dwarfs?\b/g, "white-dwarf"],
  [/\bneutron stars?\b/g, "neutron-star"],
  [/\bblack holes?\b/g, "black-hole"],
  [/\bmain sequence\b/g, "main-sequence"],
  [/\bmetal poor\b/g, "metal-poor"],
  [/\bmetal rich\b/g, "metal-rich"],
];
// Words that say nothing
const FILLER = new Set(["star", "stars", "with", "and", "the", "of", "in", "has", "have"]);

const CLASS_WORDS: Record<string, readonly StellarClass[]> = {
  protostar: ["protostar"],
  "main-sequence": ["main-sequence"],
  "red-giant": ["red-giant"], giant: ["red-giant"], giants: ["red-giant"],
  "white-dwarf": ["white-dwarf"],
  "neutron-star": ["neutron-star"], neutron: ["neutron-star"],
  "black-hole": ["black-hole"],
  remnant: ["white-dwarf", "neutron-star", "black-hole"], remnants: ["white-dwarf", "neutron-star", "black-hole"],
};

type Test = (star: Star) => boolean;

/** The test one word stands for; "survey" when it needs facts not yet known; null when unknown. */
function testOf(word: string, facts: SurveyFacts | null): Test | "survey" | null {
  if (/^\d+$/.test(word)) {
    const id = Number(word);
    return (star) => star.id === id;
  }
  // A spectral type or its start: "g", "g2" (the letter alone also covers subtypes)
  if (/^[obafgkml]\d?$/.test(word)) {
    const prefix = word.toUpperCase();
    return (star) => spectralType(star.temperature, star.classification)?.startsWith(prefix) ?? false;
  }
  const classes = CLASS_WORDS[word];
  if (classes) return (star) => classes.includes(star.classification);
  switch (word) {
    case "binary": case "binaries": case "double": case "companion": return (star) => star.companion !== null;
    case "single": return (star) => star.companion === null;
    case "rare": return (star) => star.isRare;
    case "metal-poor": return (star) => star.metallicity < METALLICITY_LABEL_BOUNDS.poorBelow;
    case "metal-rich": return (star) => star.metallicity > METALLICITY_LABEL_BOUNDS.richAbove;
    case "solar": return (star) => star.metallicity >= METALLICITY_LABEL_BOUNDS.poorBelow && star.metallicity <= METALLICITY_LABEL_BOUNDS.richAbove;
  }
  const surveyed: Record<string, keyof SurveyFacts> = {
    life: "living", living: "living", alive: "living",
    civilization: "civilized", civilizations: "civilized", civilisation: "civilized", civilisations: "civilized", civ: "civilized",
    planet: "withPlanets", planets: "withPlanets",
  };
  const fact = surveyed[word];
  if (fact) return facts ? (star) => facts[fact].has(star.id) : "survey";
  return null;
}

/** The stars matching every word of `query`; nothing for an empty query. */
export function searchStars(query: string, stars: readonly Star[], facts: SurveyFacts | null): StarSearch {
  let text = query.toLowerCase().replace(/[,;]/g, " ");
  for (const [phrase, joined] of PHRASES) text = text.replace(phrase, joined);
  const words = text.split(/\s+/).filter((w) => w.length > 0 && !FILLER.has(w));
  const tests: Test[] = [];
  const unknown: string[] = [];
  const waitingForSurvey: string[] = [];
  for (const word of words) {
    const test = testOf(word, facts);
    if (test === null) unknown.push(word);
    else if (test === "survey") waitingForSurvey.push(word);
    else tests.push(test);
  }
  const usable = tests.length > 0 && unknown.length === 0 && waitingForSurvey.length === 0;
  return { stars: usable ? stars.filter((star) => tests.every((t) => t(star))) : [], unknown, waitingForSurvey };
}
