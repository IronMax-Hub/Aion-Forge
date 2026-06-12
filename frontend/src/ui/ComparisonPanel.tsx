import type { UniverseComparison } from "../simulation/experiment";

interface Props {
  comparison: UniverseComparison;
  onSave: () => void;
  onClose: () => void;
}

export function ComparisonPanel({ comparison: cmp, onSave, onClose }: Props) {
  return (
    <div className="compare-panel" role="dialog" aria-label="Experiment comparison results">
      <div className="timeline-header">
        <div className="tl-panel-label">Experiment Results</div>
        <div style={{ display: "flex", gap: 4 }}>
          <button className="tl-filter-btn" onClick={onSave}>Save</button>
          <button className="inspector-btn" onClick={onClose} aria-label="Close">✕</button>
        </div>
      </div>

      <div className="compare-summary">{cmp.summary}</div>

      <div>
        {cmp.rows.map((row) => {
          const better = row.delta > 0;
          const worse  = row.delta < 0;
          return (
            <div key={row.label} className="compare-row">
              <span className="compare-row-label">{row.label}</span>
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
        <div style={{ padding: "var(--sp-3) var(--sp-6) var(--sp-5)" }}>
          <div className="section-title" style={{ marginBottom: "var(--sp-3)" }}>Unexpected Outcomes</div>
          {cmp.surprises.map((s, i) => (
            <div key={i} className="surprise-item">{s}</div>
          ))}
        </div>
      )}
    </div>
  );
}
