import { createRNG } from "./rng";
import type { GalaxyParticles } from "./galaxy";
import type { StellarPopulation, Star } from "./star";
import type { PlanetarySystem, Planet } from "./planet";
import type { Biosphere } from "./biosphere";
import type { Civilization, Species } from "./civilization";

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
  subjectId: string;        // e.g. "star-42", "planet-7", "civ-1"
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
  const rng = createRNG((seed ^ 0xC051C000) >>> 0);

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
      timestampGyr: bh.age,
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

  // Birth
  const birthAge = star.age + (star.lifespan - star.age) * 0.95 + star.age * 0.05;
  events.push({
    id: nextId(), universeSeed: seed,
    timestampGyr: star.age + star.lifespan * 0.9,
    category: "stellar",
    subjectId: `star-${star.id}`,
    summary: `A ${star.isRare ? "remarkable " : ""}${star.classification.replace("-", " ")} ignited with a mass of ${star.mass.toFixed(2)} M☉.`,
    importance: star.isRare ? "historic" : "minor",
  });

  // Classification transitions
  if (star.classification === "red-giant") {
    events.push({
      id: nextId(), universeSeed: seed,
      timestampGyr: star.age * 0.3,
      category: "stellar",
      subjectId: `star-${star.id}`,
      summary: `The star exhausted its hydrogen fuel and expanded into a red giant, engulfing inner orbits.`,
      importance: "significant",
    });
  }

  if (star.classification === "white-dwarf") {
    events.push({
      id: nextId(), universeSeed: seed,
      timestampGyr: star.age * 0.15,
      category: "stellar",
      subjectId: `star-${star.id}`,
      summary: `After shedding its outer layers, the star cooled into a white dwarf — an ember of spent fusion.`,
      importance: "significant",
    });
  }

  if (star.classification === "neutron-star") {
    events.push({
      id: nextId(), universeSeed: seed,
      timestampGyr: star.age * 0.1,
      category: "stellar",
      subjectId: `star-${star.id}`,
      summary: `A violent supernova compressed the stellar core into a neutron star of extraordinary density.`,
      importance: "historic",
    });
  }

  if (star.classification === "black-hole") {
    events.push({
      id: nextId(), universeSeed: seed,
      timestampGyr: star.age * 0.08,
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
  const baseAge = hostStar.age * (0.6 + planet.orbitalIndex * 0.05);

  // Formation
  events.push({
    id: nextId(), universeSeed: seed,
    timestampGyr: baseAge,
    category: "planetary",
    subjectId: `planet-${planet.id}`,
    summary: `${planet.isRare ? "A rare " : "A "}${planet.type.replace("-", " ")} world coalesced at ${planet.orbitalRadius.toFixed(2)} AU from its host star.`,
    importance: planet.isRare ? "historic" : "minor",
  });

  // Notable conditions
  if (planet.habitabilityScore > 0.7) {
    events.push({
      id: nextId(), universeSeed: seed,
      timestampGyr: baseAge * 0.8,
      category: "planetary",
      subjectId: `planet-${planet.id}`,
      summary: `Conditions stabilized into a remarkably hospitable environment — liquid water, temperate atmosphere, abundant resources.`,
      importance: "major",
    });
  }

  if (planet.type === "ocean") {
    events.push({
      id: nextId(), universeSeed: seed,
      timestampGyr: baseAge * 0.7,
      category: "planetary",
      subjectId: `planet-${planet.id}`,
      summary: `Global oceans formed, covering the entire surface in liquid water.`,
      importance: "significant",
    });
  }

  if (planet.type === "lava") {
    events.push({
      id: nextId(), universeSeed: seed,
      timestampGyr: baseAge * 0.9,
      category: "planetary",
      subjectId: `planet-${planet.id}`,
      summary: `Intense volcanic activity kept the surface molten — a world perpetually reshaped by its own interior.`,
      importance: "significant",
    });
  }

  return events;
}

// ── AF-096: Biological event recording ───────────────────────────────────────

export function recordBiologicalEvents(
  bio: Biosphere,
  planet: Planet,
  seed: number
): HistoricalEvent[] {
  if (!bio.hasLife) return [];
  const events: HistoricalEvent[] = [];

  // First life
  events.push({
    id: nextId(), universeSeed: seed,
    timestampGyr: bio.ageGyr,
    category: "biological",
    subjectId: `planet-${planet.id}`,
    summary: `The first self-replicating molecules emerged — life took hold on this world.`,
    importance: "legendary",
  });

  const STAGE_EVENTS: Partial<Record<string, { summary: string; importance: Importance }>> = {
    microbial:      { summary: "Microbial ecosystems spread across the planet, transforming the atmosphere.", importance: "major" },
    multicellular:  { summary: "Multicellular organisms evolved — complexity began its exponential ascent.", importance: "historic" },
    complex:        { summary: "Complex animal-like life diversified into ecological niches across land and sea.", importance: "historic" },
    dominant:       { summary: "A dominant lifeform emerged, reshaping ecosystems in its wake.", importance: "legendary" },
  };

  const reached = ["microbial", "multicellular", "complex", "dominant"];
  const stageOrder = ["none", "prebiotic", "microbial", "multicellular", "complex", "dominant"];
  const stageIdx = stageOrder.indexOf(bio.stage);

  for (let i = 2; i <= stageIdx; i++) {
    const s = reached[i - 2];
    const ev = STAGE_EVENTS[s];
    if (ev) {
      const timeAgo = bio.ageGyr * (1 - (i - 2) / 4) * 0.85;
      events.push({
        id: nextId(), universeSeed: seed,
        timestampGyr: Math.max(0.001, timeAgo),
        category: "biological",
        subjectId: `planet-${planet.id}`,
        summary: ev.summary,
        importance: ev.importance,
      });
    }
  }

  // Extinction events
  for (const ext of bio.extinctions) {
    events.push({
      id: nextId(), universeSeed: seed,
      timestampGyr: ext.timeAgo,
      category: "biological",
      subjectId: `planet-${planet.id}`,
      summary: `Mass extinction: ${ext.cause}. ${Math.round(ext.severityLoss * 100)}% of biodiversity lost.`,
      importance: ext.severityLoss > 0.6 ? "historic" : "significant",
    });
  }

  return events;
}

// ── AF-097: Civilizational event recording ────────────────────────────────────

export function recordCivilizationalEvents(
  civ: Civilization,
  species: Species,
  seed: number
): HistoricalEvent[] {
  const events: HistoricalEvent[] = [];

  // Intelligence emergence
  events.push({
    id: nextId(), universeSeed: seed,
    timestampGyr: civ.ageGyr,
    category: "civilizational",
    subjectId: `planet-${civ.planetId}`,
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
      subjectId: `planet-${civ.planetId}`,
      summary: m.note,
      importance: importanceMap[m.type] ?? "minor",
    });
  }

  // Final state
  if (civ.techStage === "collapsed") {
    events.push({
      id: nextId(), universeSeed: seed,
      timestampGyr: 0.001,
      category: "civilizational",
      subjectId: `planet-${civ.planetId}`,
      summary: `The civilization collapsed terminally. ${Math.round(civ.population)}B survivors remain among the ruins.`,
      importance: "historic",
    });
  } else if (civ.techStage === "space-age") {
    events.push({
      id: nextId(), universeSeed: seed,
      timestampGyr: 0.001,
      category: "civilizational",
      subjectId: `planet-${civ.planetId}`,
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
    for (const e of recordBiologicalEvents(bio, planet, seed))         insertEvent(timeline, e);
    if (civ && species) {
      for (const e of recordCivilizationalEvents(civ, species, seed))  insertEvent(timeline, e);
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
  const bioEvents  = events.filter((e) => e.category === "biological");
  const stelEvents = events.filter((e) => e.category === "stellar");
  const lifePlanets = new Set(bioEvents.map((e) => e.subjectId)).size;
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
