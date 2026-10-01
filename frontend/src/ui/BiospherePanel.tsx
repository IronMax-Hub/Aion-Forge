import type { Biosphere } from "../simulation/biosphere";
import { STAGE_LABEL, STAGE_COLOR } from "../simulation/biosphere";
import type { ExtinctionEvent, LifeStage } from "../simulation/biosphere";
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

/** The latest catastrophes that cost life lineages, most recent first. */
function Extinctions({ extinctions }: { extinctions: ExtinctionEvent[] }) {
  if (extinctions.length === 0) return null;
  return (
    <div className="inspector-section">
      <div className="section-head">
        <span className="section-title">Extinctions</span>
        <span className="section-note">{extinctions.length} recorded</span>
      </div>
      {extinctions.slice(0, 3).map((e, i) => (
        <div key={i} className="bio-ext-row">
          <span className="bio-ext-cause">{e.cause}</span>
          <span className={`bio-ext-severity${e.severityLoss > 0.5 ? " severe" : ""}`}>
            −{(e.severityLoss * 100).toFixed(0)}%
          </span>
          <span className="bio-ext-time">{formatGyr(e.timeAgo)} ago</span>
        </div>
      ))}
    </div>
  );
}

export function BiospherePanel({ biosphere, onBack, onClose, onScanCivilization }: Props) {
  const stageColor = STAGE_COLOR[biosphere.stage];

  if (!biosphere.hasLife) {
    const ended = biosphere.extinctAt !== null;
    return (
      <div className="inspector" role="dialog" aria-label={ended ? "Biosphere — life has ended" : "Biosphere — no life"}>
        <div className="inspector-header">
          <div className="inspector-dot" style={{ background: STAGE_COLOR.none }} />
          <div className="inspector-title-block">
            <span className="inspector-id">Biosphere</span>
            <span className="inspector-subtitle">{ended ? `Extinct · ended ${formatGyr(biosphere.extinctAt!)} ago` : STAGE_LABEL.none}</span>
          </div>
          <div className="inspector-controls">
            <button className="inspector-btn" onClick={onBack} aria-label="Back to planet">←</button>
            <button className="inspector-btn" onClick={onClose} aria-label="Close">✕</button>
          </div>
        </div>
        <div className="inspector-body">
          <div className="empty-state">
            <div className="empty-state-icon">○</div>
            <div className="empty-state-title">{ended ? "Life has died out" : "No life detected"}</div>
            <p className="empty-state-body">
              {ended
                ? `Life arose here and lasted ${formatGyr(biosphere.ageGyr)}, then died out ${formatGyr(biosphere.extinctAt!)} ago.`
                : "Conditions on this planet did not allow life to emerge."}
            </p>
          </div>
          <Extinctions extinctions={biosphere.extinctions} />
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

        <Extinctions extinctions={biosphere.extinctions} />

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
