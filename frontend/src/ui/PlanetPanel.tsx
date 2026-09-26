import type { Planet } from "../simulation/planet";
import { PLANET_COLORS, GIANT_PLANET_MASS } from "../simulation/planet";
import { formatSig, formatInt, formatIndex, planetName, PLANET_TYPE_LABEL } from "./format";

interface Props {
  planet: Planet;
  /** Whether the view is in orbit around this planet (Worlds Up Close A4). */
  orbiting: boolean;
  onClose: () => void;
  /** Up one level: out of orbit, or back to the star. */
  onBack: () => void;
  onApproach: () => void;
  onLeaveOrbit: () => void;
  onScanBiosphere: () => void;
}

const ATMO_LABEL: Record<string, string> = {
  none: "None", thin: "Thin", moderate: "Moderate", thick: "Thick", crushing: "Crushing",
};

function habLabel(score: number) {
  if (score > 0.7) return "High";
  if (score > 0.4) return "Moderate";
  if (score > 0.1) return "Low";
  return "Negligible";
}

const CAN_HAVE_LIFE: Record<string, boolean> = {
  rocky: true, ocean: true, ice: true, desert: true,
  "gas-giant": false, lava: false, rogue: false,
};

export function PlanetPanel({ planet, orbiting, onClose, onBack, onApproach, onLeaveOrbit, onScanBiosphere }: Props) {
  const [r, g, b] = PLANET_COLORS[planet.type];
  const isGiant = planet.type === "gas-giant" || planet.mass > GIANT_PLANET_MASS;
  const planetColor = `rgb(${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(b * 255)})`;
  const canScan = CAN_HAVE_LIFE[planet.type];

  return (
    <div className="inspector" role="dialog" aria-label={`Planet ${planetName(planet.hostStarId, planet.orbitalIndex)} details`}>
      <div className="inspector-header">
        <div className="inspector-dot" style={{ background: planetColor }} />
        <div className="inspector-title-block">
          <span className="inspector-id">{planetName(planet.hostStarId, planet.orbitalIndex)}</span>
          <span className="inspector-subtitle">{PLANET_TYPE_LABEL[planet.type]}</span>
        </div>
        {planet.isRare && <span className="inspector-badge">Rare</span>}
        <div className="inspector-controls">
          <button className="inspector-btn" onClick={onBack} aria-label={orbiting ? "Leave orbit" : "Back to star"}>←</button>
          <button className="inspector-btn" onClick={onClose} aria-label="Close">✕</button>
        </div>
      </div>

      <div className="inspector-body">
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
            <span className="data-value data-text">{ATMO_LABEL[planet.atmosphere]}</span>
          </div>
        </div>

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
