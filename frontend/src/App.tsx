import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { audioEngine, ambientLayer, universeKey, systemColour, planetColour, biosphereColour, civilizationColour, discovery, ui, lab } from "./audio";
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
import { BlackHolePanel } from "./ui/BlackHolePanel";
import { centralBlackHoleFor } from "./simulation/blackHole";
import type { CentralBlackHole } from "./simulation/blackHole";
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
import { SystemKey } from "./ui/SystemKey";
import { StarSearchBox } from "./ui/StarSearchBox";
import { surveyFactsOf } from "./ui/starSearch";
import { GreatFilterPanel } from "./ui/GreatFilterPanel";
import { PhysicsPage } from "./ui/PhysicsPage";
import type { GateId } from "./simulation/greatFilter";
import { EncyclopediaPanel, EntryActions, EntryView } from "./ui/EncyclopediaPanel";
import { subjectKey } from "./ui/encyclopedia/subjects";
import { biosphereEntry, civilizationEntry, galaxyEntry, planetEntry, starEntry } from "./ui/encyclopedia/entries";
import type { Entry, SubjectRef } from "./ui/encyclopedia/entry";
import type { UniverseIndex } from "./simulation/universeIndex";
import { bodyName, moonName, starName, planetLifeLabel, lifeMarkerLabel, civilizationMarkerLabel, formatSolarMasses, PLANET_TYPE_LABEL } from "./ui/format";
import { makeUniverseId, generateUniverseSummary, importUniverseFromFile } from "./simulation/persistence";
import type { UniverseMeta, DiscoveryItem } from "./simulation/persistence";
import { makeJournalEntry } from "./simulation/journal";
import type { JournalEntry } from "./simulation/journal";
import * as api from "./api/client";
import { importLocalDataOnce } from "./api/importLocalData";
import { createSurveyClient } from "./workers/surveyClient";
import { createSurveyPool, surveyPoolSize } from "./workers/surveyPool";
import SurveyWorker from "./workers/survey.worker?worker";
import { DrawerHead, DrawerRail } from "./ui/Drawer";
import { initialDrawerOpen, isCompactScreen, rememberDrawerOpen } from "./ui/layout";
import { App as NativeApp } from "@capacitor/app";
import { Capacitor } from "@capacitor/core";
import { setKeepAwake } from "./native/keepAwake";
import "./App.css";

const surveyClient = createSurveyClient(() =>
  createSurveyPool(() => new SurveyWorker(), surveyPoolSize(navigator.hardwareConcurrency)));

function randomSeed(): number {
  return Math.floor(Math.random() * 1_000_000_000);
}

type View = "galaxy" | "system" | "biosphere" | "civilization";

// Whether life and civilization markers are on are per-browser display preferences, not saved data
const LIFE_MARKERS_KEY = "aion-forge-life-markers";
const CIVILIZATION_MARKERS_KEY = "aion-forge-civilization-markers";

function readMarkersPreference(key: string): boolean {
  try { return localStorage.getItem(key) === "on"; } catch { return false; }
}

/** What the dock is showing: it opens by itself whenever this changes. */
function dockSubjectOf(view: View, star: Star | null, planet: Planet | null, blackHole: boolean): string {
  return `${view}|${blackHole ? "black-hole" : star?.id ?? ""}|${planet?.key ?? ""}`;
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
  const [surveyEjected, setSurveyEjected] = useState<number | null>(null);

  const [seed, setSeed]             = useState<number>(() => randomSeed());
  const [inputSeed, setInputSeed]   = useState<string>("");
  const [galaxyType, setGalaxyType] = useState<GalaxyType>("spiral");
  const [starCount, setStarCount]   = useState(0);
  const [isGenerating, setIsGenerating] = useState(false);
  const [surveyProgress, setSurveyProgress] = useState<number | null>(null);   // null when no survey is running
  // Seconds the running survey has taken, shown beside its progress: on a phone
  // the first round of chunks can take a minute before progress moves (M5)
  const [surveySeconds, setSurveySeconds] = useState(0);
  const surveyStartRef = useRef(0);
  const surveying = surveyProgress !== null;
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
  const [centralBlackHole,     setCentralBlackHole]     = useState<CentralBlackHole | null>(null);
  const [blackHoleSelected,    setBlackHoleSelected]    = useState(false);
  const [nearBlackHole,        setNearBlackHole]        = useState(false);   // in its close-up
  const [selectedPlanet,       setSelectedPlanet]       = useState<Planet | null>(null);
  // A moon too small to be a world, picked in the system view or the planet panel: it has no panel of its own,
  // so its planet is selected and the camera focuses the moon. It counts only while its planet stays selected.
  const [selectedSmallMoon,    setSelectedSmallMoon]    = useState<{ planetKey: string; moonIndex: number } | null>(null);
  const smallMoonIndex = selectedSmallMoon && selectedSmallMoon.planetKey === selectedPlanet?.key ? selectedSmallMoon.moonIndex : null;
  const [selectedBiosphere,    setSelectedBiosphere]    = useState<Biosphere | null>(null);
  const [selectedCivilization, setSelectedCivilization] = useState<Civilization | null>(null);
  const [selectedSpecies,      setSelectedSpecies]      = useState<Species | null>(null);
  const [universeTimeline,     setUniverseTimeline]     = useState<UniverseTimeline | null>(null);
  const [timelineSummary,      setTimelineSummary]      = useState<string>("");
  const [showTimeline,         setShowTimeline]         = useState(false);
  const [currentSeed,          setCurrentSeed]          = useState<number>(0);
  const [currentSystem, setCurrentSystem] = useState<PlanetarySystem | null>(null);
  const [viewScale,     setViewScale]     = useState<ViewScale | null>(null);
  const [showLifeMarkers, setShowLifeMarkers] = useState<boolean>(() => readMarkersPreference(LIFE_MARKERS_KEY));
  const [showCivilizationMarkers, setShowCivilizationMarkers] = useState<boolean>(() => readMarkersPreference(CIVILIZATION_MARKERS_KEY));

  // Drawers (M2): the sidebar and the dock each hide down to a rail. A hidden
  // dock stays hidden only while the same thing is selected; selecting something
  // else opens it, so a selection is never made out of sight.
  const [sidebarOpen, setSidebarOpen] = useState(() => initialDrawerOpen("sidebar"));
  const dockSubject = dockSubjectOf(view, selectedStar, selectedPlanet, blackHoleSelected);
  const [dockHiddenOn, setDockHiddenOn] = useState<string | null>(
    () => initialDrawerOpen("dock") ? null : dockSubjectOf("galaxy", null, null, false));
  const dockOpen = dockHiddenOn !== dockSubject;
  const showSidebar = (open: boolean) => { setSidebarOpen(open); rememberDrawerOpen("sidebar", open); };
  const showDock    = (open: boolean) => { setDockHiddenOn(open ? null : dockSubject); rememberDrawerOpen("dock", open); };

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
    setBlackHoleSelected(false);
    setNearBlackHole(false);
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
    setSurveyEjected(null);
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
      const blackHole = centralBlackHoleFor(galaxyCfg);
      setCentralBlackHole(blackHole);
      rendererRef.current?.setCentralBlackHole(blackHole, s, () => {
        setSelectedStar(null);
        setBlackHoleSelected(true);
        ui.inspect();
      });
      rendererRef.current?.renderStars(population, (star) => {
        setSelectedStar(star);
        setBlackHoleSelected(false);
        setSelectedPlanet(null);
        setSelectedBiosphere(null);
        ui.inspect();
        if (star?.isRare) discovery.rareStar();
      });
      setIsGenerating(false);
      ui.universeLoad();
      ambientLayer.setUniverse(universeKey(s, galaxyCfg.type), "galaxy");
      // Survey life off the main thread: it feeds the snapshot and the life and civilization markers
      surveyStartRef.current = performance.now();
      setSurveySeconds(0);
      surveyClient.request(s, config, {
        onProgress: setSurveyProgress,
        onResult: (survey) => {
          setSurveyProgress(null);
          setSurveyIndex(survey.index);
          setSurveyEngulfed(survey.engulfedPlanets);
          setSurveyTooSmall(survey.tooSmallPlanets);
          setSurveyUnstable(survey.unstablePlanets);
          setSurveyEjected(survey.ejectedPlanets);
          cachedSnapshotRef.current = buildSnapshot(s, config, population.stars.length, survey);
          rendererRef.current?.setLifeMarkers(survey.systems.map(life => ({ starId: life.starId, label: lifeMarkerLabel(life) })));
          rendererRef.current?.setCivilizationMarkers(survey.civilizations.map(civ => (
            { starId: civ.starId, label: civilizationMarkerLabel(civ), ruins: civ.living === 0 })));
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

  // While a survey runs: count its seconds, and keep the phone's screen on (M5)
  useEffect(() => {
    setKeepAwake(surveying);
    if (!surveying) return;
    const timer = setInterval(() => setSurveySeconds(Math.round((performance.now() - surveyStartRef.current) / 1000)), 1000);
    return () => clearInterval(timer);
  }, [surveying]);

  useEffect(() => {
    rendererRef.current?.setLifeMarkersVisible(showLifeMarkers);
    try { localStorage.setItem(LIFE_MARKERS_KEY, showLifeMarkers ? "on" : "off"); } catch { /* preference not kept */ }
  }, [showLifeMarkers]);

  useEffect(() => {
    rendererRef.current?.setCivilizationMarkersVisible(showCivilizationMarkers);
    try { localStorage.setItem(CIVILIZATION_MARKERS_KEY, showCivilizationMarkers ? "on" : "off"); } catch { /* preference not kept */ }
  }, [showCivilizationMarkers]);

  /** Closes the topmost tool panel, if one is open. Shared by Escape and the phone's back gesture. */
  const closeTopPanel = useCallback((): boolean => {
    if (showPhysics)      { setShowPhysics(false);      return true; }
    if (encyclopediaSubject) { setEncyclopediaSubject(null); return true; }
    if (showGreatFilter)  { setShowGreatFilter(false);  return true; }
    if (showGallery)      { setShowGallery(false);      return true; }
    if (showConfigPanel)  { setShowConfigPanel(false);  return true; }
    if (showHistoryPanel) { setShowHistoryPanel(false); return true; }
    if (showTimeline)     { setShowTimeline(false);     return true; }
    if (comparison)       { setComparison(null);        return true; }
    return false;
  }, [showPhysics, encyclopediaSubject, showGreatFilter, showGallery, showConfigPanel, showHistoryPanel, showTimeline, comparison]);

  // Global Escape key: close overlays in priority order, then navigate back
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (closeTopPanel()) return;
      if (nearBlackHole)    { leaveBlackHole();           return; }   // up one level: back to the galaxy
      if (orbiting && view === "system") { leaveOrbit(); return; }   // up one level: back to the system
      if (view === "system" && selectedPlanet) { setSelectedPlanet(null); return; }   // off the planet, to the whole system
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [closeTopPanel, nearBlackHole, orbiting, view, selectedPlanet]);

  function approachBlackHole() {
    rendererRef.current?.approachBlackHole();
    setNearBlackHole(true);
  }

  function leaveBlackHole() {
    rendererRef.current?.leaveBlackHole();
    setNearBlackHole(false);
  }

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
    if (!api.STORAGE_ENABLED) return;
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
    ambientLayer.setContext("planet", planetColour(planet.key, planet.surface?.pressureBar ?? null, planet.surface?.oceanFraction ?? 0));
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
    ambientLayer.setContext("system", systemColour(String(star.id), star.temperature, system.planets.length));

    rendererRef.current.renderPlanetarySystem(system, star, (planet, moonIndex) => {
      setSelectedPlanet(planet);
      setSelectedSmallMoon(planet && moonIndex !== undefined ? { planetKey: planet.key, moonIndex } : null);
      setSelectedBiosphere(null);
      ui.inspect();
    }, {
      onPlanetApproach: approachPlanet,
      planetLabels: new Map([
        ...bodies.map((body): [string, string] => {
          const life = planetLifeLabel(biospheres.get(body.key)!);
          const name = `${bodyName(body)} · ${body.moonOrbit ? "moon · " : ""}${PLANET_TYPE_LABEL[body.type]}`;
          return [body.key, life === "—" ? name : `${name} · ${life} life`];
        }),
        // Moons too small to be worlds, by name
        ...system.planets.flatMap((planet) => planet.moons.filter((moon) => !moon.world).map((moon): [string, string] =>
          [moon.key, `${moonName(moon.hostStarId, planet.orbitalIndex, moon.moonIndex)} · moon`])),
      ]),
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
    ambientLayer.setContext("biosphere", biosphereColour(selectedPlanet.key, bio.stage, bio.diversity, bio.extinctAt !== null));
    if (bio.hasLife) discovery.firstLife();
  }, [selectedPlanet, selectedStar]);

  const handleScanCivilization = useCallback(() => {
    if (!selectedBiosphere || !selectedPlanet) return;
    const result = generateCivilization(selectedBiosphere, selectedPlanet, currentSeed);
    if (result.civilization && result.species) {
      setSelectedCivilization(result.civilization);
      setSelectedSpecies(result.species);
      setView("civilization");
      ambientLayer.setContext("civilization", civilizationColour(selectedPlanet.key, result.civilization.techStage));
      if (result.civilization.isRare) discovery.remarkableCivilization();
      else discovery.civilizationMilestone();
    }
  }, [selectedBiosphere, selectedPlanet, currentSeed]);

  // In the system view the camera follows the selected planet, or the star when none is selected
  // (from the view, the table, Escape or the panel's back button); not while in orbit
  useEffect(() => {
    if (view !== "system" || orbiting) return;
    rendererRef.current?.focusPlanet(selectedPlanet, smallMoonIndex);
  }, [selectedPlanet, smallMoonIndex, view, orbiting]);

  function leaveOrbit() {
    setOrbiting(false);
    rendererRef.current?.leavePlanetView();
    ui.back();
    ambientLayer.setContext("system");
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
    return { config: { ...universeConfig, seed: currentSeed }, galaxy, stars: population.stars, index: surveyIndex, engulfedPlanets: surveyEngulfed, tooSmallPlanets: surveyTooSmall, unstablePlanets: surveyUnstable, ejectedPlanets: surveyEjected };
  }, [universeConfig, currentSeed, surveyIndex, surveyEngulfed, surveyTooSmall, surveyUnstable, surveyEjected, showPhysics]);

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
  };

  const handleBackToPlanet = () => {
    setSelectedBiosphere(null);
    setSelectedCivilization(null);
    setSelectedSpecies(null);
    setView("system");
    ui.back();
    ambientLayer.setContext(orbiting ? "planet" : "system");
  };

  const handleBackToBiosphere = () => {
    setSelectedCivilization(null);
    setSelectedSpecies(null);
    setView("biosphere");
    ui.back();
    ambientLayer.setContext("biosphere");
  };

  const handleBackToStar = () => {
    if (orbiting) leaveOrbit();
    setSelectedPlanet(null);
    setSelectedBiosphere(null);
    setSelectedCivilization(null);
    setSelectedSpecies(null);
  };

  /**
   * The phone's back gesture (M4): one step back, from the top. Closes the tree
   * of life or a tool panel, then an open Universe drawer, then walks back up
   * out of the black hole's close-up, civilization → biosphere → planet (out of
   * orbit) → system → galaxy → no selection.
   * Returns false when there is nothing left to go back from.
   */
  const stepBack = (): boolean => {
    if (treeShown)                               { setTreeOpen(false);         return true; }
    if (closeTopPanel())                                                        return true;
    if (sidebarOpen && isCompactScreen())        { showSidebar(false);         return true; }
    if (nearBlackHole)                           { leaveBlackHole();           return true; }
    if (view === "civilization")                 { handleBackToBiosphere();    return true; }
    if (view === "biosphere")                    { handleBackToPlanet();       return true; }
    if (orbiting)                                { leaveOrbit();               return true; }
    if (view === "system" && selectedPlanet)     { handleBackToStar();         return true; }
    if (view === "system")                       { handleExitSystem();         return true; }
    if (blackHoleSelected)                       { setBlackHoleSelected(false); return true; }
    if (selectedStar)                            { setSelectedStar(null);      return true; }
    return false;
  };

  // In the phone app, back steps back; with nothing left, it leaves the app.
  // The listener is added once and always calls the latest stepBack.
  const stepBackRef = useRef(stepBack);
  useEffect(() => { stepBackRef.current = stepBack; });
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    const listener = NativeApp.addListener("backButton", () => {
      if (!stepBackRef.current()) void NativeApp.exitApp();
    });
    return () => { void listener.then((handle) => handle.remove()); };
  }, []);

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
    else         { ui.panelClose(); ambientLayer.setContext(view === "civilization" ? "civilization" : view === "biosphere" ? "biosphere" : view === "system" ? (orbiting ? "planet" : "system") : "galaxy"); }
  };

  let statusText = "Ready";
  if (isGenerating)                                                          statusText = "Generating…";
  else if (surveyProgress !== null)                                         statusText = `Surveying life… ${Math.round(surveyProgress * 100)}% · ${surveySeconds} s`;
  else if (nearBlackHole)                                                    statusText = "Drag to circle the black hole; scroll to come closer";
  else if (view === "galaxy" && !selectedStar)                              statusText = "Select a star to inspect it";
  else if (view === "galaxy" && selectedStar)                               statusText = "Open the system to see its planets";
  else if (view === "system" && orbiting)                                   statusText = "Drag to look around the planet; scroll to change altitude";
  else if (view === "system" && !selectedPlanet)                            statusText = "Select a planet to inspect it";
  else if (view === "system" && selectedPlanet)                             statusText = "Scan the biosphere to check for life";
  else if (view === "biosphere" && selectedBiosphere?.hasLife)              statusText = "Check whether a civilization has emerged";

  const starLabel = selectedStar ? starName(selectedStar.id) : null;
  const planetLabel = selectedPlanet ? bodyName(selectedPlanet) : null;

  // The star search (sidebar): what the life survey knows per star, and showing the star picked
  const starFacts = useMemo(() => (surveyIndex ? surveyFactsOf(surveyIndex) : null), [surveyIndex]);
  const handleFindStar = (star: Star) => {
    if (view !== "galaxy") handleExitSystem();
    rendererRef.current?.showStar(star);
  };

  const handleSelectPlanetFromTable = (planet: Planet) => {
    setSelectedPlanet(planet);
    setSelectedSmallMoon(null);
    setSelectedBiosphere(null);
    ui.inspect();
  };

  return (
    <div className={`app${sidebarOpen ? "" : " sidebar-closed"}${dockOpen ? "" : " dock-closed"}`}>

      {/* ── Top bar: identity, location, seed ── */}
      <header className="topbar">
        <span className="topbar-brand">Aion Forge</span>
        <nav className="breadcrumb" aria-label="Location">
          <span className="breadcrumb-id">{universeId ?? "——————"}</span>
          <span className="breadcrumb-sep" aria-hidden="true">/</span>
          {view === "galaxy" && !nearBlackHole
            ? <span className="breadcrumb-current">Galaxy</span>
            : <button className="breadcrumb-link" onClick={nearBlackHole ? leaveBlackHole : handleExitSystem}>Galaxy</button>}
          {nearBlackHole && (
            <>
              <span className="breadcrumb-sep" aria-hidden="true">/</span>
              <span className="breadcrumb-current">Black hole</span>
            </>
          )}
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
        {!sidebarOpen && <DrawerRail title="Universe" side="left" onShow={() => showSidebar(true)} />}
        <div className="drawer-body" hidden={!sidebarOpen}>
          <DrawerHead title="Universe" side="left" onHide={() => showSidebar(false)} />
          <section className="console-section">
            <dl className="kv">
              <dt>Morphology</dt><dd className="kv-text">{universeId ? galaxyType : "—"}</dd>
              <dt>Stars</dt><dd>{universeId ? starCount.toLocaleString() : "—"}</dd>
              <dt>Particles</dt><dd>{GALAXY_PARTICLE_COUNT.toLocaleString()}</dd>
              <dt>Black hole</dt><dd>{universeId ? (centralBlackHole ? formatSolarMasses(centralBlackHole.massSolar) : "None") : "—"}</dd>
            </dl>
          </section>

          <section className="console-section">
            <h2 className="console-section-label">Find a star</h2>
            <StarSearchBox stars={populationRef.current?.stars ?? []} facts={starFacts} onPick={handleFindStar} />
          </section>

          <section className="console-section">
            <h2 className="console-section-label">Overlays</h2>
            <div className="switch-list">
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
              <button
                type="button"
                className="switch switch-civ"
                role="switch switch-civ"
                aria-checked={showCivilizationMarkers}
                onClick={() => setShowCivilizationMarkers(on => !on)}
                title="Mark every star system where a civilization arose, living or in ruins"
              >
                <span className="switch-track" aria-hidden="true"><span className="switch-thumb" /></span>
                Civilization markers
              </button>
            </div>
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
              {api.STORAGE_ENABLED && (
                <button className="btn" onClick={toggleHistoryPanel} aria-pressed={showHistoryPanel}>
                  {showHistoryPanel ? "Close log" : "Experiment log"}
                </button>
              )}
            </div>
          </section>

          {api.STORAGE_ENABLED && <section className="console-section">
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
          </section>}

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
        </div>
      </aside>

      {/* ── Stage: the rendered universe, with tool panels floating over it ── */}
      <main className="stage">
        <canvas ref={canvasRef} className="viewport" />
        {viewScale?.mode === "system" && currentSystem && selectedStar && <SystemKey system={currentSystem} star={selectedStar} scale={viewScale} />}

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
            onSave={api.STORAGE_ENABLED ? handleSaveExperiment : undefined}
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
        {!dockOpen && <DrawerRail title="Selection" side="right" onShow={() => showDock(true)} />}
        <div className="drawer-body" hidden={!dockOpen}>
          <DrawerHead title="Selection" side="right" onHide={() => showDock(false)} />
          {view === "galaxy" && blackHoleSelected && centralBlackHole ? (
            <BlackHolePanel
              blackHole={centralBlackHole}
              near={nearBlackHole}
              onApproach={approachBlackHole}
              onLeave={leaveBlackHole}
              onClose={() => { leaveBlackHole(); setBlackHoleSelected(false); }}
            />
          ) : view === "galaxy" && selectedStar ? (
            <StarPanel
              key={`${currentSeed}-${selectedStar.id}`}
              star={selectedStar}
              galaxySeed={currentSeed}
              onClose={() => setSelectedStar(null)}
              onExplore={handleExploreSystem}
              onSaveDiscovery={api.STORAGE_ENABLED ? handleSaveDiscovery : undefined}
              bookmarked={isSelectedStarBookmarked}
              onToggleBookmark={api.STORAGE_ENABLED ? handleToggleBookmark : undefined}
              entryView={entryViewOf({ kind: "star", starId: selectedStar.id })}
            />
          ) : view === "system" && selectedPlanet && selectedStar && !selectedBiosphere ? (
            <PlanetPanel
              planet={selectedPlanet}
              star={selectedStar}
              galaxySeed={currentSeed}
              civilization={selectedPlanetCivilization}
              discoveries={discoveries}
              onSaveDiscovery={api.STORAGE_ENABLED ? handleSaveDiscovery : undefined}
              world={selectedWorld}
              physics={selectedPhysics}
              orbiting={orbiting}
              onClose={handleExitSystem}
              onBack={orbiting ? leaveOrbit : handleBackToStar}
              onApproach={handleApproach}
              onLeaveOrbit={leaveOrbit}
              onScanBiosphere={handleScanBiosphere}
              entryView={entryViewOf(subjectOf(selectedPlanet, "planet"))}
              selectedMoonIndex={smallMoonIndex}
              onSelectSmallMoon={(moonIndex) => setSelectedSmallMoon(moonIndex === null ? null : { planetKey: selectedPlanet.key, moonIndex })}
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
        </div>
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
          {/* In the system view the scale sits in the view's key */}
          {viewScale?.mode !== "system" && <ScaleBar scale={viewScale} />}
          <AudioControls onFirstInteraction={initAudio} />
        </div>
      </footer>
    </div>
  );
}
