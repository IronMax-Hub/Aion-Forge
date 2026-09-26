import { useEffect, useRef, useState, useCallback } from "react";
import { audioEngine, ambientLayer, discovery, ui, lab, civLayer } from "./audio";
import { AudioControls } from "./ui/AudioControls";
import { UniverseRenderer } from "./rendering/UniverseRenderer";
import type { ViewScale } from "./rendering/UniverseRenderer";
import { generateGalaxy, buildGalaxyConfig, GALAXY_PARTICLE_COUNT } from "./simulation/galaxy";
import type { GalaxyType, GalaxyParticles } from "./simulation/galaxy";
import { generateStarsFor, UNIVERSE_AGE_GYR } from "./simulation/star";
import type { Star, StellarPopulation } from "./simulation/star";
import { generatePlanetsFor } from "./simulation/planet";
import type { Planet, PlanetarySystem } from "./simulation/planet";
import { generateBiosphere } from "./simulation/biosphere";
import type { Biosphere } from "./simulation/biosphere";
import { generateCivilization } from "./simulation/civilization";
import type { Civilization, Species } from "./simulation/civilization";
import { surveyLife } from "./simulation/lifeSurvey";
import { buildUniverseTimeline, summarizeTimeline } from "./simulation/history";
import type { UniverseTimeline } from "./simulation/history";
import { makeConfig, DEFAULT_CONFIG, CONFIG_LABELS } from "./simulation/config";
import type { UniverseConfig } from "./simulation/config";
import { compareUniverses, makeExperimentRecord, buildSnapshot, measureUniverse } from "./simulation/experiment";
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
import { ScaleBar } from "./ui/ScaleBar";
import { starName, planetName, lifeMarkerLabel } from "./ui/format";
import { makeUniverseId, generateUniverseSummary, importUniverseFromFile } from "./simulation/persistence";
import type { UniverseMeta, DiscoveryItem } from "./simulation/persistence";
import { makeJournalEntry } from "./simulation/journal";
import type { JournalEntry } from "./simulation/journal";
import * as api from "./api/client";
import { importLocalDataOnce } from "./api/importLocalData";
import { createSurveyClient } from "./workers/surveyClient";
import SurveyWorker from "./workers/survey.worker?worker";
import "./App.css";

const surveyClient = createSurveyClient(() => new SurveyWorker());

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

export default function App() {
  const canvasRef          = useRef<HTMLCanvasElement>(null);
  const rendererRef        = useRef<UniverseRenderer | null>(null);
  const galaxyRef          = useRef<GalaxyParticles | null>(null);
  const populationRef      = useRef<StellarPopulation | null>(null);
  const snapshotRef        = useRef<UniverseSnapshot | null>(null);
  const cachedSnapshotRef  = useRef<UniverseSnapshot | null>(null);
  const systemBiosphereRef = useRef<Map<number, Biosphere>>(new Map());

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
    cachedSnapshotRef.current = null;
    setSurveyError(null);
    rendererRef.current?.exitSystemView();

    requestAnimationFrame(() => {
      const galaxyCfg  = buildGalaxyConfig(s, config);
      const particles  = generateGalaxy(galaxyCfg);
      const population = generateStarsFor(galaxyCfg, UNIVERSE_AGE_GYR, config);
      galaxyRef.current     = particles;
      populationRef.current = population;
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
      if (showGallery)      { setShowGallery(false);      return; }
      if (showConfigPanel)  { setShowConfigPanel(false);  return; }
      if (showHistoryPanel) { setShowHistoryPanel(false); return; }
      if (showTimeline)     { setShowTimeline(false);     return; }
      if (comparison)       { setComparison(null);        return; }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [showGallery, showConfigPanel, showHistoryPanel, showTimeline, comparison]);

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
    const snap = measureUniverse(meta.seed, meta.config);
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

  const handleExploreSystem = useCallback(() => {
    if (!selectedStar || !rendererRef.current) return;
    const system = generatePlanetsFor(selectedStar, currentSeed, universeConfig);

    const biospheres = new Map<number, Biosphere>();
    for (const planet of system.planets) {
      const bio = generateBiosphere(planet, selectedStar, currentSeed, universeConfig);
      biospheres.set(planet.id, bio);
    }
    systemBiosphereRef.current = biospheres;

    if (galaxyRef.current && populationRef.current) {
      const systemEntries = system.planets.map((planet) => {
        const bio = biospheres.get(planet.id)!;
        const civResult = generateCivilization(bio, planet, currentSeed, universeConfig);
        return {
          planet, star: selectedStar, bio,
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

    rendererRef.current.renderPlanetarySystem(system, selectedStar, (planet) => {
      setSelectedPlanet(planet);
      setSelectedBiosphere(null);
      ui.inspect();
    }, biospheres);
  }, [selectedStar, currentSeed, universeConfig]);

  const handleScanBiosphere = useCallback(() => {
    if (!selectedPlanet || !selectedStar) return;
    const bio = systemBiosphereRef.current.get(selectedPlanet.id)
      ?? generateBiosphere(selectedPlanet, selectedStar, currentSeed, universeConfig);
    setSelectedBiosphere(bio);
    setSelectedCivilization(null);
    setSelectedSpecies(null);
    setView("biosphere");
    ambientLayer.setContext("biosphere");
    if (bio.hasLife) discovery.firstLife();
  }, [selectedPlanet, selectedStar, currentSeed, universeConfig]);

  const handleScanCivilization = useCallback(() => {
    if (!selectedBiosphere || !selectedPlanet) return;
    const result = generateCivilization(selectedBiosphere, selectedPlanet, currentSeed, universeConfig);
    if (result.civilization && result.species) {
      setSelectedCivilization(result.civilization);
      setSelectedSpecies(result.species);
      setView("civilization");
      ambientLayer.setContext("civilization");
      civLayer.activate(result.civilization.techStage);
      if (result.civilization.isRare) discovery.remarkableCivilization();
      else discovery.civilizationMilestone();
    }
  }, [selectedBiosphere, selectedPlanet, currentSeed, universeConfig]);

  const handleExitSystem = () => {
    setView("galaxy");
    setSelectedPlanet(null);
    setSelectedBiosphere(null);
    setSelectedCivilization(null);
    setSelectedSpecies(null);
    setShowTimeline(false);
    setCurrentSystem(null);
    systemBiosphereRef.current = new Map();
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
  else if (view === "system" && !selectedPlanet)                            statusText = "Select a planet to inspect it";
  else if (view === "system" && selectedPlanet)                             statusText = "Scan the biosphere to check for life";
  else if (view === "biosphere" && selectedBiosphere?.hasLife)              statusText = "Check whether a civilization has emerged";

  const starLabel = selectedStar ? starName(selectedStar.id) : null;
  const planetLabel = selectedPlanet ? planetName(selectedPlanet.hostStarId, selectedPlanet.orbitalIndex) : null;

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
              {view === "biosphere" || view === "civilization"
                ? <button className="breadcrumb-link" onClick={handleBackToPlanet}>{planetLabel}</button>
                : <span className="breadcrumb-current">{planetLabel}</span>}
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
          />
        ) : view === "system" && selectedPlanet && !selectedBiosphere ? (
          <PlanetPanel
            planet={selectedPlanet}
            onClose={handleExitSystem}
            onBack={handleBackToStar}
            onScanBiosphere={handleScanBiosphere}
          />
        ) : view === "biosphere" && selectedBiosphere ? (
          <BiospherePanel
            biosphere={selectedBiosphere}
            onBack={handleBackToPlanet}
            onClose={handleExitSystem}
            onScanCivilization={handleScanCivilization}
          />
        ) : view === "civilization" && selectedCivilization && selectedSpecies ? (
          <CivilizationPanel
            civilization={selectedCivilization}
            species={selectedSpecies}
            onBack={handleBackToBiosphere}
            onClose={handleExitSystem}
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
