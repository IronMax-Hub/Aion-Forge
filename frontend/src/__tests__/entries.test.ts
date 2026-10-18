import { describe, it, expect } from "vitest";
import { makeConfig } from "../simulation/config";
import type { UniverseConfig } from "../simulation/config";
import { buildGalaxyConfig } from "../simulation/galaxy";
import type { GalaxyConfig } from "../simulation/galaxy";
import { generateStarsFor, UNIVERSE_AGE_GYR } from "../simulation/star";
import type { Star } from "../simulation/star";
import { generatePlanetsFor, solidWorldOf } from "../simulation/planet";
import type { Planet, SolidWorld } from "../simulation/planet";
import { generateBiosphere } from "../simulation/biosphere";
import { generateCivilization } from "../simulation/civilization";
import { planetFormedAgo } from "../simulation/history";
import { indexRowsFor, packIndex } from "../simulation/universeIndex";
import type { IndexRow, UniverseIndex } from "../simulation/universeIndex";
import { biosphereEntry, civilizationEntry, galaxyEntry, planetEntry, starEntry } from "../ui/encyclopedia/entries";
import type { EntryContext } from "../ui/encyclopedia/entries";
import type { Entry, Sentence } from "../ui/encyclopedia/entry";
import { airPhrase, bodyName, moonName, planetName } from "../ui/format";
import { subjectKey, subjectLabel } from "../ui/encyclopedia/subjects";

// A sample of each universe: the first stars, with every solid world's history kept
const SAMPLE_STARS = 300;

interface Sample {
  config: UniverseConfig;
  galaxy: GalaxyConfig;
  ctx: EntryContext;
  systems: { star: Star; planets: Planet[] }[];
  worlds: Map<string, SolidWorld>;
  index: UniverseIndex;
}

function sampleOf(seed: number): Sample {
  const config = makeConfig(seed);
  const galaxy = buildGalaxyConfig(seed, config);
  const stars = generateStarsFor(galaxy, UNIVERSE_AGE_GYR, config).stars;
  const worlds = new Map<string, SolidWorld>();
  const keep: typeof solidWorldOf = (planet, star, galaxySeed, cfg) => {
    const world = solidWorldOf(planet, star, galaxySeed, cfg);
    worlds.set(planet.key, world);
    return world;
  };
  const rows: IndexRow[] = [];
  const systems = stars.slice(0, SAMPLE_STARS).map((star) => {
    const system = generatePlanetsFor(star, seed, config, keep);
    rows.push(...indexRowsFor(system, star, seed, config));
    return { star, planets: system.planets };
  });
  const index = packIndex(rows);
  return { config, galaxy, ctx: { config, stars, index }, systems, worlds, index };
}

const samples = [100000, 42, 7777].map(sampleOf);

/** Every sentence of an entry. */
function sentencesOf(entry: Entry): Sentence[] {
  return [...entry.lede, ...entry.chronicle.map((c) => c.sentence), ...entry.notable, ...entry.limits];
}

/** Every piece of text an entry shows. */
function textsOf(entry: Entry): string[] {
  return [
    entry.designation, entry.citation, entry.title,
    ...sentencesOf(entry).map((s) => s.text),
    ...entry.facts.flatMap((f) => [f.label, f.value]),
  ];
}

/** Every entry of a sample: galaxy, stars, planets, biospheres and civilizations. */
function entriesOf(sample: Sample): { entry: Entry; star: Star; planet: Planet | null }[] {
  const out: { entry: Entry; star: Star; planet: Planet | null }[] = [];
  for (const { star, planets } of sample.systems) {
    out.push({ entry: starEntry(star, planets, sample.ctx), star, planet: null });
    for (const planet of planets) {
      const world = sample.worlds.get(planet.key) ?? null;
      out.push({ entry: planetEntry(planet, star, world, sample.ctx), star, planet });
      if (planet.life) out.push({ entry: biosphereEntry(planet, star, world, sample.ctx), star, planet });
      if (planet.life?.phylogeny.mind) out.push({ entry: civilizationEntry(planet, star, world, sample.ctx), star, planet });
    }
  }
  return out;
}

describe("encyclopedia entries", () => {
  it("never show 'undefined' or 'NaN', and give every sentence a source", () => {
    for (const sample of samples) {
      const entries = [{ entry: galaxyEntry(sample.galaxy, sample.ctx) }, ...entriesOf(sample)];
      for (const { entry } of entries) {
        for (const text of textsOf(entry)) {
          expect(text, entry.citation).not.toMatch(/undefined|NaN|null/);
          expect(text.length, entry.citation).toBeGreaterThan(0);
        }
        for (const s of sentencesOf(entry)) expect(s.sources.length, s.text).toBeGreaterThan(0);
      }
    }
  });

  it("date a chronicle between the planet's formation and today, oldest first", () => {
    for (const sample of samples) {
      for (const { entry, star, planet } of entriesOf(sample)) {
        const earliest = planet ? planetFormedAgo(planet, star) : star.age;
        const dates = entry.chronicle.map((c) => c.agoGyr);
        for (const ago of dates) {
          expect(ago, entry.citation).toBeGreaterThanOrEqual(0);
          expect(ago, entry.citation).toBeLessThanOrEqual(earliest + 1e-9);
        }
        for (let i = 1; i < dates.length; i++) expect(dates[i], entry.citation).toBeLessThanOrEqual(dates[i - 1]);
      }
    }
  });

  it("count the mass extinctions a world survived as its biosphere does", () => {
    for (const sample of samples) {
      let row = 0;
      for (const { star, planets } of sample.systems) {
        for (const planet of planets) {
          const entry = planetEntry(planet, star, sample.worlds.get(planet.key) ?? null, sample.ctx);
          const said = entry.lede.map((s) => /^Survived (\d+) mass extinctions?\.$/.exec(s.text)).find((m) => m !== null);
          expect(said ? Number(said[1]) : 0, entry.citation).toBe(sample.index.massExtinctions[row]);
          row++;
        }
      }
    }
  });

  it("say when a world's air changed class or was lost to space (AE3)", () => {
    let lost = 0;
    let changed = 0;
    for (const sample of samples) {
      for (const { star, planets } of sample.systems) {
        for (const planet of planets) {
          const lede = planetEntry(planet, star, sample.worlds.get(planet.key) ?? null, sample.ctx).lede.map((s) => s.text).join(" ");
          if (planet.worldEvents.some((e) => e.kind === "air-lost")) {
            lost++;
            expect(lede).toContain(`It formed with ${airPhrase(planet.formationAtmosphere)}; the last of it was lost to space `);
          } else if (planet.surface && planet.formationAtmosphere !== planet.atmosphere) {
            changed++;
            expect(lede).toContain(`Formed with ${airPhrase(planet.formationAtmosphere)}; ${planet.atmosphere} today.`);
          }
        }
      }
    }
    expect(lost).toBeGreaterThan(0);
    expect(changed).toBeGreaterThan(0);
  });

  it("write the same entry every time", () => {
    const sample = samples[0];
    expect(galaxyEntry(sample.galaxy, sample.ctx)).toEqual(galaxyEntry(sample.galaxy, sample.ctx));
    for (const { star, planets } of sample.systems.slice(0, 40)) {
      expect(starEntry(star, planets, sample.ctx)).toEqual(starEntry(star, planets, sample.ctx));
      for (const planet of planets) {
        const world = sample.worlds.get(planet.key) ?? null;
        expect(planetEntry(planet, star, world, sample.ctx)).toEqual(planetEntry(planet, star, world, sample.ctx));
      }
    }
  });

  it("list nothing as notable before the survey has made the index", () => {
    const sample = samples[0];
    const ctx = { ...sample.ctx, index: null };
    const { star, planets } = sample.systems.find((s) => s.planets.some((p) => p.life))!;
    const planet = planets.find((p) => p.life)!;
    const entry = planetEntry(planet, star, null, ctx);
    expect(entry.notable.every((s) => s.text.startsWith("Rare:"))).toBe(true);
    expect(textsOf(galaxyEntry(sample.galaxy, ctx)).join(" ")).not.toMatch(/undefined|NaN/);
  });
});

describe("reference entries", () => {
  // The first world of each kind in the samples, in seed, star and planet order
  const find = (test: (planet: Planet, star: Star, sample: Sample) => boolean) => {
    for (const sample of samples) {
      for (const { star, planets } of sample.systems) {
        const planet = planets.find((p) => test(p, star, sample));
        if (planet) return { sample, star, planet, world: sample.worlds.get(planet.key) ?? null };
      }
    }
    throw new Error("no such world in the samples");
  };
  const lives = (planet: Planet, star: Star, sample: Sample) => {
    const bio = generateBiosphere(planet, star);
    return { bio, civ: generateCivilization(bio, planet, sample.config.seed).civilization };
  };

  it("an Earth-like world", () => {
    const { sample, star, planet, world } = find((p, s) => p.surface !== null && p.life !== null && p.life.endedGyr === null
      && p.temperature > 260 && p.temperature < 310 && p.surface.landFraction > 0.05 && p.surface.oceanFraction > 0.3
      && generateBiosphere(p, s).stage !== "microbial");
    expect(planetEntry(planet, star, world, sample.ctx)).toMatchSnapshot();
  });

  it("an ocean world with complex life", () => {
    const { sample, star, planet, world } = find((p, s) => p.type === "ocean"
      && ["complex", "dominant"].includes(generateBiosphere(p, s).stage));
    expect(planetEntry(planet, star, world, sample.ctx)).toMatchSnapshot();
    expect(biosphereEntry(planet, star, world, sample.ctx)).toMatchSnapshot();
  });

  it("a frozen living world", () => {
    const { sample, star, planet, world } = find((p, s) => p.surface !== null && p.surface.iceFraction >= 0.9
      && generateBiosphere(p, s).hasLife);
    expect(planetEntry(planet, star, world, sample.ctx)).toMatchSnapshot();
  });

  it("a world of ruins", () => {
    const { sample, star, planet, world } = find((p, s, smp) => lives(p, s, smp).civ?.extinctAgoGyr != null);
    expect(planetEntry(planet, star, world, sample.ctx)).toMatchSnapshot();
    expect(civilizationEntry(planet, star, world, sample.ctx)).toMatchSnapshot();
  });

  it("a gas giant and its star", () => {
    const { sample, star, planet } = find((p) => p.type === "gas-giant");
    const planets = sample.systems.find((s) => s.star.id === star.id)!.planets;
    expect(planetEntry(planet, star, null, sample.ctx)).toMatchSnapshot();
    expect(starEntry(star, planets, sample.ctx)).toMatchSnapshot();
  });

  it("the galaxy", () => {
    expect(galaxyEntry(samples[0].galaxy, samples[0].ctx)).toMatchSnapshot();
  });
});

describe("moon worlds' entries (MO6)", () => {
  const sample = samples[0];
  const moonWorlds = sample.systems.flatMap(({ star, planets }) =>
    planets.flatMap((p) => p.moons.flatMap((m) => (m.world ? [{ star, moon: m.world, planet: p }] : []))));

  it("name the moon, say which planet it circles, and rank it against no planet", () => {
    expect(moonWorlds.length).toBeGreaterThan(0);
    for (const { star, moon, planet } of moonWorlds) {
      const entry = planetEntry(moon, star, null, sample.ctx);
      expect(entry.designation).toBe(moonName(moon.hostStarId, moon.orbitalIndex, moon.moonIndex!));
      expect(entry.lede[0].text).toContain(`a moon of ${planetName(planet.hostStarId, planet.orbitalIndex)}`);
      expect(entry.subject).toEqual({ kind: "planet", starId: moon.hostStarId, planetIndex: moon.id, moonIndex: moon.moonIndex });
      expect(entry.notable.every((s) => s.text.startsWith("Rare:"))).toBe(true);
      expect(entry.chronicle[0].sentence.text).toContain("The moon formed around");
    }
  });

  it("give moon subjects their own labels and keys", () => {
    const ref = { kind: "planet" as const, starId: 1300, planetIndex: 2, moonIndex: 1 };
    expect(subjectLabel(ref)).toBe("1300 d-ii");
    expect(subjectKey(ref)).toBe("planet-1300-2-m1");
    expect(subjectKey({ ...ref, moonIndex: undefined })).toBe("planet-1300-2");
    expect(bodyName({ hostStarId: 1300, orbitalIndex: 2, moonIndex: 1 })).toBe("1300 d-ii");
    expect(bodyName({ hostStarId: 1300, orbitalIndex: 2 })).toBe("1300 d");
  });
});
