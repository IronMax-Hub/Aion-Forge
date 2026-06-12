import { useEffect, useRef, useState, useCallback } from "react";
import { UniverseRenderer } from "./rendering/UniverseRenderer";
import { generateGalaxy, pickGalaxyType } from "./simulation/galaxy";
import type { GalaxyType, GalaxyConfig } from "./simulation/galaxy";
import { createRNG } from "./simulation/rng";
import { generateStarsFor } from "./simulation/star";
import type { Star } from "./simulation/star";
import { StarPanel } from "./ui/StarPanel";
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

export default function App() {
  const canvasRef   = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<UniverseRenderer | null>(null);

  const [seed, setSeed]           = useState<number>(() => randomSeed());
  const [inputSeed, setInputSeed] = useState<string>("");
  const [galaxyType, setGalaxyType] = useState<GalaxyType>("spiral");
  const [isGenerating, setIsGenerating] = useState(false);
  const [selectedStar, setSelectedStar] = useState<Star | null>(null);
  const [currentSeed, setCurrentSeed]   = useState<number>(0);

  const generate = useCallback((s: number) => {
    setIsGenerating(true);
    setSelectedStar(null);
    requestAnimationFrame(() => {
      const config   = buildGalaxyConfig(s);
      const particles = generateGalaxy(config);
      const population = generateStarsFor(config);
      setGalaxyType(config.type);
      setCurrentSeed(s);
      rendererRef.current?.renderGalaxy(particles);
      rendererRef.current?.renderStars(population, (star) => setSelectedStar(star));
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

        {isGenerating && <div className="generating">Forging universe…</div>}
        {!isGenerating && !selectedStar && (
          <div className="hint">Click a star to inspect it</div>
        )}
      </div>

      {selectedStar && (
        <StarPanel
          star={selectedStar}
          galaxySeed={currentSeed}
          onClose={() => setSelectedStar(null)}
        />
      )}
    </div>
  );
}
