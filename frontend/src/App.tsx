import { useEffect, useRef, useState, useCallback } from "react";
import { UniverseRenderer } from "./rendering/UniverseRenderer";
import { generateGalaxy, pickGalaxyType } from "./simulation/galaxy";
import type { GalaxyType, GalaxyConfig } from "./simulation/galaxy";
import { createRNG } from "./simulation/rng";
import { generateStarsFor } from "./simulation/star";
import type { Star } from "./simulation/star";
import { generatePlanetsFor } from "./simulation/planet";
import type { Planet, PlanetarySystem } from "./simulation/planet";
import { generateBiosphere } from "./simulation/biosphere";
import type { Biosphere } from "./simulation/biosphere";
import { generateCivilization } from "./simulation/civilization";
import type { Civilization, Species } from "./simulation/civilization";
import { StarPanel } from "./ui/StarPanel";
import { PlanetPanel } from "./ui/PlanetPanel";
import { BiospherePanel } from "./ui/BiospherePanel";
import { CivilizationPanel } from "./ui/CivilizationPanel";
import "./App.css";

const PARTICLE_COUNT = 60000;
const SCALE = 120;

function randomSeed(): number {
  return Math.floor(Math.random() * 1_000_000_000);
}

function buildGalaxyConfig(seed: number): GalaxyConfig {
  const rng = createRNG(seed);
  const type = pickGalaxyType(rng);
  return { type, particleCount: PARTICLE_COUNT, seed, scale: SCALE };
}

type View = "galaxy" | "system" | "biosphere" | "civilization";

export default function App() {
  const canvasRef   = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<UniverseRenderer | null>(null);

  const [seed, setSeed]             = useState<number>(() => randomSeed());
  const [inputSeed, setInputSeed]   = useState<string>("");
  const [galaxyType, setGalaxyType] = useState<GalaxyType>("spiral");
  const [isGenerating, setIsGenerating] = useState(false);
  const [view, setView]             = useState<View>("galaxy");

  const [selectedStar,          setSelectedStar]          = useState<Star | null>(null);
  const [selectedPlanet,        setSelectedPlanet]        = useState<Planet | null>(null);
  const [selectedBiosphere,     setSelectedBiosphere]     = useState<Biosphere | null>(null);
  const [selectedCivilization,  setSelectedCivilization]  = useState<Civilization | null>(null);
  const [selectedSpecies,       setSelectedSpecies]       = useState<Species | null>(null);
  const [currentSeed,           setCurrentSeed]           = useState<number>(0);
  const [, setCurrentSystem] = useState<PlanetarySystem | null>(null);

  const generate = useCallback((s: number) => {
    setIsGenerating(true);
    setSelectedStar(null);
    setSelectedPlanet(null);
    setSelectedBiosphere(null);
    setSelectedCivilization(null);
    setSelectedSpecies(null);
    setCurrentSystem(null);
    setView("galaxy");
    rendererRef.current?.exitSystemView();

    requestAnimationFrame(() => {
      const config     = buildGalaxyConfig(s);
      const particles  = generateGalaxy(config);
      const population = generateStarsFor(config);
      setGalaxyType(config.type);
      setCurrentSeed(s);
      rendererRef.current?.renderGalaxy(particles);
      rendererRef.current?.renderStars(population, (star) => {
        setSelectedStar(star);
        setSelectedPlanet(null);
        setSelectedBiosphere(null);
      });
      setIsGenerating(false);
    });
  }, []);

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

  const handleExploreSystem = useCallback(() => {
    if (!selectedStar || !rendererRef.current) return;
    const system = generatePlanetsFor(selectedStar, currentSeed);

    // Pre-generate all biospheres for this system so the renderer can show life glows
    const biospheres = new Map<number, Biosphere>();
    for (const planet of system.planets) {
      const bio = generateBiosphere(planet, selectedStar, currentSeed);
      biospheres.set(planet.id, bio);
    }

    setCurrentSystem(system);
    setSelectedPlanet(null);
    setSelectedBiosphere(null);
    setView("system");

    rendererRef.current.renderPlanetarySystem(system, selectedStar, (planet) => {
      setSelectedPlanet(planet);
      setSelectedBiosphere(null);
    }, biospheres);
  }, [selectedStar, currentSeed]);

  const handleScanBiosphere = useCallback(() => {
    if (!selectedPlanet || !selectedStar) return;
    const bio = generateBiosphere(selectedPlanet, selectedStar, currentSeed);
    setSelectedBiosphere(bio);
    setSelectedCivilization(null);
    setSelectedSpecies(null);
    setView("biosphere");
  }, [selectedPlanet, selectedStar, currentSeed]);

  const handleScanCivilization = useCallback(() => {
    if (!selectedBiosphere || !selectedPlanet) return;
    const result = generateCivilization(selectedBiosphere, selectedPlanet, currentSeed);
    if (result.civilization && result.species) {
      setSelectedCivilization(result.civilization);
      setSelectedSpecies(result.species);
      setView("civilization");
    }
  }, [selectedBiosphere, selectedPlanet, currentSeed]);

  const handleExitSystem = () => {
    setView("galaxy");
    setSelectedPlanet(null);
    setSelectedBiosphere(null);
    setSelectedCivilization(null);
    setSelectedSpecies(null);
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
          </>
        )}

        {view !== "galaxy" && (
          <button className="btn" onClick={handleExitSystem}>← GALAXY VIEW</button>
        )}

        {isGenerating && <div className="generating">Forging universe…</div>}
        {!isGenerating && view === "galaxy"      && !selectedStar     && <div className="hint">Click a star to inspect it</div>}
        {view === "galaxy"      && selectedStar                        && <div className="hint">Click EXPLORE to enter its system</div>}
        {view === "system"      && !selectedPlanet                     && <div className="hint">Click a planet to inspect it</div>}
        {view === "system"      && selectedPlanet  && !selectedBiosphere && <div className="hint">Click SCAN BIOSPHERE to search for life</div>}
        {view === "biosphere"   && selectedBiosphere?.hasLife           && !selectedCivilization && <div className="hint">Click SCAN CIVILIZATION if intelligence emerged</div>}
      </div>

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
    </div>
  );
}
