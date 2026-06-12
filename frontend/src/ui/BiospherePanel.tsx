import type { Biosphere } from "../simulation/biosphere";
import { STAGE_LABEL, STAGE_COLOR } from "../simulation/biosphere";

interface Props {
  biosphere: Biosphere;
  onBack: () => void;
  onClose: () => void;
  onScanCivilization: () => void;
}

function fmt(n: number) {
  return n < 0.1 ? `${(n * 1000).toFixed(0)} Myr` : `${n.toFixed(2)} Gyr`;
}

const CAN_HAVE_CIVILIZATION = new Set(["complex", "dominant"]);

function TraitRow({ label, value, color }: { label: string; value: number; color?: string }) {
  return (
    <>
      <span className="trait-label">{label}</span>
      <div className="trait-bar-track">
        <div className="trait-bar-fill" style={{ width: `${value * 100}%`, background: color ?? "rgba(100, 200, 140, 0.6)" }} />
      </div>
      <span className="trait-value">{(value * 100).toFixed(0)}%</span>
    </>
  );
}

export function BiospherePanel({ biosphere, onBack, onClose, onScanCivilization }: Props) {
  const stageColor = STAGE_COLOR[biosphere.stage];

  if (!biosphere.hasLife) {
    return (
      <div className="inspector" role="dialog" aria-label="Biosphere scan — no life">
        <div className="inspector-header">
          <div className="inspector-dot" style={{ background: "rgba(80,80,100,0.5)" }} />
          <div className="inspector-title-block">
            <span className="inspector-id">Biosphere Scan</span>
            <span className="inspector-subtitle" style={{ color: STAGE_COLOR.none }}>{STAGE_LABEL.none}</span>
          </div>
          <div className="inspector-controls">
            <button className="inspector-btn" onClick={onBack} aria-label="Back to planet">←</button>
            <button className="inspector-btn" onClick={onClose} aria-label="Close">✕</button>
          </div>
        </div>
        <div className="inspector-body">
          <div className="empty-state">
            <div className="empty-state-icon">○</div>
            <div className="empty-state-title">No Life Detected</div>
            <p className="empty-state-body">Conditions insufficient for life to emerge on this world.</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="inspector" role="dialog" aria-label="Biosphere details">
      <div className="inspector-header">
        <div className="inspector-dot bio-pulse" style={{ background: stageColor, boxShadow: `0 0 8px ${stageColor}` }} />
        <div className="inspector-title-block">
          <span className="inspector-id">Biosphere</span>
          <span className="inspector-subtitle" style={{ color: stageColor }}>{STAGE_LABEL[biosphere.stage]}</span>
        </div>
        <div className="inspector-controls">
          <button className="inspector-btn" onClick={onBack} aria-label="Back to planet">←</button>
          <button className="inspector-btn" onClick={onClose} aria-label="Close">✕</button>
        </div>
      </div>

      <div className="inspector-body">
        <div className="data-grid">
          <span className="data-label">Life Age</span>
          <span className="data-value">{fmt(biosphere.ageGyr)}</span>
          <span className="data-label">Extinctions</span>
          <span className="data-value">{biosphere.extinctions.length}</span>
        </div>

        <div className="inspector-section">
          <div className="section-title">Vitals</div>
          <div className="trait-grid">
            <TraitRow label="Complexity"   value={biosphere.complexity}   color="rgba(100,210,160,0.8)" />
            <TraitRow label="Diversity"    value={biosphere.diversity}    color="rgba(80,200,120,0.8)"  />
            <TraitRow label="Stability"    value={biosphere.stability}    color="rgba(140,180,220,0.8)" />
            <TraitRow label="Adaptability" value={biosphere.adaptability} color="rgba(200,180,80,0.8)"  />
            <TraitRow label="Biomass"      value={biosphere.biomass}      color="rgba(120,220,100,0.8)" />
          </div>
        </div>

        {biosphere.extinctions.length > 0 && (
          <div className="inspector-section">
            <div className="section-title">Extinction Record</div>
            {biosphere.extinctions.slice(-3).reverse().map((e, i) => (
              <div key={i} className="bio-ext-row">
                <span className="bio-ext-cause">{e.cause}</span>
                <span className="bio-ext-severity" style={{ color: e.severityLoss > 0.5 ? "rgba(255,120,80,0.9)" : "rgba(220,180,80,0.7)" }}>
                  −{(e.severityLoss * 100).toFixed(0)}%
                </span>
                <span className="bio-ext-time">{fmt(e.timeAgo)} ago</span>
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
            Scan Civilization →
          </button>
        </div>
      </div>
    </div>
  );
}
