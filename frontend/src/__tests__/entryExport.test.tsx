import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { makeConfig } from "../simulation/config";
import { buildGalaxyConfig } from "../simulation/galaxy";
import { generateStarsFor, UNIVERSE_AGE_GYR } from "../simulation/star";
import { generatePlanetsFor } from "../simulation/planet";
import { biosphereEntry, civilizationEntry, galaxyEntry, planetEntry, starEntry } from "../ui/encyclopedia/entries";
import type { Entry } from "../ui/encyclopedia/entry";
import { entryDiscovery, entryMarkdown } from "../ui/encyclopedia/export";
import { subjectLabel } from "../ui/encyclopedia/subjects";
import { EntryView } from "../ui/EncyclopediaPanel";
import { formatGyr } from "../ui/format";

const SEED = 100000;
const config = makeConfig(SEED);
const galaxy = buildGalaxyConfig(SEED, config);
const stars = generateStarsFor(galaxy, UNIVERSE_AGE_GYR, config).stars;
const ctx = { config, stars, index: null };

// A sample: every entry of the first stars, and the galaxy's
const entries: Entry[] = [galaxyEntry(galaxy, ctx)];
for (const star of stars.slice(0, 40)) {
  const { planets } = generatePlanetsFor(star, SEED, config);
  entries.push(starEntry(star, planets, ctx));
  for (const planet of planets) {
    entries.push(planetEntry(planet, star, null, ctx));
    if (planet.life) entries.push(biosphereEntry(planet, star, null, ctx));
    if (planet.life?.phylogeny.mind) entries.push(civilizationEntry(planet, star, null, ctx));
  }
}

/** Every piece of text the panel shows for an entry. */
function shownTexts(entry: Entry): string[] {
  return [
    entry.title, entry.designation, entry.citation,
    ...entry.lede.map((s) => s.text),
    ...entry.facts.flatMap((f) => [f.label, f.value]),
    ...entry.chronicle.flatMap((c) => [`${formatGyr(c.agoGyr)} ago`, c.sentence.text]),
    ...entry.notable.map((s) => s.text),
    ...entry.seeAlso.map(subjectLabel),
    ...entry.limits.map((s) => s.text),
  ];
}

/** The text of rendered HTML. */
function textOf(html: string): string {
  return html.replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, "\"").replace(/&#x27;/g, "'");
}

describe("copy and cite", () => {
  it("copies every piece of text the panel shows, and the citation", () => {
    expect(entries.length).toBeGreaterThan(100);
    for (const entry of entries) {
      const rendered = textOf(renderToStaticMarkup(<EntryView subject={entry.subject} entryFor={() => entry} />));
      const markdown = entryMarkdown(entry);
      for (const text of shownTexts(entry)) {
        expect(rendered, entry.citation).toContain(text);
        expect(markdown, entry.citation).toContain(text);
      }
      expect(markdown.endsWith(`Cite as: ${entry.citation}`)).toBe(true);
    }
  });

  it("saves stars, worlds and civilizations to their collections, and not the galaxy", () => {
    const categories = new Map(entries.map((e) => [e.subject.kind, entryDiscovery(e, SEED, 0)?.category ?? null]));
    expect(categories.get("galaxy")).toBeNull();
    expect(categories.get("star")).toBe("favorite-stars");
    expect(categories.get("planet")).toBe("remarkable-worlds");
    expect(categories.get("biosphere")).toBe("remarkable-worlds");
    const planet = entries.find((e) => e.subject.kind === "planet")!;
    const item = entryDiscovery(planet, SEED, 5)!;
    expect(item.savedAt).toBe(5);
    expect(item.universeSeed).toBe(SEED);
    expect(item.description).toBe(planet.lede.map((s) => s.text).join(" "));
    // One saved item per subject: saving again replaces it
    expect(entryDiscovery(planet, SEED, 9)!.id).toBe(item.id);
  });
});
