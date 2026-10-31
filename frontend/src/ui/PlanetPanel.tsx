import { useState } from "react";
import type { ReactNode } from "react";
import type { Planet, SolidWorld } from "../simulation/planet";
import type { Star } from "../simulation/star";
import type { Civilization } from "../simulation/civilization";
import type { DiscoveryItem } from "../simulation/persistence";
import type { PlanetPhysics } from "../simulation/planetPhysics";
import { PLANET_COLORS } from "../simulation/planet";
import { hasSolidSurface } from "../simulation/geography";
import type { Moon } from "../simulation/moons";
import { tidalHeatFlow } from "../simulation/interiorHeat";
import { generateBiosphere } from "../simulation/biosphere";
import {
  formatSig, formatInt, formatIndex, planetName, PLANET_TYPE_LABEL, bodyName, moonName, planetLifeLabel,
  formatGravity, formatGyr, formatAirChange, formatPressure, formatRotation, formatTilt, formatPercent, formatSurfaceShares, formatTemperatureRange,
} from "./format";
import { SpectrumPanel } from "./SpectrumPanel";

interface Props {
  planet: Planet;
  star: Star;
  galaxySeed: number;
  /** The planet's civilization, for the gases it adds to the air (Spectrum tab); null if none. */
  civilization: Civilization | null;
  discoveries: DiscoveryItem[];
  onSaveDiscovery?: (item: DiscoveryItem) => void;
  /** A solid planet's world (solidWorldOf), for its Surface section; null for giants. */
  world: SolidWorld | null;
  /** The planet's physics, for a giant's Cloud tops section; null to leave it out. */
  physics: PlanetPhysics | null;
  /** Whether the view is in orbit around this planet (Worlds Up Close A4). */
  orbiting: boolean;
  onClose: () => void;
  /** Up one level: out of orbit, or back to the star. */
  onBack: () => void;
  onApproach: () => void;
  onLeaveOrbit: () => void;
  onScanBiosphere: () => void;
  /** The planet's encyclopedia entry (EN3), shown in the Entry tab. */
  entryView: ReactNode;
  /** Selects one of its moon worlds (MO6). */
  onSelectMoon?: (moon: Planet) => void;
  /** The moon too small to be a world that the view is focused on, by its index; null for none. */
  selectedMoonIndex?: number | null;
  /** Focuses one of its moons too small to be worlds (null: back to the planet). */
  onSelectSmallMoon?: (moonIndex: number | null) => void;
}

const ATMO_LABEL: Record<string, string> = {
  none: "None", thin: "Thin", moderate: "Moderate", thick: "Thick", crushing: "Crushing",
};

/** A moon world's life today, in words (MO6). */
function moonLifeOf(world: Planet, star: Star): string {
  const label = planetLifeLabel(generateBiosphere(world, star));
  return label === "—" ? "No life" : `${label} life`;
}

/** A moon's water under ice: its world's share of the surface, or a listed moon's depth below its shell (MO6). */
function waterUnderIceOf(moon: Moon): string {
  if (moon.world) {
    const share = moon.world.surface?.liquidUnderIce ?? 0;
    return share > 0 ? `Under ${formatPercent(share)} of its surface` : "None";
  }
  const depth = moon.waterKm - moon.shellKm;
  return depth > 0 ? `${formatSig(depth)} km under ${formatSig(moon.shellKm)} km of ice` : "None";
}

function habLabel(score: number) {
  if (score > 0.7) return "High";
  if (score > 0.4) return "Moderate";
  if (score > 0.1) return "Low";
  return "Negligible";
}

type Tab = "overview" | "spectrum" | "entry";
const TAB_LABEL: Record<Tab, string> = { overview: "Overview", spectrum: "Spectrum", entry: "Entry" };

const CAN_HAVE_LIFE: Record<string, boolean> = {
  rocky: true, ocean: true, ice: true, desert: true,
  "gas-giant": false, "ice-giant": false, "sub-neptune": false, lava: false, rogue: false,
};

export function PlanetPanel({
  planet, star, galaxySeed, civilization, discoveries, onSaveDiscovery,
  world, physics, orbiting, onClose, onBack, onApproach, onLeaveOrbit, onScanBiosphere, entryView, onSelectMoon,
  selectedMoonIndex = null, onSelectSmallMoon,
}: Props) {
  const [tab, setTab] = useState<Tab>("overview");
  const [r, g, b] = PLANET_COLORS[planet.type];
  const isGiant = !hasSolidSurface(planet);
  const planetColor = `rgb(${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(b * 255)})`;
  const canScan = CAN_HAVE_LIFE[planet.type];
  const airChange = formatAirChange(planet.formationAtmosphere, planet.atmosphere);
  const airLost = planet.worldEvents.find((e) => e.kind === "air-lost");

  return (
    <div className="inspector" role="dialog" aria-label={`${planet.moonOrbit ? "Moon" : "Planet"} ${bodyName(planet)} details`}>
      <div className="inspector-header">
        <div className="inspector-dot" style={{ background: planetColor }} />
        <div className="inspector-title-block">
          <span className="inspector-id">{bodyName(planet)}</span>
          <span className="inspector-subtitle">
            {planet.moonOrbit ? `${PLANET_TYPE_LABEL[planet.type]} · moon of ${planetName(planet.hostStarId, planet.orbitalIndex)}` : PLANET_TYPE_LABEL[planet.type]}
          </span>
        </div>
        {planet.isRare && <span className="inspector-badge">Rare</span>}
        <div className="inspector-controls">
          <button className="inspector-btn" onClick={onBack} aria-label={orbiting ? "Leave orbit" : "Back to star"}>←</button>
          <button className="inspector-btn" onClick={onClose} aria-label="Close">✕</button>
        </div>
      </div>

      <div className="inspector-tabs" role="tablist" aria-label="Planet views">
        {(Object.keys(TAB_LABEL) as Tab[]).map((t) => (
          <button
            key={t}
            role="tab"
            id={`planet-tab-${t}`}
            aria-selected={tab === t}
            aria-controls="planet-tab-panel"
            className={`tl-filter-btn${tab === t ? " active" : ""}`}
            onClick={() => setTab(t)}
          >
            {TAB_LABEL[t]}
          </button>
        ))}
      </div>

      <div className="inspector-body" role="tabpanel" id="planet-tab-panel" aria-labelledby={`planet-tab-${tab}`}>
        {tab === "entry" ? entryView : tab === "spectrum" ? (
          <SpectrumPanel
            key={planet.key}
            planet={planet}
            star={star}
            galaxySeed={galaxySeed}
            civilization={civilization}
            discoveries={discoveries}
            onSaveDiscovery={onSaveDiscovery}
          />
        ) : (<>
        <div className="inspector-section">
          <div className="section-title">Physical properties</div>
          <div className="data-grid">
            <span className="data-label">Semi-major axis</span>
            <span className="data-value">{formatSig(planet.orbitalRadius)} AU</span>
            <span className="data-label">Radius</span>
            <span className="data-value">{formatSig(planet.size)} R⊕</span>
            <span className="data-label">Mass</span>
            <span className="data-value">{formatSig(planet.mass)} M⊕</span>
            <span className="data-label">{isGiant ? "Equilibrium temperature" : "Mean surface temperature"}</span>
            <span className="data-value">{formatInt(planet.temperature)} K</span>
            <span className="data-label">Atmosphere</span>
            <span className="data-value data-text">{airChange ?? ATMO_LABEL[planet.atmosphere]}</span>
            {airLost && (<>
              <span className="data-label">Air lost to space</span>
              <span className="data-value">{formatGyr(star.age - airLost.tGyr)} ago</span>
            </>)}
          </div>
        </div>

        {planet.surface && world && (
          <div className="inspector-section">
            <div className="section-title">Surface</div>
            <div className="data-grid">
              <span className="data-label">Gravity</span>
              <span className="data-value">{formatGravity(planet.surface.surfaceGravity)}</span>
              <span className="data-label">Pressure</span>
              <span className="data-value">{formatPressure(planet.surface.pressureBar)}</span>
              <span className="data-label">Rotation</span>
              <span className="data-value data-text">{formatRotation(world.physics.rotationPeriodHours, world.physics.tidallyLocked)}</span>
              <span className="data-label">Axial tilt</span>
              <span className="data-value">{formatTilt(world.physics.axialTiltDeg)}</span>
              <span className="data-label">Ocean / land / ice</span>
              <span className="data-value">
                {formatSurfaceShares(planet.surface.oceanFraction, planet.surface.landFraction, planet.surface.iceFraction)}
              </span>
              <span className="data-label">Habitable area</span>
              <span className="data-value">{formatPercent(planet.surface.habitableFraction)}</span>
              <span className="data-label">Temperature range</span>
              <span className="data-value">{formatTemperatureRange(world.history.present.minK, world.history.present.maxK)}</span>
            </div>
          </div>
        )}

        {!planet.surface && physics && (
          <div className="inspector-section">
            {/* A giant has no surface: its gravity is taken at its visible radius, the cloud tops */}
            <div className="section-title">Cloud tops</div>
            <div className="data-grid">
              <span className="data-label">Gravity</span>
              <span className="data-value">{formatGravity(physics.surfaceGravity)}</span>
              <span className="data-label">Rotation</span>
              <span className="data-value data-text">{formatRotation(physics.rotationPeriodHours, physics.tidallyLocked)}</span>
              <span className="data-label">Axial tilt</span>
              <span className="data-value">{formatTilt(physics.axialTiltDeg)}</span>
            </div>
          </div>
        )}

        {planet.moons.length > 0 && (
          <div className="inspector-section">
            <div className="section-title">Moons</div>
            {planet.moons.map((moon) => (
              <div
                key={moon.key}
                className={`moon-row${moon.moonIndex === selectedMoonIndex ? " selected" : ""}`}
                ref={moon.moonIndex === selectedMoonIndex ? (row) => row?.scrollIntoView({ block: "nearest" }) : undefined}
              >
                <div className="moon-row-head">
                  {moon.world && onSelectMoon
                    ? <button className="breadcrumb-link" onClick={() => onSelectMoon(moon.world!)}>{moonName(moon.hostStarId, planet.orbitalIndex, moon.moonIndex)}</button>
                    : onSelectSmallMoon
                      ? <button className="breadcrumb-link" aria-pressed={moon.moonIndex === selectedMoonIndex}
                          title={moon.moonIndex === selectedMoonIndex ? "Back to the planet" : "Show this moon in the view"}
                          onClick={() => onSelectSmallMoon(moon.moonIndex === selectedMoonIndex ? null : moon.moonIndex)}>
                          {moonName(moon.hostStarId, planet.orbitalIndex, moon.moonIndex)}
                        </button>
                      : <span>{moonName(moon.hostStarId, planet.orbitalIndex, moon.moonIndex)}</span>}
                  <span className="moon-row-life">{moon.world ? moonLifeOf(moon.world, star) : "No history (too small)"}</span>
                </div>
                <div className="data-grid">
                  <span className="data-label">Mass · radius</span>
                  <span className="data-value">{formatSig(moon.mass)} M⊕ · {formatSig(moon.size)} R⊕</span>
                  <span className="data-label">Orbit · day</span>
                  <span className="data-value">{formatSig(moon.orbitPlanetRadii)} planet radii · {formatSig(moon.orbitalPeriodHours)} h</span>
                  <span className="data-label">Tidal heat</span>
                  <span className="data-value">{formatSig(tidalHeatFlow(moon, planet))} W/m²</span>
                  <span className="data-label">Water under ice</span>
                  <span className="data-value data-text">{waterUnderIceOf(moon)}</span>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="inspector-section">
          <div className="section-title">Indices (0–1)</div>
          <div className="data-grid">
            <span className="data-label">Resource abundance</span>
            <span className="data-value">{formatIndex(planet.resourceAbundance)}</span>
            <span className="data-label">Habitability</span>
            <span className="data-value">{formatIndex(planet.habitabilityScore)} · {habLabel(planet.habitabilityScore)}</span>
          </div>
          <div className="progress-track" aria-hidden="true">
            <div className="progress-fill" style={{ width: `${planet.habitabilityScore * 100}%` }} />
          </div>
        </div>
        </>)}

        <div className="inspector-actions">
          {orbiting
            ? <button className="btn" onClick={onLeaveOrbit} title="Return to the planetary system">Leave orbit</button>
            : <button className="btn" onClick={onApproach} title="Go into orbit around this planet (or double-click it)">Approach</button>}
          <button
            className="btn primary"
            onClick={onScanBiosphere}
            disabled={!canScan}
            title={canScan ? undefined : "No life possible on this world"}
            style={{ flex: 1 }}
          >
            Scan biosphere
          </button>
        </div>
      </div>
    </div>
  );
}
