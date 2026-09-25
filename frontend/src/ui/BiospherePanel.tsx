import type { Biosphere } from "../simulation/biosphere";
import { STAGE_LABEL, STAGE_COLOR } from "../simulation/biosphere";
import type { LifeStage } from "../simulation/biosphere";
import { formatGyr, formatIndex } from "./format";

interface Props {
  biosphere: Biosphere;
  onBack: () => void;
  onClose: () => void;
  onScanCivilization: () => void;
}

/** Stages life passes through once it has emerged, in order. */
const LIFE_STAGES: LifeStage[] = ["prebiotic", "microbial", "multicellular", "complex", "dominant"];

const CAN_HAVE_CIVILIZATION = new Set(["complex", "dominant"]);

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

export function BiospherePanel({ biosphere, onBack, onClose, onScanCivilization }: Props) {
  const stageColor = STAGE_COLOR[biosphere.stage];

  if (!biosphere.hasLife) {
    return (
      <div className="inspector" role="dialog" aria-label="Biosphere — no life">
        <div className="inspector-header">
          <div className="inspector-dot" style={{ background: STAGE_COLOR.none }} />
          <div className="inspector-title-block">
            <span className="inspector-id">Biosphere</span>
            <span className="inspector-subtitle">{STAGE_LABEL.none}</span>
          </div>
          <div className="inspector-controls">
            <button className="inspector-btn" onClick={onBack} aria-label="Back to planet">←</button>
            <button className="inspector-btn" onClick={onClose} aria-label="Close">✕</button>
          </div>
        </div>
        <div className="inspector-body">
          <div className="empty-state">
            <div className="empty-state-icon">○</div>
            <div className="empty-state-title">No life detected</div>
            <p className="empty-state-body">Conditions on this planet did not allow life to emerge.</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="inspector" role="dialog" aria-label="Biosphere details">
      <div className="inspector-header">
        <div className="inspector-dot" style={{ background: stageColor }} />
        <div className="inspector-title-block">
          <span className="inspector-id">Biosphere</span>
          <span className="inspector-subtitle">{STAGE_LABEL[biosphere.stage]} · emerged {formatGyr(biosphere.ageGyr)} ago</span>
        </div>
        <div className="inspector-controls">
          <button className="inspector-btn" onClick={onBack} aria-label="Back to planet">←</button>
          <button className="inspector-btn" onClick={onClose} aria-label="Close">✕</button>
        </div>
      </div>

      <div className="inspector-body">
        <div className="inspector-section">
          <div className="section-head">
            <span className="section-title">Evolutionary stage</span>
            <span className="section-note">{LIFE_STAGES.indexOf(biosphere.stage) + 1} of {LIFE_STAGES.length}</span>
          </div>
          <div className="stage-track" role="img" aria-label={`Stage ${LIFE_STAGES.indexOf(biosphere.stage) + 1} of ${LIFE_STAGES.length}: ${STAGE_LABEL[biosphere.stage]}`}>
            {LIFE_STAGES.map((stage, i) => (
              <div
                key={stage}
                className={`stage-step${i < LIFE_STAGES.indexOf(biosphere.stage) ? " passed" : ""}${stage === biosphere.stage ? " current" : ""}`}
                title={STAGE_LABEL[stage]}
              />
            ))}
          </div>
          <div className="progress-scale"><span>Prebiotic</span><span>Dominant</span></div>
        </div>

        <div className="inspector-section">
          <div className="section-head">
            <span className="section-title">Indices</span>
            <span className="section-note">0–1</span>
          </div>
          <div className="trait-grid">
            <TraitRow label="Complexity"   value={biosphere.complexity} />
            <TraitRow label="Diversity"    value={biosphere.diversity} />
            <TraitRow label="Stability"    value={biosphere.stability} />
            <TraitRow label="Adaptability" value={biosphere.adaptability} />
            <TraitRow label="Biomass"      value={biosphere.biomass} />
          </div>
        </div>

        {biosphere.extinctions.length > 0 && (
          <div className="inspector-section">
            <div className="section-head">
              <span className="section-title">Mass extinctions</span>
              <span className="section-note">{biosphere.extinctions.length} recorded</span>
            </div>
            {biosphere.extinctions.slice(-3).reverse().map((e, i) => (
              <div key={i} className="bio-ext-row">
                <span className="bio-ext-cause">{e.cause}</span>
                <span className={`bio-ext-severity${e.severityLoss > 0.5 ? " severe" : ""}`}>
                  −{(e.severityLoss * 100).toFixed(0)}%
                </span>
                <span className="bio-ext-time">{formatGyr(e.timeAgo)} ago</span>
              </div>
            ))}
          </div>
        )}

        <div className="inspector-actions">
          <button
            className="btn primary"
            onClick={onScanCivilization}
            disabled={!CAN_HAVE_CIVILIZATION.has(biosphere.stage)}
            title={CAN_HAVE_CIVILIZATION.has(biosphere.stage) ? undefined : "Biosphere not complex enough for intelligence"}
            style={{ flex: 1 }}
          >
            Check for civilization
          </button>
        </div>
      </div>
    </div>
  );
}
