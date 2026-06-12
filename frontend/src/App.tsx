import { useEffect, useRef, useState, useCallback } from "react";
import { audioEngine, ambientLayer, discovery, ui, lab, timeline as tlAudio, civLayer } from "./audio";
import { AudioControls } from "./ui/AudioControls";
import { UniverseRenderer } from "./rendering/UniverseRenderer";
import { generateGalaxy, pickGalaxyType } from "./simulation/galaxy";
import type { GalaxyType, GalaxyConfig, GalaxyParticles } from "./simulation/galaxy";
import { createRNG } from "./simulation/rng";
import { generateStarsFor } from "./simulation/star";
import type { Star, StellarPopulation } from "./simulation/star";
import { generatePlanetsFor } from "./simulation/planet";
import type { Planet, PlanetarySystem } from "./simulation/planet";
import { generateBiosphere } from "./simulation/biosphere";
import type { Biosphere } from "./simulation/biosphere";
import { generateCivilization } from "./simulation/civilization";
import type { Civilization, Species } from "./simulation/civilization";
import { buildUniverseTimeline, summarizeTimeline } from "./simulation/history";
import type { UniverseTimeline } from "./simulation/history";
import { makeConfig, DEFAULT_CONFIG } from "./simulation/config";
import type { UniverseConfig } from "./simulation/config";
import { compareUniverses, makeExperimentRecord, saveExperiment, loadExperiments } from "./simulation/experiment";
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
import {
  makeUniverseId, generateUniverseSummary,
  saveToGallery, loadGallery, importUniverseFromFile,
  saveDiscovery, loadDiscoveries,
} from "./simulation/persistence";
import type { UniverseMeta, DiscoveryItem } from "./simulation/persistence";
import "./App.css";

const PARTICLE_COUNT = 60000;
const SCALE = 120;

function randomSeed(): number {
  return Math.floor(Math.random() * 1_000_000_000);
}

function buildGalaxyConfig(seed: number, universeConfig: UniverseConfig): GalaxyConfig {
  const rng = createRNG(seed);
  const type = pickGalaxyType(rng);
  // expansionRate scales the galaxy spread
  return { type, particleCount: PARTICLE_COUNT, seed, scale: SCALE * universeConfig.expansionRate };
}

type View = "galaxy" | "system" | "biosphere" | "civilization";

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
  const [isGenerating, setIsGenerating] = useState(false);
  const [view, setView]             = useState<View>("galaxy");

  // Universe config (laws of reality)
  const [universeConfig, setUniverseConfig] = useState<UniverseConfig>(() => makeConfig(0));
  const [showConfigPanel,   setShowConfigPanel]   = useState(false);
  const [showHistoryPanel,  setShowHistoryPanel]  = useState(false);
  const [baselineSnapshot,  setBaselineSnapshot]  = useState<UniverseSnapshot | null>(null);
  const [comparison,        setComparison]        = useState<UniverseComparison | null>(null);
  const [experiments,       setExperiments]       = useState<ExperimentRecord[]>(() => loadExperiments());
  const [gallery,           setGallery]           = useState<UniverseMeta[]>(() => loadGallery());
  const [discoveries,       setDiscoveries]       = useState<DiscoveryItem[]>(() => loadDiscoveries());
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
  const [, setCurrentSystem] = useState<PlanetarySystem | null>(null);

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
    rendererRef.current?.exitSystemView();

    requestAnimationFrame(() => {
      const galaxyCfg  = buildGalaxyConfig(s, config);
      const particles  = generateGalaxy(galaxyCfg);
      const population = generateStarsFor(galaxyCfg, 13.7, config);
      galaxyRef.current     = particles;
      populationRef.current = population;
      setGalaxyType(galaxyCfg.type);
      setCurrentSeed(s);
      rendererRef.current?.renderGalaxy(particles);
      rendererRef.current?.renderStars(population, (star) => {
        setSelectedStar(star);
        setSelectedPlanet(null);
        setSelectedBiosphere(null);
        ui.inspect();
        if (star.isRare) discovery.rareStar();
      });
      setIsGenerating(false);
      ui.universeLoad();
      ambientLayer.setContext("galaxy");
      // Pre-compute snapshot in idle time so button clicks are instant
      setTimeout(() => {
        cachedSnapshotRef.current = buildSnapshot(s, config, population);
      }, 0);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [universeConfig]);

  useEffect(() => {
    if (!canvasRef.current) return;
    const renderer = new UniverseRenderer(canvasRef.current);
    rendererRef.current = renderer;
    generate(seed);
    return () => renderer.dispose();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  // Build a snapshot of the current universe state for comparison
  function buildSnapshot(s: number, cfg: UniverseConfig, pop: StellarPopulation): UniverseSnapshot {
    let lifePlanets = 0;
    let civCount    = 0;
    let totalPlanets = 0;

    for (const star of pop.stars) {
      const system = generatePlanetsFor(star, s, cfg);
      totalPlanets += system.planets.length;
      for (const planet of system.planets) {
        const bio = generateBiosphere(planet, star, s, cfg);
        if (bio.hasLife) {
          lifePlanets++;
          const civResult = generateCivilization(bio, planet, s, cfg);
          if (civResult.civilization) civCount++;
        }
      }
    }

    return {
      seed: s,
      config: cfg,
      starCount: pop.stars.length,
      lifeBearingPlanets: lifePlanets,
      civilizationCount: civCount,
      legendaryEvents: 0,   // filled in if timeline was built
      totalPlanets,
    };
  }

  const handleSetBaseline = useCallback(() => {
    if (!populationRef.current) return;
    const snap = cachedSnapshotRef.current ?? buildSnapshot(currentSeed, universeConfig, populationRef.current);
    cachedSnapshotRef.current = snap;
    snapshotRef.current = snap;
    setBaselineSnapshot(snap);
    ui.baseline();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentSeed, universeConfig]);

  const handleCompare = useCallback(() => {
    if (!baselineSnapshot || !populationRef.current) return;
    lab.compareBegin();
    const expSnap = cachedSnapshotRef.current ?? buildSnapshot(currentSeed, universeConfig, populationRef.current);
    cachedSnapshotRef.current = expSnap;
    const cmp = compareUniverses(baselineSnapshot, expSnap);
    setComparison(cmp);
    lab.compareReveal();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [baselineSnapshot, currentSeed, universeConfig]);

  const handleSaveExperiment = useCallback(() => {
    if (!comparison) return;
    const record = makeExperimentRecord(comparison);
    saveExperiment(record);
    setExperiments(loadExperiments());
    setComparison(null);
  }, [comparison]);

  const refreshGallery = useCallback(() => {
    setGallery(loadGallery());
    setDiscoveries(loadDiscoveries());
  }, []);

  const handleSaveToGallery = useCallback(() => {
    if (!populationRef.current) return;
    ui.save();
    const snap = cachedSnapshotRef.current ?? buildSnapshot(currentSeed, universeConfig, populationRef.current);
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
      notes: "",
      isFavorite: false,
    };
    saveToGallery(meta);
    refreshGallery();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentSeed, universeConfig, galaxyType, refreshGallery]);

  const handleLoadFromGallery = useCallback((meta: UniverseMeta) => {
    setUniverseConfig(meta.config);
    setSeed(meta.seed);
    setShowGallery(false);
    ui.restore();
    generate(meta.seed, meta.config);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [generate]);

  const handleImport = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const meta = await importUniverseFromFile(file);
    if (meta) {
      saveToGallery(meta);
      refreshGallery();
    }
    e.target.value = "";
  }, [refreshGallery]);

  const handleSaveDiscovery = useCallback((item: DiscoveryItem) => {
    saveDiscovery(item);
    refreshGallery();
  }, [refreshGallery]);

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

  return (
    <div className="app">
      <canvas ref={canvasRef} className="viewport" />

      <div className="hud">

        {/* ── Observatory identity header ── */}
        <div className="obs-header">
          <div className="obs-instrument-name">Aion Forge</div>
          <div className={`obs-universe-id${isGenerating && !universeId ? " generating" : ""}`}>
            {universeId ?? "——————————"}
          </div>
          <div className="obs-universe-meta">
            {universeId && (
              <span className="obs-meta-chip">{galaxyType}</span>
            )}
            {universeId && (
              <span className="obs-meta-chip">{PARTICLE_COUNT.toLocaleString()} particles</span>
            )}
            {!isDefaultConfig && (
              <span className="obs-meta-chip modified">Laws Modified</span>
            )}
          </div>
        </div>

        {/* ── Galaxy view controls ── */}
        {view === "galaxy" && (
          <>
            <div className="console-section">
              <div className="console-section-label">Observe</div>
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
                <button className="btn" type="submit" disabled={isGenerating} onClick={initAudio}>ENTER</button>
              </form>
              <div className="controls" style={{ marginTop: 4 }}>
                <button className="btn primary" onClick={() => { initAudio(); handleRandomize(); }} disabled={isGenerating}>FORGE RANDOM</button>
                <button className="btn" onClick={() => { initAudio(); handleRegenerate(); }} disabled={isGenerating}>REFORGE</button>
              </div>
            </div>

            <div className="console-section">
              <div className="console-section-label">Reality</div>
              <div className="controls">
                <button className="btn" onClick={() => {
                  initAudio();
                  const opening = !showConfigPanel;
                  setShowConfigPanel((v) => !v); setShowHistoryPanel(false); setShowGallery(false);
                  if (opening) { ui.panelOpen(); ambientLayer.setContext("laboratory"); }
                  else         { ui.panelClose(); ambientLayer.setContext("galaxy"); }
                }}>
                  {showConfigPanel ? "CLOSE LAWS" : "LAWS OF REALITY"}
                </button>
                <button className="btn" onClick={() => {
                  initAudio();
                  const opening = !showHistoryPanel;
                  setShowHistoryPanel((v) => !v); setShowConfigPanel(false); setShowGallery(false);
                  opening ? ui.panelOpen() : ui.panelClose();
                }}>
                  {showHistoryPanel ? "CLOSE LOG" : "EXPERIMENT LOG"}
                </button>
              </div>
            </div>

            <div className="console-section">
              <div className="console-section-label">Archive</div>
              <div className="controls">
                <button className="btn primary" onClick={handleSaveToGallery} disabled={isGenerating} title="Archive this universe">
                  ARCHIVE REALITY
                </button>
                <button className="btn" onClick={() => {
                  initAudio();
                  const opening = !showGallery;
                  setShowGallery((v) => !v); setShowConfigPanel(false); setShowHistoryPanel(false);
                  opening ? ui.panelOpen() : ui.panelClose();
                }}>
                  {showGallery ? "CLOSE LIBRARY" : `LIBRARY (${gallery.length})`}
                </button>
              </div>
              <label className="import-zone" style={{ marginTop: 4 }}>
                RESTORE UNIVERSE
                <input type="file" accept=".json" style={{ display: "none" }} onChange={handleImport} />
              </label>
            </div>

            <div className="console-section">
              <div className="console-section-label">Compare</div>
              {baselineSnapshot ? (
                <div className="controls">
                  <button className="btn primary" onClick={handleCompare} disabled={isGenerating}>COMPARE REALITIES</button>
                  <span className="hint" style={{ alignSelf: "center" }}>baseline set</span>
                </div>
              ) : (
                <button className="btn" onClick={handleSetBaseline} disabled={isGenerating} title="Establish current universe as comparison baseline">
                  ESTABLISH BASELINE
                </button>
              )}
            </div>
          </>
        )}

        {/* ── System / biosphere / civilization view ── */}
        {view !== "galaxy" && (
          <div className="nav-strip">
            <button className="btn" onClick={handleExitSystem}>← OBSERVATORY</button>
            {universeTimeline && (
              <button className="btn timeline-open-btn" onClick={() => {
                initAudio();
                const opening = !showTimeline;
                setShowTimeline((v) => !v);
                if (opening) { ui.panelOpen(); ambientLayer.setContext("timeline"); }
                else         { ui.panelClose(); ambientLayer.setContext(view === "civilization" ? "civilization" : view === "biosphere" ? "biosphere" : "system"); }
              }}>
                {showTimeline ? "CLOSE CHRONICLES" : "CHRONICLES"}
              </button>
            )}
          </div>
        )}

        {/* ── Status / hints ── */}
        <div className="console-section">
          {isGenerating && <div className="generating" role="status" aria-live="polite">Forging reality…</div>}
          {!isGenerating && view === "galaxy" && !selectedStar     && <div className="hint">Select a star to begin observation</div>}
          {view === "galaxy" && selectedStar                        && <div className="hint">Enter the system to explore its worlds</div>}
          {view === "system" && !selectedPlanet                     && <div className="hint">Select a world to analyze it</div>}
          {view === "system" && selectedPlanet && !selectedBiosphere && <div className="hint">Analyze the biosphere to search for life</div>}
          {view === "biosphere" && selectedBiosphere?.hasLife && !selectedCivilization && <div className="hint">Analyze civilization if intelligence emerged</div>}
        </div>

        <AudioControls onFirstInteraction={initAudio} />

      </div>

      {/* Reality config panel */}
      {showConfigPanel && (
        <RealityConfigPanel
          config={universeConfig}
          onChange={handleApplyConfig}
          onClose={() => setShowConfigPanel(false)}
        />
      )}

      {/* Experiment history */}
      {showHistoryPanel && (
        <ExperimentHistoryPanel
          experiments={experiments}
          onClose={() => setShowHistoryPanel(false)}
        />
      )}

      {/* Universe gallery */}
      {showGallery && (
        <GalleryPanel
          gallery={gallery}
          discoveries={discoveries}
          onLoad={handleLoadFromGallery}
          onGalleryChange={refreshGallery}
          onClose={() => setShowGallery(false)}
        />
      )}

      {/* Comparison results */}
      {comparison && (
        <ComparisonPanel
          comparison={comparison}
          onSave={handleSaveExperiment}
          onClose={() => setComparison(null)}
        />
      )}

      {view === "galaxy" && selectedStar && (
        <StarPanel
          star={selectedStar}
          galaxySeed={currentSeed}
          onClose={() => setSelectedStar(null)}
          onExplore={handleExploreSystem}
          onSaveDiscovery={handleSaveDiscovery}
        />
      )}

      {view === "system" && selectedPlanet && !selectedBiosphere && (
        <PlanetPanel
          planet={selectedPlanet}
          onClose={handleExitSystem}
          onBack={handleBackToStar}
          onScanBiosphere={handleScanBiosphere}
        />
      )}

      {view === "biosphere" && selectedBiosphere && (
        <BiospherePanel
          biosphere={selectedBiosphere}
          onBack={handleBackToPlanet}
          onClose={handleExitSystem}
          onScanCivilization={handleScanCivilization}
        />
      )}

      {view === "civilization" && selectedCivilization && selectedSpecies && (
        <CivilizationPanel
          civilization={selectedCivilization}
          species={selectedSpecies}
          onBack={handleBackToBiosphere}
          onClose={handleExitSystem}
        />
      )}

      {showTimeline && universeTimeline && (
        <TimelinePanel
          timeline={universeTimeline}
          summary={timelineSummary}
          onClose={() => setShowTimeline(false)}
        />
      )}
    </div>
  );
}
