import type { Biosphere } from "../simulation/biosphere";
import { STAGE_LABEL, STAGE_COLOR } from "../simulation/biosphere";

interface Props {
  biosphere: Biosphere;
  onBack: () => void;
  onClose: () => void;
  onScanCivilization: () => void;
}

function Bar({ value, color }: { value: number; color: string }) {
  return (
    <div className="bio-bar-track">
      <div className="bio-bar-fill" style={{ width: `${value * 100}%`, background: color }} />
    </div>
  );
}

function StatRow({ label, value, color }: { label: string; value: number; color?: string }) {
  return (
    <>
      <span className="meta-label">{label}</span>
      <div className="bio-stat-right">
        <span className="meta-value">{(value * 100).toFixed(0)}%</span>
        <Bar value={value} color={color ?? "rgba(100, 200, 140, 0.6)"} />
      </div>
    </>
  );
}

function fmt(n: number) {
  return n < 0.1 ? `${(n * 1000).toFixed(0)} Myr` : `${n.toFixed(2)} Gyr`;
}

const CAN_HAVE_CIVILIZATION = new Set(["complex", "dominant"]);

export function BiospherePanel({ biosphere, onBack, onClose, onScanCivilization }: Props) {
  const stageColor = STAGE_COLOR[biosphere.stage];

  if (!biosphere.hasLife) {
    return (
      <div className="star-panel">
        <div className="star-panel-header">
          <div className="star-dot" style={{ background: "rgba(80,80,100,0.6)" }} />
          <span className="star-id">BIOSPHERE SCAN</span>
          <button className="panel-close" onClick={onBack}>←</button>
          <button className="panel-close" onClick={onClose}>✕</button>
        </div>
        <div className="star-class" style={{ color: STAGE_COLOR.none }}>
          {STAGE_LABEL.none}
        </div>
        <p className="bio-empty">
          Conditions insufficient for life to emerge on this world.
        </p>
      </div>
    );
  }

  return (
    <div className="star-panel bio-panel">
      <div className="star-panel-header">
        <div className="star-dot bio-pulse" style={{ background: stageColor, boxShadow: `0 0 8px ${stageColor}` }} />
        <div className="star-panel-title">
          <span className="star-id">BIOSPHERE</span>
        </div>
        <button className="panel-close" onClick={onBack}>←</button>
        <button className="panel-close" onClick={onClose}>✕</button>
      </div>

      <div className="star-class" style={{ color: stageColor }}>
        {STAGE_LABEL[biosphere.stage]}
      </div>

      <div className="meta" style={{ marginBottom: 4 }}>
        <span className="meta-label">LIFE AGE</span>
        <span className="meta-value">{fmt(biosphere.ageGyr)}</span>
        <span className="meta-label">EXTINCTIONS</span>
        <span className="meta-value">{biosphere.extinctions.length}</span>
      </div>

      <div className="bio-stats">
        <StatRow label="COMPLEXITY"   value={biosphere.complexity}   color="rgba(100,210,160,0.8)" />
        <StatRow label="DIVERSITY"    value={biosphere.diversity}    color="rgba(80,200,120,0.8)"  />
        <StatRow label="STABILITY"    value={biosphere.stability}    color="rgba(140,180,220,0.8)" />
        <StatRow label="ADAPTABILITY" value={biosphere.adaptability} color="rgba(200,180,80,0.8)"  />
        <StatRow label="BIOMASS"      value={biosphere.biomass}      color="rgba(120,220,100,0.8)" />
      </div>

      {biosphere.extinctions.length > 0 && (
        <div className="bio-extinctions">
          <div className="bio-ext-title">EXTINCTION RECORD</div>
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

      <div className="panel-actions">
        <button
          className="btn primary bookmark-btn"
          onClick={onScanCivilization}
          disabled={!CAN_HAVE_CIVILIZATION.has(biosphere.stage)}
          title={CAN_HAVE_CIVILIZATION.has(biosphere.stage) ? undefined : "Biosphere not complex enough for intelligence"}
        >
          SCAN CIVILIZATION →
        </button>
      </div>
    </div>
  );
}
