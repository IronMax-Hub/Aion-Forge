import type { Civilization, Species } from "../simulation/civilization";
import { TECH_STAGE_LABEL, MILESTONE_LABEL, describeCivilization } from "../simulation/civilization";
import { formatSig, formatGyr, formatIndex } from "./format";

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

/** Milestones that mark decline rather than progress. */
const ADVERSE_MILESTONES = new Set(["collapse", "dark-age"]);

function TraitRow({ label, value }: { label: string; value: number }) {
  return (
    <>
      <span className="trait-label">{label}</span>
      <div className="trait-bar-track">
        <div className="trait-bar-fill" style={{ width: `${value * 100}%` }} />
      </div>
      <span className="trait-value">{formatIndex(value)}</span>
    </>
  );
}

export function CivilizationPanel({ civilization: civ, species, onBack, onClose }: Props) {
  const stageColor = STAGE_COLOR[civ.techStage];
  const narrative  = describeCivilization(civ, species);

  return (
    <div className="inspector" role="dialog" aria-label={`Civilization ${civ.id + 1} details`}>
      <div className="inspector-header">
        <div className="inspector-dot" style={{ background: stageColor }} />
        <div className="inspector-title-block">
          <span className="inspector-id">Civilization #{civ.id + 1}</span>
          <span className="inspector-subtitle">{TECH_STAGE_LABEL[civ.techStage]}</span>
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
          <span className="data-value">{formatGyr(civ.ageGyr)}</span>
          <span className="data-label">Peak population</span>
          <span className="data-value">{formatSig(civ.population)} billion</span>
          <span className="data-label">Collapses</span>
          <span className={`data-value${civ.collapsesCount > 0 ? " adverse" : ""}`}>
            {civ.collapsesCount}
          </span>
        </div>

        <div className="inspector-section">
          <div className="section-title">Species traits (0–1)</div>
          <div className="trait-grid">
            <TraitRow label="Curiosity"    value={species.curiosity} />
            <TraitRow label="Cooperation"  value={species.cooperation} />
            <TraitRow label="Aggression"   value={species.aggression} />
            <TraitRow label="Adaptability" value={species.adaptability} />
            <TraitRow label="Resilience"   value={species.resilience} />
          </div>
        </div>

        <div className="inspector-section">
          <div className="section-title">Society (0–1)</div>
          <div className="trait-grid">
            <TraitRow label="Cohesion"     value={civ.socialCohesion} />
            <TraitRow label="Efficiency"   value={civ.resourceEfficiency} />
            <TraitRow label="Expansion"    value={civ.expansionTendency} />
            <TraitRow label="Collapse Risk" value={civ.collapseRisk} />
          </div>
        </div>

        {civ.milestones.length > 0 && (
          <div className="inspector-section">
            <div className="section-title">Milestones</div>
            {civ.milestones.slice(0, 6).map((m, i) => (
              <div key={i} className="civ-milestone-row">
                <span className={`civ-milestone-icon${ADVERSE_MILESTONES.has(m.type) ? " adverse" : ""}`} aria-hidden="true">
                  {MILESTONE_ICON[m.type]}
                </span>
                <span className={`civ-milestone-label${ADVERSE_MILESTONES.has(m.type) ? " adverse" : ""}`}>
                  {MILESTONE_LABEL[m.type]}
                </span>
                <span className="bio-ext-time">{formatGyr(m.timeAgo)} ago</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
