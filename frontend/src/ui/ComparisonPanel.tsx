import type { UniverseComparison } from "../simulation/experiment";

interface Props {
  comparison: UniverseComparison;
  onSave: () => void;
  onClose: () => void;
}

export function ComparisonPanel({ comparison: cmp, onSave, onClose }: Props) {
  return (
    <div className="star-panel compare-panel">
      <div className="timeline-header">
        <span className="hud-title" style={{ fontSize: 10, marginBottom: 0 }}>EXPERIMENT RESULTS</span>
        <div style={{ display: "flex", gap: 6 }}>
          <button className="tl-filter-btn" onClick={onSave}>SAVE</button>
          <button className="panel-close" onClick={onClose}>✕</button>
        </div>
      </div>

      <div className="compare-summary">{cmp.summary}</div>

      <div>
        {cmp.rows.map((row) => {
          const better = row.delta > 0;
          const worse  = row.delta < 0;
          return (
            <div key={row.label} className="compare-row">
              <span className="compare-row-label">{row.label.toUpperCase()}</span>
              <span className="compare-val">{row.baseline}{row.unit}</span>
              <span className={`compare-val${better ? " better" : worse ? " worse" : ""}`}>
                {row.experiment}{row.unit}
                {row.delta !== 0 && (
                  <span className="compare-diff"> ({row.delta > 0 ? "+" : ""}{row.delta})</span>
                )}
              </span>
            </div>
          );
        })}
      </div>

      {cmp.surprises.length > 0 && (
        <div>
          <div className="bio-ext-title" style={{ marginBottom: 4 }}>UNEXPECTED OUTCOMES</div>
          {cmp.surprises.map((s, i) => (
            <div key={i} className="surprise-item">{s}</div>
          ))}
        </div>
      )}
    </div>
  );
}
