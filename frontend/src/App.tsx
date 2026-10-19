import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { audioEngine, ambientLayer, discovery, ui, lab, civLayer } from "./audio";
import { AudioControls } from "./ui/AudioControls";
import { UniverseRenderer } from "./rendering/UniverseRenderer";
import type { PlanetSight, ViewScale } from "./rendering/UniverseRenderer";
import { generateGalaxy, buildGalaxyConfig, GALAXY_PARTICLE_COUNT } from "./simulation/galaxy";
import type { GalaxyConfig, GalaxyType, GalaxyParticles } from "./simulation/galaxy";
import { generateStarsFor, irradianceAt, UNIVERSE_AGE_GYR } from "./simulation/star";
import type { Star, StellarPopulation } from "./simulation/star";
import { generatePlanetsFor, solidWorldOf, effectiveOrbitAU, GIANT_PLANET_MASS } from "./simulation/planet";
import { derivePhysics } from "./simulation/planetPhysics";
import type { Planet, PlanetarySystem, SolidWorld } from "./simulation/planet";
import { generateBiosphere } from "./simulation/biosphere";
import type { Biosphere } from "./simulation/biosphere";
import { generateCivilization } from "./simulation/civilization";
import type { Civilization, Species } from "./simulation/civilization";
import { surveyLife } from "./simulation/lifeSurvey";
import { buildUniverseTimeline, summarizeTimeline } from "./simulation/history";
import type { UniverseTimeline } from "./simulation/history";
import { makeConfig, DEFAULT_CONFIG, CONFIG_LABELS } from "./simulation/config";
import type { UniverseConfig } from "./simulation/config";
import { compareUniverses, makeExperimentRecord, buildSnapshot } from "./simulation/experiment";
import { SIMULATION_RULES_VERSION } from "./simulation/version";
import type { UniverseSnapshot, UniverseComparison, ExperimentRecord } from "./simulation/experiment";
import { StarPanel } from "./ui/StarPanel";
import { PlanetPanel } from "./ui/PlanetPanel";
import { BiospherePanel } from "./ui/BiospherePanel";
import { CivilizationPanel } from "./ui/CivilizationPanel";
import { TimelinePanel } from "./ui/TimelinePanel";
import { RealityConfigPanel } from "./ui/RealityConfigPanel";
import { ComparisonPanel } from "./ui/ComparisonPanel";
import { ExperimentHistoryPanel } from "./ui/ExperimentHistoryPanel";
import { GalleryPanel } from "./ui/GalleryPanel";
import { SystemPanel } from "./ui/SystemPanel";
import { fieldGuideSpecimens, mindSpecies } from "./ui/specimens";
import { layoutTree } from "./ui/treeOfLife";
import { TreeOfLifePanel } from "./ui/TreeOfLifePanel";
import { bodyPlans } from "./rendering/life/morphology";
import { ScaleBar } from "./ui/ScaleBar";
import { GreatFilterPanel } from "./ui/GreatFilterPanel";
import { PhysicsPage } from "./ui/PhysicsPage";
import type { GateId } from "./simulation/greatFilter";
import { EncyclopediaPanel, EntryActions, EntryView } from "./ui/EncyclopediaPanel";
import { subjectKey } from "./ui/encyclopedia/subjects";
import { biosphereEntry, civilizationEntry, galaxyEntry, planetEntry, starEntry } from "./ui/encyclopedia/entries";
import type { Entry, SubjectRef } from "./ui/encyclopedia/entry";
import type { UniverseIndex } from "./simulation/universeIndex";
import { bodyName, starName, planetLifeLabel, lifeMarkerLabel, PLANET_TYPE_LABEL } from "./ui/format";
import { makeUniverseId, generateUniverseSummary, importUniverseFromFile } from "./simulation/persistence";
import type { UniverseMeta, DiscoveryItem } from "./simulation/persistence";
import { makeJournalEntry } from "./simulation/journal";
import type { JournalEntry } from "./simulation/journal";
import * as api from "./api/client";
import { importLocalDataOnce } from "./api/importLocalData";
import { createSurveyClient } from "./workers/surveyClient";
import { createSurveyPool, surveyPoolSize } from "./workers/surveyPool";
import SurveyWorker from "./workers/survey.worker?worker";
import "./App.css";

const surveyClient = createSurveyClient(() =>
  createSurveyPool(() => new SurveyWorker(), surveyPoolSize(navigator.hardwareConcurrency)));

function randomSeed(): number {
  return Math.floor(Math.random() * 1_000_000_000);
}

type View = "galaxy" | "system" | "biosphere" | "civilization";

// Whether life markers are on is a per-browser display preference, not saved data
const LIFE_MARKERS_KEY = "aion-forge-life-markers";

function readLifeMarkersPreference(): boolean {
  try { return localStorage.getItem(LIFE_MARKERS_KEY) === "on"; } catch { return false; }
}

function storageErrorMessage(err: unknown): string {
  return err instanceof api.StorageError ? err.message : "Saving failed";
}

/** A system's bodies that are worlds: its planets, each followed by its moon worlds (MO6). */
function bodiesOf(planets: Planet[]): Planet[] {
  return planets.flatMap((planet) => [planet, ...planet.moons.flatMap((moon) => (moon.world ? [moon.world] : []))]);
}

/** The encyclopedia subject of a planet or moon world (MO6). */
function subjectOf(body: Planet, kind: "planet" | "biosphere" | "civilization"): SubjectRef {
  return body.moonIndex === undefined
    ? { kind, starId: body.hostStarId, planetIndex: body.id }
    : { kind, starId: body.hostStarId, planetIndex: body.id, moonIndex: body.moonIndex };
}

export default function App() {
  const canvasRef          = useRef<HTMLCanvasElement>(null);
  const rendererRef        = useRef<UniverseRenderer | null>(null);
  const galaxyRef          = useRef<GalaxyParticles | null>(null);
  const populationRef      = useRef<StellarPopulation | null>(null);
  const snapshotRef        = useRef<UniverseSnapshot | null>(null);
  const cachedSnapshotRef  = useRef<UniverseSnapshot | null>(null);
  const systemBiosphereRef = useRef<Map<string, Biosphere>>(new Map());   // by body key: planets and moon worlds
  // What the system and planet views draw each planet of the open system from, by planet key
  // (ids repeat between systems). A ref for the approach callback the renderer holds (state
  // would reach it stale), and state for what renders from it (the planet panel)
  const systemSightsRef = useRef<Map<string, PlanetSight>>(new Map());
  const [systemSights, setSystemSights] = useState<Map<string, PlanetSight>>(new Map());
  const galaxyConfigRef = useRef<GalaxyConfig | null>(null);
  // Systems made for the encyclopedia or opened on screen, with their solid worlds, by star id (EN3)
  const systemRecordsRef = useRef<Map<number, { planets: Planet[]; worlds: Map<string, SolidWorld> }>>(new Map());
  // Every world's facts, from the life survey (EN0); null until it finishes
  const [surveyIndex, setSurveyIndex] = useState<UniverseIndex | null>(null);
  // The entry floating over the stage (EN3): the galaxy's, or a world's opened from another panel
  const [encyclopediaSubject, setEncyclopediaSubject] = useState<SubjectRef | null>(null);
  // The Great Filter panel (GF3), and the gate whose breakdown it shows
  const [showGreatFilter, setShowGreatFilter] = useState(false);
  const [filterGate, setFilterGate] = useState<GateId | null>(null);
  // Which of those two floating panels is in front: the one opened or clicked last
  const [frontOverlay, setFrontOverlay] = useState<"encyclopedia" | "filter">("encyclopedia");
  // The Physics page, over the stage and the dock; and the survey's count of engulfed planets, which it shows
  const [showPhysics, setShowPhysics] = useState(false);
  const [surveyEngulfed, setSurveyEngulfed] = useState<number | null>(null);
  const [surveyTooSmall, setSurveyTooSmall] = useState<number | null>(null);
  const [surveyUnstable, setSurveyUnstable] = useState<number | null>(null);

  const [seed, setSeed]             = useState<number>(() => randomSeed());
  const [inputSeed, setInputSeed]   = useState<string>("");
  const [galaxyType, setGalaxyType] = useState<GalaxyType>("spiral");
  const [starCount, setStarCount]   = useState(0);
  const [isGenerating, setIsGenerating] = useState(false);
  const [surveyProgress, setSurveyProgress] = useState<number | null>(null);   // null when no survey is running
  const [surveyError, setSurveyError] = useState<string | null>(null);
  // Snapshots are built from the life survey, so their buttons wait for it
  const snapshotPending = isGenerating || surveyProgress !== null;
  const [view, setView]             = useState<View>("galaxy");
  // In orbit around the selected planet (Worlds Up Close A4). The biosphere and
  // civilization panels still open from orbit; leaving orbit returns to the system.
  const [orbiting, setOrbiting]     = useState(false);

  // Universe config (laws of reality)
  const [universeConfig, setUniverseConfig] = useState<UniverseConfig>(() => makeConfig(0));
  const [showConfigPanel,   setShowConfigPanel]   = useState(false);
  const [showHistoryPanel,  setShowHistoryPanel]  = useState(false);
  const [baselineSnapshot,  setBaselineSnapshot]  = useState<UniverseSnapshot | null>(null);
  const [comparison,        setComparison]        = useState<UniverseComparison | null>(null);
  // Saved data lives in MySQL behind the local API; these hold the latest copy
  const [experiments,       setExperiments]       = useState<ExperimentRecord[]>([]);
  const [gallery,           setGallery]           = useState<UniverseMeta[]>([]);
  const [discoveries,       setDiscoveries]       = useState<DiscoveryItem[]>([]);
  const [bookmarks,         setBookmarks]         = useState<JournalEntry[]>([]);
  const [storageError,      setStorageError]      = useState<string | null>(null);
  const [showGallery,       setShowGallery]       = useState(false);

  const [selectedStar,         setSelectedStar]         = useState<Star | null>(null);
  const [selectedPlanet,       setSelectedPlanet]       = useState<Planet | null>(null);
  const [selectedBiosphere,    setSelectedBiosphere]    = useState<Biosphere | null>(null);
  const [selectedCivilization, setSelectedCivilization] = useState<Civilization | null>(null);
  const [selectedSpecies,      setSelectedSpecies]      = useState<Species | null>(null);
  const [universeTimeline,     setUniverseTimeline]     = useState<UniverseTimeline | null>(null);
  const [timelineSummary,      setTimelineSummary]      = useState<string>("");
  const [showTimeline,         setShowTimeline]         = useState(false);
  const [currentSeed,          setCurrentSeed]          = useState<number>(0);
  const [currentSystem, setCurrentSystem] = useState<PlanetarySystem | null>(null);
  const [viewScale,     setViewScale]     = useState<ViewScale | null>(null);
  const [showLifeMarkers, setShowLifeMarkers] = useState<boolean>(readLifeMarkersPreference);

  // Audio — initialize on first user interaction (browser requirement)
  const audioInitRef = useRef(false);
  const initAudio = useCallback(() => {
    if (audioInitRef.current) return;
    audioInitRef.current = true;
    audioEngine.init();
    ambientLayer.start();
  }, []);

  const generate = useCallback((s: number, cfg?: UniverseConfig) => {
    const config = cfg ?? universeConfig;
    setIsGenerating(true);
    setSelectedStar(null);
    setSelectedPlanet(null);
    setSelectedBiosphere(null);
    setSelectedCivilization(null);
    setSelectedSpecies(null);
    setUniverseTimeline(null);
    setTimelineSummary("");
    setShowTimeline(false);
    setComparison(null);
    setCurrentSystem(null);
    setView("galaxy");
    setOrbiting(false);
    cachedSnapshotRef.current = null;
    setSurveyError(null);
    setSurveyIndex(null);
    setSurveyEngulfed(null);
    setSurveyTooSmall(null);
    setSurveyUnstable(null);
    setEncyclopediaSubject(null);
    setFilterGate(null);
    systemRecordsRef.current = new Map();
    rendererRef.current?.exitSystemView();

    requestAnimationFrame(() => {
      const galaxyCfg  = buildGalaxyConfig(s, config);
      const particles  = generateGalaxy(galaxyCfg);
      const population = generateStarsFor(galaxyCfg, UNIVERSE_AGE_GYR, config);
      galaxyRef.current     = particles;
      populationRef.current = population;
      galaxyConfigRef.current = galaxyCfg;
      setGalaxyType(galaxyCfg.type);
      setStarCount(population.stars.length);
      setCurrentSeed(s);
      rendererRef.current?.renderGalaxy(particles);
      rendererRef.current?.renderStars(population, (star) => {
        setSelectedStar(star);
        setSelectedPlanet(null);
        setSelectedBiosphere(null);
        ui.inspect();
        if (star?.isRare) discovery.rareStar();
      });
      setIsGenerating(false);
      ui.universeLoad();
      ambientLayer.setContext("galaxy");
      // Survey life off the main thread: it feeds the snapshot and the life markers
      surveyClient.request(s, config, {
        onProgress: setSurveyProgress,
        onResult: (survey) => {
          setSurveyProgress(null);
          setSurveyIndex(survey.index);
          setSurveyEngulfed(survey.engulfedPlanets);
          setSurveyTooSmall(survey.tooSmallPlanets);
          setSurveyUnstable(survey.unstablePlanets);
          cachedSnapshotRef.current = buildSnapshot(s, config, population.stars.length, survey);
          rendererRef.current?.setLifeMarkers(survey.systems.map(life => ({ starId: life.starId, label: lifeMarkerLabel(life) })));
        },
        onError: (message) => {
          setSurveyProgress(null);
          setSurveyError(message);
        },
      });
    });
  }, [universeConfig]);

  useEffect(() => {
    if (!canvasRef.current) return;
    const renderer = new UniverseRenderer(canvasRef.current);
    rendererRef.current = renderer;
    renderer.setViewScaleListener(setViewScale);
    generate(seed);
    return () => renderer.dispose();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    rendererRef.current?.setLifeMarkersVisible(showLifeMarkers);
    try { localStorage.setItem(LIFE_MARKERS_KEY, showLifeMarkers ? "on" : "off"); } catch { /* preference not kept */ }
  }, [showLifeMarkers]);

  // Global Escape key: close overlays in priority order, then navigate back
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (showPhysics)      { setShowPhysics(false);      return; }
      if (encyclopediaSubject) { setEncyclopediaSubject(null); return; }
      if (showGreatFilter)  { setShowGreatFilter(false);  return; }
      if (showGallery)      { setShowGallery(false);      return; }
      if (showConfigPanel)  { setShowConfigPanel(false);  return; }
      if (showHistoryPanel) { setShowHistoryPanel(false); return; }
      if (showTimeline)     { setShowTimeline(false);     return; }
      if (comparison)       { setComparison(null);        return; }
      if (orbiting && view === "system") { leaveOrbit(); return; }   // up one level: back to the system
      if (view === "system" && selectedPlanet) { setSelectedPlanet(null); return; }   // off the planet, to the whole system
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [showPhysics, encyclopediaSubject, showGreatFilter, showGallery, showConfigPanel, showHistoryPanel, showTimeline, comparison, orbiting, view, selectedPlanet]);

  const handleRandomize = () => {
    const s = randomSeed();
    setSeed(s);
    setInputSeed("");
    generate(s);
  };

  const handleRegenerate = () => generate(seed);

  const handleSeedSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = parseInt(inputSeed, 10);
    if (!isNaN(parsed) && parsed >= 0) {
      setSeed(parsed);
      generate(parsed);
    }
  };

  // Snapshot of the universe on screen, for comparison and saving
  function snapshotOf(s: number, cfg: UniverseConfig, pop: StellarPopulation): UniverseSnapshot {
    return buildSnapshot(s, cfg, pop.stars.length, surveyLife(pop.stars, s, cfg));
  }

  const handleSetBaseline = useCallback(() => {
    if (!populationRef.current) return;
    const snap = cachedSnapshotRef.current ?? snapshotOf(currentSeed, universeConfig, populationRef.current);
    cachedSnapshotRef.current = snap;
    snapshotRef.current = snap;
    setBaselineSnapshot(snap);
    ui.baseline();
  }, [currentSeed, universeConfig]);

  const handleCompare = useCallback(() => {
    if (!baselineSnapshot || !populationRef.current) return;
    lab.compareBegin();
    const expSnap = cachedSnapshotRef.current ?? snapshotOf(currentSeed, universeConfig, populationRef.current);
    cachedSnapshotRef.current = expSnap;
    const cmp = compareUniverses(baselineSnapshot, expSnap);
    setComparison(cmp);
    lab.compareReveal();
  }, [baselineSnapshot, currentSeed, universeConfig]);

  /** Run a database operation; on failure show why in the status bar instead of saving. */
  const withStorage = useCallback(async (operation: () => Promise<void>) => {
    try {
      await operation();
      setStorageError(null);
    } catch (err) {
      setStorageError(storageErrorMessage(err));
    }
  }, []);

  const refreshGallery = useCallback(async () => {
    const [universes, found] = await Promise.all([api.fetchUniverses(), api.fetchDiscoveries()]);
    setGallery(universes);
    setDiscoveries(found);
  }, []);

  // Load saved data once, after importing any data this browser saved before the database existed
  useEffect(() => {
    let cancelled = false;
    importLocalDataOnce()
      .then(() => Promise.all([api.fetchUniverses(), api.fetchDiscoveries(), api.fetchExperiments(), api.fetchBookmarks()]))
      .then(([universes, found, log, marks]) => {
        if (cancelled) return;
        setGallery(universes);
        setDiscoveries(found);
        setExperiments(log);
        setBookmarks(marks);
        setStorageError(null);
      })
      .catch((err) => { if (!cancelled) setStorageError(storageErrorMessage(err)); });
    return () => { cancelled = true; };
  }, []);

  const handleSaveExperiment = useCallback(() => {
    if (!comparison) return;
    const record = makeExperimentRecord(comparison);
    void withStorage(async () => {
      await api.saveExperiment(record);
      setExperiments(await api.fetchExperiments());
      setComparison(null);
    });
  }, [comparison, withStorage]);

  const handleSaveToGallery = useCallback(() => {
    if (!populationRef.current) return;
    ui.save();
    const snap = cachedSnapshotRef.current ?? snapshotOf(currentSeed, universeConfig, populationRef.current);
    cachedSnapshotRef.current = snap;
    const summaryText = generateUniverseSummary({
      seed: currentSeed,
      config: universeConfig,
      galaxyType,
      starCount: snap.starCount,
      lifeBearingPlanets: snap.lifeBearingPlanets,
      civilizationCount: snap.civilizationCount,
      legendaryEvents: snap.legendaryEvents,
      totalPlanets: snap.totalPlanets,
    });
    const meta: UniverseMeta = {
      snapshotId: makeUniverseId(currentSeed),
      seed: currentSeed,
      config: universeConfig,
      name: makeUniverseId(currentSeed),
      createdAt: Date.now(),
      galaxyType,
      summary: summaryText,
      starCount: snap.starCount,
      lifeBearingPlanets: snap.lifeBearingPlanets,
      civilizationCount: snap.civilizationCount,
      legendaryEvents: snap.legendaryEvents,
      totalPlanets: snap.totalPlanets,
      notes: "",
      isFavorite: false,
      rulesVersion: SIMULATION_RULES_VERSION,
    };
    void withStorage(async () => {
      await api.saveUniverse(meta);
      await refreshGallery();
    });
  }, [currentSeed, universeConfig, galaxyType, refreshGallery, withStorage]);

  // Regenerate a saved universe under the current rules and store its new counts
  const handleRecountUniverse = (meta: UniverseMeta) => void withStorage(async () => {
    // The survey runs on the worker; only the stars, which are cheap, are generated here
    const stars = generateStarsFor(buildGalaxyConfig(meta.seed, meta.config), UNIVERSE_AGE_GYR, meta.config).stars;
    const snap = buildSnapshot(meta.seed, meta.config, stars.length, await surveyClient.survey(meta.seed, meta.config));
    const summary = generateUniverseSummary({ ...snap, galaxyType: meta.galaxyType });
    await api.recountUniverse(meta.snapshotId, {
      summary,
      starCount: snap.starCount,
      lifeBearingPlanets: snap.lifeBearingPlanets,
      civilizationCount: snap.civilizationCount,
      legendaryEvents: snap.legendaryEvents,
      totalPlanets: snap.totalPlanets,
      rulesVersion: SIMULATION_RULES_VERSION,
    });
    await refreshGallery();
  });

  const handleLoadFromGallery = useCallback((meta: UniverseMeta) => {
    setUniverseConfig(meta.config);
    setSeed(meta.seed);
    setShowGallery(false);
    ui.restore();
    generate(meta.seed, meta.config);
  }, [generate]);

  const handleImport = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const meta = await importUniverseFromFile(file);
    e.target.value = "";
    if (!meta) { setStorageError("That file is not a saved Aion Forge universe"); return; }
    await withStorage(async () => {
      await api.saveUniverse(meta);
      await refreshGallery();
    });
  }, [refreshGallery, withStorage]);

  const handleSaveDiscovery = useCallback((item: DiscoveryItem) => {
    void withStorage(async () => {
      await api.saveDiscovery(item);
      await refreshGallery();
    });
  }, [refreshGallery, withStorage]);

  const handleToggleFavorite = (meta: UniverseMeta) => void withStorage(async () => {
    await api.updateUniverse(meta.snapshotId, { isFavorite: !meta.isFavorite });
    await refreshGallery();
  });

  const handleRenameUniverse = (snapshotId: string, name: string) => void withStorage(async () => {
    await api.updateUniverse(snapshotId, { name });
    await refreshGallery();
  });

  const handleRemoveUniverse = (snapshotId: string) => void withStorage(async () => {
    await api.deleteUniverse(snapshotId);
    await refreshGallery();
  });

  const handleRemoveDiscovery = (id: string) => void withStorage(async () => {
    await api.deleteDiscovery(id);
    await refreshGallery();
  });

  const isSelectedStarBookmarked = !!selectedStar
    && bookmarks.some((b) => b.starId === selectedStar.id && b.galaxySeed === currentSeed);

  const handleToggleBookmark = () => {
    if (!selectedStar) return;
    const star = selectedStar;
    void withStorage(async () => {
      if (isSelectedStarBookmarked) await api.deleteBookmark(currentSeed, star.id);
      else                          await api.saveBookmark(makeJournalEntry(star, currentSeed));
      setBookmarks(await api.fetchBookmarks());
    });
  };

  const handleApplyConfig = useCallback((next: UniverseConfig) => {
    setUniverseConfig(next);
    generate(seed, next);
  }, [seed, generate]);

  // What a planet is drawn from: its world (null for a giant), physics, starlight, life and civilization
  const planetSightOf = useCallback((
    planet: Planet, star: Star, world: SolidWorld | null, biosphere: Biosphere, civilization: Civilization | null,
  ): PlanetSight => {
    const orbitAU = effectiveOrbitAU(planet.orbitalRadius, universeConfig);
    return {
      world,
      physics: world?.physics ?? derivePhysics(planet, star, currentSeed, universeConfig),
      // Both stars' light in a binary (BS3)
      starFlux: irradianceAt(star, orbitAU, planet.orbitsBothStars === true, star.age),
      biosphere,
      civilization,
    };
  }, [currentSeed, universeConfig]);

  // Glide to a planet and go into orbit around it; also what double-clicking a planet does
  const approachPlanet = useCallback((planet: Planet) => {
    setSelectedPlanet(planet);
    setSelectedBiosphere(null);
    setSelectedCivilization(null);
    setSelectedSpecies(null);
    setView("system");
    setOrbiting(true);
    // The planet's own star: the system view keeps this callback, so it must not read the selection
    const star = populationRef.current?.stars[planet.hostStarId];
    if (star) {
      // What the planet view draws: the planet's own world, kept from opening the system, lit by its star
      const sight = systemSightsRef.current.get(planet.key) ?? (() => {
        const world = planet.mass <= GIANT_PLANET_MASS ? solidWorldOf(planet, star, currentSeed, universeConfig) : null;
        const biosphere = systemBiosphereRef.current.get(planet.key) ?? generateBiosphere(planet, star);
        return planetSightOf(planet, star, world, biosphere, generateCivilization(biosphere, planet, currentSeed).civilization);
      })();
      rendererRef.current?.approachPlanet(planet, sight);
    }
    ui.inspect();
  }, [currentSeed, universeConfig, planetSightOf]);

  /** Opens a star's planetary system: makes it, keeps its worlds, and shows it. Returns its planets. */
  const exploreSystem = useCallback((star: Star): Planet[] => {
    if (!rendererRef.current) return [];
    // Each solid planet's world is kept from making the system (solidWorldOf would build the same again):
    // the system and planet views draw its surface from it
    const worlds = new Map<string, SolidWorld>();   // by body key: planets and moon worlds (MO6)
    const system = generatePlanetsFor(star, currentSeed, universeConfig, (planet, star, seed, cfg) => {
      const world = solidWorldOf(planet, star, seed, cfg);
      worlds.set(planet.key, world);
      return world;
    });
    const bodies = bodiesOf(system.planets);

    const biospheres = new Map<string, Biosphere>();
    for (const body of bodies) biospheres.set(body.key, generateBiosphere(body, star));
    systemBiosphereRef.current = biospheres;
    systemRecordsRef.current.set(star.id, { planets: system.planets, worlds });
    const civilizations = new Map(bodies.map((body) =>
      [body.key, generateCivilization(biospheres.get(body.key)!, body, currentSeed)]));
    const sights = new Map(bodies.map((body) => [body.key, planetSightOf(
      body, star, worlds.get(body.key) ?? null, biospheres.get(body.key)!, civilizations.get(body.key)!.civilization,
    )]));
    systemSightsRef.current = sights;
    setSystemSights(sights);

    if (galaxyRef.current && populationRef.current) {
      const systemEntries = system.planets.map((planet) => {
        const bio = biospheres.get(planet.key)!;
        const civResult = civilizations.get(planet.key)!;
        return {
          planet, star: star, bio,
          civ: civResult.civilization ?? undefined,
          species: civResult.species ?? undefined,
        };
      });
      const tl = buildUniverseTimeline(currentSeed, galaxyRef.current, populationRef.current, systemEntries);
      setUniverseTimeline(tl);
      setTimelineSummary(summarizeTimeline(tl));
    }

    setCurrentSystem(system);
    setSelectedPlanet(null);
    setSelectedBiosphere(null);
    setView("system");
    ui.panelOpen();
    ambientLayer.setContext("system");

    rendererRef.current.renderPlanetarySystem(system, star, (planet) => {
      setSelectedPlanet(planet);
      setSelectedBiosphere(null);
      ui.inspect();
    }, {
      onPlanetApproach: approachPlanet,
      planetLabels: new Map(bodies.map((body) => {
        const life = planetLifeLabel(biospheres.get(body.key)!);
        const name = `${bodyName(body)} · ${body.moonOrbit ? "moon · " : ""}${PLANET_TYPE_LABEL[body.type]}`;
        return [body.key, life === "—" ? name : `${name} · ${life} life`];
      })),
      planets: sights,
    });
    return system.planets;
  }, [currentSeed, universeConfig, approachPlanet, planetSightOf]);

  const handleExploreSystem = useCallback(() => {
    if (selectedStar) exploreSystem(selectedStar);
  }, [selectedStar, exploreSystem]);

  const handleScanBiosphere = useCallback(() => {
    if (!selectedPlanet || !selectedStar) return;
    const bio = systemBiosphereRef.current.get(selectedPlanet.key)
      ?? generateBiosphere(selectedPlanet, selectedStar);
    setSelectedBiosphere(bio);
    setSelectedCivilization(null);
    setSelectedSpecies(null);
    setView("biosphere");
    ambientLayer.setContext("biosphere");
    if (bio.hasLife) discovery.firstLife();
  }, [selectedPlanet, selectedStar]);

  const handleScanCivilization = useCallback(() => {
    if (!selectedBiosphere || !selectedPlanet) return;
    const result = generateCivilization(selectedBiosphere, selectedPlanet, currentSeed);
    if (result.civilization && result.species) {
      setSelectedCivilization(result.civilization);
      setSelectedSpecies(result.species);
      setView("civilization");
      ambientLayer.setContext("civilization");
      civLayer.activate(result.civilization.techStage);
      if (result.civilization.isRare) discovery.remarkableCivilization();
      else discovery.civilizationMilestone();
    }
  }, [selectedBiosphere, selectedPlanet, currentSeed]);

  // In the system view the camera follows the selected planet, or the star when none is selected
  // (from the view, the table, Escape or the panel's back button); not while in orbit
  useEffect(() => {
    if (view !== "system" || orbiting) return;
    rendererRef.current?.focusPlanet(selectedPlanet);
  }, [selectedPlanet, view, orbiting]);

  function leaveOrbit() {
    setOrbiting(false);
    rendererRef.current?.leavePlanetView();
    ui.back();
  }

  // The selected solid planet's world, for the planet panel's Surface section (Worlds Up Close A10):
  // the one kept from opening its system, built again only if there is none
  const selectedWorld = useMemo(
    () => (selectedPlanet?.surface && selectedStar
      ? systemSights.get(selectedPlanet.key)?.world ?? solidWorldOf(selectedPlanet, selectedStar, currentSeed, universeConfig)
      : null),
    [selectedPlanet, selectedStar, currentSeed, universeConfig, systemSights],
  );
  // The selected planet's field guide (C2.9): its lineages as specimens and as a tree of life,
  // from its kept world; null where life never began
  const selectedFieldGuide = useMemo(() => {
    const life = selectedWorld?.history.life;
    if (!life || !selectedPlanet?.surface || !selectedStar) return null;
    const orbitAU = effectiveOrbitAU(selectedPlanet.orbitalRadius, universeConfig);
    const env = {
      gravityG: selectedPlanet.surface.surfaceGravity,
      starFlux: irradianceAt(selectedStar, orbitAU, selectedPlanet.orbitsBothStars === true, selectedStar.age),
      starTemperatureK: selectedStar.temperature,
    };
    const plans = bodyPlans(life.lineages, env, { galaxySeed: currentSeed, starId: selectedStar.id, planetId: selectedPlanet.id, moonIndex: selectedPlanet.moonIndex });
    const name = bodyName(selectedPlanet);
    const mindLineageId = selectedPlanet.life?.phylogeny.mind?.lineageId ?? null;
    return {
      planetName: name,
      plans,
      specimens: fieldGuideSpecimens({ lineages: life.lineages, plans, planetName: name, starAgeGyr: selectedStar.age, mindLineageId }),
      tree: layoutTree(life.lineages, life.catastrophes, life.startedGyr, selectedStar.age),
      mindSpecies: mindSpecies(life.lineages, mindLineageId),
    };
  }, [selectedWorld, selectedPlanet, selectedStar, currentSeed, universeConfig]);
  // The field guide's selected lineage and whether its tree of life is open, for one planet at a time
  const [lifeView, setLifeView] = useState<{ planetKey: string; lineageId: number | null; treeOpen: boolean } | null>(null);
  const currentLifeView = lifeView && lifeView.planetKey === selectedPlanet?.key ? lifeView : null;
  const selectLineage = (lineageId: number) =>
    selectedPlanet && setLifeView({ planetKey: selectedPlanet.key, lineageId, treeOpen: currentLifeView?.treeOpen ?? false });
  const setTreeOpen = (treeOpen: boolean) =>
    selectedPlanet && setLifeView({ planetKey: selectedPlanet.key, lineageId: currentLifeView?.lineageId ?? null, treeOpen });
  const treeShown = view === "biosphere" && selectedFieldGuide !== null && currentLifeView?.treeOpen === true;
  // A giant's physics, for its Cloud tops section; a solid planet's come with its world
  const selectedPhysics = useMemo(
    () => selectedWorld?.physics
      ?? (selectedPlanet && selectedStar ? derivePhysics(selectedPlanet, selectedStar, currentSeed, universeConfig) : null),
    [selectedWorld, selectedPlanet, selectedStar, currentSeed, universeConfig],
  );

  // The selected planet's civilization, whose gases its air carries (the Spectrum tab, B5)
  const selectedPlanetCivilization = useMemo(() => {
    if (!selectedPlanet || !selectedStar) return null;
    const biosphere = systemBiosphereRef.current.get(selectedPlanet.key) ?? generateBiosphere(selectedPlanet, selectedStar);
    return generateCivilization(biosphere, selectedPlanet, currentSeed).civilization;
  }, [selectedPlanet, selectedStar, currentSeed]);

  const handleApproach = () => { if (selectedPlanet) approachPlanet(selectedPlanet); };

  // ── Encyclopedia (EN3) ──────────────────────────────────────────────────────

  /** A star's planets and solid worlds: the open system's, or made once and kept for the session's universe. */
  const systemRecordOf = useCallback((star: Star) => {
    const kept = systemRecordsRef.current.get(star.id);
    if (kept) return kept;
    const worlds = new Map<string, SolidWorld>();
    const { planets } = generatePlanetsFor(star, currentSeed, universeConfig, (planet, host, seed, cfg) => {
      const world = solidWorldOf(planet, host, seed, cfg);
      worlds.set(planet.key, world);
      return world;
    });
    const record = { planets, worlds };
    systemRecordsRef.current.set(star.id, record);
    return record;
  }, [currentSeed, universeConfig]);

  /** The encyclopedia entry for a subject of the universe on screen. */
  const entryFor = useCallback((ref: SubjectRef): Entry | null => {
    const population = populationRef.current;
    const galaxy = galaxyConfigRef.current;
    if (!population || !galaxy) return null;
    const ctx = { config: { ...universeConfig, seed: currentSeed }, stars: population.stars, index: surveyIndex };
    if (ref.kind === "galaxy") return galaxyEntry(galaxy, ctx);
    const star = population.stars[ref.starId];
    if (!star) return null;
    const record = systemRecordOf(star);
    if (ref.kind === "star") return starEntry(star, record.planets, ctx);
    const host = record.planets.find((p) => p.id === ref.planetIndex);
    // A moon world's subject names its moon (MO6)
    const planet = ref.moonIndex === undefined ? host : host?.moons.find((m) => m.moonIndex === ref.moonIndex)?.world;
    if (!planet) return null;
    const world = record.worlds.get(planet.key) ?? null;
    if (ref.kind === "planet") return planetEntry(planet, star, world, ctx);
    if (ref.kind === "biosphere") return biosphereEntry(planet, star, world, ctx);
    return civilizationEntry(planet, star, world, ctx);
  }, [currentSeed, universeConfig, surveyIndex, systemRecordOf]);

  /** Opens a world's system, selects it, and shows its entry (GF3: from the worlds stopped at a gate). */
  const openWorld = (starId: number, planetIndex: number) => {
    const star = populationRef.current?.stars[starId];
    if (!star) return;
    if (orbiting) leaveOrbit();
    setSelectedStar(star);
    setSelectedCivilization(null);
    setSelectedSpecies(null);
    const planet = exploreSystem(star).find((p) => p.id === planetIndex) ?? null;
    setSelectedPlanet(planet);
    setShowGreatFilter(false);
    setFrontOverlay("encyclopedia");
    setEncyclopediaSubject({ kind: "planet", starId, planetIndex });
  };

  // What the Physics page reads: one object per universe and survey, so its effects are measured once
  const physicsContext = useMemo(() => {
    const population = populationRef.current;
    const galaxy = galaxyConfigRef.current;
    if (!population || !galaxy || !showPhysics) return null;
    return { config: { ...universeConfig, seed: currentSeed }, galaxy, stars: population.stars, index: surveyIndex, engulfedPlanets: surveyEngulfed, tooSmallPlanets: surveyTooSmall, unstablePlanets: surveyUnstable };
  }, [universeConfig, currentSeed, surveyIndex, surveyEngulfed, surveyTooSmall, surveyUnstable, showPhysics]);

  // The page covers the whole view, so the 3D view stops drawing while it is open
  useEffect(() => { rendererRef.current?.setPaused(showPhysics); }, [showPhysics]);

  const entryActions = (entry: Entry) => (
    <EntryActions entry={entry} universeSeed={currentSeed} discoveries={discoveries} onSaveDiscovery={handleSaveDiscovery} />
  );
  const entryViewOf = (subject: SubjectRef) => (
    <EntryView key={`${currentSeed}-${subjectKey(subject)}`} subject={subject} entryFor={entryFor} actions={entryActions} />
  );

  const handleExitSystem = () => {
    setView("galaxy");
    setOrbiting(false);
    setSelectedPlanet(null);
    setSelectedBiosphere(null);
    setSelectedCivilization(null);
    setSelectedSpecies(null);
    setShowTimeline(false);
    setCurrentSystem(null);
    systemBiosphereRef.current = new Map();
    systemSightsRef.current = new Map();
    setSystemSights(new Map());
    rendererRef.current?.exitSystemView();
    ui.back();
    ambientLayer.setContext("galaxy");
    civLayer.deactivate();
  };

  const handleBackToPlanet = () => {
    setSelectedBiosphere(null);
    setSelectedCivilization(null);
    setSelectedSpecies(null);
    setView("system");
    ui.back();
    ambientLayer.setContext("system");
    civLayer.deactivate();
  };

  const handleBackToBiosphere = () => {
    setSelectedCivilization(null);
    setSelectedSpecies(null);
    setView("biosphere");
    ui.back();
    ambientLayer.setContext("biosphere");
    civLayer.deactivate();
  };

  const handleBackToStar = () => {
    if (orbiting) leaveOrbit();
    setSelectedPlanet(null);
    setSelectedBiosphere(null);
    setSelectedCivilization(null);
    setSelectedSpecies(null);
  };

  const isDefaultConfig = Object.keys(DEFAULT_CONFIG).every(
    (k) => Math.abs((universeConfig[k as keyof typeof DEFAULT_CONFIG] as number) - DEFAULT_CONFIG[k as keyof typeof DEFAULT_CONFIG]) < 0.005
  );

  const universeId = currentSeed > 0 ? makeUniverseId(currentSeed) : null;

  const toggleConfigPanel = () => {
    initAudio();
    const opening = !showConfigPanel;
    setShowConfigPanel((v) => !v); setShowHistoryPanel(false); setShowGallery(false);
    if (opening) { ui.panelOpen(); ambientLayer.setContext("laboratory"); }
    else         { ui.panelClose(); ambientLayer.setContext("galaxy"); }
  };

  const toggleHistoryPanel = () => {
    initAudio();
    const opening = !showHistoryPanel;
    setShowHistoryPanel((v) => !v); setShowConfigPanel(false); setShowGallery(false);
    if (opening) ui.panelOpen(); else ui.panelClose();
  };

  const toggleGallery = () => {
    initAudio();
    const opening = !showGallery;
    setShowGallery((v) => !v); setShowConfigPanel(false); setShowHistoryPanel(false);
    if (opening) ui.panelOpen(); else ui.panelClose();
  };

  const toggleTimeline = () => {
    initAudio();
    const opening = !showTimeline;
    setShowTimeline((v) => !v);
    if (opening) { ui.panelOpen(); ambientLayer.setContext("timeline"); }
    else         { ui.panelClose(); ambientLayer.setContext(view === "civilization" ? "civilization" : view === "biosphere" ? "biosphere" : view === "system" ? "system" : "galaxy"); }
  };

  let statusText = "Ready";
  if (isGenerating)                                                          statusText = "Generating…";
  else if (surveyProgress !== null)                                         statusText = `Surveying life… ${Math.round(surveyProgress * 100)}%`;
  else if (view === "galaxy" && !selectedStar)                              statusText = "Select a star to inspect it";
  else if (view === "galaxy" && selectedStar)                               statusText = "Open the system to see its planets";
  else if (view === "system" && orbiting)                                   statusText = "Drag to look around the planet; scroll to change altitude";
  else if (view === "system" && !selectedPlanet)                            statusText = "Select a planet to inspect it";
  else if (view === "system" && selectedPlanet)                             statusText = "Scan the biosphere to check for life";
  else if (view === "biosphere" && selectedBiosphere?.hasLife)              statusText = "Check whether a civilization has emerged";

  const starLabel = selectedStar ? starName(selectedStar.id) : null;
  const planetLabel = selectedPlanet ? bodyName(selectedPlanet) : null;

  const handleSelectPlanetFromTable = (planet: Planet) => {
    setSelectedPlanet(planet);
    setSelectedBiosphere(null);
    ui.inspect();
  };

  return (
    <div className="app">

      {/* ── Top bar: identity, location, seed ── */}
      <header className="topbar">
        <span className="topbar-brand">Aion Forge</span>
        <nav className="breadcrumb" aria-label="Location">
          <span className="breadcrumb-id">{universeId ?? "——————"}</span>
          <span className="breadcrumb-sep" aria-hidden="true">/</span>
          {view === "galaxy"
            ? <span className="breadcrumb-current">Galaxy</span>
            : <button className="breadcrumb-link" onClick={handleExitSystem}>Galaxy</button>}
          {starLabel && (
            <>
              <span className="breadcrumb-sep" aria-hidden="true">/</span>
              {view === "system" && selectedPlanet
                ? <button className="breadcrumb-link" onClick={handleBackToStar}>{starLabel}</button>
                : view === "biosphere" || view === "civilization"
                  ? <span>{starLabel}</span>
                  : <span className="breadcrumb-current">{starLabel}</span>}
            </>
          )}
          {selectedPlanet && (
            <>
              <span className="breadcrumb-sep" aria-hidden="true">/</span>
              {orbiting
                ? <button className="breadcrumb-link" onClick={() => { handleBackToPlanet(); leaveOrbit(); }}>{planetLabel}</button>
                : view === "biosphere" || view === "civilization"
                  ? <button className="breadcrumb-link" onClick={handleBackToPlanet}>{planetLabel}</button>
                  : <span className="breadcrumb-current">{planetLabel}</span>}
            </>
          )}
          {selectedPlanet && orbiting && (
            <>
              <span className="breadcrumb-sep" aria-hidden="true">/</span>
              {view === "biosphere" || view === "civilization"
                ? <button className="breadcrumb-link" onClick={handleBackToPlanet}>Orbit</button>
                : <span className="breadcrumb-current">Orbit</span>}
            </>
          )}
          {selectedBiosphere && (
            <>
              <span className="breadcrumb-sep" aria-hidden="true">/</span>
              {view === "civilization"
                ? <button className="breadcrumb-link" onClick={handleBackToBiosphere}>Biosphere</button>
                : <span className="breadcrumb-current">Biosphere</span>}
            </>
          )}
          {view === "civilization" && (
            <>
              <span className="breadcrumb-sep" aria-hidden="true">/</span>
              <span className="breadcrumb-current">Civilization</span>
            </>
          )}
        </nav>
        <form className="seed-form" onSubmit={handleSeedSubmit}>
          <input
            className="seed-input"
            type="number"
            min={0}
            placeholder="Enter seed…"
            value={inputSeed}
            onChange={(e) => setInputSeed(e.target.value)}
            aria-label="Universe seed"
          />
          <button className="btn" type="submit" disabled={isGenerating} onClick={initAudio}>Generate</button>
          <button className="btn primary" type="button" onClick={() => { initAudio(); handleRandomize(); }} disabled={isGenerating}>Random seed</button>
          <button className="btn" type="button" onClick={() => { initAudio(); handleRegenerate(); }} disabled={isGenerating} title="Generate the current seed again">Regenerate</button>
        </form>
      </header>

      {/* ── Left sidebar: the universe as a whole ── */}
      <aside className="sidebar" aria-label="Universe">
        <section className="console-section">
          <h2 className="console-section-label">Universe</h2>
          <dl className="kv">
            <dt>Morphology</dt><dd className="kv-text">{universeId ? galaxyType : "—"}</dd>
            <dt>Stars</dt><dd>{universeId ? starCount.toLocaleString() : "—"}</dd>
            <dt>Particles</dt><dd>{GALAXY_PARTICLE_COUNT.toLocaleString()}</dd>
          </dl>
        </section>

        <section className="console-section">
          <h2 className="console-section-label">Overlays</h2>
          <button
            type="button"
            className="switch"
            role="switch"
            aria-checked={showLifeMarkers}
            onClick={() => setShowLifeMarkers(on => !on)}
            title="Mark every star system that holds life"
          >
            <span className="switch-track" aria-hidden="true"><span className="switch-thumb" /></span>
            Life markers
          </button>
        </section>

        <section className="console-section">
          <div className="console-section-head">
            <h2 className="console-section-label">Physical parameters</h2>
            <span className={`console-section-note${isDefaultConfig ? "" : " modified"}`}>{isDefaultConfig ? "Default" : "Modified"}</span>
          </div>
          <dl className="kv">
            {(Object.keys(CONFIG_LABELS) as (keyof typeof CONFIG_LABELS)[]).map((key) => (
              <div className="kv-row" key={key}>
                <dt>{CONFIG_LABELS[key]}</dt><dd>{universeConfig[key].toFixed(2)}×</dd>
              </div>
            ))}
          </dl>
          <div className="controls">
            <button className="btn" onClick={toggleConfigPanel} aria-pressed={showConfigPanel}>
              {showConfigPanel ? "Close parameters" : "Edit parameters…"}
            </button>
          </div>
        </section>

        <section className="console-section">
          <h2 className="console-section-label">Comparison</h2>
          <div className="controls">
            {baselineSnapshot ? (
              <>
                <button className="btn primary" onClick={handleCompare} disabled={snapshotPending}>Compare with baseline</button>
                <span className="hint" style={{ alignSelf: "center" }}>baseline set</span>
              </>
            ) : (
              <button className="btn" onClick={handleSetBaseline} disabled={snapshotPending} title="Use this universe as the baseline for comparison">
                Set as baseline
              </button>
            )}
            <button className="btn" onClick={toggleHistoryPanel} aria-pressed={showHistoryPanel}>
              {showHistoryPanel ? "Close log" : "Experiment log"}
            </button>
          </div>
        </section>

        <section className="console-section">
          <h2 className="console-section-label">Saved universes</h2>
          <div className="controls">
            <button className="btn primary" onClick={handleSaveToGallery} disabled={snapshotPending} title="Save this universe to the library">
              Save universe
            </button>
            <button className="btn" onClick={toggleGallery} aria-pressed={showGallery}>
              {showGallery ? "Close library" : `Library (${gallery.length})`}
            </button>
          </div>
          <label className="import-zone">
            Import universe file…
            <input type="file" accept=".json" style={{ display: "none" }} onChange={handleImport} />
          </label>
        </section>

        <section className="console-section">
          <h2 className="console-section-label">Encyclopedia</h2>
          <div className="controls">
            <button
              className="btn"
              onClick={() => { initAudio(); setFrontOverlay("encyclopedia"); setEncyclopediaSubject((open) => (open?.kind === "galaxy" ? null : { kind: "galaxy" })); }}
              aria-pressed={encyclopediaSubject?.kind === "galaxy"}
              disabled={!universeId}
            >
              Galaxy entry
            </button>
          </div>
        </section>

        <section className="console-section">
          <h2 className="console-section-label">Physics</h2>
          <div className="controls">
            <button
              className="btn"
              onClick={() => { initAudio(); setShowPhysics((v) => !v); }}
              aria-pressed={showPhysics}
              disabled={!universeId}
              title="Every rule this universe runs on, and what it did here"
            >
              {showPhysics ? "Close physics" : "Physics rules"}
            </button>
          </div>
        </section>

        <section className="console-section">
          <h2 className="console-section-label">Great Filter</h2>
          <div className="controls">
            <button
              className="btn"
              onClick={() => { initAudio(); setFrontOverlay("filter"); setShowGreatFilter((v) => !v); }}
              aria-pressed={showGreatFilter}
              disabled={!universeId}
              title="Count the worlds that pass each step from a solid surface to a lasting civilization"
            >
              {showGreatFilter ? "Close filter" : "Great Filter"}
            </button>
          </div>
        </section>

        {universeTimeline && (
          <section className="console-section">
            <h2 className="console-section-label">History</h2>
            <div className="controls">
              <button className="btn timeline-open-btn" onClick={toggleTimeline} aria-pressed={showTimeline}>
                {showTimeline ? "Close timeline" : "Timeline"}
              </button>
            </div>
          </section>
        )}
      </aside>

      {/* ── Stage: the rendered universe, with tool panels floating over it ── */}
      <main className="stage">
        <canvas ref={canvasRef} className="viewport" />

        {showConfigPanel && (
          <RealityConfigPanel
            config={universeConfig}
            onChange={handleApplyConfig}
            onClose={() => setShowConfigPanel(false)}
          />
        )}

        {showHistoryPanel && (
          <ExperimentHistoryPanel
            experiments={experiments}
            onClose={() => setShowHistoryPanel(false)}
          />
        )}

        {showGallery && (
          <GalleryPanel
            gallery={gallery}
            discoveries={discoveries}
            onLoad={handleLoadFromGallery}
            onToggleFavorite={handleToggleFavorite}
            onRename={handleRenameUniverse}
            onRecount={handleRecountUniverse}
            onRemove={handleRemoveUniverse}
            onRemoveDiscovery={handleRemoveDiscovery}
            onClose={() => setShowGallery(false)}
          />
        )}

        {comparison && (
          <ComparisonPanel
            comparison={comparison}
            onSave={handleSaveExperiment}
            onClose={() => setComparison(null)}
          />
        )}

        {treeShown && (
          <TreeOfLifePanel
            tree={selectedFieldGuide!.tree}
            plans={selectedFieldGuide!.plans}
            mindSpecies={selectedFieldGuide!.mindSpecies}
            planetName={selectedFieldGuide!.planetName}
            selectedId={currentLifeView?.lineageId ?? null}
            onSelect={selectLineage}
            onClose={() => setTreeOpen(false)}
          />
        )}

        {/* The encyclopedia and the Great Filter can be open together: the one opened or clicked
            last is drawn last, so it is in front. Keyed, so moving one never remounts it */}
        {(frontOverlay === "filter" ? ["encyclopedia", "filter"] as const : ["filter", "encyclopedia"] as const).map((overlay) =>
          overlay === "filter" ? (showGreatFilter && (
            <div key="filter" className="overlay-slot" onPointerDown={() => setFrontOverlay("filter")}>
              <GreatFilterPanel
                index={surveyIndex}
                stars={populationRef.current?.stars ?? []}
                gate={filterGate}
                onGate={setFilterGate}
                onOpenWorld={openWorld}
                onClose={() => setShowGreatFilter(false)}
                seed={currentSeed}
                surveySeed={(s) => surveyClient.survey(s, universeConfig).then((survey) => survey.index)}
              />
            </div>
          )) : (encyclopediaSubject && (
            <div key="encyclopedia" className="overlay-slot" onPointerDown={() => setFrontOverlay("encyclopedia")}>
              <EncyclopediaPanel
                subject={encyclopediaSubject}
                entryFor={entryFor}
                actions={entryActions}
                onClose={() => setEncyclopediaSubject(null)}
              />
            </div>
          )))}

        {showTimeline && universeTimeline && (
          <TimelinePanel
            timeline={universeTimeline}
            summary={timelineSummary}
            onClose={() => setShowTimeline(false)}
          />
        )}
      </main>

      {/* ── Right dock: whatever is selected ── */}
      <aside className="dock" aria-label="Selection">
        {view === "galaxy" && selectedStar ? (
          <StarPanel
            key={`${currentSeed}-${selectedStar.id}`}
            star={selectedStar}
            galaxySeed={currentSeed}
            onClose={() => setSelectedStar(null)}
            onExplore={handleExploreSystem}
            onSaveDiscovery={handleSaveDiscovery}
            bookmarked={isSelectedStarBookmarked}
            onToggleBookmark={handleToggleBookmark}
            entryView={entryViewOf({ kind: "star", starId: selectedStar.id })}
          />
        ) : view === "system" && selectedPlanet && selectedStar && !selectedBiosphere ? (
          <PlanetPanel
            planet={selectedPlanet}
            star={selectedStar}
            galaxySeed={currentSeed}
            civilization={selectedPlanetCivilization}
            discoveries={discoveries}
            onSaveDiscovery={handleSaveDiscovery}
            world={selectedWorld}
            physics={selectedPhysics}
            orbiting={orbiting}
            onClose={handleExitSystem}
            onBack={orbiting ? leaveOrbit : handleBackToStar}
            onApproach={handleApproach}
            onLeaveOrbit={leaveOrbit}
            onScanBiosphere={handleScanBiosphere}
            entryView={entryViewOf(subjectOf(selectedPlanet, "planet"))}
            onSelectMoon={(moon) => {
              setSelectedPlanet(moon);
              setSelectedBiosphere(null);
              ui.inspect();
            }}
          />
        ) : view === "biosphere" && selectedBiosphere ? (
          <BiospherePanel
            key={selectedPlanet?.key}
            biosphere={selectedBiosphere}
            hasMind={selectedPlanet?.life?.phylogeny.mind != null}
            specimens={selectedFieldGuide?.specimens ?? null}
            selectedLineageId={currentLifeView?.lineageId ?? null}
            onSelectLineage={selectLineage}
            onOpenTree={() => setTreeOpen(true)}
            onBack={handleBackToPlanet}
            onClose={handleExitSystem}
            onScanCivilization={handleScanCivilization}
            entryView={selectedPlanet && entryViewOf(subjectOf(selectedPlanet, "biosphere"))}
          />
        ) : view === "civilization" && selectedCivilization && selectedSpecies ? (
          <CivilizationPanel
            civilization={selectedCivilization}
            species={selectedSpecies}
            onBack={handleBackToBiosphere}
            onClose={handleExitSystem}
            entryView={selectedPlanet && entryViewOf(subjectOf(selectedPlanet, "civilization"))}
          />
        ) : view === "system" && currentSystem && selectedStar ? (
          <SystemPanel
            system={currentSystem}
            star={selectedStar}
            onSelectPlanet={handleSelectPlanetFromTable}
          />
        ) : (
          <div className="dock-empty">
            <p className="dock-empty-title">Nothing selected</p>
            <p className="dock-empty-body">Click a star in the galaxy to inspect it.</p>
          </div>
        )}
      </aside>

      {showPhysics && physicsContext && (
        <PhysicsPage ctx={physicsContext} onClose={() => setShowPhysics(false)} />
      )}

      {/* ── Status bar ── */}
      <footer className="statusbar">
        <span className={isGenerating ? "generating" : undefined} role="status" aria-live="polite">{statusText}</span>
        {storageError && (
          <span className="statusbar-error" role="alert">Database: {storageError}</span>
        )}
        {surveyError && (
          <span className="statusbar-error" role="alert">Life survey failed: {surveyError}</span>
        )}
        <div className="statusbar-right">
          <ScaleBar scale={viewScale} />
          <AudioControls onFirstInteraction={initAudio} />
        </div>
      </footer>
    </div>
  );
}
