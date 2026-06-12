import type { Planet } from "../simulation/planet";
import { PLANET_COLORS } from "../simulation/planet";

interface Props {
  planet: Planet;
  onClose: () => void;
  onBack: () => void;
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
  none:     "None",
  thin:     "Thin",
  moderate: "Moderate",
  thick:    "Thick",
  crushing: "Crushing",
};

function fmt(n: number, d = 2) {
  return n < 0.01 ? n.toExponential(1) : n.toFixed(d);
}

function habitabilityLabel(score: number) {
  if (score > 0.7) return "HIGH";
  if (score > 0.4) return "MODERATE";
  if (score > 0.1) return "LOW";
  return "NEGLIGIBLE";
}

function habitabilityColor(score: number) {
  if (score > 0.7) return "rgba(80, 220, 140, 0.85)";
  if (score > 0.4) return "rgba(180, 220, 80, 0.85)";
  if (score > 0.1) return "rgba(220, 160, 60, 0.75)";
  return "rgba(140, 140, 160, 0.5)";
}

export function PlanetPanel({ planet, onClose, onBack }: Props) {
  const [r, g, b] = PLANET_COLORS[planet.type];
  const planetColor = `rgb(${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(b * 255)})`;

  return (
    <div className="star-panel">
      <div className="star-panel-header">
        <div className="star-dot" style={{ background: planetColor, boxShadow: `0 0 8px ${planetColor}` }} />
        <div className="star-panel-title">
          <span className="star-id">PLANET #{planet.id + 1}</span>
          {planet.isRare && <span className="star-rare">RARE</span>}
        </div>
        <button className="panel-close" onClick={onBack} title="Back to star">←</button>
        <button className="panel-close" onClick={onClose}>✕</button>
      </div>

      <div className="star-class">{TYPE_LABEL[planet.type]}</div>

      <div className="star-stats">
        <span className="meta-label">ORBIT</span>
        <span className="meta-value">{fmt(planet.orbitalRadius, 2)} AU</span>

        <span className="meta-label">MASS</span>
        <span className="meta-value">{fmt(planet.mass, 2)} M⊕</span>

        <span className="meta-label">SIZE</span>
        <span className="meta-value">{fmt(planet.size, 2)} R⊕</span>

        <span className="meta-label">TEMPERATURE</span>
        <span className="meta-value">{Math.round(planet.temperature)} K</span>

        <span className="meta-label">ATMOSPHERE</span>
        <span className="meta-value">{ATMO_LABEL[planet.atmosphere]}</span>

        <span className="meta-label">RESOURCES</span>
        <span className="meta-value">{Math.round(planet.resourceAbundance * 100)}%</span>

        <span className="meta-label">HABITABILITY</span>
        <span className="meta-value" style={{ color: habitabilityColor(planet.habitabilityScore) }}>
          {habitabilityLabel(planet.habitabilityScore)}
        </span>
      </div>

      <div className="hab-bar">
        <div className="hab-fill" style={{ width: `${planet.habitabilityScore * 100}%`, background: habitabilityColor(planet.habitabilityScore) }} />
      </div>
    </div>
  );
}
