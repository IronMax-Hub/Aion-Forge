import type { Civilization, Species } from "../simulation/civilization";
import { TECH_STAGE_LABEL, MILESTONE_LABEL } from "../simulation/civilization";

interface Props {
  civilization: Civilization;
  species: Species;
  onBack: () => void;
  onClose: () => void;
}

const STAGE_COLOR: Record<string, string> = {
  primitive:    "rgba(160, 140, 110, 0.85)",
  agricultural: "rgba(120, 190, 100, 0.85)",
  industrial:   "rgba(160, 160, 200, 0.85)",
  information:  "rgba(100, 180, 255, 0.85)",
  "space-age":  "rgba(200, 160, 255, 0.95)",
  collapsed:    "rgba(200, 80, 80, 0.75)",
};

const MILESTONE_ICON: Record<string, string> = {
  "first-cities":         "◆",
  agriculture:            "◆",
  writing:                "◆",
  industry:               "◆",
  "global-communication": "◆",
  spaceflight:            "★",
  collapse:               "✕",
  recovery:               "◇",
  "golden-age":           "★",
  "dark-age":             "▼",
};

const MILESTONE_COLOR: Record<string, string> = {
  "first-cities":         "rgba(160, 190, 220, 0.7)",
  agriculture:            "rgba(120, 200, 100, 0.7)",
  writing:                "rgba(160, 190, 220, 0.7)",
  industry:               "rgba(180, 160, 220, 0.7)",
  "global-communication": "rgba(100, 180, 255, 0.7)",
  spaceflight:            "rgba(200, 160, 255, 0.9)",
  collapse:               "rgba(220, 80, 70, 0.85)",
  recovery:               "rgba(120, 220, 140, 0.8)",
  "golden-age":           "rgba(255, 210, 80, 0.9)",
  "dark-age":             "rgba(180, 110, 80, 0.8)",
};

function pct(n: number) { return `${Math.round(n * 100)}%`; }
function fmt(n: number) { return n >= 1 ? n.toFixed(1) : n.toFixed(2); }

function Bar({ value, color }: { value: number; color: string }) {
  return (
    <div className="bio-bar-track">
      <div className="bio-bar-fill" style={{ width: pct(value), background: color }} />
    </div>
  );
}

export function CivilizationPanel({ civilization: civ, species, onBack, onClose }: Props) {
  const stageColor = STAGE_COLOR[civ.techStage];

  return (
    <div className="star-panel bio-panel civ-panel">
      <div className="star-panel-header">
        <div className="star-dot civ-dot" style={{ background: stageColor, boxShadow: `0 0 10px ${stageColor}` }} />
        <div className="star-panel-title">
          <span className="star-id">CIVILIZATION #{civ.id + 1}</span>
          {civ.isRare && <span className="star-rare">REMARKABLE</span>}
        </div>
        <button className="panel-close" onClick={onBack} title="Back to biosphere">←</button>
        <button className="panel-close" onClick={onClose}>✕</button>
      </div>

      <div className="star-class" style={{ color: stageColor }}>
        {TECH_STAGE_LABEL[civ.techStage]}
      </div>

      <div className="star-stats">
        <span className="meta-label">AGE</span>
        <span className="meta-value">{civ.ageGyr.toFixed(3)} Gyr</span>
        <span className="meta-label">POPULATION</span>
        <span className="meta-value">{fmt(civ.population)}B</span>
        <span className="meta-label">COLLAPSES</span>
        <span className="meta-value" style={{ color: civ.collapsesCount > 0 ? "rgba(220,120,80,0.85)" : "inherit" }}>
          {civ.collapsesCount}
        </span>
      </div>

      <div className="civ-traits-title">SPECIES TRAITS</div>
      <div className="bio-stats">
        <span className="meta-label">CURIOSITY</span>
        <div className="bio-stat-right">
          <Bar value={species.curiosity} color="rgba(100, 180, 255, 0.7)" />
          <span className="meta-value civ-pct">{pct(species.curiosity)}</span>
        </div>
        <span className="meta-label">COOPERATION</span>
        <div className="bio-stat-right">
          <Bar value={species.cooperation} color="rgba(80, 220, 160, 0.7)" />
          <span className="meta-value civ-pct">{pct(species.cooperation)}</span>
        </div>
        <span className="meta-label">AGGRESSION</span>
        <div className="bio-stat-right">
          <Bar value={species.aggression} color="rgba(220, 100, 80, 0.7)" />
          <span className="meta-value civ-pct">{pct(species.aggression)}</span>
        </div>
        <span className="meta-label">ADAPTABILITY</span>
        <div className="bio-stat-right">
          <Bar value={species.adaptability} color="rgba(200, 180, 80, 0.7)" />
          <span className="meta-value civ-pct">{pct(species.adaptability)}</span>
        </div>
        <span className="meta-label">RESILIENCE</span>
        <div className="bio-stat-right">
          <Bar value={species.resilience} color="rgba(160, 140, 220, 0.7)" />
          <span className="meta-value civ-pct">{pct(species.resilience)}</span>
        </div>
      </div>

      <div className="civ-traits-title">CIVILIZATION</div>
      <div className="bio-stats">
        <span className="meta-label">COHESION</span>
        <div className="bio-stat-right">
          <Bar value={civ.socialCohesion} color="rgba(80, 200, 180, 0.7)" />
          <span className="meta-value civ-pct">{pct(civ.socialCohesion)}</span>
        </div>
        <span className="meta-label">EFFICIENCY</span>
        <div className="bio-stat-right">
          <Bar value={civ.resourceEfficiency} color="rgba(180, 220, 80, 0.7)" />
          <span className="meta-value civ-pct">{pct(civ.resourceEfficiency)}</span>
        </div>
        <span className="meta-label">EXPANSION</span>
        <div className="bio-stat-right">
          <Bar value={civ.expansionTendency} color="rgba(220, 160, 80, 0.7)" />
          <span className="meta-value civ-pct">{pct(civ.expansionTendency)}</span>
        </div>
        <span className="meta-label">COLLAPSE RISK</span>
        <div className="bio-stat-right">
          <Bar value={civ.collapseRisk} color="rgba(220, 80, 80, 0.7)" />
          <span className="meta-value civ-pct">{pct(civ.collapseRisk)}</span>
        </div>
      </div>

      {civ.milestones.length > 0 && (
        <div className="bio-extinctions">
          <div className="bio-ext-title">TIMELINE</div>
          {civ.milestones.slice(0, 6).map((m, i) => (
            <div key={i} className="civ-milestone-row">
              <span className="civ-milestone-icon" style={{ color: MILESTONE_COLOR[m.type] }}>
                {MILESTONE_ICON[m.type]}
              </span>
              <span className="civ-milestone-label" style={{ color: MILESTONE_COLOR[m.type] }}>
                {MILESTONE_LABEL[m.type]}
              </span>
              <span className="bio-ext-time">{m.timeAgo.toFixed(3)} Gya</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
