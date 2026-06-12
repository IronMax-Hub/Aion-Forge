import type { Planet } from "../simulation/planet";
import { PLANET_COLORS } from "../simulation/planet";

interface Props {
  planet: Planet;
  onClose: () => void;
  onBack: () => void;
  onScanBiosphere: () => void;
}

const TYPE_LABEL: Record<string, string> = {
  rocky:       "Rocky World",
  ocean:       "Ocean World",
  ice:         "Ice World",
  desert:      "Desert World",
  "gas-giant": "Gas Giant",
  lava:        "Lava World",
  rogue:       "Rogue World",
};

const ATMO_LABEL: Record<string, string> = {
  none: "None", thin: "Thin", moderate: "Moderate", thick: "Thick", crushing: "Crushing",
};

function fmt(n: number, d = 2) {
  return n < 0.01 ? n.toExponential(1) : n.toFixed(d);
}

function habColor(score: number) {
  if (score > 0.7) return "rgba(80, 220, 140, 0.85)";
  if (score > 0.4) return "rgba(180, 220, 80, 0.85)";
  if (score > 0.1) return "rgba(220, 160, 60, 0.75)";
  return "rgba(140, 140, 160, 0.5)";
}

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

export function PlanetPanel({ planet, onClose, onBack, onScanBiosphere }: Props) {
  const [r, g, b] = PLANET_COLORS[planet.type];
  const planetColor = `rgb(${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(b * 255)})`;
  const canScan = CAN_HAVE_LIFE[planet.type];

  return (
    <div className="inspector" role="dialog" aria-label={`Planet ${planet.id + 1} details`}>
      <div className="inspector-header">
        <div className="inspector-dot" style={{ background: planetColor, boxShadow: `0 0 8px ${planetColor}` }} />
        <div className="inspector-title-block">
          <span className="inspector-id">Planet #{planet.id + 1}</span>
          <span className="inspector-subtitle">{TYPE_LABEL[planet.type]}</span>
        </div>
        {planet.isRare && <span className="inspector-badge">Rare</span>}
        <div className="inspector-controls">
          <button className="inspector-btn" onClick={onBack} aria-label="Back to star">←</button>
          <button className="inspector-btn" onClick={onClose} aria-label="Close">✕</button>
        </div>
      </div>

      <div className="inspector-body">
        <div className="data-grid">
          <span className="data-label">Orbit</span>
          <span className="data-value">{fmt(planet.orbitalRadius, 2)} AU</span>
          <span className="data-label">Mass</span>
          <span className="data-value">{fmt(planet.mass, 2)} M⊕</span>
          <span className="data-label">Size</span>
          <span className="data-value">{fmt(planet.size, 2)} R⊕</span>
          <span className="data-label">Temperature</span>
          <span className="data-value">{Math.round(planet.temperature)} K</span>
          <span className="data-label">Atmosphere</span>
          <span className="data-value">{ATMO_LABEL[planet.atmosphere]}</span>
          <span className="data-label">Resources</span>
          <span className="data-value">{Math.round(planet.resourceAbundance * 100)}%</span>
          <span className="data-label">Habitability</span>
          <span className="data-value" style={{ color: habColor(planet.habitabilityScore) }}>
            {habLabel(planet.habitabilityScore)}
          </span>
        </div>

        <div className="hab-bar">
          <div className="hab-fill" style={{ width: `${planet.habitabilityScore * 100}%`, background: habColor(planet.habitabilityScore) }} />
        </div>

        <div className="inspector-actions">
          <button
            className="btn primary"
            onClick={onScanBiosphere}
            disabled={!canScan}
            title={canScan ? undefined : "No life possible on this world"}
            style={{ flex: 1 }}
          >
            Scan Biosphere →
          </button>
        </div>
      </div>
    </div>
  );
}
