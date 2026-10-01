import { createRNG, SALT } from "./rng";
import type { GalaxyParticles } from "./galaxy";
import type { StellarPopulation, Star } from "./star";
import { MAIN_SEQUENCE_END_FRACTION, REMNANT_FRACTION } from "./star";
import type { Planet } from "./planet";
import type { Biosphere } from "./biosphere";
import type { Civilization, Species } from "./civilization";
import type { WorldEventKind } from "./worldHistory";
import type { FirstKind } from "./evolution/engine";

/** Delay between a star's birth and its innermost planet finishing assembly, in Gyr. */
const PLANET_FORMATION_DELAY_GYR = 0.05;

// ── Event importance (AF-098) ─────────────────────────────────────────────────

export type Importance = "minor" | "significant" | "major" | "historic" | "legendary";

export const IMPORTANCE_RANK: Record<Importance, number> = {
  minor: 1, significant: 2, major: 3, historic: 4, legendary: 5,
};

// ── Event categories ──────────────────────────────────────────────────────────

export type EventCategory =
  | "cosmic"
  | "stellar"
  | "planetary"
  | "biological"
  | "civilizational";

// ── Core event model (AF-092) ─────────────────────────────────────────────────

export interface HistoricalEvent {
  id: number;
  universeSeed: number;
  timestampGyr: number;     // time before present (positive = further in the past)
  category: EventCategory;
  subjectId: string;        // e.g. "galaxy-100000", "star-42", "planet-42-3" (planet key)
  summary: string;
  importance: Importance;
}

// ── Universe timeline (AF-099) ────────────────────────────────────────────────

export interface UniverseTimeline {
  universeSeed: number;
  events: HistoricalEvent[];
}

export function createTimeline(universeSeed: number): UniverseTimeline {
  return { universeSeed, events: [] };
}

export function insertEvent(timeline: UniverseTimeline, event: HistoricalEvent): void {
  timeline.events.push(event);
}

export function sortTimeline(timeline: UniverseTimeline): HistoricalEvent[] {
  return [...timeline.events].sort((a, b) => b.timestampGyr - a.timestampGyr);
}

export function filterByCategory(
  timeline: UniverseTimeline,
  category: EventCategory
): HistoricalEvent[] {
  return sortTimeline(timeline).filter((e) => e.category === category);
}

export function filterByImportance(
  timeline: UniverseTimeline,
  min: Importance
): HistoricalEvent[] {
  const minRank = IMPORTANCE_RANK[min];
  return sortTimeline(timeline).filter((e) => IMPORTANCE_RANK[e.importance] >= minRank);
}

export function filterBySubject(
  timeline: UniverseTimeline,
  subjectId: string
): HistoricalEvent[] {
  return sortTimeline(timeline).filter((e) => e.subjectId === subjectId);
}

// ── ID counter — deterministic per timeline build ─────────────────────────────

let _nextId = 0;
function nextId() { return _nextId++; }
function resetIds() { _nextId = 0; }

// ── AF-093: Cosmic event recording ───────────────────────────────────────────

export function recordCosmicEvents(
  galaxy: GalaxyParticles,
  population: StellarPopulation,
  seed: number
): HistoricalEvent[] {
  const events: HistoricalEvent[] = [];
  const rng = createRNG((seed ^ SALT.COSMIC_HISTORY) >>> 0);

  // Galaxy formation
  const formationAge = 10 + rng() * 3;
  events.push({
    id: nextId(), universeSeed: seed,
    timestampGyr: formationAge,
    category: "cosmic",
    subjectId: `galaxy-${seed}`,
    summary: `A ${galaxy.config.type} galaxy coalesced from primordial gas and dust.`,
    importance: "major",
  });

  // Count rare stellar phenomena
  const blackHoles  = population.stars.filter((s) => s.classification === "black-hole");
  const neutronStars = population.stars.filter((s) => s.classification === "neutron-star");

  if (blackHoles.length > 0) {
    const bh = blackHoles[0];
    events.push({
      id: nextId(), universeSeed: seed,
      timestampGyr: Math.max(0.001, bh.age - bh.lifespan * REMNANT_FRACTION),
      category: "cosmic",
      subjectId: `star-${bh.id}`,
      summary: `A massive star collapsed into a stellar black hole, warping spacetime in its vicinity.`,
      importance: blackHoles.length > 3 ? "legendary" : "historic",
    });
  }

  if (neutronStars.length > 5) {
    events.push({
      id: nextId(), universeSeed: seed,
      timestampGyr: 8 + rng() * 4,
      category: "cosmic",
      subjectId: `galaxy-${seed}`,
      summary: `An unusually high density of neutron stars formed within this galaxy's core regions.`,
      importance: "significant",
    });
  }

  // Unusual galaxy structure
  if (galaxy.config.type === "irregular") {
    events.push({
      id: nextId(), universeSeed: seed,
      timestampGyr: formationAge - 1,
      category: "cosmic",
      subjectId: `galaxy-${seed}`,
      summary: `Gravitational disruption left this galaxy structurally irregular — evidence of ancient turbulence.`,
      importance: "significant",
    });
  }

  return events;
}

// ── AF-094: Stellar event recording ──────────────────────────────────────────

export function recordStellarEvents(
  star: Star,
  seed: number
): HistoricalEvent[] {
  const events: HistoricalEvent[] = [];

  // Timestamps are "Gyr before present": a star born `age` ago passed a phase
  // boundary at fraction f of its lifespan (age − f·lifespan) Gyr ago.
  const phaseStartedAgo = (fraction: number) => Math.max(0.001, star.age - star.lifespan * fraction);

  // Birth
  events.push({
    id: nextId(), universeSeed: seed,
    timestampGyr: star.age,
    category: "stellar",
    subjectId: `star-${star.id}`,
    summary: `A ${star.isRare ? "remarkable " : ""}${star.classification.replace("-", " ")} ignited with a mass of ${star.mass.toFixed(2)} M☉.`,
    importance: star.isRare ? "historic" : "minor",
  });

  // Classification transitions
  if (star.classification === "red-giant") {
    events.push({
      id: nextId(), universeSeed: seed,
      timestampGyr: phaseStartedAgo(MAIN_SEQUENCE_END_FRACTION),
      category: "stellar",
      subjectId: `star-${star.id}`,
      summary: `The star exhausted its hydrogen fuel and expanded into a red giant, engulfing inner orbits.`,
      importance: "significant",
    });
  }

  if (star.classification === "white-dwarf") {
    events.push({
      id: nextId(), universeSeed: seed,
      timestampGyr: phaseStartedAgo(REMNANT_FRACTION),
      category: "stellar",
      subjectId: `star-${star.id}`,
      summary: `After shedding its outer layers, the star cooled into a white dwarf — an ember of spent fusion.`,
      importance: "significant",
    });
  }

  if (star.classification === "neutron-star") {
    events.push({
      id: nextId(), universeSeed: seed,
      timestampGyr: phaseStartedAgo(REMNANT_FRACTION),
      category: "stellar",
      subjectId: `star-${star.id}`,
      summary: `A violent supernova compressed the stellar core into a neutron star of extraordinary density.`,
      importance: "historic",
    });
  }

  if (star.classification === "black-hole") {
    events.push({
      id: nextId(), universeSeed: seed,
      timestampGyr: phaseStartedAgo(REMNANT_FRACTION),
      category: "stellar",
      subjectId: `star-${star.id}`,
      summary: `The star's collapse exceeded the neutron degeneracy limit — a black hole formed where a star once burned.`,
      importance: "legendary",
    });
  }

  return events;
}

// ── AF-095: Planetary event recording ────────────────────────────────────────

export function recordPlanetaryEvents(
  planet: Planet,
  hostStar: Star,
  seed: number
): HistoricalEvent[] {
  const events: HistoricalEvent[] = [];
  // Planets assemble within the star's first ~100 Myr, outer ones slightly later.
  // Later milestones are dated as time elapsed after formation, so they always
  // follow it — and precede the world history, which starts 0.5 Gyr after the star (worldHistory.ts).
  const formedAgo = Math.max(0.001, hostStar.age - (PLANET_FORMATION_DELAY_GYR + planet.orbitalIndex * 0.01));
  const afterFormation = (gyr: number) => Math.max(0.001, formedAgo - gyr);

  // Formation
  events.push({
    id: nextId(), universeSeed: seed,
    timestampGyr: formedAgo,
    category: "planetary",
    subjectId: `planet-${planet.key}`,
    summary: `${planet.isRare ? "A rare " : "A "}${planet.type.replace("-", " ")} world coalesced at ${planet.orbitalRadius.toFixed(2)} AU from its host star.`,
    importance: planet.isRare ? "historic" : "minor",
  });

  // Notable conditions
  if (planet.habitabilityScore > 0.7) {
    events.push({
      id: nextId(), universeSeed: seed,
      timestampGyr: afterFormation(0.3),
      category: "planetary",
      subjectId: `planet-${planet.key}`,
      summary: `Conditions stabilized into a remarkably hospitable environment — liquid water, temperate atmosphere, abundant resources.`,
      importance: "major",
    });
  }

  if (planet.type === "ocean") {
    events.push({
      id: nextId(), universeSeed: seed,
      timestampGyr: afterFormation(0.2),
      category: "planetary",
      subjectId: `planet-${planet.key}`,
      summary: `Global oceans formed, covering the entire surface in liquid water.`,
      importance: "significant",
    });
  }

  if (planet.type === "lava") {
    events.push({
      id: nextId(), universeSeed: seed,
      timestampGyr: afterFormation(0.1),
      category: "planetary",
      subjectId: `planet-${planet.key}`,
      summary: `Intense volcanic activity kept the surface molten — a world perpetually reshaped by its own interior.`,
      importance: "significant",
    });
  }

  // What its world history recorded (C2.7), and when its life began and ended
  const planetEvent = (tGyr: number, summary: string, importance: Importance) => events.push({
    id: nextId(), universeSeed: seed,
    timestampGyr: agoFrom(hostStar, tGyr),
    category: "planetary",
    subjectId: `planet-${planet.key}`,
    summary, importance,
  });
  for (const e of planet.worldEvents) planetEvent(e.tGyr, WORLD_EVENT[e.kind].summary, WORLD_EVENT[e.kind].importance);
  if (planet.life) {
    planetEvent(planet.life.startedGyr, LIFE_BEGAN, "significant");
    if (planet.life.endedGyr !== null) planetEvent(planet.life.endedGyr, "The last life on this world died out.", "legendary");
  }

  return events;
}

const LIFE_BEGAN = "Life began, as a single kind of cell in the dark water.";

/** The world history's events in the timeline (Revision 1, C2.7). */
const WORLD_EVENT: Record<WorldEventKind, { summary: string; importance: Importance }> = {
  "star-leaves-main-sequence": { summary: "Its star left the main sequence, and its light began to change.", importance: "historic" },
  "freezes-over":       { summary: "Ice spread from the poles until the planet froze over.", importance: "major" },
  thaws:                { summary: "The ice retreated and the planet thawed.", importance: "major" },
  "moist-greenhouse":   { summary: "The climate grew hot enough for water to rise into the upper air and escape to space.", importance: "major" },
  "runaway-greenhouse": { summary: "A runaway greenhouse turned the oceans to steam.", importance: "historic" },
  "oceans-lost":        { summary: "The last of the oceans was lost to space.", importance: "historic" },
  oxidation:            { summary: "Oxygen built up in the air for the first time.", importance: "historic" },
};

/** Gyr before present of a moment `tGyr` after the star formed; never quite zero, so it sorts as past. */
function agoFrom(star: Star, tGyr: number): number {
  return Math.max(0.001, star.age - tGyr);
}

// ── AF-096: Biological event recording ───────────────────────────────────────

export function recordBiologicalEvents(
  bio: Biosphere,
  planet: Planet,
  star: Star,
  seed: number
): HistoricalEvent[] {
  // Life's dated firsts and the catastrophes that cost it lineages (C2.7), from
  // the planet's own history; a world whose life has ended keeps them
  if (!planet.life) return [];
  const events: HistoricalEvent[] = [];
  const subjectId = `planet-${planet.key}`;

  for (const first of planet.life.phylogeny.firsts) {
    const recorded = FIRST_EVENT[first.kind];
    if (!recorded) continue;
    events.push({
      id: nextId(), universeSeed: seed,
      timestampGyr: agoFrom(star, first.tGyr),
      category: "biological", subjectId,
      summary: recorded.summary, importance: recorded.importance,
    });
  }

  // Every lethal catastrophe (owner decision), graded by the share of living lineages it ended
  for (const ext of bio.extinctions) {
    const percent = Math.round(ext.severityLoss * 100);
    const mass = ext.severityLoss >= MASS_EXTINCTION_SHARE;
    events.push({
      id: nextId(), universeSeed: seed,
      timestampGyr: Math.max(0.001, ext.timeAgo),
      category: "biological", subjectId,
      summary: mass
        ? `Mass extinction: ${ext.cause} ended ${percent}% of living lineages.`
        : `${ext.cause[0].toUpperCase()}${ext.cause.slice(1)} ended ${percent}% of living lineages.`,
      importance: ext.severityLoss >= SEVERE_EXTINCTION_SHARE ? "historic" : mass ? "major" : "minor",
    });
  }

  return events;
}

/**
 * Life's firsts in the timeline (Worlds Up Close C2.7, as amended in R9): the
 * first multicellular body is the first lineage above 10⁻⁹ kg. The first
 * consumer is not among the plan's events, and the first mind is the
 * civilization's own "An intelligent species evolved".
 */
const FIRST_EVENT: Partial<Record<FirstKind, { summary: string; importance: Importance }>> = {
  light:         { summary: "The first organisms that live on starlight appeared.", importance: "significant" },
  multicellular: { summary: "Life grew beyond single cells: the first bodies heavier than a microgram.", importance: "major" },
  land:          { summary: "Life first moved onto land.", importance: "major" },
};

// Share of living lineages a catastrophe must end to count as a mass extinction, and as a severe one
const MASS_EXTINCTION_SHARE = 0.25;
const SEVERE_EXTINCTION_SHARE = 0.5;

// ── AF-097: Civilizational event recording ────────────────────────────────────

export function recordCivilizationalEvents(
  civ: Civilization,
  species: Species,
  planet: Planet,
  seed: number
): HistoricalEvent[] {
  const events: HistoricalEvent[] = [];

  // Intelligence emergence
  events.push({
    id: nextId(), universeSeed: seed,
    timestampGyr: civ.ageGyr,
    category: "civilizational",
    subjectId: `planet-${planet.key}`,
    summary: `An intelligent species evolved — curious, ${species.cooperation > 0.6 ? "cooperative" : "competitive"}, and aware of their own existence.`,
    importance: "legendary",
  });

  // Milestones from civilization model
  for (const m of civ.milestones) {
    const importanceMap: Record<string, Importance> = {
      "first-cities":         "significant",
      agriculture:            "significant",
      writing:                "major",
      industry:               "major",
      "global-communication": "historic",
      spaceflight:            "legendary",
      collapse:               "major",
      recovery:               "significant",
      "golden-age":           "historic",
      "dark-age":             "major",
    };
    events.push({
      id: nextId(), universeSeed: seed,
      timestampGyr: m.timeAgo,
      category: "civilizational",
      subjectId: `planet-${planet.key}`,
      summary: m.note,
      importance: importanceMap[m.type] ?? "minor",
    });
  }

  // Final state
  if (civ.techStage === "collapsed" && civ.extinctAgoGyr === null) {
    events.push({
      id: nextId(), universeSeed: seed,
      timestampGyr: 0.001,
      category: "civilizational",
      subjectId: `planet-${planet.key}`,
      summary: `The civilization collapsed terminally. ${Math.round(civ.population)}B survivors remain among the ruins.`,
      importance: "historic",
    });
  } else if (civ.techStage === "space-age") {
    events.push({
      id: nextId(), universeSeed: seed,
      timestampGyr: 0.001,
      category: "civilizational",
      subjectId: `planet-${planet.key}`,
      summary: `This civilization stands at the threshold of the cosmos — the stars are within reach.`,
      importance: "legendary",
    });
  }

  return events;
}

// ── AF-098: Importance scoring helper ────────────────────────────────────────
// Applied after all events are collected — upgrades importance for truly rare combinations

export function scoreImportance(events: HistoricalEvent[]): void {
  const legendary = events.filter((e) => e.importance === "legendary").length;
  // If a world has multiple legendary events, the most recent civilizational one is elevated
  if (legendary >= 3) {
    const civEvents = events.filter((e) => e.category === "civilizational");
    if (civEvents.length > 0) {
      civEvents[civEvents.length - 1].importance = "legendary";
    }
  }
}

// ── Full timeline builder ─────────────────────────────────────────────────────

export function buildUniverseTimeline(
  seed: number,
  galaxy: GalaxyParticles,
  population: StellarPopulation,
  systems: { planet: Planet; star: Star; bio: Biosphere; civ?: Civilization; species?: Species }[]
): UniverseTimeline {
  resetIds();
  const timeline = createTimeline(seed);

  for (const e of recordCosmicEvents(galaxy, population, seed))       insertEvent(timeline, e);
  for (const star of population.stars) {
    for (const e of recordStellarEvents(star, seed))                   insertEvent(timeline, e);
  }
  for (const { planet, star, bio, civ, species } of systems) {
    for (const e of recordPlanetaryEvents(planet, star, seed))         insertEvent(timeline, e);
    for (const e of recordBiologicalEvents(bio, planet, star, seed))   insertEvent(timeline, e);
    if (civ && species) {
      for (const e of recordCivilizationalEvents(civ, species, planet, seed)) insertEvent(timeline, e);
    }
  }

  scoreImportance(timeline.events);
  return timeline;
}

// ── AF-102: Historical summary ────────────────────────────────────────────────

export function summarizeTimeline(timeline: UniverseTimeline): string {
  const events     = sortTimeline(timeline);
  const legendary  = events.filter((e) => e.importance === "legendary");
  const historic   = events.filter((e) => e.importance === "historic" || e.importance === "legendary");
  const civEvents  = events.filter((e) => e.category === "civilizational");
  const stelEvents = events.filter((e) => e.category === "stellar");
  // Worlds where life began (a planetary event since C2.7), living or not
  const lifePlanets = new Set(events.filter((e) => e.summary === LIFE_BEGAN).map((e) => e.subjectId)).size;
  const civPlanets  = new Set(civEvents.map((e) => e.subjectId)).size;

  const parts: string[] = [];

  // Stellar opening
  const deadStars = stelEvents.filter(
    (e) => e.summary.includes("neutron star") || e.summary.includes("black hole")
  ).length;
  if (deadStars > 5) {
    parts.push(`This universe burned through ${deadStars} stellar lives before quieting.`);
  }

  // Life
  if (lifePlanets === 0) {
    parts.push("No life emerged. This universe unfolded in silence, indifferent to its own existence.");
    return parts.join(" ");
  } else if (lifePlanets === 1) {
    parts.push("Against all odds, life found purchase on a single world.");
  } else {
    parts.push(`Life arose on ${lifePlanets} worlds — a chemistry repeated across the void.`);
  }

  // Civilization
  if (civPlanets === 0) {
    parts.push("Intelligence never emerged. The biospheres flourished without witness.");
  } else if (civPlanets === 1) {
    parts.push("From one of these worlds, a civilization looked up and asked why.");
  } else {
    parts.push(`${civPlanets} civilizations arose — each independently discovering fire, language, and the stars.`);
  }

  // Significance
  if (legendary.length > 0) {
    const noun = legendary.length === 1 ? "A legendary moment" : `${legendary.length} legendary moments`;
    parts.push(`${noun} marked the record.`);
  } else if (historic.length > 0) {
    parts.push(`${historic.length} historic event${historic.length > 1 ? "s" : ""} shaped its story.`);
  }

  return parts.join(" ");
}
