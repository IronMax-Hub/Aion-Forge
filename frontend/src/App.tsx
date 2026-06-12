import { useEffect, useRef, useState, useCallback } from "react";
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
  const canvasRef     = useRef<HTMLCanvasElement>(null);
  const rendererRef   = useRef<UniverseRenderer | null>(null);
  const galaxyRef     = useRef<GalaxyParticles | null>(null);
  const populationRef = useRef<StellarPopulation | null>(null);
  const snapshotRef   = useRef<UniverseSnapshot | null>(null);

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
      });
      setIsGenerating(false);
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
    const snap = buildSnapshot(currentSeed, universeConfig, populationRef.current);
    snapshotRef.current = snap;
    setBaselineSnapshot(snap);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentSeed, universeConfig]);

  const handleCompare = useCallback(() => {
    if (!baselineSnapshot || !populationRef.current) return;
    const expSnap = buildSnapshot(currentSeed, universeConfig, populationRef.current);
    const cmp = compareUniverses(baselineSnapshot, expSnap);
    setComparison(cmp);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [baselineSnapshot, currentSeed, universeConfig]);

  const handleSaveExperiment = useCallback(() => {
    if (!comparison) return;
    const record = makeExperimentRecord(comparison);
    saveExperiment(record);
    setExperiments(loadExperiments());
    setComparison(null);
  }, [comparison]);

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

    rendererRef.current.renderPlanetarySystem(system, selectedStar, (planet) => {
      setSelectedPlanet(planet);
      setSelectedBiosphere(null);
    }, biospheres);
  }, [selectedStar, currentSeed, universeConfig]);

  const handleScanBiosphere = useCallback(() => {
    if (!selectedPlanet || !selectedStar) return;
    const bio = generateBiosphere(selectedPlanet, selectedStar, currentSeed, universeConfig);
    setSelectedBiosphere(bio);
    setSelectedCivilization(null);
    setSelectedSpecies(null);
    setView("biosphere");
  }, [selectedPlanet, selectedStar, currentSeed, universeConfig]);

  const handleScanCivilization = useCallback(() => {
    if (!selectedBiosphere || !selectedPlanet) return;
    const result = generateCivilization(selectedBiosphere, selectedPlanet, currentSeed, universeConfig);
    if (result.civilization && result.species) {
      setSelectedCivilization(result.civilization);
      setSelectedSpecies(result.species);
      setView("civilization");
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
    rendererRef.current?.exitSystemView();
  };

  const handleBackToPlanet = () => {
    setSelectedBiosphere(null);
    setSelectedCivilization(null);
    setSelectedSpecies(null);
    setView("system");
  };

  const handleBackToBiosphere = () => {
    setSelectedCivilization(null);
    setSelectedSpecies(null);
    setView("biosphere");
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

  return (
    <div className="app">
      <canvas ref={canvasRef} className="viewport" />

      <div className="hud">
        <div className="hud-title">AION FORGE</div>

        <div className="meta">
          <span className="meta-label">SEED</span>
          <span className="meta-value">{seed}</span>
          <span className="meta-label">TYPE</span>
          <span className="meta-value type">{galaxyType.toUpperCase()}</span>
          <span className="meta-label">PARTICLES</span>
          <span className="meta-value">{PARTICLE_COUNT.toLocaleString()}</span>
          <span className="meta-label">STARS</span>
          <span className="meta-value">2,000</span>
          {!isDefaultConfig && (
            <>
              <span className="meta-label">LAWS</span>
              <span className="meta-value" style={{ color: "rgba(255,180,60,0.8)" }}>MODIFIED</span>
            </>
          )}
        </div>

        {view === "galaxy" && (
          <>
            <form className="seed-form" onSubmit={handleSeedSubmit}>
              <input
                className="seed-input"
                type="number"
                min={0}
                placeholder="Enter seed…"
                value={inputSeed}
                onChange={(e) => setInputSeed(e.target.value)}
              />
              <button className="btn" type="submit" disabled={isGenerating}>GO</button>
            </form>
            <div className="controls">
              <button className="btn primary" onClick={handleRandomize} disabled={isGenerating}>RANDOMIZE</button>
              <button className="btn"         onClick={handleRegenerate} disabled={isGenerating}>REGENERATE</button>
            </div>
            <div className="controls">
              <button className="btn" onClick={() => { setShowConfigPanel((v) => !v); setShowHistoryPanel(false); }}>
                {showConfigPanel ? "CLOSE LAWS" : "LAWS OF REALITY"}
              </button>
              <button className="btn" onClick={() => { setShowHistoryPanel((v) => !v); setShowConfigPanel(false); }}>
                {showHistoryPanel ? "CLOSE HISTORY" : "EXPERIMENTS"}
              </button>
            </div>
            {baselineSnapshot && (
              <div className="controls">
                <button className="btn" onClick={handleCompare} disabled={isGenerating}>COMPARE</button>
                <span className="hint" style={{ alignSelf: "center" }}>baseline set</span>
              </div>
            )}
            {!baselineSnapshot && (
              <button className="btn" onClick={handleSetBaseline} disabled={isGenerating} title="Save current universe as baseline for comparison">
                SET BASELINE
              </button>
            )}
          </>
        )}

        {view !== "galaxy" && (
          <div className="controls">
            <button className="btn" onClick={handleExitSystem}>← GALAXY VIEW</button>
            {universeTimeline && (
              <button className="btn timeline-open-btn" onClick={() => setShowTimeline((v) => !v)}>
                {showTimeline ? "CLOSE HISTORY" : "HISTORY"}
              </button>
            )}
          </div>
        )}

        {isGenerating && <div className="generating">Forging universe…</div>}
        {!isGenerating && view === "galaxy"    && !selectedStar     && <div className="hint">Click a star to inspect it</div>}
        {view === "galaxy"    && selectedStar                        && <div className="hint">Click EXPLORE to enter its system</div>}
        {view === "system"    && !selectedPlanet                     && <div className="hint">Click a planet to inspect it</div>}
        {view === "system"    && selectedPlanet && !selectedBiosphere && <div className="hint">Click SCAN BIOSPHERE to search for life</div>}
        {view === "biosphere" && selectedBiosphere?.hasLife          && !selectedCivilization && <div className="hint">Click SCAN CIVILIZATION if intelligence emerged</div>}
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
