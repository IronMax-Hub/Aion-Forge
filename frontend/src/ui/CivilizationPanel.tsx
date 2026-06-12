import type { Civilization, Species } from "../simulation/civilization";
import { TECH_STAGE_LABEL, MILESTONE_LABEL, describeCivilization } from "../simulation/civilization";

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

function TraitRow({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <>
      <span className="trait-label">{label}</span>
      <div className="trait-bar-track">
        <div className="trait-bar-fill" style={{ width: pct(value), background: color }} />
      </div>
      <span className="trait-value">{pct(value)}</span>
    </>
  );
}

export function CivilizationPanel({ civilization: civ, species, onBack, onClose }: Props) {
  const stageColor = STAGE_COLOR[civ.techStage];
  const narrative  = describeCivilization(civ, species);

  return (
    <div className="inspector" role="dialog" aria-label={`Civilization ${civ.id + 1} details`}>
      <div className="inspector-header">
        <div className="inspector-dot" style={{ background: stageColor, boxShadow: `0 0 10px ${stageColor}` }} />
        <div className="inspector-title-block">
          <span className="inspector-id">Civilization #{civ.id + 1}</span>
          <span className="inspector-subtitle" style={{ color: stageColor }}>{TECH_STAGE_LABEL[civ.techStage]}</span>
        </div>
        {civ.isRare && <span className="inspector-badge">Remarkable</span>}
        <div className="inspector-controls">
          <button className="inspector-btn" onClick={onBack} aria-label="Back to biosphere">←</button>
          <button className="inspector-btn" onClick={onClose} aria-label="Close">✕</button>
        </div>
      </div>

      <div className="inspector-body">
        <p className="narrative">{narrative}</p>

        <div className="data-grid">
          <span className="data-label">Age</span>
          <span className="data-value">{civ.ageGyr.toFixed(3)} Gyr</span>
          <span className="data-label">Population</span>
          <span className="data-value">{fmt(civ.population)}B</span>
          <span className="data-label">Collapses</span>
          <span className="data-value" style={{ color: civ.collapsesCount > 0 ? "rgba(220,120,80,0.85)" : "inherit" }}>
            {civ.collapsesCount}
          </span>
        </div>

        <div className="inspector-section">
          <div className="section-title">Species Traits</div>
          <div className="trait-grid">
            <TraitRow label="Curiosity"    value={species.curiosity}    color="rgba(100, 180, 255, 0.7)" />
            <TraitRow label="Cooperation"  value={species.cooperation}  color="rgba(80, 220, 160, 0.7)" />
            <TraitRow label="Aggression"   value={species.aggression}   color="rgba(220, 100, 80, 0.7)" />
            <TraitRow label="Adaptability" value={species.adaptability} color="rgba(200, 180, 80, 0.7)" />
            <TraitRow label="Resilience"   value={species.resilience}   color="rgba(160, 140, 220, 0.7)" />
          </div>
        </div>

        <div className="inspector-section">
          <div className="section-title">Civilization</div>
          <div className="trait-grid">
            <TraitRow label="Cohesion"     value={civ.socialCohesion}      color="rgba(80, 200, 180, 0.7)" />
            <TraitRow label="Efficiency"   value={civ.resourceEfficiency}  color="rgba(180, 220, 80, 0.7)" />
            <TraitRow label="Expansion"    value={civ.expansionTendency}   color="rgba(220, 160, 80, 0.7)" />
            <TraitRow label="Collapse Risk" value={civ.collapseRisk}       color="rgba(220, 80, 80, 0.7)" />
          </div>
        </div>

        {civ.milestones.length > 0 && (
          <div className="inspector-section">
            <div className="section-title">Milestones</div>
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
    </div>
  );
}
